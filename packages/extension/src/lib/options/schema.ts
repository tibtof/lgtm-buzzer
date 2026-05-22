import { z } from "zod";
import { CredentialsBagSchema } from "@lgtm-buzzer/protocol";

/**
 * The single `chrome.storage.local` key used by the options layer.
 *
 * Versioned so future schema changes can migrate without silent corruption.
 */
export const STORAGE_KEY = "lgtm_buzzer.options.v1" as const;

/**
 * The schema version stored inside the envelope.
 *
 * Increment this constant and write a migrator whenever the shape changes.
 */
export const SCHEMA_VERSION = 1 as const;

/**
 * Per-adapter credentials map.
 *
 * Keyed by adapter ID so switching from `github` to `ado` and back does not
 * lose a previously saved PAT. Each entry is an opaque `CredentialsBag`.
 */
export const StoredCredentialsMapSchema = z.record(z.string(), CredentialsBagSchema);

/** Typed per-adapter credentials map. */
export type StoredCredentialsMap = z.infer<typeof StoredCredentialsMapSchema>;

/**
 * Versioned storage envelope persisted under `STORAGE_KEY`.
 *
 * `llmAdapterId` and `vcsAdapterId` are intentionally `optional` — absent
 * means "use host defaults" (ADR-22: `claude-cli` + `github`).
 */
export const StoredOptionsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  llmAdapterId: z.string().min(1).optional(),
  vcsAdapterId: z.string().min(1).optional(),
  credentials: StoredCredentialsMapSchema.optional(),
});

/** Options stored under `STORAGE_KEY`. */
export type StoredOptions = z.infer<typeof StoredOptionsSchema>;

/**
 * Defaults applied when storage is empty or corrupt.
 *
 * `llmAdapterId`, `vcsAdapterId`, and `credentials` are intentionally absent —
 * the SW falls back to ADR-22 host defaults when they are missing.
 */
export const DEFAULT_OPTIONS: StoredOptions = {
  schemaVersion: SCHEMA_VERSION,
};
