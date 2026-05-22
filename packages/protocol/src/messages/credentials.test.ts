import { describe, expect, it } from "vitest";
import { CredentialsBagSchema } from "./credentials.js";

describe("CredentialsBagSchema", () => {
  it("parses an empty object", () => {
    const result = CredentialsBagSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({});
    }
  });

  it("parses { apiKey: 'x' }", () => {
    const result = CredentialsBagSchema.safeParse({ apiKey: "x" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data["apiKey"]).toBe("x");
    }
  });

  it("parses multiple string entries", () => {
    const result = CredentialsBagSchema.safeParse({ pat: "ghp_abc", apiKey: "sk-ant-xyz" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data["pat"]).toBe("ghp_abc");
      expect(result.data["apiKey"]).toBe("sk-ant-xyz");
    }
  });

  it("rejects { apiKey: 123 } — non-string value", () => {
    const result = CredentialsBagSchema.safeParse({ apiKey: 123 });
    expect(result.success).toBe(false);
  });

  it("rejects null", () => {
    const result = CredentialsBagSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it("rejects a plain string", () => {
    const result = CredentialsBagSchema.safeParse("token");
    expect(result.success).toBe(false);
  });

  it("rejects an array", () => {
    const result = CredentialsBagSchema.safeParse(["token"]);
    expect(result.success).toBe(false);
  });
});
