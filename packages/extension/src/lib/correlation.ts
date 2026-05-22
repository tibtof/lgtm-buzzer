import type { Frame } from "@lgtm-buzzer/protocol";

/**
 * Represents a pending request awaiting a reply from the native host.
 *
 * The `timer` field holds the timeout handle so it can be cleared on
 * successful resolution or drain.
 */
export type PendingRequest = {
  readonly correlationId: string;
  readonly tabId: number | undefined;
  readonly resolve: (frame: Frame) => void;
  readonly timer: ReturnType<typeof setTimeout>;
};

/**
 * An in-memory map of pending native-messaging requests, keyed by correlationId.
 *
 * All operations are synchronous. No persistence — SW restart drops the map;
 * callers must treat pending requests as failed after restart.
 */
export type CorrelationMap = {
  /** Returns the current number of pending requests. */
  readonly size: () => number;
  /**
   * Registers a pending request. Throws if a request with the same
   * correlationId is already present (invariant violation).
   */
  readonly add: (pending: PendingRequest) => void;
  /**
   * Removes and returns the pending request for the given correlationId,
   * or returns `undefined` if not found.
   */
  readonly takeById: (correlationId: string) => PendingRequest | undefined;
  /**
   * Drains all pending requests by resolving each one with a synthesised
   * error frame produced by `reason(correlationId)`. Clears all timers.
   */
  readonly drainAll: (reason: (correlationId: string) => Frame) => void;
};

/**
 * Creates a new, empty `CorrelationMap`.
 *
 * @returns A `CorrelationMap` backed by a plain `Map`.
 */
export const createCorrelationMap = (): CorrelationMap => {
  const store = new Map<string, PendingRequest>();

  return {
    size: () => store.size,

    add: (pending: PendingRequest): void => {
      if (store.has(pending.correlationId)) {
        throw new Error(
          `Invariant violation: duplicate correlationId "${pending.correlationId}"`,
        );
      }
      store.set(pending.correlationId, pending);
    },

    takeById: (correlationId: string): PendingRequest | undefined => {
      const pending = store.get(correlationId);
      if (pending === undefined) return undefined;
      store.delete(correlationId);
      return pending;
    },

    drainAll: (reason: (correlationId: string) => Frame): void => {
      for (const [correlationId, pending] of store) {
        clearTimeout(pending.timer);
        pending.resolve(reason(correlationId));
      }
      store.clear();
    },
  };
};
