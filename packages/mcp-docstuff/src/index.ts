import { DocIndexDatabase } from "./db.ts";

export { DocIndexDatabase } from "./db.ts";

export interface DocStuffServerOptions {
  rootDir: string;
}

export class DocStuffServer {
  private db = new DocIndexDatabase();
  private rootDir: string;

  constructor(options: DocStuffServerOptions) {
    this.rootDir = options.rootDir;
    this.db.indexDirectory(this.rootDir);
  }

  public queryDocs(query: string, limit: number = 3) {
    return this.db.search(query, limit);
  }

  public reindex() {
    return this.db.indexDirectory(this.rootDir);
  }
}
