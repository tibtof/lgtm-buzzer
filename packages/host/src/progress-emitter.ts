import type { Logger } from "@lgtm-buzzer/core";
import type { QuizProgressPhase } from "@lgtm-buzzer/protocol";
import { PROTOCOL_VERSION } from "@lgtm-buzzer/protocol";
import type { FrameWriter } from "./framing/writer.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dependencies for `createProgressEmitter`. */
export type ProgressEmitterDeps = {
  readonly write: FrameWriter;
  readonly logger: Logger;
  readonly now: () => number;
  /** Tick interval for the recurring heartbeat. Default 5000 ms. */
  readonly intervalMs?: number;
};

/** A lightweight helper that fires `quiz-progress` frames toward the SW. */
export type ProgressEmitter = {
  /**
   * Emit a single phase-boundary frame immediately.
   *
   * Absorbs `WriteError` — a failed heartbeat MUST NOT fail the request fiber.
   *
   * @param correlationId - The correlationId of the originating quiz-request.
   * @param phase - The phase the host is entering.
   */
  readonly emit: (correlationId: string | null, phase: QuizProgressPhase) => Promise<void>;

  /**
   * Start a recurring heartbeat for the given phase.
   *
   * Emits one frame immediately, then one every `intervalMs` until the
   * returned stop function is called. The stop function is idempotent and
   * MUST be called from the dispatcher's `try/finally` to prevent timer leaks.
   *
   * @param correlationId - The correlationId of the originating quiz-request.
   * @param phase - The phase to repeat while the interval is active.
   * @returns A stop function that clears the interval.
   */
  readonly startHeartbeat: (
    correlationId: string | null,
    phase: QuizProgressPhase,
  ) => () => void;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a `ProgressEmitter` that writes `quiz-progress` frames via the
 * supplied `FrameWriter`.
 *
 * All write failures are logged as warnings and swallowed — the emitter is a
 * best-effort side channel. No heartbeat failure should affect the request.
 *
 * @param deps - Injected write, logger, clock, and optional interval.
 */
export const createProgressEmitter = (deps: ProgressEmitterDeps): ProgressEmitter => {
  const { write, logger, now, intervalMs = 5_000 } = deps;

  const emit = async (
    correlationId: string | null,
    phase: QuizProgressPhase,
    startedAt: number,
  ): Promise<void> => {
    const frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-progress" as const,
      correlationId,
      payload: {
        phase,
        elapsedMs: Math.max(0, Math.round(now() - startedAt)),
      },
    };

    const result = await write(frame).unsafeRun();
    if (result.type === "Err") {
      logger.warn("quiz-progress write failed — heartbeat missed", {
        kind: result.error.kind,
        phase,
      });
    }
  };

  return {
    emit: (correlationId, phase): Promise<void> => {
      return emit(correlationId, phase, now());
    },

    startHeartbeat: (correlationId, phase): () => void => {
      const startedAt = now();
      // Fire immediately.
      void emit(correlationId, phase, startedAt);

      const handle = setInterval(() => {
        void emit(correlationId, phase, startedAt);
      }, intervalMs);

      return (): void => {
        clearInterval(handle);
      };
    },
  };
};
