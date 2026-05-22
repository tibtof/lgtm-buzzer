import { describe, expect, it } from "vitest";
import { CSRequestSchema, CSResponseSchema } from "./cs-protocol.js";

describe("CSRequestSchema", () => {
  it("accepts a well-formed send-frame request", () => {
    const input = {
      kind: "send-frame",
      frame: {
        v: 1,
        kind: "ping",
        correlationId: "corr-1",
        payload: {},
      },
    };
    const result = CSRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects an unknown outer kind", () => {
    const input = { kind: "unknown-kind", frame: {} };
    const result = CSRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("CSResponseSchema", () => {
  it("accepts a frame response wrapping an ErrorFrame", () => {
    const input = {
      kind: "frame",
      frame: {
        v: 1,
        kind: "error",
        correlationId: "corr-1",
        payload: { reason: "internal", message: "host disconnected" },
      },
    };
    const result = CSResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects a sw-error with an empty message", () => {
    const input = {
      kind: "sw-error",
      reason: "internal",
      message: "",
    };
    const result = CSResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
