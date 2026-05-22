import { describe, expect, it } from "vitest";
import { ErrorFrameSchema } from "./error.js";

const BASE = {
  v: 1 as const,
  kind: "error" as const,
  correlationId: "cid-error",
};

describe("ErrorFrameSchema", () => {
  const reasons = [
    "schema-violation",
    "unknown-message",
    "version-mismatch",
    "internal",
  ] as const;

  for (const reason of reasons) {
    it(`parses a well-formed error frame with reason "${reason}"`, () => {
      const result = ErrorFrameSchema.safeParse({
        ...BASE,
        payload: { reason, message: "an error occurred" },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.payload.reason).toBe(reason);
      }
    });
  }

  it("rejects an error frame with an unknown reason", () => {
    const result = ErrorFrameSchema.safeParse({
      ...BASE,
      payload: { reason: "not-a-reason", message: "oops" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an error frame with an empty message", () => {
    const result = ErrorFrameSchema.safeParse({
      ...BASE,
      payload: { reason: "internal", message: "" },
    });
    expect(result.success).toBe(false);
  });

  it("parses an error frame when details is omitted", () => {
    const result = ErrorFrameSchema.safeParse({
      ...BASE,
      payload: { reason: "schema-violation", message: "bad frame" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.details).toBeUndefined();
    }
  });

  it("parses an error frame when details has an unknown shape", () => {
    const result = ErrorFrameSchema.safeParse({
      ...BASE,
      payload: {
        reason: "schema-violation",
        message: "bad frame",
        details: { foo: [1, 2, 3], bar: null },
      },
    });
    expect(result.success).toBe(true);
  });
});
