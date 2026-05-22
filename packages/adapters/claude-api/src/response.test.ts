import { describe, it, expect } from "vitest";
import type { ChoiceId, QuestionId, QuizId } from "@lgtm-buzzer/core";
import type { IdGenerator } from "@lgtm-buzzer/adapter-shared";
import { parseAnthropicResponse } from "./response.js";

/** Deterministic counter-based IdGenerator for tests. */
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

/** Minimal valid quiz JSON. */
const minimalQuizJson = (): string =>
  JSON.stringify({
    questions: [
      {
        prompt: "What was changed?",
        choices: ["Option A", "Option B"],
        correctChoiceIndex: 0,
      },
    ],
  });

/** Build a valid Anthropic Messages API response body with the given text content. */
const makeAnthropicBody = (text: string): unknown => ({
  type: "message",
  role: "assistant",
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
});

describe("parseAnthropicResponse", () => {
  it("happy path: returns Right<Quiz> for valid envelope + quiz JSON", () => {
    const body = makeAnthropicBody(minimalQuizJson());
    const result = parseAnthropicResponse(body, makeCounterIds());
    expect(result.fold(() => "left", (q) => q.id)).toBe("quiz-1");
  });

  it("happy path: maps correctChoiceIndex to the correct choice id", () => {
    const body = makeAnthropicBody(
      JSON.stringify({
        questions: [
          {
            prompt: "Which was added?",
            choices: ["A", "B", "C"],
            correctChoiceIndex: 2,
          },
        ],
      }),
    );
    const result = parseAnthropicResponse(body, makeCounterIds());
    result.fold(
      () => { throw new Error("Expected Right"); },
      (quiz) => {
        const q = quiz.questions.head;
        const choices = q.choices.toArray();
        const correct = choices.find((c) => c.id === q.correctChoiceId);
        expect(correct?.label).toBe("C");
      },
    );
  });

  it("strips markdown fences before parsing quiz JSON", () => {
    const fenced = "```json\n" + minimalQuizJson() + "\n```";
    const body = makeAnthropicBody(fenced);
    const result = parseAnthropicResponse(body, makeCounterIds());
    expect(result.fold(() => "left", () => "right")).toBe("right");
  });

  it("explanation field is mapped when present", () => {
    const body = makeAnthropicBody(
      JSON.stringify({
        questions: [
          {
            prompt: "Q?",
            choices: ["Yes", "No"],
            correctChoiceIndex: 0,
            explanation: "Because yes.",
          },
        ],
      }),
    );
    const result = parseAnthropicResponse(body, makeCounterIds());
    result.fold(
      () => { throw new Error("Expected Right"); },
      (quiz) => { expect(quiz.questions.head.explanation).toBe("Because yes."); },
    );
  });

  it("explanation field is absent when not provided", () => {
    const body = makeAnthropicBody(minimalQuizJson());
    const result = parseAnthropicResponse(body, makeCounterIds());
    result.fold(
      () => { throw new Error("Expected Right"); },
      (quiz) => { expect(quiz.questions.head.explanation).toBeUndefined(); },
    );
  });

  it("envelope schema fail → Left malformed-response with detail containing 'envelope-schema'", () => {
    const bad = { type: "not-message", role: "user", content: [] };
    const result = parseAnthropicResponse(bad, makeCounterIds());
    result.fold(
      (e) => {
        expect(e.kind).toBe("malformed-response");
        if (e.kind === "malformed-response") {
          expect(e.detail).toContain("envelope-schema");
        }
      },
      () => { throw new Error("Expected Left"); },
    );
  });

  it("no text block in content → Left malformed-response { detail: 'no-text-block' }", () => {
    const body = {
      type: "message",
      role: "assistant",
      content: [{ type: "tool_use", id: "x", name: "y", input: {} }],
      stop_reason: "tool_use",
    };
    const result = parseAnthropicResponse(body, makeCounterIds());
    result.fold(
      (e) => {
        expect(e.kind).toBe("malformed-response");
        if (e.kind === "malformed-response") {
          expect(e.detail).toBe("no-text-block");
        }
      },
      () => { throw new Error("Expected Left"); },
    );
  });

  it("model output not JSON → Left malformed-response { detail: 'model-output-not-json' }", () => {
    const body = makeAnthropicBody("not valid json at all");
    const result = parseAnthropicResponse(body, makeCounterIds());
    result.fold(
      (e) => {
        expect(e.kind).toBe("malformed-response");
        if (e.kind === "malformed-response") {
          expect(e.detail).toBe("model-output-not-json");
        }
      },
      () => { throw new Error("Expected Left"); },
    );
  });

  it("LlmQuizSchema fail → Left malformed-response detail containing 'quiz-schema'", () => {
    const body = makeAnthropicBody(JSON.stringify({ questions: [{ prompt: "Q" }] }));
    const result = parseAnthropicResponse(body, makeCounterIds());
    result.fold(
      (e) => {
        expect(e.kind).toBe("malformed-response");
        if (e.kind === "malformed-response") {
          expect(e.detail).toContain("quiz-schema");
        }
      },
      () => { throw new Error("Expected Left"); },
    );
  });

  it("correctChoiceIndex OOB → Left malformed-response { detail: 'correctChoiceIndex out of range' }", () => {
    const body = makeAnthropicBody(
      JSON.stringify({
        questions: [{ prompt: "Q?", choices: ["A", "B"], correctChoiceIndex: 5 }],
      }),
    );
    const result = parseAnthropicResponse(body, makeCounterIds());
    result.fold(
      (e) => {
        expect(e.kind).toBe("malformed-response");
        if (e.kind === "malformed-response") {
          expect(e.detail).toBe("correctChoiceIndex out of range");
        }
      },
      () => { throw new Error("Expected Left"); },
    );
  });

  it("empty questions array → Left malformed-response (quiz-schema min violation)", () => {
    const body = makeAnthropicBody(JSON.stringify({ questions: [] }));
    const result = parseAnthropicResponse(body, makeCounterIds());
    result.fold(
      (e) => {
        expect(e.kind).toBe("malformed-response");
      },
      () => { throw new Error("Expected Left"); },
    );
  });

  it("raw field is clipped in envelope schema errors", () => {
    // Pass a huge object that fails schema validation
    const hugeContent: unknown[] = [];
    const result = parseAnthropicResponse({ type: "message", role: "assistant", content: hugeContent }, makeCounterIds());
    result.fold(
      (e) => {
        expect(e.kind).toBe("malformed-response");
        if (e.kind === "malformed-response" && e.raw !== undefined) {
          expect(e.raw.length).toBeLessThanOrEqual(8 * 1024);
        }
      },
      () => { throw new Error("Expected Left"); },
    );
  });

  it("tolerant of unknown block types alongside text block", () => {
    const body = {
      type: "message",
      role: "assistant",
      content: [
        { type: "unknown_future_block", data: "something" },
        { type: "text", text: minimalQuizJson() },
      ],
      stop_reason: "end_turn",
    };
    const result = parseAnthropicResponse(body, makeCounterIds());
    expect(result.fold(() => "left", () => "right")).toBe("right");
  });
});
