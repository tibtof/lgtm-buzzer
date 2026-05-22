import type { ChoiceId, QuestionId, QuizId } from "@lgtm-buzzer/core";

/**
 * Factory for generating branded IDs used when constructing `Quiz` domain
 * objects from parsed LLM responses.
 *
 * Injected into `createCodexCliProvider` so that tests can supply a
 * deterministic counter-based implementation instead of random UUIDs.
 */
export type IdGenerator = {
  readonly quizId: () => QuizId;
  readonly questionId: () => QuestionId;
  readonly choiceId: () => ChoiceId;
};

/**
 * Production `IdGenerator` backed by `crypto.randomUUID()`.
 *
 * @returns An `IdGenerator` that mints UUID v4 values for each brand.
 */
export const defaultIdGenerator = (): IdGenerator => ({
  quizId: () => crypto.randomUUID() as QuizId,
  questionId: () => crypto.randomUUID() as QuestionId,
  choiceId: () => crypto.randomUUID() as ChoiceId,
});
