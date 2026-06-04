import { FrameSchema, type Frame } from "@lgtm-buzzer/protocol";
import type { CorrelationMap } from "./correlation.js";
import type { ProgressMap } from "./progress-map.js";

// ---------------------------------------------------------------------------
// Error marker strings (exported for use in error-classes.ts — ADR-24)
// Consumers import these to avoid string-literal drift.
// ---------------------------------------------------------------------------

/**
 * Marker strings emitted by `createPortClient` as error frame messages.
 *
 * `classifyError` in `error-classes.ts` imports these to recognise
 * transport failures without duplicating the string literals.
 */
export const PORT_ERROR_MARKERS = {
  /** Emitted when the native-messaging port disconnects unexpectedly. */
  hostDisconnected: "host disconnected",
  /** Emitted when the request timer fires before a reply arrives. */
  hostNoResponse: "host did not respond",
  /** Prefix emitted when `connect()` throws synchronously. */
  connectFailed: "connect failed:",
} as const;

/**
 * Minimal interface over `chrome.runtime.Port` that is injectable in tests.
 *
 * Tests provide a plain fake that records calls; production code passes
 * `chrome.runtime.connectNative(id)` directly via the `ConnectFn`.
 */
export type HostPort = {
  readonly postMessage: (msg: unknown) => void;
  readonly onMessage: {
    readonly addListener: (cb: (msg: unknown) => void) => void;
  };
  readonly onDisconnect: {
    readonly addListener: (cb: () => void) => void;
  };
  readonly disconnect: () => void;
};

/** Factory that returns a connected `HostPort`. Wraps `chrome.runtime.connectNative`. */
export type ConnectFn = () => HostPort;

/**
 * Logger interface required by `PortClientDeps`.
 * Only `warn` is needed — the port client never surfaces debug info.
 */
export type PortLogger = {
  readonly warn: (msg: string, ctx?: Record<string, unknown>) => void;
};

/** Dependencies for `createPortClient`. */
export type PortClientDeps = {
  /** Factory that produces a connected native-messaging port. */
  readonly connect: ConnectFn;
  /** Shared in-memory correlation map. */
  readonly map: CorrelationMap;
  /** Clock for TTL calculations — injected to keep tests deterministic. */
  readonly now: () => number;
  /** Request timeout in milliseconds. Defaults to 60 000. */
  readonly timeoutMs: number;
  /** Optional structured logger. */
  readonly logger?: PortLogger;
  /**
   * Optional progress-frame registry (ADR-32).
   *
   * When provided, incoming `quiz-progress` frames are dispatched here instead
   * of being resolved as terminal replies. The pending correlation map entry
   * is kept open; its timeout is re-armed on each heartbeat to give the host
   * additional headroom beyond the static budget.
   *
   * When absent (e.g. in legacy tests), `quiz-progress` frames are dropped
   * with a warning — the pending request stays alive until its original timer
   * fires.
   */
  readonly progressMap?: ProgressMap;
};

/**
 * A connected client over the native-messaging port.
 *
 * All host failures (disconnect, timeout, malformed reply) are encoded as
 * `ErrorFrame` values. `sendFrame` NEVER rejects.
 */
export type PortClient = {
  /**
   * Forwards `frame` to the native host and resolves with the reply.
   *
   * Lazily connects on the first call. Subsequent calls reuse the same port.
   * After a disconnect the next `sendFrame` reconnects automatically.
   *
   * @param frame - The frame to send. Must already be validated.
   * @param tabId - Optional tab identifier stored in the correlation map for
   *   logging purposes.
   * @returns A promise that always resolves (never rejects) with a `Frame`.
   */
  readonly sendFrame: (frame: Frame, tabId?: number) => Promise<Frame>;
  /**
   * Sends `frame` to the native host without registering a correlation entry
   * and without awaiting a reply. Best-effort: transport errors are swallowed.
   *
   * Introduced by ADR-33 for `quiz-cancel-request`, which is one-way (the
   * host MUST NOT reply).
   *
   * @param frame - The frame to send. Must already be validated.
   */
  readonly sendFrameOneWay: (frame: Frame) => void;
  /** Returns `true` if a port is currently connected. */
  readonly isConnected: () => boolean;
};

const makeErrorFrame = (
  correlationId: string | null,
  message: string,
): Frame => ({
  v: 1,
  kind: "error",
  correlationId,
  payload: { reason: "internal", message },
});

/**
 * Creates a `PortClient` that lazily connects to the native host, forwards
 * frames, and routes replies via the correlation map.
 */
