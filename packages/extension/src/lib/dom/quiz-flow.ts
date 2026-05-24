import type { Frame } from "@lgtm-buzzer/protocol";
import type { PRIdentifier } from "@lgtm-buzzer/core";
import {
  DOM_EVENTS,
  QuizSubmitEventDetailSchema,
  QuizCancelEventDetailSchema,
  QuizRetryEventDetailSchema,
  emitDOMEvent,
  addDOMEventListener,
} from "./dom-events.js";

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
  } = deps;

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
   * Handles the SW response to a `quiz-request` frame.
   */
  const handleQuizRequestReply = (requestId: string, reply: Frame): void => {
    if (reply.kind === "quiz-response") {
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
    const frame: Frame = {
      v: 1,
      kind: "quiz-request",
      correlationId,
      payload: {
        pr: p.pr.kind === "github"
          ? { kind: "github", owner: p.pr.owner, repo: p.pr.repo, number: p.pr.number }
          : { kind: "ado", org: p.pr.org, project: p.pr.project, repo: p.pr.repo, pullRequestId: p.pr.pullRequestId },
        questionCount: 5,
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
      handleQuizRequestReply(requestId, makeSyntheticErrorFrame(correlationId, "invalid SW response"));
      return;
    }

    // Check if pending was already dropped (e.g. quiz-cancel arrived while awaiting).
    if (!pending.has(requestId)) {
      logger?.warn("[lgtm-buzzer:cs] quiz-request reply arrived after cancel — dropped", {
        requestId,
        kind: reply.kind,
      });
      return;
    }

    handleQuizRequestReply(requestId, reply);
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
  // Quiz-cancel handler (modal → CS)
  // ---------------------------------------------------------------------------

  const onQuizCancel = (detail: { requestId: string }): void => {
    dropPending(detail.requestId);
    // SW's 60s timeout cleans the host side (ADR-18 §Decision 5).
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
  const onQuizRetry = (detail: { requestId: string }): void => {
    const { requestId: oldRequestId } = detail;

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
    void sendQuizRequest(freshRequestId, freshPending, correlationId);
  };

  // ---------------------------------------------------------------------------
  // Navigation handlers (platform-agnostic via NavigationWatcher)
  // ---------------------------------------------------------------------------

  const onWillNavigate = (): void => {
    approveBypass = false;
    dropAll();
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
  };
};
