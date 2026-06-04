import { describe, it, expect } from "vitest";
import {
  renderFileDiff,
  renderUnifiedDiff,
  DEFAULT_CONTEXT_LINES,
  type DiffFile,
} from "./unified-diff.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when the string satisfies ADR-15's looksLikeUnifiedDiff sniff. */
const looksLikeUnifiedDiff = (s: string): boolean => {
  if (s.length === 0) return true;
  return /^diff --git /m.test(s) || /^--- /m.test(s);
};

/** Build a minimal DiffFile with defaults filled in. */
const file = (overrides: Partial<DiffFile> & { path: string }): DiffFile => ({
  oldContent: "",
  newContent: "",
  changeType: "edit",
  isBinary: false,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DEFAULT_CONTEXT_LINES", () => {
  it("is 3 (git default)", () => {
    expect(DEFAULT_CONTEXT_LINES).toBe(3);
  });
});

describe("renderFileDiff — binary stub", () => {
  it("emits exactly the binary stub line for a binary file, no hunks", () => {
    const f = file({ path: "image.png", changeType: "edit", isBinary: true, oldContent: "\0abc", newContent: "\0def" });
    const result = renderFileDiff(f);
    expect(result).toContain("diff --git a/image.png b/image.png");
    expect(result).toContain("Binary files a/image.png and b/image.png differ");
    expect(result).not.toContain("@@");
    expect(result).not.toContain("---");
  });

  it("binary rename uses oldPath in stub", () => {
    const f = file({ path: "new.png", oldPath: "old.png", changeType: "rename", isBinary: true });
    const result = renderFileDiff(f);
    expect(result).toContain("diff --git a/old.png b/new.png");
    expect(result).toContain("Binary files a/old.png and b/new.png differ");
  });

  it("output satisfies looksLikeUnifiedDiff sniff", () => {
    const f = file({ path: "data.bin", changeType: "add", isBinary: true });
    expect(looksLikeUnifiedDiff(renderFileDiff(f))).toBe(true);
  });
});

describe("renderFileDiff — pure add (new file)", () => {
  it("emits --- /dev/null header and +++ b/<path>", () => {
    const f = file({ path: "src/new.ts", changeType: "add", oldContent: "", newContent: "const x = 1;\n" });
    const result = renderFileDiff(f);
    expect(result).toContain("--- /dev/null");
    expect(result).toContain("+++ b/src/new.ts");
    expect(result).toContain("+const x = 1;");
  });

  it("hunk header is @@ -0,0 +1,n @@ for an added file", () => {
    const f = file({
      path: "a.ts",
      changeType: "add",
      oldContent: "",
      newContent: "line1\nline2\nline3\n",
    });
    const result = renderFileDiff(f);
    expect(result).toContain("@@ -0,0 +1,3 @@");
  });

  it("satisfies looksLikeUnifiedDiff", () => {
    const f = file({ path: "a.ts", changeType: "add", oldContent: "", newContent: "hello\n" });
    expect(looksLikeUnifiedDiff(renderFileDiff(f))).toBe(true);
  });
});

describe("renderFileDiff — pure delete (removed file)", () => {
  it("emits --- a/<path> and +++ /dev/null", () => {
    const f = file({ path: "old.ts", changeType: "delete", oldContent: "removed\n", newContent: "" });
    const result = renderFileDiff(f);
    expect(result).toContain("--- a/old.ts");
    expect(result).toContain("+++ /dev/null");
    expect(result).toContain("-removed");
  });

  it("hunk header is @@ -1,n +0,0 @@ for a deleted file", () => {
    const f = file({
      path: "b.ts",
      changeType: "delete",
      oldContent: "a\nb\nc\n",
      newContent: "",
    });
    const result = renderFileDiff(f);
    expect(result).toContain("@@ -1,3 +0,0 @@");
  });
});

describe("renderFileDiff — edit", () => {
  it("emits --- a/<path> and +++ b/<path>", () => {
    const f = file({ path: "src/foo.ts", changeType: "edit", oldContent: "old\n", newContent: "new\n" });
    const result = renderFileDiff(f);
    expect(result).toContain("--- a/src/foo.ts");
    expect(result).toContain("+++ b/src/foo.ts");
  });

  it("shows deleted and added lines", () => {
    const f = file({
      path: "foo.ts",
      changeType: "edit",
      oldContent: "alpha\nbeta\ngamma\n",
      newContent: "alpha\nBETA\ngamma\n",
    });
    const result = renderFileDiff(f);
    expect(result).toContain("-beta");
    expect(result).toContain("+BETA");
    expect(result).toContain(" alpha");
    expect(result).toContain(" gamma");
  });

  it("satisfies looksLikeUnifiedDiff", () => {
    const f = file({ path: "x.ts", changeType: "edit", oldContent: "a\n", newContent: "b\n" });
    expect(looksLikeUnifiedDiff(renderFileDiff(f))).toBe(true);
  });
});

