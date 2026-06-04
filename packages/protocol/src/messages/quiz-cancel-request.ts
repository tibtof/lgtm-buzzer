import { z } from "zod";
import { EnvelopeBase } from "../base.js";

/**
 * Payload of a `quiz-cancel-request` frame.
 *
 * BINDING (diff-only invariant): this schema lists the EXACT allowed
 * fields. No `reason`, no `partial`, no PR text. The host MUST NOT
 * derive any prompt from this payload.
 */
export const QuizCancelRequestPayloadSchema = z.object({
  /**
   * Correlation id of the in-flight `quiz-request` to cancel. Must be
   * the same `correlationId` that appears at the envelope level —
   * embedding it in the payload makes the frame self-describing when
   * read from logs or fixtures.
   */
  correlationId: z.string().min(1),
});

/** Payload of a `quiz-cancel-request` frame. */
export type QuizCancelRequestPayload = z.infer<
  typeof QuizCancelRequestPayloadSchema
>;

/**
 * A one-way `quiz-cancel-request` frame (extension → host).
 *
 * The host MUST NOT reply to this frame with a `quiz-cancel-ack`. The
 * originating `quiz-request` either:
 *   (a) terminates with `ErrorFrame { reason: "cancelled" }` when the
 *       fiber is cancelled before completion, or
 *   (b) terminates normally if cancellation arrives after the work
 *       finished (the cancel is a no-op).
 *
 * Either way, the SW maps the terminal frame back through the
 * correlation map exactly once.
 */
export const QuizCancelRequestFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("quiz-cancel-request"),
  payload: QuizCancelRequestPayloadSchema,
});

export type QuizCancelRequestFrame = z.infer<
  typeof QuizCancelRequestFrameSchema
>;
