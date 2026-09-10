import { HRMValidatorDaemon } from "./daemon.ts";
import { HRMValidatorClient } from "./client.ts";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "start";

  if (command === "start") {
    const socket = process.env.HRM_SOCKET_PATH || "/tmp/hrm_validator.sock";
    const daemon = new HRMValidatorDaemon(socket);
    console.log(`[HRM Validator] Starting daemon on socket: ${socket}...`);
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
  } else {
    console.log("Usage: hrm-validator [start|ping]");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
