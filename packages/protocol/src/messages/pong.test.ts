import { describe, expect, it } from "vitest";
import { PongFrameSchema } from "./pong.js";

const BASE = {
  v: 1 as const,
  kind: "pong" as const,
  correlationId: "cid-pong",
};

describe("PongFrameSchema", () => {
  it("parses a pong frame with a nonce present", () => {
    const result = PongFrameSchema.safeParse({
      ...BASE,
      payload: { nonce: "echo-abc123" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.nonce).toBe("echo-abc123");
    }
  });

  it("parses a pong frame with nonce omitted", () => {
    const result = PongFrameSchema.safeParse({ ...BASE, payload: {} });
    expect(result.success).toBe(true);
  });

  it("rejects a pong frame with an empty nonce", () => {
    const result = PongFrameSchema.safeParse({
      ...BASE,
      payload: { nonce: "" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a pong frame with a non-string nonce", () => {
    const result = PongFrameSchema.safeParse({
      ...BASE,
      payload: { nonce: true },
    });
    expect(result.success).toBe(false);
  });
});
