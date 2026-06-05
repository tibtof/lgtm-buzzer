/**
 * Pure mapping from a validated ADO changes response to `PlannedFile` inputs
 * for the unified-diff generator.
 *
 * No I/O occurs here. The caller (provider.ts) feeds the validated
 * `AdoChangesResponse` and receives the list of files to process next.
 *
 * VERIFIED (live ADO, Hackathon-2021/Battleship PR #82, 2026-06-05):
 * - Delete entries: `item.path` is explicitly null; `originalPath` (entry-level)
 *   carries the removed file's path. The orchestration uses `originalPath` as
 *   the file path for delete entries.
 * - Add entries: `item.path` is present; `originalObjectId` is absent.
 * - Edit entries: both `item.path` and both objectIds are present.
 * - Binary detection: `contentMetadata` is absent on live responses. Binary
 *   detection uses the NUL-byte heuristic in the orchestration after blob
 *   fetch — `isBinary` from `contentMetadata` is a forward-compat path only.
 */
import type { AdoChangesResponse } from "./schemas.js";
import type { DiffFile } from "@lgtm-buzzer/adapter-shared";

/**
 * Sentinel string for an absent or all-zero object id.
 *
 * ADO uses the all-zero SHA-1 / SHA-256 string to indicate "no blob on this
 * side" (e.g., the new-side objectId of a deleted file is all zeros). We
 * normalise both the absent case and the all-zeros case to `undefined` so the
 * orchestration can use a simple `!== undefined` check.
 */
const NULL_OBJECT_ID_RE = /^0+$/;

/**
 * Normalise a raw objectId string.
 *
 * Accepts `null` explicitly because the live ADO API omits `objectId` on
 * delete entries (absent → `undefined` after zod parsing) while sending
 * `null` in some edge cases. Both are treated as "no blob on this side".
 *
 * @returns `undefined` if the id is absent, null, empty, or all zeros;
 *   otherwise the trimmed id string.
 */
const normaliseObjectId = (raw: string | null | undefined): string | undefined => {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const trimmed = raw.trim();
  if (NULL_OBJECT_ID_RE.test(trimmed)) return undefined;
  return trimmed;
};

/**
 * Parses the ADO `changeType` string into one of the four canonical change
 * types used by `DiffFile`.
 *
 * ADO `changeType` is a comma-separated flag string, e.g.
 * `"add"`, `"edit"`, `"delete"`, `"edit, rename"`, `"rename"`.
 * We normalise to the four variants the unified-diff generator understands.
 *
 * - Contains "add"    → "add"
 * - Contains "delete" → "delete"
 * - Contains "rename" → "rename"  (may also contain "edit"; rename wins)
 * - Otherwise         → "edit"
 */
const parseChangeType = (
  raw: string,
): "add" | "edit" | "delete" | "rename" => {
  const lower = raw.toLowerCase();
  if (lower.includes("add")) return "add";
  if (lower.includes("delete")) return "delete";
  if (lower.includes("rename")) return "rename";
  return "edit";
};

/**
 * A fully-resolved file plan produced by `toDiffFiles`.
 *
 * Carries all the information the orchestration needs to decide which blob
 * calls to make and how to render the diff section.
 */
export type PlannedFile = DiffFile & {
  /**
   * Object ID of the new-side blob (absent for pure deletes or binary stubs
   * where the orchestration skips the blob call).
   */
  readonly newObjectId: string | undefined;
  /**
   * Object ID of the old-side blob (absent for pure adds or binary stubs).
   */
  readonly oldObjectId: string | undefined;
};

/**
 * Strips a leading slash from a path string (ADO includes one).
 *
 * @param p - Raw path string from ADO response.
 * @returns Path without a leading slash.
 */
const stripLeadingSlash = (p: string): string =>
  p.startsWith("/") ? p.slice(1) : p;

