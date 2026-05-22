import { describe, expect, it } from "vitest";
import { ListAdaptersRequestFrameSchema } from "./list-adapters-request.js";

const BASE = {
  v: 1 as const,
  kind: "list-adapters-request" as const,
  correlationId: "cid-lar",
};

describe("ListAdaptersRequestFrameSchema", () => {
  it("parses a well-formed list-adapters-request frame with empty payload", () => {
    const result = ListAdaptersRequestFrameSchema.safeParse({
      ...BASE,
      payload: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("list-adapters-request");
    }
  });

  it("parses a well-formed list-adapters-request frame with null correlationId", () => {
    const result = ListAdaptersRequestFrameSchema.safeParse({
      v: 1,
      kind: "list-adapters-request",
      correlationId: null,
      payload: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects a frame with unknown extra field in payload (strict)", () => {
    const result = ListAdaptersRequestFrameSchema.safeParse({
      ...BASE,
      payload: { extra: "field" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a frame with missing kind", () => {
    const result = ListAdaptersRequestFrameSchema.safeParse({
      v: 1,
      correlationId: "cid",
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects a frame with wrong kind", () => {
    const result = ListAdaptersRequestFrameSchema.safeParse({
      ...BASE,
      kind: "ping",
      payload: {},
    });
    expect(result.success).toBe(false);
  });
});
