export interface StructuralDiagnostic {
  rule: "UNDEFINED_SYMBOL" | "CYCLIC_IMPORT" | "SYNTAX_ERROR" | "TEST_FAILURE" | "UNREACHABLE_CODE" | "TYPE_MISMATCH";
  file: string;
  line: number;
  symbol?: string;
  expected?: string;
  actual?: string;
  message: string;
}

/**
 * Encodes structural diagnostics into deterministic micro-token feedback signatures
 * consuming only ~10-20 LLM tokens instead of raw compiler stack traces.
 *
 * Example Output:
 * [HRM:ERR:TYPE_MISMATCH @ src/auth.ts:42 sym=verifyToken exp=string got=number]
 */
export function encodeMicroTokenError(diag: StructuralDiagnostic): string {
  const parts = [
    `[HRM:ERR:${diag.rule}`,
    `@ ${diag.file}:${diag.line}`,
    diag.symbol ? `sym=${diag.symbol}` : null,
    diag.expected ? `exp=${diag.expected}` : null,
    diag.actual ? `got=${diag.actual}` : null
  ].filter(Boolean);

  return `${parts.join(" ")}]`;
}

/**
 * Format a batch of diagnostics into a minimal multi-line token prompt.
 */
export function formatMicroTokenPrompt(diagnostics: StructuralDiagnostic[]): string {
  if (diagnostics.length === 0) {
    return "[HRM:OK]";
  }

  const encoded = diagnostics.map(encodeMicroTokenError).join("\n");
  return `HRM_FEEDBACK:\n${encoded}\nPlease correct these invariant violations directly.`;
}
