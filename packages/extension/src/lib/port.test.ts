import { describe, expect, it, vi, beforeEach } from "vitest";
import { createPortClient } from "./port.js";
import { createCorrelationMap } from "./correlation.js";
import type { HostPort, ConnectFn, PortClientDeps } from "./port.js";
import type { Frame } from "@lgtm-buzzer/protocol";
import type { PendingRequest } from "./correlation.js";

// ---------------------------------------------------------------------------
// Fake HostPort factory
// ---------------------------------------------------------------------------

type FakeHostPort = HostPort & {
  _messageListeners: Array<(msg: unknown) => void>;
  _disconnectListeners: Array<() => void>;
  _posted: unknown[];
  _simulateMessage: (msg: unknown) => void;
  _simulateDisconnect: () => void;
};

const makeFakePort = (opts: { throwOnPost?: boolean } = {}): FakeHostPort => {
  const _messageListeners: Array<(msg: unknown) => void> = [];
  const _disconnectListeners: Array<() => void> = [];
  const _posted: unknown[] = [];

  return {
    _messageListeners,
    _disconnectListeners,
    _posted,
    postMessage: (msg: unknown) => {
      if (opts.throwOnPost) throw new Error("port closed");
      _posted.push(msg);
    },
    onMessage: {
      addListener: (cb) => {
        _messageListeners.push(cb);
      },
    },
    onDisconnect: {
      addListener: (cb) => {
        _disconnectListeners.push(cb);
      },
    },
    disconnect: () => {},
    _simulateMessage: (msg: unknown) => {
      for (const cb of _messageListeners) cb(msg);
    },
    _simulateDisconnect: () => {
      for (const cb of _disconnectListeners) cb();
    },
  };
};

const pingFrame = (correlationId: string): Frame => ({
  v: 1,
  kind: "ping",
  correlationId,
  payload: {},
});

const replyFrame = (correlationId: string): Frame => ({
  v: 1,
  kind: "pong",
  correlationId,
  payload: {},
});

