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
 * Sub-step stage within the `generating-quiz` phase (ADR-36).
 *
 * - `"thinking"` — the LLM has received the prompt and is working.
 * - `"writing"` — the LLM is producing visible output (assistant text seen).
 *
 * Only emitted by adapters that support streaming (claude-cli in v1).
 * Codex/copilot/claude-api fall back to the coarse `generating-quiz` phase
 * without a stage. MUST NOT carry raw stream text.
 */
export const QuizGenerationStageSchema = z.enum(["thinking", "writing"]);

/** A sub-step stage label from the LLM streaming adapter. */
export type QuizGenerationStage = z.infer<typeof QuizGenerationStageSchema>;

/**
 * Payload of a `quiz-progress` frame.
 *
 * BINDING (diff-only invariant): this schema lists the EXACT allowed fields.
 * No `partial`, no `diffPreview`, no `prTitle`, no raw stream text.
 * Extra fields are stripped by zod's default passthrough=false (strip mode).
 *
 * ADR-36: `stage` and `questionsWritten` are the ONLY new fields. Both are
 * optional (strip mode) so old extensions silently ignore them and old hosts
 * produce frames that new extensions parse without the new fields.
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
  /**
   * ADR-36: sub-step stage within `generating-quiz` (optional).
   * Absent for all other phases and for adapters that cannot stream.
   * MUST NOT carry diff bytes or raw stream text — enum only.
   */
  stage: QuizGenerationStageSchema.optional(),
  /**
   * ADR-36: best-effort count of questions written so far (optional).
   * Monotonic, clamped [0, poolSize]. Explicitly approximate — partial
   * JSON delimiters may skew the count. Absent when unknown.
   */
  questionsWritten: z.number().int().min(0).optional(),
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
