/**
 * Pure, zero-dependency unified-diff generator.
 *
 * Produces git-compatible unified-diff text from pairs of old/new file
 * content strings. Used by the ADO adapter (ADR-34) which must synthesise
 * unified-diff output from per-blob content fetched via the REST API, and
 * available to any future VCS adapter that lacks a server-rendered diff
 * endpoint.
 *
 * Algorithm: line-level LCS (dynamic-programming longest-common-subsequence
 * over lines), then emit hunks with `DEFAULT_CONTEXT_LINES` of context on
 * each side. Adjacent blocks within `2 × context` lines are merged into one
 * hunk (git's coalescing rule). LCS is chosen over full Myers for
 * simplicity, determinism, and adequate quiz-LLM fidelity.
 *
 * This module is side-effect-free and introduces no new runtime dependency.
 */

/** Context lines emitted around each change block. Matches git's default. */
export const DEFAULT_CONTEXT_LINES = 3;

/**
 * One changed file's inputs for unified-diff rendering.
 *
 * All fields are read-only. `oldContent` and `newContent` are full raw file
 * contents as strings; the caller is responsible for fetching them.
 */
export type DiffFile = {
  /** Repo-relative path WITHOUT leading slash, e.g. "src/foo.ts". */
  readonly path: string;
  /** Full old-side content. Empty string for an added file. */
  readonly oldContent: string;
  /** Full new-side content. Empty string for a deleted file. */
  readonly newContent: string;
  /** Change classification — drives the header lines emitted. */
  readonly changeType: "add" | "edit" | "delete" | "rename";
  /** Old path when changeType === "rename"; otherwise omitted. */
  readonly oldPath?: string;
  /** When true, emit the binary stub line and ignore content. */
  readonly isBinary: boolean;
};

// ---------------------------------------------------------------------------
// LCS implementation
// ---------------------------------------------------------------------------

/**
 * Computes the length table for the longest common subsequence of two arrays.
 * Uses O(n×m) dynamic programming. Lines are compared by value.
 *
 * @returns A 2-D table `dp` where `dp[i][j]` is the LCS length of
 *   `a[0..i-1]` and `b[0..j-1]`.
 */
const buildLcsTable = (a: readonly string[], b: readonly string[]): number[][] => {
  const n = a.length;
  const m = b.length;
  // Allocate (n+1) × (m+1) table filled with zeros.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        // Safe: dp[i-1] and dp[j-1] are always initialised by the loop above.
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }
  return dp;
};

/**
 * Represents a single edit operation in the diff output.
 * `context` lines appear on both sides with no prefix.
 */
type EditOp =
  | { readonly kind: "context"; readonly line: string }
  | { readonly kind: "delete"; readonly line: string }
  | { readonly kind: "insert"; readonly line: string };

/**
 * Backtracks through the LCS table to produce the edit script.
 *
 * @param dp  - The DP table from `buildLcsTable`.
 * @param a   - The old lines.
 * @param b   - The new lines.
 * @returns   Ordered edit operations from top to bottom of the diff.
 */
const backtrackLcs = (
  dp: number[][],
  a: readonly string[],
  b: readonly string[],
): EditOp[] => {
  const ops: EditOp[] = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ kind: "context", line: a[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      ops.push({ kind: "insert", line: b[j - 1]! });
      j--;
    } else {
      ops.push({ kind: "delete", line: a[i - 1]! });
      i--;
    }
  }

  ops.reverse();
  return ops;
};

// ---------------------------------------------------------------------------
// Hunk building
// ---------------------------------------------------------------------------

/**
 * A single unified-diff hunk: `@@ -oldStart,oldLen +newStart,newLen @@` plus
 * the body lines.
 */
type Hunk = {
  readonly oldStart: number;
  readonly oldLen: number;
  readonly newStart: number;
  readonly newLen: number;
  readonly lines: readonly string[];
};

/**
 * Formats a hunk header per git convention.
 * Single-line ranges always emit the explicit `,1` form for consistency.
 */
const formatHunkHeader = (h: Hunk): string =>
  `@@ -${h.oldStart},${h.oldLen} +${h.newStart},${h.newLen} @@`;

/**
 * Turns an edit script into hunks with the requested number of context lines.
 *
 * Adjacent change blocks whose context windows overlap or touch are merged
 * into one hunk (git's coalescing rule: merge when blocks are ≤ 2×context
 * apart).
 */
