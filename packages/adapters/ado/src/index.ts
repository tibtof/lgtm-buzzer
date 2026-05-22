/**
 * Public API for the Azure DevOps VCS adapter.
 *
 * Usage:
 * ```ts
 * import { createAdoVcsProvider } from "@lgtm-buzzer/adapter-ado";
 *
 * const provider = createAdoVcsProvider({
 *   config: { token: process.env.ADO_TOKEN ?? "" },
 * });
 * ```
 *
 * Note (v1): `fetchDiff` returns
 * `malformed-response { detail: "ado-multi-call-not-yet-implemented" }` for all
 * ADO PRs. Multi-call orchestration is deferred to a future ADR. The wrong-VCS
 * guard, PAT-not-in-errors, and all structural invariants are fully enforced.
 */
export { createAdoVcsProvider, ADAPTER_ID } from "./provider.js";
export type { AdoAdapterConfig, AdoAdapterDeps } from "./provider.js";
export { buildPullDiffUrl } from "./url.js";
export { mapHttpError } from "./errors.js";
export { createAdoHttpClient } from "./http.js";
export type { HttpClientConfig } from "./http.js";
