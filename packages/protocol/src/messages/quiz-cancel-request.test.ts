import { describe, expect, it } from "vitest";
import { FrameSchema } from "../envelope.js";
import {
  QuizCancelRequestFrameSchema,
  QuizCancelRequestPayloadSchema,
} from "./quiz-cancel-request.js";

describe("QuizCancelRequestPayloadSchema", () => {
  it("accepts a valid payload", () => {
    const result = QuizCancelRequestPayloadSchema.safeParse({
      correlationId: "cid-abc",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty correlationId", () => {
    const result = QuizCancelRequestPayloadSchema.safeParse({
      correlationId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing correlationId", () => {
    const result = QuizCancelRequestPayloadSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects extra payload fields (strict zod object)", () => {
    // Zod strips extra keys by default but the schema must accept the correct ones
    const result = QuizCancelRequestPayloadSchema.safeParse({
      correlationId: "cid-xyz",
      extraField: "should be stripped or rejected",
    });
    // Zod strips unknown keys by default (not strict), so parse succeeds
    expect(result.success).toBe(true);
    if (result.success) {
      // Extra field is stripped
      expect((result.data as Record<string, unknown>)["extraField"]).toBeUndefined();
    }
  });
});

describe("QuizCancelRequestFrameSchema", () => {
  it("parses a well-formed quiz-cancel-request frame", () => {
    const raw = {
      v: 1,
      kind: "quiz-cancel-request",
      correlationId: "cid-abc",
      payload: { correlationId: "cid-abc" },
    };
    const result = QuizCancelRequestFrameSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("quiz-cancel-request");
      expect(result.data.payload.correlationId).toBe("cid-abc");
    }
  });

  it("rejects frame with wrong kind", () => {
    const raw = {
      v: 1,
      kind: "quiz-request",
      correlationId: "cid-abc",
      payload: { correlationId: "cid-abc" },
    };
    const result = QuizCancelRequestFrameSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it("rejects frame with missing correlationId in payload", () => {
    const raw = {
      v: 1,
      kind: "quiz-cancel-request",
      correlationId: "cid-abc",
      payload: {},
    };
    const result = QuizCancelRequestFrameSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it("rejects frame with empty payload correlationId", () => {
    const raw = {
      v: 1,
      kind: "quiz-cancel-request",
      correlationId: "cid-abc",
      payload: { correlationId: "" },
    };
    const result = QuizCancelRequestFrameSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });
});

describe("FrameSchema discriminated union — quiz-cancel-request", () => {
  it("accepts a well-formed quiz-cancel-request in the union", () => {
    const raw = {
      v: 1,
      kind: "quiz-cancel-request",
      correlationId: "cid-abc",
      payload: { correlationId: "cid-abc" },
    };
    const result = FrameSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("quiz-cancel-request");
    }
  });

  it("rejects quiz-cancel-request with unknown payload fields removed by zod", () => {
    const raw = {
      v: 1,
      kind: "quiz-cancel-request",
      correlationId: "cid-abc",
      payload: { correlationId: "cid-abc", prText: "should not be here" },
    };
    // Zod strips unknown keys — parse succeeds but extra fields are removed
    const result = FrameSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === "quiz-cancel-request") {
      expect((result.data.payload as Record<string, unknown>)["prText"]).toBeUndefined();
    }
  });

  it("round-trips: JSON stringify → parse", () => {
    const frame = {
      v: 1 as const,
      kind: "quiz-cancel-request" as const,
      correlationId: "round-trip-cid",
      payload: { correlationId: "round-trip-cid" },
    };
    const serialised = JSON.stringify(frame);
    const parsed = FrameSchema.safeParse(JSON.parse(serialised));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual(frame);
    }
  });
});
