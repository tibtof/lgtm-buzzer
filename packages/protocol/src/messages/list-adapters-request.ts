import { z } from "zod";
import { EnvelopeBase } from "../base.js";

/** Zod schema for the list-adapters-request frame payload. */
export const ListAdaptersRequestPayloadSchema = z.object({}).strict();

/** Payload of a list-adapters-request frame. */
export type ListAdaptersRequestPayload = z.infer<typeof ListAdaptersRequestPayloadSchema>;

/** Zod schema for a complete list-adapters-request frame. */
export const ListAdaptersRequestFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("list-adapters-request"),
  payload: ListAdaptersRequestPayloadSchema,
});

/** A well-formed list-adapters-request frame after parsing. */
export type ListAdaptersRequestFrame = z.infer<typeof ListAdaptersRequestFrameSchema>;
