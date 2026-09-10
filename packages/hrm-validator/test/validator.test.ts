import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  encodeMicroTokenError,
  formatMicroTokenPrompt,
  InvariantChecker,
  TestTriageEngine,
  HRMValidatorDaemon,
  HRMValidatorClient,
  HRMModelManager,
  getRegisteredModels,
  resolveModelSpec,
  type StructuralDiagnostic
} from "../src/index.ts";

describe("HRM Validator & Micro-Token System", () => {
  const testSocket = `/tmp/hrm_test_${Date.now()}.sock`;
  let daemon: HRMValidatorDaemon;
  let client: HRMValidatorClient;

  before(async () => {
    daemon = new HRMValidatorDaemon(testSocket);
    await daemon.start();
    client = new HRMValidatorClient(testSocket);
  });

  after(async () => {
    await daemon.stop();
  });

  test("encodeMicroTokenError should generate compact deterministic signatures", () => {
    const diag: StructuralDiagnostic = {
      rule: "TYPE_MISMATCH",
      file: "src/calc.ts",
      line: 42,
      symbol: "computeScore",
      expected: "number",
      actual: "string",
      message: "Score must be numeric"
    };

    const encoded = encodeMicroTokenError(diag);
    assert.strictEqual(
      encoded,
      "[HRM:ERR:TYPE_MISMATCH @ src/calc.ts:42 sym=computeScore exp=number got=string]"
    );
  });

  test("formatMicroTokenPrompt should output [HRM:OK] for clean state", () => {
    const prompt = formatMicroTokenPrompt([]);
    assert.strictEqual(prompt, "[HRM:OK]");
  });

  test("formatMicroTokenPrompt should format multiple errors into prompt", () => {
    const diags: StructuralDiagnostic[] = [
      {
        rule: "UNDEFINED_SYMBOL",
        file: "src/auth.ts",
        line: 12,
        symbol: "jwtSecret",
        message: "Unresolved"
      }
    ];

    const prompt = formatMicroTokenPrompt(diags);
    assert.ok(prompt.includes("HRM_FEEDBACK:"));
    assert.ok(prompt.includes("[HRM:ERR:UNDEFINED_SYMBOL @ src/auth.ts:12 sym=jwtSecret]"));
  });

  test("InvariantChecker should detect cyclic self-imports", () => {
    const checker = new InvariantChecker();
    const diags = checker.checkCandidatePatches([
      {
        filePath: "src/helper.ts",
        content: "import { helper } from './helper.ts'; export function helper() {}"
      }
    ]);

    assert.strictEqual(diags.length, 1);
    assert.strictEqual(diags[0]!.rule, "CYCLIC_IMPORT");
  });

  test("TestTriageEngine should triage impacted test files", () => {
    const engine = new TestTriageEngine(process.cwd());
    const triage = engine.triageTests(["src/index.ts"]);
    assert.ok(Array.isArray(triage.selectedTestFiles));
    assert.ok(triage.command.length > 0);
  });

  test("Daemon and Client should handle ping and validation over Unix domain socket", async () => {
    const ping = await client.ping();
    assert.strictEqual(ping.status, "ready");
    assert.ok(typeof ping.uptime === "number");
    assert.ok(ping.activeModel);
    assert.strictEqual(ping.activeModel.id, "hrm-text-1b");

    const validation = await client.validatePatches([
      {
        filePath: "src/valid.ts",
        content: "export function validFn() { return 123; }"
      }
    ]);

    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.diagnostics.length, 0);
    assert.strictEqual(validation.feedback, "[HRM:OK]");
  });

  test("Daemon and Client should list models and update active model", async () => {
    const list = await client.listModels();
    assert.ok(Array.isArray(list.models));
    assert.ok(list.models.length >= 5);
    assert.strictEqual(list.activeModel, "hrm-text-1b");

    const setRes = await client.setModel("hrm-chat");
    assert.strictEqual(setRes.activeModel, "hrm-chat");
    assert.strictEqual(setRes.status.spec.repo, "taykso/HRM-Text-1B-Chat");

    const pingAfter = await client.ping();
    assert.strictEqual(pingAfter.activeModel?.id, "hrm-chat");
  });
});