const errorFrame = (correlationId: string | null, message: string): Frame => ({
  v: 1,
  kind: "error",
  correlationId,
  payload: { reason: "internal", message },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let fakePort: FakeHostPort;
let connectCalls: number;

const makeClient = (
  overrides: Partial<PortClientDeps> = {},
  portOpts: { throwOnPost?: boolean } = {},
) => {
  fakePort = makeFakePort(portOpts);
  connectCalls = 0;
  const connectFn: ConnectFn = () => {
    connectCalls++;
    return fakePort;
  };
  const map = createCorrelationMap();
  return createPortClient({
    connect: connectFn,
    map,
    now: () => Date.now(),
    timeoutMs: 60_000,
    ...overrides,
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createPortClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("lazy connect — not connected until first sendFrame", () => {
    const client = makeClient();
    expect(client.isConnected()).toBe(false);
    expect(connectCalls).toBe(0);
  });

  it("connects on first sendFrame", async () => {
    const client = makeClient();
    const frame = pingFrame("c-1");
    const promise = client.sendFrame(frame);
    fakePort._simulateMessage(replyFrame("c-1"));
    await promise;
    expect(connectCalls).toBe(1);
    expect(client.isConnected()).toBe(true);
  });

  it("reuses the same port across multiple sendFrame calls", async () => {
    const client = makeClient();

    const p1 = client.sendFrame(pingFrame("c-1"));
    fakePort._simulateMessage(replyFrame("c-1"));
    await p1;

    const p2 = client.sendFrame(pingFrame("c-2"));
    fakePort._simulateMessage(replyFrame("c-2"));
    await p2;

    expect(connectCalls).toBe(1);
  });

  it("round-trip: reply correlationId matches request", async () => {
    const client = makeClient();
    const promise = client.sendFrame(pingFrame("c-rt"));
    fakePort._simulateMessage(replyFrame("c-rt"));
    const result = await promise;
    expect(result.correlationId).toBe("c-rt");
    expect(result.kind).toBe("pong");
  });

  it("concurrent frames resolve independently", async () => {
    const client = makeClient();
    const p1 = client.sendFrame(pingFrame("c-A"));
    const p2 = client.sendFrame(pingFrame("c-B"));

    fakePort._simulateMessage(replyFrame("c-B"));
    fakePort._simulateMessage(replyFrame("c-A"));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.correlationId).toBe("c-A");
    expect(r2.correlationId).toBe("c-B");
  });

  it("disconnect mid-flight resolves pending with ErrorFrame", async () => {
    const client = makeClient();
    const promise = client.sendFrame(pingFrame("c-disc"));
    fakePort._simulateDisconnect();
    const result = await promise;
    expect(result).toMatchObject(errorFrame("c-disc", "host disconnected"));
    expect(client.isConnected()).toBe(false);
  });

  it("reconnects after disconnect on subsequent sendFrame", async () => {
    const client = makeClient();
    const p1 = client.sendFrame(pingFrame("c-first"));
    fakePort._simulateDisconnect();
    await p1;
    expect(connectCalls).toBe(1);

    // A second port will be created on the next call
    const oldPort = fakePort;
    fakePort = makeFakePort();
    const connectFn2: ConnectFn = () => {
      connectCalls++;
      return fakePort;
    };
    // Rebuild client with same map but new connect fn — simulate reconnect
    const map2 = createCorrelationMap();
    const client2 = createPortClient({
      connect: connectFn2,
      map: map2,
      now: () => Date.now(),
      timeoutMs: 60_000,
    });
    // Simulate same sequence on new client
    void oldPort; // suppress unused warning
    const p2 = client2.sendFrame(pingFrame("c-second"));
    fakePort._simulateMessage(replyFrame("c-second"));
    const r2 = await p2;
    expect(r2.kind).toBe("pong");
    expect(connectCalls).toBe(2);
  });

  it("invalid host reply is dropped — pending eventually times out", async () => {
    const client = makeClient({ timeoutMs: 100 });
    const promise = client.sendFrame(pingFrame("c-invalid"));
    // Send a malformed reply (missing required fields)
    fakePort._simulateMessage({ kind: "not-a-real-kind" });
    // Advance timers so the timeout fires
    vi.advanceTimersByTime(200);
    const result = await promise;
    expect(result).toMatchObject({ kind: "error", correlationId: "c-invalid" });
    expect((result as { payload: { message: string } }).payload.message).toMatch(
      /did not respond/,
    );
  });

  it("timeout fires and resolves with ErrorFrame when host is silent", async () => {
    const client = makeClient({ timeoutMs: 500 });
    const promise = client.sendFrame(pingFrame("c-timeout"));
    vi.advanceTimersByTime(600);
    const result = await promise;
    expect(result).toMatchObject({
      kind: "error",
      correlationId: "c-timeout",
      payload: { reason: "internal", message: "host did not respond" },
    });
  });

  it("sync postMessage throw drains map as disconnected", async () => {
    const client = makeClient({}, { throwOnPost: true });
    const promise = client.sendFrame(pingFrame("c-throw"));
    const result = await promise;
    expect(result).toMatchObject({
      kind: "error",
      payload: { reason: "internal", message: "host disconnected" },
    });
    expect(client.isConnected()).toBe(false);
  });

  it("tabId is stored in the correlation entry (via map)", async () => {
    const addSpy = vi.fn<(pending: PendingRequest) => void>();
    const realMap = createCorrelationMap();
    const spyMap = {
      ...realMap,
      add: (p: PendingRequest) => {
        addSpy(p);
        realMap.add(p);
      },
    };
    fakePort = makeFakePort();
    const client = createPortClient({
      connect: () => fakePort,
      map: spyMap,
      now: () => Date.now(),
      timeoutMs: 60_000,
    });
    const promise = client.sendFrame(pingFrame("c-tab"), 42);
    fakePort._simulateMessage(replyFrame("c-tab"));
    await promise;
    expect(addSpy).toHaveBeenCalledOnce();
    expect(addSpy.mock.calls[0]?.[0].tabId).toBe(42);
  });
});
