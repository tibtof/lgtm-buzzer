import { IO } from "monadyssey";
import type {
  LLMProvider,
  VCSProvider,
  PRIdentifier,
  LLMProviderError,
  VCSProviderError,
  Quiz,
  QuestionId,
  ChoiceId,
  QuizId,
  Diff,
} from "@lgtm-buzzer/core";
import { pickCorrectAnswers, scoreSubmission, decidePassed } from "@lgtm-buzzer/core";
import type { Logger } from "@lgtm-buzzer/core";
import type { Frame } from "@lgtm-buzzer/protocol";
import { PROTOCOL_VERSION, RESAMPLE_FAILED_PREFIX } from "@lgtm-buzzer/protocol";
import type { AuthStatus } from "@lgtm-buzzer/protocol";
import type { FrameWriter } from "./framing/writer.js";
import type { WriteError } from "./framing/errors.js";
import type { SessionStore } from "./session-store.js";
import type { AdapterRegistry, RegistryError } from "./registry.js";
import type { QuestionPoolCache, Pool, PoolQuestion } from "./question-pool-cache.js";
import { hashDiff } from "./diff-hash.js";
import type { ProgressEmitter } from "./progress-emitter.js";

// ---------------------------------------------------------------------------
// Defaults (ADR-22 §Backwards compatibility)
// ---------------------------------------------------------------------------

const DEFAULT_LLM_ADAPTER_ID = "claude-cli" as const;
const DEFAULT_VCS_ADAPTER_ID = "github" as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dependencies injected into `createDispatcher`. */
export type DispatcherDeps = {
  readonly write: FrameWriter;
  readonly store: SessionStore;
  readonly logger: Logger;
  /** Adapter registry — resolves adapter IDs to provider instances per-request. */
  readonly registry: AdapterRegistry;
  /**
   * Question pool cache (ADR-30). Holds up to 10 pools keyed by composite
   * (prKind, llmAdapterId, prCanonical, diffHash). Pass `createQuestionPoolCache()`
   * from `cli.ts`. Tests may pass a custom implementation or the real one.
   */
  readonly cache: QuestionPoolCache;
  /**
   * Progress emitter (ADR-32). Fires `quiz-progress` heartbeat frames toward
   * the SW during the quiz-request fiber. Optional: when absent, no heartbeats
   * are emitted and behaviour is identical to pre-ADR-32.
   */
  readonly progress?: ProgressEmitter;
};

// ---------------------------------------------------------------------------
// Internal: build wire error frame
// ---------------------------------------------------------------------------

/**
 * Build an `ErrorFrame` suitable for sending over the wire.
 *
 * @param reason - The `ErrorReason` string.
 * @param message - A human-readable message (MUST NEVER include credential bytes or diff bytes).
 * @param correlationId - The correlationId from the incoming frame, if any.
 * @param details - Optional structured details (field paths only, never credential values).
 * @returns A well-formed error `Frame`.
 */
export const buildErrorFrame = (
  reason:
    | "internal"
    | "unknown-quiz-id"
    | "schema-violation"
    | "unknown-message"
    | "unsupported-llm-adapter"
    | "unsupported-vcs-adapter"
    | "missing-credentials",
  message: string,
  correlationId: string | null,
  details?: unknown,
): Frame => ({
  v: PROTOCOL_VERSION,
  kind: "error",
  correlationId,
  payload: details !== undefined ? { reason, message, details } : { reason, message },
});

/**
 * Map a `RegistryError` to the appropriate wire `ErrorFrame`.
 *
 * BINDING: `details` MUST NOT include credential bytes. Only the `adapterId`,
 * `attempted` (step labels), and `hint` (remediation copy) are included.
 *
 * @param err - The registry error to map.
 * @param correlationId - Frame correlation ID.
 * @returns A well-formed error Frame.
 */
const buildRegistryErrorFrame = (
  err: RegistryError,
  correlationId: string | null,
): Frame => {
  switch (err.kind) {
    case "unsupported-llm-adapter":
      return buildErrorFrame(
        "unsupported-llm-adapter",
        `Unknown LLM adapter: ${err.id}`,
        correlationId,
        { id: err.id },
      );
    case "unsupported-vcs-adapter":
      return buildErrorFrame(
        "unsupported-vcs-adapter",
        `Unknown VCS adapter: ${err.id}`,
        correlationId,
        { id: err.id },
      );
    case "missing-credentials":
      return buildErrorFrame(
        "missing-credentials",
        `Adapter ${err.adapterId} could not resolve credentials`,
        correlationId,
        { adapterId: err.adapterId, attempted: err.attempted, hint: err.hint },
      );
  }
};

