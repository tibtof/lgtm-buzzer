import { describe, expect, it } from "vitest";
import { createSWBridge, createListAdapters } from "./sw-bridge.js";
import type { Frame } from "@lgtm-buzzer/protocol";
import type { CSResponse } from "../cs-protocol.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeFrame = (
  kind: string,
  payload: Record<string, unknown> = {},
): Frame => ({ v: 1, kind, correlationId: "c-1", payload }) as Frame;

const wrapInCSResponse = (frame: Frame): CSResponse => ({
  kind: "frame",
  frame,
});

// ---------------------------------------------------------------------------
// createSWBridge tests
// ---------------------------------------------------------------------------

describe("createSWBridge", () => {
  it("well-formed SW reply returns the inner frame", async () => {
    const pong = makeFrame("pong", { nonce: "abc" });
    const bridge = createSWBridge({
      sendMessage: async () => wrapInCSResponse(pong),
    });

    const reply = await bridge.sendFrame(makeFrame("ping", { nonce: "abc" }));
    expect(reply.kind).toBe("pong");
    const p = reply.payload as { nonce?: string };
    expect(p.nonce).toBe("abc");
  });

  it("SW reply with kind 'sw-error' → synthetic ErrorFrame", async () => {
    const swError: CSResponse = {
      kind: "sw-error",
      reason: "internal",
      message: "something broke",
    };
    const bridge = createSWBridge({
      sendMessage: async () => swError,
    });

    const pingFrame = makeFrame("ping");
    const reply = await bridge.sendFrame(pingFrame);
    expect(reply.kind).toBe("error");
  });

  it("sendMessage throws → synthetic ErrorFrame (no rejection)", async () => {
    const bridge = createSWBridge({
      sendMessage: async () => { throw new Error("port closed"); },
    });

    // Must not reject
    const reply = await bridge.sendFrame(makeFrame("ping"));
    expect(reply.kind).toBe("error");
  });

  it("sendMessage returns garbage shape → synthetic ErrorFrame", async () => {
    const bridge = createSWBridge({
      sendMessage: async () => ({ not: "a-cs-response" }),
    });

    const reply = await bridge.sendFrame(makeFrame("ping"));
    expect(reply.kind).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// createListAdapters tests
// ---------------------------------------------------------------------------

describe("createListAdapters", () => {
  it("round-trips list-adapters-request → list-adapters-response → Right<catalog>", async () => {
    const listAdapters = createListAdapters({
      sendFrame: async () =>
        makeFrame("list-adapters-response", {
          llm: ["claude-cli", "claude-api"],
          vcs: ["github"],
        }),
      newCorrelationId: () => "c-1",
    });

    const result = await listAdapters();
    let wasLeft = false;
    let llm: readonly string[] = [];
    let vcs: readonly string[] = [];
    result.fold(
      () => { wasLeft = true; },
      (cat) => { llm = cat.llm; vcs = cat.vcs; },
    );
    expect(wasLeft).toBe(false);
    expect(llm).toEqual(["claude-cli", "claude-api"]);
    expect(vcs).toEqual(["github"]);
  });

  it("connect-failed error → Left<host-not-installed>", async () => {
    const listAdapters = createListAdapters({
      sendFrame: async () =>
        makeFrame("error", {
          reason: "internal",
          message: "connect failed: native host not registered",
        }),
      newCorrelationId: () => "c-1",
    });

    const result = await listAdapters();
    let errorKind: string | undefined;
    result.fold(
      (e) => { errorKind = e.kind; },
      () => { /* noop */ },
    );
    expect(errorKind).toBe("host-not-installed");
  });

  it("non-connect-failed error frame → Left<host-error>", async () => {
    const listAdapters = createListAdapters({
      sendFrame: async () =>
        makeFrame("error", {
          reason: "internal",
          message: "registry not initialized",
        }),
      newCorrelationId: () => "c-1",
    });

    const result = await listAdapters();
    let errorKind: string | undefined;
    let message: string | undefined;
    result.fold(
      (e) => {
        errorKind = e.kind;
        if (e.kind === "host-error") message = e.message;
      },
      () => { /* noop */ },
    );
    expect(errorKind).toBe("host-error");
    expect(message).toBe("registry not initialized");
  });

  it("unexpected frame shape → Left<internal>", async () => {
    const listAdapters = createListAdapters({
      sendFrame: async () => makeFrame("pong"),
      newCorrelationId: () => "c-1",
    });

    const result = await listAdapters();
    let errorKind: string | undefined;
    result.fold(
      (e) => { errorKind = e.kind; },
      () => { /* noop */ },
    );
    expect(errorKind).toBe("internal");
  });
});
