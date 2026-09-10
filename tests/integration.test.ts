import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { HRMValidatorDaemon } from "../packages/hrm-validator/src/index.ts";
import { ACPBridgeServer } from "../packages/acp-bridge/src/index.ts";
import { DocStuffServer } from "../packages/mcp-docstuff/src/index.ts";

describe("End-to-End Hybrid HRM Harness Integration", () => {
  const sockPath = "/tmp/hrm_validator_e2e.sock";
  const port = 51177;
  let daemon: HRMValidatorDaemon;
  let bridge: ACPBridgeServer;

  before(async () => {
    daemon = new HRMValidatorDaemon(sockPath);
    await daemon.start();
    process.env.HRM_SOCKET_PATH = sockPath;
    bridge = new ACPBridgeServer({ port, host: "127.0.0.1" });
    await bridge.start();
  });

  after(async () => {
    await bridge.stop();
    await daemon.stop();
  });

  test("Bridge health check returns status healthy", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const json = await res.json();
    assert.strictEqual(json.status, "healthy");
    assert.strictEqual(json.bridge, "acp-antigravity");
  });

  test("Valid patch is allowed by HRM loop", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/intercept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patches: [
          {
            filePath: "src/calculator.ts",
            content: "export function add(a: number, b: number) { return a + b; }"
          }
        ]
      })
    });
    const json = await res.json();
    assert.strictEqual(json.decision, "allow");
  });

  test("Invalid cyclic patch is intercepted and rejected with micro-tokens", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/intercept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patches: [
          {
            filePath: "src/calculator.ts",
            content: "import { add } from './calculator.ts'; export function add() {}"
          }
        ]
      })
    });
    const json = await res.json();
    assert.strictEqual(json.decision, "reject");
    assert.ok(json.feedback.includes("[HRM:ERR:CYCLIC_IMPORT"));
  });

  test("DocStuff queries local specs accurately", () => {
    const docServer = new DocStuffServer({ rootDir: "." });
    const docs = docServer.queryDocs("architecture", 1);
    assert.ok(docs.length > 0);
  });
});
