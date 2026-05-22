import type { HttpError } from "monadyssey-fetch";
import type { VCSProviderError } from "@lgtm-buzzer/core";

/**
 * Maps a `monadyssey-fetch` `HttpError` to the matching `VCSProviderError`
 * variant per ADR-12 §Decision 3.
 *
 * Source-mapping:
 * - `status >= 400`  → `transport { status, detail }` (includes 401/403/404/429/5xx)
 * - `status === 0`   → `transport { detail }` (network/TLS failure; no status field)
 *
 * The PAT / Authorization header is NEVER included in `detail` or `raw`.
 *
 * @param err - The `HttpError` thrown by `monadyssey-fetch`.
 * @returns The corresponding `VCSProviderError`.
 */
export const mapHttpError = (err: HttpError): VCSProviderError => {
  if (err.status === 0) {
    // Network or TLS failure — no HTTP status to report.
    return {
      kind: "transport",
      detail: err.rawMessage,
    };
  }
  return {
    kind: "transport",
    status: err.status,
    detail: err.rawMessage,
  };
};
