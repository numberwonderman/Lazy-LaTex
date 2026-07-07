import { GoogleGenAI } from 'https://esm.run/@google/genai';

// --- DOM Elements ---
const latexInput = document.getElementById('latex-input');
const promptOutput = document.getElementById('prompt-output');
const compileBtn = document.getElementById('compile-btn');
const copyBtn = document.getElementById('copy-btn');

// --- State Management ---
let ai = null;

// --- System Instructions for Prompt Optimization ---
// NOTE: Updated to reflect that input has already been pre-processed
// locally (environments isolated, variable registry built) before
// reaching Gemini. This avoids asking Gemini to redo work the local
// parser already did, preserving the token savings from preprocessLatex().
const SYSTEM_INSTRUCTION = `
You are an expert prompt-engineering engine specializing in advanced mathematics and computer science.

The input you receive has ALREADY been pre-processed by a local parser: math environments
have been isolated and labeled, boilerplate formatting has been stripped, and a variable
registry has already been extracted with local context for each variable.

Your task is to take this pre-processed intermediate representation and finalize it into a
polished, structured AI prompt frame that:
1. Presents the Variable Registry clearly at the top (refine it if needed, but do not
   recompute it from scratch).
2. Presents the isolated equation/environment blocks in a clean, structurally distinct
   Markdown or JSON-like format so an LLM can isolate variables from prose.
3. Appends a logical execution goal appropriate to the content (e.g., 'Analyze the
   stability', 'Compute the sequence parameters', 'Check for structural edge cases').

Ensure the final output is directly ready for a developer or researcher to copy and paste
into an LLM workflow for maximum token efficiency and flawless logical reasoning. Do not
re-parse or re-strip the original raw LaTeX — that step is already complete.
`;

// --- Initialize Gemini API client ---
function initClient() {
    // For local/Codespaces development, you can check a prompt or search parameters
    // To ensure security, we look for a temporary storage token or ask the user
    let apiKey = localStorage.getItem('GEMINI_API_KEY');

    if (!apiKey) {
        apiKey = prompt("To run live API requests, please enter your Google AI Studio API Key (This is saved locally to your browser session and never sent to a server):");
        if (apiKey) {
            localStorage.setItem('GEMINI_API_KEY', apiKey);
        }
    }

    if (apiKey) {
        ai = new GoogleGenAI({ apiKey: apiKey });
        return true;
    }
    return false;
}

