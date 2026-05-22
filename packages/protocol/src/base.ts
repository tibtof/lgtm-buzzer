import { z } from "zod";

/** The numeric major version of the native-messaging wire protocol. */
export const PROTOCOL_VERSION = 1 as const;

/**
 * Shared envelope fields spread into every concrete frame schema.
 * Not re-exported from `index.ts` — internal composition helper for `protocol` only.
 */
export const EnvelopeBase = {
  v: z.literal(PROTOCOL_VERSION),
  correlationId: z.string().min(1).nullable(),
} as const;
