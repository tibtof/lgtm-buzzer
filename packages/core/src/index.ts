import type { Either } from "monadyssey";
import { Right } from "monadyssey";

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
