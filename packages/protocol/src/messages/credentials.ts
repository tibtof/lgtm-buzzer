import { z } from "zod";

/**
 * Wire-format credentials bag.
 *
 * The protocol layer keeps this schema deliberately loose — per-adapter shape
 * validation happens in the host's adapter registry (`packages/host/src/registry.ts`).
 * Allowing arbitrary string-keyed string values here lets the protocol carry
 * today's PAT / API-key bags AND tomorrow's additional fields (refresh tokens,
 * regional endpoints) without an envelope bump.
 *
 * SECURITY: This object is logged NOWHERE. ADR-6's REDACT_PATHS must censor
 * `payload.credentials`, `*.credentials`, `*.apiKey`, `*.pat`.
 */
export const CredentialsBagSchema = z.record(z.string(), z.string());

/** An opaque bag of per-adapter credentials, keyed by field name. */
export type CredentialsBag = z.infer<typeof CredentialsBagSchema>;
