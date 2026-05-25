import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createStatsStore,
  STATS_STORAGE_KEY,
  type StatsStorageArea,
} from "./store.js";

// ---------------------------------------------------------------------------
// Fake in-memory storage area
// ---------------------------------------------------------------------------

const makeArea = (): StatsStorageArea & { _data: Record<string, unknown> } => {
  const _data: Record<string, unknown> = {};
  return {
    _data,
    get: async (key: string) => ({ [key]: _data[key] }),
    set: async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) {
        _data[k] = v;
      }
    },
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createStatsStore", () => {
  let area: ReturnType<typeof makeArea>;

  beforeEach(() => {
    area = makeArea();
  });

  // ---- recordGeneration / getMedianGenerationMs --------------------------

  it("returns null median when no records exist", async () => {
    const store = createStatsStore({ area });
    const median = await store.getMedianGenerationMs("claude-cli");
    expect(median).toBeNull();
  });

  it("returns null median when fewer than 3 samples for the adapter", async () => {
    const store = createStatsStore({ area });
    await store.recordGeneration("claude-cli", 1000);
    await store.recordGeneration("claude-cli", 2000);
    const median = await store.getMedianGenerationMs("claude-cli");
    expect(median).toBeNull();
  });

  it("returns correct median with exactly 3 samples (odd count)", async () => {
    const store = createStatsStore({ area });
    await store.recordGeneration("claude-cli", 1000);
    await store.recordGeneration("claude-cli", 3000);
    await store.recordGeneration("claude-cli", 2000);
    const median = await store.getMedianGenerationMs("claude-cli");
    expect(median).toBe(2000);
  });

  it("returns lower-median with 4 samples (even count)", async () => {
    const store = createStatsStore({ area });
    await store.recordGeneration("claude-cli", 1000);
    await store.recordGeneration("claude-cli", 2000);
    await store.recordGeneration("claude-cli", 3000);
    await store.recordGeneration("claude-cli", 4000);
    const median = await store.getMedianGenerationMs("claude-cli");
    // sorted: [1000, 2000, 3000, 4000] — even: lower-median at index 1
    expect(median).toBe(2000);
  });

  it("median is per-adapter — other adapters do not affect the count", async () => {
    const store = createStatsStore({ area });
    await store.recordGeneration("codex-cli", 500);
    await store.recordGeneration("codex-cli", 600);
    await store.recordGeneration("claude-cli", 1000);
    await store.recordGeneration("claude-cli", 2000);
    // claude-cli still only has 2 samples
    const median = await store.getMedianGenerationMs("claude-cli");
    expect(median).toBeNull();
  });

  it("read/write round-trip persists generations", async () => {
    const store = createStatsStore({ area });
    await store.recordGeneration("claude-cli", 5000);
    await store.recordGeneration("claude-cli", 6000);
    await store.recordGeneration("claude-cli", 7000);

    // Re-read via a second store instance sharing the same area
    const store2 = createStatsStore({ area });
    const median = await store2.getMedianGenerationMs("claude-cli");
    expect(median).toBe(6000);
  });

  // ---- trimming -----------------------------------------------------------

  it("trims generations to last 20 on write", async () => {
    const store = createStatsStore({ area });
    for (let i = 0; i < 25; i++) {
      await store.recordGeneration("claude-cli", (i + 1) * 100);
    }
    // After 25 writes, only the last 20 should be kept.
    const raw = area._data[STATS_STORAGE_KEY] as { generations: Array<{ durationMs: number }> };
    expect(raw.generations).toHaveLength(20);
    // The first kept record should be from iteration index 5 → durationMs 600
    expect(raw.generations[0]?.durationMs).toBe(600);
  });

  it("trims quizzes to last 50 on write", async () => {
    const store = createStatsStore({ area });
    for (let i = 0; i < 55; i++) {
      await store.recordQuiz("claude-cli", true, 3, 3);
    }
    const raw = area._data[STATS_STORAGE_KEY] as { quizzes: unknown[] };
    expect(raw.quizzes).toHaveLength(50);
  });

  // ---- zod corruption → empty defaults -----------------------------------

  it("returns null median when stored value is corrupt (not valid schema)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // Manually inject corrupt data
    area._data[STATS_STORAGE_KEY] = { schemaVersion: "bad", generations: "nope" };
    const store = createStatsStore({ area });
    const median = await store.getMedianGenerationMs("claude-cli");
    expect(median).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("corrupt"),
      expect.objectContaining({ issues: expect.any(Array) }),
    );
    warnSpy.mockRestore();
  });

  it("can write after corruption — resets to empty defaults, then records new entry", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    area._data[STATS_STORAGE_KEY] = { invalid: true };
    const store = createStatsStore({ area });
    // Recording should work after silently resetting corrupt data
    await store.recordGeneration("claude-cli", 1000);
    await store.recordGeneration("claude-cli", 2000);
    await store.recordGeneration("claude-cli", 3000);
    const median = await store.getMedianGenerationMs("claude-cli");
    expect(median).toBe(2000);
    warnSpy.mockRestore();
  });

  // ---- getRecentPassRate -------------------------------------------------

  it("returns null when no quizzes recorded", async () => {
    const store = createStatsStore({ area });
    const rate = await store.getRecentPassRate();
    expect(rate).toBeNull();
  });

  it("returns pass rate for last N quizzes (default 10)", async () => {
    const store = createStatsStore({ area });
    // Record 12 quizzes: 8 pass, 4 fail
    for (let i = 0; i < 12; i++) {
      await store.recordQuiz("claude-cli", i % 3 !== 0, 2, 3);
    }
    const rate = await store.getRecentPassRate(10);
    expect(rate).not.toBeNull();
    expect(rate!.total).toBe(10);
    // i % 3 !== 0 for last 10 records (indices 2..11):
    // idx 2=pass, 3=fail, 4=pass, 5=pass, 6=fail, 7=pass, 8=pass, 9=fail, 10=pass, 11=pass
    // pass: 7, fail: 3
    expect(rate!.passed).toBe(7);
  });

  it("returns all quizzes when fewer than N exist", async () => {
    const store = createStatsStore({ area });
    await store.recordQuiz("claude-cli", true, 3, 3);
    await store.recordQuiz("claude-cli", false, 1, 3);
    const rate = await store.getRecentPassRate(10);
    expect(rate).not.toBeNull();
    expect(rate!.total).toBe(2);
    expect(rate!.passed).toBe(1);
  });

  it("getRecentPassRate uses default n=10", async () => {
    const store = createStatsStore({ area });
    for (let i = 0; i < 15; i++) {
      await store.recordQuiz("claude-cli", i >= 5, 3, 3);
    }
    const rate = await store.getRecentPassRate();
    expect(rate).not.toBeNull();
    // Last 10 (indices 5..14) are all passing
    expect(rate!.total).toBe(10);
    expect(rate!.passed).toBe(10);
  });
});