// ---------------------------------------------------------------------------
// Internal: build wire frames without correctChoiceId
// ---------------------------------------------------------------------------

/**
 * Build a `quiz-response` Frame from a domain Quiz.
 *
 * BINDING (gate integrity): `correctChoiceId` is NEVER included in the
 * output. Each QuestionDTO is built fresh from `id`, `prompt`, `choices`
 * (id + label only), and optional `explanation`. The correct answers are
 * kept host-side in the SessionStore.
 *
 * @param quiz - The domain Quiz produced by the LLM adapter.
 * @param correlationId - Correlation ID from the original quiz-request.
 * @returns A well-formed quiz-response Frame.
 */
const buildQuizResponseFrame = (quiz: Quiz, correlationId: string | null): Frame => {
  const questions = quiz.questions.toArray().map((q) => {
    const base = {
      type: "multiple-choice" as const,
      id: q.id,
      prompt: q.prompt,
      // Strip correctChoiceId — only id + label go on the wire.
      choices: q.choices.toArray().map((c) => ({ id: c.id, label: c.label })),
    };
    return q.explanation !== undefined
      ? { ...base, explanation: q.explanation }
      : base;
  });

  return {
    v: PROTOCOL_VERSION,
    kind: "quiz-response",
    correlationId,
    payload: {
      quiz: {
        id: quiz.id,
        questions,
      },
    },
  };
};

// ---------------------------------------------------------------------------
// Internal: safe write — absorbs write failures into IO<never, void>
// ---------------------------------------------------------------------------

/** Write a frame, absorbing `WriteError` as `IO<never, void>`. */
const safeWrite = (write: FrameWriter, frame: Frame, logger: Logger): IO<never, void> =>
  write(frame).foldM(
    (writeErr: WriteError): IO<never, void> => {
      logger.error("Failed to write frame", { kind: writeErr.kind });
      return IO.pure(undefined);
    },
    (): IO<never, void> => IO.pure(undefined),
  );

// ---------------------------------------------------------------------------
// list-adapters-request handler
// ---------------------------------------------------------------------------

/**
 * Handle a `list-adapters-request` frame.
 *
 * Iterates the registry and writes a `list-adapters-response` frame.
 *
 * @param correlationId - Frame correlation ID.
 * @param deps - Injected dependencies.
 * @returns `IO<never, void>` — never fails.
 */
const handleListAdaptersRequest = (
  correlationId: string | null,
  deps: DispatcherDeps,
): IO<never, void> => {
  const { write, logger, registry } = deps;

  const responseFrame: Frame = {
    v: PROTOCOL_VERSION,
    kind: "list-adapters-response",
    correlationId,
    payload: {
      llm: registry.listLlm() as string[],
      vcs: registry.listVcs() as string[],
    },
  };

  logger.info("list-adapters-request handled", {
    llmCount: registry.listLlm().length,
    vcsCount: registry.listVcs().length,
  });

  return safeWrite(write, responseFrame, logger);
};

// ---------------------------------------------------------------------------
// check-auth-request handler
// ---------------------------------------------------------------------------

/**
 * Handle a `check-auth-request` frame.
 *
 * Iterates every adapter in the registry, calls `resolver.resolve` on each
 * (via `buildLlm` / `buildVcs`), collects an `AuthStatus` per adapter, and
 * writes a `check-auth-response` frame.
 *
 * Resolution failures are NOT propagated to the IO error channel — they are
 * individual `ok: false` rows in the response. The outer IO is `IO<never, void>`.
 *
 * BINDING: `detail` and `hint` in `AuthStatus` rows MUST NOT contain secret
 * bytes. The registry error shape already enforces this (field labels only).
 *
 * @param correlationId - Frame correlation ID.
 * @param deps - Injected dependencies.
 * @returns `IO<never, void>` — never fails.
 */
