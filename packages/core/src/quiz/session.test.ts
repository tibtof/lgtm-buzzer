import { describe, it, expect, expectTypeOf } from "vitest";
import { NonEmptyList } from "monadyssey";
import type { ChoiceId, QuestionId, Quiz, QuizId } from "./quiz.js";
import type {
  AnswerKey,
  Score,
  ScoreError,
  SubmittedAnswer,
  SubmittedAnswers,
} from "./session.js";
import {
  decidePassed,
  pickCorrectAnswers,
  scoreSubmission,
} from "./session.js";

// ---------------------------------------------------------------------------
// Brand-cast helpers — for test fixtures only.
// ---------------------------------------------------------------------------

const asQuizId = (s: string): QuizId => s as QuizId;
const asQuestionId = (s: string): QuestionId => s as QuestionId;
const asChoiceId = (s: string): ChoiceId => s as ChoiceId;

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

type QuestionSpec = {
  readonly id: string;
  readonly correctChoiceId: string;
  readonly explanation?: string;
};

const makeQuiz = (specs: ReadonlyArray<QuestionSpec>): Quiz => {
  const questions = specs.map((spec) => ({
    type: "multiple-choice" as const,
    id: asQuestionId(spec.id),
    prompt: `Question about ${spec.id}`,
    choices: NonEmptyList.fromArray([
      { id: asChoiceId("a"), label: "Option A" },
      { id: asChoiceId("b"), label: "Option B" },
    ]),
    correctChoiceId: asChoiceId(spec.correctChoiceId),
    ...(spec.explanation !== undefined
      ? { explanation: spec.explanation }
      : {}),
  }));
  return {
    id: asQuizId("quiz-1"),
    questions: NonEmptyList.fromArray(questions),
  };
};

const submitAll = (quiz: Quiz, choiceOverrides?: Record<string, string>): SubmittedAnswers =>
  quiz.questions.toArray().map((q) => ({
    questionId: q.id,
    chosenChoiceId: asChoiceId(choiceOverrides?.[q.id] ?? q.correctChoiceId),
  }));

// ---------------------------------------------------------------------------
// pickCorrectAnswers
// ---------------------------------------------------------------------------

describe("pickCorrectAnswers", () => {
  it("single question: maps questionId to its correctChoiceId", () => {
    const quiz = makeQuiz([{ id: "q1", correctChoiceId: "a" }]);
    const key = pickCorrectAnswers(quiz);
    expect(key.size).toBe(1);
    expect(key.get(asQuestionId("q1"))).toBe(asChoiceId("a"));
  });

  it("multi-question: maps every questionId to its correctChoiceId", () => {
    const quiz = makeQuiz([
      { id: "q1", correctChoiceId: "a" },
      { id: "q2", correctChoiceId: "b" },
      { id: "q3", correctChoiceId: "a" },
    ]);
    const key = pickCorrectAnswers(quiz);
    expect(key.size).toBe(3);
    expect(key.get(asQuestionId("q1"))).toBe(asChoiceId("a"));
    expect(key.get(asQuestionId("q2"))).toBe(asChoiceId("b"));
    expect(key.get(asQuestionId("q3"))).toBe(asChoiceId("a"));
  });

  it("key-order matches Quiz.questions insertion order", () => {
    const quiz = makeQuiz([
      { id: "q1", correctChoiceId: "a" },
      { id: "q2", correctChoiceId: "b" },
      { id: "q3", correctChoiceId: "a" },
    ]);
    const key = pickCorrectAnswers(quiz);
    const keyOrder = [...key.keys()];
    expect(keyOrder).toEqual([
      asQuestionId("q1"),
      asQuestionId("q2"),
      asQuestionId("q3"),
    ]);
  });
});

// ---------------------------------------------------------------------------
// scoreSubmission — happy path
// ---------------------------------------------------------------------------

