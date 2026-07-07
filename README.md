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
