import { HttpClient } from "monadyssey-fetch";

/** Package-level User-Agent string injected into every request. */
export const USER_AGENT = "lgtm-buzzer-github-adapter/0.0.0";

/**
 * Configuration object accepted by `createGithubHttpClient`.
 *
 * Only the fields directly consumed by the HTTP construction are listed here.
 * The full adapter config is `GithubAdapterConfig` in `provider.ts`.
 */
export type HttpClientConfig = {
  /** GitHub PAT (classic or fine-grained). Never logged. */
  readonly token: string;
  /** API base URL. Default: `"https://api.github.com"`. */
  readonly baseUrl?: string;
  /** Wall-clock timeout in milliseconds. Default: `30_000`. */
  readonly timeoutMs?: number;
  /** Optional User-Agent override (mainly for tests). */
  readonly userAgent?: string;
};

/**
 * Constructs an `HttpClient` pre-configured for the GitHub REST API.
 *
 * Headers set on every request:
 * - `Accept: application/vnd.github.v3.diff` — requests the raw unified diff
 *   body instead of the default JSON envelope.
 * - `Authorization: Bearer <token>` — PAT authentication. The token MUST NOT
 *   be logged or included in error payloads.
 * - `User-Agent: lgtm-buzzer-github-adapter/0.0.0` — required by the GitHub
 *   API; requests without a UA string may be rejected.
 * - `X-GitHub-Api-Version: 2022-11-28` — stable API version pin.
 *
 * @param config - Connection config including the PAT.
 * @returns A configured `HttpClient` instance.
 */
export const createGithubHttpClient = (config: HttpClientConfig): HttpClient => {
  const baseUrl = config.baseUrl ?? "https://api.github.com";
  const timeoutMs = config.timeoutMs ?? 30_000;
  const userAgent = config.userAgent ?? USER_AGENT;

  return new HttpClient({
    baseUrl,
    defaultHeaders: {
      Accept: "application/vnd.github.v3.diff",
      Authorization: `Bearer ${config.token}`,
      "User-Agent": userAgent,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    timeout: timeoutMs,
  });
};
