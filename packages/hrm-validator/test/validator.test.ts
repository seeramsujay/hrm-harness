import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import {
  encodeMicroTokenError,
  formatMicroTokenPrompt,
  InvariantChecker,
  TestTriageEngine,
  HRMValidatorDaemon,
  HRMValidatorClient,
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
});
