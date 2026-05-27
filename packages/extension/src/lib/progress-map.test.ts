import { describe, it, expect, vi } from "vitest";
import { createProgressMap } from "./progress-map.js";
import type { QuizProgressFrame } from "@lgtm-buzzer/protocol";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeFrame = (
  correlationId: string | null,
  phase: "fetching-diff" | "generating-quiz" | "parsing" | "caching" = "generating-quiz",
): QuizProgressFrame => ({
  v: 1,
  kind: "quiz-progress",
  correlationId,
  payload: { phase, elapsedMs: 0 },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createProgressMap", () => {
  it("subscribe + dispatch calls the subscriber", () => {
    const map = createProgressMap();
    const received: QuizProgressFrame[] = [];

    map.subscribe("cid-1", (f) => { received.push(f); });

    const frame = makeFrame("cid-1");
    const dispatched = map.dispatch(frame);

    expect(dispatched).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]).toStrictEqual(frame);
  });

  it("dispatch returns false when no subscriber registered", () => {
    const map = createProgressMap();
    const frame = makeFrame("cid-unknown");
    expect(map.dispatch(frame)).toBe(false);
  });

  it("dispatch returns false for null correlationId", () => {
    const map = createProgressMap();
    map.subscribe("cid-1", vi.fn());
    const frame = makeFrame(null);
    expect(map.dispatch(frame)).toBe(false);
  });

  it("unsubscribe drops the subscriber — subsequent dispatch returns false", () => {
    const map = createProgressMap();
    const spy = vi.fn();
    map.subscribe("cid-2", spy);
    map.unsubscribe("cid-2");

    const dispatched = map.dispatch(makeFrame("cid-2"));
    expect(dispatched).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("unsubscribe is a no-op when no subscriber present", () => {
    const map = createProgressMap();
    expect(() => { map.unsubscribe("cid-absent"); }).not.toThrow();
  });

  it("duplicate subscribe replaces the prior subscriber", () => {
    const map = createProgressMap();
    const firstSpy = vi.fn();
    const secondSpy = vi.fn();

    map.subscribe("cid-3", firstSpy);
    map.subscribe("cid-3", secondSpy);

    map.dispatch(makeFrame("cid-3"));

    expect(secondSpy).toHaveBeenCalledOnce();
    expect(firstSpy).not.toHaveBeenCalled();
  });

  it("independent subscriptions for different correlationIds coexist", () => {
    const map = createProgressMap();
    const spyA = vi.fn();
    const spyB = vi.fn();

    map.subscribe("cid-a", spyA);
    map.subscribe("cid-b", spyB);

    map.dispatch(makeFrame("cid-a"));
    map.dispatch(makeFrame("cid-b"));

    expect(spyA).toHaveBeenCalledOnce();
    expect(spyB).toHaveBeenCalledOnce();
  });

  it("subscriber is not called after its correlationId is unsubscribed", () => {
    const map = createProgressMap();
    const spyA = vi.fn();
    const spyB = vi.fn();

    map.subscribe("cid-a", spyA);
    map.subscribe("cid-b", spyB);

    map.unsubscribe("cid-a");

    map.dispatch(makeFrame("cid-a"));
    map.dispatch(makeFrame("cid-b"));

    expect(spyA).not.toHaveBeenCalled();
    expect(spyB).toHaveBeenCalledOnce();
  });
});
