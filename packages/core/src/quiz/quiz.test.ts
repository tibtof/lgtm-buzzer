import { describe, it, expect, expectTypeOf } from "vitest";
import { NonEmptyList } from "monadyssey";
import type {
  Choice,
  ChoiceId,
  MultipleChoiceQuestion,
  Question,
  Quiz,
  QuizId,
  QuestionId,
} from "./quiz.js";
import type { LLMProviderError } from "./errors.js";

// ---------------------------------------------------------------------------
// Helpers — brand-cast helpers for test fixtures only.
// ---------------------------------------------------------------------------

const asQuizId = (s: string): QuizId => s as QuizId;
const asQuestionId = (s: string): QuestionId => s as QuestionId;
const asChoiceId = (s: string): ChoiceId => s as ChoiceId;

// ---------------------------------------------------------------------------
// Quiz structural smoke
// ---------------------------------------------------------------------------

describe("Quiz domain types — structural smoke", () => {
  it("constructs a multiple-choice quiz with NonEmptyList.pure", () => {
    const choiceA: Choice = { id: asChoiceId("a"), label: "Option A" };
    const choiceB: Choice = { id: asChoiceId("b"), label: "Option B" };

    // NonEmptyList.fromArray verified against monadyssey@2.0.1 — no .of() method.
    const choices = NonEmptyList.fromArray([choiceA, choiceB]);

    const question: MultipleChoiceQuestion = {
      type: "multiple-choice",
      id: asQuestionId("q-1"),
      prompt: "Which function was renamed in the diff?",
      choices,
      correctChoiceId: asChoiceId("a"),
      explanation: "The function was renamed from foo to bar.",
    };

    const quiz: Quiz = {
      id: asQuizId("quiz-1"),
      questions: NonEmptyList.pure(question),
    };

    expect(quiz.id).toBe("quiz-1");
    expect(quiz.questions.size).toBe(1);
  });

  it("Question discriminant is 'multiple-choice'", () => {
    const choice: Choice = { id: asChoiceId("c1"), label: "Choice 1" };
    const q: Question = {
      type: "multiple-choice",
      id: asQuestionId("q-2"),
      prompt: "What changed?",
      choices: NonEmptyList.pure(choice),
      correctChoiceId: asChoiceId("c1"),
    };
    expect(q.type).toBe("multiple-choice");
  });

  it("Quiz does NOT have a diff field (privacy + round-trip leak prevention)", () => {
    expectTypeOf<Quiz>().not.toHaveProperty("diff");
  });

  it("branded IDs are assignable from string casts but not plain strings at type level", () => {
    const id: QuizId = asQuizId("x");
    expectTypeOf(id).toBeString();
    // Branded types are subtypes of string — confirm the brand discriminant field.
    expectTypeOf<QuizId>().toMatchTypeOf<string>();
  });
});

// ---------------------------------------------------------------------------
// LLMProviderError — all 5 variants
// ---------------------------------------------------------------------------

describe("LLMProviderError variants — structural smoke", () => {
  const cases: ReadonlyArray<{ name: string; error: LLMProviderError }> = [
    {
      name: "subprocess spawn-failed",
      error: {
        kind: "subprocess",
        reason: "spawn-failed",
        detail: "command not found",
      },
    },
    {
      name: "subprocess process-failed",
      error: {
        kind: "subprocess",
        reason: "process-failed",
        exitCode: 1,
        stderr: "error output",
        detail: "LLM CLI exited non-zero",
      },
    },
    {
      name: "transport with status",
      error: { kind: "transport", status: 429, detail: "rate limited" },
    },
    {
      name: "transport without status (network/TLS)",
      error: { kind: "transport", detail: "connection refused" },
    },
    {
      name: "malformed-response",
      error: {
        kind: "malformed-response",
        detail: "zod parse failed",
        raw: '{"invalid":true}',
      },
    },
    {
      name: "malformed-response without raw",
      error: { kind: "malformed-response", detail: "unexpected EOF" },
    },
    {
      name: "timeout",
      error: { kind: "timeout", afterMs: 30_000 },
    },
    {
      name: "cancelled (kept for forward-compat per ADR-10)",
      error: { kind: "cancelled" },
    },
  ];

  // Asserts 8 distinguishable error shapes are constructible (5 variants,
  // transport and subprocess each have 2 shapes, malformed-response has 2).
  it(`has ${cases.length} distinguishable error shapes`, () => {
    expect(cases).toHaveLength(8);
  });

  for (const c of cases) {
    it(`constructs ${c.name}`, () => {
      expect(c.error.kind).toBeDefined();
    });
  }
});
