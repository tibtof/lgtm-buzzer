import { IO } from "monadyssey";
import type { HttpClient, HttpError } from "monadyssey-fetch";
import type { VCSProvider, VCSProviderError, Diff, PRIdentifier } from "@lgtm-buzzer/core";
import { buildPullDiffUrl } from "./url.js";
import { mapHttpError } from "./errors.js";
import { createGithubHttpClient } from "./http.js";

/** Stable identifier for the GitHub VCS adapter. */
export const ADAPTER_ID = "github" as const;

/** Maximum diff body size in bytes (2 MiB). */
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

/** Maximum bytes kept in `raw` error payloads (8 KiB). */
const MAX_RAW_BYTES = 8 * 1024;

/** Clip a string to at most `MAX_RAW_BYTES` characters. */
const clipRaw = (s: string): string =>
  s.length > MAX_RAW_BYTES ? s.slice(0, MAX_RAW_BYTES) : s;

/**
 * Returns `true` when the string looks like a valid unified diff or is empty.
 *
 * An empty PR is legal (`length === 0 → true`). Non-empty strings must contain
 * at least one `diff --git ` or `--- ` line. This sniff catches HTML error pages
 * and JSON bodies returned instead of a diff. Strict parsing is out of scope —
 * that is the LLM's job.
 */
const looksLikeUnifiedDiff = (s: string): boolean => {
  if (s.length === 0) return true;
  return /^diff --git /m.test(s) || /^--- /m.test(s);
};

/**
 * Per-instance configuration for `createGithubVcsProvider`.
 *
 * All fields except `token` are optional; defaults match ADR-15 §Decision 3.
 */
export type GithubAdapterConfig = {
  /** Required PAT (classic or fine-grained). Never logged or included in error payloads. */
  readonly token: string;
  /** API base URL. Default: `"https://api.github.com"`. */
  readonly baseUrl?: string;
  /** Wall-clock timeout in milliseconds. Default: `30_000`. */
  readonly timeoutMs?: number;
  /** Maximum diff body size in bytes. Default: `2 * 1024 * 1024` (2 MiB). */
  readonly maxBytes?: number;
  /** Optional User-Agent override. */
  readonly userAgent?: string;
};

/**
 * Dependencies injected into `createGithubVcsProvider`.
 *
 * `config` is mandatory. `httpClient` is injectable for unit tests; when
 * omitted, a default client is constructed from `config` via
 * `createGithubHttpClient`.
 */
export type GithubAdapterDeps = {
  readonly config: GithubAdapterConfig;
  /** Injectable `HttpClient` for testing. When provided, overrides the client built from `config`. */
  readonly httpClient?: HttpClient;
};

/**
 * Factory that creates a `VCSProvider` backed by the GitHub REST API.
 *
 * Behaviour (ADR-15):
 * - Calls ONLY `GET /repos/{owner}/{repo}/pulls/{number}` with
 *   `Accept: application/vnd.github.v3.diff`. No other endpoints are reached.
 * - The response body is the raw unified diff. The token MUST NOT appear in any
 *   error payload.
 * - Bodies larger than `config.maxBytes` (default 2 MiB) return
 *   `malformed-response { detail: "diff-too-large: <bytes>" }`.
 * - Bodies that do not look like a unified diff return
 *   `malformed-response { detail: "not-unified-diff", raw }`.
 * - Cancellation is propagated as the `Cancelled` runtime outcome (ADR-10);
 *   it is NEVER manufactured into `Err<VCSProviderError.cancelled>`.
 *
 * @param deps - Injected dependencies (`config` required, `httpClient` optional).
 * @returns A fully wired `VCSProvider`.
 */
export const createGithubVcsProvider = (deps: GithubAdapterDeps): VCSProvider => {
  const { config } = deps;
  const baseUrl = config.baseUrl ?? "https://api.github.com";
  const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES;

  const timeoutMs = config.timeoutMs ?? 30_000;
  const userAgent = config.userAgent ?? undefined;

  const client =
    deps.httpClient ??
    createGithubHttpClient(
      userAgent !== undefined
        ? { token: config.token, baseUrl, timeoutMs, userAgent }
        : { token: config.token, baseUrl, timeoutMs },
    );

  const fetchDiff = (input: PRIdentifier): IO<VCSProviderError, Diff> => {
    // Guard: only GitHub PRs are handled by this adapter.
    if (input.kind !== "github") {
      return IO.fail<VCSProviderError, Diff>({
        kind: "transport",
        detail: "wrong-vcs",
      });
    }

    const path = buildPullDiffUrl(baseUrl, input);

    // Step 1: issue the HTTP GET. observe:"response" gives us the full Response
    // so we can read the text body in step 2. The HttpClient carries the diff
    // Accept header; no other endpoints are ever called.
    const getIO: IO<HttpError, Response> = client.get(path, { observe: "response" });

    // Step 2: read the response text inside IO.lift so raw Promises never escape.
    const textIO: IO<VCSProviderError, string> = getIO
      .mapErr(mapHttpError)
      .flatMap(
        (response): IO<VCSProviderError, string> =>
          IO.lift<VCSProviderError, string>(
            () => response.text(),
            (e): VCSProviderError => ({
              kind: "transport",
              detail: `failed to read response body: ${String(e)}`,
            }),
          ),
      );

    // Step 3: validate diff size cap and structural sniff.
    return textIO.flatMap((body): IO<VCSProviderError, Diff> => {
      const bytes = Buffer.byteLength(body, "utf8");

      if (bytes > maxBytes) {
        return IO.fail<VCSProviderError, Diff>({
          kind: "malformed-response",
          detail: `diff-too-large: ${bytes}`,
        });
      }

      if (!looksLikeUnifiedDiff(body)) {
        return IO.fail<VCSProviderError, Diff>({
          kind: "malformed-response",
          detail: "not-unified-diff",
          raw: clipRaw(body),
        });
      }

      return IO.lift<VCSProviderError, Diff>(() => body as Diff);
    });
  };

  return {
    id: ADAPTER_ID,
    fetchDiff,
  };
};
