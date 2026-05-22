import { z } from "zod";
import { EnvelopeBase } from "../base.js";
import { PRIdentifierSchema } from "./pr-identifier.js";
import { CredentialsBagSchema } from "./credentials.js";

/**
 * Zod schema for the quiz-request frame payload.
 *
 * @remarks
 * Contains `pr`, `questionCount`, and optional adapter selection + credentials fields
 * introduced by ADR-22. MUST NOT be extended with PR description, title, commits,
 * comments, or any other non-diff content without a dedicated ADR.
 * The diff-only invariant (CLAUDE.md §Key differentiator) is enforced at the type level.
 *
 * `credentials` carries user-supplied identity for VCS / LLM access. It is NOT
 * diff-derived and MUST be treated as sensitive: redacted in logs, never echoed in
 * error payloads. The host validates per-adapter shape in its registry layer.
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
   * Minimum length 1 to reject empty strings.
   */
  vcsAdapterId: z.string().min(1).optional(),
  /**
   * Per-adapter credentials bag. Validated by the host's registry per adapter ID.
   *
   * SECURITY: MUST NOT appear in logs or error payloads. The host's ADR-6 REDACT_PATHS
   * list censors `payload.credentials`, `*.credentials`, `*.apiKey`, `*.pat`.
   */
  credentials: CredentialsBagSchema.optional(),
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