const handleCheckAuthRequest = (
  correlationId: string | null,
  deps: DispatcherDeps,
): IO<never, void> => {
  const { write, logger, registry } = deps;

  return IO.lift<never, void>(async () => {
    const llmIds = registry.listLlm();
    const vcsIds = registry.listVcs();
    const allIds = [...llmIds, ...vcsIds];

    const statuses: AuthStatus[] = [];

    // Resolve each adapter sequentially (simple, bounded by 5s per adapter via spawnIO).
    for (const adapterId of allIds) {
      let result;
      try {
        // Build the adapter — this triggers the resolver internally.
        // We use buildLlm for LLM IDs and buildVcs for VCS IDs.
        if ((llmIds as readonly string[]).includes(adapterId)) {
          result = await registry.buildLlm(adapterId).unsafeRun();
        } else {
          result = await registry.buildVcs(adapterId).unsafeRun();
        }
      } catch {
        statuses.push({
          adapterId,
          ok: false,
          detail: "resolver threw unexpectedly",
          hint: "Check host logs for details",
        });
        continue;
      }

      if (result.type === "Ok") {
        // Determine detail from adapter ID (CLI-managed vs env-based)
        const isCliManaged =
          adapterId === "claude-cli" ||
          adapterId === "codex-cli" ||
          adapterId === "copilot-cli";
        statuses.push({
          adapterId,
          ok: true,
          detail: isCliManaged ? "uses CLI's own login" : "credentials resolved",
        });
      } else {
        const err = result.error;
        // err is RegistryError — extract hint if present.
        if (err.kind === "missing-credentials") {
          statuses.push({
            adapterId,
            ok: false,
            hint: err.hint,
          });
        } else {
          statuses.push({
            adapterId,
            ok: false,
            detail: `${err.kind}: ${err.id}`,
          });
        }
      }
    }

    logger.info("check-auth-request handled", { adapterCount: statuses.length });

    const responseFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "check-auth-response",
      correlationId,
      payload: { statuses },
    };

    await safeWrite(write, responseFrame, logger).unsafeRun();
  });
};

// ---------------------------------------------------------------------------
// quiz-request handler
// ---------------------------------------------------------------------------

/**
 * Handle a `quiz-request` frame.
 *
 * Sequence (ADR-16 §Sequence binding, updated by ADR-29):
 * 1. Resolve adapter IDs (defaults applied when absent).
 * 2. Build VCS + LLM providers via registry (resolves credentials from host env).
 * 3. Fetch diff from VCS adapter (IO).
 * 4. Generate quiz from LLM adapter (IO).
 * 5. `pickCorrectAnswers` + store answer key.
 * 6. Build `quiz-response` frame (no `correctChoiceId`).
 * 7. Write frame to extension.
 *
 * As of ADR-29, step 2 is IO-bearing (credential resolution). The
 * `credentials` parameter is REMOVED — credentials come from the host env.
 *
 * All IO work is forked into a per-request Fiber so it can be cancelled
 * independently. Cancellation → log at info, no wire frame.
 * Errors → typed `ErrorFrame` matching the failure kind.
 *
 * @param pr - The PR identifier from the quiz-request payload.
 * @param questionCount - Number of questions requested.
 * @param llmAdapterId - Requested LLM adapter ID (defaults to "claude-cli").
 * @param vcsAdapterId - Requested VCS adapter ID (defaults to "github").
 * @param correlationId - Frame correlation ID.
 * @param deps - Injected dependencies.
 * @returns `IO<never, void>` — the outer IO never fails.
 */
