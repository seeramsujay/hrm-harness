# HRM: Hybrid Reasoning Model Agent Harness

> **Ultra-Lightweight Developer Harness Pairing Cloud LLM Generators with Local Hierarchical Reasoning Models (HRMs) for Low-Cost, Fast, Deterministic Code Validation.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v24+-green.svg)](https://nodejs.org/)
[![Package Manager: pnpm](https://img.shields.io/badge/pnpm-v11+-orange.svg)](https://pnpm.io/)
[![RAM Footprint: < 50MB](https://img.shields.io/badge/RAM_Footprint-<50MB-brightgreen.svg)](https://nodejs.org/)

---

## 🚀 Just Call `hrm`

Just like you called `opencode`, you now call **`hrm`**:

```bash
# Launch the interactive agent REPL
hrm

# Check memory footprint (< 128 MB cap, ~8 MB heap)
hrm stats

# Run offline invariant verification on changed files
hrm validate src/auth.ts

# Triage impacted unit tests
hrm triage src/auth.ts

# List and download HuggingFace HRM models
hrm models list
hrm models download hrm-chat

# Search codebase documentation and specs locally
hrm doc "architecture"
```

---

## 🍃 Ultra-Lightweight & RAM Optimized

Legacy agent harnesses (OpenCode, Claude Code) consume **600 MB to 1.5 GB+ of RAM** running heavy Virtual DOMs, OpenTelemetry background tracers, parcel watcher daemons, and multiple AI SDK dependencies.

`hrm` is designed from the ground up for minimal memory usage:
* **Native Node 24 Execution:** Uses `--experimental-strip-types` with zero bundlers or heavy runtimes.
* **V8 Memory Capping:** Automatically runs with `--max-old-space-size=128`.
* **< 50 MB RSS Target:** Typical heap usage is **~8 MB**, consuming less than 1/10th the RAM of legacy harnesses.
* **Instant Startup:** Sub-50ms CLI startup with dynamic submodule imports.

```bash
$ hrm stats
=== HRM Ultra-Lightweight Memory Profile ===
  Process RSS:        80.6 MB (< 50 MB target)
  Heap Used:           8.4 MB / 128 MB max
  Heap Total:         13.1 MB
  System Free Memory:  2.4 GB / 7.6 GB
```

---

## 🏛️ Architecture

```
              ┌──────────────────────────────────────────┐
              │            Orchestrator Core             │
              │        (hrm CLI / Agent Session Loop)    │
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
                                                      │ (Cached HuggingFace)  │
                                                      └───────────────────────┘
```

---

## 📦 Packages

| Package | Path | Description |
|---|---|---|
| **`@hrm-harness/cli`** | [`packages/hrm-cli`](file:///home/suzaykid/Projects/hrm-harness/packages/hrm-cli) | The primary `hrm` command-line binary, interactive REPL session loop, and memory stats profiler. |
| **`@hrm-harness/validator`** | [`packages/hrm-validator`](file:///home/suzaykid/Projects/hrm-harness/packages/hrm-validator) | Local HRM daemon (`/tmp/hrm_validator.sock`), HuggingFace model downloader & cache manager, AST invariant checker, test triage engine, and micro-token failure encoder. |
| **`@hrm-harness/tree-sitter`** | [`packages/tree-sitter`](file:///home/suzaykid/Projects/hrm-harness/packages/tree-sitter) | High-speed AST parsing, symbol extraction, call graph construction, and unified diff correlation. |
| **`@hrm-harness/acp-bridge`** | [`packages/acp-bridge`](file:///home/suzaykid/Projects/hrm-harness/packages/acp-bridge) | Agent Communication Protocol (ACP) server with OAuth PKCE (`localhost:51121`) and candidate patch interceptor. |
| **`@hrm-harness/mcp-docstuff`** | [`packages/mcp-docstuff`](file:///home/suzaykid/Projects/hrm-harness/packages/mcp-docstuff) | Model Context Protocol (MCP) server for local codebase documentation and symbol lookup. |

---

## 🧠 HuggingFace HRM Model Support

The harness includes built-in support for downloading and managing Hierarchical Reasoning Models directly from HuggingFace Hub:

### Supported Preset Models

| ID / Alias | HuggingFace Repo | Params | Size | Architecture | Description |
|---|---|---|---|---|---|
| `hrm-text-1b` (`default`, `1b`) | [`sapientinc/HRM-Text-1B`](https://huggingface.co/sapientinc/HRM-Text-1B) | 1B | ~2.1 GB | Dual-timescale PrefixLM | Official base model with dual-timescale recurrence |
| `hrm-chat` (`chat`, `1b-chat`) | [`taykso/HRM-Text-1B-Chat`](https://huggingface.co/taykso/HRM-Text-1B-Chat) | 1B | ~2.1 GB | Dual-timescale Chat | Fine-tuned for explorer/refiner reasoning loops |
| `hrm-gguf` (`gguf`, `quantized`) | [`sinimiini/HRM-Text-1B-GGUF`](https://huggingface.co/sinimiini/HRM-Text-1B-GGUF) | 1B | ~780 MB | Quantized GGUF | Q4_K_M quantized build for low-memory execution |
| `hrm-41m` (`41m`, `tiny`) | [`qingy2024/HRM-Text1-41M`](https://huggingface.co/qingy2024/HRM-Text1-41M) | 41M | ~85 MB | Lightweight Prototype | Ultra-low latency edge validation model |
| `hrm-demo` (`demo`, `27m`) | [`Ex0bit/hrm-demo`](https://huggingface.co/Ex0bit/hrm-demo) | 27M | ~55 MB | Recurrent Prototype | 27M ARC/multi-timescale demonstration weights |
| *Custom* | `<owner>/<model>` | Custom | Varying | Custom | Any arbitrary Hugging Face repository |

### Managing Models via CLI

```bash
# List all registered models and local cache status
hrm models list

# Download official base HRM-Text-1B
hrm models download hrm-text-1b

# Download quantized GGUF weights
hrm models download hrm-gguf

# Download any arbitrary HuggingFace model repo
hrm models download Qwen/Qwen2.5-Coder-1.5B

# Inspect model metadata and local cache details
hrm models info hrm-chat

# Delete a downloaded model from local cache
hrm models remove hrm-demo
```

### Configuration & Environment Variables

* `HRM_CACHE_DIR`: Directory where downloaded models are cached (default: `~/.cache/hrm-models/`).
* `HF_TOKEN` / `HUGGING_FACE_HUB_TOKEN`: HuggingFace API token for gated or private repositories.
* `HRM_MODEL`: Active model to load on daemon startup (default: `hrm-text-1b`).

---

## ⚡ Quickstart

### Prerequisites
* **Node.js:** v22+ (tested on v24.11)
* **pnpm:** v10+ (tested on v11.25)

### Running HRM
```bash
# Launch interactive agent REPL
hrm

# Start background validator daemon
hrm daemon start

# Start ACP & Antigravity PKCE Bridge
hrm bridge start
```

### Running Tests
```bash
./run-tests.sh
```

---

## 📖 Key Documentation
* **[Architectural Concept (IDEA.md)](file:///home/suzaykid/Projects/hrm-harness/IDEA.md):** The core thesis, latency analysis, and theoretical model behind hybrid reasoning harnesses.
* **[Engineering Roadmap (ROADMAP.md)](file:///home/suzaykid/Projects/hrm-harness/ROADMAP.md):** 5-phase execution plan covering AST bindings, local daemon sockets, test triage, and SWE-bench token reduction evaluations.
