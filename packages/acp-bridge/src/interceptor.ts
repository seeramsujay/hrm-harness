import { HRMValidatorClient, type CandidateFilePatch } from "../../hrm-validator/src/index.ts";

export interface ProposedEditPayload {
  sessionId?: string;
  patches: CandidateFilePatch[];
}

export interface InterceptResult {
  decision: "allow" | "reject";
  feedback?: string;
  diagnostics?: any[];
}

export class DiffInterceptor {
  private validatorClient: HRMValidatorClient;

  constructor(socketPath: string = process.env.HRM_SOCKET_PATH || "/tmp/hrm_validator.sock") {
    this.validatorClient = new HRMValidatorClient(socketPath);
  }

  /**
   * Intercept proposed edits from LLM before they are flushed to disk.
   */
  public async interceptProposedEdit(payload: ProposedEditPayload): Promise<InterceptResult> {
    try {
      const validation = await this.validatorClient.validatePatches(payload.patches);

      if (!validation.valid) {
        return {
          decision: "reject",
          feedback: validation.feedback,
          diagnostics: validation.diagnostics
        };
      }

      return {
        decision: "allow"
      };
    } catch (err: any) {
      // Fallback: If HRM daemon is not running locally, pass-through with warning
      console.warn(`[DiffInterceptor] Local HRM daemon unavailable (${err.message}). Defaulting to allow.`);
      return {
        decision: "allow"
      };
    }
  }
}
