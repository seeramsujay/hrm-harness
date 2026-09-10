import { test, describe } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getMemoryStats } from "../src/stats.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hrmBin = path.resolve(__dirname, "../../../bin/hrm");

describe("HRM Ultra-Lightweight CLI", () => {
  test("getMemoryStats should report lean memory metrics", () => {
    const stats = getMemoryStats();
    assert.ok(stats.rssMB > 0);
    assert.ok(stats.heapUsedMB > 0);
    // Heap usage should be extremely compact (< 30MB)
    assert.ok(stats.heapUsedMB < 30, `Heap used ${stats.heapUsedMB} MB exceeded 30 MB`);
    assert.ok(stats.totalSystemMemoryGB > 0);
  });

  test("hrm --version should report HRM version", () => {
    const out = execSync(`${hrmBin} --version`, { encoding: "utf-8" });
    assert.ok(out.includes("hrm v0.1.0"));
  });

  test("hrm --help should print CLI usage guide", () => {
    const out = execSync(`${hrmBin} --help`, { encoding: "utf-8" });
    assert.ok(out.includes("HRM - Ultra-Lightweight Hybrid Reasoning Model"));
    assert.ok(out.includes("hrm validate"));
    assert.ok(out.includes("hrm models"));
  });

  test("hrm stats should display memory profile under 128MB cap", () => {
    const out = execSync(`${hrmBin} stats`, { encoding: "utf-8" });
    assert.ok(out.includes("HRM Ultra-Lightweight Memory Profile"));
    assert.ok(out.includes("Process RSS"));
    assert.ok(out.includes("128 MB max"));
  });

  test("hrm models list should list HuggingFace presets", () => {
    const out = execSync(`${hrmBin} models list`, { encoding: "utf-8" });
    assert.ok(out.includes("hrm-text-1b"));
    assert.ok(out.includes("hrm-chat"));
    assert.ok(out.includes("sapientinc/HRM-Text-1B"));
  });

  test("hrm validate should pass valid source files", () => {
    const target = path.resolve(__dirname, "../../hrm-validator/src/client.ts");
    const out = execSync(`${hrmBin} validate ${target}`, { encoding: "utf-8" });
    assert.ok(out.includes("[HRM:OK]"));
  });

  test("hrm doc should return semantic documentation matches", () => {
    const out = execSync(`${hrmBin} doc architecture`, { encoding: "utf-8" });
    assert.ok(out.includes("HRM Local Doc Matches"));
  });
});
