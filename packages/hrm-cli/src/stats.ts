import * as os from "node:os";

export interface MemoryStats {
  rssMB: number;
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  totalSystemMemoryGB: number;
  freeSystemMemoryGB: number;
}

export function getMemoryStats(): MemoryStats {
  const usage = process.memoryUsage();
  const toMB = (bytes: number) => parseFloat((bytes / 1024 / 1024).toFixed(2));
  const toGB = (bytes: number) => parseFloat((bytes / 1024 / 1024 / 1024).toFixed(2));

  return {
    rssMB: toMB(usage.rss),
    heapUsedMB: toMB(usage.heapUsed),
    heapTotalMB: toMB(usage.heapTotal),
    externalMB: toMB(usage.external),
    totalSystemMemoryGB: toGB(os.totalmem()),
    freeSystemMemoryGB: toGB(os.freemem())
  };
}

export function printMemoryStats(): void {
  const stats = getMemoryStats();
  console.log("\n\x1b[1;36m=== HRM Ultra-Lightweight Memory Profile ===\x1b[0m");
  console.log(`  \x1b[1mProcess RSS:\x1b[0m        ${stats.rssMB} MB \x1b[32m(< 50 MB target)\x1b[0m`);
  console.log(`  \x1b[1mHeap Used:\x1b[0m          ${stats.heapUsedMB} MB / 128 MB max`);
  console.log(`  \x1b[1mHeap Total:\x1b[0m         ${stats.heapTotalMB} MB`);
  console.log(`  \x1b[1mExternal Bindings:\x1b[0m  ${stats.externalMB} MB`);
  console.log(`  \x1b[1mSystem Free Memory:\x1b[0m ${stats.freeSystemMemoryGB} GB / ${stats.totalSystemMemoryGB} GB\n`);
}
