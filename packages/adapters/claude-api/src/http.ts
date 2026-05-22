import { HttpClient } from "monadyssey-fetch";

/** Package-level User-Agent string injected into every request. */
export const USER_AGENT = "lgtm-buzzer-claude-api-adapter/0.0.0";

/**
 * Configuration object accepted by `createAnthropicHttpClient`.
 *
 * Only the fields directly consumed by the HTTP construction are listed here.
 * The full adapter config is `ClaudeApiConfig` in `provider.ts`.
 */
export type AnthropicHttpClientConfig = {
  /** Anthropic API key. Sent only as `x-api-key` header. Never logged. */
  readonly apiKey: string;
  /** API base URL. Default: `"https://api.anthropic.com"`. */
  readonly baseUrl?: string;
  /** Wall-clock timeout in milliseconds. Default: `60_000`. */
  readonly timeoutMs?: number;
  /** Optional User-Agent override (mainly for tests). */
  readonly userAgent?: string;
};

/**
 * Constructs an `HttpClient` pre-configured for the Anthropic Messages API.
 *
 * Headers set on every request:
 * - `x-api-key: <key>` — API key authentication. The key MUST NOT be logged
 *   or included in error payloads.
 * - `anthropic-version: 2023-06-01` — required stable API version pin.
 * - `anthropic-beta: prompt-caching-2024-07-31` — enables prompt caching.
 * - `Content-Type: application/json` — all requests are JSON.
 * - `User-Agent: lgtm-buzzer-claude-api-adapter/0.0.0`.
 *
 * @param config - Connection config including the API key.
 * @returns A configured `HttpClient` instance.
 */
export const createAnthropicHttpClient = (
  config: AnthropicHttpClientConfig,
): HttpClient => {
  const baseUrl = config.baseUrl ?? "https://api.anthropic.com";
  const timeoutMs = config.timeoutMs ?? 60_000;
  const userAgent = config.userAgent ?? USER_AGENT;

  return new HttpClient({
    baseUrl,
    defaultHeaders: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
      "Content-Type": "application/json",
      "User-Agent": userAgent,
    },
    timeout: timeoutMs,
  });
};
