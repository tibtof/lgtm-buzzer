/**
 * Azure DevOps VCS adapter — v1 implementation.
 *
 * ## ADO diff API — design decision (v1)
 *
 * Azure DevOps does NOT expose a single endpoint that returns a raw unified-diff
 * string the way GitHub does with `Accept: application/vnd.github.v3.diff`.
 *
 * The three realistic options investigated are:
 *
 * ### Option A — Commit-diff endpoint
 * `GET /{org}/{project}/_apis/git/repositories/{repo}/diffs/commits?baseVersion={target}&targetVersion={source}`
 * Returns a JSON object listing changed files (paths + change types) but carries
 * NO per-file content. It does not return a diff body. Unsuitable on its own.
 *
 * ### Option B — PR iterations + per-file FileDiff
 * `GET .../pullRequests/{id}/iterations` → get latest iteration ID →
 * `GET .../iterations/{iter}/changes` → iterate files →
 * `GET .../items` with `versionDescriptor` params for each file.
 * The ADO FileDiff API returns block diffs in JSON, not unified-diff text.
 * Multi-call, complex, and still requires custom diff formatting.
 *
 * ### Option C — Items content endpoint
 * For each changed file, fetch the before/after content and compute a local diff.
 * Requires a diffing library in the adapter, violating the "no extra runtime deps
 * in adapters without ADR" rule.
 *
 * **Decision (v1)**: None of these options produces a ready-to-use unified-diff
 * string without significant complexity or additional dependencies. Rather than
 * silently emit a malformed or incorrect output that could corrupt the quiz LLM
 * prompt, this adapter immediately returns
 * `malformed-response { detail: "ado-multi-call-not-yet-implemented" }`.
 *
 * A future ADR will design the multi-call orchestration carefully and implement
 * the diff construction. The adapter structure (url.ts, errors.ts, http.ts) is
 * fully in place so that ADR only needs to fill in the orchestration body.
 *
 * **Hard constraints honoured even in v1**:
 * - Wrong-VCS guard: non-ADO `PRIdentifier` → `transport { detail: "wrong-vcs" }`
 * - PAT never appears in error payloads.
 * - `Cancelled` is NEVER manufactured into `Err<VCSProviderError>`.
 * - 2 MiB cap and structural sniff will be applied once the multi-call body lands.
 */

import { IO } from "monadyssey";
import type { HttpClient } from "monadyssey-fetch";
import type { VCSProvider, VCSProviderError, Diff, PRIdentifier } from "@lgtm-buzzer/core";
import { createAdoHttpClient } from "./http.js";

/** Stable identifier for the ADO VCS adapter. */
export const ADAPTER_ID = "ado" as const;

/**
 * Per-instance configuration for `createAdoVcsProvider`.
 *
 * All fields except `token` are optional; defaults mirror the GitHub adapter
 * (ADR-15) with ADO-specific values.
 */
export type AdoAdapterConfig = {
  /** Required PAT. Never logged or included in error payloads. */
  readonly token: string;
  /** API base URL. Default: `"https://dev.azure.com"`. */
  readonly baseUrl?: string;
  /** Wall-clock timeout in milliseconds. Default: `30_000`. */
  readonly timeoutMs?: number;
  /** Maximum diff body size in bytes. Default: `2 * 1024 * 1024` (2 MiB). */
  readonly maxBytes?: number;
  /** Optional User-Agent override. */
  readonly userAgent?: string;
};

/**
 * Dependencies injected into `createAdoVcsProvider`.
 *
 * `config` is mandatory. `httpClient` is injectable for unit tests; when
 * omitted, a default client is constructed from `config` via
 * `createAdoHttpClient`.
 */
export type AdoAdapterDeps = {
  readonly config: AdoAdapterConfig;
  /** Injectable `HttpClient` for testing. When provided, overrides the client built from `config`. */
  readonly httpClient?: HttpClient;
};

/**
 * Factory that creates a `VCSProvider` backed by the Azure DevOps REST API.
 *
 * Behaviour (v1):
 * - Guards against non-ADO `PRIdentifier` with `transport { detail: "wrong-vcs" }`.
 * - Returns `malformed-response { detail: "ado-multi-call-not-yet-implemented" }`
 *   for all ADO PRs until a future ADR implements the multi-call diff orchestration.
 * - The PAT MUST NOT appear in any error payload.
 * - Cancellation is propagated as the `Cancelled` runtime outcome (ADR-10);
 *   it is NEVER manufactured into `Err<VCSProviderError.cancelled>`.
 *
 * @param deps - Injected dependencies (`config` required, `httpClient` optional).
 * @returns A fully wired `VCSProvider`.
 */
export const createAdoVcsProvider = (deps: AdoAdapterDeps): VCSProvider => {
  const { config } = deps;
  const baseUrl = config.baseUrl ?? "https://dev.azure.com";
  const timeoutMs = config.timeoutMs ?? 30_000;
  const userAgent = config.userAgent ?? undefined;

  // Construct the HTTP client (used in future multi-call implementation).
  // Stored here so the factory is ready to be extended without structural changes.
  const _client =
    deps.httpClient ??
    createAdoHttpClient(
      userAgent !== undefined
        ? { token: config.token, baseUrl, timeoutMs, userAgent }
        : { token: config.token, baseUrl, timeoutMs },
    );

  // Suppress unused variable warning — _client will be used when multi-call
  // orchestration lands. The underscore prefix documents intentional deferral.
  void _client;

  const fetchDiff = (input: PRIdentifier): IO<VCSProviderError, Diff> => {
    // Guard: only ADO PRs are handled by this adapter.
    if (input.kind !== "ado") {
      return IO.fail<VCSProviderError, Diff>({
        kind: "transport",
        detail: "wrong-vcs",
      });
    }

    // v1 limitation: ADO does not expose a single unified-diff endpoint.
    // Multi-call orchestration is deferred to a future ADR.
    // See the module-level comment for the full rationale.
    return IO.fail<VCSProviderError, Diff>({
      kind: "malformed-response",
      detail: "ado-multi-call-not-yet-implemented",
    });
  };

  return {
    id: ADAPTER_ID,
    fetchDiff,
  };
};
