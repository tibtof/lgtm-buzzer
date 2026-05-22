import { describe, expect, it } from "vitest";
import {
  DOM_EVENTS,
  QuizRequestEventDetailSchema,
  QuizResultEventDetailSchema,
  QuizSubmitEventDetailSchema,
  QuizCancelEventDetailSchema,
  QuizRetryEventDetailSchema,
  emitDOMEvent,
  addDOMEventListener,
} from "./dom-events.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeQuizRequestDetail = () => ({
  requestId: "req-1",
  correlationId: "corr-1",
  pr: { kind: "github" as const, owner: "tibtof", repo: "lgtm-buzzer", number: 42 },
});

const makeQuizDTO = () => ({
  id: "quiz-1",
  questions: [
    {
      type: "multiple-choice" as const,
      id: "q1",
      prompt: "What does the diff change?",
      choices: [
        { id: "a", label: "Option A" },
        { id: "b", label: "Option B" },
      ],
    },
  ],
});

const makeQuizResultPayload = () => ({
  passed: true,
  correct: 1,
  total: 1,
});

// ---------------------------------------------------------------------------
// 1. Event name constants
// ---------------------------------------------------------------------------

describe("DOM_EVENTS constants", () => {
  it("has the expected event names", () => {
    expect(DOM_EVENTS.quizRequest).toBe("lgtm-buzzer:quiz-request");
    expect(DOM_EVENTS.quizResult).toBe("lgtm-buzzer:quiz-result");
    expect(DOM_EVENTS.quizSubmit).toBe("lgtm-buzzer:quiz-submit");
    expect(DOM_EVENTS.quizCancel).toBe("lgtm-buzzer:quiz-cancel");
    expect(DOM_EVENTS.quizRetry).toBe("lgtm-buzzer:quiz-retry");
  });
});

// ---------------------------------------------------------------------------
// 2. emitDOMEvent dispatches and listener fires
// ---------------------------------------------------------------------------

describe("emitDOMEvent + addDOMEventListener", () => {
  it("dispatches event and listener fires with validated detail", () => {
    const doc = document;
    const received: unknown[] = [];
    const dispose = addDOMEventListener(
      doc,
      DOM_EVENTS.quizRequest,
      QuizRequestEventDetailSchema,
      (detail) => { received.push(detail); },
    );

    const payload = makeQuizRequestDetail();
    emitDOMEvent(doc, DOM_EVENTS.quizRequest, payload);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(payload);

    dispose();
  });

  it("dispose removes the listener", () => {
    const doc = document;
    const received: unknown[] = [];
    const dispose = addDOMEventListener(
      doc,
      DOM_EVENTS.quizCancel,
      QuizCancelEventDetailSchema,
      (detail) => { received.push(detail); },
    );

    dispose();
    emitDOMEvent(doc, DOM_EVENTS.quizCancel, { requestId: "req-1" });

    expect(received).toHaveLength(0);
  });

  it("drops malformed detail and does not invoke callback", () => {
    const doc = document;
    const received: unknown[] = [];
    const warnings: string[] = [];

    const dispose = addDOMEventListener(
      doc,
      DOM_EVENTS.quizSubmit,
      QuizSubmitEventDetailSchema,
      (detail) => { received.push(detail); },
      { warn: (msg) => { warnings.push(msg); } },
    );

    // Missing required fields — should be rejected
    emitDOMEvent(doc, DOM_EVENTS.quizSubmit, { requestId: "req-1" /* missing quizId + answers */ });

    expect(received).toHaveLength(0);
    expect(warnings).toHaveLength(1);

    dispose();
  });

  it("requestId round-trips through event detail", () => {
    const doc = document;
    let captured: string | undefined;

    const dispose = addDOMEventListener(
      doc,
      DOM_EVENTS.quizCancel,
      QuizCancelEventDetailSchema,
      (detail) => { captured = detail.requestId; },
    );

    emitDOMEvent(doc, DOM_EVENTS.quizCancel, { requestId: "round-trip-42" });
    expect(captured).toBe("round-trip-42");

    dispose();
  });

  it("multiple listeners on the same event both fire", () => {
    const doc = document;
    const calls: number[] = [];

    const dispose1 = addDOMEventListener(
      doc,
      DOM_EVENTS.quizCancel,
      QuizCancelEventDetailSchema,
      () => { calls.push(1); },
    );
    const dispose2 = addDOMEventListener(
      doc,
      DOM_EVENTS.quizCancel,
      QuizCancelEventDetailSchema,
      () => { calls.push(2); },
    );

    emitDOMEvent(doc, DOM_EVENTS.quizCancel, { requestId: "req-x" });

    expect(calls.sort()).toEqual([1, 2]);

    dispose1();
    dispose2();
  });
});

