import * as readline from "node:readline/promises";
import * as fs from "node:fs";
import { getMemoryStats, printMemoryStats } from "./stats.ts";
import { InvariantChecker, TestTriageEngine, HRMModelManager, resolveModelSpec } from "../../hrm-validator/src/index.ts";
import { DocStuffServer } from "../../mcp-docstuff/src/index.ts";

export async function startHRMRepl(): Promise<void> {
  const stats = getMemoryStats();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`
\x1b[1;36m  ██╗  ██╗██████╗ ███╗   ███╗
  ██║  ██║██╔══██╗████╗ ████║
  ███████║██████╔╝██╔████╔██║   \x1b[1;33mHybrid Reasoning Model Harness\x1b[1;36m
  ██╔══██║██╔══██╗██║╚██╔╝██║   \x1b[32m[Ultra-Lightweight • Node 24 Native]\x1b[1;36m
  ██║  ██║██║  ██║██║ ╚═╝ ██║   \x1b[35mRAM: ${stats.rssMB} MB | Heap: ${stats.heapUsedMB} MB\x1b[1;36m
  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝\x1b[0m
`);
  console.log("\x1b[2mType /help for slash commands, or type code/questions directly. Ctrl+C or /quit to exit.\x1b[0m\n");

  const invariantChecker = new InvariantChecker();
  const triageEngine = new TestTriageEngine(process.cwd());
  const modelManager = new HRMModelManager();
  const docServer = new DocStuffServer({ rootDir: "." });

  while (true) {
    try {
      const line = await rl.question("\x1b[1;32mhrm\x1b[0m > ");
      const input = line.trim();
      if (!input) continue;

      if (input === "/quit" || input === "/exit" || input === "exit" || input === "quit") {
        console.log("\n\x1b[2mExiting HRM. Goodbye!\x1b[0m\n");
        break;
      }

      if (input === "/help") {
        console.log("\n\x1b[1mAvailable Commands:\x1b[0m");
        console.log("  \x1b[36m/validate <file>\x1b[0m         Run offline AST & invariant check on a file");
        console.log("  \x1b[36m/triage <file>\x1b[0m           Triage minimal test suite for modified file");
        console.log("  \x1b[36m/models\x1b[0m                  List HuggingFace HRM models and download status");
        console.log("  \x1b[36m/download <model>\x1b[0m        Download HRM weights from HuggingFace");
        console.log("  \x1b[36m/doc <query>\x1b[0m             Search local codebase specs & markdown documentation");
        console.log("  \x1b[36m/stats\x1b[0m                   Display live memory & RAM footprint");
        console.log("  \x1b[36m/clear\x1b[0m                   Clear terminal screen");
        console.log("  \x1b[36m/quit\x1b[0m                    Exit the REPL\n");
        continue;
      }

      if (input === "/clear") {
        console.clear();
        continue;
      }

      if (input === "/stats" || input === "/memory") {
        printMemoryStats();
        continue;
      }

      if (input.startsWith("/validate")) {
        const filePath = input.replace("/validate", "").trim();
        if (!filePath) {
          console.log("\x1b[31mUsage: /validate <path/to/file.ts>\x1b[0m");
          continue;
        }
        if (!fs.existsSync(filePath)) {
          console.log(`\x1b[31mFile not found: ${filePath}\x1b[0m`);
          continue;
        }
        const content = fs.readFileSync(filePath, "utf-8");
        const diags = invariantChecker.checkCandidatePatches([{ filePath, content }]);
        if (diags.length === 0) {
          console.log(`\x1b[32m✔ [HRM:OK] No invariant violations found in ${filePath}\x1b[0m`);
        } else {
          console.log(`\x1b[31m✖ Invariant violations detected (${diags.length}):\x1b[0m`);
          for (const d of diags) {
            console.log(`  \x1b[33m[HRM:ERR:${d.rule} @ ${d.file}:${d.line || 1} sym=${d.symbol || "*"}]\x1b[0m ${d.message}`);
          }
        }
        continue;
      }

      if (input.startsWith("/triage")) {
        const filePath = input.replace("/triage", "").trim();
        if (!filePath) {
          console.log("\x1b[31mUsage: /triage <path/to/file.ts>\x1b[0m");
          continue;
        }
        const plan = triageEngine.triageTests([filePath]);
        console.log(`\x1b[1;34m[Test Triage Plan]\x1b[0m`);
        console.log(`  Confidence: ${plan.confidence}`);
        console.log(`  Command:    ${plan.command}`);
        console.log(`  Tests (${plan.selectedTestFiles.length}): ${plan.selectedTestFiles.join(", ") || "None directly impacted"}`);
        continue;
      }

      if (input === "/models") {
        const statuses = modelManager.listModels();
        console.log("\n\x1b[1mHuggingFace HRM Models:\x1b[0m");
        for (const s of statuses) {
          const badge = s.isDownloaded ? "\x1b[32m[READY]\x1b[0m" : "\x1b[2m[NOT DOWNLOADED]\x1b[0m";
          console.log(`  ${badge} \x1b[1m${s.spec.id}\x1b[0m (${s.spec.parameters}) - ${s.spec.name} [${s.spec.repo}]`);
        }
        console.log("");
        continue;
      }

      if (input.startsWith("/download")) {
        const target = input.replace("/download", "").trim();
        if (!target) {
          console.log("\x1b[31mUsage: /download <model-id-or-hf-repo>\x1b[0m");
          continue;
        }
        const spec = resolveModelSpec(target);
        console.log(`\x1b[36mDownloading ${spec.name} from HuggingFace (${spec.repo})...\x1b[0m`);
        try {
          const res = await modelManager.downloadModel(target, {
            onProgress: (p) => {
              if (p.percent % 25 === 0 || p.percent === 100) {
                console.log(`  [${p.fileIndex}/${p.totalFiles}] ${p.currentFile}: ${p.percent}%`);
              }
            }
          });
          console.log(`\x1b[32m✔ Downloaded to ${res.localPath}\x1b[0m`);
        } catch (err: any) {
          console.log(`\x1b[31mDownload failed: ${err.message}\x1b[0m`);
        }
        continue;
      }

      if (input.startsWith("/doc")) {
        const query = input.replace("/doc", "").trim();
        if (!query) {
          console.log("\x1b[31mUsage: /doc <query>\x1b[0m");
          continue;
        }
        const results = docServer.queryDocs(query, 3);
        console.log(`\n\x1b[1mFound ${results.length} local doc matches:\x1b[0m`);
        for (const r of results) {
          console.log(`  \x1b[36m${r.title}\x1b[0m (\x1b[2m${r.filePath}\x1b[0m)`);
          console.log(`    ${r.content.substring(0, 100).replace(/\n/g, " ")}...`);
        }
        console.log("");
        continue;
      }

      // Default: quick local evaluation & reasoning feedback
      console.log(`\x1b[2m[Evaluating via HRM local engine...]\x1b[0m`);
      const mem = getMemoryStats();
      console.log(`\x1b[32m✔ Ready. HRM active (memory: ${mem.rssMB} MB RSS).\x1b[0m`);
      console.log(`  \x1b[2mTo run invariant check on code, use /validate <file> or pipe candidate diffs via 'hrm validate'.\x1b[0m`);
    } catch (err: any) {
      if (err.name === "AbortError") break;
      console.error("\x1b[31mError:\x1b[0m", err.message);
    }
  }

  rl.close();
}
