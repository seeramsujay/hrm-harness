import { test, describe } from "node:test";
import assert from "node:assert";
import {
  detectLanguage,
  parseSourceSymbols,
  ASTGraphExtractor,
  parseUnifiedDiff,
  correlateDiffWithSymbols
} from "../src/index.ts";

describe("Tree-Sitter & Structural Analysis", () => {
  test("detectLanguage should detect file types accurately", () => {
    assert.strictEqual(detectLanguage("src/index.ts"), "typescript");
    assert.strictEqual(detectLanguage("app/main.py"), "python");
    assert.strictEqual(detectLanguage("pkg/server.go"), "go");
    assert.strictEqual(detectLanguage("src/lib.rs"), "rust");
    assert.strictEqual(detectLanguage("include/native.hpp"), "cpp");
    assert.strictEqual(detectLanguage("styles.css"), "unknown");
  });

  test("parseSourceSymbols should extract symbols, imports, and exports for TypeScript", () => {
    const tsCode = `
import { Config, helper } from "./config.ts";
import defaultLogger from "logger";

export interface User {
  id: string;
}

export class UserService {
  getUser() {}
}

export function fetchUser(id: string) {
  return id;
}

export const calculateScore = (score: number) => {
  return score * 2;
};

export default UserService;
    `;

    const analysis = parseSourceSymbols("src/user.ts", tsCode);
    assert.strictEqual(analysis.language, "typescript");
    assert.strictEqual(analysis.filePath, "src/user.ts");

    const symbolNames = analysis.symbols.map((s) => s.name);
    assert.ok(symbolNames.includes("User"), "Should include interface User");
    assert.ok(symbolNames.includes("UserService"), "Should include class UserService");
    assert.ok(symbolNames.includes("fetchUser"), "Should include function fetchUser");
    assert.ok(symbolNames.includes("calculateScore"), "Should include arrow function calculateScore");

    assert.strictEqual(analysis.imports.length, 2);
    assert.ok(analysis.imports[0]?.importedSymbols.includes("Config"));
    assert.ok(analysis.imports[0]?.importedSymbols.includes("helper"));
  });

  test("parseSourceSymbols should parse Python definitions", () => {
    const pyCode = `
from typing import List, Optional
import os

class AgentEngine:
    pass

def execute_step(step_name: str):
    return True
    `;

    const analysis = parseSourceSymbols("agent.py", pyCode);
    assert.strictEqual(analysis.language, "python");
    const names = analysis.symbols.map((s) => s.name);
    assert.ok(names.includes("AgentEngine"));
    assert.ok(names.includes("execute_step"));
    assert.strictEqual(analysis.imports.length, 2);
  });

  test("ASTGraphExtractor should construct dependencies and propagate impacted files", () => {
    const extractor = new ASTGraphExtractor();

    extractor.registerFile(
      parseSourceSymbols("src/db.ts", "export function connect() {}")
    );
    extractor.registerFile(
      parseSourceSymbols("src/service.ts", "import { connect } from './db.ts'; export function handle() {}")
    );
    extractor.registerFile(
      parseSourceSymbols("src/controller.ts", "import { handle } from './service.ts'; export function route() {}")
    );

    const graph = extractor.buildGraph();
    assert.ok(graph.nodes.has("src/db.ts:connect"));
    assert.ok(graph.nodes.has("src/service.ts:handle"));

    const impacted = extractor.findImpactedFiles("src/db.ts", graph);
    assert.ok(impacted.has("src/db.ts"));
    assert.ok(impacted.has("src/service.ts"));
    assert.ok(impacted.has("src/controller.ts"));
  });

  test("parseUnifiedDiff and correlateDiffWithSymbols should map diff lines to AST symbols", () => {
    const diff = `--- a/src/math.ts
+++ b/src/math.ts
@@ -5,2 +5,3 @@
 export function multiply(a: number, b: number) {
+  console.log("multiplying");
   return a * b;
 }
`;

    const chunksMap = parseUnifiedDiff(diff);
    assert.ok(chunksMap.has("src/math.ts"));
    const chunks = chunksMap.get("src/math.ts")!;
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0]!.addedLines.length, 1);

    const fullContent = `
export function add(a: number, b: number) {
  return a + b;
}

export function multiply(a: number, b: number) {
  console.log("multiplying");
  return a * b;
}
`;

    const correlated = correlateDiffWithSymbols("src/math.ts", fullContent, chunks);
    assert.strictEqual(correlated.mutatedSymbols.length, 1);
    assert.strictEqual(correlated.mutatedSymbols[0]!.name, "multiply");
  });
});
