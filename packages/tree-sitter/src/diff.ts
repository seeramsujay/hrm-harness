import { parseSourceSymbols, type FileASTAnalysis, type SymbolDefinition } from "./parser.ts";

export interface ChangedChunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  addedLines: string[];
  removedLines: string[];
}

export interface PatchFileDiff {
  filePath: string;
  chunks: ChangedChunk[];
  mutatedSymbols: SymbolDefinition[];
}

/**
 * Parse a unified diff patch and extract affected line ranges.
 */
export function parseUnifiedDiff(diffText: string): Map<string, ChangedChunk[]> {
  const result = new Map<string, ChangedChunk[]>();
  const lines = diffText.split("\n");
  let currentFile: string | null = null;
  let currentChunks: ChangedChunk[] = [];

  for (const line of lines) {
    if (line.startsWith("+++ b/")) {
      if (currentFile && currentChunks.length > 0) {
        result.set(currentFile, currentChunks);
      }
      currentFile = line.substring(6).trim();
      currentChunks = [];
    } else if (line.startsWith("@@ ")) {
      // @@ -12,4 +12,6 @@
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        currentChunks.push({
          oldStart: parseInt(match[1]!, 10),
          oldLines: match[2] ? parseInt(match[2], 10) : 1,
          newStart: parseInt(match[3]!, 10),
          newLines: match[4] ? parseInt(match[4], 10) : 1,
          addedLines: [],
          removedLines: []
        });
      }
    } else if (currentChunks.length > 0) {
      const current = currentChunks[currentChunks.length - 1]!;
      if (line.startsWith("+") && !line.startsWith("+++")) {
        current.addedLines.push(line.substring(1));
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        current.removedLines.push(line.substring(1));
      }
    }
  }

  if (currentFile && currentChunks.length > 0) {
    result.set(currentFile, currentChunks);
  }

  return result;
}

/**
 * Correlate diff chunks with AST symbols to pinpoint exactly which functions/classes were altered.
 */
export function correlateDiffWithSymbols(
  filePath: string,
  newContent: string,
  chunks: ChangedChunk[]
): PatchFileDiff {
  const analysis: FileASTAnalysis = parseSourceSymbols(filePath, newContent);
  const mutatedSymbols: SymbolDefinition[] = [];

  for (const chunk of chunks) {
    const chunkStart = chunk.newStart;
    const chunkEnd = chunk.newStart + chunk.newLines;

    for (const sym of analysis.symbols) {
      if (
        (sym.line >= chunkStart && sym.line <= chunkEnd) ||
        (sym.endLine >= chunkStart && sym.endLine <= chunkEnd) ||
        (sym.line <= chunkStart && sym.endLine >= chunkEnd)
      ) {
        if (!mutatedSymbols.some((s) => s.name === sym.name && s.line === sym.line)) {
          mutatedSymbols.push(sym);
        }
      }
    }
  }

  return {
    filePath,
    chunks,
    mutatedSymbols
  };
}
