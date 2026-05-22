import { describe, expect, it } from "vitest";
import { createProbe } from "./probe.js";
import type { Frame } from "@lgtm-buzzer/protocol";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeFrame = (kind: string, payload: Record<string, unknown> = {}): Frame =>
  ({ v: 1, kind, correlationId: "c-1", payload }) as Frame;

const stubInput = {
  llmAdapterId: "claude-cli",
  vcsAdapterId: "github",
  credentials: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createProbe", () => {
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

  it("error frame with 'bad-credentials' → Left<host-error> with reason propagated", async () => {
    const probe = createProbe({
      sendFrame: async () =>
        makeFrame("error", { reason: "bad-credentials", message: "invalid key" }),
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
    expect(errorReason).toBe("bad-credentials");
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
});
