import { describe, expect, it } from "vitest";
import {
  AuthStatusSchema,
  CheckAuthResponseFrameSchema,
  CheckAuthResponsePayloadSchema,
} from "./check-auth-response.js";

const BASE = {
  v: 1 as const,
  kind: "check-auth-response" as const,
  correlationId: "cid-check-auth-resp",
};

describe("AuthStatusSchema", () => {
  it("parses a minimal ok:true status (no detail or hint)", () => {
    const result = AuthStatusSchema.safeParse({ adapterId: "github", ok: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.adapterId).toBe("github");
      expect(result.data.ok).toBe(true);
      expect(result.data.detail).toBeUndefined();
      expect(result.data.hint).toBeUndefined();
    }
  });

  it("parses a status with optional detail and hint", () => {
    const result = AuthStatusSchema.safeParse({
      adapterId: "claude-cli",
      ok: true,
      detail: "uses CLI's own login",
      hint: undefined,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.detail).toBe("uses CLI's own login");
    }
  });

  it("parses an ok:false status with hint", () => {
    const result = AuthStatusSchema.safeParse({
      adapterId: "github",
      ok: false,
      detail: "all sources exhausted",
      hint: "Run `gh auth login` or export GITHUB_TOKEN",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ok).toBe(false);
      expect(result.data.hint).toBe("Run `gh auth login` or export GITHUB_TOKEN");
    }
  });

  it("rejects empty adapterId", () => {
    const result = AuthStatusSchema.safeParse({ adapterId: "", ok: true });
    expect(result.success).toBe(false);
  });

  it("rejects empty detail string", () => {
    const result = AuthStatusSchema.safeParse({
      adapterId: "github",
      ok: true,
      detail: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects detail string longer than 200 chars (canary: no accidental token-in-detail)", () => {
    const longDetail = "x".repeat(201);
    const result = AuthStatusSchema.safeParse({
      adapterId: "github",
      ok: true,
      detail: longDetail,
    });
    expect(result.success).toBe(false);
  });

  it("rejects hint string longer than 200 chars", () => {
    const longHint = "y".repeat(201);
    const result = AuthStatusSchema.safeParse({
      adapterId: "github",
      ok: false,
      hint: longHint,
    });
    expect(result.success).toBe(false);
  });

  it("accepts detail and hint exactly at 200 chars", () => {
    const exactly200 = "a".repeat(200);
    const result = AuthStatusSchema.safeParse({
      adapterId: "github",
      ok: true,
      detail: exactly200,
      hint: exactly200,
    });
    expect(result.success).toBe(true);
  });
});

describe("CheckAuthResponsePayloadSchema", () => {
  it("parses an empty statuses array", () => {
    const result = CheckAuthResponsePayloadSchema.safeParse({ statuses: [] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.statuses).toHaveLength(0);
    }
  });

  it("parses multiple statuses with mixed ok values", () => {
    const result = CheckAuthResponsePayloadSchema.safeParse({
      statuses: [
        { adapterId: "claude-cli", ok: true, detail: "uses CLI's own login" },
        { adapterId: "github", ok: false, hint: "Run `gh auth login`" },
        { adapterId: "claude-api", ok: true, detail: "via ANTHROPIC_API_KEY env" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.statuses).toHaveLength(3);
      expect(result.data.statuses[0]?.ok).toBe(true);
      expect(result.data.statuses[1]?.ok).toBe(false);
    }
  });

  it("rejects when statuses is missing", () => {
    const result = CheckAuthResponsePayloadSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("CheckAuthResponseFrameSchema", () => {
  it("parses a well-formed check-auth-response frame with multiple statuses", () => {
    const result = CheckAuthResponseFrameSchema.safeParse({
      ...BASE,
      payload: {
        statuses: [
          { adapterId: "github", ok: true, detail: "via GITHUB_TOKEN env" },
          { adapterId: "ado", ok: false, hint: "Run `az login`" },
        ],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("check-auth-response");
      expect(result.data.payload.statuses).toHaveLength(2);
    }
  });

  it("parses with an empty statuses array", () => {
    const result = CheckAuthResponseFrameSchema.safeParse({
      ...BASE,
      payload: { statuses: [] },
    });
    expect(result.success).toBe(true);
  });

  it("accepts null correlationId", () => {
    const result = CheckAuthResponseFrameSchema.safeParse({
      ...BASE,
      correlationId: null,
      payload: { statuses: [] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects wrong frame kind", () => {
    const result = CheckAuthResponseFrameSchema.safeParse({
      ...BASE,
      kind: "pong",
      payload: { statuses: [] },
    });
    expect(result.success).toBe(false);
  });
});
