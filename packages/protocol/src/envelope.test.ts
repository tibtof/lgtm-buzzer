import { describe, expect, it } from "vitest";
import { FrameSchema } from "./envelope.js";

const VALID_PING = {
  v: 1,
  kind: "ping",
  correlationId: "cid-001",
  payload: {},
};

const VALID_PONG = {
  v: 1,
  kind: "pong",
  correlationId: "cid-002",
  payload: {},
};

const VALID_ERROR = {
  v: 1,
  kind: "error",
  correlationId: "cid-003",
  payload: { reason: "internal", message: "something went wrong" },
};

describe("FrameSchema", () => {
  it("parses a well-formed ping frame", () => {
    const result = FrameSchema.safeParse(VALID_PING);
    expect(result.success).toBe(true);
  });

  it("parses a well-formed pong frame", () => {
    const result = FrameSchema.safeParse(VALID_PONG);
    expect(result.success).toBe(true);
  });

  it("parses a well-formed error frame", () => {
    const result = FrameSchema.safeParse(VALID_ERROR);
    expect(result.success).toBe(true);
  });

  it("rejects a frame with missing v", () => {
    const frame: Record<string, unknown> = { ...VALID_PING };
    delete frame["v"];
    const result = FrameSchema.safeParse(frame);
    expect(result.success).toBe(false);
  });

  it("rejects a frame with wrong v", () => {
    const result = FrameSchema.safeParse({ ...VALID_PING, v: 2 });
    expect(result.success).toBe(false);
  });

  it("rejects a frame with missing kind", () => {
    const frame: Record<string, unknown> = { ...VALID_PING };
    delete frame["kind"];
    const result = FrameSchema.safeParse(frame);
    expect(result.success).toBe(false);
  });

  it("rejects a frame with unknown kind", () => {
    const result = FrameSchema.safeParse({ ...VALID_PING, kind: "quux" });
    expect(result.success).toBe(false);
  });

  it("rejects a frame with missing correlationId", () => {
    const frame: Record<string, unknown> = { ...VALID_PING };
    delete frame["correlationId"];
    const result = FrameSchema.safeParse(frame);
    expect(result.success).toBe(false);
  });

  it("accepts a frame with null correlationId (unsolicited host event)", () => {
    const result = FrameSchema.safeParse({ ...VALID_PING, correlationId: null });
    expect(result.success).toBe(true);
  });

  it("rejects a frame with empty-string correlationId", () => {
    const result = FrameSchema.safeParse({ ...VALID_PING, correlationId: "" });
    expect(result.success).toBe(false);
  });
});
