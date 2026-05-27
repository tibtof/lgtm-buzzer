import type { QuizProgressFrame } from "@lgtm-buzzer/protocol";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A callback that receives a `quiz-progress` frame for the subscribed
 * correlationId. Called synchronously from the port's `onMessage` listener.
 */
export type ProgressSubscriber = (frame: QuizProgressFrame) => void;

/**
 * A parallel-to-CorrelationMap registry of progress subscribers.
 *
 * Separate from `CorrelationMap` so that receiving a `quiz-progress` frame
 * does NOT resolve the pending-reply Promise. The quiz-request stays pending
 * until the terminal `quiz-response` or `error` frame arrives.
 *
 * ADR-32.
 */
export type ProgressMap = {
  /**
   * Register a subscriber for the given `correlationId`.
   *
   * Replaces any prior subscriber for the same id — callers must not
   * re-use correlation ids while a subscription is live.
   */
  readonly subscribe: (correlationId: string, subscriber: ProgressSubscriber) => void;

  /** Remove the subscriber for the given `correlationId`. No-op if absent. */
  readonly unsubscribe: (correlationId: string) => void;

  /**
   * Dispatch a `quiz-progress` frame to its subscriber, if any.
   *
   * @returns `true` when a subscriber was found and called; `false` otherwise.
   */
  readonly dispatch: (frame: QuizProgressFrame) => boolean;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a new, empty `ProgressMap`.
 *
 * @returns A `ProgressMap` backed by a plain `Map`.
 */
export const createProgressMap = (): ProgressMap => {
  const store = new Map<string, ProgressSubscriber>();

  return {
    subscribe: (correlationId, subscriber): void => {
      store.set(correlationId, subscriber);
    },

    unsubscribe: (correlationId): void => {
      store.delete(correlationId);
    },

    dispatch: (frame): boolean => {
      const correlationId = frame.correlationId;
      if (correlationId === null) return false;
      const subscriber = store.get(correlationId);
      if (subscriber === undefined) return false;
      subscriber(frame);
      return true;
    },
  };
};