describe("renderFileDiff — rename", () => {
  it("emits old path on --- and new path on +++", () => {
    const f = file({
      path: "new-name.ts",
      oldPath: "old-name.ts",
      changeType: "rename",
      oldContent: "content\n",
      newContent: "content\n",
    });
    const result = renderFileDiff(f);
    expect(result).toContain("diff --git a/old-name.ts b/new-name.ts");
    expect(result).toContain("--- a/old-name.ts");
    expect(result).toContain("+++ b/new-name.ts");
  });

  it("pure rename (identical content) emits header only, no hunks", () => {
    const f = file({
      path: "new.ts",
      oldPath: "old.ts",
      changeType: "rename",
      oldContent: "same\n",
      newContent: "same\n",
    });
    const result = renderFileDiff(f);
    expect(result).not.toContain("@@");
    expect(result).toContain("diff --git a/old.ts b/new.ts");
  });

  it("rename with content change shows hunks", () => {
    const f = file({
      path: "new.ts",
      oldPath: "old.ts",
      changeType: "rename",
      oldContent: "old content\n",
      newContent: "new content\n",
    });
    const result = renderFileDiff(f);
    expect(result).toContain("@@");
    expect(result).toContain("-old content");
    expect(result).toContain("+new content");
  });
});

describe("renderFileDiff — identical content (no change)", () => {
  it("emits header only, no hunk markers, for identical content", () => {
    const f = file({ path: "same.ts", changeType: "edit", oldContent: "no change\n", newContent: "no change\n" });
    const result = renderFileDiff(f);
    expect(result).toContain("diff --git a/same.ts b/same.ts");
    expect(result).not.toContain("@@");
  });

  it("both empty → header only, no hunks", () => {
    const f = file({ path: "empty.ts", changeType: "edit", oldContent: "", newContent: "" });
    const result = renderFileDiff(f);
    expect(result).toContain("diff --git");
    expect(result).not.toContain("@@");
  });
});

describe("renderFileDiff — no trailing newline", () => {
  it("emits '\\\\  No newline at end of file' when new content has no trailing newline", () => {
    const f = file({
      path: "nonewline.ts",
      changeType: "add",
      oldContent: "",
      newContent: "hello", // no trailing \n
    });
    const result = renderFileDiff(f);
    expect(result).toContain("\\ No newline at end of file");
  });

  it("emits no-newline marker on deleted side when old has no trailing newline", () => {
    const f = file({
      path: "x.ts",
      changeType: "delete",
      oldContent: "removed", // no trailing \n
      newContent: "",
    });
    const result = renderFileDiff(f);
    expect(result).toContain("\\ No newline at end of file");
  });
});

describe("renderFileDiff — multi-hunk (distant changes)", () => {
  it("two distant change blocks produce two @@ hunks", () => {
    // 20 lines of context between changes — well beyond 2×3=6 merge threshold.
    const oldLines = [
      "line1",   // changed
      "ctx2", "ctx3", "ctx4", "ctx5", "ctx6", "ctx7",
      "ctx8", "ctx9", "ctx10", "ctx11", "ctx12", "ctx13",
      "ctx14", "ctx15", "ctx16", "ctx17", "ctx18",
      "line19",  // changed
      "ctx20",
    ];
    const newLines = [
      "LINE1",   // changed
      "ctx2", "ctx3", "ctx4", "ctx5", "ctx6", "ctx7",
      "ctx8", "ctx9", "ctx10", "ctx11", "ctx12", "ctx13",
      "ctx14", "ctx15", "ctx16", "ctx17", "ctx18",
      "LINE19",  // changed
      "ctx20",
    ];
    const f = file({
      path: "multi.ts",
      changeType: "edit",
      oldContent: oldLines.join("\n") + "\n",
      newContent: newLines.join("\n") + "\n",
    });
    const result = renderFileDiff(f);
    const hunkHeaders = result.match(/^@@ /gm) ?? [];
    expect(hunkHeaders.length).toBe(2);
    expect(result).toContain("-line1");
    expect(result).toContain("+LINE1");
    expect(result).toContain("-line19");
    expect(result).toContain("+LINE19");
  });

  it("adjacent change blocks within 2×context are merged into one hunk", () => {
    // Two changes only 4 lines apart (< 2×3=6) → should merge.
    const oldLines = [
      "ctx1", "ctx2", "ctx3",
      "change1",
      "ctx5", "ctx6", "ctx7",
      "change2",
      "ctx9", "ctx10", "ctx11",
    ];
    const newLines = [
      "ctx1", "ctx2", "ctx3",
      "CHANGE1",
      "ctx5", "ctx6", "ctx7",
      "CHANGE2",
      "ctx9", "ctx10", "ctx11",
    ];
    const f = file({
      path: "merged.ts",
      changeType: "edit",
      oldContent: oldLines.join("\n") + "\n",
      newContent: newLines.join("\n") + "\n",
    });
    const result = renderFileDiff(f);
    const hunkHeaders = result.match(/^@@ /gm) ?? [];
    expect(hunkHeaders.length).toBe(1);
  });
});

