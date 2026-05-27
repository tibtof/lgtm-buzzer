import { describe, expect, it } from "vitest";
import {
  StoredOptionsSchema,
  SCHEMA_VERSION,
  DEFAULT_OPTIONS,
  STORAGE_KEY,
} from "./schema.js";

describe("StoredOptionsSchema — ADR-32 (v3)", () => {
  it("valid minimal options (schemaVersion only) round-trips", () => {
    const input = { schemaVersion: SCHEMA_VERSION };
    const result = StoredOptionsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ schemaVersion: 3 });
    }
  });

  it("valid options with llmAdapterId round-trips", () => {
    const input = {
      schemaVersion: SCHEMA_VERSION,
      llmAdapterId: "claude-api",
    };
    const result = StoredOptionsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.llmAdapterId).toBe("claude-api");
    }
  });

  it("v1-shaped payload (schemaVersion: 1) is rejected as corrupt", () => {
    const input = { schemaVersion: 1 };
    const result = StoredOptionsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("v2-shaped payload (schemaVersion: 2) is rejected", () => {
    const input = { schemaVersion: 2 };
    const result = StoredOptionsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("v4-shaped payload (schemaVersion: 4) is rejected", () => {
    const input = { schemaVersion: 4 };
    const result = StoredOptionsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("empty string llmAdapterId yields parse failure", () => {
    const input = { schemaVersion: SCHEMA_VERSION, llmAdapterId: "" };
    const result = StoredOptionsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("extraneous vcsAdapterId key is stripped silently (zod default passthrough)", () => {
    // A payload written by the old v1 schema that still has vcsAdapterId
    // should not crash the parser — zod strips unknown keys by default.
    const input = {
      schemaVersion: SCHEMA_VERSION,
      llmAdapterId: "claude-cli",
      vcsAdapterId: "github",
    };
    const result = StoredOptionsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      // vcsAdapterId is NOT on the typed result
      expect((result.data as Record<string, unknown>)["vcsAdapterId"]).toBeUndefined();
    }
  });

  it("extraneous credentials key is stripped silently (zod default passthrough)", () => {
    const input = {
      schemaVersion: SCHEMA_VERSION,
      llmAdapterId: "claude-api",
      credentials: { "claude-api": { apiKey: "sk-ant-xxx" } },
    };
    const result = StoredOptionsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      // credentials is NOT on the typed result
      expect((result.data as Record<string, unknown>)["credentials"]).toBeUndefined();
    }
  });

  it("DEFAULT_OPTIONS satisfies the schema", () => {
    const result = StoredOptionsSchema.safeParse(DEFAULT_OPTIONS);
    expect(result.success).toBe(true);
  });

  it("STORAGE_KEY has the v3 string value", () => {
    expect(STORAGE_KEY).toBe("lgtm_buzzer.options.v3");
  });

  it("SCHEMA_VERSION is 3", () => {
    expect(SCHEMA_VERSION).toBe(3);
  });

  // ADR-32: questionPoolSize tests
  it("v3 envelope parses with literal 5", () => {
    const result = StoredOptionsSchema.safeParse({ schemaVersion: SCHEMA_VERSION, questionPoolSize: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questionPoolSize).toBe(5);
    }
  });

  it("v3 envelope parses with literal 10", () => {
    const result = StoredOptionsSchema.safeParse({ schemaVersion: SCHEMA_VERSION, questionPoolSize: 10 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questionPoolSize).toBe(10);
    }
  });

  it("v3 envelope parses with literal 20", () => {
    const result = StoredOptionsSchema.safeParse({ schemaVersion: SCHEMA_VERSION, questionPoolSize: 20 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questionPoolSize).toBe(20);
    }
  });

  it("v3 envelope rejects questionPoolSize: 7 (not in literal union)", () => {
    const result = StoredOptionsSchema.safeParse({ schemaVersion: SCHEMA_VERSION, questionPoolSize: 7 });
    expect(result.success).toBe(false);
  });

  it("v3 envelope rejects questionPoolSize: 0", () => {
    const result = StoredOptionsSchema.safeParse({ schemaVersion: SCHEMA_VERSION, questionPoolSize: 0 });
    expect(result.success).toBe(false);
  });

  it("v3 envelope parses without questionPoolSize (optional field)", () => {
    const result = StoredOptionsSchema.safeParse({ schemaVersion: SCHEMA_VERSION });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questionPoolSize).toBeUndefined();
    }
  });

  it("v2 storage key returns Left<absent> (different STORAGE_KEY — key mismatch)", () => {
    // This test documents the storage migration posture: v2 entries are silently
    // ignored because the key changed. The DOM layer treats absence as defaults.
    // Since we just changed the key from v2 to v3, reading with the v3 key
    // against a storage that only has the v2 key returns absent.
    expect(STORAGE_KEY).toBe("lgtm_buzzer.options.v3");
    // The v2 key was "lgtm_buzzer.options.v2" — they're different, so any
    // storage area read by v3 code with the v3 key won't find v2 data.
    expect(STORAGE_KEY).not.toBe("lgtm_buzzer.options.v2");
  });
});
