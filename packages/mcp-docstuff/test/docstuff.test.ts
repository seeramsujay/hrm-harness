import { test, describe } from "node:test";
import assert from "node:assert";
import { DocIndexDatabase, DocStuffServer } from "../src/index.ts";

describe("DocStuff Local Semantic Indexer", () => {
  test("DocIndexDatabase should index markdown files and extract titles/headings", () => {
    const db = new DocIndexDatabase();
    const count = db.indexDirectory(process.cwd());
    assert.ok(count > 0, "Should have indexed at least one doc file");

    const results = db.search("thesis", 3);
    assert.ok(results.length > 0, "Should find results for 'thesis'");
    assert.ok(results[0]?.title.length > 0);
  });

  test("DocStuffServer should handle search queries", () => {
    const server = new DocStuffServer({ rootDir: process.cwd() });
    const results = server.queryDocs("validator", 2);
    assert.ok(Array.isArray(results));
  });
});
