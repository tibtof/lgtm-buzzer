import type { Result } from "@lgtm-buzzer/protocol";
import { ok } from "@lgtm-buzzer/protocol";

/**
 * Marker version constant for @lgtm-buzzer/core.
 *
 * Placeholder until the first ADR introduces real domain ports
 * (LLMProvider, VCSProvider, QuizPolicy) and the QuizSession / ReviewGate
 * aggregates.
 */
export const CORE_VERSION = "0.0.0" as const;

/** Smoke export that exercises the @lgtm-buzzer/protocol dependency. */
export const ready = (): Result<typeof CORE_VERSION, never> => ok(CORE_VERSION);
