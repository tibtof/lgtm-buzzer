import { z } from "zod";
import { EnvelopeBase } from "../base.js";

/**
 * Zod schema for a per-question scoring result.
 *
 * @remarks
 * `explanation` is the LLM's own output. It MUST NOT vary based on the submitted
 * answer — doing so would allow attackers to diff explanations across submissions
 * to deduce the correct answer.
 */
export const PerQuestionResultSchema = z.object({
  questionId: z.string().min(1),
  correct: z.boolean(),
  explanation: z.string().min(1).optional(),
});

/** Per-question scoring detail. */
export type PerQuestionResult = z.infer<typeof PerQuestionResultSchema>;

/**
 * Zod schema for the quiz-result frame payload.
 *
 * @remarks
 * `perQuestion` is optional; it is present when the host has per-question feedback.
 * MUST NOT be extended with PR description, title, commits, or comments without a
 * dedicated ADR.
 */
export const QuizResultPayloadSchema = z.object({
  passed: z.boolean(),
  correct: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  perQuestion: z.array(PerQuestionResultSchema).optional(),
});

/** Payload of a quiz-result frame. */
export type QuizResultPayload = z.infer<typeof QuizResultPayloadSchema>;

/** Zod schema for a complete quiz-result frame. */
export const QuizResultFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("quiz-result"),
  payload: QuizResultPayloadSchema,
});

/** A well-formed quiz-result frame after parsing. */
export type QuizResultFrame = z.infer<typeof QuizResultFrameSchema>;
