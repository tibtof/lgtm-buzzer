/**
 * Unit tests for `toDiffFiles` — the pure mapping from a validated ADO
 * changes response to `PlannedFile` inputs.
 */
import { describe, it, expect } from "vitest";
import { toDiffFiles } from "./changes.js";
import type { AdoChangesResponse } from "./schemas.js";

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
