import { describe, expect, it } from "vitest";
import { CheckAuthRequestFrameSchema, CheckAuthRequestPayloadSchema } from "./check-auth-request.js";

const BASE = {
  v: 1 as const,
  kind: "check-auth-request" as const,
  correlationId: "cid-check-auth",
};

describe("CheckAuthRequestPayloadSchema", () => {
  it("parses an empty payload", () => {
    const result = CheckAuthRequestPayloadSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects an extra field (strict)", () => {
    const result = CheckAuthRequestPayloadSchema.safeParse({ extra: "field" });
    expect(result.success).toBe(false);
  });
});

describe("CheckAuthRequestFrameSchema", () => {
  it("parses a well-formed check-auth-request frame", () => {
    const result = CheckAuthRequestFrameSchema.safeParse({
      ...BASE,
      payload: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("check-auth-request");
      expect(result.data.correlationId).toBe("cid-check-auth");
    }
  });

  it("rejects when payload has extra fields (strict payload)", () => {
    const result = CheckAuthRequestFrameSchema.safeParse({
      ...BASE,
      payload: { unexpected: "value" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects wrong frame kind", () => {
    const result = CheckAuthRequestFrameSchema.safeParse({
      ...BASE,
      kind: "ping",
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects null correlationId replacement with non-null/string", () => {
    const result = CheckAuthRequestFrameSchema.safeParse({
      ...BASE,
      correlationId: 42,
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it("accepts null correlationId", () => {
    const result = CheckAuthRequestFrameSchema.safeParse({
      ...BASE,
      correlationId: null,
      payload: {},
    });
    expect(result.success).toBe(true);
  });
});
