export type SupportedLanguage = "typescript" | "javascript" | "python" | "go" | "rust" | "cpp" | "unknown";

export interface SymbolDefinition {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "variable" | "method" | "import" | "export";
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  parentScope?: string;
  references: SymbolReference[];
}

export interface SymbolReference {
  name: string;
  line: number;
  character: number;
  isCall: boolean;
}

export interface FileASTAnalysis {
  filePath: string;
  language: SupportedLanguage;
  symbols: SymbolDefinition[];
  imports: { source: string; importedSymbols: string[]; line: number }[];
  exports: { name: string; isDefault: boolean; line: number }[];
  syntaxErrors: { message: string; line: number; character: number }[];
}

/**
 * Detect language from file path extension.
 */
export function detectLanguage(filePath: string): SupportedLanguage {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "javascript";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".go")) return "go";
  if (lower.endsWith(".rs")) return "rust";
  if (lower.endsWith(".cpp") || lower.endsWith(".cc") || lower.endsWith(".h") || lower.endsWith(".hpp")) return "cpp";
  return "unknown";
}

/**
 * Lightweight deterministic regex/heuristic symbol and import parser
 * for immediate sub-5ms AST extraction across target languages.
 */
export function parseSourceSymbols(filePath: string, source: string): FileASTAnalysis {
  const language = detectLanguage(filePath);
  const lines = source.split("\n");
  const symbols: SymbolDefinition[] = [];
  const imports: FileASTAnalysis["imports"] = [];
  const exports: FileASTAnalysis["exports"] = [];
  const syntaxErrors: FileASTAnalysis["syntaxErrors"] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;

    // TypeScript / JavaScript
    if (language === "typescript" || language === "javascript") {
      // Import extraction: import { a, b } from "foo";
      const importMatch = line.match(/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const rawNames = importMatch[1] || importMatch[2] || "";
        const sourcePkg = importMatch[3] || "";
        const importedSymbols = rawNames
          .split(",")
          .map((s) => s.trim().split(/\s+as\s+/)[0]?.trim())
          .filter((s): s is string => Boolean(s));
        imports.push({ source: sourcePkg, importedSymbols, line: lineNum });
      }

      // Function definition: function foo( or export function foo(
      const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/);
      if (fnMatch && fnMatch[1]) {
        symbols.push({
          name: fnMatch[1],
          kind: "function",
          line: lineNum,
          character: line.indexOf(fnMatch[1]),
          endLine: lineNum,
          endCharacter: line.indexOf(fnMatch[1]) + fnMatch[1].length,
          references: []
        });
      }

      // Const arrow function: const foo = (...) =>
      const arrowMatch = line.match(/(?:export\s+)?const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\(/);
      if (arrowMatch && arrowMatch[1]) {
        symbols.push({
          name: arrowMatch[1],
          kind: "function",
          line: lineNum,
          character: line.indexOf(arrowMatch[1]),
          endLine: lineNum,
          endCharacter: line.indexOf(arrowMatch[1]) + arrowMatch[1].length,
          references: []
        });
      }

      // Class definition: class Foo
      const classMatch = line.match(/(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/);
      if (classMatch && classMatch[1]) {
        symbols.push({
          name: classMatch[1],
          kind: "class",
          line: lineNum,
          character: line.indexOf(classMatch[1]),
          endLine: lineNum,
          endCharacter: line.indexOf(classMatch[1]) + classMatch[1].length,
          references: []
        });
      }

      // Interface / Type
      const typeMatch = line.match(/(?:export\s+)?(?:interface|type)\s+([a-zA-Z0-9_$]+)/);
      if (typeMatch && typeMatch[1]) {
        symbols.push({
          name: typeMatch[1],
          kind: line.includes("interface") ? "interface" : "type",
          line: lineNum,
          character: line.indexOf(typeMatch[1]),
          endLine: lineNum,
          endCharacter: line.indexOf(typeMatch[1]) + typeMatch[1].length,
          references: []
        });
      }

      // Export check
      if (line.includes("export default")) {
        exports.push({ name: "default", isDefault: true, line: lineNum });
      } else if (line.startsWith("export ")) {
        const namedExportMatch = line.match(/export\s+(?:const|function|class|type|interface)\s+([a-zA-Z0-9_$]+)/);
        if (namedExportMatch && namedExportMatch[1]) {
          exports.push({ name: namedExportMatch[1], isDefault: false, line: lineNum });
        }
      }
    }

    // Python
    if (language === "python") {
      const pyDef = line.match(/def\s+([a-zA-Z0-9_]+)\s*\(/);
      if (pyDef && pyDef[1]) {
        symbols.push({
          name: pyDef[1],
          kind: "function",
          line: lineNum,
          character: line.indexOf(pyDef[1]),
          endLine: lineNum,
          endCharacter: line.indexOf(pyDef[1]) + pyDef[1].length,
          references: []
        });
      }
      const pyClass = line.match(/class\s+([a-zA-Z0-9_]+)(?:\(.*\))?:/);
      if (pyClass && pyClass[1]) {
        symbols.push({
          name: pyClass[1],
          kind: "class",
          line: lineNum,
          character: line.indexOf(pyClass[1]),
          endLine: lineNum,
          endCharacter: line.indexOf(pyClass[1]) + pyClass[1].length,
          references: []
        });
      }
      const pyImport = line.match(/(?:from\s+([a-zA-Z0-9_.]+)\s+import\s+([a-zA-Z0-9_, *]+)|import\s+([a-zA-Z0-9_.]+))/);
      if (pyImport) {
        const sourcePkg = pyImport[1] || pyImport[3] || "";
        const syms = pyImport[2] ? pyImport[2].split(",").map((s) => s.trim()) : [sourcePkg];
        imports.push({ source: sourcePkg, importedSymbols: syms, line: lineNum });
      }
    }
  }

  return {
    filePath,
    language,
    symbols,
    imports,
    exports,
    syntaxErrors
  };
}