describe("renderFileDiff — context-line correctness", () => {
  it("emits exactly DEFAULT_CONTEXT_LINES context lines on each side of a change", () => {
    // File: 10 lines, change at line 5.
    const oldLines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
    const newLines = [...oldLines];
    newLines[4] = "CHANGED"; // change line 5 (0-indexed 4)
    const f = file({
      path: "ctx.ts",
      changeType: "edit",
      oldContent: oldLines.join("\n") + "\n",
      newContent: newLines.join("\n") + "\n",
    });
    const result = renderFileDiff(f);
    // Lines before change: line2, line3, line4 (3 context lines)
    expect(result).toContain(" line2");
    expect(result).toContain(" line3");
    expect(result).toContain(" line4");
    // Changed line
    expect(result).toContain("-line5");
    expect(result).toContain("+CHANGED");
    // Lines after change: line6, line7, line8 (3 context lines)
    expect(result).toContain(" line6");
    expect(result).toContain(" line7");
    expect(result).toContain(" line8");
    // Line1 and line9, line10 should NOT appear (outside context window).
    expect(result).not.toContain(" line1\n");
    expect(result).not.toContain(" line9\n");
    expect(result).not.toContain(" line10\n");
  });
});

describe("renderFileDiff — hunk-start line numbers (regression #92)", () => {
  // Reviewer-identified bug: start line was emitted as 0 when the hunk began
  // with a deletion (wrong newStart) or insertion (wrong oldStart). The fix
  // scans forward to find the first position each side contributes.

  it("delete first line of 5-line file → @@ -1,4 +1,3 @@ (not +0,3)", () => {
    // git diff: @@ -1,4 +1,3 @@
    const f = file({
      path: "del-first.ts",
      changeType: "edit",
      oldContent: "line1\nline2\nline3\nline4\nline5\n",
      newContent: "line2\nline3\nline4\nline5\n",
    });
    const result = renderFileDiff(f);
    expect(result).toContain("@@ -1,4 +1,3 @@");
  });

  it("change at line 1 of 8-line file → @@ -1,4 +1,4 @@ (not -1,4 +0,4)", () => {
    // git diff: @@ -1,4 +1,4 @@
    const f = file({
      path: "chg-first.ts",
      changeType: "edit",
      oldContent: "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\n",
      newContent: "LINE1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\n",
    });
    const result = renderFileDiff(f);
    expect(result).toContain("@@ -1,4 +1,4 @@");
  });

  it("insert a line at top of 5-line file → @@ -1,3 +1,4 @@ (not -0,3)", () => {
    // git diff: @@ -1,3 +1,4 @@
    const f = file({
      path: "ins-top.ts",
      changeType: "edit",
      oldContent: "line1\nline2\nline3\nline4\nline5\n",
      newContent: "NEW_LINE\nline1\nline2\nline3\nline4\nline5\n",
    });
    const result = renderFileDiff(f);
    expect(result).toContain("@@ -1,3 +1,4 @@");
  });

  it("pure new file still emits @@ -0,0 +1,N @@ (0 is correct here)", () => {
    // git diff: @@ -0,0 +1,3 @@  — 0 is correct because old side has no lines
    const f = file({
      path: "new-file.ts",
      changeType: "add",
      oldContent: "",
      newContent: "a\nb\nc\n",
    });
    const result = renderFileDiff(f);
    expect(result).toContain("@@ -0,0 +1,3 @@");
  });

  it("pure deleted file still emits @@ -1,N +0,0 @@ (0 is correct here)", () => {
    // git diff: @@ -1,3 +0,0 @@  — 0 is correct because new side has no lines
    const f = file({
      path: "del-file.ts",
      changeType: "delete",
      oldContent: "a\nb\nc\n",
      newContent: "",
    });
    const result = renderFileDiff(f);
    expect(result).toContain("@@ -1,3 +0,0 @@");
  });

  it("delete lines 3-4 of 6-line file → @@ -1,6 +1,4 @@", () => {
    // git diff: @@ -1,6 +1,4 @@  — context from line 1 covers the whole file
    const f = file({
      path: "del-mid.ts",
      changeType: "edit",
      oldContent: "line1\nline2\nline3\nline4\nline5\nline6\n",
      newContent: "line1\nline2\nline5\nline6\n",
    });
    const result = renderFileDiff(f);
    expect(result).toContain("@@ -1,6 +1,4 @@");
  });
});