// --- Local Pre-processing Parser Engine ---
function preprocessLatex(rawInput) {
    let cleaned = rawInput;

    // 1. Strip comments
    cleaned = cleaned.replace(/%[^\n]*/g, '');

    // 2. Strip non-semantic visual boilerplate (\left, \right, spacing, alignment markers)
    cleaned = cleaned.replace(/\\left|\\right/g, '');
    cleaned = cleaned.replace(/\\quad|\\qquad|\\,|\\;|\\!/g, '');
    cleaned = cleaned.replace(/&/g, ' '); // Strip alignment tabs

    // 3. Environment Isolation & Extraction
    const environments = [];

    // FIX: [p|b]?matrix was a character class bug — it matched a single
    // optional character 'p', '|', or 'b', not the strings "pmatrix"/"bmatrix".
    // It happened to work by luck for p/b matrix but would also wrongly
    // accept "|matrix", and missed vmatrix/Vmatrix/Bmatrix entirely.
    const envRegex = /\\begin\{(align\*?|equation\*?|pmatrix|bmatrix|vmatrix|Vmatrix|Bmatrix|matrix)\}([\s\S]*?)\\end\{\1\}/g;
    let match;

    while ((match = envRegex.exec(cleaned)) !== null) {
        environments.push({
            type: match[1],
            content: match[2].trim().replace(/\s+/g, ' ')
        });
    }

    // Capture display math delimiters ($$ ... $$ and \[ ... \]) if no
    // heavy environments were caught
    if (environments.length === 0) {
        const displayMathRegex = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g;
        while ((match = displayMathRegex.exec(cleaned)) !== null) {
            const content = match[1] !== undefined ? match[1] : match[2];
            environments.push({
                type: 'display-math',
                content: content.trim().replace(/\s+/g, ' ')
            });
        }
    }

    // Fallback further still: inline math ($ ... $), only if nothing else was found
    if (environments.length === 0) {
        const inlineMathRegex = /\$([^$]+)\$/g;
        while ((match = inlineMathRegex.exec(cleaned)) !== null) {
            environments.push({
                type: 'inline-math',
                content: match[1].trim().replace(/\s+/g, ' ')
            });
        }
    }

    // 4. Variable Registry Compilation
    const variableRegistry = {};
    const varRegex = /(\\[a-zA-Z]+(?:_\{[^\s}]+\}|_[a-zA-Z0-9])?|[a-zA-Z](?:_\{[^\s}]+\}|_[a-zA-Z0-9])?)/g;

    environments.forEach(env => {
        let varMatch;
        while ((varMatch = varRegex.exec(env.content)) !== null) {
            const token = varMatch[1];

            // Filter out common operational LaTeX commands that aren't variables
            if (token.startsWith('\\') && /^(sin|cos|tan|log|ln|exp|det|max|min|lim|sum|int|frac|sqrt|partial|to|cdot)$/.test(token.slice(1))) {
                continue;
            }

            if (!variableRegistry[token]) {
                const idx = varMatch.index;
                const start = Math.max(0, idx - 15);
                const end = Math.min(env.content.length, idx + token.length + 15);
                const context = `...${env.content.substring(start, end).trim()}...`;

                variableRegistry[token] = context;
            }
        }
    });

    // 5. Structure the Intermediate Representation for Gemini
    let processedOutput = "=== PRE-PROCESSED LATEX IR ===\n";

    if (environments.length > 0) {
        processedOutput += "\n[Isolated Environments]\n";
        environments.forEach((env, i) => {
            processedOutput += `${i + 1}. (${env.type}): ${env.content}\n`;
        });
    } else {
        processedOutput += `\n[Cleaned Content]: ${cleaned.trim().replace(/\s+/g, ' ')}\n`;
    }

    processedOutput += "\n[Local Variable Registry]\n";
    for (const [v, ctx] of Object.entries(variableRegistry)) {
        processedOutput += `- ${v} (Context: ${ctx})\n`;
    }

    return processedOutput;
}

// --- Trigger Compilation Optimization ---
async function optimizePrompt() {
    const rawInput = latexInput.value.trim();
    if (!rawInput) {
        alert("Please paste some raw LaTeX code first!");
        return;
    }

    if (!ai && !initClient()) {
        alert("A valid Gemini API key is required to compile your prompts.");
        return;
    }

    compileBtn.disabled = true;
    compileBtn.textContent = "Compiling Engine...";
    promptOutput.value = "Running local pre-processor step and sending optimized payload to Gemini...";

    try {
        // Run the client-side local parser first to reduce token weights
        const optimizedPayload = preprocessLatex(rawInput);

        // Utilizing the standard gemini-2.5-flash endpoint for hyper-fast client performance
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: optimizedPayload, // Passing the stripped, token-efficient IR string
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                temperature: 0.2 // Low temperature ensures rigid, deterministic mathematical logic mapping
            }
        });

        promptOutput.value = response.text;
    } catch (error) {
        console.error("API Pipeline Error:", error);
        promptOutput.value = `Execution Failure: Could not optimize string.\n\nDetails: ${error.message}\n\nVerify your API key is active in AI Studio or reset local storage.`;
    } finally {
        compileBtn.disabled = false;
        compileBtn.textContent = "Optimize Prompt";
    }
}

// --- Handle Copy Button Functionality ---
async function copyToClipboard() {
    const textToCopy = promptOutput.value;
    if (!textToCopy || textToCopy.startsWith("Your structured, token-efficient")) {
        return;
    }

    try {
        await navigator.clipboard.writeText(textToCopy);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "Copied! ✓";
        copyBtn.style.backgroundColor = "#16a34a"; // Green flash indicator

        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.backgroundColor = ""; // Reset
        }, 2000);
    } catch (err) {
        console.error("Clipboard copy failed:", err);
    }
}

// --- Event Listeners ---
compileBtn.addEventListener('click', optimizePrompt);
copyBtn.addEventListener('click', copyToClipboard);
