import { GoogleGenAI } from 'https://esm.run/@google/genai';

// --- DOM Elements ---
const latexInput = document.getElementById('latex-input');
const promptOutput = document.getElementById('prompt-output');
const compileBtn = document.getElementById('compile-btn');
const copyBtn = document.getElementById('copy-btn');

// --- State Management ---
let ai = null;

// --- System Instructions for Prompt Optimization ---
const SYSTEM_INSTRUCTION = `
You are an expert prompt-engineering engine specializing in advanced mathematics and computer science. 
Your single task is to translate raw, dense LaTeX documents or mathematical sequence equations into optimized, structured AI prompt frames.

When a user provides a raw LaTeX block, output a perfectly compiled prompt template that:
1. Standardizes notation: Strips structural formatting boilerplate (like raw alignment grids) while retaining the absolute mathematical core.
2. Builds a 'Variable Registry': Explicitly defines every variable, subscript sequence index, and local constraint at the very top of the prompt.
3. Isolates Local Context: Formats the core equations into structurally distinct JSON-like or Markdown blocks so an LLM can isolate variables from prose.
4. Appends a logical execution goal (e.g., 'Analyze the stability', 'Compute the sequence parameters', 'Check for structural edge cases').

Ensure the final output is directly ready for a developer or researcher to copy and paste into Gemini for maximum token efficiency and flawless logical reasoning.
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
    promptOutput.value = "Sending token payload to Gemini 3.5 Flash ecosystem...";

    try {
        // Utilizing the standard gemini-2.5-flash endpoint for hyper-fast client performance
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: rawInput,
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
