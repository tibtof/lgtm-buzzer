import { z } from "zod";

// ---------------------------------------------------------------------------
// Storage key + schema
// ---------------------------------------------------------------------------

/**
 * The `chrome.storage.local` key for the stats envelope.
 *
 * Versioned to allow future migrations without silent corruption.
 */
export const STATS_STORAGE_KEY = "lgtm_buzzer.stats.v1" as const;

const GenerationRecordSchema = z.object({
  ts: z.number(),
  durationMs: z.number(),
  adapter: z.string().min(1),
});

const QuizRecordSchema = z.object({
  ts: z.number(),
  passed: z.boolean(),
  correct: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  adapter: z.string().min(1),
});

/**
 * The versioned envelope persisted under `STATS_STORAGE_KEY`.
 */
export const StatsEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  generations: z.array(GenerationRecordSchema),
  quizzes: z.array(QuizRecordSchema),
});

/** The shape of the stats envelope stored in chrome.storage.local. */
export type StatsEnvelope = z.infer<typeof StatsEnvelopeSchema>;

// ---------------------------------------------------------------------------
// Trim constants
// ---------------------------------------------------------------------------

/** Maximum number of generation records retained on write. */
const MAX_GENERATIONS = 20;

/** Maximum number of quiz records retained on write. */
const MAX_QUIZZES = 50;

/** Minimum samples required for a median estimate. */
const MIN_SAMPLES_FOR_MEDIAN = 3;

// ---------------------------------------------------------------------------
// StorageArea port
// ---------------------------------------------------------------------------

/**
 * Minimal `chrome.storage.local`-shaped surface for injection.
 *
 * Tests pass a plain fake; production passes `chrome.storage.local`.
 */
export type StatsStorageArea = {
  readonly get: (key: string) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Empty defaults
// ---------------------------------------------------------------------------

const emptyEnvelope = (): StatsEnvelope => ({
  schemaVersion: 1,
  generations: [],
  quizzes: [],
});

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

/**
 * The public API of the stats store.
 *
 * All methods are async — they read/write chrome.storage.local.
 * Failures never throw; corruption is silently reset to empty defaults.
 */
export type StatsStore = {
  /**
   * Records a generation event for `adapter` with duration `durationMs`.
   * Trims the generations list to the last 20 entries on write.
   */
  readonly recordGeneration: (
    adapter: string,
    durationMs: number,
  ) => Promise<void>;

  /**
   * Records a quiz result for `adapter`.
   * Trims the quizzes list to the last 50 entries on write.
   */
  readonly recordQuiz: (
    adapter: string,
    passed: boolean,
    correct: number,
    total: number,
  ) => Promise<void>;

  /**
   * Returns the median generation duration in milliseconds for `adapter`
   * across all stored samples, or `null` if fewer than 3 samples exist.
   *
   * Uses the lower-median for even-length arrays.
   */
  readonly getMedianGenerationMs: (adapter: string) => Promise<number | null>;

  /**
   * Returns the pass/total counts from the last `n` quiz records,
   * or `null` if no quiz records exist.
   */
  readonly getRecentPassRate: (n?: number) => Promise<{ passed: number; total: number } | null>;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a `StatsStore` backed by the supplied `StatsStorageArea`.
 *
 * @param deps - Injected storage area (inject `browser.storage.local` in prod).
 */
export const createStatsStore = (deps: {
  readonly area: StatsStorageArea;
}): StatsStore => {
  const { area } = deps;

  const readEnvelope = async (): Promise<StatsEnvelope> => {
    let bag: Record<string, unknown>;
    try {
      bag = await area.get(STATS_STORAGE_KEY);
    } catch {
      return emptyEnvelope();
    }

    const raw = bag[STATS_STORAGE_KEY];
    if (raw === undefined || raw === null) {
      return emptyEnvelope();
    }

    const result = StatsEnvelopeSchema.safeParse(raw);
    if (!result.success) {
      // Corrupt data — reset silently.
      console.warn("[lgtm-buzzer:stats] corrupt stats envelope — resetting to defaults", {
        issues: result.error.issues.map((i) => i.message),
      });
      return emptyEnvelope();
    }

    return result.data;
  };

  const writeEnvelope = async (envelope: StatsEnvelope): Promise<void> => {
    try {
      await area.set({ [STATS_STORAGE_KEY]: envelope });
    } catch {
      // Best-effort write — stats loss is acceptable.
    }
  };

  return {
    recordGeneration: async (adapter, durationMs): Promise<void> => {
      const envelope = await readEnvelope();
      const updated: StatsEnvelope = {
        ...envelope,
        generations: [
          ...envelope.generations,
          { ts: Date.now(), durationMs, adapter },
        ].slice(-MAX_GENERATIONS),
      };
      await writeEnvelope(updated);
    },

    recordQuiz: async (adapter, passed, correct, total): Promise<void> => {
      const envelope = await readEnvelope();
      const updated: StatsEnvelope = {
        ...envelope,
        quizzes: [
          ...envelope.quizzes,
          { ts: Date.now(), passed, correct, total, adapter },
        ].slice(-MAX_QUIZZES),
      };
      await writeEnvelope(updated);
    },

    getMedianGenerationMs: async (adapter): Promise<number | null> => {
      const envelope = await readEnvelope();
      const samples = envelope.generations
        .filter((g) => g.adapter === adapter)
        .map((g) => g.durationMs);

      if (samples.length < MIN_SAMPLES_FOR_MEDIAN) {
        return null;
      }

      const sorted = [...samples].sort((a, b) => a - b);
      // Lower-median for even-length arrays.
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 0) {
        return sorted[mid - 1] ?? null;
      }
      return sorted[mid] ?? null;
    },

    getRecentPassRate: async (n = 10): Promise<{ passed: number; total: number } | null> => {
      const envelope = await readEnvelope();
      const recent = envelope.quizzes.slice(-n);
      if (recent.length === 0) {
        return null;
      }
      const passed = recent.filter((q) => q.passed).length;
      return { passed, total: recent.length };
    },
  };
};
