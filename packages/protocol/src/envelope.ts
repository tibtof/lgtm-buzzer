import { z } from "zod";
import { PingFrameSchema } from "./messages/ping.js";
import { PongFrameSchema } from "./messages/pong.js";
import { ErrorFrameSchema } from "./messages/error.js";

export { PROTOCOL_VERSION, EnvelopeBase } from "./base.js";

/** Zod schema for the full discriminated union of all supported native-messaging frames. */
export const FrameSchema = z.discriminatedUnion("kind", [
  PingFrameSchema,
  PongFrameSchema,
  ErrorFrameSchema,
]);

/** A well-formed native-messaging frame after parsing. */
export type Frame = z.infer<typeof FrameSchema>;

/** The `kind` discriminator of any valid frame. */
export type FrameKind = Frame["kind"];
