/**
 * Public API for the GitHub VCS adapter.
 *
 * Usage:
 * ```ts
 * import { createGithubVcsProvider } from "@lgtm-buzzer/adapter-github";
 *
 * const provider = createGithubVcsProvider({
 *   config: { token: process.env.GH_TOKEN ?? "" },
 * });
 * ```
 */
export { createGithubVcsProvider, ADAPTER_ID } from "./provider.js";
export type { GithubAdapterConfig, GithubAdapterDeps } from "./provider.js";
export { buildPullDiffUrl } from "./url.js";
export { mapHttpError } from "./errors.js";
export { createGithubHttpClient } from "./http.js";
export type { HttpClientConfig } from "./http.js";
