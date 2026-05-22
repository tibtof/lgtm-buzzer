import type { Diff } from "@lgtm-buzzer/core";
import { SYSTEM_PROMPT as SYSTEM_PROMPT_SHARED, buildUserMessage } from "@lgtm-buzzer/adapter-shared";

/**
 * The system instruction injected before every quiz-generation call.
 *
 * Re-exported from `@lgtm-buzzer/adapter-shared` — single source of truth
 * for the system prompt (ADR-20 §3). Do NOT modify without an ADR amendment.
 */
export const SYSTEM_PROMPT = SYSTEM_PROMPT_SHARED;

/**
 * Assembles the full stdin payload for one claude-cli quiz-generation call.
 *
 * The diff is carried ONLY through stdin — never in argv. This is the
 * mechanically-enforced diff-only invariant (ADR-14 §Decision 2).
 * The signature is exactly 2 parameters; adding a third requires an ADR
 * amendment.
 *
 * @param diff - The unified diff (arrives from a VCS adapter as a `Diff` brand).
 * @param questionCount - Number of questions to request from the model.
 * @returns A complete prompt string suitable for piping to claude's stdin.
 */
export const buildPrompt = (diff: Diff, questionCount: number): string =>
  `${SYSTEM_PROMPT}\n\nUSER:\n${buildUserMessage(diff, questionCount)}\n`;
