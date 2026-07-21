import { GoogleGenAI } from 'https://esm.run/@google/genai';

// --- DOM Elements ---
const latexInput = document.getElementById('latex-input');
const promptOutput = document.getElementById('prompt-output');
const compileBtn = document.getElementById('compile-btn');
const copyBtn = document.getElementById('copy-btn');
const copyStatus = document.getElementById('copy-status');
const tokenStats = document.getElementById('token-stats');

// --- State Management ---
let ai = null;

// --- System Instructions for Prompt Optimization ---
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

    const envRegex = /\\begin\{(align\*?|equation\*?|pmatrix|bmatrix|vmatrix|Vmatrix|Bmatrix|matrix)\}([\s\S]*?)\\end\{\1\}/g;
    let match;

    while ((match = envRegex.exec(cleaned)) !== null) {
        environments.push({
            type: match[1],
            content: match[2].trim().replace(/\s+/g, ' ')
        });
    }

    // Mask out already-captured environment blocks before scanning for
    // standalone math, so we don't re-match $...$ or $$...$$ that appears
    // *inside* an align/matrix block we already extracted.
    let remaining = cleaned;
    envRegex.lastIndex = 0;
    while ((match = envRegex.exec(cleaned)) !== null) {
        remaining = remaining.replace(match[0], '');
    }

    // ALWAYS scan for standalone display math ($$ ... $$ and \[ ... \]).
    const displayMathRegex = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g;
    while ((match = displayMathRegex.exec(remaining)) !== null) {
        const content = match[1] !== undefined ? match[1] : match[2];
        environments.push({
            type: 'display-math',
            content: content.trim().replace(/\s+/g, ' ')
        });
    }
    remaining = remaining.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, '');

    // NOTE: Inline math ($...$) is intentionally NOT added to `environments`
    // as its own numbered block. A bare inline mention like `$\lambda_1$` or
    // `$i$` in prose is not a structural unit — treating every one as its
    // own "Environment N" caused severe over-fragmentation. Instead, inline
    // math is scanned separately below and folded directly into the Variable Registry.
    const inlineMathRegex = /\$([^$]+)\$/g;
    const inlineMatches = [];
    while ((match = inlineMathRegex.exec(remaining)) !== null) {
        inlineMatches.push(match[1].trim());
    }

    // 4. Variable Registry Compilation
    const variableRegistry = {};
    const varRegex = /(\\[a-zA-Z]+(?:_\{[^\s}]+\}|_[a-zA-Z0-9])?|[a-zA-Z](?:_\{[^\s}]+\}|_[a-zA-Z0-9])?)/g;

    // Helper: scan a block of text for variable-like tokens and register
    // each one (first occurrence only) with surrounding context.
    function registerVariablesFrom(text) {
        let varMatch;
        varRegex.lastIndex = 0;
        while ((varMatch = varRegex.exec(text)) !== null) {
            const token = varMatch[1];

            if (token.startsWith('\\') && /^(sin|cos|tan|log|ln|exp|det|max|min|lim|sum|int|frac|sqrt|partial|to|cdot)$/.test(token.slice(1))) {
                continue;
            }

            if (!variableRegistry[token]) {
                const idx = varMatch.index;
                const start = Math.max(0, idx - 15);
                const end = Math.min(text.length, idx + token.length + 15);
                const context = `...${text.substring(start, end).trim()}...`;

                variableRegistry[token] = context;
            }
        }
    }

    environments.forEach(env => registerVariablesFrom(env.content));
    inlineMatches.forEach(expr => registerVariablesFrom(expr));

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
    
    if (tokenStats) {
        tokenStats.style.display = "block";
        tokenStats.textContent = "📊 Calculating token reduction benchmarks...";
    }
    
    if (copyStatus) {
        copyStatus.textContent = "Compiling your optimized prompt, please wait.";
    }

    try {
        const optimizedPayload = preprocessLatex(rawInput);

        // --- Step 1. Get Token Counts for Benchmarking ---
        const rawTokenResp = await ai.models.countTokens({
            model: 'gemini-2.5-flash',
            contents: rawInput,
        });

        const optimizedTokenResp = await ai.models.countTokens({
            model: 'gemini-2.5-flash',
            contents: optimizedPayload,
        });

        const rawTokens = rawTokenResp.totalTokens;
        const optTokens = optimizedTokenResp.totalTokens;
        const diff = rawTokens - optTokens;
        const percentSaved = rawTokens > 0 ? ((diff / rawTokens) * 100).toFixed(1) : 0;

        if (tokenStats) {
            tokenStats.innerHTML = `
                📊 <strong>Benchmark Stats:</strong> Raw Input: <code>${rawTokens}</code> tokens | 
                Lazy LaTeX IR: <code>${optTokens}</code> tokens | 
                <strong>Saved: ${diff} tokens (${percentSaved}%)</strong>
            `;
        }

        // --- Step 2. Generate Optimized Prompt from Gemini ---
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: optimizedPayload,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                temperature: 0.2
            }
        });

        promptOutput.value = response.text;
        
        if (copyStatus) {
            copyStatus.textContent = "Optimized prompt ready.";
        }
    } catch (error) {
        console.error("API Pipeline Error:", error);
        promptOutput.value = `Execution Failure: Could not optimize string.\n\nDetails: ${error.message}\n\nVerify your API key is active in AI Studio or reset local storage.`;
        if (tokenStats) {
            tokenStats.style.display = "none";
        }
        if (copyStatus) {
            copyStatus.textContent = "Something went wrong while optimizing your prompt. See the output panel for details.";
        }
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
        copyBtn.style.backgroundColor = "#16a34a";
        if (copyStatus) {
            copyStatus.textContent = "Prompt copied to clipboard.";
        }

        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.backgroundColor = "";
        }, 2000);
    } catch (err) {
        console.error("Clipboard copy failed:", err);
        if (copyStatus) {
            copyStatus.textContent = "Copy failed. Please select and copy the text manually.";
        }
    }
}

// --- Event Listeners ---
compileBtn.addEventListener('click', optimizePrompt);
copyBtn.addEventListener('click', copyToClipboard);
