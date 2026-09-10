# Project Engineering Roadmap

## Milestone 1: Core Harness & Agent Protocols
- [ ] **CLI REPL & TUI:** Scaffold terminal interface with interactive streaming and command dispatching.
- [ ] **ACP & OAuth PKCE Integration:** Implement local PKCE authentication server on `localhost:51121` to support Antigravity and Google Cloud agent protocols.
- [ ] **OpenCode / Claude Code Interceptor:** Build wrapper hooks to intercept proposed file diffs before they are written to disk.
- [ ] **Model Provider Bridge:** Add BYOK (Bring Your Own Key) support for Anthropic, OpenAI, and Gemini via standardized schema connectors.

## Milestone 2: Tree-Sitter & Structural Analysis
- [ ] **Tree-Sitter C/Go Bindings:** Integrate multi-language parsing (TypeScript, Python, C++, Rust, Go).
- [ ] **AST Graph Extractor:** Build an offline transformer layer that converts candidate diffs into graph structures (Call Graphs, Symbol Tables, Import Trees).
- [ ] **Git Worktree Isolation:** Isolate execution loops in temporary worktrees (`git worktree add .tmp-harness`) to keep the working tree clean during validation.

## Milestone 3: Local HRM Integration
- [ ] **HRM Daemon Service:** Deploy local HRM runner (ONNX / C++ runtime wrapper) listening over a local IPC Unix domain socket (`/tmp/hrm_validator.sock`).
- [ ] **Invariant Checker:** Implement structural state evaluation routines (unreachable nodes, circular dependencies, type mismatch heuristics).
- [ ] **Minimal Test Triage Engine:** Connect AST diff maps to local test runners (`pytest`, `vitest`, `pnpm test`, `cargo test`) to run only impacted test files.
- [ ] **Micro-Token Error Translator:** Build string encoding layer that converts structural test failures into minimal 10-20 token error prompts for cloud LLM retries.

## Milestone 4: DocStuff & MCP Tool Suite
- [ ] **Local Doc/Code Indexer (`mcp-docstuff`):** Build local SQLite/`vec0` semantic search server for codebase documentation, markdown files, and specs.
- [ ] **Terminal Execution MCP (`mcp-terminal`):** Sandbox command execution (`git`, `pnpm`, `ripgrep`) with stdout/stderr truncation and exit-code reporting.
- [ ] **Antigravity Editor Extension Bridge:** Connect harness orchestration directly to Antigravity / VS Code active buffer sockets.

## Milestone 5: Optimization & Benchmark
- [ ] **Token Reduction Benchmarking:** Compare token consumption between standard Claude Code / OpenCode execution loops vs. Hybrid HRM Harness on SWE-bench / HumanEval tasks.
- [ ] **Latency Profiling:** Optimize HRM inference latency to ensure local AST validation runs in under 20ms.
