import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { parseFrame } from "./parse.js";
import type { Frame } from "./envelope.js";

const PING_FRAME = {
  v: 1,
  kind: "ping",
  correlationId: "cid-001",
  payload: {},
};

const PONG_FRAME = {
  v: 1,
  kind: "pong",
  correlationId: "cid-002",
  payload: { nonce: "roundtrip" },
};

const ERROR_FRAME = {
  v: 1,
  kind: "error",
  correlationId: "cid-003",
  payload: { reason: "internal", message: "oops" },
};

const QUIZ_REQUEST_FRAME = {
  v: 1,
  kind: "quiz-request",
  correlationId: "cid-004",
  payload: {
    pr: { kind: "github", owner: "acme", repo: "api", number: 1 },
    questionCount: 3,
  },
};

const QUIZ_RESPONSE_FRAME = {
  v: 1,
  kind: "quiz-response",
  correlationId: "cid-005",
  payload: {
    quiz: {
      id: "quiz-001",
      questions: [
        {
          type: "multiple-choice",
          id: "q1",
          prompt: "What does this return?",
          choices: [{ id: "c1", label: "null" }],
        },
      ],
    },
  },
};

const QUIZ_SUBMIT_FRAME = {
  v: 1,
  kind: "quiz-submit",
  correlationId: "cid-006",
  payload: {
    quizId: "quiz-001",
    answers: [{ questionId: "q1", chosenChoiceId: "c1" }],
  },
};

const QUIZ_RESULT_FRAME = {
  v: 1,
  kind: "quiz-result",
  correlationId: "cid-007",
  payload: { passed: true, correct: 1, total: 1 },
};

describe("parseFrame", () => {
  it("returns success for a well-formed ping frame", () => {
    const result = parseFrame(PING_FRAME);
    expect(result.success).toBe(true);
  });

  it("returns success for a well-formed pong frame", () => {
    const result = parseFrame(PONG_FRAME);
    expect(result.success).toBe(true);
  });

  it("returns success for a well-formed error frame", () => {
    const result = parseFrame(ERROR_FRAME);
    expect(result.success).toBe(true);
  });

  it("returns failure for a string input without throwing", () => {
    const result = parseFrame("hello");
    expect(result.success).toBe(false);
  });

  it("returns failure for null without throwing", () => {
    const result = parseFrame(null);
    expect(result.success).toBe(false);
  });

  it("returns failure for a number without throwing", () => {
    const result = parseFrame(42);
    expect(result.success).toBe(false);
  });

  it("returns failure for an array without throwing", () => {
    const result = parseFrame([]);
    expect(result.success).toBe(false);
  });

  it("attaches a ZodError on failure", () => {
    const result = parseFrame("garbage");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ZodError);
    }
  });

  it("narrows result.data to Frame on the happy path (TS narrowing)", () => {
    const result = parseFrame(PING_FRAME);
    if (result.success) {
      // If the return type were SafeParseReturnType<unknown, unknown> this line
      // would be a type error — it compiles only when data is typed as Frame.
      const frame: Frame = result.data;
      expect(frame.kind).toBe("ping");
    }
  });

  it("round-trips a quiz-request frame and narrows kind", () => {
    const result = parseFrame(QUIZ_REQUEST_FRAME);
    expect(result.success).toBe(true);
    if (result.success) {
      const frame: Frame = result.data;
      expect(frame.kind).toBe("quiz-request");
      if (frame.kind === "quiz-request") {
        expect(frame.payload.questionCount).toBe(3);
      }
    }
  });

  it("round-trips a quiz-response frame and narrows kind", () => {
    const result = parseFrame(QUIZ_RESPONSE_FRAME);
    expect(result.success).toBe(true);
    if (result.success) {
      const frame: Frame = result.data;
      expect(frame.kind).toBe("quiz-response");
      if (frame.kind === "quiz-response") {
        expect(frame.payload.quiz.id).toBe("quiz-001");
      }
    }
  });

  it("round-trips a quiz-submit frame and narrows kind", () => {
    const result = parseFrame(QUIZ_SUBMIT_FRAME);
    expect(result.success).toBe(true);
    if (result.success) {
      const frame: Frame = result.data;
      expect(frame.kind).toBe("quiz-submit");
      if (frame.kind === "quiz-submit") {
        expect(frame.payload.quizId).toBe("quiz-001");
      }
    }
  });

  it("round-trips a quiz-result frame and narrows kind", () => {
    const result = parseFrame(QUIZ_RESULT_FRAME);
    expect(result.success).toBe(true);
    if (result.success) {
      const frame: Frame = result.data;
      expect(frame.kind).toBe("quiz-result");
      if (frame.kind === "quiz-result") {
        expect(frame.payload.passed).toBe(true);
      }
    }
  });
});
