import { z } from "zod";
import { EnvelopeBase } from "../base.js";

/**
 * Zod schema for a single submitted answer.
 */
export const SubmittedAnswerSchema = z.object({
  questionId: z.string().min(1),
  chosenChoiceId: z.string().min(1),
});

/** A single submitted answer. */
export type SubmittedAnswer = z.infer<typeof SubmittedAnswerSchema>;

/**
 * Zod schema for the quiz-submit frame payload.
 *
 * @remarks
 * `quizId` correlates back to the quiz issued in the quiz-response frame.
 * If the host does not recognise `quizId`, it responds with an `ErrorFrame`
 * carrying `reason: "unknown-quiz-id"`. Partial submits (fewer answers than
 * questions) are permitted at the wire level; whether the host accepts them
 * is policy (#38).
 *
 * MUST NOT be extended with PR description, title, commits, or comments
 * without a dedicated ADR.
 */
export const QuizSubmitPayloadSchema = z.object({
  quizId: z.string().min(1),
  answers: z.array(SubmittedAnswerSchema).min(1),
});

/** Payload of a quiz-submit frame. */
export type QuizSubmitPayload = z.infer<typeof QuizSubmitPayloadSchema>;

/** Zod schema for a complete quiz-submit frame. */
export const QuizSubmitFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("quiz-submit"),
  payload: QuizSubmitPayloadSchema,
});

/** A well-formed quiz-submit frame after parsing. */
export type QuizSubmitFrame = z.infer<typeof QuizSubmitFrameSchema>;
