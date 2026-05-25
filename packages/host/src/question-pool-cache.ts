import type { ChoiceId, QuestionId } from "@lgtm-buzzer/core";

// ---------------------------------------------------------------------------
// Pool types
// ---------------------------------------------------------------------------

/**
 * A question fully reconstructed from the LLM pool, including the correct
 * choice id. Identical shape to `MultipleChoiceQuestion` in core but held by
 * the host outside of any wire-format projection.
 *
 * `correctChoiceId` is kept here and NEVER written to the wire. The answer
 * key is built from this field per-sample in the dispatcher. ADR-30.
 */
export type PoolQuestion = {
  readonly type: "multiple-choice";
  readonly id: QuestionId;
  readonly prompt: string;
  readonly choices: ReadonlyArray<{
    readonly id: ChoiceId;
    readonly label: string;
  }>;
  readonly correctChoiceId: ChoiceId;
  readonly explanation?: string;
};

/** A cached pool — N questions for a given (adapter, pr, diff) tuple. */
export type Pool = {
  /** Composite cache key (see buildKey). */
  readonly key: string;
  readonly questions: ReadonlyArray<PoolQuestion>;
  /** For telemetry / logs only. */
  readonly llmAdapterId: string;
  /** Unix timestamp (ms) at creation. */
  readonly createdAt: number;
};

/** A live sample mapping: which pool produced this sample? */
export type SampleMapping = {
  /** The QuizId returned to the extension for this sample. */
  readonly sampleQuizId: string;
  /** Points back into the pool map. */
  readonly poolKey: string;
  /** Question ids included in this sample (for logging if desired in v2). */
  readonly sampledQuestionIds: ReadonlyArray<QuestionId>;
};

/**
 * Input for building a composite cache key.
 *
 * BINDING (ADR-30 §Diff-only invariant): This type MUST NOT gain `prTitle`,
 * `prDescription`, `prComments`, or any other non-diff field. The key is
 * intentionally restricted to PR identity coordinates, the LLM adapter, and
 * the diff hash. Adding any non-diff content here would violate the gate-
 * integrity threat model.
 */
export type BuildKeyInput = {
  readonly prKind: "github" | "ado";
  readonly llmAdapterId: string;
  /**
   * Canonical PR identifier string.
   *
   * - GitHub: `"github:<owner>/<repo>#<number>"`
   * - ADO:    `"ado:<org>/<project>/<repo>#<pullRequestId>"`
   */
  readonly prCanonical: string;
  /**
   * Hex-encoded sha256 of the diff bytes verbatim.
   * Computed by `hashDiff` in `diff-hash.ts`. Only the diff content reaches
   * this field — no PR title / description / comments. ADR-30.
   */
  readonly diffHash: string;
};

// ---------------------------------------------------------------------------
// Cache interface
// ---------------------------------------------------------------------------

/**
 * In-process LRU question pool cache.
 *
 * Holds at most `capacity` (default 10) pools keyed by a composite string.
 * Sample mappings live in a parallel structure. No disk persistence — cache
 * lives for the lifetime of the host process. ADR-30 §2.
 */
export type QuestionPoolCache = {
  /** Look up a pool by composite key. */
  readonly get: (key: string) => Pool | undefined;
  /** Insert a pool. Trims to LRU cap on insert. */
  readonly put: (pool: Pool) => void;
  /** Look up which pool a sample-quizId came from. */
  readonly getSampleMapping: (sampleQuizId: string) => SampleMapping | undefined;
  /** Record a sample-quizId → pool mapping. */
  readonly putSampleMapping: (mapping: SampleMapping) => void;
  /** Drop a sample mapping (called on quiz-submit, after scoring). */
  readonly deleteSampleMapping: (sampleQuizId: string) => void;
  /**
   * Build the composite cache key from a `BuildKeyInput`.
   *
   * Key shape: `"${prKind}|${llmAdapterId}|${prCanonical}|${diffHash}"`
   */
  readonly buildKey: (input: BuildKeyInput) => string;
  /** Number of pools currently cached (for tests and logging). */
  readonly size: () => number;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a `QuestionPoolCache` backed by plain `Map` instances.
 *
 * LRU policy: on `put`, if the key already exists it is deleted and
 * re-inserted (refresh). If size exceeds capacity, the oldest entry
 * (first iterator position of `Map.keys()`) is evicted. `get` does NOT
 * promote (simpler implementation; the next `put` refreshes). No TTL.
 *
 * Sample mappings live in a separate (unbounded) `Map`. The dispatcher
 * calls `deleteSampleMapping` after scoring to keep this map lean.
 *
 * @param opts.capacity - Maximum number of pools to hold. Defaults to 10.
 * @returns A fresh, empty `QuestionPoolCache`.
 */
export const createQuestionPoolCache = (
  opts?: { readonly capacity?: number },
): QuestionPoolCache => {
  const capacity = opts?.capacity ?? 10;
  const pools = new Map<string, Pool>();
  const samples = new Map<string, SampleMapping>();

  const buildKey = (input: BuildKeyInput): string =>
    `${input.prKind}|${input.llmAdapterId}|${input.prCanonical}|${input.diffHash}`;

  const get = (key: string): Pool | undefined => pools.get(key);

  const put = (pool: Pool): void => {
    // Refresh LRU: delete then re-insert.
    if (pools.has(pool.key)) {
      pools.delete(pool.key);
    }
    pools.set(pool.key, pool);
    // Evict oldest if over capacity.
    if (pools.size > capacity) {
      const oldest = pools.keys().next().value;
      if (oldest !== undefined) {
        pools.delete(oldest);
      }
    }
  };

  const getSampleMapping = (sampleQuizId: string): SampleMapping | undefined =>
    samples.get(sampleQuizId);

  const putSampleMapping = (mapping: SampleMapping): void => {
    samples.set(mapping.sampleQuizId, mapping);
  };

  const deleteSampleMapping = (sampleQuizId: string): void => {
    samples.delete(sampleQuizId);
  };

  const size = (): number => pools.size;

  return {
    get,
    put,
    getSampleMapping,
    putSampleMapping,
    deleteSampleMapping,
    buildKey,
    size,
  };
};