// ---------------------------------------------------------------------------
// 3. Schema validation cases
// ---------------------------------------------------------------------------

describe("QuizRequestEventDetailSchema", () => {
  it("accepts a valid detail with a GitHub PR", () => {
    const result = QuizRequestEventDetailSchema.safeParse(makeQuizRequestDetail());
    expect(result.success).toBe(true);
  });

  it("rejects missing correlationId", () => {
    const result = QuizRequestEventDetailSchema.safeParse({
      requestId: "req-1",
      pr: { kind: "github", owner: "x", repo: "y", number: 1 },
    });
    expect(result.success).toBe(false);
  });
});

describe("QuizResultEventDetailSchema", () => {
  it("accepts quiz-ready outcome", () => {
    const result = QuizResultEventDetailSchema.safeParse({
      requestId: "req-1",
      outcome: { kind: "quiz-ready", quiz: makeQuizDTO() },
    });
    expect(result.success).toBe(true);
  });

  it("accepts quiz-passed outcome", () => {
    const result = QuizResultEventDetailSchema.safeParse({
      requestId: "req-1",
      outcome: { kind: "quiz-passed", result: makeQuizResultPayload() },
    });
    expect(result.success).toBe(true);
  });

  it("accepts quiz-failed outcome", () => {
    const result = QuizResultEventDetailSchema.safeParse({
      requestId: "req-1",
      outcome: { kind: "quiz-failed", result: { passed: false, correct: 0, total: 3 } },
    });
    expect(result.success).toBe(true);
  });

  it("accepts error outcome", () => {
    const result = QuizResultEventDetailSchema.safeParse({
      requestId: "req-1",
      outcome: { kind: "error", reason: "internal", message: "host disconnected" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown outcome kind", () => {
    const result = QuizResultEventDetailSchema.safeParse({
      requestId: "req-1",
      outcome: { kind: "unknown-outcome" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects error outcome with empty message", () => {
    const result = QuizResultEventDetailSchema.safeParse({
      requestId: "req-1",
      outcome: { kind: "error", reason: "internal", message: "" },
    });
    expect(result.success).toBe(false);
  });
});

describe("QuizSubmitEventDetailSchema", () => {
  it("accepts a valid submit detail", () => {
    const result = QuizSubmitEventDetailSchema.safeParse({
      requestId: "req-1",
      quizId: "quiz-1",
      answers: [{ questionId: "q1", chosenChoiceId: "a" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty answers array", () => {
    const result = QuizSubmitEventDetailSchema.safeParse({
      requestId: "req-1",
      quizId: "quiz-1",
      answers: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("QuizCancelEventDetailSchema", () => {
  it("accepts a valid cancel detail", () => {
    const result = QuizCancelEventDetailSchema.safeParse({ requestId: "req-1" });
    expect(result.success).toBe(true);
  });

  it("rejects missing requestId", () => {
    const result = QuizCancelEventDetailSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("QuizRetryEventDetailSchema", () => {
  it("accepts a valid retry detail", () => {
    const result = QuizRetryEventDetailSchema.safeParse({ requestId: "req-retry-1" });
    expect(result.success).toBe(true);
  });

  it("rejects missing requestId", () => {
    const result = QuizRetryEventDetailSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty requestId", () => {
    const result = QuizRetryEventDetailSchema.safeParse({ requestId: "" });
    expect(result.success).toBe(false);
  });
});

