import { z } from "zod";

/**
 * The single `chrome.storage.local` key used by the options layer.
 *
 * Bumped to `v3` in ADR-32. The v1 key (`lgtm_buzzer.options.v1`) and v2 key
 * (`lgtm_buzzer.options.v2`) are silently abandoned. A v3 read of a storage
 * area that only has an older key returns `Left<absent>` (key mismatch), which
 * the DOM layer treats as first-run defaults and writes a fresh v3 on Save.
 * The dead v2 entry ages out naturally — no destructive migration.
 *
 * To clean up old keys from DevTools:
 *   `chrome.storage.local.remove("lgtm_buzzer.options.v1")`
 *   `chrome.storage.local.remove("lgtm_buzzer.options.v2")`
 */
export const STORAGE_KEY = "lgtm_buzzer.options.v3" as const;

/**
 * The schema version stored inside the envelope.
 *
 * Increment this constant and write a migrator whenever the shape changes.
 */
export const SCHEMA_VERSION = 3 as const;

/**
 * Versioned storage envelope persisted under `STORAGE_KEY`.
 *
 * As of ADR-29:
 * - `vcsAdapterId` is REMOVED — the SW infers it from `pr.kind`.
 * - `credentials` is REMOVED — credentials are resolved host-side.
 * - Only `llmAdapterId` remains as a user preference.
 *
 * As of ADR-32:
 * - `questionPoolSize` is added — controls how many questions the host
 *   generates per pool. Allowed values: 5 | 10 | 20 (literal union, not
 *   an arbitrary integer). Absent means use the default (5).
 *
 * `llmAdapterId` is intentionally `optional` — absent means "use host default"
 * (ADR-22: `claude-cli`).
 */
export const StoredOptionsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  llmAdapterId: z.string().min(1).optional(),
  // REMOVED (ADR-29): vcsAdapterId — inferred from pr.kind by the SW router.
  // REMOVED (ADR-29): credentials — resolved host-side by CredentialResolver.
  /**
   * Question pool size — see ADR-30 + ADR-32. One of {5, 10, 20}.
   *
   * A `z.literal` union (rather than z.number().int().min().max()) prevents
   * users from hand-editing storage to unsupported values. Absent = default 5.
   */
  questionPoolSize: z.union([z.literal(5), z.literal(10), z.literal(20)]).optional(),
});

/** Options stored under `STORAGE_KEY`. */
export type StoredOptions = z.infer<typeof StoredOptionsSchema>;

/**
 * Defaults applied when storage is empty or corrupt.
 *
 * `llmAdapterId` is intentionally absent — the host applies its ADR-22
 * default (`claude-cli`) when the field is missing.
 * `questionPoolSize` is absent — defaults to 5 at the projection layer.
 */
export const DEFAULT_OPTIONS: StoredOptions = {
  schemaVersion: SCHEMA_VERSION,
};