/**
 * Maps a validated `AdoChangesResponse` to the list of `PlannedFile` inputs
 * for the diff orchestration.
 *
 * Filtering applied:
 * - Entries with `item.isFolder === true` are skipped.
 * - Entries with `item.gitObjectType === "tree"` are skipped.
 * - Entries where BOTH `item.path` and `originalPath` are absent/null/empty
 *   are skipped (defensive; should never happen for blob entries).
 *
 * Path resolution per change type (VERIFIED against live ADO 7.1):
 * - **delete**: `item.path` is explicitly null; `originalPath` (entry-level)
 *   carries the removed file path. Use `originalPath` as the file path.
 * - **add**: `item.path` is present; no `originalObjectId`.
 * - **edit**: `item.path` is present; both objectIds present.
 * - **rename**: `item.path` is new-side path; `originalPath` is old-side path.
 *
 * Binary detection: `item.contentMetadata.isBinary === true` sets
 * `isBinary: true` (forward-compat path). When `contentMetadata` is absent
 * (the live-API norm), `isBinary` defaults to `false` and the orchestration
 * performs a NUL-byte defence-in-depth check after fetching blob content.
 *
 * @param res - A validated `AdoChangesResponse` (already zod-parsed).
 * @returns   Ordered list of planned files, ready for blob fetching.
 */
export const toDiffFiles = (res: AdoChangesResponse): readonly PlannedFile[] => {
  const planned: PlannedFile[] = [];

  for (const entry of res.changeEntries) {
    const { item, originalPath } = entry;

    // Skip directory / tree entries.
    if (item.isFolder === true) continue;
    if (item.gitObjectType === "tree") continue;

    const changeType = parseChangeType(entry.changeType);

    // Resolve the canonical file path.
    //
    // VERIFIED (live ADO, Hackathon-2021/Battleship PR #82, 2026-06-05):
    // - Delete entries: `item.path` is explicitly null; `originalPath` carries
    //   the removed file's path.
    // - Add/edit entries: `item.path` is the real new-side path.
    // - Rename entries: `item.path` is new-side; `originalPath` is old-side.
    //
    // Guard: if BOTH are absent/null/empty, skip this entry defensively.
    const rawItemPath = item.path ?? null;
    const rawOriginalPath = originalPath ?? null;

    // For delete entries the item path is null — fall back to originalPath.
    const rawPath =
      rawItemPath !== null && rawItemPath !== ""
        ? rawItemPath
        : rawOriginalPath !== null && rawOriginalPath !== ""
          ? rawOriginalPath
          : null;

    if (rawPath === null) continue; // Both paths absent — skip defensively.

    // Strip any leading slash (ADO always includes one).
    const cleanPath = stripLeadingSlash(rawPath);

    const isBinary = item.contentMetadata?.isBinary === true;

    const newObjectId = normaliseObjectId(item.objectId);
    const oldObjectId = normaliseObjectId(item.originalObjectId);

    // Determine old path for renames and deletes.
    // - rename: `originalPath` = old-side path, `item.path` = new-side path.
    // - delete: `originalPath` = the removed file's path (same as cleanPath
    //   above); no distinct oldPath needed in the DiffFile shape.
    const rawOldPath =
      changeType === "rename" && rawOriginalPath !== null && rawOriginalPath !== ""
        ? rawOriginalPath
        : undefined;
    const oldPath =
      rawOldPath !== undefined ? stripLeadingSlash(rawOldPath) : undefined;

    const base = {
      path: cleanPath,
      oldContent: "", // filled in by the orchestration after blob fetch
      newContent: "", // filled in by the orchestration after blob fetch
      changeType,
      isBinary,
      newObjectId,
      oldObjectId,
    } as const;

    // exactOptionalPropertyTypes: only include optional keys when non-undefined.
    if (oldPath !== undefined) {
      planned.push({ ...base, oldPath });
    } else {
      planned.push(base);
    }
  }

  return planned;
};
