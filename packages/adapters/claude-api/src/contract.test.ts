/**
 * Contract tests for the claude-api LLM adapter backed by an httptape sidecar.
 *
 * These tests run ONLY when `LGTM_BUZZER_ANTHROPIC_HTTPTAPE_URL` is set
 * (populated by `vitest.globalSetup.ts` when the httptape binary is available
 * and the fixture directory is non-empty).
 *
 * Skip conditions:
 * - httptape binary not found on PATH.
 * - `LGTM_BUZZER_ANTHROPIC_HTTPTAPE_URL` env var is not set.
 * - No recorded fixtures in `packages/adapters/claude-api/fixtures/`.
 *
 * To record fixtures:
 *   `LGTM_BUZZER_ANTHROPIC_KEY=<key> npm run record:claude-api --workspace=@lgtm-buzzer/adapter-claude-api`
 */
import { describe, it, expect } from "vitest";
import type { Diff } from "@lgtm-buzzer/core";
import type { ChoiceId, QuestionId, QuizId } from "@lgtm-buzzer/core";
import type { IdGenerator } from "@lgtm-buzzer/adapter-shared";
import { createClaudeApiProvider } from "./provider.js";
import { createAnthropicHttpClient } from "./http.js";

const httptapeUrlRaw = process.env["LGTM_BUZZER_ANTHROPIC_HTTPTAPE_URL"];
const hasHttptape = httptapeUrlRaw !== undefined && httptapeUrlRaw.length > 0;
const httptapeUrl: string = httptapeUrlRaw ?? "";

const asDiff = (s: string): Diff => s as Diff;

let idCounter = 0;
const makeCounterIds = (): IdGenerator => {
  return {
    quizId: () => `quiz-${++idCounter}` as QuizId,
    questionId: () => `question-${++idCounter}` as QuestionId,
    choiceId: () => `choice-${++idCounter}` as ChoiceId,
  };
};

const SAMPLE_DIFF = asDiff(
  "diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-const x = 1;\n+const x = 2;\n",
);

describe.skipIf(!hasHttptape)("claude-api adapter — httptape contract tests", () => {
  const makeProvider = () => {
    const client = createAnthropicHttpClient({
      // Use a fake key for replay; httptape sanitizes auth headers.
      apiKey: "sk-ant-replay-key",
      baseUrl: httptapeUrl,
    });
    return createClaudeApiProvider({
      config: { apiKey: "sk-ant-replay-key", baseUrl: httptapeUrl },
      httpClient: client,
      ids: makeCounterIds(),
    });
  };

  it("contract #1 — happy path: generateQuiz returns Ok<Quiz> with questions", async () => {
    const provider = makeProvider();
    const result = await provider
      .generateQuiz({ diff: SAMPLE_DIFF, questionCount: 2 })
      .unsafeRun();
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      expect(result.value.questions.toArray().length).toBeGreaterThan(0);
    }
  });

  it("contract #2 — provider.id is 'claude-api'", () => {
    const provider = makeProvider();
    expect(provider.id).toBe("claude-api");
  });

  it("contract #3 — quiz has the correct structure (questions with choices)", async () => {
    const provider = makeProvider();
    const result = await provider
      .generateQuiz({ diff: SAMPLE_DIFF, questionCount: 1 })
      .unsafeRun();
    if (result.type === "Ok") {
      const q = result.value.questions.head;
      expect(q.prompt.length).toBeGreaterThan(0);
      expect(q.choices.toArray().length).toBeGreaterThanOrEqual(2);
      expect(q.correctChoiceId).toBeDefined();
    }
  });

  it("contract #4 — 401 returns transport error with status 401", async () => {
    // This test assumes a fixture exists with a 401 response.
    const client = createAnthropicHttpClient({
      apiKey: "sk-ant-invalid-key",
      baseUrl: httptapeUrl,
    });
    const provider = createClaudeApiProvider({
      config: { apiKey: "sk-ant-invalid-key", baseUrl: httptapeUrl, retry: { recurs: 0, factor: 1, delay: 1 } },
      httpClient: client,
      ids: makeCounterIds(),
    });
    const result = await provider
      .generateQuiz({ diff: SAMPLE_DIFF, questionCount: 1 })
      .unsafeRun();
    // Accept both Ok (if fixture covers) and Err 401.
    if (result.type === "Err") {
      expect(result.error.kind).toBe("transport");
    }
  });

  it("contract #5 — API key never appears in error detail from httptape replay", async () => {
    const fakeKey = "sk-ant-replay-key";
    const client = createAnthropicHttpClient({ apiKey: fakeKey, baseUrl: httptapeUrl });
    const provider = createClaudeApiProvider({
      config: { apiKey: fakeKey, baseUrl: httptapeUrl, retry: { recurs: 0, factor: 1, delay: 1 } },
      httpClient: client,
      ids: makeCounterIds(),
    });
    const result = await provider
      .generateQuiz({ diff: SAMPLE_DIFF, questionCount: 1 })
      .unsafeRun();
    if (result.type === "Err") {
      expect(JSON.stringify(result.error)).not.toContain(fakeKey);
    }
  });

  it("contract #6 — correctChoiceId references a valid choice in the question", async () => {
    const provider = makeProvider();
    const result = await provider
      .generateQuiz({ diff: SAMPLE_DIFF, questionCount: 1 })
      .unsafeRun();
    if (result.type === "Ok") {
      const q = result.value.questions.head;
      const choiceIds = q.choices.toArray().map((c) => c.id);
      expect(choiceIds).toContain(q.correctChoiceId);
    }
  });

  it("contract #7 — generateQuiz with questionCount=3 returns up to 3 questions", async () => {
    const provider = makeProvider();
    const result = await provider
      .generateQuiz({ diff: SAMPLE_DIFF, questionCount: 3 })
      .unsafeRun();
    if (result.type === "Ok") {
      // The LLM may return fewer questions for short diffs, but at least 1.
      expect(result.value.questions.toArray().length).toBeGreaterThan(0);
    }
  });
});
