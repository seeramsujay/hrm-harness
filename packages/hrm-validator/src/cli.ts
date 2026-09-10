import { HRMValidatorDaemon } from "./daemon.ts";
import { HRMValidatorClient } from "./client.ts";
import { HRMModelManager } from "./model-manager.ts";
import { getRegisteredModels, resolveModelSpec } from "./model-registry.ts";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

async function handleModelsCommand(subcommand: string, args: string[]) {
  const manager = new HRMModelManager();

  switch (subcommand) {
    case "list":
    case "ls": {
      console.log("\n=== Hierarchical Reasoning Models (HuggingFace) ===\n");
      const statuses = manager.listModels();

      for (const status of statuses) {
        const icon = status.isDownloaded ? "✔ [READY]" : "○ [NOT DOWNLOADED]";
        console.log(`${icon}  ${status.spec.id}`);
        console.log(`    Name:        ${status.spec.name}`);
        console.log(`    HF Repo:     ${status.spec.repo}`);
        console.log(`    Params:      ${status.spec.parameters} (${status.spec.estimatedSize})`);
        console.log(`    Arch:        ${status.spec.architecture}`);
        console.log(`    Description: ${status.spec.description}`);
        if (status.isDownloaded) {
          console.log(`    Path:        ${status.localPath} (${formatBytes(status.totalBytes)})`);
          console.log(`    Files:       ${status.downloadedFiles.join(", ")}`);
        }
        console.log("");
      }
      break;
    }

    case "download":
    case "get":
    case "pull": {
      const target = args[0];
      if (!target) {
        console.error("Error: Specify a model ID or HuggingFace repo to download.");
        console.error("Example: hrm-validator models download sapientinc/HRM-Text-1B");
        console.error("         hrm-validator models download hrm-chat");
        process.exit(1);
      }

      // Parse flags
      let force = false;
      let token: string | undefined;
      let revision: string | undefined;

      for (let i = 1; i < args.length; i++) {
        if (args[i] === "--force" || args[i] === "-f") force = true;
        if (args[i] === "--token" || args[i] === "-t") token = args[++i];
        if (args[i] === "--revision" || args[i] === "-r") revision = args[++i];
      }

      const spec = resolveModelSpec(target);
      console.log(`\n[HRM Downloader] Target model: ${spec.name}`);
      console.log(`[HRM Downloader] HuggingFace repository: https://huggingface.co/${spec.repo}`);
      console.log(`[HRM Downloader] Target directory: ${manager.getModelPath(spec)}`);
      console.log(`[HRM Downloader] Commencing download...\n`);

      let lastPercent = -1;
      const status = await manager.downloadModel(target, {
        force,
        token,
        revision,
        onProgress: (prog) => {
          if (prog.percent !== lastPercent && (prog.percent % 10 === 0 || prog.percent === 100)) {
            lastPercent = prog.percent;
            process.stdout.write(
              `[${prog.fileIndex}/${prog.totalFiles}] Downloading ${prog.currentFile}: ${prog.percent}% (${formatBytes(prog.fileBytesDownloaded)}/${formatBytes(prog.fileTotalBytes)})\n`
            );
          }
        }
      });

      console.log(`\n✔ Model successfully downloaded to ${status.localPath}`);
      console.log(`  Total size: ${formatBytes(status.totalBytes)}`);
      console.log(`  Files: ${status.downloadedFiles.join(", ")}\n`);
      break;
    }

    case "info": {
      const target = args[0];
      if (!target) {
        console.error("Error: Specify a model ID or repo to inspect.");
        process.exit(1);
      }
      const spec = resolveModelSpec(target);
      const status = manager.getModelStatus(spec);

      console.log(`\n=== HRM Model Info: ${spec.name} ===`);
      console.log(`ID:           ${spec.id}`);
      console.log(`Repo:         ${spec.repo}`);
      console.log(`Architecture: ${spec.architecture}`);
      console.log(`Parameters:   ${spec.parameters}`);
      console.log(`Est. Size:    ${spec.estimatedSize}`);
      console.log(`Description:  ${spec.description}`);
      console.log(`Status:       ${status.isDownloaded ? "Downloaded" : "Not Downloaded"}`);
      console.log(`Local Cache:  ${status.localPath}`);
      if (status.downloadedFiles.length > 0) {
        console.log(`Cached Files: ${status.downloadedFiles.join(", ")}`);
        console.log(`Disk Size:    ${formatBytes(status.totalBytes)}`);
      }
      console.log("");
      break;
    }

    case "remove":
    case "rm": {
      const target = args[0];
      if (!target) {
        console.error("Error: Specify a model ID or repo to remove.");
        process.exit(1);
      }
      const removed = manager.removeModel(target);
      if (removed) {
        console.log(`✔ Successfully removed model '${target}' from local cache.`);
      } else {
        console.log(`○ Model '${target}' was not found in local cache.`);
      }
      break;
    }

    default:
      console.log("Usage: hrm-validator models [list|download|info|remove] <options>");
      break;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "start";

  if (command === "start") {
    let socket = process.env.HRM_SOCKET_PATH || "/tmp/hrm_validator.sock";
    let model = process.env.HRM_MODEL || "hrm-text-1b";

    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--socket" || args[i] === "-s") socket = args[++i];
      if (args[i] === "--model" || args[i] === "-m") model = args[++i];
    }

    const daemon = new HRMValidatorDaemon(socket, model);
    console.log(`[HRM Validator] Starting daemon on socket: ${socket} (active model: ${model})...`);
    await daemon.start();
    console.log(`[HRM Validator] Daemon listening on ${socket}`);

    process.on("SIGINT", async () => {
      console.log("\n[HRM Validator] Shutting down daemon...");
      await daemon.stop();
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      await daemon.stop();
      process.exit(0);
    });
  } else if (command === "ping") {
    const client = new HRMValidatorClient();
    try {
      const res = await client.ping();
      console.log("[HRM Validator] Daemon status:", res);
    } catch (err: any) {
      console.error("[HRM Validator] Ping failed:", err.message);
      process.exit(1);
    }
  } else if (command === "models" || command === "model") {
    const subcommand = args[1] || "list";
    await handleModelsCommand(subcommand, args.slice(2));
  } else {
    console.log("Usage:");
    console.log("  hrm-validator start [--socket <path>] [--model <model>]");
    console.log("  hrm-validator ping");
    console.log("  hrm-validator models list");
    console.log("  hrm-validator models download <model-or-repo> [--force] [--token <token>]");
    console.log("  hrm-validator models info <model-or-repo>");
    console.log("  hrm-validator models remove <model-or-repo>");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
