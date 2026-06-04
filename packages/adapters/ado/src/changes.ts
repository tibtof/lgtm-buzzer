/**
 * Pure mapping from a validated ADO changes response to `PlannedFile` inputs
 * for the unified-diff generator.
 *
 * No I/O occurs here. The caller (provider.ts) feeds the validated
 * `AdoChangesResponse` and receives the list of files to process next.
 *
 * ADR-34: binary detection uses `item.contentMetadata.isBinary` as the
 * primary signal (unverified assumption). If absent, the orchestration falls
 * back to a NUL-byte heuristic after fetching new-side content.
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
 * @returns `undefined` if the id is absent, empty, or all zeros; otherwise
 *   the trimmed id string.
 */
const normaliseObjectId = (raw: string | undefined): string | undefined => {
  if (raw === undefined || raw === "") return undefined;
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
 * Maps a validated `AdoChangesResponse` to the list of `PlannedFile` inputs
 * for the diff orchestration.
 *
 * Filtering applied:
 * - Entries with `item.isFolder === true` are skipped.
 * - Entries with `item.gitObjectType === "tree"` are skipped.
 * - Entries with no path are skipped (defensive; the ADO API always provides
 *   a path for blob entries).
 *
 * Binary detection: `item.contentMetadata.isBinary === true` sets
 * `isBinary: true`; the orchestration then emits the stub without fetching
 * blobs. When `contentMetadata` is absent, `isBinary` defaults to `false`;
 * the orchestration performs a NUL-byte defence-in-depth check after
 * fetching content.
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

    // Path is required; skip pathless entries defensively.
    const path = item.path;
    if (path === undefined || path === "") continue;

    // Strip any leading slash (ADO may include one).
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;

    const changeType = parseChangeType(entry.changeType);
    const isBinary = item.contentMetadata?.isBinary === true;

    const newObjectId = normaliseObjectId(item.objectId);
    const oldObjectId = normaliseObjectId(item.originalObjectId);

    // Determine old path for renames.
    const rawOldPath =
      changeType === "rename"
        ? (originalPath ?? item.path)
        : undefined;
    const oldPath =
      rawOldPath !== undefined
        ? (rawOldPath.startsWith("/") ? rawOldPath.slice(1) : rawOldPath)
        : undefined;

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
