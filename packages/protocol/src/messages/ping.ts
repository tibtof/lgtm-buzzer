import { z } from "zod";
import { EnvelopeBase } from "../base.js";

/** Zod schema for the optional ping payload. */
export const PingPayloadSchema = z.object({
  nonce: z.string().min(1).optional(),
});

/** Payload of a ping frame. The `nonce` is caller-chosen and echoed back by the pong. */
export type PingPayload = z.infer<typeof PingPayloadSchema>;

/** Zod schema for a complete ping frame. */
export const PingFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("ping"),
  payload: PingPayloadSchema,
});

/** A well-formed ping frame after parsing. */
export type PingFrame = z.infer<typeof PingFrameSchema>;
