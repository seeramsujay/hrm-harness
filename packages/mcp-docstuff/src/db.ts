import * as fs from "node:fs";
import * as path from "node:path";

export interface DocEntry {
  filePath: string;
  title: string;
  content: string;
  headings: string[];
}

export class DocIndexDatabase {
  private entries: Map<string, DocEntry> = new Map();

  /**
   * Scan and index all markdown and documentation files in the project.
   */
  public indexDirectory(rootDir: string): number {
    const docs = this.scanDir(rootDir);
    for (const doc of docs) {
      const content = fs.readFileSync(doc, "utf-8");
      const headings = (content.match(/^#{1,4}\s+(.+)$/gm) || []).map((h) =>
        h.replace(/^#+\s+/, "").trim()
      );
      const title = headings[0] || path.basename(doc);
      this.entries.set(path.relative(rootDir, doc), {
        filePath: path.relative(rootDir, doc),
        title,
        content,
        headings
      });
    }
    return this.entries.size;
  }

  private scanDir(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file === "node_modules" || file === ".git" || file === ".husky") continue;
      const full = path.join(dir, file);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          results.push(...this.scanDir(full));
        } else if (file.endsWith(".md") || file.endsWith(".mdx") || file.endsWith(".txt")) {
          results.push(full);
        }
      } catch {}
    }
    return results;
  }

  /**
   * Query documentation entries by keyword matching.
   */
  public search(query: string, maxResults: number = 5): DocEntry[] {
    const q = query.toLowerCase();
    const matches: { entry: DocEntry; score: number }[] = [];

    for (const entry of this.entries.values()) {
      let score = 0;
      if (entry.title.toLowerCase().includes(q)) score += 10;
      for (const h of entry.headings) {
        if (h.toLowerCase().includes(q)) score += 5;
      }
      const count = (entry.content.toLowerCase().match(new RegExp(q, "g")) || []).length;
      score += Math.min(count, 10);

      if (score > 0) {
        matches.push({ entry, score });
      }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, maxResults).map((m) => m.entry);
  }
}
