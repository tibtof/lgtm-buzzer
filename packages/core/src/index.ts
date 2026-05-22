import type { Either } from "monadyssey";
import { Right } from "monadyssey";

export type { LogBindings, LogLevel, Logger } from "./ports/logger.js";
export type { Diff, GenerateQuizInput, LLMProvider } from "./ports/llm-provider.js";
export type { PRIdentifier, VCSProvider, VCSProviderError, UnsupportedURL } from "./ports/vcs-provider.js";
export { parsePRIdentifier } from "./ports/vcs-provider.js";
export type {
  Choice, ChoiceId, MultipleChoiceQuestion, Question,
  QuestionId, Quiz, QuizId,
} from "./quiz/quiz.js";
export type { LLMProviderError } from "./quiz/errors.js";
export type {
  AnswerKey,
  PerQuestionResult,
  Score,
  ScoreError,
  SubmittedAnswer,
  SubmittedAnswers,
} from "./quiz/session.js";
export { decidePassed, pickCorrectAnswers, scoreSubmission } from "./quiz/session.js";

/**
 * Marker version constant for @lgtm-buzzer/core.
 *
 * Placeholder until the first ADR introduces real domain ports
 * (LLMProvider, VCSProvider, QuizPolicy) and the QuizSession / ReviewGate
 * aggregates.
 */
export const CORE_VERSION = "0.0.0" as const;

/** Smoke export that exercises the monadyssey Either dependency. */
export const ready = (): Either<never, typeof CORE_VERSION> =>
  Right.pure(CORE_VERSION);
