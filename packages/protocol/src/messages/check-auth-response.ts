import { z } from "zod";
import { EnvelopeBase } from "../base.js";

/**
 * Per-adapter authentication status returned by the host.
 *
 * SECURITY (binding): `detail` and `hint` MUST contain only human-readable
 * step labels and remediation copy — NEVER secret bytes, NEVER env-var VALUES.
 * Acceptable: `"via GITHUB_TOKEN env"`, `"Run \`gh auth login\`"`.
 * Forbidden: `"GITHUB_TOKEN=ghp_xxx"`, any prefix/suffix of a token.
 *
 * Both optional strings are limited to 200 characters to prevent accidental
 * token-in-detail bugs (enforced by schema).
 */
export const AuthStatusSchema = z.object({
  /** The adapter ID this status row describes (e.g. `"github"`, `"claude-cli"`). */
  adapterId: z.string().min(1),
  /** Whether credential resolution succeeded for this adapter. */
  ok: z.boolean(),
  /**
   * Short human-readable description of how the credential was resolved
   * (on success) or what was attempted (on failure). MAX 200 chars.
   * NEVER includes the secret bytes.
   */
  detail: z.string().min(1).max(200).optional(),
  /**
   * Remediation hint shown to the user on `ok: false`. MAX 200 chars.
   * NEVER includes secret bytes or env-var values.
   */
  hint: z.string().min(1).max(200).optional(),
});

/** Per-adapter authentication status. */
export type AuthStatus = z.infer<typeof AuthStatusSchema>;

/**
 * Zod schema for the check-auth-response payload.
 *
 * `statuses` contains one row per registered adapter. Resolution failures
 * are individual `ok: false` rows — they do NOT fail the entire response.
 */
export const CheckAuthResponsePayloadSchema = z.object({
  statuses: z.array(AuthStatusSchema),
});

/** Payload of a check-auth-response frame. */
export type CheckAuthResponsePayload = z.infer<typeof CheckAuthResponsePayloadSchema>;

/** Zod schema for a complete check-auth-response frame. */
export const CheckAuthResponseFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("check-auth-response"),
  payload: CheckAuthResponsePayloadSchema,
});

/** A well-formed check-auth-response frame after parsing. */
export type CheckAuthResponseFrame = z.infer<typeof CheckAuthResponseFrameSchema>;
