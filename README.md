# Lazy LaTeX 🦥

> **Bridges the gap between complex mathematical notation and Large Language Model reasoning.**

---

## 🎯 Mission Statement

As artificial intelligence scales, its ability to parse dense, nested, and non-linear data remains heavily dependent on input structure. For researchers, mathematicians, and engineers, feeding raw LaTeX documents, systems of equations, or chaotic matrix blocks into an LLM often results in **contextual blindness** — where the model burns valuable token overhead merely parsing syntax delimiters instead of executing logical reasoning.

**Lazy LaTeX** is a lightweight developer tool that parses raw, messy LaTeX client-side into a token-efficient intermediate representation — building an explicit variable registry and isolating mathematical structure — then hands that off to the Gemini API to finalize into a polished prompt frame, ready for a researcher to use in any LLM workflow.

---

## 🏛️ How It Works

Lazy LaTeX is a single-page web utility with a simple pipeline:

```text
[Raw, Messy LaTeX Input]
           │
           ▼
[Local AST Parser — latex-parser.js]
   ──► Tokenizes and parses into a real syntax tree
   ──► Isolates equations/environments into structured blocks
   ──► Builds an explicit Variable Registry
           │
           ▼
[Gemini API — guided by a specialized system prompt]
   ──► Finalizes the pre-processed IR into a polished prompt frame
           │
           ▼
[Optimized Prompt Output] ──► Ready to paste into any LLM workflow
```

The local pre-processor (`latex-parser.js`) is a dependency-free tokenizer and recursive-descent parser: it builds a real syntax tree of the input (environments, groups, commands, math regions) instead of matching flat regexes, so it correctly handles escaped characters (`\%`, `\$`), arbitrarily nested braces, and math tucked inside non-math environments before the compact IR is ever sent to Gemini.

### Key Pillars (current)
- **Local AST-Based Pre-Processing**: A hand-rolled LaTeX tokenizer/parser isolates math environments and builds the variable registry client-side, before any API call.
- **LLM-Guided Restructuring**: A specialized system prompt directs Gemini to take that pre-processed IR and finalize it into a polished prompt frame.
- **Zero-Overhead Deployment**: Pure client-side JavaScript, no server, no hosting cost.
- **BYOK (Bring Your Own Key)**: Users supply their own Gemini API key, stored only in local browser storage — never sent to any third-party server.

## 🛠️ Tech Stack
- **Front-End**: Vanilla JavaScript, HTML5, CSS3
- **AI Backend**: Gemini API (gemini-2.5-flash)
- **Deployment**: GitHub Pages (fully static, serverless)

## 📄 License
MIT License — free to use, modify, and distribute.

Developed as an independent research and accessibility project, aimed at making computational mathematics more accessible to researchers working with AI tools.









