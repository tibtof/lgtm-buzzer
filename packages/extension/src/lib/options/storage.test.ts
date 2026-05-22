import { describe, expect, it } from "vitest";
import { createOptionsStore, type StorageArea } from "./storage.js";
import { STORAGE_KEY, SCHEMA_VERSION, type StoredOptions } from "./schema.js";

// ---------------------------------------------------------------------------
// Fake StorageArea
// ---------------------------------------------------------------------------

const makeStorageArea = (
  initial: Record<string, unknown> = {},
): StorageArea & { data: Record<string, unknown> } => {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    get: async (key: string) => ({ [key]: data[key] }),
    set: async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) {
        data[k] = v;
      }
    },
    remove: async (key: string) => {
      delete data[key]; // storage area test fake — key is safe
    },
  };
};

const makeThrowingArea = (method: "get" | "set" | "remove"): StorageArea => ({
  get: async () => {
    if (method === "get") throw new Error("quota exceeded");
    return {};
  },
  set: async () => {
    if (method === "set") throw new Error("quota exceeded");
  },
  remove: async () => {
    if (method === "remove") throw new Error("quota exceeded");
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const VALID_OPTIONS: StoredOptions = {
  schemaVersion: SCHEMA_VERSION,
  llmAdapterId: "claude-api",
  vcsAdapterId: "github",
  credentials: {
    "claude-api": { apiKey: "sk-ant-xxx" },
    github: { pat: "ghp_xxx" },
  },
};

describe("createOptionsStore", () => {
  it("read of empty storage returns Left<absent>", async () => {
    const area = makeStorageArea();
    const store = createOptionsStore({ area });
    const result = await store.read();
    let errorKind: string | undefined;
    let wasRight = false;
    result.fold(
      (e) => { errorKind = e.kind; },
      () => { wasRight = true; },
    );
    expect(wasRight).toBe(false);
    expect(errorKind).toBe("absent");
  });

  it("read of valid stored options returns Right<StoredOptions>", async () => {
    const area = makeStorageArea({ [STORAGE_KEY]: VALID_OPTIONS });
    const store = createOptionsStore({ area });
    const result = await store.read();
    let wasLeft = false;
    let llmAdapterId: string | undefined;
    result.fold(
      () => { wasLeft = true; },
      (opts) => { llmAdapterId = opts.llmAdapterId; },
    );
    expect(wasLeft).toBe(false);
    expect(llmAdapterId).toBe("claude-api");
  });

  it("read of corrupt value returns Left<corrupt> with non-empty issues", async () => {
    const area = makeStorageArea({
      [STORAGE_KEY]: { schemaVersion: 99, llmAdapterId: "" },
    });
    const store = createOptionsStore({ area });
    const result = await store.read();
    let errorKind: string | undefined;
    let issueCount = 0;
    result.fold(
      (e) => {
        errorKind = e.kind;
        if (e.kind === "corrupt") issueCount = e.issues.length;
      },
      () => { /* noop */ },
    );
    expect(errorKind).toBe("corrupt");
    expect(issueCount).toBeGreaterThan(0);
  });

  it("write of valid options calls area.set with STORAGE_KEY", async () => {
    const area = makeStorageArea();
    const store = createOptionsStore({ area });
    const result = await store.write(VALID_OPTIONS);
    let wasLeft = false;
    result.fold(
      () => { wasLeft = true; },
      () => { /* noop */ },
    );
    expect(wasLeft).toBe(false);
    expect(area.data[STORAGE_KEY]).toEqual(VALID_OPTIONS);
  });

  it("write failure returns Left<io>", async () => {
    const area = makeThrowingArea("set");
    const store = createOptionsStore({ area });
    const result = await store.write(VALID_OPTIONS);
    let errorKind: string | undefined;
    result.fold(
      (e) => { errorKind = e.kind; },
      () => { /* noop */ },
    );
    expect(errorKind).toBe("io");
  });

  it("clear removes the STORAGE_KEY", async () => {
    const area = makeStorageArea({ [STORAGE_KEY]: VALID_OPTIONS });
    const store = createOptionsStore({ area });
    const result = await store.clear();
    let wasLeft = false;
    result.fold(
      () => { wasLeft = true; },
      () => { /* noop */ },
    );
    expect(wasLeft).toBe(false);
    expect(area.data[STORAGE_KEY]).toBeUndefined();
  });
});
