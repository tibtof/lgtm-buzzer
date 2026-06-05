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
 * Status: IMPLEMENTED, PENDING LIVE-INSTANCE VALIDATION (ADR-34).
 * The adapter orchestrates five legs — iterations, changes, and per-file
 * blobs — to produce a unified-diff string. All assumptions about the ADO
 * REST API 7.1 response shapes are documented in the adapter README.
 */
export { createAdoVcsProvider, ADAPTER_ID } from "./provider.js";
export type { AdoAdapterConfig, AdoAdapterDeps } from "./provider.js";
export {
  buildPullDiffUrl,
  buildIterationsUrl,
  buildChangesUrl,
  buildBlobUrl,
} from "./url.js";
export type { AdoPR } from "./url.js";
export { mapHttpError } from "./errors.js";
export { createAdoHttpClient, buildAuthHeader } from "./http.js";
export type { AdoAuthScheme, HttpClientConfig } from "./http.js";
export { toDiffFiles } from "./changes.js";
export type { PlannedFile } from "./changes.js";
export {
  AdoIterationSchema,
  AdoIterationsResponseSchema,
  AdoChangeItemSchema,
  AdoChangeEntrySchema,
  AdoChangesResponseSchema,
} from "./schemas.js";
export type {
  AdoIteration,
  AdoIterationsResponse,
  AdoChangeItem,
  AdoChangeEntry,
  AdoChangesResponse,
} from "./schemas.js";
