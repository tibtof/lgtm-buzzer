import { describe, expect, it } from "vitest";
import { readSwOptions } from "./storage-reader.js";
import { createOptionsStore, type OptionsStore } from "./storage.js";
import { SCHEMA_VERSION, type StoredOptions } from "./schema.js";

// ---------------------------------------------------------------------------
// Fake OptionsStore helpers
// ---------------------------------------------------------------------------

const makeStoreWithData = (data: StoredOptions): OptionsStore => {
  const area = {
    get: async (key: string) => ({ [key]: data }),
    set: async () => { /* noop */ },
    remove: async () => { /* noop */ },
  };
  return createOptionsStore({ area });
};

const makeEmptyStore = (): OptionsStore => {
  const area = {
    get: async (key: string) => ({ [key]: undefined }),
    set: async () => { /* noop */ },
    remove: async () => { /* noop */ },
  };
  return createOptionsStore({ area });
};

const makeCorruptStore = (): OptionsStore => {
  const area = {
    get: async (key: string) => ({ [key]: { schemaVersion: 99 } }),
    set: async () => { /* noop */ },
    remove: async () => { /* noop */ },
  };
  return createOptionsStore({ area });
};

// ---------------------------------------------------------------------------
// Tests (ADR-32: slim projection — llmAdapterId + questionPoolSize)
// ---------------------------------------------------------------------------

describe("readSwOptions — ADR-32 slim projection", () => {
  it("empty storage → { llmAdapterId: undefined, questionPoolSize: undefined }", async () => {
    const store = makeEmptyStore();
    const read = readSwOptions({ store });
    const projection = await read();
    expect(projection.llmAdapterId).toBeUndefined();
    expect(projection.questionPoolSize).toBeUndefined();
    // No vcsAdapterId or credentials on the type
    expect(Object.keys(projection)).toEqual(["llmAdapterId", "questionPoolSize"]);
  });

  it("stored llmAdapterId: 'claude-api' → projection carries it", async () => {
    const store = makeStoreWithData({
      schemaVersion: SCHEMA_VERSION,
      llmAdapterId: "claude-api",
    });
    const read = readSwOptions({ store });
    const projection = await read();
    expect(projection.llmAdapterId).toBe("claude-api");
  });

  it("stored llmAdapterId: 'claude-cli' → projection carries it", async () => {
    const store = makeStoreWithData({
      schemaVersion: SCHEMA_VERSION,
      llmAdapterId: "claude-cli",
    });
    const read = readSwOptions({ store });
    const projection = await read();
    expect(projection.llmAdapterId).toBe("claude-cli");
  });

  it("corrupt storage → { llmAdapterId: undefined, questionPoolSize: undefined }, no throw", async () => {
    const store = makeCorruptStore();
    const read = readSwOptions({ store });
    const projection = await read();
    expect(projection.llmAdapterId).toBeUndefined();
    expect(projection.questionPoolSize).toBeUndefined();
  });

  it("storage with only schemaVersion → { llmAdapterId: undefined, questionPoolSize: undefined }", async () => {
    const store = makeStoreWithData({ schemaVersion: SCHEMA_VERSION });
    const read = readSwOptions({ store });
    const projection = await read();
    expect(projection.llmAdapterId).toBeUndefined();
    expect(projection.questionPoolSize).toBeUndefined();
  });

  it("stored questionPoolSize: 10 → projection carries 10", async () => {
    const store = makeStoreWithData({
      schemaVersion: SCHEMA_VERSION,
      questionPoolSize: 10,
    });
    const read = readSwOptions({ store });
    const projection = await read();
    expect(projection.questionPoolSize).toBe(10);
  });

  it("stored questionPoolSize: 20 → projection carries 20", async () => {
    const store = makeStoreWithData({
      schemaVersion: SCHEMA_VERSION,
      questionPoolSize: 20,
    });
    const read = readSwOptions({ store });
    const projection = await read();
    expect(projection.questionPoolSize).toBe(20);
  });

  it("stored questionPoolSize: 5 → projection carries 5", async () => {
    const store = makeStoreWithData({
      schemaVersion: SCHEMA_VERSION,
      questionPoolSize: 5,
    });
    const read = readSwOptions({ store });
    const projection = await read();
    expect(projection.questionPoolSize).toBe(5);
  });
});
