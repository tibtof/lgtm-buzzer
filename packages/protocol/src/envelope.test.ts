import { describe, expect, it } from "vitest";
import { FrameSchema } from "./envelope.js";

const VALID_PING = {
  v: 1,
  kind: "ping",
  correlationId: "cid-001",
  payload: {},
};

const VALID_PONG = {
  v: 1,
  kind: "pong",
  correlationId: "cid-002",
  payload: {},
};

const VALID_ERROR = {
  v: 1,
  kind: "error",
  correlationId: "cid-003",
  payload: { reason: "internal", message: "something went wrong" },
};

const VALID_QUIZ_REQUEST = {
  v: 1,
  kind: "quiz-request",
  correlationId: "cid-004",
  payload: {
    pr: { kind: "github", owner: "acme", repo: "api", number: 1 },
    questionCount: 3,
  },
};

const VALID_QUIZ_RESPONSE = {
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

const VALID_QUIZ_SUBMIT = {
  v: 1,
  kind: "quiz-submit",
  correlationId: "cid-006",
  payload: {
    quizId: "quiz-001",
    answers: [{ questionId: "q1", chosenChoiceId: "c1" }],
  },
};

const VALID_QUIZ_RESULT = {
  v: 1,
  kind: "quiz-result",
  correlationId: "cid-007",
  payload: { passed: true, correct: 1, total: 1 },
};

describe("FrameSchema", () => {
  it("parses a well-formed ping frame", () => {
    const result = FrameSchema.safeParse(VALID_PING);
    expect(result.success).toBe(true);
  });

  it("parses a well-formed pong frame", () => {
    const result = FrameSchema.safeParse(VALID_PONG);
    expect(result.success).toBe(true);
  });

  it("parses a well-formed error frame", () => {
    const result = FrameSchema.safeParse(VALID_ERROR);
    expect(result.success).toBe(true);
  });

  it("rejects a frame with missing v", () => {
    const frame: Record<string, unknown> = { ...VALID_PING };
    delete frame["v"];
    const result = FrameSchema.safeParse(frame);
    expect(result.success).toBe(false);
  });

  it("rejects a frame with wrong v", () => {
    const result = FrameSchema.safeParse({ ...VALID_PING, v: 2 });
    expect(result.success).toBe(false);
  });

  it("rejects a frame with missing kind", () => {
    const frame: Record<string, unknown> = { ...VALID_PING };
    delete frame["kind"];
    const result = FrameSchema.safeParse(frame);
    expect(result.success).toBe(false);
  });

  it("rejects a frame with unknown kind", () => {
    const result = FrameSchema.safeParse({ ...VALID_PING, kind: "quux" });
    expect(result.success).toBe(false);
  });

  it("rejects a frame with missing correlationId", () => {
    const frame: Record<string, unknown> = { ...VALID_PING };
    delete frame["correlationId"];
    const result = FrameSchema.safeParse(frame);
    expect(result.success).toBe(false);
  });

  it("accepts a frame with null correlationId (unsolicited host event)", () => {
    const result = FrameSchema.safeParse({ ...VALID_PING, correlationId: null });
    expect(result.success).toBe(true);
  });

  it("rejects a frame with empty-string correlationId", () => {
    const result = FrameSchema.safeParse({ ...VALID_PING, correlationId: "" });
    expect(result.success).toBe(false);
  });

  it("parses a well-formed quiz-request frame", () => {
    const result = FrameSchema.safeParse(VALID_QUIZ_REQUEST);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("quiz-request");
    }
  });

  it("parses a well-formed quiz-response frame", () => {
    const result = FrameSchema.safeParse(VALID_QUIZ_RESPONSE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("quiz-response");
    }
  });

  it("parses a well-formed quiz-submit frame", () => {
    const result = FrameSchema.safeParse(VALID_QUIZ_SUBMIT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("quiz-submit");
    }
  });

  it("parses a well-formed quiz-result frame", () => {
    const result = FrameSchema.safeParse(VALID_QUIZ_RESULT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("quiz-result");
    }
  });
});
