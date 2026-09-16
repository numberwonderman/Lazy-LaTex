import { GoogleGenAI } from 'https://esm.run/@google/genai';
import { parse, extractRegions, serialize, extractVariables, regionLabel } from './latex-parser.js';

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

The input you receive has ALREADY been pre-processed by a local parser into a token-minimized Intermediate Representation (IR): math environments are isolated, formatting boilerplate has been stripped, and a compact variable registry array has been extracted.

Your task is to take this compact IR payload and finalize it into a polished, structured AI prompt frame that:
1. Presents the isolated equations and variable list cleanly.
2. Appends a logical execution goal appropriate to the content (e.g., 'Analyze the stability', 'Compute the sequence parameters', 'Check for structural edge cases').

Ensure the final output is directly ready for a developer or researcher to copy and paste into an LLM workflow for maximum token efficiency and flawless logical reasoning. Do not re-parse or re-strip the original raw LaTeX — that step is already complete.
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

// --- Local Pre-processing Parser Engine (Token-Optimized) ---
// Parses raw LaTeX into a real tree (see latex-parser.js) rather than
// chaining regexes over flat text, so escapes (\%, \$), nested braces, and
// math tucked inside non-math environments are all handled correctly.
function preprocessLatex(rawInput) {
    // Preamble boilerplate is dropped up front, before tokenizing -- it's
    // never math and never worth preserving even as prose.
    const cleaned = rawInput
        .replace(/\\documentclass[\s\S]*?\\begin\{document\}/, '')
        .replace(/\\end\{document\}/, '');

    const tree = parse(cleaned);
    const { regions, remaining } = extractRegions(tree);

    const variables = new Set();
    const environments = regions.map(node => {
        extractVariables(node).forEach(v => variables.add(v));
        return {
            type: regionLabel(node),
            content: serialize(node.children).trim().replace(/\s+/g, ' ')
        };
    });

    // Build a tight, token-minimized IR payload
    let compactIR = "IR_MODE: MATH_OPTIMIZED\n";

    if (variables.size > 0) {
        compactIR += `VARS: [${Array.from(variables).join(', ')}]\n`;
    }

    if (environments.length > 0) {
        compactIR += "EQS:\n";
        environments.forEach((env, i) => {
            compactIR += `${i+1}:${env.content}\n`;
        });
    }

    const strippedProse = serialize(remaining)
        .replace(/\\[a-zA-Z]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (strippedProse) {
        compactIR += `TXT: ${strippedProse}`;
    }

    return compactIR;
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
