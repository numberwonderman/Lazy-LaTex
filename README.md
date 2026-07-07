# Lazy LaTeX 🦥

> **Bridges the gap between complex mathematical notation and Large Language Model reasoning.**

---

## 🎯 Mission Statement

As artificial intelligence scales, its ability to parse dense, nested, and non-linear data remains heavily dependent on input structure. For researchers, mathematicians, and engineers, feeding raw LaTeX documents, systems of equations, or chaotic matrix blocks into an LLM often results in **contextual blindness** — where the model burns valuable token overhead merely parsing syntax delimiters instead of executing logical reasoning.

**Lazy LaTeX** is a lightweight developer tool that uses the Gemini API to restructure raw, messy LaTeX into clean, token-efficient prompt frames — building an explicit variable registry and isolating mathematical structure before a researcher hands the result to an LLM for further work.

---

## 🏛️ How It Works

Lazy LaTeX is a single-page web utility with a simple pipeline:

```text
[Raw, Messy LaTeX Input]
           │
           ▼
[Gemini API — guided by a specialized system prompt]
   ──► Standardizes notation
   ──► Builds an explicit Variable Registry
   ──► Isolates equations into structured, LLM-readable blocks
           │
           ▼
[Optimized Prompt Output] ──► Ready to paste into any LLM workflow

Note: the current version relies on Gemini itself (via a carefully engineered system instruction) to perform the restructuring — it does not yet include a local, client-side LaTeX parser. A planned next phase is to add real syntactic pre-processing (regex/AST-based extraction of environments and variables) so that boilerplate stripping happens before the API call, further reducing token cost and API dependency.
Key Pillars (current)
LLM-Guided Restructuring: A specialized system prompt directs Gemini to standardize notation, build a variable registry, and isolate equation blocks.
Zero-Overhead Deployment: Pure client-side JavaScript, no server, no hosting cost.
BYOK (Bring Your Own Key): Users supply their own Gemini API key, stored only in local browser storage — never sent to any third-party server.
🛠️ Tech Stack
Front-End: Vanilla JavaScript, HTML5, CSS3
AI Backend: Gemini API (gemini-2.5-flash)
Deployment: GitHub Pages (fully static, serverless)
📄 License
MIT License — free to use, modify, and distribute.
Developed as an independent research and accessibility project, aimed at making computational mathematics more accessible to researchers working with AI tools.









