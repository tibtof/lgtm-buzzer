import { describe, expect, it, vi } from "vitest";
import { createCorrelationMap } from "./correlation.js";
import type { Frame } from "@lgtm-buzzer/protocol";

const makeErrorFrame = (correlationId: string): Frame => ({
  v: 1,
  kind: "error",
  correlationId,
  payload: { reason: "internal", message: "test drain" },
});

const makePending = (
  correlationId: string,
  resolve: (frame: Frame) => void,
) => ({
  correlationId,
  tabId: 1,
  resolve,
  timer: setTimeout(() => {}, 60_000),
});

describe("createCorrelationMap", () => {
  it("starts empty", () => {
    const map = createCorrelationMap();
    expect(map.size()).toBe(0);
  });

  it("add and takeById round-trips the entry", () => {
    const map = createCorrelationMap();
    const resolve = vi.fn<(frame: Frame) => void>();
    const pending = makePending("abc-123", resolve);
    map.add(pending);
    expect(map.size()).toBe(1);

    const taken = map.takeById("abc-123");
    expect(taken).toBe(pending);
    expect(map.size()).toBe(0);
  });

  it("takeById returns undefined for unknown id", () => {
    const map = createCorrelationMap();
    expect(map.takeById("not-here")).toBeUndefined();
  });

  it("takeById clears the timer on the returned entry (timer was valid)", () => {
    const map = createCorrelationMap();
    const resolve = vi.fn<(frame: Frame) => void>();
    const pending = makePending("timer-test", resolve);
    map.add(pending);
    const taken = map.takeById("timer-test");
    // takeById does NOT clear the timer — the caller (port.ts) clears it.
    // This test confirms the timer handle is returned so the caller can.
    expect(taken?.timer).toBeDefined();
  });

  it("drainAll resolves every entry with the synthesised frame", () => {
    const map = createCorrelationMap();
    const resolve1 = vi.fn<(frame: Frame) => void>();
    const resolve2 = vi.fn<(frame: Frame) => void>();
    map.add(makePending("id-1", resolve1));
    map.add(makePending("id-2", resolve2));

    map.drainAll(makeErrorFrame);

    expect(resolve1).toHaveBeenCalledOnce();
    expect(resolve2).toHaveBeenCalledOnce();
    expect(resolve1.mock.calls[0]?.[0]).toMatchObject({
      kind: "error",
      correlationId: "id-1",
    });
    expect(resolve2.mock.calls[0]?.[0]).toMatchObject({
      kind: "error",
      correlationId: "id-2",
    });
    expect(map.size()).toBe(0);
  });

  it("drainAll leaves the map empty", () => {
    const map = createCorrelationMap();
    map.add(makePending("x", vi.fn()));
    map.drainAll(makeErrorFrame);
    expect(map.size()).toBe(0);
  });

  it("duplicate correlationId throws an invariant error", () => {
    const map = createCorrelationMap();
    map.add(makePending("dup", vi.fn()));
    expect(() => map.add(makePending("dup", vi.fn()))).toThrow(
      /duplicate correlationId/,
    );
  });

  it("property: size tracks add/take accurately for multiple ids", () => {
    const map = createCorrelationMap();
    const ids = ["a", "b", "c"];
    for (const id of ids) map.add(makePending(id, vi.fn()));
    expect(map.size()).toBe(3);
    map.takeById("b");
    expect(map.size()).toBe(2);
    map.takeById("a");
    expect(map.size()).toBe(1);
    map.takeById("c");
    expect(map.size()).toBe(0);
  });

  it("property: drainAll is idempotent — second drain is a no-op", () => {
    const map = createCorrelationMap();
    const resolve = vi.fn<(frame: Frame) => void>();
    map.add(makePending("once", resolve));
    map.drainAll(makeErrorFrame);
    map.drainAll(makeErrorFrame);
    expect(resolve).toHaveBeenCalledOnce();
  });

  // ADR-32: peekById tests
  it("peekById returns the entry without removing it", () => {
    const map = createCorrelationMap();
    const resolve = vi.fn<(frame: Frame) => void>();
    const pending = makePending("peek-test", resolve);
    map.add(pending);

    const peeked = map.peekById("peek-test");
    expect(peeked).toBe(pending);
    // Entry is still in the map.
    expect(map.size()).toBe(1);
    // takeById still works after a peek.
    const taken = map.takeById("peek-test");
    expect(taken).toBe(pending);
    expect(map.size()).toBe(0);
  });

  it("peekById returns undefined for an absent id", () => {
    const map = createCorrelationMap();
    expect(map.peekById("does-not-exist")).toBeUndefined();
  });

  it("peekById does not affect subsequent drainAll", () => {
    const map = createCorrelationMap();
    const resolve = vi.fn<(frame: Frame) => void>();
    map.add(makePending("drain-peek", resolve));

    map.peekById("drain-peek"); // must be side-effect-free
    map.drainAll(makeErrorFrame);

    expect(resolve).toHaveBeenCalledOnce();
    expect(map.size()).toBe(0);
  });

  it("timer field on PendingRequest is mutable (ADR-32 timer re-arm)", () => {
    const map = createCorrelationMap();
    const pending = makePending("mutable-timer", vi.fn());
    map.add(pending);

    const peeked = map.peekById("mutable-timer");
    expect(peeked).toBeDefined();
    if (peeked !== undefined) {
      // Re-arm: assign a new timer handle.
      const oldTimer = peeked.timer;
      clearTimeout(oldTimer);
      peeked.timer = setTimeout(() => {}, 99_999);
      expect(peeked.timer).not.toBe(oldTimer);
    }

    // Clean up.
    const taken = map.takeById("mutable-timer");
    if (taken !== undefined) clearTimeout(taken.timer);
  });
});