const buildHunks = (ops: readonly EditOp[], contextLines: number): Hunk[] => {
  // First pass: locate positions of all changed lines in the edit script.
  // We need to know which op indices are non-context so we can build windows.

  // Compute old/new line numbers for every op position.
  type OpPos = {
    readonly opIdx: number;
    readonly oldLine: number; // 1-based; 0 = not from old side
    readonly newLine: number; // 1-based; 0 = not from new side
    readonly isChange: boolean;
  };

  const positions: OpPos[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    const isChange = op.kind !== "context";
    positions.push({
      opIdx: i,
      oldLine: op.kind !== "insert" ? oldLine : 0,
      newLine: op.kind !== "delete" ? newLine : 0,
      isChange,
    });
    if (op.kind === "context" || op.kind === "delete") oldLine++;
    if (op.kind === "context" || op.kind === "insert") newLine++;
  }

  // Second pass: identify groups of change ops, extend each group by
  // contextLines on both sides, then merge overlapping windows.
  const changeIndices = positions.filter((p) => p.isChange).map((p) => p.opIdx);
  if (changeIndices.length === 0) return [];

  // Build raw windows (op index ranges).
  type Window = { start: number; end: number }; // inclusive indices into ops[]
  const windows: Window[] = [];
  for (const idx of changeIndices) {
    const start = Math.max(0, idx - contextLines);
    const end = Math.min(ops.length - 1, idx + contextLines);
    const last = windows[windows.length - 1];
    if (last !== undefined && start <= last.end + 1) {
      // Merge: extend the previous window.
      last.end = Math.max(last.end, end);
    } else {
      windows.push({ start, end });
    }
  }

  // Third pass: convert each window into a Hunk.
  const hunks: Hunk[] = [];
  for (const win of windows) {
    const lines: string[] = [];
    let hunkOldLen = 0;
    let hunkNewLen = 0;

    // Derive start line numbers by scanning for the first position in the
    // window that contributes to each side. A position contributes to the old
    // side when oldLine > 0 (context or delete), and to the new side when
    // newLine > 0 (context or insert). Per git's rule: start is 0 only when
    // the hunk has zero lines on that side (pure-add → old 0,0; pure-delete →
    // new 0,0). Whenever at least one line exists on a side, start ≥ 1.
    let hunkOldStart = 0;
    let hunkNewStart = 0;
    for (let i = win.start; i <= win.end; i++) {
      const pos = positions[i]!;
      if (hunkOldStart === 0 && pos.oldLine > 0) hunkOldStart = pos.oldLine;
      if (hunkNewStart === 0 && pos.newLine > 0) hunkNewStart = pos.newLine;
      if (hunkOldStart > 0 && hunkNewStart > 0) break;
    }

    for (let i = win.start; i <= win.end; i++) {
      const op = ops[i]!;

      switch (op.kind) {
        case "context":
          lines.push(` ${op.line}`);
          hunkOldLen++;
          hunkNewLen++;
          break;
        case "delete":
          lines.push(`-${op.line}`);
          hunkOldLen++;
          break;
        case "insert":
          lines.push(`+${op.line}`);
          hunkNewLen++;
          break;
      }
    }

    hunks.push({
      oldStart: hunkOldStart,
      oldLen: hunkOldLen,
      newStart: hunkNewStart,
      newLen: hunkNewLen,
      lines,
    });
  }

  return hunks;
};

// ---------------------------------------------------------------------------
// No-newline handling
// ---------------------------------------------------------------------------

/**
 * Splits content into lines, tracking whether there was a trailing newline.
 *
 * @returns `{ lines, noNewlineAtEnd }` where `lines` never contains the
 *   empty string that would result from a trailing `\n`.
 */
const splitLines = (content: string): { lines: string[]; noNewlineAtEnd: boolean } => {
  if (content === "") return { lines: [], noNewlineAtEnd: false };
  const noNewlineAtEnd = !content.endsWith("\n");
  const raw = content.split("\n");
  // Remove the trailing empty element that split creates for `"a\n".split("\n")`.
  if (!noNewlineAtEnd && raw[raw.length - 1] === "") {
    raw.pop();
  }
  return { lines: raw, noNewlineAtEnd };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Renders one file's unified-diff section (the `diff --git` header plus hunks,
 * or the binary stub line). Pure and total. Never throws.
 *
 * @param file         - The file inputs (old/new content, change type, etc.).
 * @param contextLines - Lines of context around each change block (default 3).
 * @returns            The full diff section string, including a trailing newline.
 */
