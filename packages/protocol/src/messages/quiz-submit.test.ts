import { describe, expect, it } from "vitest";
import { QuizSubmitFrameSchema } from "./quiz-submit.js";

const BASE = {
  v: 1 as const,
  kind: "quiz-submit" as const,
  correlationId: "cid-qsub",
};

describe("QuizSubmitFrameSchema", () => {
  it("parses a well-formed quiz-submit frame with 1 answer", () => {
    const result = QuizSubmitFrameSchema.safeParse({
      ...BASE,
      payload: {
        quizId: "quiz-abc",
        answers: [{ questionId: "q1", chosenChoiceId: "c2" }],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.answers).toHaveLength(1);
    }
  });

  it("parses a quiz-submit frame with multiple answers", () => {
    const result = QuizSubmitFrameSchema.safeParse({
      ...BASE,
      payload: {
        quizId: "quiz-abc",
        answers: [
          { questionId: "q1", chosenChoiceId: "c1" },
          { questionId: "q2", chosenChoiceId: "c3" },
          { questionId: "q3", chosenChoiceId: "c2" },
        ],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.answers).toHaveLength(3);
    }
  });

  it("rejects when answers array is empty", () => {
    const result = QuizSubmitFrameSchema.safeParse({
      ...BASE,
      payload: { quizId: "quiz-abc", answers: [] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when quizId is missing", () => {
    const result = QuizSubmitFrameSchema.safeParse({
      ...BASE,
      payload: { answers: [{ questionId: "q1", chosenChoiceId: "c1" }] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when an answer contains an empty-string questionId", () => {
    const result = QuizSubmitFrameSchema.safeParse({
      ...BASE,
      payload: {
        quizId: "quiz-abc",
        answers: [{ questionId: "", chosenChoiceId: "c1" }],
      },
    });
    expect(result.success).toBe(false);
  });
});
