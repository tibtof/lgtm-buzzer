import { describe, expect, it } from "vitest";
import {
  StoredOptionsSchema,
  SCHEMA_VERSION,
  DEFAULT_OPTIONS,
  STORAGE_KEY,
} from "./schema.js";

describe("StoredOptionsSchema", () => {
  it("valid minimal options (schemaVersion only) round-trips", () => {
    const input = { schemaVersion: SCHEMA_VERSION };
    const result = StoredOptionsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ schemaVersion: 1 });
    }
  });

  it("valid full options round-trip", () => {
    const input = {
      schemaVersion: SCHEMA_VERSION,
      llmAdapterId: "claude-api",
      vcsAdapterId: "github",
      credentials: {
        "claude-api": { apiKey: "sk-ant-xxx" },
        github: { pat: "ghp_xxx" },
      },
    };
    const result = StoredOptionsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.llmAdapterId).toBe("claude-api");
      expect(result.data.vcsAdapterId).toBe("github");
      expect(result.data.credentials?.["claude-api"]).toEqual({ apiKey: "sk-ant-xxx" });
    }
  });

  it("wrong schemaVersion yields parse failure", () => {
    const input = { schemaVersion: 2 };
    const result = StoredOptionsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("non-object credentials value yields parse failure", () => {
    const input = {
      schemaVersion: SCHEMA_VERSION,
      credentials: { github: "not-an-object" },
    };
    const result = StoredOptionsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("empty string llmAdapterId yields parse failure", () => {
    const input = { schemaVersion: SCHEMA_VERSION, llmAdapterId: "" };
    const result = StoredOptionsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("DEFAULT_OPTIONS satisfies the schema", () => {
    const result = StoredOptionsSchema.safeParse(DEFAULT_OPTIONS);
    expect(result.success).toBe(true);
  });

  it("STORAGE_KEY has the expected string value", () => {
    expect(STORAGE_KEY).toBe("lgtm_buzzer.options.v1");
  });
});
