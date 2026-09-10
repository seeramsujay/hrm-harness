import type { FileASTAnalysis } from "./parser.ts";

export interface GraphNode {
  id: string; // e.g., "src/auth.ts:validateToken"
  filePath: string;
  name: string;
  kind: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: "calls" | "imports" | "extends" | "implements";
}

export interface CodebaseGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  fileDependencies: Map<string, Set<string>>;
}

export class ASTGraphExtractor {
  private fileAnalyses: Map<string, FileASTAnalysis> = new Map();

  public registerFile(analysis: FileASTAnalysis): void {
    this.fileAnalyses.set(analysis.filePath, analysis);
  }

  public buildGraph(): CodebaseGraph {
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const fileDependencies = new Map<string, Set<string>>();

    for (const [filePath, analysis] of this.fileAnalyses.entries()) {
      if (!fileDependencies.has(filePath)) {
        fileDependencies.set(filePath, new Set());
      }

      // Add symbol nodes
      for (const sym of analysis.symbols) {
        const nodeId = `${filePath}:${sym.name}`;
        nodes.set(nodeId, {
          id: nodeId,
          filePath,
          name: sym.name,
          kind: sym.kind
        });
      }

      // Add import dependencies
      for (const imp of analysis.imports) {
        // Resolve import targets
        for (const [targetPath, targetAnalysis] of this.fileAnalyses.entries()) {
          if (targetPath === filePath) continue;
          if (targetPath.includes(imp.source.replace(/^\.\//, ""))) {
            fileDependencies.get(filePath)!.add(targetPath);
            for (const symName of imp.importedSymbols) {
              edges.push({
                from: `${filePath}:file`,
                to: `${targetPath}:${symName}`,
                relation: "imports"
              });
            }
          }
        }
      }
    }

    return {
      nodes,
      edges,
      fileDependencies
    };
  }

  /**
   * Find all files and symbols directly or transitively affected by modifying a given file.
   */
  public findImpactedFiles(changedFile: string, graph: CodebaseGraph): Set<string> {
    const impacted = new Set<string>([changedFile]);
    let added = true;

    while (added) {
      added = false;
      for (const [file, deps] of graph.fileDependencies.entries()) {
        if (!impacted.has(file)) {
          for (const dep of deps) {
            if (impacted.has(dep)) {
              impacted.add(file);
              added = true;
              break;
            }
          }
        }
      }
    }

    return impacted;
  }
}
