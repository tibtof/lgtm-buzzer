import type { Frame, QuizProgressFrame } from "@lgtm-buzzer/protocol";
import { RESAMPLE_FAILED_PREFIX } from "@lgtm-buzzer/protocol";
import type { PRIdentifier } from "@lgtm-buzzer/core";
import {
  DOM_EVENTS,
  QuizSubmitEventDetailSchema,
  QuizCancelEventDetailSchema,
  QuizRetryEventDetailSchema,
  emitDOMEvent,
  addDOMEventListener,
  type QuizRetryEventDetail,
} from "./dom-events.js";
import { QuizProgressPayloadSchema } from "@lgtm-buzzer/protocol";
import type { StatsStore } from "../stats/store.js";

// ---------------------------------------------------------------------------
// Error marker strings (exported for use in error-classes.ts — ADR-24)
// Consumers import these to avoid string-literal drift.
// ---------------------------------------------------------------------------

/**
 * Marker strings emitted by `createQuizFlowController` as error frame messages.
 *
 * `classifyError` in `error-classes.ts` imports these to recognise
 * transport failures without duplicating the string literals.
 */
export const QUIZ_FLOW_ERROR_MARKERS = {
  /** Emitted when the SW responds with a frame that fails CSResponseSchema. */
  invalidSwResponse: "invalid SW response",
  /** Prefix for unexpected frame kinds returned to quiz-request. */
  unexpectedReplyKindPrefix: "Unexpected reply kind:",
  /** Prefix emitted when sendFrame itself throws (should never happen per ADR-17). */
  sendFrameThrewPrefix: "sendFrame threw:",
  /** Prefix emitted when replayApprove throws. */
  replayFailedPrefix: "replay failed:",
  /** Emitted when quiz-retry fires but there is no active PR. */
  noActivePr: "no active PR",
} as const;
import { detectPRPage } from "./page-detection.js";
import type { InterceptedApproveEvent } from "./approve-intercept.js";
import type { NavigationWatcher } from "./navigation.js";
import { CSResponseSchema } from "../cs-protocol.js";

/**
 * A function that sends a `Frame` to the service worker and returns the
 * SW's reply. The returned promise always resolves — errors are encoded as
 * `ErrorFrame` values (per ADR-17).
 *
 * In production this wraps `chrome.runtime.sendMessage`. In tests it is a
 * plain fake.
 */
export type SendFrameFn = (frame: Frame) => Promise<Frame>;

/**
 * Logger interface used by `QuizFlowController`. Only `warn` is needed —
 * unexpected states are logged and dropped rather than surfaced as exceptions.
 */
export type QuizFlowLogger = {
  readonly warn: (msg: string, ctx?: Record<string, unknown>) => void;
};

/**
 * Factory function that wires a platform-specific approve interceptor.
 *
 * Receives the platform-agnostic deps surface and returns a dispose function.
 * The GitHub factory wraps `setupApproveInterceptor`; the ADO factory wraps
 * `setupAdoVoteInterceptor`. New platforms follow the same pattern.
 */
export type InterceptorFactory = (deps: {
  readonly doc: Document;
  readonly getCurrentPR: () => PRIdentifier | null;
  readonly shouldBypass: () => boolean;
  readonly onBlocked: (e: InterceptedApproveEvent) => void;
}) => () => void;

