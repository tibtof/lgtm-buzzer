import { describe, expect, it } from "vitest";
import { QuizResultFrameSchema } from "./quiz-result.js";

const BASE = {
  v: 1 as const,
  kind: "quiz-result" as const,
  correlationId: "cid-qres",
};

describe("QuizResultFrameSchema", () => {
  it("parses a well-formed passing quiz-result frame", () => {
    const result = QuizResultFrameSchema.safeParse({
      ...BASE,
      payload: { passed: true, correct: 3, total: 3 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.passed).toBe(true);
    }
  });

  it("parses a well-formed failing quiz-result frame", () => {
    const result = QuizResultFrameSchema.safeParse({
      ...BASE,
      payload: { passed: false, correct: 1, total: 3 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.passed).toBe(false);
      expect(result.data.payload.correct).toBe(1);
    }
  });

  it("parses a quiz-result frame with perQuestion details", () => {
    const result = QuizResultFrameSchema.safeParse({
      ...BASE,
      payload: {
        passed: true,
        correct: 2,
        total: 2,
        perQuestion: [
          { questionId: "q1", correct: true },
          { questionId: "q2", correct: true, explanation: "Because X." },
        ],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.perQuestion).toHaveLength(2);
    }
  });

  it("parses a quiz-result frame without perQuestion (optional)", () => {
    const result = QuizResultFrameSchema.safeParse({
      ...BASE,
      payload: { passed: false, correct: 0, total: 3 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.perQuestion).toBeUndefined();
    }
  });

  it("rejects when correct is negative", () => {
    const result = QuizResultFrameSchema.safeParse({
      ...BASE,
      payload: { passed: false, correct: -1, total: 3 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when total is zero", () => {
    const result = QuizResultFrameSchema.safeParse({
      ...BASE,
      payload: { passed: false, correct: 0, total: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("parses a per-question result with explanation present", () => {
    const result = QuizResultFrameSchema.safeParse({
      ...BASE,
      payload: {
        passed: false,
        correct: 0,
        total: 1,
        perQuestion: [
          {
            questionId: "q1",
            correct: false,
            explanation: "The correct answer was B because the loop exits early.",
          },
        ],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.perQuestion?.[0]?.explanation).toBe(
        "The correct answer was B because the loop exits early.",
      );
    }
  });
});