const handleQuizRequest = (
  pr: PRIdentifier,
  questionCount: number,
  questionPoolSize: number | undefined,
  llmAdapterId: string,
  vcsAdapterId: string,
  correlationId: string | null,
  deps: DispatcherDeps,
): IO<never, void> => {
  const { write, store, logger, registry, cache, progress } = deps;
  const log = logger.child({ correlationId: correlationId ?? "", kind: "quiz-request" });

  // Cross-field validation: poolSize must be >= questionCount when present.
  if (questionPoolSize !== undefined && questionPoolSize < questionCount) {
    log.warn("questionPoolSize < questionCount — rejecting", {
      questionPoolSize,
      questionCount,
    });
    const errFrame = buildErrorFrame(
      "internal",
      "questionPoolSize must be >= questionCount",
      correlationId,
    );
    return safeWrite(write, errFrame, log);
  }

  type WorkError = RegistryError | VCSProviderError | LLMProviderError | WriteError;

  // Step 1–7: resolve adapters, fetch diff, generate or cache quiz, write response.
  const work: IO<WorkError, void> = registry
    .buildVcs(vcsAdapterId)
    .mapErr((e): WorkError => e)
    .flatMap((vcs: VCSProvider): IO<WorkError, void> =>
      registry
        .buildLlm(llmAdapterId)
        .mapErr((e): WorkError => e)
        .flatMap((llm: LLMProvider): IO<WorkError, void> => {
          // ADR-32: emit fetching-diff phase before calling vcs.fetchDiff.
          return IO.lift<WorkError, void>(async () => {
            await progress?.emit(correlationId, "fetching-diff");
          }).flatMap((): IO<WorkError, void> =>
            vcs
              .fetchDiff(pr)
              .mapErr((e): WorkError => e)
              .flatMap((diff: Diff): IO<WorkError, void> => {
                // Pool path (ADR-30): questionPoolSize present.
                if (questionPoolSize !== undefined) {
                  return IO.lift<WorkError, void>(async () => {
                    const diffHash = hashDiff(diff);
                    const prCanonical = canonicalisePR(pr);
                    const poolKey = cache.buildKey({
                      prKind: pr.kind,
                      llmAdapterId: llm.id,
                      prCanonical,
                      diffHash,
                    });

                    const cachedPool = cache.get(poolKey);
                    const cacheHit = cachedPool !== undefined;

                    let activePool: Pool;
                    if (!cacheHit) {
                      // Cache miss — generate the full pool.
                      log.info("Cache miss — generating question pool", {
                        llmId: llm.id,
                        poolSize: questionPoolSize,
                      });

                      // ADR-32: emit generating-quiz phase + start heartbeat.
                      await progress?.emit(correlationId, "generating-quiz");
                      const stopHeartbeat = progress?.startHeartbeat(correlationId, "generating-quiz") ?? (() => {});

                      let poolResult;
                      try {
                        poolResult = await llm
                          .generateQuiz({ diff, questionCount: questionPoolSize })
                          .mapErr((e): WorkError => e)
                          .unsafeRun();
                      } finally {
                        stopHeartbeat();
                      }

                      if (poolResult.type === "Err") {
                        throw poolResult.error;
                      }

                      // ADR-32: emit parsing phase before quizToPool.
                      await progress?.emit(correlationId, "parsing");

                      activePool = quizToPool(poolResult.value, poolKey, llm.id);

                      // ADR-32: emit caching phase before cache.put.
                      await progress?.emit(correlationId, "caching");

                      cache.put(activePool);
                    } else {
                      log.info("Cache hit — reusing question pool", {
                        poolKey,
                        poolSize: cachedPool.questions.length,
                      });
                      activePool = cachedPool;
                    }

                    const sampled = sampleFromPool(activePool.questions, questionCount);
                    const sampleQuizId = crypto.randomUUID();

                    const answerKey: Map<QuestionId, ChoiceId> = new Map(
                      sampled.map((q) => [q.id, q.correctChoiceId]),
                    );
                    store.set(sampleQuizId as QuizId, answerKey);
                    cache.putSampleMapping({
                      sampleQuizId,
                      poolKey,
                      sampledQuestionIds: sampled.map((q) => q.id),
                    });

                    log.info("Quiz sampled from pool — answer key stored", {
                      sampleQuizId,
                      questionCount: sampled.length,
                      cacheHit,
                    });

                    const responseFrame = buildPoolQuizResponseFrame(
                      sampled,
                      sampleQuizId,
                      correlationId,
                    );
                    const writeResult = await write(responseFrame)
                      .mapErr((e): WorkError => e)
                      .unsafeRun();
                    if (writeResult.type === "Err") {
                      throw writeResult.error;
                    }
                  });
                }

                // Legacy path: no questionPoolSize, no pool, no cache.
                log.info("Generating quiz", { llmId: llm.id, questionCount });

                // ADR-32: emit generating-quiz + heartbeat on legacy path too.
                return IO.lift<WorkError, void>(async () => {
                  await progress?.emit(correlationId, "generating-quiz");
                  const stopHeartbeat = progress?.startHeartbeat(correlationId, "generating-quiz") ?? (() => {});

                  let quizResult;
                  try {
                    quizResult = await llm
                      .generateQuiz({ diff, questionCount })
                      .mapErr((e): WorkError => e)
                      .unsafeRun();
                  } finally {
                    stopHeartbeat();
                  }

                  if (quizResult.type === "Err") {
                    throw quizResult.error;
                  }

                  const quiz = quizResult.value;
                  const answerKey = pickCorrectAnswers(quiz);
                  store.set(quiz.id as QuizId, answerKey);
                  log.info("Quiz generated — answer key stored", { quizId: quiz.id });

                  const responseFrame = buildQuizResponseFrame(quiz, correlationId);
                  const writeResult = await write(responseFrame).mapErr((e): WorkError => e).unsafeRun();
                  if (writeResult.type === "Err") {
                    throw writeResult.error;
                  }
                });
              }),
          );
        }),
    );

  // Fork into a per-request fiber. Join and handle all three outcomes.
  return work.fork().flatMap((fiber) =>
    IO.lift<never, void>(async () => {
      const outcome = await fiber.join();
      switch (outcome.type) {
        case "Ok":
          // Success — frame was already written inside work.
          break;

        case "Err": {
          const e = outcome.error;
          // Registry errors get a specific error reason; all others are "internal".
          if (
            e.kind === "unsupported-llm-adapter" ||
            e.kind === "unsupported-vcs-adapter" ||
            e.kind === "missing-credentials"
          ) {
            log.warn("Adapter construction failed", { kind: e.kind });
            const errFrame = buildRegistryErrorFrame(e as RegistryError, correlationId);
            await safeWrite(write, errFrame, log).unsafeRun();
          } else {
            // Best-effort detail extraction so the modal can show something
            // more useful than \"quiz-request failed: subprocess\". For LLM
            // subprocess errors we surface the trimmed stderr tail; for VCS
            // we surface status + detail. Tokens are not present in any of
            // these fields by construction (REDACT_PATHS in logger.ts covers
            // *.token/*.pat/*.apiKey paths for log output; wire fields stay
            // tokenless because adapters never embed creds in errors).
            const eAny = e as unknown as {
              kind?: string;
              reason?: string;
              detail?: string;
              stderr?: string;
              exitCode?: number;
              status?: number;
            };
            const tail = (s: string, max = 240): string =>
              s.length <= max ? s : `…${s.slice(s.length - max)}`;
            const subDetail =
              eAny.stderr !== undefined && eAny.stderr.trim() !== ""
                ? tail(eAny.stderr.trim())
                : eAny.detail;
            const reason = eAny.reason ? `[${eAny.reason}] ` : "";
            const exitInfo =
              eAny.exitCode !== undefined ? ` (exit ${eAny.exitCode})` : "";
            const detail = subDetail ? `: ${reason}${subDetail}${exitInfo}` : "";
            log.error("quiz-request failed", {
              kind: e.kind,
              reason: eAny.reason,
              exitCode: eAny.exitCode,
              detail: subDetail,
            });
            const errFrame = buildErrorFrame(
              "internal",
              `quiz-request failed: ${e.kind}${detail}`,
              correlationId,
            );
            await safeWrite(write, errFrame, log).unsafeRun();
          }
          break;
        }

        case "Cancelled":
          // Per spec: log at info, do NOT send a wire frame.
          log.info("quiz-request cancelled by caller", {
            correlationId: correlationId ?? "",
          });
          break;
      }
    }),
  );
};

