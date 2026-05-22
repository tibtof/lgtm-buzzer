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
} from "@lgtm-buzzer/core";
import { pickCorrectAnswers, scoreSubmission, decidePassed } from "@lgtm-buzzer/core";
import type { Logger } from "@lgtm-buzzer/core";
import type { Frame, CredentialsBag } from "@lgtm-buzzer/protocol";
import { PROTOCOL_VERSION } from "@lgtm-buzzer/protocol";
import type { FrameWriter } from "./framing/writer.js";
import type { WriteError } from "./framing/errors.js";
import type { SessionStore } from "./session-store.js";
import type { AdapterRegistry, RegistryError } from "./registry.js";

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
  /** @deprecated env is kept for test backward-compat but no longer used for adapter selection. */
  readonly env?: Readonly<Record<string, string | undefined>>;
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
    | "bad-credentials"
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
 * BINDING: `details` MUST NOT include credential bytes. For `bad-credentials`,
 * only the `adapterId` and `detail` (field paths) are included.
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
        `Adapter ${err.adapterId} requires credentials`,
        correlationId,
        { adapterId: err.adapterId },
      );
    case "bad-credentials":
      // detail contains field paths only — never credential values.
      return buildErrorFrame(
        "bad-credentials",
        `Credentials for adapter ${err.adapterId} are invalid`,
        correlationId,
        { adapterId: err.adapterId, detail: err.detail },
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
// quiz-request handler
// ---------------------------------------------------------------------------

/**
 * Handle a `quiz-request` frame.
 *
 * Sequence (ADR-16 §Sequence binding, extended by ADR-22):
 * 1. Resolve adapter IDs (defaults applied when absent).
 * 2. Build VCS + LLM providers via registry (validates credentials).
 * 3. Fetch diff from VCS adapter (IO).
 * 4. Generate quiz from LLM adapter (IO).
 * 5. `pickCorrectAnswers` + store answer key.
 * 6. Build `quiz-response` frame (no `correctChoiceId`).
 * 7. Write frame to extension.
 *
 * All IO work is forked into a per-request Fiber so it can be cancelled
 * independently. Cancellation → log at info, no wire frame.
 * Errors → typed `ErrorFrame` matching the failure kind.
 *
 * @param pr - The PR identifier from the quiz-request payload.
 * @param questionCount - Number of questions requested.
 * @param llmAdapterId - Requested LLM adapter ID (defaults to "claude-cli").
 * @param vcsAdapterId - Requested VCS adapter ID (defaults to "github").
 * @param credentials - Per-request credentials bag (may be undefined).
 * @param correlationId - Frame correlation ID.
 * @param deps - Injected dependencies.
 * @returns `IO<never, void>` — the outer IO never fails.
 */
const handleQuizRequest = (
  pr: PRIdentifier,
  questionCount: number,
  llmAdapterId: string,
  vcsAdapterId: string,
  credentials: CredentialsBag | undefined,
  correlationId: string | null,
  deps: DispatcherDeps,
): IO<never, void> => {
  const { write, store, logger, registry } = deps;
  const log = logger.child({ correlationId: correlationId ?? "", kind: "quiz-request" });

  type WorkError = VCSProviderError | LLMProviderError | WriteError;

  // Step 1: resolve adapters via registry (pure Either).
  // Use .self for narrowing — Either<A,B> does not expose .value directly,
  // but .self narrows to Left<RegistryError> | Right<Provider>.
  const vcsResult = registry.buildVcs(vcsAdapterId, credentials);
  const llmResult = registry.buildLlm(llmAdapterId, credentials);

  // Step 2: if either adapter fails, send the appropriate error frame immediately.
  // Diff is NEVER fetched in registry-error branches.
  if (vcsResult.self.type === "Left") {
    const err = vcsResult.self.value;
    const errFrame = buildRegistryErrorFrame(err, correlationId);
    log.warn("VCS adapter construction failed", { kind: err.kind });
    return safeWrite(write, errFrame, log);
  }

  if (llmResult.self.type === "Left") {
    const err = llmResult.self.value;
    const errFrame = buildRegistryErrorFrame(err, correlationId);
    log.warn("LLM adapter construction failed", { kind: err.kind });
    return safeWrite(write, errFrame, log);
  }

  const vcs: VCSProvider = vcsResult.self.value;
  const llm: LLMProvider = llmResult.self.value;

  // Step 3–7: fetch diff, generate quiz, store answer key, write response.
  const work: IO<WorkError, void> = vcs
    .fetchDiff(pr)
    .mapErr((e): WorkError => e)
    .flatMap((diff): IO<WorkError, void> => {
      log.info("Generating quiz", { llmId: llm.id, questionCount });
      return llm
        .generateQuiz({ diff, questionCount })
        .mapErr((e): WorkError => e)
        .flatMap((quiz): IO<WorkError, void> => {
          const answerKey = pickCorrectAnswers(quiz);
          store.set(quiz.id as QuizId, answerKey);
          log.info("Quiz generated — answer key stored", { quizId: quiz.id });

          const responseFrame = buildQuizResponseFrame(quiz, correlationId);
          return write(responseFrame).mapErr((e): WorkError => e);
        });
    });

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
          log.error("quiz-request failed", { kind: e.kind });
          const errFrame = buildErrorFrame(
            "internal",
            `quiz-request failed: ${e.kind}`,
            correlationId,
          );
          await safeWrite(write, errFrame, log).unsafeRun();
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
 * Handles `quiz-request`, `quiz-submit`, `list-adapters-request`, `error`
 * (log + ignore), and unexpected kinds (reply with `ErrorFrame { reason: "unknown-message" }`).
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

      case "quiz-request": {
        const llmAdapterId =
          frame.payload.llmAdapterId ?? DEFAULT_LLM_ADAPTER_ID;
        const vcsAdapterId =
          frame.payload.vcsAdapterId ?? DEFAULT_VCS_ADAPTER_ID;
        const credentials = frame.payload.credentials;

        return handleQuizRequest(
          frame.payload.pr as PRIdentifier,
          frame.payload.questionCount,
          llmAdapterId,
          vcsAdapterId,
          credentials,
          frame.correlationId,
          deps,
        );
      }

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
      case "list-adapters-response": {
        // These are host→extension frame kinds; receiving them is unexpected.
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
