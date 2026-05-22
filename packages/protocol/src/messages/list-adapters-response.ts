import { z } from "zod";
import { EnvelopeBase } from "../base.js";

/** Zod schema for the list-adapters-response frame payload. */
export const ListAdaptersResponsePayloadSchema = z.object({
  /** Stable LLM adapter IDs registered in the host. */
  llm: z.array(z.string().min(1)),
  /** Stable VCS adapter IDs registered in the host. */
  vcs: z.array(z.string().min(1)),
});

/** Payload of a list-adapters-response frame. */
export type ListAdaptersResponsePayload = z.infer<typeof ListAdaptersResponsePayloadSchema>;

/** Zod schema for a complete list-adapters-response frame. */
export const ListAdaptersResponseFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("list-adapters-response"),
  payload: ListAdaptersResponsePayloadSchema,
});

/** A well-formed list-adapters-response frame after parsing. */
export type ListAdaptersResponseFrame = z.infer<typeof ListAdaptersResponseFrameSchema>;
