import * as path from "node:path";
import {
  parseSourceSymbols,
  type FileASTAnalysis,
  type SymbolDefinition
} from "../../tree-sitter/src/index.ts";
import type { StructuralDiagnostic } from "./micro-tokens.ts";

export interface CandidateFilePatch {
  filePath: string;
  content: string;
}

export class InvariantChecker {
  /**
   * Run structural invariant checks on candidate file patches before disk mutation.
   */
  public checkCandidatePatches(patches: CandidateFilePatch[]): StructuralDiagnostic[] {
    const diagnostics: StructuralDiagnostic[] = [];

    for (const patch of patches) {
      const analysis: FileASTAnalysis = parseSourceSymbols(patch.filePath, patch.content);

      // Check for syntax errors
      for (const err of analysis.syntaxErrors) {
        diagnostics.push({
          rule: "SYNTAX_ERROR",
          file: patch.filePath,
          line: err.line,
          message: err.message
        });
      }

      // Check for basic scope and symbol invariants
      const declaredSymbols = new Set(analysis.symbols.map((s) => s.name));
      const importedSymbols = new Set(analysis.imports.flatMap((i) => i.importedSymbols));

      // Simple heuristic for undefined symbols in references
      for (const sym of analysis.symbols) {
        for (const ref of sym.references) {
          if (!declaredSymbols.has(ref.name) && !importedSymbols.has(ref.name)) {
            diagnostics.push({
              rule: "UNDEFINED_SYMBOL",
              file: patch.filePath,
              line: ref.line,
              symbol: ref.name,
              message: `Symbol '${ref.name}' is referenced but not declared or imported in ${patch.filePath}`
            });
          }
        }
      }

      // Check for self-referential imports
      const patchBaseName = path.basename(patch.filePath, path.extname(patch.filePath));
      for (const imp of analysis.imports) {
        const importBaseName = path.basename(imp.source, path.extname(imp.source));
        if (importBaseName === patchBaseName && imp.source.startsWith(".")) {
          diagnostics.push({
            rule: "CYCLIC_IMPORT",
            file: patch.filePath,
            line: imp.line,
            symbol: imp.source,
            message: `Cyclic self-import detected in ${patch.filePath}`
          });
        }
      }
    }

    return diagnostics;
  }
}
