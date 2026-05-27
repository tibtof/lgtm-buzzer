import { z } from "zod";
import { EnvelopeBase } from "../base.js";

/**
 * The set of observable phases the host emits progress for.
 *
 * One-way: host → SW. MUST NOT carry diff bytes, PR title, partial quiz
 * content, or any other non-metadata. ADR-32 §Diff-only invariant.
 */
export const QuizProgressPhaseSchema = z.enum([
  "fetching-diff",
  "generating-quiz",
  "parsing",
  "caching",
]);

/** A phase label from the host's quiz-progress heartbeat. */
export type QuizProgressPhase = z.infer<typeof QuizProgressPhaseSchema>;

/**
 * Payload of a `quiz-progress` frame.
 *
 * BINDING (diff-only invariant): this schema lists the EXACT allowed fields.
 * No `partial`, no `questionsGenerated`, no `diffPreview`, no `prTitle`.
 * Extra fields are stripped by zod's default passthrough=false (strip mode).
 */
export const QuizProgressPayloadSchema = z.object({
  phase: QuizProgressPhaseSchema,
  /** Milliseconds since the host started handling the originating quiz-request. */
  elapsedMs: z.number().int().min(0),
  /**
   * Optional host-side ETA hint.
   * v1: always absent — the modal uses its own historical median.
   */
  expectedMs: z.number().int().min(0).optional(),
});

/** Payload of a `quiz-progress` heartbeat frame. */
export type QuizProgressPayload = z.infer<typeof QuizProgressPayloadSchema>;

/**
 * A one-way `quiz-progress` frame emitted by the host during quiz generation.
 *
 * The SW MUST NOT reply to this frame. Receiving it neither resolves nor
 * rejects the pending correlation map entry for the originating quiz-request.
 */
export const QuizProgressFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("quiz-progress"),
  payload: QuizProgressPayloadSchema,
});

/** A well-formed `quiz-progress` frame after parsing. */
export type QuizProgressFrame = z.infer<typeof QuizProgressFrameSchema>;
