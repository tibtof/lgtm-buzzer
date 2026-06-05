/**
 * Zod schemas for Azure DevOps REST API 7.1 response shapes used by the
 * multi-call diff orchestration (ADR-34).
 *
 * Every JSON body returned by the ADO REST API is validated through one of
 * these schemas before any field is accessed. This satisfies CLAUDE.md
 * idiom #7: all untrusted input passes through a zod schema at the I/O
 * boundary before reaching domain code.
 *
 * Shapes validated against the live ADO REST API 7.1 instance
 * (org: Hackathon-2021, project/repo: Battleship, PR #82, 2026-06-05).
 * Previous ASSUMPTION comments have been updated with VERIFIED evidence.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Iterations endpoint — GET …/pullRequests/{id}/iterations
// ---------------------------------------------------------------------------

/** A single PR iteration entry. */
export const AdoIterationSchema = z.object({
  id: z.number(),
});

/**
 * Response shape for `GET …/pullRequests/{id}/iterations?api-version=7.1`.
 *
 * ADO returns `{ value: [...], count: n }` for list endpoints.
 */
export const AdoIterationsResponseSchema = z.object({
  value: z.array(AdoIterationSchema),
  count: z.number().optional(),
});

export type AdoIteration = z.infer<typeof AdoIterationSchema>;
export type AdoIterationsResponse = z.infer<typeof AdoIterationsResponseSchema>;

// ---------------------------------------------------------------------------
// Changes endpoint — GET …/iterations/{iterId}/changes
// ---------------------------------------------------------------------------

/**
 * Content metadata attached to a change item.
 *
 * VERIFIED (live ADO, Hackathon-2021/Battleship PR #82, 2026-06-05):
 * `contentMetadata` is ABSENT on real iteration-changes responses for both
 * edit and delete entries. The field is retained here as optional for
 * forward-compatibility, but binary detection in the orchestration MUST NOT
 * rely on it — the NUL-byte heuristic is the primary (and only) live-API
 * path for binary detection.
 */
export const AdoContentMetadataSchema = z.object({
  isBinary: z.boolean().optional(),
});

/**
 * An individual change item within a PR iteration.
 *
 * VERIFIED (live ADO, Hackathon-2021/Battleship PR #82, 2026-06-05):
 * - `path` is explicitly `null` on delete entries (not absent). Edit entries
 *   carry a real string path. Schema uses `.nullish()` to accept null, undefined,
 *   or absent.
 * - `objectId` is absent on delete entries (no new-side blob). Schema uses
 *   `.nullish()` for uniform handling.
 * - `originalObjectId` is absent on add entries (no old-side blob). Schema uses
 *   `.nullish()`.
 * - `gitObjectType`, `isFolder`, `contentMetadata` are ABSENT on live
 *   iteration-changes responses. Retained as optional for forward-compat; the
 *   orchestration does NOT rely on them being present.
 */
export const AdoChangeItemSchema = z.object({
  /**
   * Repo-relative path of the file (new-side path for renames/edits/adds).
   * VERIFIED: explicitly null on delete entries; absent fields coerced to
   * undefined by zod. Use `.nullish()` to accept null | undefined | absent.
   */
  path: z.string().nullish(),
  /**
   * Git object ID of the new-side blob.
   * VERIFIED: absent (not null) on pure delete entries. Use `.nullish()`.
   */
  objectId: z.string().nullish(),
  /**
   * Git object ID of the old-side blob.
   * VERIFIED: absent on add entries (no old-side blob). Use `.nullish()`.
   */
  originalObjectId: z.string().nullish(),
  /**
   * Object type discriminator. "blob" for files, "tree" for directories.
   * VERIFIED (live ADO, Hackathon-2021/Battleship PR #82): absent on live
   * iteration-changes entries; retained optional for forward-compat.
   */
  gitObjectType: z.string().optional(),
  /**
   * True for directory entries.
   * VERIFIED (live ADO, Hackathon-2021/Battleship PR #82): absent on live
   * iteration-changes entries; retained optional for forward-compat.
   */
  isFolder: z.boolean().optional(),
  /**
   * VERIFIED (live ADO, Hackathon-2021/Battleship PR #82): absent on live
   * iteration-changes entries; retained optional for forward-compat only.
   * Binary detection MUST use NUL-byte heuristic, not this field.
   */
  contentMetadata: AdoContentMetadataSchema.optional(),
});

/**
 * A single change entry in the iteration-changes response.
 *
 * `changeType` is a string containing one or more change flags separated by
 * commas, e.g. `"add"`, `"edit"`, `"delete"`, `"edit, rename"`.
 *
 * VERIFIED (live ADO, Hackathon-2021/Battleship PR #82, 2026-06-05):
 * - `originalPath` is the entry-level field name for the old path on delete
 *   and rename entries. For a real delete entry:
 *   `{ changeTrackingId: 13, originalPath: "/server-webflux/.../square.txt",
 *      changeId: 13, item: { originalObjectId: "AE82...", path: null },
 *      changeType: "delete" }`.
 *   `originalPath` carries the old-side path; `item.path` is null.
 */
export const AdoChangeEntrySchema = z.object({
  changeType: z.string(),
  item: AdoChangeItemSchema,
  /**
   * Old-side path. Present on delete entries (carries the removed file's
   * path) and rename entries (carries the pre-rename path).
   * VERIFIED: entry-level field name is `originalPath`.
   */
  originalPath: z.string().optional(),
});

/**
 * Response shape for
 * `GET …/iterations/{iterId}/changes?api-version=7.1&$compareTo=0`.
 *
 * VERIFIED (live ADO, Hackathon-2021/Battleship PR #82, 2026-06-05):
 * the top-level key is `changeEntries`. (The `diffs/commits` endpoint uses
 * `changes` instead — not used by this adapter.)
 */
export const AdoChangesResponseSchema = z.object({
  changeEntries: z.array(AdoChangeEntrySchema),
});

export type AdoChangeItem = z.infer<typeof AdoChangeItemSchema>;
export type AdoChangeEntry = z.infer<typeof AdoChangeEntrySchema>;
export type AdoChangesResponse = z.infer<typeof AdoChangesResponseSchema>;
