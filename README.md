# Hybrid HRM Agent Harness

> **Next-Generation Developer Harness Pairing Cloud LLM Generators with Local Hierarchical Reasoning Models (HRMs) for Low-Cost, Deterministic Code Validation.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v24+-green.svg)](https://nodejs.org/)
[![Package Manager: pnpm](https://img.shields.io/badge/pnpm-v11+-orange.svg)](https://pnpm.io/)

---

## 🚀 Overview

Modern agentic coding harnesses (Claude Code, OpenCode, Cursor, Windsurf) waste up to **80% of API tokens** re-evaluating raw compiler logs, stack traces, and entire test suites using expensive cloud LLMs.

The **Hybrid HRM Agent Harness** solves this by cleanly decoupling **code synthesis** from **state verification**:

* **Generative Engine (Cloud):** High-capacity models (Claude 3.7, Antigravity, Gemini, OpenAI) synthesize code, manage multi-file refactors, and provide conversational context.
* **Evaluative Engine (Local):** A fast, local **Hierarchical Reasoning Model (HRM)** daemon evaluates Abstract Syntax Trees (ASTs), verifies graph reachability, and triages minimal test suites offline.

When validation fails, the HRM returns a deterministic, **10-token error signature** (e.g. `[HRM:ERR:TYPE_MISMATCH @ src/auth.ts:42 sym=verify exp=string got=number]`) instead of streaming back thousands of lines of compiler logs, preventing context window contamination and cutting token costs dramatically.

---

## 🏛️ Architecture

```
              ┌──────────────────────────────────────────┐
              │            Orchestrator Core             │
              │        (CLI / Agent Session Loop)        │
              └────────────────────┬─────────────────────┘
                                   │
        ┌──────────────────────────┴──────────────────────────┐
        ▼                                                     ▼
┌───────────────────────┐                             ┌───────────────────────┐
│   Generator Engine    │                             │   HRM Validator Loop  │
│  (Cloud LLMs via ACP) │                             │ (Local Recurrent Daemon)│
├───────────────────────┤                             ├───────────────────────┤
│ • Code synthesis      │ ──[ Candidate Diff/AST ]──> │ • Symbol verification │
│ • Multi-file diffs    │                             │ • Invariant checks    │
│ • Natural Language    │ <───[ Pass / Fail State ]── │ • Deterministic Triage│
└───────────────────────┘                             └───────────────────────┘
                                                                  │
                                                                  ▼
                                                      ┌───────────────────────┐
                                                      │ Local Test Runner /   │
                                                      │ MCP Execution Layer   │
                                                      └───────────────────────┘
```

---

## 📦 Packages

| Package | Path | Description |
|---|---|---|
| **`@hrm-harness/validator`** | [`packages/hrm-validator`](file:///home/suzaykid/Projects/hrm-harness/packages/hrm-validator) | Local HRM daemon (`/tmp/hrm_validator.sock`), AST invariant checker, test triage engine, and micro-token failure encoder. |
| **`@hrm-harness/tree-sitter`** | [`packages/tree-sitter`](file:///home/suzaykid/Projects/hrm-harness/packages/tree-sitter) | High-speed AST parsing, symbol extraction, call graph construction, and unified diff correlation. |
| **`@hrm-harness/acp-bridge`** | [`packages/acp-bridge`](file:///home/suzaykid/Projects/hrm-harness/packages/acp-bridge) | Agent Communication Protocol (ACP) server with OAuth PKCE (`localhost:51121`) and candidate patch interceptor. |
| **`@hrm-harness/mcp-docstuff`** | [`packages/mcp-docstuff`](file:///home/suzaykid/Projects/hrm-harness/packages/mcp-docstuff) | Model Context Protocol (MCP) server for local codebase documentation and symbol lookup. |
| **`opencode` / `@opencode-ai/cli`** | [`packages/opencode`](file:///home/suzaykid/Projects/hrm-harness/packages/opencode) | Core terminal UI, agent session loop, LLM provider connectors, and tool orchestration. |

---

## ⚡ Quickstart

### Prerequisites
* **Node.js:** v22+ (tested on v24.11)
* **pnpm:** v10+ (tested on v11.25)

### Running the Harness
```bash
# Start the local HRM Validator Daemon
pnpm dev:validator

# Start the ACP & Antigravity PKCE Bridge
pnpm dev:acp

# Start the interactive CLI Harness
pnpm dev
```

---

## 📖 Key Documentation
* **[Architectural Concept (IDEA.md)](file:///home/suzaykid/Projects/hrm-harness/IDEA.md):** The core thesis, latency analysis, and theoretical model behind hybrid reasoning harnesses.
* **[Engineering Roadmap (ROADMAP.md)](file:///home/suzaykid/Projects/hrm-harness/ROADMAP.md):** 5-phase execution plan covering AST bindings, local daemon sockets, test triage, and SWE-bench token reduction evaluations.