export const createPortClient = (deps: PortClientDeps): PortClient => {
  const { connect, map, timeoutMs, logger, progressMap } = deps;

  let port: HostPort | null = null;
  let listenersAttached = false;

  const attachListeners = (p: HostPort): void => {
    if (listenersAttached) return;
    listenersAttached = true;

    p.onMessage.addListener((msg: unknown) => {
      const parsed = FrameSchema.safeParse(msg);
      if (!parsed.success) {
        logger?.warn("[lgtm-buzzer:sw] invalid frame from host — dropped", {
          issues: parsed.error.issues,
        });
        return;
      }
      const reply = parsed.data;
      const correlationId = reply.correlationId;

      // ADR-32: quiz-progress is a one-way heartbeat. Route it to the
      // ProgressMap and re-arm the pending request's timeout; do NOT resolve
      // the pending Promise.
      if (reply.kind === "quiz-progress") {
        const dispatched = progressMap?.dispatch(reply) ?? false;
        if (!dispatched) {
          logger?.warn(
            "[lgtm-buzzer:sw] quiz-progress with no subscriber — dropped",
            { correlationId: correlationId ?? "(null)" },
          );
        }
        // Re-arm the pending request's timeout so each heartbeat extends the
        // 180s budget from now. A hung host (no heartbeat for 180s) still times out.
        if (correlationId !== null) {
          const pending = map.peekById(correlationId);
          if (pending !== undefined) {
            clearTimeout(pending.timer);
            pending.timer = setTimeout(() => {
              const p = map.takeById(correlationId);
              if (p !== undefined) {
                p.resolve(makeErrorFrame(correlationId, "host did not respond"));
              }
            }, timeoutMs);
          }
        }
        return; // do NOT resolve the pending entry
      }

      if (correlationId === null) {
        logger?.warn(
          "[lgtm-buzzer:sw] host reply has null correlationId — dropped",
          { kind: reply.kind },
        );
        return;
      }
      const pending = map.takeById(correlationId);
      if (pending === undefined) {
        logger?.warn(
          "[lgtm-buzzer:sw] unknown correlationId in host reply — dropped",
          { correlationId, kind: reply.kind },
        );
        return;
      }
      clearTimeout(pending.timer);
      pending.resolve(reply);
    });

    p.onDisconnect.addListener(() => {
      logger?.warn("[lgtm-buzzer:sw] host disconnected");
      port = null;
      listenersAttached = false;
      map.drainAll((correlationId) =>
        makeErrorFrame(correlationId, "host disconnected"),
      );
    });
  };

  const ensureConnected = (): HostPort => {
    if (port !== null) return port;
    port = connect();
    attachListeners(port);
    return port;
  };

  return {
    isConnected: () => port !== null,

    sendFrameOneWay: (frame: Frame): void => {
      // ADR-33: fire-and-forget. No correlation map entry, no timer, no Promise.
      // Transport errors are swallowed — cancel is best-effort.
      try {
        const p = ensureConnected();
        p.postMessage(frame);
      } catch {
        // Port connect failed or postMessage threw — log nothing here to avoid
        // triggering the same error path as sendFrame; the caller already closed
        // the modal and the worst case is one wasted LLM call on the host.
      }
    },

    sendFrame: (frame: Frame, tabId?: number): Promise<Frame> => {
      return new Promise<Frame>((resolve) => {
        const correlationId = frame.correlationId;

        let p: HostPort;
        try {
          p = ensureConnected();
        } catch (err) {
          resolve(
            makeErrorFrame(
              correlationId,
              `connect failed: ${String(err)}`,
            ),
          );
          return;
        }

        const timer = setTimeout(() => {
          const pending = map.takeById(correlationId ?? "");
          if (pending !== undefined) {
            resolve(makeErrorFrame(correlationId, "host did not respond"));
          }
        }, timeoutMs);

        if (correlationId !== null) {
          map.add({ correlationId, tabId, resolve, timer });
        }

        try {
          p.postMessage(frame);
        } catch {
          // postMessage threw synchronously (e.g., port already closed).
          // Drain the map as if a disconnect occurred.
          clearTimeout(timer);
          if (correlationId !== null) {
            map.takeById(correlationId);
          }
          port = null;
          listenersAttached = false;
          map.drainAll((cid) => makeErrorFrame(cid, "host disconnected"));
          resolve(makeErrorFrame(correlationId, "host disconnected"));
        }
      });
    },
  };
};
