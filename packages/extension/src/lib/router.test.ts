import { describe, expect, it, vi } from "vitest";
import { createCSMessageHandler } from "./router.js";
import type { PortClient } from "./port.js";
import type { Frame } from "@lgtm-buzzer/protocol";
import type { CSResponse } from "./cs-protocol.js";
import type { SwOptionsProjection } from "./options/storage-reader.js";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const pingFrame = (correlationId: string): Frame => ({
  v: 1,
  kind: "ping",
  correlationId,
  payload: {},
});

const pongFrame = (correlationId: string): Frame => ({
  v: 1,
  kind: "pong",
  correlationId,
  payload: {},
});

const errorFrame = (correlationId: string, message: string): Frame => ({
  v: 1,
  kind: "error",
  correlationId,
  payload: { reason: "internal", message },
});

const quizRequestFrame = (correlationId: string): Frame => ({
  v: 1,
  kind: "quiz-request",
  correlationId,
  payload: {
    pr: { kind: "github", owner: "tibtof", repo: "lgtm-buzzer", number: 42 },
    questionCount: 3,
  },
});

const makeFakePortClient = (reply: Frame): PortClient => ({
  isConnected: () => true,
  sendFrame: vi
    .fn<(frame: Frame, tabId?: number) => Promise<Frame>>()
    .mockResolvedValue(reply),
});

const noopReadSwOptions = async (): Promise<SwOptionsProjection> => ({
  llmAdapterId: undefined,
  vcsAdapterId: undefined,
  credentials: undefined,
});