/** Dependencies injected into `createQuizFlowController`. */
export type QuizFlowDeps = {
  /** The document used for event dispatch and listener attachment. */
  readonly doc: Document;
  /**
   * Sends a `Frame` to the SW and resolves with the reply.
   * Must never reject — all failures encoded as `ErrorFrame`.
   */
  readonly sendFrame: SendFrameFn;
  /** Returns a new, unique correlation id for each quiz request frame. */
  readonly newCorrelationId: () => string;
  /** Returns a new, unique request id for each Approve-click intercept. */
  readonly newRequestId: () => string;
  /**
   * Platform-specific interceptor factory. Called once during `start()`.
   * GitHub: wraps `setupApproveInterceptor`. ADO: wraps `setupAdoVoteInterceptor`.
   */
  readonly setupInterceptor: InterceptorFactory;
  /**
   * Platform-specific SPA navigation watcher. Called once during `start()`.
   * GitHub: uses Turbo events. ADO: uses popstate + MutationObserver URL poll.
   */
  readonly navigationWatcher: NavigationWatcher;
  /** Optional structured logger for unexpected-state warnings. */
  readonly logger?: QuizFlowLogger;
  /**
   * Optional stats store. When provided, records generation duration and
   * quiz pass/fail outcomes for use by the modal stats UI.
   */
  readonly stats?: StatsStore;
  /**
   * The LLM adapter id used for this quiz flow. Passed to stats recording.
   * Defaults to `"claude-cli"` when absent — matches the host-side ADR-22
   * default so the stats footer reads "via claude-cli" for unconfigured users.
   */
  readonly adapterId?: string;
  /**
   * Async-resolved adapter id. Production reads chrome.storage at SW boot
   * (one async read) and passes the resulting promise here; while it is
   * pending, stats recording uses `adapterId` (or its default). When the
   * promise resolves, subsequent quiz events use the resolved id.
   *
   * Tests should prefer `adapterId` directly — this is plumbing for the
   * content-script wiring.
   */
  readonly adapterIdPromise?: Promise<string>;
};

/**
 * The public surface of the quiz flow controller.
 *
 * `start()` attaches all listeners and begins intercepting Approve submits.
 * `stop()` tears down all listeners and resets state.
 * `triggerManual()` opens a quiz on the current PR WITHOUT a preceding
 * Approve-click intercept. Used by the toolbar popup and the page-injected
 * "Quiz me" button. On pass, the modal closes with a success message — there
 * is no replay (you did not click Approve, so there is nothing to replay).
 * `onProgressFrame()` routes an incoming `quiz-progress` frame (received
 * from the SW via chrome.tabs.sendMessage) to the DOM event channel so the
 * modal can update its phase indicator. ADR-32.
 */
export type QuizFlowController = {
  /** Attaches all DOM and frame listeners. Safe to call only once. */
  readonly start: () => void;
  /** Removes all listeners and resets state. */
  readonly stop: () => void;
  /**
   * Starts a quiz for the current page's PR without intercepting an Approve.
   *
   * No-op when the current URL is not a PR page (returns `{ ok: false }`).
   * On `{ ok: true }`, the modal will open in `generating` state shortly.
   */
  readonly triggerManual: () => { readonly ok: boolean };
  /**
   * Routes an incoming `quiz-progress` frame to the modal via a
   * `lgtm-buzzer:quiz-progress` DOM event.
   *
   * Resolves the correlationId → requestId mapping maintained in the factory
   * closure, then emits the event with `{ requestId, phase, elapsedMs }`.
   *
   * ADR-32.
   */
  readonly onProgressFrame: (frame: QuizProgressFrame) => void;
};

/**
 * Represents a pending quiz action waiting for a quiz result.
 *
 * `blocked` is undefined for manual triggers (toolbar popup, injected button).
 * In that case the pass path skips the replay step — the user did not click
 * Approve, so there is nothing to replay.
 */
type PendingApprove = {
  readonly requestId: string;
  readonly blocked?: InterceptedApproveEvent;
  readonly pr: PRIdentifier;
};

/**
 * Builds a synthetic `ErrorFrame` for failures that happen before a real
 * frame reply arrives.
 */
const makeSyntheticErrorFrame = (
  correlationId: string | null,
  message: string,
): Frame => ({
  v: 1,
  kind: "error",
  correlationId,
  payload: { reason: "internal", message },
});