// ---------------------------------------------------------------------------
// Pool helpers (ADR-30)
// ---------------------------------------------------------------------------

/**
 * Build the canonical PR identifier string used as the `prCanonical` segment
 * of the cache key.
 *
 * - GitHub: `"github:<owner>/<repo>#<number>"`
 * - ADO:    `"ado:<org>/<project>/<repo>#<pullRequestId>"`
 *
 * BINDING: This function MUST NOT incorporate PR title / description / labels /
 * comments — the canonical form is coordinates only. ADR-30 §Diff-only invariant.
 *
 * @param pr - The typed PR identifier.
 * @returns The canonical string.
 */
const canonicalisePR = (pr: PRIdentifier): string => {
  switch (pr.kind) {
    case "github":
      return `github:${pr.owner}/${pr.repo}#${pr.number}`;
    case "ado":
      return `ado:${pr.org}/${pr.project}/${pr.repo}#${pr.pullRequestId}`;
  }
};

/**
 * Fisher–Yates shuffle in place. Uses `Math.random()` — acceptable per
 * ADR-30 §Sampling: silent UX, no replay attack surface. ADR-30.
 */
const shuffleInPlace = <T>(arr: T[]): T[] => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j]!;
    arr[j] = tmp!;
  }
  return arr;
};

