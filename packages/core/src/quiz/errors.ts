/**
 * Discriminated error union for all LLM provider failure modes.
 *
 * Source-mapping (binding for every adapter):
 * - `subprocess { reason: "spawn-failed" }` ← SpawnError.spawn-failed
 * - `subprocess { reason: "process-failed", exitCode, stderr }` ← SpawnError.process-failed
 * - `cancelled` ← SpawnError.cancelled (unreachable via Err at monadyssey@2.0.1, see ADR-10)
 * - `transport { status, detail }` ← HTTP non-2xx
 * - `transport { detail }` (no status) ← HTTP network/TLS failure
 * - `malformed-response { detail, raw? }` ← zod parse failure on stdout/HTTP body
 * - `timeout { afterMs }` ← adapter wall-clock budget exceeded
 *
 * The `cancelled` variant is kept for type-contract completeness and forward-compat
 * even though monadyssey@2.0.1 delivers cancellation as the `Cancelled` runtime
 * outcome, not as `Err<LLMProviderError>` (ADR-10).
 */
export type LLMProviderError =
  | {
      readonly kind: "subprocess";
      readonly reason: "spawn-failed" | "process-failed";
      readonly exitCode?: number;
      readonly stderr?: string;
      readonly detail: string;
    }
  | { readonly kind: "transport"; readonly status?: number; readonly detail: string }
  | { readonly kind: "malformed-response"; readonly detail: string; readonly raw?: string }
  | { readonly kind: "timeout"; readonly afterMs: number }
  | { readonly kind: "cancelled" };
