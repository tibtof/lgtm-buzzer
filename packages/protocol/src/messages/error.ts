import { z } from "zod";
import { EnvelopeBase } from "../base.js";

/**
 * Zod schema for the structured error reason enum.
 *
 * @remarks
 * `"bad-credentials"` was removed in ADR-29. The host no longer validates
 * per-adapter credential bags from the wire — credentials are resolved
 * host-side. The `"missing-credentials"` reason remains for the case where
 * the host's `CredentialResolver` cannot obtain a credential (e.g., env var
 * absent and CLI not authenticated).
 */
export const ErrorReasonSchema = z.enum([
  "schema-violation",
  "unknown-message",
  "version-mismatch",
  "internal",
  "unknown-quiz-id",
  // adapter registry errors
  "unsupported-llm-adapter",
  "unsupported-vcs-adapter",
  // REMOVED (ADR-29): "bad-credentials" — no wire credential bag to validate.
  "missing-credentials",
]);

/** Discriminated reason for a wire-level error. */
export type ErrorReason = z.infer<typeof ErrorReasonSchema>;

/**
 * Zod schema for the error frame payload.
 *
 * @remarks
 * `message` and `details` MUST NEVER carry diff content (see CLAUDE.md §Key differentiator).
 * The host adapter is responsible for redacting any diff-derived text before populating these
 * fields. The schema documents the contract; enforcement lives at the call site in `host`.
 */
export const ErrorPayloadSchema = z.object({
  reason: ErrorReasonSchema,
  message: z.string().min(1),
  details: z.unknown().optional(),
});

/** Payload of an error frame. See `ErrorPayloadSchema` for the redaction contract. */
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

/** Zod schema for a complete error frame. */
export const ErrorFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("error"),
  payload: ErrorPayloadSchema,
});

/** A well-formed error frame after parsing. */
export type ErrorFrame = z.infer<typeof ErrorFrameSchema>;
