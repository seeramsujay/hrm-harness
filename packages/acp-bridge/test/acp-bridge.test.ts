import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { ACPBridgeServer, DiffInterceptor } from "../src/index.ts";

describe("ACP Bridge & Candidate Interceptor", () => {
  const testPort = 51188;
  let server: ACPBridgeServer;

  before(async () => {
    server = new ACPBridgeServer({ port: testPort, host: "127.0.0.1" });
    await server.start();
  });

  after(async () => {
    await server.stop();
  });

  test("Health endpoint should respond with healthy status", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/health`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, "healthy");
    assert.strictEqual(json.port, testPort);
  });

  test("OAuth PKCE endpoint should handle authorization callback", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/oauth/callback?code=mock_code_123&state=xyz`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Authentication Successful"));
  });

  test("DiffInterceptor should allow valid edits", async () => {
    const interceptor = new DiffInterceptor();
    const result = await interceptor.interceptProposedEdit({
      patches: [
        {
          filePath: "src/valid.ts",
          content: "export function ok() { return true; }"
        }
      ]
    });

    assert.strictEqual(result.decision, "allow");
  });

  test("Candidate Diff Interceptor HTTP endpoint should process edit requests", async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/v1/intercept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patches: [
          {
            filePath: "src/sample.ts",
            content: "export const score = 100;"
          }
        ]
      })
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.decision, "allow");
  });
});
