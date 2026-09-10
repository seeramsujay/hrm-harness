# Architectural Concept: Hybrid Reasoning Agent Harness

## Core Thesis
Current agentic developer harnesses (e.g., Claude Code, OpenCode, Cursor, Windsurf) rely entirely on high-capacity, auto-regressive Large Language Models (LLMs) to perform both **generative work** (code writing, diff generation, natural language responses) and **evaluative work** (AST validation, type checking, path reachability, test suite triage).

Using dense, token-heavy cloud models for deterministic evaluation is inefficient:
1. **High Token Latency:** Reading entire compiler logs, full test suite outputs, and multi-file contexts burns thousands of API tokens per iteration loop.
2. **Context Window Contamination:** Debugging loops accumulate noisy error output, degrading long-context reasoning.
3. **Redundant Computation:** Dense generative models evaluate discrete graph structures non-deterministically, leading to false positives and hallucinated fixes.

**Solution:** A hybrid harness architecture that decouples code synthesis from state verification.

              ┌──────────────────────────────────────────┐
              │            Orchestrator Core             │
              │        (CLI / Agent Session Loop)        │
              └────────────────────┬─────────────────────┘
                                   │
        ┌──────────────────────────┴──────────────────────────┐
        ▼                                                     ▼

┌───────────────────────┐                             ┌───────────────────────┐
│   Generator Engine    │                             │   HRM Validator Loop  │
│  (Cloud LLMs via ACP) │                             │ (Local Recurrent Engine)│
├───────────────────────┤                             ├───────────────────────┤
│ • Code synthesis      │ ──[ Candidate Diff/AST ]──> │ • Symbol verification │
│ • Multi-file diffs    │                             │ • Path reachability   │
│ • Natural Language    │ <───[ Pass / Fail State ]── │ • Deterministic Triage│
└───────────────────────┘                             └───────────────────────┘
│
▼
┌───────────────────────┐
│ Local Test Runner /   │
│ MCP Execution Layer   │
└───────────────────────┘


---

## Architectural Pillars

### 1. High-Capacity Generator Layer
Uses high-capacity auto-regressive models (Anthropic Claude 3.5/3.7, Google Antigravity/Gemini via ACP, or local deep-coder models) exclusively for **generative tasks**: writing code, handling multi-file refactors, and providing conversational explanations.

### 2. Local HRM (Hierarchical Reasoning Model) Validation Loop
Inserts a local, small-footprint Hierarchical Reasoning Model (e.g., non-autoregressive/dual-loop architectures like `HRM-Text-1B`) directly between the generator and the execution layer:
* **AST & Graph Verification:** Parses candidate diffs into Abstract Syntax Trees (ASTs) using Tree-Sitter and checks graph reachability and scope invariants offline.
* **Minimal Test Triage:** Maps mutated symbols to impacted execution subtrees, running only relevant unit tests instead of executing the entire test suite.
* **Micro-Token Feedback:** When validation fails, the HRM returns a concise, 10-token deterministic error code back to the LLM generator rather than feeding back 2,000+ lines of raw compiler stack traces.

### 3. Model Context Protocol (MCP) & IDE Bridge
Communicates natively across local environments, IDEs, and tools:
* **Antigravity / ACP:** Uses OAuth PKCE and Agent Communication Protocol (ACP) interfaces to stream candidates directly from Antigravity and Zed-style IDE setups.
* **DocStuff Indexer:** Maintains local SQLite-backed semantic indices of project documentation, API specs, and codebase symbols to provide precise context snippets via MCP.
