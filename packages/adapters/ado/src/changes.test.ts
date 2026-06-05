/**
 * Unit tests for `toDiffFiles` — the pure mapping from a validated ADO
 * changes response to `PlannedFile` inputs.
 *
 * Fixtures include real shapes captured from a live ADO REST 7.1 instance
 * (org: Hackathon-2021, project/repo: Battleship, PR #82, 2026-06-05).
 * See the "live-API shapes" describe block below.
 */
import { describe, it, expect } from "vitest";
import { toDiffFiles } from "./changes.js";
import type { AdoChangesResponse } from "./schemas.js";
import { AdoChangesResponseSchema } from "./schemas.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid AdoChangesResponse builder. */
const makeResponse = (
  changeEntries: AdoChangesResponse["changeEntries"],
): AdoChangesResponse => ({ changeEntries });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("toDiffFiles — change type mapping", () => {
  it("changeType 'add' maps to 'add'", () => {
    const res = makeResponse([
      {
        changeType: "add",
        item: { path: "/src/new.ts", objectId: "abc123" },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files).toHaveLength(1);
    expect(files[0]?.changeType).toBe("add");
  });

  it("changeType 'edit' maps to 'edit'", () => {
    const res = makeResponse([
      {
        changeType: "edit",
        item: { path: "/src/foo.ts", objectId: "new1", originalObjectId: "old1" },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.changeType).toBe("edit");
  });

  it("changeType 'delete' maps to 'delete'", () => {
    const res = makeResponse([
      {
        changeType: "delete",
        item: { path: "/src/removed.ts", originalObjectId: "old1" },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.changeType).toBe("delete");
  });

  it("changeType 'rename' maps to 'rename'", () => {
    const res = makeResponse([
      {
        changeType: "rename",
        item: { path: "/src/new-name.ts", objectId: "blob1", originalObjectId: "blob0" },
        originalPath: "/src/old-name.ts",
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.changeType).toBe("rename");
  });

  it("changeType 'edit, rename' maps to 'rename' (rename takes priority)", () => {
    const res = makeResponse([
      {
        changeType: "edit, rename",
        item: { path: "/src/new.ts", objectId: "n1", originalObjectId: "o1" },
        originalPath: "/src/old.ts",
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.changeType).toBe("rename");
  });

  it("unknown change type string falls back to 'edit'", () => {
    const res = makeResponse([
      {
        changeType: "unknown-type",
        item: { path: "/src/x.ts", objectId: "x1" },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.changeType).toBe("edit");
  });
});

describe("toDiffFiles — binary detection", () => {
  it("contentMetadata.isBinary === true sets isBinary: true", () => {
    const res = makeResponse([
      {
        changeType: "edit",
        item: {
          path: "/assets/img.png",
          objectId: "b1",
          originalObjectId: "b0",
          contentMetadata: { isBinary: true },
        },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.isBinary).toBe(true);
  });

  it("contentMetadata.isBinary === false sets isBinary: false", () => {
    const res = makeResponse([
      {
        changeType: "edit",
        item: {
          path: "/src/foo.ts",
          objectId: "t1",
          originalObjectId: "t0",
          contentMetadata: { isBinary: false },
        },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.isBinary).toBe(false);
  });

  it("missing contentMetadata defaults isBinary to false", () => {
    const res = makeResponse([
      {
        changeType: "edit",
        item: { path: "/src/bar.ts", objectId: "b1", originalObjectId: "b0" },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.isBinary).toBe(false);
  });
});

describe("toDiffFiles — objectId normalisation", () => {
  it("all-zero objectId is normalised to undefined", () => {
    const res = makeResponse([
      {
        changeType: "add",
        item: {
          path: "/src/new.ts",
          objectId: "abc",
          originalObjectId: "0000000000000000000000000000000000000000",
        },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.oldObjectId).toBeUndefined();
    expect(files[0]?.newObjectId).toBe("abc");
  });

  it("absent objectId is undefined", () => {
    const res = makeResponse([
      {
        changeType: "delete",
        item: { path: "/src/gone.ts", originalObjectId: "del1" },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.newObjectId).toBeUndefined();
    expect(files[0]?.oldObjectId).toBe("del1");
  });

  it("valid objectId is preserved as-is", () => {
    const res = makeResponse([
      {
        changeType: "edit",
        item: { path: "/src/x.ts", objectId: "deadbeef", originalObjectId: "cafebabe" },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.newObjectId).toBe("deadbeef");
    expect(files[0]?.oldObjectId).toBe("cafebabe");
  });
});

describe("toDiffFiles — rename oldPath extraction", () => {
  it("originalPath is extracted as oldPath for renames", () => {
    const res = makeResponse([
      {
        changeType: "rename",
        item: { path: "/src/new.ts", objectId: "n1", originalObjectId: "o1" },
        originalPath: "/src/old.ts",
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.oldPath).toBe("src/old.ts");
  });

  it("non-rename entries have no oldPath", () => {
    const res = makeResponse([
      {
        changeType: "edit",
        item: { path: "/src/x.ts", objectId: "n1", originalObjectId: "o1" },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.oldPath).toBeUndefined();
  });
});

describe("toDiffFiles — filtering", () => {
  it("skips entries with isFolder === true", () => {
    const res = makeResponse([
      {
        changeType: "add",
        item: { path: "/src/newdir", isFolder: true },
      },
      {
        changeType: "add",
        item: { path: "/src/newfile.ts", objectId: "f1" },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("src/newfile.ts");
  });

  it("skips entries with gitObjectType === 'tree'", () => {
    const res = makeResponse([
      {
        changeType: "add",
        item: { path: "/src/folder", gitObjectType: "tree" },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files).toHaveLength(0);
  });

  it("skips entries with missing path", () => {
    const res = makeResponse([
      {
        changeType: "edit",
        item: { objectId: "x" },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files).toHaveLength(0);
  });

  it("strips leading slash from path", () => {
    const res = makeResponse([
      {
        changeType: "add",
        item: { path: "/src/file.ts", objectId: "abc" },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.path).toBe("src/file.ts");
  });

  it("path without leading slash is kept as-is", () => {
    const res = makeResponse([
      {
        changeType: "add",
        item: { path: "src/file.ts", objectId: "abc" },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.path).toBe("src/file.ts");
  });
});

describe("toDiffFiles — empty response", () => {
  it("returns empty array for empty changeEntries", () => {
    const res = makeResponse([]);
    expect(toDiffFiles(res)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests for null item.path on delete entries (live-API regression)
// ---------------------------------------------------------------------------

describe("toDiffFiles — null item.path on delete entries (live-API shapes)", () => {
  it("delete entry with item.path null and originalPath set uses originalPath as path", () => {
    // Real delete shape from Hackathon-2021/Battleship PR #82:
    // { changeTrackingId:13, originalPath:"/server-webflux/.../square.txt",
    //   changeId:13, item:{ originalObjectId:"AE82...", path:null }, changeType:"delete" }
    const res = makeResponse([
      {
        changeType: "delete",
        item: { path: null, originalObjectId: "AE82abc" },
        originalPath: "/server-webflux/src/main/resources/shapes/square.txt",
      },
    ]);
    const files = toDiffFiles(res);
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("server-webflux/src/main/resources/shapes/square.txt");
    expect(files[0]?.changeType).toBe("delete");
    expect(files[0]?.oldObjectId).toBe("AE82abc");
    expect(files[0]?.newObjectId).toBeUndefined();
    // oldPath is NOT set for pure deletes (only for renames).
    expect(files[0]?.oldPath).toBeUndefined();
  });

  it("delete entry: path derived from originalPath has leading slash stripped", () => {
    const res = makeResponse([
      {
        changeType: "delete",
        item: { path: null, originalObjectId: "deadbeef" },
        originalPath: "/src/removed.ts",
      },
    ]);
    const files = toDiffFiles(res);
    expect(files[0]?.path).toBe("src/removed.ts");
  });

  it("delete entry with both item.path null and originalPath absent is skipped", () => {
    const res = makeResponse([
      {
        changeType: "delete",
        item: { path: null, originalObjectId: "obj1" },
        // no originalPath
      },
    ]);
    const files = toDiffFiles(res);
    expect(files).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests for edit entries (live-API verified shape)
// ---------------------------------------------------------------------------

describe("toDiffFiles — edit entries (live-API verified shape)", () => {
  it("real edit shape: both objectIds present, path present, no contentMetadata", () => {
    // Real edit shape from Hackathon-2021/Battleship PR #82:
    // { changeTrackingId:1, changeId:1,
    //   item:{ objectId:"67D5...", originalObjectId:"C68E...",
    //          path:"/coroutines/.../TournamentSpec.kt" }, changeType:"edit" }
    const res = makeResponse([
      {
        changeType: "edit",
        item: {
          objectId: "67D5abc",
          originalObjectId: "C68Edef",
          path: "/coroutines/src/test/kotlin/TournamentSpec.kt",
        },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("coroutines/src/test/kotlin/TournamentSpec.kt");
    expect(files[0]?.changeType).toBe("edit");
    expect(files[0]?.newObjectId).toBe("67D5abc");
    expect(files[0]?.oldObjectId).toBe("C68Edef");
    expect(files[0]?.isBinary).toBe(false); // contentMetadata absent → false
    expect(files[0]?.oldPath).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests for add entries (live-API verified shape)
// ---------------------------------------------------------------------------

describe("toDiffFiles — add entries (live-API verified shape)", () => {
  it("add entry: objectId present, no originalObjectId, path present", () => {
    const res = makeResponse([
      {
        changeType: "add",
        item: {
          objectId: "abc123",
          path: "/src/NewClass.kt",
        },
      },
    ]);
    const files = toDiffFiles(res);
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("src/NewClass.kt");
    expect(files[0]?.changeType).toBe("add");
    expect(files[0]?.newObjectId).toBe("abc123");
    expect(files[0]?.oldObjectId).toBeUndefined();
    expect(files[0]?.oldPath).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Schema-level regression: item.path null, objectId null, originalObjectId null
// ---------------------------------------------------------------------------

describe("AdoChangesResponseSchema — nullish field acceptance (regression)", () => {
  it("item.path: null parses successfully (the live-API delete regression)", () => {
    const raw = {
      changeEntries: [
        {
          changeType: "delete",
          item: { path: null, originalObjectId: "AE82abc" },
          originalPath: "/server-webflux/shapes/square.txt",
        },
      ],
    };
    const result = AdoChangesResponseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("item.path: present string parses successfully", () => {
    const raw = {
      changeEntries: [
        {
          changeType: "edit",
          item: { path: "/src/Foo.kt", objectId: "abc", originalObjectId: "def" },
        },
      ],
    };
    const result = AdoChangesResponseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("item.path: absent (undefined) parses successfully", () => {
    const raw = {
      changeEntries: [
        {
          changeType: "edit",
          item: { objectId: "abc", originalObjectId: "def" },
        },
      ],
    };
    const result = AdoChangesResponseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("item.objectId: null parses successfully (delete has no new-side blob)", () => {
    const raw = {
      changeEntries: [
        {
          changeType: "delete",
          item: { path: null, objectId: null, originalObjectId: "AE82abc" },
          originalPath: "/shapes/square.txt",
        },
      ],
    };
    const result = AdoChangesResponseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("item.originalObjectId: null parses successfully (add has no old-side blob)", () => {
    const raw = {
      changeEntries: [
        {
          changeType: "add",
          item: { path: "/src/New.kt", objectId: "abc123", originalObjectId: null },
        },
      ],
    };
    const result = AdoChangesResponseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("full delete fixture with null path parses AND toDiffFiles derives correct path", () => {
    const raw = {
      changeEntries: [
        {
          changeTrackingId: 13,
          originalPath: "/server-webflux/src/main/resources/shapes/square.txt",
          changeId: 13,
          item: { originalObjectId: "AE82abc", path: null },
          changeType: "delete",
        },
      ],
    };
    const result = AdoChangesResponseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      const files = toDiffFiles(result.data);
      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe(
        "server-webflux/src/main/resources/shapes/square.txt",
      );
      expect(files[0]?.changeType).toBe("delete");
    }
  });

  it("full edit fixture (no contentMetadata) parses AND toDiffFiles yields isBinary false", () => {
    const raw = {
      changeEntries: [
        {
          changeTrackingId: 1,
          changeId: 1,
          item: {
            objectId: "67D5abc",
            originalObjectId: "C68Edef",
            path: "/coroutines/src/test/kotlin/TournamentSpec.kt",
          },
          changeType: "edit",
        },
      ],
    };
    const result = AdoChangesResponseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      const files = toDiffFiles(result.data);
      expect(files[0]?.isBinary).toBe(false);
    }
  });
});
