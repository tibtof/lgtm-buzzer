import { z } from "zod";

/**
 * The single `chrome.storage.local` key used by the options layer.
 *
 * Bumped to `v2` in ADR-29. The v1 key (`lgtm_buzzer.options.v1`) is
 * silently abandoned — v1 stored credentials are meaningless now that
 * credentials are resolved host-side. A v2 read of a storage area that
 * only has the v1 key returns `Left<absent>` (key mismatch), which the
 * DOM layer treats as defaults and writes a fresh v2 on Save.
 *
 * To clean up the old key: `chrome.storage.local.remove("lgtm_buzzer.options.v1")`
 * from DevTools.
 */
export const STORAGE_KEY = "lgtm_buzzer.options.v2" as const;

/**
 * The schema version stored inside the envelope.
 *
 * Increment this constant and write a migrator whenever the shape changes.
 */
export const SCHEMA_VERSION = 2 as const;

/**
 * Versioned storage envelope persisted under `STORAGE_KEY`.
 *
 * As of ADR-29:
 * - `vcsAdapterId` is REMOVED — the SW infers it from `pr.kind`.
 * - `credentials` is REMOVED — credentials are resolved host-side.
 * - Only `llmAdapterId` remains as a user preference.
 *
 * `llmAdapterId` is intentionally `optional` — absent means "use host default"
 * (ADR-22: `claude-cli`).
 */
export const StoredOptionsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  llmAdapterId: z.string().min(1).optional(),
  // REMOVED (ADR-29): vcsAdapterId — inferred from pr.kind by the SW router.
  // REMOVED (ADR-29): credentials — resolved host-side by CredentialResolver.
});

/** Options stored under `STORAGE_KEY`. */
export type StoredOptions = z.infer<typeof StoredOptionsSchema>;

/**
 * Defaults applied when storage is empty or corrupt.
 *
 * `llmAdapterId` is intentionally absent — the host applies its ADR-22
 * default (`claude-cli`) when the field is missing.
 */
export const DEFAULT_OPTIONS: StoredOptions = {
  schemaVersion: SCHEMA_VERSION,
};
