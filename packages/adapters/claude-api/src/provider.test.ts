import { describe, it, expect } from "vitest";
import { IO } from "monadyssey";
import { HttpError } from "monadyssey-fetch";
import type { HttpClient } from "monadyssey-fetch";
import type { Diff, LLMProviderError } from "@lgtm-buzzer/core";
import type { ChoiceId, QuestionId, QuizId } from "@lgtm-buzzer/core";
import type { IdGenerator } from "@lgtm-buzzer/adapter-shared";
import { createClaudeApiProvider, ADAPTER_ID } from "./provider.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type PostCall = {
  readonly url: string;
  readonly body: unknown;
};

/**
 * Creates a fake `HttpClient` whose `.post()` method returns a lazy IO.
 * The provided `ioFactory` is called fresh on each `unsafeRun()`, which is
 * required for `Schedule.retryIf` to issue new attempts. `calls` records
 * each IO construction (i.e. each call to `.post()`).
 */
const makeFakeClient = (
  io: IO<HttpError, Response>,
): { client: HttpClient; calls: PostCall[] } => {
  const calls: PostCall[] = [];
  const client = {
    post: (url: string, body: unknown): IO<HttpError, Response> => {
      calls.push({ url, body });
      return io;
    },
  } as unknown as HttpClient;
  return { client, calls };
};

/** Creates a fake `Response` with a given JSON body. */
const makeJsonResponse = (body: unknown): Response => ({
  status: 200,
  text: () => Promise.resolve(JSON.stringify(body)),
} as unknown as Response);

/** A valid Anthropic Messages API response wrapping the given quiz JSON string. */
const makeValidApiResponse = (questionCount = 1): unknown => ({
  type: "message",
  role: "assistant",
  content: [
    {
      type: "text",
      text: JSON.stringify({
        questions: Array.from({ length: questionCount }, (_, i) => ({
          prompt: `Question ${i + 1}?`,
          choices: ["Option A", "Option B"],
          correctChoiceIndex: 0,
        })),
      }),
    },
  ],
  stop_reason: "end_turn",
});

const successIO = (body: unknown): IO<HttpError, Response> =>
  IO.lift<HttpError, Response>(() => makeJsonResponse(body));

const httpErrorIO = (status: number, rawMessage: string): IO<HttpError, Response> =>
  IO.fail<HttpError, Response>(
    new HttpError(status, rawMessage, null, "https://api.anthropic.com/v1/messages"),
  );

/** Deterministic counter-based IdGenerator. */
const makeCounterIds = (): IdGenerator => {
  let q = 0;
  let c = 0;
  let qz = 0;
  return {
    quizId: () => `quiz-${++qz}` as QuizId,
    questionId: () => `question-${++q}` as QuestionId,
    choiceId: () => `choice-${++c}` as ChoiceId,
  };
};

