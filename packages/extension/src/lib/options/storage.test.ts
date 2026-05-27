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
// Tests (ADR-29: v2 schema, no credentials)
// ---------------------------------------------------------------------------

const VALID_OPTIONS: StoredOptions = {
  schemaVersion: SCHEMA_VERSION,
  llmAdapterId: "claude-api",
};

describe("createOptionsStore — v3 schema", () => {
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

  it("read of valid v2 stored options returns Right<StoredOptions>", async () => {
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

  it("read of corrupt value (schemaVersion 99) returns Left<corrupt>", async () => {
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

  it("v1 key in storage is treated as absent (key mismatch, not corrupt)", async () => {
    // ADR-29: the reader uses the v2 key. If only a v1 entry exists, the v2
    // read returns Left<absent> — the v1 entry is silently ignored.
    const OLD_KEY = "lgtm_buzzer.options.v1";
    const area = makeStorageArea({
      [OLD_KEY]: { schemaVersion: 1, llmAdapterId: "claude-cli" },
    });
    const store = createOptionsStore({ area });
    const result = await store.read();
    let errorKind: string | undefined;
    result.fold(
      (e) => { errorKind = e.kind; },
      () => { /* noop */ },
    );
    // The v1 key is absent from the v2 storage read — returns absent, not corrupt.
    expect(errorKind).toBe("absent");
  });

  it("write of valid v2 options calls area.set with STORAGE_KEY", async () => {
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

  it("write only stores llmAdapterId and questionPoolSize — no vcsAdapterId or credentials", async () => {
    const area = makeStorageArea();
    const store = createOptionsStore({ area });
    const opts: StoredOptions = {
      schemaVersion: SCHEMA_VERSION,
      llmAdapterId: "claude-cli",
      questionPoolSize: 10,
    };
    await store.write(opts);
    const stored = area.data[STORAGE_KEY] as Record<string, unknown>;
    expect(stored["schemaVersion"]).toBe(3);
    expect(stored["llmAdapterId"]).toBe("claude-cli");
    expect(stored["questionPoolSize"]).toBe(10);
    expect(stored["vcsAdapterId"]).toBeUndefined();
    expect(stored["credentials"]).toBeUndefined();
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