const noSender = { tab: { id: 7 } };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createCSMessageHandler", () => {
  it("malformed CS request returns sw-error without calling portClient", () => {
    const portClient = makeFakePortClient(pongFrame("x"));
    const handler = createCSMessageHandler({
      portClient,
      readSwOptions: noopReadSwOptions,
    });
    const sendResponse = vi.fn<(response: CSResponse) => void>();

    const ret = handler({ kind: "bogus" }, noSender, sendResponse);

    expect(ret).toBeUndefined();
    expect(portClient.sendFrame).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledOnce();
    expect(sendResponse.mock.calls[0]?.[0]).toMatchObject({
      kind: "sw-error",
      reason: "schema-violation",
    });
  });

  it("well-formed CS request forwards frame to portClient", async () => {
    const reply = pongFrame("c-1");
    const portClient = makeFakePortClient(reply);
    const handler = createCSMessageHandler({
      portClient,
      readSwOptions: noopReadSwOptions,
    });
    const sendResponse = vi.fn<(response: CSResponse) => void>();

    const frame = pingFrame("c-1");
    const ret = handler({ kind: "send-frame", frame }, noSender, sendResponse);

    expect(ret).toBe(true);
    expect(portClient.sendFrame).toHaveBeenCalledOnce();

    // Wait for async resolution
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledOnce();
    });
    expect(sendResponse.mock.calls[0]?.[0]).toMatchObject({
      kind: "frame",
      frame: reply,
    });
  });

  it("handler returns true to keep channel open for async sendResponse", () => {
    const portClient = makeFakePortClient(pongFrame("c-2"));
    const handler = createCSMessageHandler({
      portClient,
      readSwOptions: noopReadSwOptions,
    });
    const frame = pingFrame("c-2");
    const ret = handler({ kind: "send-frame", frame }, noSender, vi.fn());
    expect(ret).toBe(true);
  });

  it("ErrorFrame from host is passed through as { kind: 'frame', frame: ErrorFrame }", async () => {
    const errReply = errorFrame("c-err", "host disconnected");
    const portClient = makeFakePortClient(errReply);
    const handler = createCSMessageHandler({
      portClient,
      readSwOptions: noopReadSwOptions,
    });
    const sendResponse = vi.fn<(response: CSResponse) => void>();

    handler({ kind: "send-frame", frame: pingFrame("c-err") }, noSender, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledOnce();
    });
    expect(sendResponse.mock.calls[0]?.[0]).toMatchObject({
      kind: "frame",
      frame: errReply,
    });
  });

  it("unknown CS kind (valid JS object, wrong kind) returns sw-error", () => {
    const portClient = makeFakePortClient(pongFrame("x"));
    const handler = createCSMessageHandler({
      portClient,
      readSwOptions: noopReadSwOptions,
    });
    const sendResponse = vi.fn<(response: CSResponse) => void>();

    handler({ kind: "do-something-else" }, noSender, sendResponse);

    expect(sendResponse).toHaveBeenCalledOnce();
    expect(sendResponse.mock.calls[0]?.[0]).toMatchObject({
      kind: "sw-error",
      reason: "schema-violation",
    });
  });

  it("tabId from sender is passed to portClient.sendFrame", async () => {
    const reply = pongFrame("c-tab");
    const portClient = makeFakePortClient(reply);
    const handler = createCSMessageHandler({
      portClient,
      readSwOptions: noopReadSwOptions,
    });
    const sendResponse = vi.fn<(response: CSResponse) => void>();

    handler(
      { kind: "send-frame", frame: pingFrame("c-tab") },
      { tab: { id: 99 } },
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledOnce();
    });
    expect(portClient.sendFrame).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: "c-tab" }),
      99,
    );
  });

  // ---------------------------------------------------------------------------
  // ADR-23: quiz-request storage merge tests
  // ---------------------------------------------------------------------------

  it("quiz-request with empty storage → forwards with undefined adapter fields", async () => {
    const portClient = makeFakePortClient(pongFrame("c-qr"));
    const handler = createCSMessageHandler({
      portClient,
      readSwOptions: async () => ({
        llmAdapterId: undefined,
        vcsAdapterId: undefined,
        credentials: undefined,
      }),
    });
    const sendResponse = vi.fn<(response: CSResponse) => void>();

    handler(
      { kind: "send-frame", frame: quizRequestFrame("c-qr") },
      noSender,
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledOnce();
    });

    const forwardedFrame = (portClient.sendFrame as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Frame;
    const p = forwardedFrame.payload as {
      llmAdapterId?: string;
      vcsAdapterId?: string;
      credentials?: unknown;
    };
    expect(p.llmAdapterId).toBeUndefined();
    expect(p.vcsAdapterId).toBeUndefined();
    expect(p.credentials).toBeUndefined();
  });

  it("quiz-request with stored claude-api + apiKey → forwards with adapter fields merged", async () => {
    const portClient = makeFakePortClient(pongFrame("c-qr2"));
    const handler = createCSMessageHandler({
      portClient,
      readSwOptions: async () => ({
        llmAdapterId: "claude-api",
        vcsAdapterId: undefined,
        credentials: { apiKey: "k" },
      }),
    });
    const sendResponse = vi.fn<(response: CSResponse) => void>();

    handler(
      { kind: "send-frame", frame: quizRequestFrame("c-qr2") },
      noSender,
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledOnce();
    });

    const forwardedFrame = (portClient.sendFrame as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Frame;
    const p = forwardedFrame.payload as {
      llmAdapterId?: string;
      credentials?: { apiKey?: string };
    };
    expect(p.llmAdapterId).toBe("claude-api");
    expect(p.credentials?.apiKey).toBe("k");
  });

  it("ping frame passes through unchanged — no storage read, no credential injection", async () => {
    const portClient = makeFakePortClient(pongFrame("c-ping"));
    const readSwOptions = vi.fn<() => Promise<SwOptionsProjection>>().mockResolvedValue({
      llmAdapterId: "should-not-appear",
      vcsAdapterId: undefined,
      credentials: { secret: "should-not-appear" },
    });

    const handler = createCSMessageHandler({ portClient, readSwOptions });
    const sendResponse = vi.fn<(response: CSResponse) => void>();

    handler(
      { kind: "send-frame", frame: pingFrame("c-ping") },
      noSender,
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledOnce();
    });

    // readSwOptions must NOT have been called for a ping frame.
    expect(readSwOptions).not.toHaveBeenCalled();

    const forwardedFrame = (portClient.sendFrame as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Frame;
    expect(forwardedFrame.kind).toBe("ping");
    // No credentials injected into the forwarded ping frame.
    const p = forwardedFrame.payload as Record<string, unknown>;
    expect(p["credentials"]).toBeUndefined();
  });

  it("open-options message calls openOptionsPage without hitting portClient", () => {
    const portClient = makeFakePortClient(pongFrame("x"));
    const openOptionsPage = vi.fn();
    const handler = createCSMessageHandler({
      portClient,
      readSwOptions: noopReadSwOptions,
      openOptionsPage,
    });
    const sendResponse = vi.fn<(response: CSResponse) => void>();

    handler({ kind: "open-options" }, noSender, sendResponse);

    expect(openOptionsPage).toHaveBeenCalledOnce();
    expect(portClient.sendFrame).not.toHaveBeenCalled();
  });
});
