import type { Either } from "monadyssey";
import { Left, Right } from "monadyssey";
import type { ChoiceId, QuestionId, Quiz } from "./quiz.js";

/**
 * A single answer submitted by the user for one quiz question.
 */
export type SubmittedAnswer = {
  readonly questionId: QuestionId;
  readonly chosenChoiceId: ChoiceId;
};

/**
 * The full set of answers submitted by the user for a quiz.
 * Partial submissions are allowed; unanswered questions are counted incorrect.
 */
export type SubmittedAnswers = ReadonlyArray<SubmittedAnswer>;

/**
 * Maps each QuestionId to the correct ChoiceId for that question.
 * Produced by `pickCorrectAnswers` and stored host-side between quiz generation and submission.
 */
export type AnswerKey = ReadonlyMap<QuestionId, ChoiceId>;

/**
 * The correctness result for a single question within a scored submission.
 * explanation is NOT populated here; callers attach it from the original Quiz
 * when building the wire frame.
 */
export type PerQuestionResult = {
  readonly questionId: QuestionId;
  readonly correct: boolean;
  readonly explanation?: string;
};

/**
 * The result of scoring a full submission against an answer key.
 */
export type Score = {
  readonly correct: number;
  readonly total: number;
  readonly perQuestion: ReadonlyArray<PerQuestionResult>;
};

/**
 * Error variants for `scoreSubmission`.
 * - `unknown-question-id`: the submission references a questionId not in the answer key
 *   (stale UI, tampering, or off-by-one).
 * - `duplicate-question-id`: the submission contains the same questionId more than once
 *   (ambiguous intent).
 */
export type ScoreError =
  | { readonly kind: "unknown-question-id"; readonly questionId: QuestionId }
  | { readonly kind: "duplicate-question-id"; readonly questionId: QuestionId };

/**
 * Extract the correct-answer key from a Quiz.
 *
 * Iterates `quiz.questions` in insertion order and builds a Map from
 * `QuestionId` to the correct `ChoiceId`. Pure — no side effects.
 *
 * @param quiz - The quiz whose correct answers should be extracted.
 * @returns A ReadonlyMap of QuestionId → correct ChoiceId, in question order.
 */
export const pickCorrectAnswers = (quiz: Quiz): AnswerKey => {
  const map = new Map<QuestionId, ChoiceId>();
  for (const question of quiz.questions.toArray()) {
    map.set(question.id, question.correctChoiceId);
  }
  return map;
};

/**
 * Score a submission against an answer key.
 *
 * - Unknown questionId in submission → `Left<unknown-question-id>`.
 * - Duplicate questionId in submission → `Left<duplicate-question-id>`.
 * - Unanswered question (not in submission) → counted incorrect.
 * - Wrong chosenChoiceId → `correct: false`.
 * - perQuestion order matches answerKey insertion order.
 *
 * @param answerKey - The correct answers produced by `pickCorrectAnswers`.
 * @param submitted - The answers submitted by the user.
 * @returns `Right<Score>` on success or `Left<ScoreError>` on validation failure.
 */
export const scoreSubmission = (
  answerKey: AnswerKey,
  submitted: SubmittedAnswers,
): Either<ScoreError, Score> => {
  // Validate submitted answers: detect unknowns and duplicates.
  const seen = new Set<QuestionId>();
  for (const answer of submitted) {
    if (!answerKey.has(answer.questionId)) {
      return Left.pure<ScoreError>({
        kind: "unknown-question-id",
        questionId: answer.questionId,
      });
    }
    if (seen.has(answer.questionId)) {
      return Left.pure<ScoreError>({
        kind: "duplicate-question-id",
        questionId: answer.questionId,
      });
    }
    seen.add(answer.questionId);
  }

  // Build a lookup map for O(1) access per question.
  const submittedMap = new Map<QuestionId, ChoiceId>();
  for (const answer of submitted) {
    submittedMap.set(answer.questionId, answer.chosenChoiceId);
  }

  // Score each question in answerKey insertion order.
  const perQuestion: PerQuestionResult[] = [];
  let correct = 0;

  for (const [questionId, correctChoiceId] of answerKey) {
    const chosenChoiceId = submittedMap.get(questionId);
    const isCorrect = chosenChoiceId === correctChoiceId;
    if (isCorrect) {
      correct += 1;
    }
    perQuestion.push({ questionId, correct: isCorrect });
  }

  return Right.pure<Score>({
    correct,
    total: answerKey.size,
    perQuestion,
  });
};

/**
 * Determine whether a score constitutes a passing result.
 *
 * Pass condition: `correct / total >= threshold`.
 * A total of 0 always returns `false` (defensive — empty quiz should not gate-pass).
 *
 * @param score - The scored submission.
 * @param threshold - Fractional pass threshold in [0, 1]. Defaults to 1.0 (100%).
 * @returns `true` if the score meets or exceeds the threshold, `false` otherwise.
 */
export const decidePassed = (score: Score, threshold = 1.0): boolean => {
  if (score.total === 0) return false;
  return score.correct / score.total >= threshold;
};