/**
 * Sample `count` questions from a pool using Fisher–Yates (ADR-30 §Sampling).
 *
 * If `count >= pool.length` all questions are returned in shuffled order.
 *
 * @param pool - Source question pool.
 * @param count - Number of questions to sample.
 * @returns A new array of the sampled questions.
 */
const sampleFromPool = (
  pool: ReadonlyArray<PoolQuestion>,
  count: number,
): PoolQuestion[] => {
  const copy = [...pool];
  shuffleInPlace(copy);
  return copy.slice(0, Math.min(count, copy.length));
};

/**
 * Build a `quiz-response` Frame from a list of sampled `PoolQuestion`s and a
 * sample quiz ID.
 *
 * BINDING: `correctChoiceId` is NEVER written to the wire. ADR-30.
 *
 * @param questions - Sampled questions (with correctChoiceId held host-side).
 * @param sampleQuizId - Fresh UUID to use as the quiz ID on the wire.
 * @param correlationId - Correlation ID from the original request.
 * @returns A well-formed `quiz-response` Frame.
 */
const buildPoolQuizResponseFrame = (
  questions: ReadonlyArray<PoolQuestion>,
  sampleQuizId: string,
  correlationId: string | null,
): Frame => {
  const wireDTOs = questions.map((q) => {
    const base = {
      type: "multiple-choice" as const,
      id: q.id,
      prompt: q.prompt,
      choices: q.choices.map((c) => ({ id: c.id, label: c.label })),
    };
    return q.explanation !== undefined ? { ...base, explanation: q.explanation } : base;
  });

  return {
    v: PROTOCOL_VERSION,
    kind: "quiz-response",
    correlationId,
    payload: {
      quiz: { id: sampleQuizId as QuizId, questions: wireDTOs },
    },
  };
};

/**
 * Reify an LLM-generated `Quiz` into a `Pool` for caching.
 *
 * Extracts all questions (including `correctChoiceId`) from the domain Quiz
 * and packages them into a `Pool` ready for the cache. The domain Quiz is
 * discarded after this — the pool is the authority.
 *
 * @param quiz - The domain Quiz produced by the LLM adapter.
 * @param poolKey - The composite cache key for this pool.
 * @param llmAdapterId - LLM adapter id (for logs/telemetry).
 * @returns A `Pool` ready for `cache.put`.
 */
const quizToPool = (quiz: Quiz, poolKey: string, llmAdapterId: string): Pool => ({
  key: poolKey,
  llmAdapterId,
  createdAt: Date.now(),
  questions: quiz.questions.toArray().map((q) => ({
    type: "multiple-choice" as const,
    id: q.id,
    prompt: q.prompt,
    choices: q.choices.toArray().map((c) => ({ id: c.id, label: c.label })),
    correctChoiceId: q.correctChoiceId,
    ...(q.explanation !== undefined ? { explanation: q.explanation } : {}),
  })),
});

// ---------------------------------------------------------------------------
// quiz-resample-request handler (ADR-30)
// ---------------------------------------------------------------------------

/**
 * Handle a `quiz-resample-request` frame.
 *
 * Sequence (ADR-30 §5):
 * 1. Look up the sample mapping for the given quizId.
 * 2. Look up the pool the mapping points to.
 * 3. Sample `questionCount` questions (Fisher–Yates, independent of prior sample).
 * 4. Generate a fresh sampleQuizId.
 * 5. Build answer key; store in SessionStore.
 * 6. Record new sample mapping.
 * 7. Build and write `quiz-response`.
 *
 * Unknown quizId or evicted pool → `ErrorFrame { reason: "internal" }`.
 * The extension's fallback handler detects the `RESAMPLE_FAILED_PREFIX` and
 * retries with a fresh `quiz-request`.
 *
 * @param quizId - The sample quizId from the prior quiz-response.
 * @param questionCount - How many questions to include in the new sample.
 * @param correlationId - Frame correlation ID.
 * @param deps - Injected dependencies (including cache).
 * @returns `IO<never, void>` — never fails.
 */
