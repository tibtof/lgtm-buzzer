import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { parseFrame } from "./parse.js";
import type { Frame } from "./envelope.js";

const PING_FRAME = {
  v: 1,
  kind: "ping",
  correlationId: "cid-001",
  payload: {},
};

const PONG_FRAME = {
  v: 1,
  kind: "pong",
  correlationId: "cid-002",
  payload: { nonce: "roundtrip" },
};

const ERROR_FRAME = {
  v: 1,
  kind: "error",
  correlationId: "cid-003",
  payload: { reason: "internal", message: "oops" },
};

describe("parseFrame", () => {
  it("returns success for a well-formed ping frame", () => {
    const result = parseFrame(PING_FRAME);
    expect(result.success).toBe(true);
  });

  it("returns success for a well-formed pong frame", () => {
    const result = parseFrame(PONG_FRAME);
    expect(result.success).toBe(true);
  });

  it("returns success for a well-formed error frame", () => {
    const result = parseFrame(ERROR_FRAME);
    expect(result.success).toBe(true);
  });

  it("returns failure for a string input without throwing", () => {
    const result = parseFrame("hello");
    expect(result.success).toBe(false);
  });

  it("returns failure for null without throwing", () => {
    const result = parseFrame(null);
    expect(result.success).toBe(false);
  });

  it("returns failure for a number without throwing", () => {
    const result = parseFrame(42);
    expect(result.success).toBe(false);
  });

  it("returns failure for an array without throwing", () => {
    const result = parseFrame([]);
    expect(result.success).toBe(false);
  });

  it("attaches a ZodError on failure", () => {
    const result = parseFrame("garbage");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ZodError);
    }
  });

  it("narrows result.data to Frame on the happy path (TS narrowing)", () => {
    const result = parseFrame(PING_FRAME);
    if (result.success) {
      // If the return type were SafeParseReturnType<unknown, unknown> this line
      // would be a type error — it compiles only when data is typed as Frame.
      const frame: Frame = result.data;
      expect(frame.kind).toBe("ping");
    }
  });
});