/**
 * Creates the quiz flow controller that orchestrates the full Approve →
 * quiz → result → re-submit/re-click flow.
 *
 * Lifecycle (per ADR-18 + ADR-21):
 * 1. `start()` detects PR, wires the injected `setupInterceptor` and
 *    `navigationWatcher`, attaches MutationObserver fallback (GitHub only via
 *    Turbo; ADO via navigation watcher), and quiz-event listeners.
 * 2. User clicks Approve → interceptor fires → quiz request frame sent.
 * 3. SW replies with `QuizResponseFrame` → `quiz-result { quiz-ready }` event.
 * 4. User submits answers → `quiz-submit` event → `QuizSubmitFrame` sent.
 * 5. SW replies with `QuizResultFrame` → on pass: bypass flag set,
 *    replay action (GitHub: `requestSubmit`; ADO: `element.click()`);
 *    on fail: `quiz-failed` event.
 * 6. Navigation `onWillNavigate` clears pending + bypass.
 * 7. `quiz-cancel` drops pending; SW times out naturally.
 *
 * Module-scoped `approveBypass` flag (ADR-18 §Decision 4): never on `window`.
 */
export const createQuizFlowController = (deps: QuizFlowDeps): QuizFlowController => {
  const {
    doc,
    sendFrame,
    newCorrelationId,
    newRequestId,
    setupInterceptor,
    navigationWatcher,
    logger,
    stats,
    adapterIdPromise,
  } = deps;

  // Mutable adapter id; starts at the synchronous default (or whatever the
  // caller passed) and updates when `adapterIdPromise` resolves. Closed over
  // by stats recording calls below.
  let adapterId = deps.adapterId ?? "claude-cli";
  if (adapterIdPromise !== undefined) {
    void adapterIdPromise.then((resolved) => {
      if (resolved !== "") adapterId = resolved;
    });
  }

  // ---------------------------------------------------------------------------
  // Module-scoped bypass flag (NOT on window — CS isolated world).
  // Reset on navigation to guard against stuck state.
  // ---------------------------------------------------------------------------
  let approveBypass = false;

  // Current PR identifier derived from `window.location.href`.
  let currentPR: PRIdentifier | null = null;

  // Pending Approve actions, keyed by requestId.
  const pending = new Map<string, PendingApprove>();

  // Dispose functions for all attached listeners.
  const disposers: Array<() => void> = [];

  // Per-request generation start times (set when quiz-request frame is sent).
  const generationStartTimes = new Map<string, number>();

  // ADR-32: correlationId → requestId mapping for routing quiz-progress frames.
  // Populated in sendQuizRequest / sendQuizResampleRequest.
  // Cleared in handleQuizRequestReply, onQuizCancel, onWillNavigate.
  const correlationToRequest = new Map<string, string>();

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const dropPending = (requestId: string): PendingApprove | undefined => {
    const p = pending.get(requestId);
    pending.delete(requestId);
    return p;
  };

  const dropAll = (): void => {
    pending.clear();
  };

  const emitResult = (requestId: string, outcome: unknown): void => {
    emitDOMEvent(doc, DOM_EVENTS.quizResult, { requestId, outcome });
  };

  /**
   * Handles the SW response to a `quiz-request` or `quiz-resample-request` frame.
   *
   * @param requestId - The request identifier for the pending approve.
   * @param reply - The frame received from the SW.
   * @param viaResample - When `true`, the reply came from a `quiz-resample-request`.
   *   In that case, `stats.recordGeneration` is NOT called because no LLM invocation
   *   occurred — recording a near-zero resample duration would skew the rolling median.
   *   ADR-30 §Stats interaction.
   */
  const handleQuizRequestReply = (
    requestId: string,
    reply: Frame,
    viaResample = false,
    correlationId?: string,
  ): void => {
    // ADR-32: clean up the correlationId → requestId mapping on terminal reply.
    if (correlationId !== undefined) {
      correlationToRequest.delete(correlationId);
    }

    if (reply.kind === "quiz-response") {
      // Record generation duration for stats — only for real LLM calls (not resamples).
      if (!viaResample) {
        const startMs = generationStartTimes.get(requestId);
        generationStartTimes.delete(requestId);
        if (stats !== undefined && startMs !== undefined) {
          const durationMs = Date.now() - startMs;
          void stats.recordGeneration(adapterId, durationMs);
        }
      } else {
        // Clean up the start-time entry even for resamples (it was set for timing).
        generationStartTimes.delete(requestId);
      }

      emitResult(requestId, { kind: "quiz-ready", quiz: reply.payload.quiz });
      return;
    }

    if (reply.kind === "error") {
      dropPending(requestId);
      emitResult(requestId, {
        kind: "error",
        reason: reply.payload.reason,
        message: reply.payload.message,
      });
      return;
    }

    // Unexpected frame kind.
    logger?.warn("[lgtm-buzzer:cs] unexpected reply to quiz-request", {
      kind: reply.kind,
      requestId,
    });
    dropPending(requestId);
    emitResult(requestId, {
      kind: "error",
      reason: "internal",
      message: `Unexpected reply kind: ${reply.kind}`,
    });
  };

  /**
   * Replays the intercepted approve action after a quiz pass.
   *
   * - GitHub: `form.requestSubmit(submitter)` — preserves the original submit.
   * - ADO: `element.click()` — triggers ADO's own click handler after the bypass
   *   flag lets the re-click pass the capture-phase listener.
   */
  const replayApprove = (requestId: string, p: PendingApprove): void => {
    if (p.blocked === undefined) {
      // Manual-trigger path — there is no Approve click to replay. Just close
      // the modal via the pass result already emitted.
      return;
    }
    approveBypass = true;
    try {
      if (p.blocked.kind === "github") {
        p.blocked.form.requestSubmit(p.blocked.submitter ?? undefined);
      } else {
        // ADO path: synchronous click; capture listener sees bypass, resets
        // flag, returns without preventDefault.
        p.blocked.element.click();
      }
    } catch (err) {
      approveBypass = false;
      emitResult(requestId, {
        kind: "error",
        reason: "internal",
        message: `replay failed: ${String(err)}`,
      });
    }
  };

  /**
   * Handles the SW response to a `quiz-submit` frame.
   */
  const handleQuizSubmitReply = (requestId: string, reply: Frame): void => {
    const p = dropPending(requestId);

    if (reply.kind === "quiz-result") {
      const result = reply.payload;

      // Record quiz outcome for stats.
      if (stats !== undefined) {
        void stats.recordQuiz(adapterId, result.passed, result.correct, result.total);
      }

      if (result.passed) {
        emitResult(requestId, { kind: "quiz-passed", result });
        if (p !== undefined) {
          replayApprove(requestId, p);
        }
      } else {
        emitResult(requestId, { kind: "quiz-failed", result });
      }
      return;
    }

    if (reply.kind === "error") {
      emitResult(requestId, {
        kind: "error",
        reason: reply.payload.reason,
        message: reply.payload.message,
      });
      return;
    }

    // Unexpected frame kind.
    logger?.warn("[lgtm-buzzer:cs] unexpected reply to quiz-submit", {
      kind: reply.kind,
      requestId,
    });
    emitResult(requestId, {
      kind: "error",
      reason: "internal",
      message: `Unexpected reply kind: ${reply.kind}`,
    });
  };

  /**
   * Sends a quiz-request Frame to the SW and routes the reply.
   */
  const sendQuizRequest = async (
    requestId: string,
    p: PendingApprove,
    correlationId: string,
  ): Promise<void> => {
    // Record the generation start time for stats.
    generationStartTimes.set(requestId, Date.now());

    // ADR-32: store correlationId → requestId so that onProgressFrame can
    // route heartbeat frames to the correct modal.
    correlationToRequest.set(correlationId, requestId);

    const frame: Frame = {
      v: 1,
      kind: "quiz-request",
      correlationId,
      payload: {
        pr: p.pr.kind === "github"
          ? { kind: "github", owner: p.pr.owner, repo: p.pr.repo, number: p.pr.number }
          : { kind: "ado", org: p.pr.org, project: p.pr.project, repo: p.pr.repo, pullRequestId: p.pr.pullRequestId },
        questionCount: 5,
        // ADR-32: questionPoolSize is NO LONGER hardcoded here. The router
        // merges the stored preference (from options storage) into the payload
        // before forwarding to the host. quiz-flow sends only questionCount.
        // See packages/extension/src/lib/router.ts for the merge logic.
      },
    };

    let reply: Frame;
    try {
      reply = await sendFrame(frame);
    } catch (err) {
      // sendFrame must never reject per ADR-17, but defend against it anyway.
      reply = makeSyntheticErrorFrame(correlationId, `sendFrame threw: ${String(err)}`);
    }

    // If the SW replied with sw-error, wrap as synthetic ErrorFrame.
    const csResponse = CSResponseSchema.safeParse({ kind: "frame", frame: reply });
    if (!csResponse.success) {
      handleQuizRequestReply(requestId, makeSyntheticErrorFrame(correlationId, "invalid SW response"), false, correlationId);
      return;
    }

    // Check if pending was already dropped (e.g. quiz-cancel arrived while awaiting).
    if (!pending.has(requestId)) {
      logger?.warn("[lgtm-buzzer:cs] quiz-request reply arrived after cancel — dropped", {
        requestId,
        kind: reply.kind,
      });
      correlationToRequest.delete(correlationId);
      return;
    }

    handleQuizRequestReply(requestId, reply, false, correlationId);
  };

  // ---------------------------------------------------------------------------
  // Approve intercept → onBlocked
  // ---------------------------------------------------------------------------

  const onBlocked = (blocked: InterceptedApproveEvent): void => {
    const requestId = newRequestId();
    const correlationId = newCorrelationId();

    const p: PendingApprove = {
      requestId,
      blocked,
      pr: blocked.pr,
    };
    pending.set(requestId, p);

    // Dispatch quiz-request DOM event for the modal.
    emitDOMEvent(doc, DOM_EVENTS.quizRequest, {
      requestId,
      correlationId,
      pr: blocked.pr,
    });

    // Kick off the async frame round-trip.
    void sendQuizRequest(requestId, p, correlationId);
  };

  // ---------------------------------------------------------------------------
  // Quiz-submit handler (modal → CS)
  // ---------------------------------------------------------------------------

  const onQuizSubmit = (detail: {
    requestId: string;
    quizId: string;
    answers: ReadonlyArray<{ questionId: string; chosenChoiceId: string }>;
  }): void => {
    const { requestId, quizId, answers } = detail;

    if (!pending.has(requestId)) {
      logger?.warn("[lgtm-buzzer:cs] quiz-submit for unknown requestId — dropped", {
        requestId,
      });
      return;
    }

    const correlationId = newCorrelationId();
    const frame: Frame = {
      v: 1,
      kind: "quiz-submit",
      correlationId,
      payload: { quizId, answers: [...answers] },
    };

    void (async (): Promise<void> => {
      let reply: Frame;
      try {
        reply = await sendFrame(frame);
      } catch (err) {
        reply = makeSyntheticErrorFrame(correlationId, `sendFrame threw: ${String(err)}`);
      }
      handleQuizSubmitReply(requestId, reply);
    })();
  };

  // ---------------------------------------------------------------------------
  // quiz-resample helper (ADR-30)
  // ---------------------------------------------------------------------------

  /**
   * Sends a `quiz-resample-request` frame to the SW and routes the reply.
   *
   * If the host rejects the frame with `unknown-message` (old host) or returns
   * an error message starting with `RESAMPLE_FAILED_PREFIX` (pool evicted /
   * unknown quiz), falls back to a fresh `sendQuizRequest`. Any other error is
   * propagated to the modal.
   *
   * `stats.recordGeneration` is NOT called for resample replies (ADR-30 §7).
   *
   * @param requestId - The request ID for the current pending approve.
   * @param p - The pending approve state.
   * @param correlationId - Fresh correlation ID for the resample frame.
   * @param failedQuizId - The quizId from the failed/errored quiz-response.
   */
  const sendQuizResampleRequest = async (
    requestId: string,
    p: PendingApprove,
    correlationId: string,
    failedQuizId: string,
  ): Promise<void> => {
    // Record a start time (for potential timing diagnostics); NOT counted in stats.
    generationStartTimes.set(requestId, Date.now());

    // ADR-32: store correlationId → requestId for heartbeat routing.
    correlationToRequest.set(correlationId, requestId);

    const frame: Frame = {
      v: 1,
      kind: "quiz-resample-request",
      correlationId,
      payload: { quizId: failedQuizId, questionCount: 5 },
    };

    let reply: Frame;
    try {
      reply = await sendFrame(frame);
    } catch (err) {
      reply = makeSyntheticErrorFrame(correlationId, `sendFrame threw: ${String(err)}`);
    }

    // Validate SW reply shape.
    const csResponse = CSResponseSchema.safeParse({ kind: "frame", frame: reply });
    if (!csResponse.success) {
      handleQuizRequestReply(
        requestId,
        makeSyntheticErrorFrame(correlationId, "invalid SW response"),
        true,
        correlationId,
      );
      return;
    }

    // Check if pending was dropped while awaiting.
    if (!pending.has(requestId)) {
      logger?.warn("[lgtm-buzzer:cs] quiz-resample-request reply arrived after cancel — dropped", {
        requestId,
        kind: reply.kind,
      });
      correlationToRequest.delete(correlationId);
      return;
    }

    // Happy path: got a quiz-response from the resample.
    if (reply.kind === "quiz-response") {
      handleQuizRequestReply(requestId, reply, true /* viaResample — do not count in stats */, correlationId);
      return;
    }

    // Fallback detection: old host returns unknown-message; pool-evicted / unknown-quiz
    // returns internal error with RESAMPLE_FAILED_PREFIX.
    if (reply.kind === "error") {
      const isUnknownMessage = reply.payload.reason === "unknown-message";
      const isResampleFailed =
        reply.payload.reason === "internal" &&
        reply.payload.message.startsWith(RESAMPLE_FAILED_PREFIX);

      if (isUnknownMessage || isResampleFailed) {
        // Fallback: send a fresh quiz-request. The user sees one generating spinner.
        logger?.warn("[lgtm-buzzer:cs] quiz-resample-request fell back to fresh quiz-request", {
          reason: reply.payload.reason,
          message: reply.payload.message,
        });
        correlationToRequest.delete(correlationId);
        const freshCorrelationId = newCorrelationId();
        await sendQuizRequest(requestId, p, freshCorrelationId);
        return;
      }

      // Any other error — propagate to the modal as usual.
      handleQuizRequestReply(requestId, reply, true, correlationId);
      return;
    }

    // Unexpected frame kind.
    handleQuizRequestReply(
      requestId,
      makeSyntheticErrorFrame(correlationId, `Unexpected reply kind: ${reply.kind}`),
      true,
      correlationId,
    );
  };

  // ---------------------------------------------------------------------------
  // Quiz-cancel handler (modal → CS)
  // ---------------------------------------------------------------------------

  /**
   * Send a one-way `quiz-cancel-request` to the SW so the host can abort the
   * in-flight fiber (ADR-33).
   *
   * Fire-and-forget: no reply is awaited. If the sendMessage call rejects, the
   * error is swallowed — the modal is already closed and the worst case is one
   * wasted LLM call on the host.
   */
  const sendCancelToSW = (cancelCorrelationId: string): void => {
    const cancelFrame: Frame = {
      v: 1,
      kind: "quiz-cancel-request",
      correlationId: cancelCorrelationId,
      payload: { correlationId: cancelCorrelationId },
    };
    try {
      void sendFrame(cancelFrame);
    } catch {
      // Swallow — cancel is best-effort.
    }
  };

  const onQuizCancel = (detail: { requestId: string }): void => {
    // ADR-33: find the in-flight correlationId for this requestId BEFORE
    // draining the map, so we can forward the cancel to the host.
    let inFlightCid: string | undefined;
    for (const [cid, rid] of correlationToRequest) {
      if (rid === detail.requestId) {
        inFlightCid = cid;
        break;
      }
    }

    // Drop local pending state (existing behaviour).
    dropPending(detail.requestId);
    generationStartTimes.delete(detail.requestId);
    // ADR-32: drain any correlationId → requestId entries for this requestId.
    for (const [corrId, reqId] of correlationToRequest) {
      if (reqId === detail.requestId) {
        correlationToRequest.delete(corrId);
      }
    }

    // ADR-33: signal the host to abort the running fiber.
    if (inFlightCid !== undefined) {
      sendCancelToSW(inFlightCid);
    }
    // SW's 180s timeout also cleans the host side for backward compat
    // (ADR-18 §Decision 5 / ADR-30).
  };

  // ---------------------------------------------------------------------------
  // Quiz-retry handler (modal → CS) — ADR-24
  // ---------------------------------------------------------------------------

  /**
   * Handles the quiz-retry DOM event emitted by the modal when the user
   * clicks "Retry" (in error state) or "Try Again" (in failed state).
   *
   * Looks up the existing pending Approve for `requestId`. If still alive,
   * re-uses its `blocked` event and `pr`. If already dropped (the error path
   * calls `dropPending`), falls back to `currentPR` to synthesise a fresh
   * `PendingApprove` without a new approve interception.
   *
   * A new `requestId` and `correlationId` are allocated in all cases so the
   * modal and correlation map stay consistent.
   */
  const onQuizRetry = (detail: QuizRetryEventDetail): void => {
    const { requestId: oldRequestId, quizId: failedQuizId } = detail;

    // The old pending entry is usually already dropped by the error handler.
    // If somehow it is still alive, preserve the blocked event.
    const oldPending = dropPending(oldRequestId);

    // Determine the PR to query. Retry is a re-fetch of the quiz only —
    // the user is already past the Approve click.
    let pr: PRIdentifier | null = null;
    const blocked: PendingApprove["blocked"] | undefined = oldPending?.blocked;

    if (oldPending !== undefined) {
      pr = oldPending.pr;
    } else if (currentPR !== null) {
      pr = currentPR;
      // No `blocked` event — a retry never re-replays the approve action
      // directly. The fresh quiz-passed path handles replay normally.
    }

    if (pr === null) {
      logger?.warn("[lgtm-buzzer:cs] quiz-retry fired but no active PR — cannot retry", {
        oldRequestId,
      });
      emitDOMEvent(doc, DOM_EVENTS.quizResult, {
        requestId: oldRequestId,
        outcome: {
          kind: "error",
          reason: "internal",
          message: "no active PR",
        },
      });
      return;
    }

    // Allocate fresh identifiers.
    const freshRequestId = newRequestId();
    const correlationId = newCorrelationId();

    const freshPending: PendingApprove = {
      requestId: freshRequestId,
      // If we had an old blocked event, carry it forward so pass → replay works.
      // Otherwise leave undefined — replay is skipped (same as manual trigger).
      ...(blocked !== undefined ? { blocked } : {}),
      pr,
    };
    pending.set(freshRequestId, freshPending);

    // Emit the quiz-request DOM event so the modal transitions to generating.
    emitDOMEvent(doc, DOM_EVENTS.quizRequest, {
      requestId: freshRequestId,
      correlationId,
      pr,
    });

    // Kick off the async frame round-trip.
    // ADR-30: if we have the quizId of the failed quiz, try resample first.
    if (failedQuizId !== undefined) {
      void sendQuizResampleRequest(freshRequestId, freshPending, correlationId, failedQuizId);
    } else {
      void sendQuizRequest(freshRequestId, freshPending, correlationId);
    }
  };

  // ---------------------------------------------------------------------------
  // Navigation handlers (platform-agnostic via NavigationWatcher)
  // ---------------------------------------------------------------------------

  const onWillNavigate = (): void => {
    approveBypass = false;
    dropAll();
    // ADR-32: clear all heartbeat correlation mappings on navigation.
    correlationToRequest.clear();
  };

  const onDidNavigate = (): void => {
    const result = detectPRPage(doc.defaultView?.location.href ?? "");
    currentPR = result.ok ? result.pr : null;
  };

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    start: (): void => {
      // Resolve initial PR state.
      const initialResult = detectPRPage(doc.defaultView?.location.href ?? "");
      currentPR = initialResult.ok ? initialResult.pr : null;

      // Capture-phase platform Approve interceptor (injected strategy).
      const disposeInterceptor = setupInterceptor({
        doc,
        getCurrentPR: () => currentPR,
        shouldBypass: () => {
          if (approveBypass) {
            // Reset immediately so subsequent clicks are intercepted.
            approveBypass = false;
            return true;
          }
          return false;
        },
        onBlocked,
      });
      disposers.push(disposeInterceptor);

      // Platform-specific SPA navigation watcher (injected strategy).
      const disposeNavigation = navigationWatcher.start({ onWillNavigate, onDidNavigate });
      disposers.push(disposeNavigation);

      // Modal → CS event listeners.
      const disposeSubmit = addDOMEventListener(
        doc,
        DOM_EVENTS.quizSubmit,
        QuizSubmitEventDetailSchema,
        onQuizSubmit,
        logger,
      );
      const disposeCancel = addDOMEventListener(
        doc,
        DOM_EVENTS.quizCancel,
        QuizCancelEventDetailSchema,
        onQuizCancel,
        logger,
      );
      const disposeRetry = addDOMEventListener(
        doc,
        DOM_EVENTS.quizRetry,
        QuizRetryEventDetailSchema,
        onQuizRetry,
        logger,
      );
      disposers.push(disposeSubmit, disposeCancel, disposeRetry);
    },

    stop: (): void => {
      approveBypass = false;
      dropAll();
      generationStartTimes.clear();
      correlationToRequest.clear();
      for (const dispose of disposers) {
        dispose();
      }
      disposers.length = 0;
    },

    triggerManual: (): { readonly ok: boolean } => {
      // Refresh from the current URL — currentPR may be stale right after a
      // navigation if the popup fires before onDidNavigate.
      const result = detectPRPage(doc.defaultView?.location.href ?? "");
      if (!result.ok) {
        logger?.warn("[lgtm-buzzer:cs] triggerManual called outside a PR page", {});
        return { ok: false };
      }
      currentPR = result.pr;

      const requestId = newRequestId();
      const correlationId = newCorrelationId();
      const p: PendingApprove = {
        requestId,
        // No `blocked` — manual trigger, replay is skipped on pass.
        pr: result.pr,
      };
      pending.set(requestId, p);

      emitDOMEvent(doc, DOM_EVENTS.quizRequest, {
        requestId,
        correlationId,
        pr: result.pr,
      });

      void sendQuizRequest(requestId, p, correlationId);
      return { ok: true };
    },

    onProgressFrame: (frame: QuizProgressFrame): void => {
      const correlationId = frame.correlationId;
      if (correlationId === null) return;

      const requestId = correlationToRequest.get(correlationId);
      if (requestId === undefined) {
        logger?.warn("[lgtm-buzzer:cs] quiz-progress with no active request — dropped", {
          correlationId,
        });
        return;
      }

      // Validate the payload before forwarding to DOM.
      const parsed = QuizProgressPayloadSchema.safeParse(frame.payload);
      if (!parsed.success) {
        logger?.warn("[lgtm-buzzer:cs] quiz-progress payload failed validation — dropped", {
          correlationId,
        });
        return;
      }

      // ADR-32: emit the progress DOM event so the modal can update its phase indicator.
      emitDOMEvent(doc, DOM_EVENTS.quizProgress, {
        requestId,
        phase: parsed.data.phase,
        elapsedMs: parsed.data.elapsedMs,
      });
    },
  };
};
