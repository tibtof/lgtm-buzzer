import { describe, expect, it } from "vitest";
import { createProbe } from "./probe.js";
import type { Frame } from "@lgtm-buzzer/protocol";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeFrame = (kind: string, payload: Record<string, unknown> = {}): Frame =>
  ({ v: 1, kind, correlationId: "c-1", payload }) as Frame;

// ADR-29: probe no longer accepts vcsAdapterId or credentials
const stubInput = {
  llmAdapterId: "claude-cli",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createProbe — ADR-29 (no credentials in input)", () => {
  it("pong with matching nonce → Right<'ok'>", async () => {
    const probe = createProbe({
      sendFrame: async (frame) => {
        const payload = frame.payload as { nonce?: string };
        return makeFrame("pong", { nonce: payload.nonce });
      },
      newCorrelationId: () => "c-1",
      newNonce: () => "nonce-abc",
    });

    const result = await probe(stubInput);
    let value: string | undefined;
    let wasLeft = false;
    result.fold(
      () => { wasLeft = true; },
      (v) => { value = v; },
    );
    expect(wasLeft).toBe(false);
    expect(value).toBe("ok");
  });

  it("pong with different nonce → Left<nonce-mismatch>", async () => {
    const probe = createProbe({
      sendFrame: async () => makeFrame("pong", { nonce: "wrong-nonce" }),
      newCorrelationId: () => "c-1",
      newNonce: () => "nonce-abc",
    });

    const result = await probe(stubInput);
    let errorKind: string | undefined;
    result.fold(
      (e) => { errorKind = e.kind; },
      () => { /* noop */ },
    );
    expect(errorKind).toBe("nonce-mismatch");
  });

  it("error frame with 'missing-credentials' → Left<host-error> with reason propagated", async () => {
    const probe = createProbe({
      sendFrame: async () =>
        makeFrame("error", { reason: "missing-credentials", message: "gh auth login" }),
      newCorrelationId: () => "c-1",
      newNonce: () => "nonce-abc",
    });

    const result = await probe(stubInput);
    let errorKind: string | undefined;
    let errorReason: string | undefined;
    result.fold(
      (e) => {
        errorKind = e.kind;
        if (e.kind === "host-error") errorReason = e.reason;
      },
      () => { /* noop */ },
    );
    expect(errorKind).toBe("host-error");
    expect(errorReason).toBe("missing-credentials");
  });

  it("connect failed → Left<host-not-installed>", async () => {
    const probe = createProbe({
      sendFrame: async () =>
        makeFrame("error", {
          reason: "internal",
          message: "connect failed: native host not found",
        }),
      newCorrelationId: () => "c-1",
      newNonce: () => "nonce-abc",
    });

    const result = await probe(stubInput);
    let errorKind: string | undefined;
    result.fold(
      (e) => { errorKind = e.kind; },
      () => { /* noop */ },
    );
    expect(errorKind).toBe("host-not-installed");
  });

  it("probe sends a ping frame (no credentials field in payload)", async () => {
    let sentFrame: Frame | undefined;
    const probe = createProbe({
      sendFrame: async (frame) => {
        sentFrame = frame;
        const payload = frame.payload as { nonce?: string };
        return makeFrame("pong", { nonce: payload.nonce });
      },
      newCorrelationId: () => "c-1",
      newNonce: () => "nonce-abc",
    });

    await probe(stubInput);
    expect(sentFrame?.kind).toBe("ping");
    // probe must not include credentials in the ping payload
    expect(JSON.stringify(sentFrame?.payload)).not.toContain("credentials");
    expect(JSON.stringify(sentFrame?.payload)).not.toContain("apiKey");
    expect(JSON.stringify(sentFrame?.payload)).not.toContain("pat");
  });
});
