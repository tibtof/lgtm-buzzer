import type { NonEmptyList } from "monadyssey";

/** Branded string that uniquely identifies a quiz question. */
export type QuestionId = string & { readonly __brand: "QuestionId" };

/** Branded string that uniquely identifies a choice within a question. */
export type ChoiceId = string & { readonly __brand: "ChoiceId" };

/** Branded string that uniquely identifies a quiz. */
export type QuizId = string & { readonly __brand: "QuizId" };

/** A single answer choice for a multiple-choice question. */
export type Choice = { readonly id: ChoiceId; readonly label: string };

/**
 * A multiple-choice question.
 *
 * The `type` discriminant reserves space for a future free-text variant.
 * `choices` and `correctChoiceId` are both required — adapters MUST
 * verify that `correctChoiceId` is a member of `choices` before
 * constructing this type; violation is an invariant error (throw).
 */
export type MultipleChoiceQuestion = {
  readonly type: "multiple-choice";
  readonly id: QuestionId;
  readonly prompt: string;
  readonly choices: NonEmptyList<Choice>;
  readonly correctChoiceId: ChoiceId;
  readonly explanation?: string;
};

/** Discriminated union of question variants. Currently multiple-choice only (v1). */
export type Question = MultipleChoiceQuestion;

/**
 * A generated quiz.
 *
 * Does NOT carry the diff — omitting it prevents privacy leakage and
 * round-trip re-feed vectors (ADR-11 §Decision 2).
 */
export type Quiz = { readonly id: QuizId; readonly questions: NonEmptyList<Question> };