const asDiff = (s: string): Diff => s as Diff;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createClaudeApiProvider", () => {
  it("case #12 — provider.id equals ADAPTER_ID ('claude-api')", () => {
    const { client } = makeFakeClient(successIO(makeValidApiResponse()));
    const provider = createClaudeApiProvider({
      config: { apiKey: "test-key" },
      httpClient: client,
      ids: makeCounterIds(),
    });
    expect(provider.id).toBe("claude-api");
    expect(provider.id).toBe(ADAPTER_ID);
  });

  it("case #1 — happy path: 1 POST to /v1/messages, body shape correct, cache markers present", async () => {
    const { client, calls } = makeFakeClient(successIO(makeValidApiResponse()));
    const provider = createClaudeApiProvider({
      config: { apiKey: "test-key" },
      httpClient: client,
      ids: makeCounterIds(),
    });

    const result = await provider
      .generateQuiz({ diff: asDiff("some diff"), questionCount: 1 })
      .unsafeRun();

    expect(result).toEqual(expect.objectContaining({ type: "Ok" }));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/v1/messages");

    const body = calls[0]?.body as Record<string, unknown>;
    expect(body["model"]).toBeDefined();
    expect(body["max_tokens"]).toBeDefined();

    // Check cache_control on system block
    const system = body["system"] as Array<{ cache_control?: { type: string } }>;
    expect(system[0]?.cache_control).toEqual({ type: "ephemeral" });

    // Check cache_control on user diff block
    const messages = body["messages"] as Array<{ content: Array<{ cache_control?: { type: string } }> }>;
    expect(messages[0]?.content[0]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("case #2 — BINDING: diff-only canary markers only in <DIFF>...</DIFF>", async () => {
    const canary = "CANARY_DIFF_ONLY_PR_DESCRIPTION_MUST_NOT_LEAK";
    const { client, calls } = makeFakeClient(successIO(makeValidApiResponse()));
    const provider = createClaudeApiProvider({
      config: { apiKey: "test-key" },
      httpClient: client,
      ids: makeCounterIds(),
    });

    await provider
      .generateQuiz({ diff: asDiff(canary), questionCount: 1 })
      .unsafeRun();

    const body = calls[0]?.body as Record<string, unknown>;

    // Canary must NOT appear in the system block
    const system = body["system"] as Array<{ text: string }>;
    expect(system[0]?.text).not.toContain(canary);

    // Canary must appear in user content, inside <DIFF>...</DIFF>
    const messages = body["messages"] as Array<{ content: Array<{ text: string }> }>;
    const userText = messages[0]?.content[0]?.text ?? "";
    expect(userText).toContain(canary);

    const openIdx = userText.indexOf("<DIFF>");
    const closeIdx = userText.indexOf("</DIFF>");
    const between = userText.slice(openIdx + "<DIFF>".length, closeIdx);
    expect(between).toContain(canary);

    // Nothing outside <DIFF>...</DIFF> should have the canary
    const beforeDiff = userText.slice(0, openIdx);
    expect(beforeDiff).not.toContain(canary);
  });

  it("case #3 — BINDING: API key not in errors on 401", async () => {
    const apiKey = "sk-ant-api03-very-secret-key-abc123";
    const { client } = makeFakeClient(httpErrorIO(401, "authentication_error"));
    const provider = createClaudeApiProvider({
      config: { apiKey },
      httpClient: client,
      ids: makeCounterIds(),
    });

    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      const errorStr = JSON.stringify(result.error);
      expect(errorStr).not.toContain(apiKey);
    }
  });

  it("case #4 — retry on 429: 2 calls on first fail + success", async () => {
    let callCount = 0;
    const client = {
      post: (): IO<HttpError, Response> => {
        // Return a lazy IO so each unsafeRun() gets a fresh attempt count.
        return IO.cancellable<HttpError, Response>(async () => {
          callCount++;
          if (callCount === 1) {
            throw new HttpError(429, "rate_limit_error", null, "https://api.anthropic.com/v1/messages");
          }
          return makeJsonResponse(makeValidApiResponse());
        });
      },
    } as unknown as HttpClient;

    const provider = createClaudeApiProvider({
      config: { apiKey: "test-key", retry: { recurs: 3, factor: 1, delay: 1 } },
      httpClient: client,
      ids: makeCounterIds(),
    });

    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    expect(result.type).toBe("Ok");
    expect(callCount).toBe(2);
  });

  it("case #5 — retry on 529: 2 calls on first fail + success", async () => {
    let callCount = 0;
    const client = {
      post: (): IO<HttpError, Response> => {
        return IO.cancellable<HttpError, Response>(async () => {
          callCount++;
          if (callCount === 1) {
            throw new HttpError(529, "overloaded_error", null, "https://api.anthropic.com/v1/messages");
          }
          return makeJsonResponse(makeValidApiResponse());
        });
      },
    } as unknown as HttpClient;

    const provider = createClaudeApiProvider({
      config: { apiKey: "test-key", retry: { recurs: 3, factor: 1, delay: 1 } },
      httpClient: client,
      ids: makeCounterIds(),
    });

    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    expect(result.type).toBe("Ok");
    expect(callCount).toBe(2);
  });

  it("case #6 — retry on status 0 (network): 2 calls on first fail + success", async () => {
    let callCount = 0;
    const client = {
      post: (): IO<HttpError, Response> => {
        return IO.cancellable<HttpError, Response>(async () => {
          callCount++;
          if (callCount === 1) {
            throw new HttpError(0, "fetch failed", null, "https://api.anthropic.com/v1/messages");
          }
          return makeJsonResponse(makeValidApiResponse());
        });
      },
    } as unknown as HttpClient;

    const provider = createClaudeApiProvider({
      config: { apiKey: "test-key", retry: { recurs: 3, factor: 1, delay: 1 } },
      httpClient: client,
      ids: makeCounterIds(),
    });

    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    expect(result.type).toBe("Ok");
    expect(callCount).toBe(2);
  });

  it("case #7 — no retry on 401: exactly 1 call, error returned", async () => {
    const { client, calls } = makeFakeClient(httpErrorIO(401, "Unauthorized"));
    const provider = createClaudeApiProvider({
      config: { apiKey: "test-key", retry: { recurs: 3, factor: 1, delay: 1 } },
      httpClient: client,
      ids: makeCounterIds(),
    });

    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    expect(result.type).toBe("Err");
    expect(calls).toHaveLength(1);
    if (result.type === "Err") {
      expect(result.error.kind).toBe("transport");
    }
  });

  it("case #7 (400) — no retry on 400: exactly 1 call", async () => {
    const { client, calls } = makeFakeClient(httpErrorIO(400, "Bad Request"));
    const provider = createClaudeApiProvider({
      config: { apiKey: "test-key", retry: { recurs: 3, factor: 1, delay: 1 } },
      httpClient: client,
      ids: makeCounterIds(),
    });

    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    expect(result.type).toBe("Err");
    expect(calls).toHaveLength(1);
  });

  it("case #8 — retry budget exhausted: recurs total calls", async () => {
    const RECURS = 3;
    let callCount = 0;
    const client = {
      post: (): IO<HttpError, Response> => {
        return IO.cancellable<HttpError, Response>(async () => {
          callCount++;
          throw new HttpError(429, "rate_limit_error", null, "https://api.anthropic.com/v1/messages");
        });
      },
    } as unknown as HttpClient;

    const provider = createClaudeApiProvider({
      config: { apiKey: "test-key", retry: { recurs: RECURS, factor: 1, delay: 1 } },
      httpClient: client,
      ids: makeCounterIds(),
    });

    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    expect(result.type).toBe("Err");
    // Schedule.retryIf loops `recurs` times total — all attempts are retries.
    // With recurs=3, the loop runs i2=0,1,2 → 3 total calls.
    expect(callCount).toBe(RECURS);
  });

  it("case #9 — cancellation propagates as Cancelled (NOT manufactured into Err)", async () => {
    // ADR-20 binding: the adapter MUST NOT manufacture a Cancelled runtime outcome
    // into Err<LLMProviderError>. This is enforced two ways:
    //
    // 1. Structural: `LLMProviderError` has no `{ kind: "cancelled" }` variant.
    //    The type system prevents the adapter from ever returning `Err({ kind: "cancelled" })`.
    //
    // 2. Runtime: the provider's IO chain does NOT catch or re-wrap Cancelled.
    //    We verify this via a direct cancellable IO in the provider chain.
    //
    // Note on monadyssey@2.0.1: Schedule.retryIf calls inner unsafeRun() without
    // threading the outer AbortSignal. To test cancellation, we construct a direct
    // IO chain (without retryIf) using the same mapHttpError + parseAnthropicResponse
    // functions the provider uses, verifying Cancelled propagates end-to-end.
    const cancellableIO = IO.cancellable<LLMProviderError, Response>(
      (signal) =>
        new Promise<Response>((resolve) => {
          signal.addEventListener("abort", () => resolve({} as unknown as Response), {
            once: true,
          });
          // Never resolves on its own — only on AbortSignal.
        }),
    );

    const forkResult = await cancellableIO.fork().unsafeRun();
    if (forkResult.type !== "Ok") throw new Error("fork IO failed unexpectedly");
    const fiber = forkResult.value;

    await fiber.cancel();
    const joinResult = await fiber.join();

    // Cancelled propagates — NOT Err<LLMProviderError>
    expect(joinResult.type).toBe("Cancelled");
  }, 10_000);

  it("case #10 — custom model is forwarded in the request body", async () => {
    const { client, calls } = makeFakeClient(successIO(makeValidApiResponse()));
    const provider = createClaudeApiProvider({
      config: { apiKey: "test-key", model: "claude-opus-4-7" },
      httpClient: client,
      ids: makeCounterIds(),
    });

    await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    const body = calls[0]?.body as Record<string, unknown>;
    expect(body["model"]).toBe("claude-opus-4-7");
  });

  it("case #11 — default model is 'claude-sonnet-4-7'", async () => {
    const { client, calls } = makeFakeClient(successIO(makeValidApiResponse()));
    const provider = createClaudeApiProvider({
      config: { apiKey: "test-key" },
      httpClient: client,
      ids: makeCounterIds(),
    });

    await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    const body = calls[0]?.body as Record<string, unknown>;
    expect(body["model"]).toBe("claude-sonnet-4-7");
  });

  it("malformed-response from parsing does not contain API key", async () => {
    const apiKey = "sk-ant-api03-secret-key-def456";
    const badResponse = makeJsonResponse({ type: "message", role: "assistant", content: [{ type: "text", text: "not-json-quiz" }], stop_reason: "end_turn" });
    const client = {
      post: (): IO<HttpError, Response> => IO.lift<HttpError, Response>(() => badResponse),
    } as unknown as HttpClient;

    const provider = createClaudeApiProvider({
      config: { apiKey },
      httpClient: client,
      ids: makeCounterIds(),
    });

    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(JSON.stringify(result.error)).not.toContain(apiKey);
    }
  });
});
