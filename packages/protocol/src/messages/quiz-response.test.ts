import { describe, expect, it } from "vitest";
import {
  QuizResponseFrameSchema,
  QuizResponsePayloadSchema,
  QuizDTOSchema,
} from "./quiz-response.js";

const BASE = {
  v: 1 as const,
  kind: "quiz-response" as const,
  correlationId: "cid-qresp",
};

const SINGLE_CHOICE = { id: "c1", label: "Option A" };

const SINGLE_QUESTION = {
  type: "multiple-choice" as const,
  id: "q1",
  prompt: "What does this function return?",
  choices: [SINGLE_CHOICE],
};

const MINIMAL_QUIZ = {
  id: "quiz-abc",
  questions: [SINGLE_QUESTION],
};

describe("QuizResponseFrameSchema", () => {
  it("parses a well-formed quiz-response frame with 1 question", () => {
    const result = QuizResponseFrameSchema.safeParse({
      ...BASE,
      payload: { quiz: MINIMAL_QUIZ },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.quiz.questions).toHaveLength(1);
    }
  });

  it("parses a quiz-response frame with multiple questions", () => {
    const result = QuizResponseFrameSchema.safeParse({
      ...BASE,
      payload: {
        quiz: {
          id: "quiz-xyz",
          questions: [
            SINGLE_QUESTION,
            {
              type: "multiple-choice" as const,
              id: "q2",
              prompt: "Which variable is modified?",
              choices: [
                { id: "c1", label: "foo" },
                { id: "c2", label: "bar" },
              ],
            },
          ],
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.quiz.questions).toHaveLength(2);
    }
  });

  it("rejects when questions array is empty", () => {
    const result = QuizDTOSchema.safeParse({ id: "quiz-empty", questions: [] });
    expect(result.success).toBe(false);
  });

  it("rejects when choices array is empty", () => {
    const result = QuizResponseFrameSchema.safeParse({
      ...BASE,
      payload: {
        quiz: {
          id: "quiz-abc",
          questions: [{ ...SINGLE_QUESTION, choices: [] }],
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when question type discriminant is missing", () => {
    const result = QuizResponseFrameSchema.safeParse({
      ...BASE,
      payload: {
        quiz: {
          id: "quiz-abc",
          questions: [
            {
              id: "q1",
              prompt: "What?",
              choices: [SINGLE_CHOICE],
            },
          ],
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects or strips correctChoiceId on questions (gate integrity)", () => {
    const payload = {
      quiz: {
        id: "q1",
        questions: [
          {
            type: "multiple-choice",
            id: "qq1",
            prompt: "?",
            choices: [{ id: "c1", label: "a" }],
            correctChoiceId: "c1", // MUST NOT survive
          },
        ],
      },
    };
    const result = QuizResponsePayloadSchema.safeParse(payload);
    if (result.success) {
      expect("correctChoiceId" in result.data.quiz.questions[0]!).toBe(false);
    }
  });

  it("rejects when quiz id is missing", () => {
    const result = QuizResponseFrameSchema.safeParse({
      ...BASE,
      payload: {
        quiz: {
          questions: [SINGLE_QUESTION],
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("parses when explanation is present on a question", () => {
    const result = QuizResponseFrameSchema.safeParse({
      ...BASE,
      payload: {
        quiz: {
          id: "quiz-exp",
          questions: [
            { ...SINGLE_QUESTION, explanation: "Because the loop exits early." },
          ],
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.quiz.questions[0]!.explanation).toBe(
        "Because the loop exits early.",
      );
    }
  });

  it("parses when explanation is absent on a question", () => {
    const result = QuizResponseFrameSchema.safeParse({
      ...BASE,
      payload: { quiz: MINIMAL_QUIZ },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.quiz.questions[0]!.explanation).toBeUndefined();
    }
  });
});