describe("renderUnifiedDiff", () => {
  it("returns empty string for zero files", () => {
    expect(renderUnifiedDiff([])).toBe("");
  });

  it("preserves file order", () => {
    const a = file({ path: "a.ts", changeType: "add", oldContent: "", newContent: "aaa\n" });
    const b = file({ path: "b.ts", changeType: "add", oldContent: "", newContent: "bbb\n" });
    const result = renderUnifiedDiff([a, b]);
    const aIdx = result.indexOf("a.ts");
    const bIdx = result.indexOf("b.ts");
    expect(aIdx).toBeLessThan(bIdx);
  });

  it("concatenates multiple file sections correctly", () => {
    const a = file({ path: "a.ts", changeType: "edit", oldContent: "old\n", newContent: "new\n" });
    const b = file({ path: "b.ts", changeType: "add", oldContent: "", newContent: "hello\n" });
    const result = renderUnifiedDiff([a, b]);
    expect(result).toContain("diff --git a/a.ts b/a.ts");
    expect(result).toContain("diff --git a/b.ts b/b.ts");
    expect(result).toContain("-old");
    expect(result).toContain("+new");
    expect(result).toContain("+hello");
  });

  it("every non-empty output satisfies looksLikeUnifiedDiff", () => {
    const files = [
      file({ path: "x.ts", changeType: "edit", oldContent: "a\n", newContent: "b\n" }),
      file({ path: "y.png", changeType: "edit", isBinary: true }),
    ];
    const result = renderUnifiedDiff(files);
    expect(looksLikeUnifiedDiff(result)).toBe(true);
  });

  it("single file with no changes returns just the header", () => {
    const f = file({ path: "unchanged.ts", changeType: "edit", oldContent: "x\n", newContent: "x\n" });
    const result = renderUnifiedDiff([f]);
    expect(result).toContain("diff --git a/unchanged.ts b/unchanged.ts");
    expect(result).not.toContain("@@");
  });
});

describe("renderFileDiff — edge cases", () => {
  it("large pure addition emits correct line count in hunk header", () => {
    const lines = Array.from({ length: 5 }, (_, i) => `line${i + 1}`).join("\n") + "\n";
    const f = file({ path: "new5.ts", changeType: "add", oldContent: "", newContent: lines });
    const result = renderFileDiff(f);
    expect(result).toContain("@@ -0,0 +1,5 @@");
  });

  it("large pure deletion emits correct line count in hunk header", () => {
    const lines = Array.from({ length: 4 }, (_, i) => `line${i + 1}`).join("\n") + "\n";
    const f = file({ path: "del4.ts", changeType: "delete", oldContent: lines, newContent: "" });
    const result = renderFileDiff(f);
    expect(result).toContain("@@ -1,4 +0,0 @@");
  });

  it("custom contextLines=0 produces hunks with no context lines", () => {
    const f = file({
      path: "ctx0.ts",
      changeType: "edit",
      oldContent: "a\nb\nc\nd\ne\n",
      newContent: "a\nB\nc\nd\nE\n",
    });
    const result = renderFileDiff(f, 0);
    // With 0 context, each change block is its own hunk.
    const hunkHeaders = result.match(/^@@ /gm) ?? [];
    expect(hunkHeaders.length).toBeGreaterThanOrEqual(2);
    // No context lines (lines starting with a space) should appear.
    const bodyLines = result.split("\n").filter((l) => l.startsWith(" "));
    expect(bodyLines).toHaveLength(0);
  });

  it("old-content with no-newline, new-content adds a line", () => {
    // Old has one line with no trailing newline; new adds another line.
    const f = file({
      path: "nl.ts",
      changeType: "edit",
      oldContent: "foo", // no trailing \n
      newContent: "foo\nbar\n",
    });
    const result = renderFileDiff(f);
    // The diff should contain a hunk (new line was added).
    expect(result).toContain("@@");
    expect(result).toContain("+bar");
  });

  it("binary flag on add type emits Binary stub without hunks", () => {
    const f = file({
      path: "added.bin",
      changeType: "add",
      isBinary: true,
      oldContent: "",
      newContent: "",
    });
    const result = renderFileDiff(f);
    expect(result).toContain("Binary files a/added.bin and b/added.bin differ");
    expect(result).not.toContain("@@");
    expect(result).not.toContain("---");
  });
});