export const renderFileDiff = (file: DiffFile, contextLines = DEFAULT_CONTEXT_LINES): string => {
  const oldPathLabel = file.changeType === "rename" ? (file.oldPath ?? file.path) : file.path;
  const newPathLabel = file.path;

  const parts: string[] = [];

  // Always emit the `diff --git` header so `looksLikeUnifiedDiff` matches.
  parts.push(`diff --git a/${oldPathLabel} b/${newPathLabel}`);

  if (file.isBinary) {
    parts.push(`Binary files a/${oldPathLabel} and b/${newPathLabel} differ`);
    return parts.join("\n") + "\n";
  }

  // Emit --- / +++ header lines based on change type.
  switch (file.changeType) {
    case "add":
      parts.push("--- /dev/null");
      parts.push(`+++ b/${newPathLabel}`);
      break;
    case "delete":
      parts.push(`--- a/${oldPathLabel}`);
      parts.push("+++ /dev/null");
      break;
    case "edit":
    case "rename":
      parts.push(`--- a/${oldPathLabel}`);
      parts.push(`+++ b/${newPathLabel}`);
      break;
  }

  const { lines: oldLines, noNewlineAtEnd: oldNoNewline } = splitLines(file.oldContent);
  const { lines: newLines, noNewlineAtEnd: newNoNewline } = splitLines(file.newContent);

  // If contents are identical (e.g. pure rename with no edit), emit header only.
  if (file.oldContent === file.newContent) {
    return parts.join("\n") + "\n";
  }

  const dp = buildLcsTable(oldLines, newLines);
  const editOps = backtrackLcs(dp, oldLines, newLines);
  const hunks = buildHunks(editOps, contextLines);

  if (hunks.length === 0) {
    // Identical content after line-level diff — no hunks to emit.
    return parts.join("\n") + "\n";
  }

  // Emit each hunk.
  for (const hunk of hunks) {
    parts.push(formatHunkHeader(hunk));

    // Determine the index of the last changed (non-context) line in the hunk
    // so we can attach the no-newline marker correctly.
    const lastDeletedIdx = (() => {
      let idx = -1;
      for (let i = hunk.lines.length - 1; i >= 0; i--) {
        if (hunk.lines[i]!.startsWith("-")) { idx = i; break; }
      }
      return idx;
    })();
    const lastInsertedIdx = (() => {
      let idx = -1;
      for (let i = hunk.lines.length - 1; i >= 0; i--) {
        if (hunk.lines[i]!.startsWith("+")) { idx = i; break; }
      }
      return idx;
    })();
    const lastContextIdx = (() => {
      let idx = -1;
      for (let i = hunk.lines.length - 1; i >= 0; i--) {
        if (hunk.lines[i]!.startsWith(" ")) { idx = i; break; }
      }
      return idx;
    })();

    // The last line of the hunk body (last context or last insert/delete) may
    // need a no-newline marker.
    const lastBodyIdx = hunk.lines.length - 1;
    const isLastHunk = hunk === hunks[hunks.length - 1];

    for (let li = 0; li < hunk.lines.length; li++) {
      const line = hunk.lines[li]!;
      parts.push(line);

      if (isLastHunk && li === lastBodyIdx) {
        // Attach no-newline markers after the final line of the final hunk.
        // Old-side no-newline: after the last `-` line (or last context if no `-`).
        // New-side no-newline: after the last `+` line (or last context if no `+`).
        //
        // Git's rule: emit `\ No newline at end of file` immediately after the
        // line it applies to. The marker goes after the last `-` line for old
        // and after the last `+` line for new. When the last body line is a
        // context line that's also the last line in the file, and both sides
        // lack a trailing newline, the marker appears once after the context line.

        // Check if this is the last `-` line and old side has no newline.
        if (line.startsWith("-") && li === lastDeletedIdx && oldNoNewline && lastInsertedIdx < li) {
          parts.push("\\ No newline at end of file");
        }
        // Check if this is the last `+` line and new side has no newline.
        if (line.startsWith("+") && li === lastInsertedIdx && newNoNewline) {
          parts.push("\\ No newline at end of file");
        }
        // Context line at end: if it's the last context line and both sides lack newline.
        if (line.startsWith(" ") && li === lastContextIdx && li === lastBodyIdx) {
          // Both sides missing newline — the context line is shared.
          if (oldNoNewline && newNoNewline) {
            parts.push("\\ No newline at end of file");
          }
        }
      } else if (isLastHunk) {
        // Mid-hunk no-newline: after the last `-` line when old has no newline,
        // but only if there are subsequent `+` lines (so the marker is interleaved).
        if (line.startsWith("-") && li === lastDeletedIdx && oldNoNewline && lastInsertedIdx > li) {
          parts.push("\\ No newline at end of file");
        }
      }
    }
  }

  return parts.join("\n") + "\n";
};

/**
 * Concatenates per-file sections into a single unified-diff document.
 * Pure and total. The order of `files` is preserved.
 *
 * @param files        - Ordered list of files to include.
 * @param contextLines - Lines of context per hunk (default 3).
 * @returns            The concatenated unified-diff string.
 */
export const renderUnifiedDiff = (
  files: readonly DiffFile[],
  contextLines = DEFAULT_CONTEXT_LINES,
): string => files.map((f) => renderFileDiff(f, contextLines)).join("");
