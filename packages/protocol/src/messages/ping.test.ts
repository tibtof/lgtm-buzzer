import { describe, expect, it } from "vitest";
import { PingFrameSchema } from "./ping.js";

const BASE = {
  v: 1 as const,
  kind: "ping" as const,
  correlationId: "cid-ping",
};

describe("PingFrameSchema", () => {
  it("parses a ping frame with a nonce present", () => {
    const result = PingFrameSchema.safeParse({
      ...BASE,
      payload: { nonce: "abc123" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.nonce).toBe("abc123");
    }
  });

  it("parses a ping frame with nonce omitted", () => {
    const result = PingFrameSchema.safeParse({ ...BASE, payload: {} });
    expect(result.success).toBe(true);
  });

  it("rejects a ping frame with an empty nonce", () => {
    const result = PingFrameSchema.safeParse({
      ...BASE,
      payload: { nonce: "" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a ping frame with a non-string nonce", () => {
    const result = PingFrameSchema.safeParse({
      ...BASE,
      payload: { nonce: 42 },
    });
    expect(result.success).toBe(false);
  });
});
