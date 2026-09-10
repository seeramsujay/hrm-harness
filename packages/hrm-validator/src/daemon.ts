import * as net from "node:net";
import * as fs from "node:fs";
import { InvariantChecker, type CandidateFilePatch } from "./invariants.ts";
import { TestTriageEngine } from "./triage.ts";
import { formatMicroTokenPrompt, type StructuralDiagnostic } from "./micro-tokens.ts";
import { HRMModelManager } from "./model-manager.ts";
import { resolveModelSpec } from "./model-registry.ts";

export interface DaemonRequest {
  id: string | number;
  method: "ping" | "validate_patch" | "triage_tests" | "list_models" | "set_model" | "shutdown";
  params?: any;
}

export interface DaemonResponse {
  id: string | number;
  result?: any;
  error?: string;
}

export class HRMValidatorDaemon {
  private socketPath: string;
  private server: net.Server | null = null;
  private invariantChecker = new InvariantChecker();
  private triageEngine = new TestTriageEngine();
  private modelManager: HRMModelManager;
  private activeModel: string;

  constructor(
    socketPath: string = "/tmp/hrm_validator.sock",
    model: string = process.env.HRM_MODEL || "hrm-text-1b"
  ) {
    this.socketPath = socketPath;
    this.modelManager = new HRMModelManager();
    this.activeModel = model;
  }

  public async start(): Promise<void> {
    // Remove stale socket if exists
    if (fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch {}
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        let buffer = "";

        socket.on("data", (chunk) => {
          buffer += chunk.toString("utf-8");
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const req: DaemonRequest = JSON.parse(line);
              const res = this.handleRequest(req);
              socket.write(JSON.stringify(res) + "\n");
            } catch (err: any) {
              socket.write(
                JSON.stringify({ id: null, error: `Invalid request: ${err.message}` }) + "\n"
              );
            }
          }
        });
      });

      this.server.on("error", (err) => {
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    if (fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch {}
    }
  }

  private handleRequest(req: DaemonRequest): DaemonResponse {
    switch (req.method) {
      case "ping": {
        const status = this.modelManager.getModelStatus(this.activeModel);
        return {
          id: req.id,
          result: {
            status: "ready",
            uptime: process.uptime(),
            activeModel: {
              id: status.spec.id,
              name: status.spec.name,
              repo: status.spec.repo,
              isDownloaded: status.isDownloaded,
              localPath: status.localPath
            }
          }
        };
      }

      case "validate_patch": {
        const patches: CandidateFilePatch[] = req.params?.patches || [];
        const diagnostics: StructuralDiagnostic[] = this.invariantChecker.checkCandidatePatches(patches);
        const feedback = formatMicroTokenPrompt(diagnostics);
        return {
          id: req.id,
          result: {
            valid: diagnostics.length === 0,
            diagnostics,
            feedback,
            model: this.activeModel
          }
        };
      }

      case "triage_tests": {
        const changedFiles: string[] = req.params?.changedFiles || [];
        const plan = this.triageEngine.triageTests(changedFiles);
        return { id: req.id, result: plan };
      }

      case "list_models": {
        const models = this.modelManager.listModels();
        return {
          id: req.id,
          result: {
            activeModel: this.activeModel,
            models
          }
        };
      }

      case "set_model": {
        const modelTarget = req.params?.model;
        if (!modelTarget) {
          return { id: req.id, error: "Missing required parameter 'model'" };
        }
        const resolved = resolveModelSpec(modelTarget);
        this.activeModel = resolved.id;
        const status = this.modelManager.getModelStatus(resolved);
        return {
          id: req.id,
          result: {
            activeModel: this.activeModel,
            status
          }
        };
      }

      case "shutdown":
        setTimeout(() => this.stop(), 50);
        return { id: req.id, result: { status: "shutting_down" } };

      default:
        return { id: req.id, error: `Unknown method: ${req.method}` };
    }
  }
}
