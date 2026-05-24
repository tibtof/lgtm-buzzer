import { z } from "zod";
import { EnvelopeBase } from "../base.js";

/**
 * Zod schema for the check-auth-request payload.
 *
 * The payload is intentionally empty and strict — no fields are expected.
 * The host iterates its registered adapters and resolves credentials for
 * each, returning the status array in the corresponding `check-auth-response`.
 */
export const CheckAuthRequestPayloadSchema = z.object({}).strict();

/** Payload of a check-auth-request frame (empty). */
export type CheckAuthRequestPayload = z.infer<typeof CheckAuthRequestPayloadSchema>;

/** Zod schema for a complete check-auth-request frame. */
export const CheckAuthRequestFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("check-auth-request"),
  payload: CheckAuthRequestPayloadSchema,
});

/** A well-formed check-auth-request frame after parsing. */
export type CheckAuthRequestFrame = z.infer<typeof CheckAuthRequestFrameSchema>;
