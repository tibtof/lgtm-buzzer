import { z } from "zod";
import { EnvelopeBase } from "../base.js";

/** Zod schema for the optional pong payload. Mirrors ping — echoes the nonce when present. */
export const PongPayloadSchema = z.object({
  nonce: z.string().min(1).optional(),
});

/** Payload of a pong frame. The `nonce` echoes the value sent in the corresponding ping. */
export type PongPayload = z.infer<typeof PongPayloadSchema>;

/** Zod schema for a complete pong frame. */
export const PongFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("pong"),
  payload: PongPayloadSchema,
});

/** A well-formed pong frame after parsing. */
export type PongFrame = z.infer<typeof PongFrameSchema>;