const handleQuizResampleRequest = (
  quizId: string,
  questionCount: number,
  correlationId: string | null,
  deps: DispatcherDeps,
): IO<never, void> => {
  const { write, store, logger, cache } = deps;
  const log = logger.child({
    correlationId: correlationId ?? "",
    kind: "quiz-resample-request",
    quizId,
  });

  const mapping = cache.getSampleMapping(quizId);
  if (mapping === undefined) {
    log.warn("Resample failed — unknown quizId");
    const errFrame = buildErrorFrame(
      "internal",
      `${RESAMPLE_FAILED_PREFIX} unknown quiz id`,
      correlationId,
      { quizId },
    );
    return safeWrite(write, errFrame, log);
  }

  const pool = cache.get(mapping.poolKey);
  if (pool === undefined) {
    log.warn("Resample failed — pool evicted from LRU cache", {
      poolKey: mapping.poolKey,
    });
    const errFrame = buildErrorFrame(
      "internal",
      `${RESAMPLE_FAILED_PREFIX} pool evicted`,
      correlationId,
      { quizId },
    );
    return safeWrite(write, errFrame, log);
  }

  const sampled = sampleFromPool(pool.questions, questionCount);
  const newSampleQuizId = crypto.randomUUID();

  // Build answer key from the sampled questions.
  const answerKey: Map<QuestionId, ChoiceId> = new Map(
    sampled.map((q) => [q.id, q.correctChoiceId]),
  );
  store.set(newSampleQuizId as QuizId, answerKey);
  cache.putSampleMapping({
    sampleQuizId: newSampleQuizId,
    poolKey: mapping.poolKey,
    sampledQuestionIds: sampled.map((q) => q.id),
  });

  log.info("Quiz resampled from pool", {
    newSampleQuizId,
    poolKey: mapping.poolKey,
    questionCount: sampled.length,
  });

  const responseFrame = buildPoolQuizResponseFrame(sampled, newSampleQuizId, correlationId);
  return safeWrite(write, responseFrame, log);
};

// ---------------------------------------------------------------------------
// quiz-submit handler
// ---------------------------------------------------------------------------

/**
 * Handle a `quiz-submit` frame.
 *
 * Sequence (ADR-16 §Sequence binding):
 * 6. Look up answer key in SessionStore.
 * 7. `scoreSubmission` (pure).
 * 8. `decidePassed` (pure).
 * 9. `store.delete` (no replay invariant).
 * 10. Build `quiz-result` frame and write it.
 *
 * @param quizId - The quiz ID from the quiz-submit payload.
 * @param answers - The submitted answers.
 * @param correlationId - Frame correlation ID.
 * @param deps - Injected dependencies.
 * @returns `IO<never, void>` — the outer IO never fails.
 */
const handleQuizSubmit = (
  quizId: string,
  answers: ReadonlyArray<{ readonly questionId: string; readonly chosenChoiceId: string }>,
  correlationId: string | null,
  deps: DispatcherDeps,
): IO<never, void> => {
  const { write, store, logger } = deps;
  const log = logger.child({ correlationId: correlationId ?? "", kind: "quiz-submit", quizId });

  const answerKey = store.get(quizId as QuizId);
  if (answerKey === undefined) {
    log.warn("Unknown quiz ID on submit");
    const errFrame = buildErrorFrame(
      "unknown-quiz-id",
      `Unknown quiz ID: ${quizId}`,
      correlationId,
    );
    return safeWrite(write, errFrame, log);
  }

  const submitted = answers.map((a) => ({
    questionId: a.questionId as QuestionId,
    chosenChoiceId: a.chosenChoiceId as ChoiceId,
  }));

  const scoreResult = scoreSubmission(answerKey, submitted);

  return scoreResult.fold(
    (scoreErr): IO<never, void> => {
      log.warn("Score submission validation failed", { kind: scoreErr.kind });
      // Drop stale state even on error
      store.delete(quizId as QuizId);
      const errFrame = buildErrorFrame(
        "schema-violation",
        `Score error: ${scoreErr.kind}`,
        correlationId,
      );
      return safeWrite(write, errFrame, log);
    },
    (score): IO<never, void> => {
      const passed = decidePassed(score);
      store.delete(quizId as QuizId);

      log.info("Quiz scored", {
        quizId,
        passed,
        correct: score.correct,
        total: score.total,
      });

      const resultFrame: Frame = {
        v: PROTOCOL_VERSION,
        kind: "quiz-result",
        correlationId,
        payload: {
          passed,
          correct: score.correct,
          total: score.total,
          perQuestion: score.perQuestion.map((pq) =>
            pq.explanation !== undefined
              ? { questionId: pq.questionId, correct: pq.correct, explanation: pq.explanation }
              : { questionId: pq.questionId, correct: pq.correct },
          ),
        },
      };

      return safeWrite(write, resultFrame, log);
    },
  );
};

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

