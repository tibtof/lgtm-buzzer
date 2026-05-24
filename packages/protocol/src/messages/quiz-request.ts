import { z } from "zod";
import { EnvelopeBase } from "../base.js";
import { PRIdentifierSchema } from "./pr-identifier.js";

/**
 * Zod schema for the quiz-request frame payload.
 *
 * @remarks
 * Contains `pr`, `questionCount`, and optional adapter selection fields.
 * MUST NOT be extended with PR description, title, commits, comments, or any
 * other non-diff content without a dedicated ADR.
 * The diff-only invariant (CLAUDE.md §Key differentiator) is enforced at the
 * type level.
 *
 * As of ADR-29, the `credentials` field is REMOVED from the wire format.
 * Credentials are resolved host-side by the `CredentialResolver`. A stale
 * extension that still sends a `credentials` field will have it silently
 * ignored by the host (zod passthrough default).
 */
export const QuizRequestPayloadSchema = z.object({
  pr: PRIdentifierSchema,
  questionCount: z.number().int().min(1).max(10),
  /**
   * Stable LLM adapter ID.
   *
   * Optional — when absent the host defaults to `"claude-cli"` (M2 behaviour preserved).
   * Minimum length 1 to reject empty strings.
   */
  llmAdapterId: z.string().min(1).optional(),
  /**
   * Stable VCS adapter ID.
   *
   * Optional — when absent the host defaults to `"github"` (M2 behaviour preserved).
   * As of ADR-29, the service worker infers this from `pr.kind`; the host default
   * acts as a belt-and-suspenders fallback.
   * Minimum length 1 to reject empty strings.
   */
  vcsAdapterId: z.string().min(1).optional(),
  // REMOVED (ADR-29): credentials field. Credentials are resolved host-side.
  // Stale extensions that still send credentials have them silently ignored
  // (zod passthrough). The host dispatcher never reads payload.credentials.
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
