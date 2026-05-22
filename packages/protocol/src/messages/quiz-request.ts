import { z } from "zod";
import { EnvelopeBase } from "../base.js";
import { PRIdentifierSchema } from "./pr-identifier.js";

/**
 * Zod schema for the quiz-request frame payload.
 *
 * @remarks
 * Contains ONLY `pr` and `questionCount`. MUST NOT be extended with PR description,
 * title, commits, comments, or any other non-diff content without a dedicated ADR.
 * The diff-only invariant (CLAUDE.md §Key differentiator) is enforced at the type level.
 */
export const QuizRequestPayloadSchema = z.object({
  pr: PRIdentifierSchema,
  questionCount: z.number().int().min(1).max(10),
});

/** Payload of a quiz-request frame. */
export type QuizRequestPayload = z.infer<typeof QuizRequestPayloadSchema>;

/** Zod schema for a complete quiz-request frame. */
export const QuizRequestFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("quiz-request"),
  payload: QuizRequestPayloadSchema,
});

/** A well-formed quiz-request frame after parsing. */
export type QuizRequestFrame = z.infer<typeof QuizRequestFrameSchema>;