/**
 * The frame dispatcher returned by `createDispatcher`.
 */
export type DispatcherFactory = {
  /**
   * Dispatch a single incoming Frame.
   *
   * All internal failures are surfaced as `ErrorFrame`s sent to the
   * extension. The returned `IO` itself never fails — it is `IO<never, void>`.
   */
  readonly dispatch: (frame: Frame) => IO<never, void>;
};

/**
 * Create the frame dispatcher.
 *
 * Handles `quiz-request`, `quiz-submit`, `list-adapters-request`,
 * `check-auth-request`, `error` (log + ignore), and unexpected kinds
 * (reply with `ErrorFrame { reason: "unknown-message" }`).
 *
 * @param deps - Injected dependencies (write, store, logger, registry).
 * @returns A `DispatcherFactory` with a single `dispatch` method.
 */
export const createDispatcher = (deps: DispatcherDeps): DispatcherFactory => {
  const { write, logger } = deps;

  const dispatch = (frame: Frame): IO<never, void> => {
    logger.info("Dispatching frame", {
      kind: frame.kind,
      correlationId: frame.correlationId,
    });

    switch (frame.kind) {
      case "ping": {
        const pong: Frame = {
          v: PROTOCOL_VERSION,
          kind: "pong",
          correlationId: frame.correlationId,
          payload:
            frame.payload.nonce !== undefined ? { nonce: frame.payload.nonce } : {},
        };
        return safeWrite(write, pong, logger);
      }

      case "error":
        // Extension should not send error frames to the host; log + ignore per ADR-13.
        logger.warn("Received error frame from extension — ignoring", {
          kind: frame.kind,
          correlationId: frame.correlationId,
        });
        return IO.pure(undefined);

      case "list-adapters-request":
        return handleListAdaptersRequest(frame.correlationId, deps);

      case "check-auth-request":
        return handleCheckAuthRequest(frame.correlationId, deps);

      case "quiz-request": {
        const llmAdapterId =
          frame.payload.llmAdapterId ?? DEFAULT_LLM_ADAPTER_ID;
        const vcsAdapterId =
          frame.payload.vcsAdapterId ?? DEFAULT_VCS_ADAPTER_ID;
        // ADR-29: credentials field is REMOVED. Never read payload.credentials.

        return handleQuizRequest(
          frame.payload.pr as PRIdentifier,
          frame.payload.questionCount,
          frame.payload.questionPoolSize,
          llmAdapterId,
          vcsAdapterId,
          frame.correlationId,
          deps,
        );
      }

      case "quiz-resample-request":
        return handleQuizResampleRequest(
          frame.payload.quizId,
          frame.payload.questionCount,
          frame.correlationId,
          deps,
        );

      case "quiz-submit":
        return handleQuizSubmit(
          frame.payload.quizId,
          frame.payload.answers,
          frame.correlationId,
          deps,
        );

      case "pong":
      case "quiz-response":
      case "quiz-result":
      case "list-adapters-response":
      case "check-auth-response":
      case "quiz-progress": {
        // These are host→extension frame kinds; receiving them from the extension
        // is unexpected. quiz-progress in particular is strictly one-way.
        logger.warn("Received unexpected frame kind — replying with unknown-message", {
          kind: frame.kind,
          correlationId: frame.correlationId,
        });
        const errFrame = buildErrorFrame(
          "unknown-message",
          `Unexpected frame kind received from extension: ${frame.kind}`,
          frame.correlationId,
        );
        return safeWrite(write, errFrame, logger);
      }
    }
  };

  return { dispatch };
};
