import { IO, Schedule } from "monadyssey";
import type { HttpClient } from "monadyssey-fetch";
import type { LLMProvider, LLMProviderError, GenerateQuizInput, Quiz } from "@lgtm-buzzer/core";
import { defaultIdGenerator } from "@lgtm-buzzer/adapter-shared";
import type { IdGenerator } from "@lgtm-buzzer/adapter-shared";
import { createAnthropicHttpClient } from "./http.js";
import { buildMessagesPayload } from "./prompt.js";
import type { AnthropicModel } from "./prompt.js";
import { parseAnthropicResponse } from "./response.js";
import { mapHttpError } from "./errors.js";

/** Stable identifier for the claude-api adapter. */
export const ADAPTER_ID = "claude-api" as const;

/**
 * Per-instance configuration for `createClaudeApiProvider`.
 *
 * All fields except `apiKey` are optional; defaults match ADR-20 §5.
 */
export type ClaudeApiConfig = {
  /** Anthropic API key. Sent only as `x-api-key` header. Never logged. */
  readonly apiKey: string;
  /** Model to use. Default: `"claude-sonnet-4-7"`. */
  readonly model?: AnthropicModel;
  /** API base URL. Default: `"https://api.anthropic.com"`. */
  readonly baseUrl?: string;
  /** Wall-clock timeout in milliseconds. Default: `60_000`. */
  readonly timeoutMs?: number;
  /** Maximum tokens in the completion. Default: `4096`. */
  readonly maxTokens?: number;
  /** Retry policy configuration. Defaults: `{ recurs: 3, factor: 2, delay: 500 }`. */
  readonly retry?: {
    readonly recurs: number;
    readonly factor: number;
    readonly delay: number;
  };
};

/**
 * Dependencies injected into `createClaudeApiProvider`.
 *
 * `config` is mandatory. `httpClient` is injectable for unit tests; when
 * omitted, a default client is constructed from `config` via
 * `createAnthropicHttpClient`. `ids` is optional to ease testing.
 */
export type ClaudeApiDeps = {
  readonly config: ClaudeApiConfig;
  readonly httpClient?: HttpClient;
  readonly ids?: IdGenerator;
};

/**
 * Predicate used by `Schedule.retryIf` to determine whether an error is
 * retryable per ADR-20 §7.
 *
 * Retryable: 429 (rate limit), 529 (overloaded), status 0 (network failure).
 * NOT retryable: 400, 401, 403, 404, 5xx ≠ 529, malformed-response, timeout.
 */
const isRetryable = (err: LLMProviderError): boolean =>
  err.kind === "transport" &&
  (err.status === undefined || err.status === 429 || err.status === 529);

/**
 * Factory that creates an `LLMProvider` backed by the Anthropic Messages API.
 *
 * Calling convention (ADR-20):
 * - Single POST to `/v1/messages` with the full messages payload.
 * - Prompt caching enabled: two `cache_control: { type: "ephemeral" }` blocks.
 * - Retry policy: exponential backoff for 429/529/status-0 only.
 * - Timeout: HttpClient's built-in timeout; exhaustion maps to `timeout { afterMs }`.
 * - API key sent ONLY as `x-api-key` header; NEVER in error payloads or logs.
 * - Cancellation propagates as the `Cancelled` runtime outcome (ADR-10).
 *
 * @param deps - Injected dependencies (`config` required, `httpClient` and `ids` optional).
 * @returns A fully wired `LLMProvider`.
 */
export const createClaudeApiProvider = (deps: ClaudeApiDeps): LLMProvider => {
  const { config } = deps;
  const model = config.model ?? "claude-sonnet-4-7";
  // 180s default to match the ADR-30 20-question pool generation time.
  const timeoutMs = config.timeoutMs ?? 180_000;
  const maxTokens = config.maxTokens ?? 4096;
  const ids = deps.ids ?? defaultIdGenerator();

  const retryConfig = config.retry ?? { recurs: 3, factor: 2, delay: 500 };

  const client =
    deps.httpClient ??
    createAnthropicHttpClient(
      config.baseUrl !== undefined
        ? { apiKey: config.apiKey, baseUrl: config.baseUrl, timeoutMs }
        : { apiKey: config.apiKey, timeoutMs },
    );

  const generateQuiz = (input: GenerateQuizInput): IO<LLMProviderError, Quiz> => {
    const payload = buildMessagesPayload(
      input.diff,
      input.questionCount,
      model,
      maxTokens,
    );

    // Step 2: POST to /v1/messages with observe:"response" to get the full Response.
    const postIO = client.post("/v1/messages", payload, { observe: "response" });

    // Map HttpError → LLMProviderError before feeding into retry logic.
    const mappedIO: IO<LLMProviderError, Response> = postIO.mapErr(
      (err): LLMProviderError => mapHttpError(err, timeoutMs),
    );

    // Step 3: Wrap in retry policy for 429/529/status-0.
    // A fresh Schedule is created per-call because Schedule holds internal
    // state (its AbortController) that is consumed after one use.
    const retryPolicy = new Schedule({
      recurs: retryConfig.recurs,
      factor: retryConfig.factor,
      delay: retryConfig.delay,
    });
    // The third arg to retryIf is `(error: Error) => E` — monadyssey wraps
    // unhandled errors as `Error` instances; we produce a generic transport
    // error from them since our mappedIO never throws.
    const retried: IO<LLMProviderError, Response> = retryPolicy.retryIf(
      mappedIO,
      isRetryable,
      (e: Error): LLMProviderError => ({
        kind: "transport",
        detail: e.message,
      }),
    );

    // Step 4: Parse the response body.
    return retried.flatMap(
      (response): IO<LLMProviderError, Quiz> =>
        IO.lift<LLMProviderError, string>(
          () => response.text(),
          (e): LLMProviderError => ({
            kind: "transport",
            detail: `failed to read response body: ${String(e)}`,
          }),
        ).flatMap((text): IO<LLMProviderError, Quiz> => {
          let jsonBody: unknown;
          try {
            jsonBody = JSON.parse(text);
          } catch {
            return IO.fail<LLMProviderError, Quiz>({
              kind: "malformed-response",
              detail: "response-not-json",
              raw: text.length > 8192 ? text.slice(0, 8192) : text,
            });
          }
          const parsed = parseAnthropicResponse(jsonBody, ids);
          return parsed.fold(
            (err) => IO.fail<LLMProviderError, Quiz>(err),
            (quiz) => IO.lift<LLMProviderError, Quiz>(() => quiz),
          );
        }),
    );
  };

  return {
    id: ADAPTER_ID,
    generateQuiz,
  };
};
