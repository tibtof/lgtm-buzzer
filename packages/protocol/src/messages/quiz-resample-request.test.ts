import { describe, expect, it } from "vitest";
import {
  QuizResampleRequestFrameSchema,
  RESAMPLE_FAILED_PREFIX,
} from "./quiz-resample-request.js";

const BASE = {
  v: 1 as const,
  kind: "quiz-resample-request" as const,
  correlationId: "cid-qrr",
};

describe("QuizResampleRequestFrameSchema", () => {
  it("parses a well-formed quiz-resample-request frame", () => {
    const result = QuizResampleRequestFrameSchema.safeParse({
      ...BASE,
      payload: { quizId: "quiz-123", questionCount: 5 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.quizId).toBe("quiz-123");
      expect(result.data.payload.questionCount).toBe(5);
    }
  });

  it("rejects when quizId is empty", () => {
    const result = QuizResampleRequestFrameSchema.safeParse({
      ...BASE,
      payload: { quizId: "", questionCount: 5 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when questionCount is below minimum (0)", () => {
    const result = QuizResampleRequestFrameSchema.safeParse({
      ...BASE,
      payload: { quizId: "quiz-abc", questionCount: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when questionCount exceeds maximum (11)", () => {
    const result = QuizResampleRequestFrameSchema.safeParse({
      ...BASE,
      payload: { quizId: "quiz-abc", questionCount: 11 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts questionCount at boundaries (1 and 10)", () => {
    const r1 = QuizResampleRequestFrameSchema.safeParse({
      ...BASE,
      payload: { quizId: "q", questionCount: 1 },
    });
    expect(r1.success).toBe(true);

    const r10 = QuizResampleRequestFrameSchema.safeParse({
      ...BASE,
      payload: { quizId: "q", questionCount: 10 },
    });
    expect(r10.success).toBe(true);
  });

  it("rejects when payload is missing", () => {
    const result = QuizResampleRequestFrameSchema.safeParse({ ...BASE });
    expect(result.success).toBe(false);
  });

  it("accepts null correlationId", () => {
    const result = QuizResampleRequestFrameSchema.safeParse({
      ...BASE,
      correlationId: null,
      payload: { quizId: "q1", questionCount: 3 },
    });
    expect(result.success).toBe(true);
  });
});

describe("RESAMPLE_FAILED_PREFIX", () => {
  it("is a non-empty string constant", () => {
    expect(typeof RESAMPLE_FAILED_PREFIX).toBe("string");
    expect(RESAMPLE_FAILED_PREFIX.length).toBeGreaterThan(0);
  });

  it("matches the expected prefix value", () => {
    expect(RESAMPLE_FAILED_PREFIX).toBe("resample failed:");
  });
});
