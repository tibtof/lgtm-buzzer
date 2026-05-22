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
import type { Frame } from "@lgtm-buzzer/protocol";
import { PROTOCOL_VERSION } from "@lgtm-buzzer/protocol";
import type { FrameWriter } from "./framing/writer.js";
import type { WriteError } from "./framing/errors.js";
import type { SessionStore } from "./session-store.js";
import { pickLLMProvider, pickVCSProvider, buildErrorFrame } from "./adapter-registry.js";
import type { AdapterError } from "./adapter-registry.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dependencies injected into `createDispatcher`. */
export type DispatcherDeps = {
  readonly write: FrameWriter;
  readonly store: SessionStore;
  readonly logger: Logger;
  readonly env?: Readonly<Record<string, string | undefined>>;
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
// quiz-request handler
// ---------------------------------------------------------------------------

/**
 * Handle a `quiz-request` frame.
 *
 * Sequence (ADR-16 §Sequence binding):
 * 1. Select VCS + LLM providers via adapter registry.
 * 2. Fetch diff from VCS adapter (IO).
 * 3. Generate quiz from LLM adapter (IO).
 * 4. `pickCorrectAnswers` + store answer key.
 * 5. Build `quiz-response` frame (no `correctChoiceId`).
 * 6. Write frame to extension.
 *
 * All IO work is forked into a per-request Fiber so it can be cancelled
 * independently (#43 future). Cancellation → log at info, no wire frame.
 * Errors → `ErrorFrame { reason: "internal" }`.
 *
 * @param pr - The PR identifier from the quiz-request payload.
 * @param questionCount - Number of questions requested.
 * @param correlationId - Frame correlation ID.
 * @param deps - Injected dependencies.
 * @returns `IO<never, void>` — the outer IO never fails.
 */
const handleQuizRequest = (
  pr: PRIdentifier,
  questionCount: number,
  correlationId: string | null,
  deps: DispatcherDeps,
): IO<never, void> => {
  const { write, store, logger, env } = deps;
  const log = logger.child({ correlationId: correlationId ?? "", kind: "quiz-request" });

  type WorkError = VCSProviderError | LLMProviderError | AdapterError | WriteError;

  // Build the full pipeline. Each flatMap step widens the error type explicitly
  // by mapping errors to the union via mapErr where TypeScript can't infer widening.
  const work: IO<WorkError, void> = pickVCSProvider(pr, env)
    .mapErr((e): WorkError => e)
    .flatMap((vcs: VCSProvider): IO<WorkError, void> =>
      pickLLMProvider(env)
        .mapErr((e): WorkError => e)
        .flatMap((llm: LLMProvider): IO<WorkError, void> => {
          log.info("Fetching diff", { vcsId: vcs.id });
          return vcs
            .fetchDiff(pr)
            .mapErr((e): WorkError => e)
            .flatMap(
              (diff): IO<WorkError, void> => {
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
              },
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
 * Handles `quiz-request`, `quiz-submit`, `error` (log + ignore), and
 * unexpected kinds (reply with `ErrorFrame { reason: "unknown-message" }`).
 *
 * @param deps - Injected dependencies (write, store, logger, env).
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

      case "quiz-request":
        return handleQuizRequest(
          frame.payload.pr as PRIdentifier,
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
      case "quiz-result": {
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
