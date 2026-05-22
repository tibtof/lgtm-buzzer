import { z } from "zod";
import { FrameSchema } from "@lgtm-buzzer/protocol";

/**
 * Zod schema for messages sent by content scripts to the service worker.
 *
 * Currently the only variant is `send-frame`, which asks the SW to forward
 * a validated `Frame` to the native host and await the reply.
 */
export const CSRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("send-frame"), frame: FrameSchema }),
]);

/** A validated message from a content script to the service worker. */
export type CSRequest = z.infer<typeof CSRequestSchema>;

/**
 * Zod schema for messages returned by the service worker to content scripts.
 *
 * `frame` — the host's reply frame (including `ErrorFrame` for host-side
 * failures).
 * `sw-error` — a failure that occurred in the SW itself, before a frame
 * could be exchanged with the host.
 */
export const CSResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("frame"), frame: FrameSchema }),
  z.object({
    kind: z.literal("sw-error"),
    reason: z.enum(["schema-violation", "internal"]),
    message: z.string().min(1),
  }),
]);

/** A validated message from the service worker back to a content script. */
export type CSResponse = z.infer<typeof CSResponseSchema>;
