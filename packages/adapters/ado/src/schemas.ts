/**
 * Zod schemas for Azure DevOps REST API 7.1 response shapes used by the
 * multi-call diff orchestration (ADR-34).
 *
 * Every JSON body returned by the ADO REST API is validated through one of
 * these schemas before any field is accessed. This satisfies CLAUDE.md
 * idiom #7: all untrusted input passes through a zod schema at the I/O
 * boundary before reaching domain code.
 *
 * NOTE: These schemas are authored against the documented ADO REST API 7.1
 * shapes and validated with synthetic fixtures only. There is no live ADO
 * instance available. Assumptions about exact field names are marked inline
 * with `// ASSUMPTION (ADR-34, unverified against live ADO)`.
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
 * // ASSUMPTION (ADR-34, unverified against live ADO): the iteration-changes
 * // payload includes a `contentMetadata` field with an `isBinary` boolean on
 * // `GitItem`. If this field is absent on the live API, binary detection
 * // falls back to the NUL-byte heuristic in the orchestration.
 */
export const AdoContentMetadataSchema = z.object({
  isBinary: z.boolean().optional(),
});

/**
 * An individual change item within a PR iteration.
 *
 * // ASSUMPTION (ADR-34, unverified against live ADO): `objectId` and
 * // `originalObjectId` are present as direct fields on the item object.
 * // `gitObjectType` differentiates blobs from trees; `isFolder` is also
 * // available as a filter signal for non-file entries.
 */
export const AdoChangeItemSchema = z.object({
  /** Repo-relative path of the file (new-side path for renames). */
  path: z.string().optional(),
  /** Git object ID of the new-side blob. All-zero string for pure deletes. */
  objectId: z.string().optional(),
  /** Git object ID of the old-side blob. Present on edits and deletes. */
  originalObjectId: z.string().optional(),
  /**
   * Object type discriminator. "blob" for files, "tree" for directories.
   * // ASSUMPTION (ADR-34, unverified against live ADO): value is exactly
   * // "tree" (not "Tree") for directory entries.
   */
  gitObjectType: z.string().optional(),
  /** True for directory entries. */
  isFolder: z.boolean().optional(),
  contentMetadata: AdoContentMetadataSchema.optional(),
});

/**
 * A single change entry in the iteration-changes response.
 *
 * `changeType` is a string containing one or more change flags separated by
 * commas, e.g. `"add"`, `"edit"`, `"delete"`, `"edit, rename"`.
 *
 * // ASSUMPTION (ADR-34, unverified against live ADO): `originalPath` is the
 * // field name for the old path on renamed entries (not `sourcePath` or
 * // `originalItem.path`).
 */
export const AdoChangeEntrySchema = z.object({
  changeType: z.string(),
  item: AdoChangeItemSchema,
  /** Old path for renames. Present only when changeType includes "rename". */
  originalPath: z.string().optional(),
});

/**
 * Response shape for
 * `GET …/iterations/{iterId}/changes?api-version=7.1&$compareTo=0`.
 *
 * // ASSUMPTION (ADR-34, unverified against live ADO): the top-level key is
 * // `changeEntries` on the PR-iteration-changes endpoint. (The
 * // `diffs/commits` endpoint uses `changes` instead.)
 */
export const AdoChangesResponseSchema = z.object({
  changeEntries: z.array(AdoChangeEntrySchema),
});

export type AdoChangeItem = z.infer<typeof AdoChangeItemSchema>;
export type AdoChangeEntry = z.infer<typeof AdoChangeEntrySchema>;
export type AdoChangesResponse = z.infer<typeof AdoChangesResponseSchema>;
