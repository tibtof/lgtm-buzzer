import { describe, expect, it, vi } from "vitest";
import { createCSMessageHandler } from "./router.js";
import type { PortClient } from "./port.js";
import type { Frame } from "@lgtm-buzzer/protocol";
import type { CSResponse } from "./cs-protocol.js";

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

const makeFakePortClient = (reply: Frame): PortClient => ({
  isConnected: () => true,
  sendFrame: vi
    .fn<(frame: Frame, tabId?: number) => Promise<Frame>>()
    .mockResolvedValue(reply),
});

const noSender = { tab: { id: 7 } };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createCSMessageHandler", () => {
  it("malformed CS request returns sw-error without calling portClient", () => {
    const portClient = makeFakePortClient(pongFrame("x"));
    const handler = createCSMessageHandler({ portClient });
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
    const handler = createCSMessageHandler({ portClient });
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
    const handler = createCSMessageHandler({ portClient });
    const frame = pingFrame("c-2");
    const ret = handler({ kind: "send-frame", frame }, noSender, vi.fn());
    expect(ret).toBe(true);
  });

  it("ErrorFrame from host is passed through as { kind: 'frame', frame: ErrorFrame }", async () => {
    const errReply = errorFrame("c-err", "host disconnected");
    const portClient = makeFakePortClient(errReply);
    const handler = createCSMessageHandler({ portClient });
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
    const handler = createCSMessageHandler({ portClient });
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
    const handler = createCSMessageHandler({ portClient });
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
});