describe("HuggingFace HRM Model Registry & Downloader", () => {
  const tempCacheDir = path.join(os.tmpdir(), `hrm_cache_${Date.now()}`);
  let mockServer: http.Server;
  let mockPort: number;

  before(async () => {
    fs.mkdirSync(tempCacheDir, { recursive: true });

    // Launch local mock HuggingFace server
    mockServer = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);

      if (url.pathname.startsWith("/api/models/")) {
        // Mock model metadata endpoint
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            sha: "mock_commit_sha_123",
            siblings: [
              { rfilename: "config.json" },
              { rfilename: "tokenizer.json" },
              { rfilename: "model.safetensors" }
            ],
            private: false
          })
        );
        return;
      }

      if (url.pathname.includes("/resolve/")) {
        // Mock file download endpoint
        const content = Buffer.from(
          JSON.stringify({ model: "mock-hrm", timestamp: Date.now() })
        );
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": content.length.toString()
        });
        res.end(content);
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address() as any;
        mockPort = addr.port;
        resolve();
      });
    });
  });

  after(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    }
    if (fs.existsSync(tempCacheDir)) {
      fs.rmSync(tempCacheDir, { recursive: true, force: true });
    }
  });

  test("Model registry should resolve presets and aliases", () => {
    const models = getRegisteredModels();
    assert.ok(models.length >= 5);

    const base = resolveModelSpec("hrm-text-1b");
    assert.strictEqual(base.repo, "sapientinc/HRM-Text-1B");
    assert.strictEqual(base.parameters, "1B");

    const aliasBase = resolveModelSpec("default");
    assert.strictEqual(aliasBase.id, "hrm-text-1b");

    const chat = resolveModelSpec("chat");
    assert.strictEqual(chat.id, "hrm-chat");
    assert.strictEqual(chat.repo, "taykso/HRM-Text-1B-Chat");

    const gguf = resolveModelSpec("gguf");
    assert.strictEqual(gguf.id, "hrm-gguf");

    const tiny = resolveModelSpec("41m");
    assert.strictEqual(tiny.id, "hrm-41m");
  });

  test("Model registry should dynamically resolve custom HuggingFace repos", () => {
    const custom = resolveModelSpec("Qwen/Qwen2.5-Coder-1.5B");
    assert.strictEqual(custom.repo, "Qwen/Qwen2.5-Coder-1.5B");
    assert.strictEqual(custom.name, "Qwen2.5-Coder-1.5B");
    assert.strictEqual(custom.architecture, "custom");

    const customUrl = resolveModelSpec(
      "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B"
    );
    assert.strictEqual(
      customUrl.repo,
      "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B"
    );
  });

  test("HRMModelManager should track download status and download models", async () => {
    const manager = new HRMModelManager(
      tempCacheDir,
      `http://127.0.0.1:${mockPort}`
    );

    // Check initial status is not downloaded
    const initialStatus = manager.getModelStatus("hrm-41m");
    assert.strictEqual(initialStatus.isDownloaded, false);

    // Perform download
    let progressCallCount = 0;
    const downloadStatus = await manager.downloadModel("hrm-41m", {
      endpoint: `http://127.0.0.1:${mockPort}`,
      onProgress: (p) => {
        progressCallCount++;
        assert.ok(p.currentFile.length > 0);
      }
    });

    assert.strictEqual(downloadStatus.isDownloaded, true);
    assert.ok(downloadStatus.totalBytes > 0);
    assert.ok(progressCallCount > 0);
    assert.ok(fs.existsSync(downloadStatus.localPath));
    assert.ok(
      fs.existsSync(path.join(downloadStatus.localPath, ".hrm-manifest.json"))
    );

    // Check listModels includes downloaded status
    const all = manager.listModels();
    const found = all.find((m) => m.spec.id === "hrm-41m");
    assert.ok(found);
    assert.strictEqual(found.isDownloaded, true);

    // Remove model
    const removed = manager.removeModel("hrm-41m");
    assert.strictEqual(removed, true);
    const postRemoveStatus = manager.getModelStatus("hrm-41m");
    assert.strictEqual(postRemoveStatus.isDownloaded, false);
  });
});
