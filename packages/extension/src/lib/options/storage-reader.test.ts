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
// Tests
// ---------------------------------------------------------------------------

describe("readSwOptions", () => {
  it("empty storage → all-undefined projection", async () => {
    const store = makeEmptyStore();
    const read = readSwOptions({ store });
    const projection = await read();
    expect(projection.llmAdapterId).toBeUndefined();
    expect(projection.vcsAdapterId).toBeUndefined();
    expect(projection.credentials).toBeUndefined();
  });

  it("stored claude-api with creds → projection carries apiKey", async () => {
    const store = makeStoreWithData({
      schemaVersion: SCHEMA_VERSION,
      llmAdapterId: "claude-api",
      credentials: { "claude-api": { apiKey: "sk-x" } },
    });
    const read = readSwOptions({ store });
    const projection = await read();
    expect(projection.llmAdapterId).toBe("claude-api");
    expect(projection.vcsAdapterId).toBeUndefined();
    expect(projection.credentials).toEqual({ apiKey: "sk-x" });
  });

  it("stored LLM + VCS both with creds → projection merges both bags (VCS wins)", async () => {
    const store = makeStoreWithData({
      schemaVersion: SCHEMA_VERSION,
      llmAdapterId: "claude-api",
      vcsAdapterId: "github",
      credentials: {
        "claude-api": { apiKey: "sk-x" },
        github: { pat: "ghp_xxx" },
      },
    });
    const read = readSwOptions({ store });
    const projection = await read();
    expect(projection.llmAdapterId).toBe("claude-api");
    expect(projection.vcsAdapterId).toBe("github");
    expect(projection.credentials).toEqual({ apiKey: "sk-x", pat: "ghp_xxx" });
  });

  it("stored llmAdapterId but no credentials entry → credentials: undefined (not empty {})", async () => {
    const store = makeStoreWithData({
      schemaVersion: SCHEMA_VERSION,
      llmAdapterId: "claude-cli",
      // No credentials field at all
    });
    const read = readSwOptions({ store });
    const projection = await read();
    expect(projection.llmAdapterId).toBe("claude-cli");
    expect(projection.credentials).toBeUndefined();
  });

  it("corrupt storage → projection is all-undefined, no throw", async () => {
    const store = makeCorruptStore();
    const read = readSwOptions({ store });
    const projection = await read();
    expect(projection.llmAdapterId).toBeUndefined();
    expect(projection.vcsAdapterId).toBeUndefined();
    expect(projection.credentials).toBeUndefined();
  });

  it("VCS creds win on key conflict", async () => {
    const store = makeStoreWithData({
      schemaVersion: SCHEMA_VERSION,
      llmAdapterId: "claude-api",
      vcsAdapterId: "github",
      credentials: {
        // both define 'pat'; vcs should win
        "claude-api": { pat: "llm-pat" },
        github: { pat: "vcs-pat" },
      },
    });
    const read = readSwOptions({ store });
    const projection = await read();
    expect(projection.credentials).toEqual({ pat: "vcs-pat" });
  });
});
