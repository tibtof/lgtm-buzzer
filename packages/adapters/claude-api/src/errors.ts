import type { HttpError } from "monadyssey-fetch";
import type { LLMProviderError } from "@lgtm-buzzer/core";

/**
 * Maps a `monadyssey-fetch` `HttpError` to the matching `LLMProviderError`
 * variant per ADR-20 §9.
 *
 * Source mapping:
 * - `status === 0`, rawMessage matches `/timeout|aborted/i` → `timeout { afterMs }`
 * - `status === 0`, other rawMessage                         → `transport { detail }` (no status)
 * - `status >= 400`                                          → `transport { status, detail }`
 *
 * The API key MUST NOT appear in `detail` or `raw`. `rawMessage` from the HTTP
 * library never contains headers, so it is safe to forward as-is.
 *
 * @param err - The `HttpError` from `monadyssey-fetch`.
 * @param timeoutMs - The configured timeout used to populate `afterMs` on timeout errors.
 * @returns The corresponding `LLMProviderError`.
 */
export const mapHttpError = (err: HttpError, timeoutMs: number): LLMProviderError => {
  if (err.status === 0) {
    // Network, TLS, or per-request timeout exhaustion.
    // Introspect rawMessage to distinguish timeout from generic network failure.
    if (/timeout|aborted/i.test(err.rawMessage)) {
      return {
        kind: "timeout",
        afterMs: timeoutMs,
      };
    }
    // Generic network / TLS failure — no HTTP status to report.
    return {
      kind: "transport",
      detail: err.rawMessage,
    };
  }

  // HTTP-level errors (4xx, 5xx, etc.)
  return {
    kind: "transport",
    status: err.status,
    detail: err.rawMessage,
  };
};
