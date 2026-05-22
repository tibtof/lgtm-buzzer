import type { Frame } from "@lgtm-buzzer/protocol";
import type { PRIdentifier } from "@lgtm-buzzer/core";
import {
  DOM_EVENTS,
  QuizSubmitEventDetailSchema,
  QuizCancelEventDetailSchema,
  emitDOMEvent,
  addDOMEventListener,
} from "./dom-events.js";
import { detectPRPage } from "./page-detection.js";
import { setupApproveInterceptor } from "./approve-intercept.js";
import type { ApproveBlockedEvent } from "./approve-intercept.js";
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
  /** Optional structured logger for unexpected-state warnings. */
  readonly logger?: QuizFlowLogger;
};

/**
 * The public surface of the quiz flow controller.
 *
 * `start()` attaches all listeners and begins intercepting Approve submits.
 * `stop()` tears down all listeners and resets state.
 */
export type QuizFlowController = {
  /** Attaches all DOM and frame listeners. Safe to call only once. */
  readonly start: () => void;
  /** Removes all listeners and resets state. */
  readonly stop: () => void;
};

/** Represents a pending Approve submit waiting for a quiz result. */
type PendingApprove = {
  readonly requestId: string;
  readonly form: HTMLFormElement;
  readonly submitter: HTMLElement | null;
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
 * quiz → result → re-submit flow.
 *
 * Lifecycle (per ADR-18 §Sequence):
 * 1. `start()` detects PR, attaches capture-phase submit listener, Turbo
 *    event listeners, MutationObserver fallback, and quiz-event listeners.
 * 2. User clicks Approve → interceptor fires → quiz request frame sent.
 * 3. SW replies with `QuizResponseFrame` → `quiz-result { quiz-ready }` event.
 * 4. User submits answers → `quiz-submit` event → `QuizSubmitFrame` sent.
 * 5. SW replies with `QuizResultFrame` → on pass: bypass flag set,
 *    `requestSubmit` called; on fail: `quiz-failed` event.
 * 6. `turbo:before-visit` clears pending + bypass.
 * 7. `quiz-cancel` drops pending; SW times out naturally.
 *
 * Module-scoped `approveBypass` flag (ADR-18 §Decision 4): never on `window`.
 */
export const createQuizFlowController = (deps: QuizFlowDeps): QuizFlowController => {
  const { doc, sendFrame, newCorrelationId, newRequestId, logger } = deps;

  // ---------------------------------------------------------------------------
  // Module-scoped bypass flag (NOT on window — CS isolated world).
  // Reset on turbo:before-visit to guard against stuck state.
  // ---------------------------------------------------------------------------
  let approveBypass = false;

  // Current PR identifier derived from `window.location.href`.
  let currentPR: PRIdentifier | null = null;

  // Pending Approve submits, keyed by requestId.
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
   * Handles the SW response to a `quiz-submit` frame.
   */
  const handleQuizSubmitReply = (requestId: string, reply: Frame): void => {
    const p = dropPending(requestId);

    if (reply.kind === "quiz-result") {
      const result = reply.payload;
      if (result.passed) {
        emitResult(requestId, { kind: "quiz-passed", result });
        approveBypass = true;
        try {
          p?.form.requestSubmit(p.submitter ?? undefined);
        } catch (err) {
          approveBypass = false;
          emitResult(requestId, {
            kind: "error",
            reason: "internal",
            message: `requestSubmit failed: ${String(err)}`,
          });
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

  const onBlocked = (blocked: ApproveBlockedEvent): void => {
    const requestId = newRequestId();
    const correlationId = newCorrelationId();

    const p: PendingApprove = {
      requestId,
      form: blocked.form,
      submitter: blocked.submitter,
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
  // Turbo navigation handlers
  // ---------------------------------------------------------------------------

  const onTurboBeforeVisit = (): void => {
    approveBypass = false;
    dropAll();
  };

  const onTurboRender = (): void => {
    const result = detectPRPage(doc.defaultView?.location.href ?? "");
    currentPR = result.ok ? result.pr : null;
  };

  // ---------------------------------------------------------------------------
  // MutationObserver fallback (GitHub deployments without Turbo events)
  // ---------------------------------------------------------------------------

  let observer: MutationObserver | null = null;

  const setupObserver = (): void => {
    if (typeof MutationObserver === "undefined") return;
    observer = new MutationObserver(() => {
      // On body child-list change, re-evaluate the URL in case of SPA nav.
      const result = detectPRPage(doc.defaultView?.location.href ?? "");
      currentPR = result.ok ? result.pr : null;
    });
    observer.observe(doc.body, { childList: true, subtree: false });
  };

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    start: (): void => {
      // Resolve initial PR state.
      const initialResult = detectPRPage(doc.defaultView?.location.href ?? "");
      currentPR = initialResult.ok ? initialResult.pr : null;

      // Capture-phase Approve interceptor.
      const disposeInterceptor = setupApproveInterceptor({
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

      // Turbo navigation events.
      const turboBeforeVisitHandler = (): void => { onTurboBeforeVisit(); };
      const turboRenderHandler = (): void => { onTurboRender(); };
      doc.addEventListener("turbo:before-visit", turboBeforeVisitHandler);
      doc.addEventListener("turbo:render", turboRenderHandler);
      disposers.push(() => {
        doc.removeEventListener("turbo:before-visit", turboBeforeVisitHandler);
        doc.removeEventListener("turbo:render", turboRenderHandler);
      });

      // MutationObserver fallback.
      setupObserver();
      disposers.push(() => { observer?.disconnect(); observer = null; });

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
      disposers.push(disposeSubmit, disposeCancel);
    },

    stop: (): void => {
      approveBypass = false;
      dropAll();
      for (const dispose of disposers) {
        dispose();
      }
      disposers.length = 0;
    },
  };
};
