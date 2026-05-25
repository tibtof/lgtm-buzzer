import { z } from "zod";
import { EnvelopeBase } from "../base.js";

/**
 * Shared prefix for all "resample failed" error messages sent by the host.
 *
 * Imported by both the host dispatcher and the extension quiz-flow to detect
 * resample-specific failures without introducing a new `ErrorReason` variant.
 * ADR-30 §Errors.
 */
export const RESAMPLE_FAILED_PREFIX = "resample failed:" as const;

/**
 * Zod schema for the quiz-resample-request frame payload.
 *
 * @remarks
 * Asks the host to resample a new set of questions from the pool that
 * produced the given `quizId`. The reply is a normal `quiz-response` frame
 * with a fresh `quizId`. ADR-30.
 */
export const QuizResampleRequestPayloadSchema = z.object({
  /** The sample quizId returned in a prior quiz-response. */
  quizId: z.string().min(1),
  /** How many questions to return in the new sample. */
  questionCount: z.number().int().min(1).max(10),
});

/** Payload of a quiz-resample-request frame. */
export type QuizResampleRequestPayload = z.infer<
  typeof QuizResampleRequestPayloadSchema
>;

/** Zod schema for a complete quiz-resample-request frame. */
export const QuizResampleRequestFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("quiz-resample-request"),
  payload: QuizResampleRequestPayloadSchema,
});

/** A well-formed quiz-resample-request frame after parsing. */
export type QuizResampleRequestFrame = z.infer<
  typeof QuizResampleRequestFrameSchema
>;
