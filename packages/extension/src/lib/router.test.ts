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

const quizRequestFrame = (correlationId: string, prKind: "github" | "ado" = "github"): Frame => ({
  v: 1,
  kind: "quiz-request",
  correlationId,
  payload: {
    pr:
      prKind === "github"
        ? { kind: "github", owner: "tibtof", repo: "lgtm-buzzer", number: 42 }
        : { kind: "ado", org: "myorg", project: "myproject", repo: "myrepo", pullRequestId: 7 },
    questionCount: 3,
  },
});

const makeFakePortClient = (reply: Frame): PortClient => ({
  isConnected: () => true,
  sendFrame: vi
    .fn<(frame: Frame, tabId?: number) => Promise<Frame>>()
    .mockResolvedValue(reply),
});

// ADR-29/ADR-32: SwOptionsProjection has llmAdapterId + questionPoolSize
const noopReadSwOptions = async (): Promise<SwOptionsProjection> => ({
  llmAdapterId: undefined,
  questionPoolSize: undefined,
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
  // ADR-29: quiz-request VCS auto-pick from pr.kind
  // ---------------------------------------------------------------------------

  it("quiz-request with pr.kind='github' → SW forwards with vcsAdapterId='github'", async () => {
    const portClient = makeFakePortClient(pongFrame("c-qr-gh"));
    const handler = createCSMessageHandler({
      portClient,
      readSwOptions: async () => ({ llmAdapterId: undefined, questionPoolSize: undefined }),
    });
    const sendResponse = vi.fn<(response: CSResponse) => void>();

    handler(
      { kind: "send-frame", frame: quizRequestFrame("c-qr-gh", "github") },
      noSender,
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledOnce();
    });

    const forwardedFrame = (portClient.sendFrame as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Frame;
    const p = forwardedFrame.payload as { vcsAdapterId?: string; credentials?: unknown };
    expect(p.vcsAdapterId).toBe("github");
    // ADR-29: credentials must NOT be in the forwarded frame
    expect(p.credentials).toBeUndefined();
    expect(JSON.stringify(forwardedFrame)).not.toContain('"credentials"');
  });

  it("quiz-request with pr.kind='ado' → SW forwards with vcsAdapterId='ado'", async () => {
    const portClient = makeFakePortClient(pongFrame("c-qr-ado"));
    const handler = createCSMessageHandler({
      portClient,
      readSwOptions: async () => ({ llmAdapterId: undefined, questionPoolSize: undefined }),
    });
    const sendResponse = vi.fn<(response: CSResponse) => void>();

    handler(
      { kind: "send-frame", frame: quizRequestFrame("c-qr-ado", "ado") },
      noSender,
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledOnce();
    });

    const forwardedFrame = (portClient.sendFrame as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Frame;
    const p = forwardedFrame.payload as { vcsAdapterId?: string };
    expect(p.vcsAdapterId).toBe("ado");
  });

  it("quiz-request with stored llmAdapterId='claude-api' → SW merges it", async () => {
    const portClient = makeFakePortClient(pongFrame("c-qr-llm"));
    const handler = createCSMessageHandler({
      portClient,
      readSwOptions: async () => ({ llmAdapterId: "claude-api", questionPoolSize: undefined }),
    });
    const sendResponse = vi.fn<(response: CSResponse) => void>();

    handler(
      { kind: "send-frame", frame: quizRequestFrame("c-qr-llm", "github") },
      noSender,
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledOnce();
    });

    const forwardedFrame = (portClient.sendFrame as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Frame;
    const p = forwardedFrame.payload as { llmAdapterId?: string };
    expect(p.llmAdapterId).toBe("claude-api");
  });

  it("quiz-request where CS sent a stale credentials field → SW strips it", async () => {
    const portClient = makeFakePortClient(pongFrame("c-qr-stale"));
    const handler = createCSMessageHandler({
      portClient,
      readSwOptions: async () => ({ llmAdapterId: undefined, questionPoolSize: undefined }),
    });
    const sendResponse = vi.fn<(response: CSResponse) => void>();

    // Stale CS sends a credentials field — the router must strip it.
    // Use `as unknown as Frame` because the payload contains a stale `credentials`
    // field that is no longer on the typed QuizRequestPayload (ADR-29).
    const staleFrame = {
      v: 1,
      kind: "quiz-request",
      correlationId: "c-qr-stale",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 3,
        credentials: { pat: "ghp_stale" }, // stale — must be stripped by router
      },
    } as unknown as Frame;

    handler({ kind: "send-frame", frame: staleFrame }, noSender, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledOnce();
    });

    const forwardedFrame = (portClient.sendFrame as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Frame;
    // credentials must have been stripped
    const p = forwardedFrame.payload as Record<string, unknown>;
    expect(p["credentials"]).toBeUndefined();
    expect(JSON.stringify(forwardedFrame)).not.toContain('"credentials"');
    expect(JSON.stringify(forwardedFrame)).not.toContain("ghp_stale");
  });

  it("quiz-request with stored llmAdapterId overrides same field from CS, vcsAdapterId always from pr.kind", async () => {
    const portClient = makeFakePortClient(pongFrame("c-qr-override"));
    const handler = createCSMessageHandler({
      portClient,
      // Storage has a stale vcsAdapterId — it should NOT be used (ADR-29)
      readSwOptions: async () => ({ llmAdapterId: "codex-cli", questionPoolSize: undefined }),
    });
    const sendResponse = vi.fn<(response: CSResponse) => void>();

    handler(
      { kind: "send-frame", frame: quizRequestFrame("c-qr-override", "github") },
      noSender,
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledOnce();
    });

    const forwardedFrame = (portClient.sendFrame as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Frame;
    const p = forwardedFrame.payload as { llmAdapterId?: string; vcsAdapterId?: string };
    expect(p.llmAdapterId).toBe("codex-cli");
    // vcsAdapterId comes from pr.kind, not from storage
    expect(p.vcsAdapterId).toBe("github");
  });

  it("ping frame passes through unchanged — no storage read, no credential injection", async () => {
    const portClient = makeFakePortClient(pongFrame("c-ping"));
    const readSwOptions = vi.fn<() => Promise<SwOptionsProjection>>().mockResolvedValue({
      llmAdapterId: "should-not-appear",
      questionPoolSize: undefined,
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