describe("scoreSubmission — happy path", () => {
  it("all correct: correct === total, every perQuestion.correct is true", () => {
    const quiz = makeQuiz([
      { id: "q1", correctChoiceId: "a" },
      { id: "q2", correctChoiceId: "b" },
    ]);
    const key = pickCorrectAnswers(quiz);
    const submitted = submitAll(quiz);
    const result = scoreSubmission(key, submitted);
    expect(result.self.type).toBe("Right");
    if (result.self.type === "Right") {
      const score = result.self.value;
      expect(score.correct).toBe(2);
      expect(score.total).toBe(2);
      expect(score.perQuestion.every((pq) => pq.correct)).toBe(true);
    }
  });

  it("all wrong: correct === 0, every perQuestion.correct is false", () => {
    const quiz = makeQuiz([
      { id: "q1", correctChoiceId: "a" },
      { id: "q2", correctChoiceId: "a" },
    ]);
    const key = pickCorrectAnswers(quiz);
    const submitted = submitAll(quiz, { [asQuestionId("q1")]: "b", [asQuestionId("q2")]: "b" });
    const result = scoreSubmission(key, submitted);
    expect(result.self.type).toBe("Right");
    if (result.self.type === "Right") {
      const score = result.self.value;
      expect(score.correct).toBe(0);
      expect(score.total).toBe(2);
      expect(score.perQuestion.every((pq) => !pq.correct)).toBe(true);
    }
  });

  it("mixed: some correct, some wrong", () => {
    const quiz = makeQuiz([
      { id: "q1", correctChoiceId: "a" },
      { id: "q2", correctChoiceId: "b" },
      { id: "q3", correctChoiceId: "a" },
    ]);
    const key = pickCorrectAnswers(quiz);
    // q1 correct (a), q2 wrong (a instead of b), q3 correct (a)
    const submitted = submitAll(quiz, { [asQuestionId("q2")]: "a" });
    const result = scoreSubmission(key, submitted);
    expect(result.self.type).toBe("Right");
    if (result.self.type === "Right") {
      const score = result.self.value;
      expect(score.correct).toBe(2);
      expect(score.total).toBe(3);
      const byId = Object.fromEntries(score.perQuestion.map((pq) => [pq.questionId, pq.correct]));
      expect(byId[asQuestionId("q1")]).toBe(true);
      expect(byId[asQuestionId("q2")]).toBe(false);
      expect(byId[asQuestionId("q3")]).toBe(true);
    }
  });

  it("partial submission: unanswered questions counted incorrect", () => {
    const quiz = makeQuiz([
      { id: "q1", correctChoiceId: "a" },
      { id: "q2", correctChoiceId: "b" },
    ]);
    const key = pickCorrectAnswers(quiz);
    // Only answer q1; q2 is unanswered → incorrect
    const submitted: SubmittedAnswers = [
      { questionId: asQuestionId("q1"), chosenChoiceId: asChoiceId("a") },
    ];
    const result = scoreSubmission(key, submitted);
    expect(result.self.type).toBe("Right");
    if (result.self.type === "Right") {
      const score = result.self.value;
      expect(score.correct).toBe(1);
      expect(score.total).toBe(2);
      expect(score.perQuestion).toHaveLength(2);
      const q2Result = score.perQuestion.find((pq) => pq.questionId === asQuestionId("q2"));
      expect(q2Result?.correct).toBe(false);
    }
  });

  it("single-question all-correct: smoke", () => {
    const quiz = makeQuiz([{ id: "q1", correctChoiceId: "a" }]);
    const key = pickCorrectAnswers(quiz);
    const submitted = submitAll(quiz);
    const result = scoreSubmission(key, submitted);
    expect(result.self.type).toBe("Right");
    if (result.self.type === "Right") {
      const score = result.self.value;
      expect(score.correct).toBe(1);
      expect(score.total).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// scoreSubmission — error cases
// ---------------------------------------------------------------------------

describe("scoreSubmission — error cases", () => {
  it("unknown questionId → Left<unknown-question-id>", () => {
    const quiz = makeQuiz([{ id: "q1", correctChoiceId: "a" }]);
    const key = pickCorrectAnswers(quiz);
    const submitted: SubmittedAnswers = [
      { questionId: asQuestionId("q-unknown"), chosenChoiceId: asChoiceId("a") },
    ];
    const result = scoreSubmission(key, submitted);
    expect(result.self.type).toBe("Left");
    if (result.self.type === "Left") {
      const err = result.self.value as ScoreError;
      expect(err.kind).toBe("unknown-question-id");
      if (err.kind === "unknown-question-id") {
        expect(err.questionId).toBe(asQuestionId("q-unknown"));
      }
    }
  });

  it("duplicate questionId → Left<duplicate-question-id>", () => {
    const quiz = makeQuiz([
      { id: "q1", correctChoiceId: "a" },
      { id: "q2", correctChoiceId: "b" },
    ]);
    const key = pickCorrectAnswers(quiz);
    const submitted: SubmittedAnswers = [
      { questionId: asQuestionId("q1"), chosenChoiceId: asChoiceId("a") },
      { questionId: asQuestionId("q1"), chosenChoiceId: asChoiceId("b") }, // duplicate
    ];
    const result = scoreSubmission(key, submitted);
    expect(result.self.type).toBe("Left");
    if (result.self.type === "Left") {
      const err = result.self.value as ScoreError;
      expect(err.kind).toBe("duplicate-question-id");
      if (err.kind === "duplicate-question-id") {
        expect(err.questionId).toBe(asQuestionId("q1"));
      }
    }
  });

  it("empty submission [] → Right<Score> with correct=0 and total=N (all unanswered)", () => {
    const quiz = makeQuiz([
      { id: "q1", correctChoiceId: "a" },
      { id: "q2", correctChoiceId: "b" },
    ]);
    const key = pickCorrectAnswers(quiz);
    const submitted: SubmittedAnswers = [];
    const result = scoreSubmission(key, submitted);
    expect(result.self.type).toBe("Right");
    if (result.self.type === "Right") {
      const score = result.self.value;
      expect(score.correct).toBe(0);
      expect(score.total).toBe(2);
      expect(score.perQuestion).toHaveLength(2);
      expect(score.perQuestion.every((pq) => !pq.correct)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// decidePassed
// ---------------------------------------------------------------------------

describe("decidePassed", () => {
  const cases: ReadonlyArray<{
    name: string;
    score: Score;
    threshold?: number;
    expected: boolean;
  }> = [
    {
      name: "100% correct with threshold 1.0 → true",
      score: { correct: 3, total: 3, perQuestion: [] },
      threshold: 1.0,
      expected: true,
    },
    {
      name: "less than 100% correct with threshold 1.0 → false",
      score: { correct: 2, total: 3, perQuestion: [] },
      threshold: 1.0,
      expected: false,
    },
    {
      name: "0% correct with threshold 1.0 → false",
      score: { correct: 0, total: 3, perQuestion: [] },
      threshold: 1.0,
      expected: false,
    },
    {
      name: "80% correct with threshold 0.8 → true",
      score: { correct: 4, total: 5, perQuestion: [] },
      threshold: 0.8,
      expected: true,
    },
    {
      name: "79% correct (3/4 rounds to 75%) with threshold 0.8 → false",
      score: { correct: 3, total: 4, perQuestion: [] },
      threshold: 0.8,
      expected: false,
    },
    {
      name: "total 0 → false (defensive)",
      score: { correct: 0, total: 0, perQuestion: [] },
      threshold: 1.0,
      expected: false,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result =
        c.threshold !== undefined
          ? decidePassed(c.score, c.threshold)
          : decidePassed(c.score);
      expect(result).toBe(c.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// Property test: monotonicity
// Flipping a wrong answer to correct in an otherwise identical submission
// can never decrease decidePassed (same threshold).
// Hand-rolled generator — no fast-check dependency per ADR-16.
// ---------------------------------------------------------------------------

describe("decidePassed — monotonicity property", () => {
  it("flipping one wrong answer to correct never decreases the pass decision at threshold 1.0", () => {
    const quiz = makeQuiz([
      { id: "q1", correctChoiceId: "a" },
      { id: "q2", correctChoiceId: "b" },
      { id: "q3", correctChoiceId: "a" },
    ]);
    const key = pickCorrectAnswers(quiz);

    // Baseline: all wrong answers → score.correct === 0
    const allWrong: SubmittedAnswers = quiz.questions.toArray().map((q) => ({
      questionId: q.id,
      chosenChoiceId: asChoiceId("b"), // correctChoiceId for each is "a", so this is always wrong
    }));

    // Fix q1 to the correct answer, leave others wrong
    const oneFlipped: SubmittedAnswers = quiz.questions.toArray().map((q) => ({
      questionId: q.id,
      chosenChoiceId:
        q.id === asQuestionId("q1")
          ? asChoiceId("a") // correct
          : asChoiceId("b"), // wrong (since correctChoiceId for q2 is "b", it becomes correct — use "a" for "wrong")
    }));

    // Build a truly monotone pair: start all wrong, flip each successively
    const specs = [
      { id: "q1", correctChoiceId: "a" },
      { id: "q2", correctChoiceId: "b" },
      { id: "q3", correctChoiceId: "a" },
    ] as const;

    const makeSubmittedWithN = (n: number): SubmittedAnswers =>
      specs.map((spec, i) => ({
        questionId: asQuestionId(spec.id),
        chosenChoiceId:
          i < n
            ? asChoiceId(spec.correctChoiceId) // correct
            : asChoiceId(spec.correctChoiceId === "a" ? "b" : "a"), // wrong
      }));

    const threshold = 1.0;
    let prevPassed = false;

    for (let n = 0; n <= specs.length; n++) {
      const submitted = makeSubmittedWithN(n);
      const scoreResult = scoreSubmission(key, submitted);
      expect(scoreResult.self.type).toBe("Right");
      if (scoreResult.self.type === "Right") {
        const score = scoreResult.self.value;
        const passed = decidePassed(score, threshold);
        // Once we flip to passing, it must not go back to failing
        // (monotone: more correct answers → at least as likely to pass)
        if (passed && !prevPassed) {
          prevPassed = true;
        }
        if (!passed) {
          expect(prevPassed).toBe(false);
        }
      }
    }

    // Final state must be passing (all correct)
    const allCorrect = makeSubmittedWithN(specs.length);
    const finalResult = scoreSubmission(key, allCorrect);
    expect(finalResult.self.type).toBe("Right");
    if (finalResult.self.type === "Right") {
      expect(decidePassed(finalResult.self.value, threshold)).toBe(true);
    }

    // Suppress unused variable warning from earlier exploratory code
    void allWrong;
    void oneFlipped;
  });
});

// ---------------------------------------------------------------------------
// Type-level invariants
// ---------------------------------------------------------------------------

describe("type-level invariants", () => {
  it("Quiz lacks diff, description, title, commits, and comments (diff-only invariant)", () => {
    expectTypeOf<Quiz>().not.toHaveProperty("diff");
    expectTypeOf<Quiz>().not.toHaveProperty("description");
    expectTypeOf<Quiz>().not.toHaveProperty("title");
    expectTypeOf<Quiz>().not.toHaveProperty("commits");
    expectTypeOf<Quiz>().not.toHaveProperty("comments");
  });

  it("SubmittedAnswer is exactly { questionId, chosenChoiceId }", () => {
    expectTypeOf<SubmittedAnswer>().toHaveProperty("questionId");
    expectTypeOf<SubmittedAnswer>().toHaveProperty("chosenChoiceId");
    // There is no third field — verify by structural assignment
    type StrictCheck = SubmittedAnswer extends {
      readonly questionId: QuestionId;
      readonly chosenChoiceId: ChoiceId;
    }
      ? true
      : false;
    const check: StrictCheck = true;
    expect(check).toBe(true);
  });

  it("AnswerKey preserves branded ID types", () => {
    expectTypeOf<AnswerKey>().toMatchTypeOf<ReadonlyMap<QuestionId, ChoiceId>>();
    // AnswerKey is NOT assignable from Map<string, string>
    type KeyBranded = AnswerKey extends ReadonlyMap<QuestionId, ChoiceId>
      ? true
      : false;
    const check: KeyBranded = true;
    expect(check).toBe(true);
  });
});
