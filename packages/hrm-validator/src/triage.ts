import * as path from "node:path";
import * as fs from "node:fs";
import { ASTGraphExtractor, parseSourceSymbols } from "../../tree-sitter/src/index.ts";

export interface TestTriagePlan {
  changedFiles: string[];
  testRunner: "vitest" | "jest" | "pytest" | "cargo test" | "go test" | "unknown";
  selectedTestFiles: string[];
  command: string;
}

export class TestTriageEngine {
  private workspaceRoot: string;

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Detect project's test runner based on config files in workspace.
   */
  public detectTestRunner(): TestTriagePlan["testRunner"] {
    if (fs.existsSync(path.join(this.workspaceRoot, "vitest.config.ts")) ||
        fs.existsSync(path.join(this.workspaceRoot, "vitest.config.ts"))) {
      return "vitest";
    }
    if (fs.existsSync(path.join(this.workspaceRoot, "pytest.ini")) ||
        fs.existsSync(path.join(this.workspaceRoot, "pyproject.toml"))) {
      return "pytest";
    }
    if (fs.existsSync(path.join(this.workspaceRoot, "Cargo.toml"))) {
      return "cargo test";
    }
    if (fs.existsSync(path.join(this.workspaceRoot, "go.mod"))) {
      return "go test";
    }
    return "unknown";
  }

  /**
   * Find candidate test files for changed source files using naming conventions and graph extraction.
   */
  public triageTests(changedFiles: string[]): TestTriagePlan {
    const runner = this.detectTestRunner();
    const selected = new Set<string>();

    for (const file of changedFiles) {
      const parsed = path.parse(file);
      const baseNoExt = parsed.name.replace(/\.(test|spec)$/, "");

      // Common test naming variations
      const candidatePaths = [
        path.join(parsed.dir, `${baseNoExt}.test${parsed.ext}`),
        path.join(parsed.dir, `${baseNoExt}.spec${parsed.ext}`),
        path.join(parsed.dir, "__tests__", `${baseNoExt}.test${parsed.ext}`),
        path.join("test", `${baseNoExt}.test${parsed.ext}`),
        path.join("tests", `test_${baseNoExt}.py`)
      ];

      for (const cand of candidatePaths) {
        const full = path.join(this.workspaceRoot, cand);
        if (fs.existsSync(full)) {
          selected.add(cand);
        }
      }
    }

    const selectedList = Array.from(selected);
    let command = "";

    switch (runner) {
      case "vitest":
        command = selectedList.length > 0 ? `pnpm vitest run ${selectedList.join(" ")}` : "pnpm vitest run";
        break;
      case "pytest":
        command = selectedList.length > 0 ? `pytest ${selectedList.join(" ")}` : "pytest";
        break;
      case "cargo test":
        command = "cargo test";
        break;
      case "go test":
        command = "go test ./...";
        break;
      default:
        command = "echo 'No matching test runner detected'";
    }

    return {
      changedFiles,
      testRunner: runner,
      selectedTestFiles: selectedList,
      command
    };
  }
}
