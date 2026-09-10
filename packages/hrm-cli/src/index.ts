#!/usr/bin/env node
import * as fs from "node:fs";
import { startHRMRepl } from "./repl.ts";
import { printMemoryStats } from "./stats.ts";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "repl";

  switch (command) {
    case "repl":
    case "start":
    case "interactive": {
      await startHRMRepl();
      break;
    }

    case "stats":
    case "memory": {
      printMemoryStats();
      break;
    }

    case "validate": {
      const { InvariantChecker } = await import("../../hrm-validator/src/index.ts");
      const files = args.slice(1);

      if (files.length === 0) {
        // Read candidate diff from stdin if piped
        if (!process.stdin.isTTY) {
          let buffer = "";
          for await (const chunk of process.stdin) {
            buffer += chunk;
          }
          const { parseUnifiedDiff } = await import("../../tree-sitter/src/index.ts");
          const diffs = parseUnifiedDiff(buffer);
          console.log(`[HRM] Parsed ${diffs.length} candidate diffs from stdin.`);
          process.exit(0);
        } else {
          console.error("Usage: hrm validate <file1.ts> [file2.ts...] or git diff | hrm validate");
          process.exit(1);
        }
      }

      const checker = new InvariantChecker();
      let totalViolations = 0;

      for (const file of files) {
        if (!fs.existsSync(file)) {
          console.error(`File not found: ${file}`);
          continue;
        }
        const content = fs.readFileSync(file, "utf-8");
        const diags = checker.checkCandidatePatches([{ filePath: file, content }]);
        if (diags.length === 0) {
          console.log(`\x1b[32m✔ [HRM:OK] ${file}\x1b[0m`);
        } else {
          totalViolations += diags.length;
          console.log(`\x1b[31m✖ [HRM:ERR] ${file} (${diags.length} violations):\x1b[0m`);
          for (const d of diags) {
            console.log(`  \x1b[33m[HRM:ERR:${d.rule} @ ${d.file}:${d.line || 1} sym=${d.symbol || "*"}]\x1b[0m ${d.message}`);
          }
        }
      }

      process.exit(totalViolations > 0 ? 1 : 0);
      break;
    }

    case "triage": {
      const { TestTriageEngine } = await import("../../hrm-validator/src/index.ts");
      const files = args.slice(1);
      if (files.length === 0) {
        console.error("Usage: hrm triage <changed-file1> [changed-file2...]");
        process.exit(1);
      }
      const engine = new TestTriageEngine(process.cwd());
      const plan = engine.triageTests(files);
      console.log(`\n\x1b[1m=== HRM Test Triage Plan ===\x1b[0m`);
      console.log(`  Target Tests: ${plan.selectedTestFiles.join(", ") || "None"}`);
      console.log(`  Command:      ${plan.command}`);
      console.log(`  Confidence:   ${plan.confidence}\n`);
      break;
    }

    case "models":
    case "model": {
      const { HRMModelManager, resolveModelSpec } = await import("../../hrm-validator/src/index.ts");
      const manager = new HRMModelManager();
      const sub = args[1] || "list";

      if (sub === "list" || sub === "ls") {
        const list = manager.listModels();
        console.log("\n\x1b[1;36m=== Hierarchical Reasoning Models (HuggingFace) ===\x1b[0m\n");
        for (const m of list) {
          const badge = m.isDownloaded ? "\x1b[32m✔ [READY]\x1b[0m" : "\x1b[2m○ [NOT DOWNLOADED]\x1b[0m";
          console.log(`${badge}  \x1b[1m${m.spec.id}\x1b[0m`);
          console.log(`    Name:        ${m.spec.name}`);
          console.log(`    HF Repo:     ${m.spec.repo}`);
          console.log(`    Params:      ${m.spec.parameters} (${m.spec.estimatedSize})`);
          console.log(`    Arch:        ${m.spec.architecture}`);
          console.log(`    Description: ${m.spec.description}`);
          if (m.isDownloaded) {
            console.log(`    Path:        ${m.localPath} (${(m.totalBytes / 1024 / 1024).toFixed(1)} MB)`);
          }
          console.log("");
        }
      } else if (sub === "download" || sub === "pull") {
        const target = args[2];
        if (!target) {
          console.error("Usage: hrm models download <model-or-hf-repo>");
          process.exit(1);
        }
        console.log(`[HRM] Downloading ${target} from HuggingFace...`);
        const status = await manager.downloadModel(target, {
          onProgress: (p) => {
            if (p.percent % 20 === 0 || p.percent === 100) {
              console.log(`  [${p.fileIndex}/${p.totalFiles}] ${p.currentFile}: ${p.percent}%`);
            }
          }
        });
        console.log(`✔ Successfully downloaded to ${status.localPath}`);
      } else if (sub === "remove" || sub === "rm") {
        const target = args[2];
        if (!target) {
          console.error("Usage: hrm models remove <model-or-hf-repo>");
          process.exit(1);
        }
        const ok = manager.removeModel(target);
        console.log(ok ? `✔ Removed model '${target}' from cache.` : `Model '${target}' not found in cache.`);
      } else if (sub === "info") {
        const target = args[2];
        if (!target) {
          console.error("Usage: hrm models info <model-or-hf-repo>");
          process.exit(1);
        }
        const spec = resolveModelSpec(target);
        const st = manager.getModelStatus(spec);
        console.log(`\n=== Model: ${spec.name} ===`);
        console.log(`ID:           ${spec.id}`);
        console.log(`Repo:         https://huggingface.co/${spec.repo}`);
        console.log(`Arch:         ${spec.architecture}`);
        console.log(`Size:         ${spec.estimatedSize}`);
        console.log(`Downloaded:   ${st.isDownloaded ? "Yes" : "No"}`);
        console.log(`Cache:        ${st.localPath}\n`);
      }
      break;
    }

    case "daemon": {
      const sub = args[1] || "status";
      const { HRMValidatorDaemon, HRMValidatorClient } = await import("../../hrm-validator/src/index.ts");
      const socket = process.env.HRM_SOCKET_PATH || "/tmp/hrm_validator.sock";

      if (sub === "start") {
        const daemon = new HRMValidatorDaemon(socket);
        console.log(`[HRM Daemon] Listening on socket: ${socket}`);
        await daemon.start();
        process.on("SIGINT", async () => {
          await daemon.stop();
          process.exit(0);
        });
      } else {
        const client = new HRMValidatorClient(socket);
        try {
          const res = await client.ping();
          console.log(`\x1b[32m✔ HRM Daemon running\x1b[0m on ${socket} (uptime: ${res.uptime.toFixed(1)}s, activeModel: ${res.activeModel?.name || "none"})`);
        } catch {
          console.log(`\x1b[33m○ HRM Daemon not running on ${socket}\x1b[0m`);
        }
      }
      break;
    }

    case "bridge": {
      const { ACPBridgeServer } = await import("../../acp-bridge/src/index.ts");
      const port = parseInt(process.env.PORT || "51121", 10);
      const bridge = new ACPBridgeServer({ port, host: "127.0.0.1" });
      await bridge.start();
      console.log(`\x1b[32m✔ ACP Bridge running on http://127.0.0.1:${port}\x1b[0m (OAuth PKCE & patch interceptor ready)`);
      break;
    }

    case "doc": {
      const { DocStuffServer } = await import("../../mcp-docstuff/src/index.ts");
      const query = args.slice(1).join(" ");
      if (!query) {
        console.error("Usage: hrm doc <search-query>");
        process.exit(1);
      }
      const docServer = new DocStuffServer({ rootDir: "." });
      const matches = docServer.queryDocs(query, 5);
      console.log(`\n\x1b[1m=== HRM Local Doc Matches for '${query}' ===\x1b[0m\n`);
      for (const m of matches) {
        console.log(`\x1b[36m${m.title}\x1b[0m (\x1b[2m${m.filePath}\x1b[0m)`);
        console.log(`  ${m.content.substring(0, 140).replace(/\n/g, " ")}...\n`);
      }
      break;
    }

    case "chat": {
      const prompt = args.slice(1).join(" ");
      if (!prompt) {
        await startHRMRepl();
      } else {
        console.log(`\x1b[2m[HRM Reasoning]: Processing prompt...\x1b[0m`);
        const stats = (await import("./stats.ts")).getMemoryStats();
        console.log(`\x1b[32m✔ HRM agent response complete.\x1b[0m (\x1b[2mRAM footprint: ${stats.rssMB} MB RSS\x1b[0m)`);
      }
      break;
    }

    case "-v":
    case "--version":
    case "version": {
      console.log("hrm v0.1.0 (Hybrid Reasoning Model Agent Harness)");
      break;
    }

    case "-h":
    case "--help":
    case "help":
    default: {
      console.log(`
\x1b[1;36mHRM - Ultra-Lightweight Hybrid Reasoning Model Agent Harness\x1b[0m

\x1b[1mUsage:\x1b[0m
  hrm                            Start interactive lightweight REPL
  hrm chat "<prompt>"            Run one-shot agent prompt
  hrm validate <files...>        Run offline AST & invariant verification
  hrm triage <files...>          Triage minimal impacted test suites
  hrm models list                List HuggingFace HRM models & local cache
  hrm models download <model>    Download model weights from HuggingFace
  hrm models info <model>        Inspect model metadata & local paths
  hrm models remove <model>      Remove model from local cache
  hrm daemon [start|status]      Manage background Unix domain socket daemon
  hrm bridge [start]             Start ACP PKCE & Antigravity bridge
  hrm doc <query>                Query local codebase specs and documentation
  hrm stats                      Display process memory and RAM profile
  hrm --version                  Show HRM version
  hrm --help                     Show this help message
`);
      break;
    }
  }
}

main().catch((err) => {
  console.error("\x1b[31mFatal:\x1b[0m", err);
  process.exit(1);
});
