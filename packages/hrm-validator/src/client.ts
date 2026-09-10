import * as net from "node:net";
import type { DaemonRequest, DaemonResponse } from "./daemon.ts";
import type { CandidateFilePatch } from "./invariants.ts";
import type { StructuralDiagnostic } from "./micro-tokens.ts";
import type { TestTriagePlan } from "./triage.ts";

export class HRMValidatorClient {
  private socketPath: string;

  constructor(socketPath: string = "/tmp/hrm_validator.sock") {
    this.socketPath = socketPath;
  }

  private async sendRequest(req: DaemonRequest): Promise<DaemonResponse> {
    return new Promise((resolve, reject) => {
      const client = net.createConnection(this.socketPath, () => {
        client.write(JSON.stringify(req) + "\n");
      });

      let buffer = "";
      client.on("data", (chunk) => {
        buffer += chunk.toString("utf-8");
        const idx = buffer.indexOf("\n");
        if (idx !== -1) {
          const line = buffer.substring(0, idx);
          client.end();
          try {
            resolve(JSON.parse(line));
          } catch (err) {
            reject(err);
          }
        }
      });

      client.on("error", (err) => {
        reject(err);
      });
    });
  }

  public async ping(): Promise<{ status: string; uptime: number }> {
    const res = await this.sendRequest({ id: Date.now(), method: "ping" });
    if (res.error) throw new Error(res.error);
    return res.result;
  }

  public async validatePatches(patches: CandidateFilePatch[]): Promise<{
    valid: boolean;
    diagnostics: StructuralDiagnostic[];
    feedback: string;
  }> {
    const res = await this.sendRequest({
      id: Date.now(),
      method: "validate_patch",
      params: { patches }
    });
    if (res.error) throw new Error(res.error);
    return res.result;
  }

  public async triageTests(changedFiles: string[]): Promise<TestTriagePlan> {
    const res = await this.sendRequest({
      id: Date.now(),
      method: "triage_tests",
      params: { changedFiles }
    });
    if (res.error) throw new Error(res.error);
    return res.result;
  }
}
