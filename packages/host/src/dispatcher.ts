import { IO } from "monadyssey";
import type { Fiber } from "monadyssey";
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

/**
 * Internal error union for the composed quiz pipeline (ADR-33).
 *
 * Every port error variant is widened into this union via `.mapErr` so the
 * composed `IO` has a single, flat error channel.
 */
type DispatcherError = RegistryError | VCSProviderError | LLMProviderError | WriteError;

/**
 * Per-request fiber registry, keyed by correlationId (ADR-33).
 *
 * Populated on quiz-request handler start; cleaned in the join `finally`.
 * Used by `handleQuizCancelRequest` to look up the fiber and call
 * `fiber.cancel()`.
 *
 * Module-private inside `createDispatcher` closure. Not exported.
 */
type FiberRegistry = Map<string, Fiber<DispatcherError, void>>;

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
    | "missing-credentials"
    | "cancelled",
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
// quiz-request: pool path IO helper (ADR-30 + ADR-33)
// ---------------------------------------------------------------------------

/**
 * Build the pool-path IO: cache lookup, optional LLM call, sample, store,
 * write response. Never calls `.unsafeRun()` — every step stays inside IO.
 */
const runPoolPath = (
  diff: Diff,
  llm: LLMProvider,
  vcs: VCSProvider,
  pr: PRIdentifier,
  questionCount: number,
  questionPoolSize: number,
  correlationId: string | null,
  deps: DispatcherDeps,
  log: Logger,
): IO<DispatcherError, void> => {
  const { write, store, cache, progress } = deps;

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

  // Pool generation path (cache miss): emit heartbeat + generate.
  const getPool: IO<DispatcherError, Pool> = cacheHit
    ? IO.pure(cachedPool)
    : (() => {
        log.info("Cache miss — generating question pool", {
          llmId: llm.id,
          poolSize: questionPoolSize,
        });
        // ADR-32 + ADR-33: heartbeat for generating-quiz phase.
        // startHeartbeat is a side-effectful setInterval call; wire it via
        // IO.bracket so the stop function is guaranteed to run on Ok/Err/Cancelled.
        const heartbeatIO: IO<DispatcherError, Quiz> = IO.bracket<DispatcherError, (() => void), Quiz>(
          IO.lift<DispatcherError, () => void>(async () => {
            await progress?.emit(correlationId, "generating-quiz");
            return progress?.startHeartbeat(correlationId, "generating-quiz") ?? (() => {});
          }),
          // use: run the LLM call (stop function held for release phase).
          (): IO<DispatcherError, Quiz> =>
            llm.generateQuiz({ diff, questionCount: questionPoolSize }).mapErr((e): DispatcherError => e),
          (stop): IO<never, void> => IO.lift<never, void>(() => { stop(); }),
        );

        return heartbeatIO
          .flatMap((quiz): IO<DispatcherError, Pool> => {
            // ADR-32: parsing phase.
            return IO.lift<DispatcherError, void>(async () => {
              await progress?.emit(correlationId, "parsing");
            }).flatMap((): IO<DispatcherError, Pool> => {
              const pool = quizToPool(quiz, poolKey, llm.id);
              // ADR-32: caching phase.
              return IO.lift<DispatcherError, Pool>(async () => {
                await progress?.emit(correlationId, "caching");
                cache.put(pool);
                return pool;
              });
            });
          });
      })();

  return getPool.flatMap((activePool): IO<DispatcherError, void> => {
    if (cacheHit) {
      log.info("Cache hit — reusing question pool", {
        poolKey,
        poolSize: activePool.questions.length,
      });
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

    const responseFrame = buildPoolQuizResponseFrame(sampled, sampleQuizId, correlationId);
    return write(responseFrame).mapErr((e): DispatcherError => e);
  });

  // vcs is declared but not directly used in this helper — it flows through
  // via the vcs.fetchDiff call in the parent chain. Keep the parameter to
  // match the signature expected by the caller.
  void vcs;
};

// ---------------------------------------------------------------------------
// quiz-request: legacy path IO helper (ADR-33)
// ---------------------------------------------------------------------------

/**
 * Build the legacy-path IO: generate quiz, store answer key, write response.
 * Never calls `.unsafeRun()`.
 */
const runLegacyPath = (
  diff: Diff,
  llm: LLMProvider,
  questionCount: number,
  correlationId: string | null,
  deps: DispatcherDeps,
  log: Logger,
): IO<DispatcherError, void> => {
  const { write, store, progress } = deps;

  log.info("Generating quiz", { llmId: llm.id, questionCount });

  // ADR-32 + ADR-33: wrap generate in bracket so the heartbeat stop is
  // guaranteed to run on Ok/Err/Cancelled.
  return IO.bracket<DispatcherError, (() => void), Quiz>(
    IO.lift<DispatcherError, () => void>(async () => {
      await progress?.emit(correlationId, "generating-quiz");
      return progress?.startHeartbeat(correlationId, "generating-quiz") ?? (() => {});
    }),
    // use: run the LLM call (stop function held for release phase).
    (): IO<DispatcherError, Quiz> =>
      llm.generateQuiz({ diff, questionCount }).mapErr((e): DispatcherError => e),
    (stop): IO<never, void> => IO.lift<never, void>(() => { stop(); }),
  ).flatMap((quiz): IO<DispatcherError, void> => {
    const answerKey = pickCorrectAnswers(quiz);
    store.set(quiz.id as QuizId, answerKey);
    log.info("Quiz generated — answer key stored", { quizId: quiz.id });

    const responseFrame = buildQuizResponseFrame(quiz, correlationId);
    return write(responseFrame).mapErr((e): DispatcherError => e);
  });
};

// ---------------------------------------------------------------------------
// quiz-request handler (ADR-33 refactor)
// ---------------------------------------------------------------------------

/**
 * Map a `DispatcherError` to a wire error frame.
 *
 * BINDING: `details` MUST NOT include credential bytes.
 *
 * @param e - The dispatcher error.
 * @param correlationId - Correlation ID from the originating request.
 * @returns A well-formed error Frame.
 */
const buildDispatcherErrorFrame = (
  e: DispatcherError,
  correlationId: string | null,
): Frame => {
  if (
    e.kind === "unsupported-llm-adapter" ||
    e.kind === "unsupported-vcs-adapter" ||
    e.kind === "missing-credentials"
  ) {
    return buildRegistryErrorFrame(e as RegistryError, correlationId);
  }

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

  return buildErrorFrame(
    "internal",
    `quiz-request failed: ${e.kind}${detail}`,
    correlationId,
  );
};

/**
 * Handle a `quiz-request` frame.
 *
 * Sequence (ADR-16 §Sequence binding, updated by ADR-29 + ADR-33):
 * 1. Resolve adapter IDs (defaults applied when absent).
 * 2. Build VCS + LLM providers via registry (resolves credentials from host env).
 * 3. Fetch diff from VCS adapter (IO).
 * 4. Generate quiz from LLM adapter (IO).
 * 5. `pickCorrectAnswers` + store answer key.
 * 6. Build `quiz-response` frame (no `correctChoiceId`).
 * 7. Write frame to extension.
 *
 * ADR-33: The entire work pipeline is a single composed `IO<DispatcherError, void>`
 * built via `flatMap`. NO `.unsafeRun()` inside the work body. The composed IO
 * is `fork()`ed once; the resulting `Fiber` is stored in `fibers` so
 * `handleQuizCancelRequest` can call `fiber.cancel()`.
 *
 * @param pr - The PR identifier from the quiz-request payload.
 * @param questionCount - Number of questions requested.
 * @param questionPoolSize - Optional pool size (ADR-30).
 * @param llmAdapterId - Requested LLM adapter ID.
 * @param vcsAdapterId - Requested VCS adapter ID.
 * @param correlationId - Frame correlation ID.
 * @param deps - Injected dependencies.
 * @param fibers - Per-request fiber registry (ADR-33).
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
  fibers: FiberRegistry,
): IO<never, void> => {
  const { write, logger, registry, progress } = deps;
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

  // ADR-33: the work IO. Each step composes with the next via flatMap. The
  // body MUST NOT call .unsafeRun() — cancellation propagates through every
  // frame. (Reviewer-enforced binding (a) from ADR-33.)
  const work: IO<DispatcherError, void> = registry
    .buildVcs(vcsAdapterId)
    .mapErr((e): DispatcherError => e)
    .flatMap((vcs: VCSProvider): IO<DispatcherError, void> =>
      registry
        .buildLlm(llmAdapterId)
        .mapErr((e): DispatcherError => e)
        .flatMap((llm: LLMProvider): IO<DispatcherError, void> =>
          IO.lift<DispatcherError, void>(async () => {
            // ADR-32: emit fetching-diff phase before calling vcs.fetchDiff.
            await progress?.emit(correlationId, "fetching-diff");
          }).flatMap((): IO<DispatcherError, void> =>
            vcs
              .fetchDiff(pr)
              .mapErr((e): DispatcherError => e)
              .flatMap((diff: Diff): IO<DispatcherError, void> => {
                if (questionPoolSize !== undefined) {
                  return runPoolPath(
                    diff,
                    llm,
                    vcs,
                    pr,
                    questionCount,
                    questionPoolSize,
                    correlationId,
                    deps,
                    log,
                  );
                }
                return runLegacyPath(diff, llm, questionCount, correlationId, deps, log);
              }),
          ),
        ),
    );

  // ADR-33: fork the work IO once. The fork returns IO<never, Fiber<...>>.
  // The outer IO never fails — all errors surface via safeWrite.
  return work.fork().flatMap((fiber): IO<never, void> => {
    // Register fiber so quiz-cancel-request can call fiber.cancel().
    if (correlationId !== null) fibers.set(correlationId, fiber);

    return IO.lift<never, void>(async () => {
      try {
        const outcome = await fiber.join();
        switch (outcome.type) {
          case "Ok":
            // Success — response frame already written inside work.
            break;

          case "Err": {
            const e = outcome.error;
            log.error("quiz-request failed", {
              kind: e.kind,
              reason: (e as unknown as { reason?: string }).reason,
              exitCode: (e as unknown as { exitCode?: number }).exitCode,
              detail: (e as unknown as { detail?: string }).detail,
            });
            const errFrame = buildDispatcherErrorFrame(e, correlationId);
            await safeWrite(write, errFrame, log).unsafeRun();
            break;
          }

          case "Cancelled":
            // ADR-33: emit `ErrorFrame { reason: "cancelled" }` so the SW can
            // resolve the pending entry. Without this the SW waits for its
            // 180s timeout to fire.
            log.info("quiz-request fiber cancelled", {
              correlationId: correlationId ?? "",
            });
            await safeWrite(
              write,
              buildErrorFrame("cancelled", "quiz-request cancelled", correlationId),
              log,
            ).unsafeRun();
            break;
        }
      } finally {
        // ADR-33 binding (e): registry entry MUST be cleaned in finally.
        if (correlationId !== null) fibers.delete(correlationId);
      }
    });
  });
};

// ---------------------------------------------------------------------------
// quiz-cancel-request handler (ADR-33 NEW)
// ---------------------------------------------------------------------------

/**
 * Handle a `quiz-cancel-request` frame (ADR-33).
 *
 * Looks up the fiber by `cancelCorrelationId` and calls `fiber.cancel()`.
 * If no fiber is registered (cancel arrived after completion), logs at info
 * and returns — no error frame is emitted (ADR-33 binding (d)).
 *
 * BINDING (d): MUST NOT emit any reply frame.
 *
 * @param cancelCorrelationId - The correlationId from the payload.
 * @param deps - Injected dependencies.
 * @param fibers - Per-request fiber registry.
 * @returns `IO<never, void>` — never fails.
 */
const handleQuizCancelRequest = (
  cancelCorrelationId: string,
  deps: DispatcherDeps,
  fibers: FiberRegistry,
): IO<never, void> => {
  const fiber = fibers.get(cancelCorrelationId);
  if (fiber === undefined) {
    // Cancel arrived after the work completed — no-op.
    deps.logger.info("quiz-cancel-request for unknown correlationId — no-op", {
      correlationId: cancelCorrelationId,
    });
    return IO.pure(undefined);
  }
  // Idempotent per Fiber.cancel contract.
  return IO.lift<never, void>(async () => {
    await fiber.cancel();
    deps.logger.info("quiz-request fiber cancelled", {
      correlationId: cancelCorrelationId,
    });
  });
};

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
 * Handles `quiz-request`, `quiz-cancel-request`, `quiz-submit`,
 * `list-adapters-request`, `check-auth-request`, `error` (log + ignore),
 * and unexpected kinds (reply with `ErrorFrame { reason: "unknown-message" }`).
 *
 * ADR-33: allocates one `FiberRegistry` in its closure and passes it to both
 * `handleQuizRequest` and `handleQuizCancelRequest`.
 *
 * @param deps - Injected dependencies (write, store, logger, registry).
 * @returns A `DispatcherFactory` with a single `dispatch` method.
 */
export const createDispatcher = (deps: DispatcherDeps): DispatcherFactory => {
  const { write, logger } = deps;

  // ADR-33: per-request fiber registry, keyed by correlationId.
  // Allocated once at factory time; shared by handleQuizRequest and
  // handleQuizCancelRequest via closure.
  const fibers: FiberRegistry = new Map();

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
          fibers,
        );
      }

      case "quiz-cancel-request":
        // ADR-33: look up fiber by payload.correlationId and call fiber.cancel().
        return handleQuizCancelRequest(
          frame.payload.correlationId,
          deps,
          fibers,
        );

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
