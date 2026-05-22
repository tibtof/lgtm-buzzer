import type { IO } from "monadyssey";
import type { Quiz } from "../quiz/quiz.js";
import type { LLMProviderError } from "../quiz/errors.js";
import type { Diff } from "./vcs-provider.js";

/** Re-export of the canonical branded Diff type from the VCSProvider port (ADR-12). */
export type { Diff } from "./vcs-provider.js";

/**
 * Diff-only invariant (binding per CLAUDE.md §Key differentiator).
 * Exactly two fields. No slot for PR description, title, commits,
 * labels, comments. Reviewer rejects any change that adds one.
 */
export type GenerateQuizInput = {
  readonly diff: Diff;
  readonly questionCount: number;
};

/**
 * Port contract for LLM-backed quiz generation.
 *
 * `generateQuiz` receives only `GenerateQuizInput` — a diff and a question
 * count. No PR description, title, commit messages, or labels may flow
 * into the LLM prompt through this port. Adapters implementing this port
 * MUST reference `input.diff` and `input.questionCount` only when
 * constructing the prompt. This invariant is enforced at the type level
 * (no slot exists for non-diff text), in TSDoc (this comment), and by the
 * reviewer on every adapter PR.
 *
 * Cancellation note (ADR-10): at monadyssey@2.0.1, cancellation is
 * delivered as the `Cancelled` runtime outcome (not as `Err<LLMProviderError>`).
 * The `cancelled` variant of `LLMProviderError` is kept for type-contract
 * completeness and forward-compat with a future monadyssey that surfaces
 * cancellation via `Err`. Adapters MUST NOT construct `cancelled` from a
 * `SpawnError.cancelled` — that code path is unreachable at this version.
 */
export type LLMProvider = {
  readonly id: string;
  readonly generateQuiz: (input: GenerateQuizInput) => IO<LLMProviderError, Quiz>;
};
