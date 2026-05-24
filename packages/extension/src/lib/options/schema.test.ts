import { describe, expect, it } from "vitest";
import {
  StoredOptionsSchema,
  SCHEMA_VERSION,
  DEFAULT_OPTIONS,
  STORAGE_KEY,
} from "./schema.js";

describe("StoredOptionsSchema — ADR-29 (v2)", () => {
  it("valid minimal options (schemaVersion only) round-trips", () => {
    const input = { schemaVersion: SCHEMA_VERSION };
    const result = StoredOptionsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ schemaVersion: 2 });
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

  it("v3-shaped payload (schemaVersion: 3) is rejected", () => {
    const input = { schemaVersion: 3 };
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

  it("STORAGE_KEY has the v2 string value", () => {
    expect(STORAGE_KEY).toBe("lgtm_buzzer.options.v2");
  });

  it("SCHEMA_VERSION is 2", () => {
    expect(SCHEMA_VERSION).toBe(2);
  });
});
