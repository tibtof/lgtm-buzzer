import { z } from "zod";
import { EnvelopeBase } from "../base.js";

/**
 * Zod schema for a single answer choice in a quiz question.
 */
export const ChoiceDTOSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

/** A single answer choice. */
export type ChoiceDTO = z.infer<typeof ChoiceDTOSchema>;

/**
 * Zod schema for a single quiz question sent to the extension.
 *
 * @remarks
 * BINDING (gate integrity): this schema MUST NOT include a `correctChoiceId` field.
 * The host retains correct answers server-side keyed by quiz ID and scores on submit.
 * Adding `correctChoiceId` here would let extension JS read the answer directly from
 * the wire frame, defeating the review gate entirely.
 *
 * The `explanation` field is post-submit display copy; it MUST NOT be a giveaway of
 * the correct choice and MUST NOT vary based on the submitted answer (that would allow
 * attackers to diff explanations to deduce correct answers).
 *
 * `type: "multiple-choice"` discriminant mirrors `core.Question`'s v1 shape and
 * reserves the slot for a v2 free-text variant without a `PROTOCOL_VERSION` bump.
 */
export const QuestionDTOSchema = z.object({
  type: z.literal("multiple-choice"),
  id: z.string().min(1),
  prompt: z.string().min(1),
  choices: z.array(ChoiceDTOSchema).min(1),
  explanation: z.string().min(1).optional(),
});

/** A single quiz question (correct answer absent — see gate-integrity remarks). */
export type QuestionDTO = z.infer<typeof QuestionDTOSchema>;

/**
 * Zod schema for the full quiz data transfer object.
 *
 * @remarks
 * MUST NOT be extended with PR description, title, commits, comments, or any
 * other non-diff content without a dedicated ADR.
 */
export const QuizDTOSchema = z.object({
  id: z.string().min(1),
  questions: z.array(QuestionDTOSchema).min(1),
});

/** The full quiz sent to the extension (correct answers absent). */
export type QuizDTO = z.infer<typeof QuizDTOSchema>;

/** Zod schema for the quiz-response frame payload. */
export const QuizResponsePayloadSchema = z.object({
  quiz: QuizDTOSchema,
});

/** Payload of a quiz-response frame. */
export type QuizResponsePayload = z.infer<typeof QuizResponsePayloadSchema>;

/** Zod schema for a complete quiz-response frame. */
export const QuizResponseFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("quiz-response"),
  payload: QuizResponsePayloadSchema,
});

/** A well-formed quiz-response frame after parsing. */
export type QuizResponseFrame = z.infer<typeof QuizResponseFrameSchema>;
