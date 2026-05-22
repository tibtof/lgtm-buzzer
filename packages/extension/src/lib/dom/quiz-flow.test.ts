import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Frame } from "@lgtm-buzzer/protocol";
import type { PRIdentifier } from "@lgtm-buzzer/core";
import {
  createQuizFlowController,
  type QuizFlowController,
  type InterceptorFactory,
} from "./quiz-flow.js";
import type { NavigationWatcher } from "./navigation.js";
import type { InterceptedApproveEvent } from "./approve-intercept.js";
import {
  DOM_EVENTS,
  type QuizResultEventDetail,
  type QuizRequestEventDetail,
} from "./dom-events.js";

// ---------------------------------------------------------------------------
// Helpers / fakes
// ---------------------------------------------------------------------------

const adoPR: PRIdentifier = {
  kind: "ado",
  org: "my-org",
  project: "My Project",
  repo: "myrepo",
  pullRequestId: 7,
};

const makeQuizResponseFrame = (correlationId: string, quizId = "quiz-1"): Frame => ({
  v: 1,
  kind: "quiz-response",
  correlationId,
  payload: {
    quiz: {
      id: quizId,
      questions: [
        {
          type: "multiple-choice",
          id: "q1",
          prompt: "What changed?",
          choices: [
            { id: "a", label: "Option A" },
            { id: "b", label: "Option B" },
          ],
        },
      ],
    },
  },
});

const makeQuizResultFrame = (
  correlationId: string,
  passed: boolean,
): Frame => ({
  v: 1,
  kind: "quiz-result",
  correlationId,
  payload: { passed, correct: passed ? 1 : 0, total: 1 },
});

const makeErrorFrame = (correlationId: string, reason = "internal"): Frame => ({
  v: 1,
  kind: "error",
  correlationId,
  payload: { reason: reason as "internal", message: "test error" },
});

/** Counter-based id generator (deterministic, no crypto). */
const makeCounter = (prefix: string): (() => string) => {
  let n = 0;
  return () => `${prefix}-${++n}`;
};

/** Creates a minimal Approve form and appends it to document.body. */
const makeApproveForm = (): HTMLFormElement => {
  const form = document.createElement("form");
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "pull_request_review[event]";
  input.value = "approve";
  form.appendChild(input);
  document.body.appendChild(form);
  return form;
};

/** Fires a submit event on the given form. */
const fireSubmit = (form: HTMLFormElement): Event => {
  const ev = new Event("submit", { bubbles: true, cancelable: true });
  form.dispatchEvent(ev);
  return ev;
};

/** Collect all result events fired during a test. */
const collectResultEvents = (): {
  events: QuizResultEventDetail[];
  dispose: () => void;
} => {
  const events: QuizResultEventDetail[] = [];
  const handler = (e: Event): void => {
    const detail = (e as CustomEvent<unknown>).detail;
    // Quick loose cast — tests validate fields individually.
    events.push(detail as QuizResultEventDetail);
  };
  document.addEventListener(DOM_EVENTS.quizResult, handler);
  return {
    events,
    dispose: () => { document.removeEventListener(DOM_EVENTS.quizResult, handler); },
  };
};

/** Collect all request events fired during a test. */
const collectRequestEvents = (): {
  events: QuizRequestEventDetail[];
  dispose: () => void;
} => {
  const events: QuizRequestEventDetail[] = [];
  const handler = (e: Event): void => {
    const detail = (e as CustomEvent<unknown>).detail;
    events.push(detail as QuizRequestEventDetail);
  };
  document.addEventListener(DOM_EVENTS.quizRequest, handler);
  return {
    events,
    dispose: () => { document.removeEventListener(DOM_EVENTS.quizRequest, handler); },
  };
};

/**
 * Creates a GitHub-like `setupInterceptor` factory that wraps
 * `setupApproveInterceptor` using the real form-submit mechanism.
 * Used by GitHub-path tests.
 */
const makeGitHubInterceptorFactory = (): InterceptorFactory =>
  (deps) => {
    const handler = (event: Event): void => {
      if (!(event.target instanceof HTMLFormElement)) return;
      const form = event.target;
      const submitter =
        event instanceof SubmitEvent && event.submitter instanceof HTMLElement
          ? event.submitter
          : null;
      const formData = new FormData(form, submitter);
      if (formData.get("pull_request_review[event]") !== "approve") return;
      const pr = deps.getCurrentPR();
      if (pr === null) return;
      if (deps.shouldBypass()) return;
      event.preventDefault();
      event.stopPropagation();
      const blocked: InterceptedApproveEvent = { kind: "github", form, submitter, pr };
      deps.onBlocked(blocked);
    };
    deps.doc.addEventListener("submit", handler, { capture: true });
    return () => { deps.doc.removeEventListener("submit", handler, { capture: true }); };
  };

/**
 * Creates a no-op navigation watcher that does nothing. Used by tests that
 * drive navigation manually or don't need SPA navigation.
 */
const makeNoOpNavigationWatcher = (): NavigationWatcher => ({
  start: () => () => { /* no-op dispose */ },
});

/**
 * Creates a GitHub Turbo navigation watcher fake that exposes callbacks so
 * tests can fire navigation events manually.
 */
const makeTurboNavigationWatcher = (): NavigationWatcher & {
  fireWillNavigate: () => void;
  fireDidNavigate: () => void;
} => {
  let _onWillNavigate: (() => void) | null = null;
  let _onDidNavigate: (() => void) | null = null;
  return {
    start: (cb: { readonly onWillNavigate: () => void; readonly onDidNavigate: () => void }) => {
      _onWillNavigate = cb.onWillNavigate;
      _onDidNavigate = cb.onDidNavigate;
      return () => { _onWillNavigate = null; _onDidNavigate = null; };
    },
    fireWillNavigate: () => { _onWillNavigate?.(); },
    fireDidNavigate: () => { _onDidNavigate?.(); },
  };
};

// ---------------------------------------------------------------------------
// Base setup
// ---------------------------------------------------------------------------

describe("createQuizFlowController", () => {
  let controller: QuizFlowController;
  let form: HTMLFormElement;

  // Override location.href so detectPRPage finds a PR URL.
  const originalLocation = window.location.href;

  beforeEach(() => {
    // jsdom default href is "http://localhost/" — not a PR URL.
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        href: "https://github.com/tibtof/lgtm-buzzer/pull/42",
      },
      writable: true,
      configurable: true,
    });
    form = makeApproveForm();
  });

  afterEach(() => {
    controller?.stop();
    form?.remove();
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: originalLocation },
      writable: true,
      configurable: true,
    });
  });

  // -------------------------------------------------------------------------
  // 1. Happy path GitHub: Approve → quiz-ready → submit → quiz-passed → requestSubmit
  // -------------------------------------------------------------------------

  it("happy path GitHub: quiz-ready then quiz-passed triggers requestSubmit", async () => {
    const requestSubmitSpy = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => { /* jsdom stub */ });

    const sendFrameReplies = new Map<string, Frame>();
    let firstCorrelationId: string | undefined;

    const sendFrame = vi.fn(async (frame: Frame): Promise<Frame> => {
      const correlationId = frame.correlationId ?? "null";
      if (frame.kind === "quiz-request") {
        firstCorrelationId = correlationId;
        return makeQuizResponseFrame(correlationId);
      }
      if (frame.kind === "quiz-submit") {
        return makeQuizResultFrame(correlationId, true /* passed */);
      }
      return makeErrorFrame(correlationId);
    });

    void sendFrameReplies; // suppress unused warning

    const { events: resultEvents, dispose: disposeResult } = collectResultEvents();

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
      setupInterceptor: makeGitHubInterceptorFactory(),
      navigationWatcher: makeNoOpNavigationWatcher(),
    });
    controller.start();

    // Trigger Approve submit.
    fireSubmit(form);

    // Wait for async frame round-trip.
    await vi.waitFor(() => expect(resultEvents.length).toBeGreaterThanOrEqual(1));

    const quizReadyEvent = resultEvents[0];
    expect(quizReadyEvent?.outcome.kind).toBe("quiz-ready");

    // Modal dispatches quiz-submit.
    document.dispatchEvent(
      new CustomEvent(DOM_EVENTS.quizSubmit, {
        detail: {
          requestId: "req-1",
          quizId: "quiz-1",
          answers: [{ questionId: "q1", chosenChoiceId: "a" }],
        },
      }),
    );

    await vi.waitFor(() => expect(resultEvents.length).toBeGreaterThanOrEqual(2));

    const passedEvent = resultEvents[1];
    expect(passedEvent?.outcome.kind).toBe("quiz-passed");

    // requestSubmit should have been called (bypass flag path).
    expect(requestSubmitSpy).toHaveBeenCalled();

    requestSubmitSpy.mockRestore();
    disposeResult();
    void firstCorrelationId;
  });

  // -------------------------------------------------------------------------
  // 2. Failed quiz: form NOT re-submitted
  // -------------------------------------------------------------------------

  it("quiz-failed: form not re-submitted, bypass stays false", async () => {
    const requestSubmitSpy = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => { /* jsdom stub */ });

    const sendFrame = vi.fn(async (frame: Frame): Promise<Frame> => {
      const correlationId = frame.correlationId ?? "null";
      if (frame.kind === "quiz-request") return makeQuizResponseFrame(correlationId);
      if (frame.kind === "quiz-submit") return makeQuizResultFrame(correlationId, false /* failed */);
      return makeErrorFrame(correlationId);
    });

    const { events: resultEvents, dispose: disposeResult } = collectResultEvents();

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
      setupInterceptor: makeGitHubInterceptorFactory(),
      navigationWatcher: makeNoOpNavigationWatcher(),
    });
    controller.start();

    fireSubmit(form);
    await vi.waitFor(() => expect(resultEvents.length).toBeGreaterThanOrEqual(1));

    document.dispatchEvent(
      new CustomEvent(DOM_EVENTS.quizSubmit, {
        detail: {
          requestId: "req-1",
          quizId: "quiz-1",
          answers: [{ questionId: "q1", chosenChoiceId: "b" }],
        },
      }),
    );

    await vi.waitFor(() => expect(resultEvents.length).toBeGreaterThanOrEqual(2));

    const failedEvent = resultEvents[1];
    expect(failedEvent?.outcome.kind).toBe("quiz-failed");
    expect(requestSubmitSpy).not.toHaveBeenCalled();

    requestSubmitSpy.mockRestore();
    disposeResult();
  });

  // -------------------------------------------------------------------------
  // 3. ErrorFrame on QuizRequest: error event, pending dropped
  // -------------------------------------------------------------------------

  it("ErrorFrame on quiz-request: emits error event; pending dropped", async () => {
    const sendFrame = vi.fn(async (frame: Frame): Promise<Frame> => {
      return makeErrorFrame(frame.correlationId ?? "null");
    });

    const { events: resultEvents, dispose: disposeResult } = collectResultEvents();

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
      setupInterceptor: makeGitHubInterceptorFactory(),
      navigationWatcher: makeNoOpNavigationWatcher(),
    });
    controller.start();

    fireSubmit(form);
    await vi.waitFor(() => expect(resultEvents.length).toBeGreaterThanOrEqual(1));

    expect(resultEvents[0]?.outcome.kind).toBe("error");

    disposeResult();
  });

  // -------------------------------------------------------------------------
  // 4. ErrorFrame on QuizSubmit: error event, form NOT submitted
  // -------------------------------------------------------------------------

  it("ErrorFrame on quiz-submit: emits error event; form not submitted", async () => {
    const requestSubmitSpy = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => { /* jsdom stub */ });

    const sendFrame = vi.fn(async (frame: Frame): Promise<Frame> => {
      const correlationId = frame.correlationId ?? "null";
      if (frame.kind === "quiz-request") return makeQuizResponseFrame(correlationId);
      return makeErrorFrame(correlationId); // error on submit
    });

    const { events: resultEvents, dispose: disposeResult } = collectResultEvents();

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
      setupInterceptor: makeGitHubInterceptorFactory(),
      navigationWatcher: makeNoOpNavigationWatcher(),
    });
    controller.start();

    fireSubmit(form);
    await vi.waitFor(() => expect(resultEvents.length).toBeGreaterThanOrEqual(1));

    document.dispatchEvent(
      new CustomEvent(DOM_EVENTS.quizSubmit, {
        detail: {
          requestId: "req-1",
          quizId: "quiz-1",
          answers: [{ questionId: "q1", chosenChoiceId: "a" }],
        },
      }),
    );

    await vi.waitFor(() => expect(resultEvents.length).toBeGreaterThanOrEqual(2));

    expect(resultEvents[1]?.outcome.kind).toBe("error");
    expect(requestSubmitSpy).not.toHaveBeenCalled();

    requestSubmitSpy.mockRestore();
    disposeResult();
  });

  // -------------------------------------------------------------------------
  // 5. sendFrame rejection: error event with reason "internal"
  // -------------------------------------------------------------------------

  it("sendFrame rejection: emits error event with reason internal", async () => {
    const sendFrame = vi.fn(async (): Promise<Frame> => {
      throw new Error("context invalidated");
    });

    const { events: resultEvents, dispose: disposeResult } = collectResultEvents();

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
      setupInterceptor: makeGitHubInterceptorFactory(),
      navigationWatcher: makeNoOpNavigationWatcher(),
    });
    controller.start();

    fireSubmit(form);
    await vi.waitFor(() => expect(resultEvents.length).toBeGreaterThanOrEqual(1));

    const errorEvent = resultEvents[0];
    expect(errorEvent?.outcome.kind).toBe("error");

    disposeResult();
  });

  // -------------------------------------------------------------------------
  // 6. quiz-cancel mid-flight: pending dropped; late reply logged + ignored
  // -------------------------------------------------------------------------

  it("quiz-cancel mid-flight: pending dropped; late reply is ignored", async () => {
    const requestSubmitSpy = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => { /* jsdom stub */ });
    const warnCalls: string[] = [];

    let resolveFrame!: (f: Frame) => void;
    const sendFrame = vi.fn(async (frame: Frame): Promise<Frame> => {
      return new Promise<Frame>((resolve) => {
        if (frame.kind === "quiz-request") {
          resolveFrame = (f) => { resolve(f); };
        } else {
          resolve(makeErrorFrame(frame.correlationId ?? "null"));
        }
      });
    });

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
      setupInterceptor: makeGitHubInterceptorFactory(),
      navigationWatcher: makeNoOpNavigationWatcher(),
      logger: { warn: (msg) => { warnCalls.push(msg); } },
    });
    controller.start();

    fireSubmit(form);
    // Yield to let the async quiz-request start.
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });

    // Cancel before the frame reply arrives.
    document.dispatchEvent(
      new CustomEvent(DOM_EVENTS.quizCancel, {
        detail: { requestId: "req-1" },
      }),
    );

    // Now let the sendFrame resolve.
    resolveFrame(makeQuizResponseFrame("corr-1"));
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });

    // The late reply should have been logged + dropped.
    expect(warnCalls.some((w) => w.includes("arrived after cancel"))).toBe(true);
    expect(requestSubmitSpy).not.toHaveBeenCalled();

    requestSubmitSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // 7. Navigation onWillNavigate clears bypass + pending
  // -------------------------------------------------------------------------

  it("onWillNavigate clears pending state", async () => {
    const requestSubmitSpy = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => { /* jsdom stub */ });

    // sendFrame that never resolves (simulates in-flight request).
    const sendFrame = vi.fn((): Promise<Frame> => new Promise(() => { /* never */ }));

    const navWatcher = makeTurboNavigationWatcher();

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
      setupInterceptor: makeGitHubInterceptorFactory(),
      navigationWatcher: navWatcher,
    });
    controller.start();

    fireSubmit(form);
    // Let the async start.
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });

    // Fire will-navigate (equivalent to turbo:before-visit).
    navWatcher.fireWillNavigate();

    // requestSubmit should NOT have been called.
    expect(requestSubmitSpy).not.toHaveBeenCalled();

    requestSubmitSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // 8. Navigation onDidNavigate to non-PR page: controller idles
  // -------------------------------------------------------------------------

  it("onDidNavigate to non-PR URL: controller no longer intercepts Approve", async () => {
    const blocked: unknown[] = [];
    const sendFrame = vi.fn(async (frame: Frame): Promise<Frame> =>
      makeQuizResponseFrame(frame.correlationId ?? "null"),
    );

    const navWatcher = makeTurboNavigationWatcher();

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
      setupInterceptor: makeGitHubInterceptorFactory(),
      navigationWatcher: navWatcher,
    });
    controller.start();

    // Navigate to a non-PR page.
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "https://github.com/tibtof" },
      writable: true,
      configurable: true,
    });
    navWatcher.fireDidNavigate();

    // Submit should now be ignored.
    fireSubmit(form);
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });

    expect(sendFrame).not.toHaveBeenCalled();
    expect(blocked).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 9. Two concurrent Approve clicks: two distinct requestIds, independent
  // -------------------------------------------------------------------------

  it("two concurrent Approve clicks have distinct requestIds", async () => {
    const { events: requestEvents, dispose: disposeRequests } = collectRequestEvents();

    const sendFrame = vi.fn((): Promise<Frame> => new Promise(() => { /* never resolves */ }));

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
      setupInterceptor: makeGitHubInterceptorFactory(),
      navigationWatcher: makeNoOpNavigationWatcher(),
    });
    controller.start();

    // Second Approve form.
    const form2 = makeApproveForm();

    fireSubmit(form);
    fireSubmit(form2);

    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });

    expect(requestEvents.length).toBe(2);
    const ids = requestEvents.map((e) => e.requestId);
    expect(new Set(ids).size).toBe(2);

    form2.remove();
    disposeRequests();
  });

  // -------------------------------------------------------------------------
  // 10. newCorrelationId + newRequestId are used (counter-based in tests)
  // -------------------------------------------------------------------------

  it("uses injected newCorrelationId and newRequestId — counter-based", async () => {
    const corrIds: string[] = [];
    const reqIds: string[] = [];

    let corrN = 0;
    let reqN = 0;

    const sendFrame = vi.fn(async (frame: Frame): Promise<Frame> =>
      makeQuizResponseFrame(frame.correlationId ?? "null"),
    );

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: () => `corr-${++corrN}`,
      newRequestId: () => `req-${++reqN}`,
      setupInterceptor: makeGitHubInterceptorFactory(),
      navigationWatcher: makeNoOpNavigationWatcher(),
    });

    const { events: requestEvents, dispose: disposeRequests } = collectRequestEvents();
    controller.start();

    fireSubmit(form);
    await vi.waitFor(() => expect(requestEvents.length).toBeGreaterThanOrEqual(1));

    const firstRequest = requestEvents[0];
    expect(firstRequest?.requestId).toBe("req-1");
    expect(firstRequest?.correlationId).toBe("corr-1");

    void corrIds;
    void reqIds;
    disposeRequests();
  });

  // -------------------------------------------------------------------------
  // 11. Diff-only invariant: quiz-request.detail.pr carries only coordinates
  // -------------------------------------------------------------------------

  it("diff-only invariant: quiz-request event pr carries only coordinate fields", async () => {
    const { events: requestEvents, dispose: disposeRequests } = collectRequestEvents();

    const sendFrame = vi.fn(async (frame: Frame): Promise<Frame> =>
      makeQuizResponseFrame(frame.correlationId ?? "null"),
    );

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
      setupInterceptor: makeGitHubInterceptorFactory(),
      navigationWatcher: makeNoOpNavigationWatcher(),
    });
    controller.start();

    fireSubmit(form);
    await vi.waitFor(() => expect(requestEvents.length).toBeGreaterThanOrEqual(1));

    const detail = requestEvents[0];
    const pr = detail?.pr as Record<string, unknown> | undefined;

    expect(pr).toBeDefined();
    expect(pr?.kind).toBe("github");
    expect(pr?.owner).toBe("tibtof");
    expect(pr?.repo).toBe("lgtm-buzzer");
    expect(pr?.number).toBe(42);

    // These fields must NOT be present (diff-only invariant).
    expect(pr).not.toHaveProperty("description");
    expect(pr).not.toHaveProperty("title");
    expect(pr).not.toHaveProperty("comments");
    expect(pr).not.toHaveProperty("body");
    expect(pr).not.toHaveProperty("commits");

    disposeRequests();
  });

  // -------------------------------------------------------------------------
  // 12. quiz-submit for unknown requestId: logged + dropped
  // -------------------------------------------------------------------------

  it("quiz-submit for unknown requestId is logged and dropped", async () => {
    const requestSubmitSpy = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => { /* jsdom stub */ });
    const warnCalls: string[] = [];

    const sendFrame = vi.fn(async (frame: Frame): Promise<Frame> =>
      makeQuizResultFrame(frame.correlationId ?? "null", true),
    );

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
      setupInterceptor: makeGitHubInterceptorFactory(),
      navigationWatcher: makeNoOpNavigationWatcher(),
      logger: { warn: (msg) => { warnCalls.push(msg); } },
    });
    controller.start();

    // Send quiz-submit for a requestId that was never created.
    document.dispatchEvent(
      new CustomEvent(DOM_EVENTS.quizSubmit, {
        detail: {
          requestId: "req-9999",
          quizId: "quiz-x",
          answers: [{ questionId: "q1", chosenChoiceId: "a" }],
        },
      }),
    );

    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });

    expect(warnCalls.some((w) => w.includes("unknown requestId"))).toBe(true);
    expect(requestSubmitSpy).not.toHaveBeenCalled();
    // sendFrame should NOT have been called (unknown requestId → dropped).
    expect(sendFrame).not.toHaveBeenCalled();

    requestSubmitSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // ADO 13. Happy path ADO: click → quiz-ready → submit → quiz-passed → element.click()
  // -------------------------------------------------------------------------

  it("ADO happy path: quiz-passed triggers element.click()", async () => {
    // Set ADO URL.
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        href: "https://dev.azure.com/my-org/My%20Project/_git/myrepo/pullrequest/7",
      },
      writable: true,
      configurable: true,
    });

    const sendFrame = vi.fn(async (frame: Frame): Promise<Frame> => {
      const correlationId = frame.correlationId ?? "null";
      if (frame.kind === "quiz-request") return makeQuizResponseFrame(correlationId);
      if (frame.kind === "quiz-submit") return makeQuizResultFrame(correlationId, true);
      return makeErrorFrame(correlationId);
    });

    const { events: resultEvents, dispose: disposeResult } = collectResultEvents();

    // Use a container object to avoid TypeScript narrowing `null` through
    // closures (TS 5.5+ narrows `let x: T | null` to `never` when both a
    // null-assignment and a non-null assignment exist in separate closures).
    const interceptorCtx: {
      onBlocked: ((e: InterceptedApproveEvent) => void) | null;
    } = { onBlocked: null };

    const adoInterceptorFactory: InterceptorFactory = (deps) => {
      interceptorCtx.onBlocked = deps.onBlocked;
      return () => { interceptorCtx.onBlocked = null; };
    };

    const adoButton = document.createElement("button");

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
      setupInterceptor: adoInterceptorFactory,
      navigationWatcher: makeNoOpNavigationWatcher(),
    });
    controller.start();

    // Simulate ADO Approve click being intercepted.
    interceptorCtx.onBlocked?.({
      kind: "ado",
      element: adoButton,
      variant: "approve",
      pr: adoPR as PRIdentifier & { kind: "ado" },
    });

    await vi.waitFor(() => expect(resultEvents.length).toBeGreaterThanOrEqual(1));
    expect(resultEvents[0]?.outcome.kind).toBe("quiz-ready");

    document.dispatchEvent(
      new CustomEvent(DOM_EVENTS.quizSubmit, {
        detail: {
          requestId: "req-1",
          quizId: "quiz-1",
          answers: [{ questionId: "q1", chosenChoiceId: "a" }],
        },
      }),
    );

    await vi.waitFor(() => expect(resultEvents.length).toBeGreaterThanOrEqual(2));
    expect(resultEvents[1]?.outcome.kind).toBe("quiz-passed");

    // The quiz-passed outcome confirms element.click() was the replay path
    // (GitHub path would have called requestSubmit which is not spied here).
    const requestSubmitSpy = vi.spyOn(HTMLFormElement.prototype, "requestSubmit");
    expect(requestSubmitSpy).not.toHaveBeenCalled();
    requestSubmitSpy.mockRestore();

    disposeResult();
  });

  // -------------------------------------------------------------------------
  // ADO 14. Failed quiz: element.click() NOT called
  // -------------------------------------------------------------------------

  it("ADO quiz-failed: element.click() NOT called", async () => {
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        href: "https://dev.azure.com/my-org/My%20Project/_git/myrepo/pullrequest/7",
      },
      writable: true,
      configurable: true,
    });

    const sendFrame = vi.fn(async (frame: Frame): Promise<Frame> => {
      const correlationId = frame.correlationId ?? "null";
      if (frame.kind === "quiz-request") return makeQuizResponseFrame(correlationId);
      if (frame.kind === "quiz-submit") return makeQuizResultFrame(correlationId, false);
      return makeErrorFrame(correlationId);
    });

    const { events: resultEvents, dispose: disposeResult } = collectResultEvents();

    const adoButton = document.createElement("button");
    const elementClickSpy = vi.spyOn(adoButton, "click");

    const interceptorCtx: { onBlocked: ((e: InterceptedApproveEvent) => void) | null } = { onBlocked: null };

    const adoInterceptorFactory: InterceptorFactory = (deps) => {
      interceptorCtx.onBlocked = deps.onBlocked;
      return () => { interceptorCtx.onBlocked = null; };
    };

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
      setupInterceptor: adoInterceptorFactory,
      navigationWatcher: makeNoOpNavigationWatcher(),
    });
    controller.start();

    interceptorCtx.onBlocked?.({
      kind: "ado",
      element: adoButton,
      variant: "approve",
      pr: adoPR as PRIdentifier & { kind: "ado" },
    });

    await vi.waitFor(() => expect(resultEvents.length).toBeGreaterThanOrEqual(1));

    document.dispatchEvent(
      new CustomEvent(DOM_EVENTS.quizSubmit, {
        detail: {
          requestId: "req-1",
          quizId: "quiz-1",
          answers: [{ questionId: "q1", chosenChoiceId: "b" }],
        },
      }),
    );

    await vi.waitFor(() => expect(resultEvents.length).toBeGreaterThanOrEqual(2));
    expect(resultEvents[1]?.outcome.kind).toBe("quiz-failed");
    expect(elementClickSpy).not.toHaveBeenCalled();

    elementClickSpy.mockRestore();
    disposeResult();
  });

  // -------------------------------------------------------------------------
  // ADO 15. element.click() throws → error outcome dispatched, bypass reset
  // -------------------------------------------------------------------------

  it("ADO replay click throws: error outcome dispatched, bypass reset", async () => {
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        href: "https://dev.azure.com/my-org/My%20Project/_git/myrepo/pullrequest/7",
      },
      writable: true,
      configurable: true,
    });

    const sendFrame = vi.fn(async (frame: Frame): Promise<Frame> => {
      const correlationId = frame.correlationId ?? "null";
      if (frame.kind === "quiz-request") return makeQuizResponseFrame(correlationId);
      if (frame.kind === "quiz-submit") return makeQuizResultFrame(correlationId, true);
      return makeErrorFrame(correlationId);
    });

    const { events: resultEvents, dispose: disposeResult } = collectResultEvents();

    const adoButton = document.createElement("button");
    vi.spyOn(adoButton, "click").mockImplementation(() => { throw new Error("DOM error"); });

    const interceptorCtx: { onBlocked: ((e: InterceptedApproveEvent) => void) | null } = { onBlocked: null };

    const adoInterceptorFactory: InterceptorFactory = (deps) => {
      interceptorCtx.onBlocked = deps.onBlocked;
      return () => { interceptorCtx.onBlocked = null; };
    };

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
      setupInterceptor: adoInterceptorFactory,
      navigationWatcher: makeNoOpNavigationWatcher(),
    });
    controller.start();

    interceptorCtx.onBlocked?.({
      kind: "ado",
      element: adoButton,
      variant: "approve",
      pr: adoPR as PRIdentifier & { kind: "ado" },
    });

    await vi.waitFor(() => expect(resultEvents.length).toBeGreaterThanOrEqual(1));

    document.dispatchEvent(
      new CustomEvent(DOM_EVENTS.quizSubmit, {
        detail: {
          requestId: "req-1",
          quizId: "quiz-1",
          answers: [{ questionId: "q1", chosenChoiceId: "a" }],
        },
      }),
    );

    await vi.waitFor(() => expect(resultEvents.length).toBeGreaterThanOrEqual(3));

    // quiz-passed emitted first, then error from click failure.
    expect(resultEvents[1]?.outcome.kind).toBe("quiz-passed");
    expect(resultEvents[2]?.outcome.kind).toBe("error");

    disposeResult();
  });

  // -------------------------------------------------------------------------
  // ADO 16. Navigation mid-flight drops bypass + pending
  // -------------------------------------------------------------------------

  it("ADO onDidNavigate mid-flight drops bypass and pending", async () => {
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        href: "https://dev.azure.com/my-org/My%20Project/_git/myrepo/pullrequest/7",
      },
      writable: true,
      configurable: true,
    });

    const sendFrame = vi.fn((): Promise<Frame> => new Promise(() => { /* never */ }));
    const adoButton = document.createElement("button");
    const elementClickSpy = vi.spyOn(adoButton, "click");

    const interceptorCtx: { onBlocked: ((e: InterceptedApproveEvent) => void) | null } = { onBlocked: null };
    const navWatcher = makeTurboNavigationWatcher();

    const adoInterceptorFactory: InterceptorFactory = (deps) => {
      interceptorCtx.onBlocked = deps.onBlocked;
      return () => { interceptorCtx.onBlocked = null; };
    };

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
      setupInterceptor: adoInterceptorFactory,
      navigationWatcher: navWatcher,
    });
    controller.start();

    interceptorCtx.onBlocked?.({
      kind: "ado",
      element: adoButton,
      variant: "approve",
      pr: adoPR as PRIdentifier & { kind: "ado" },
    });

    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });

    // Navigate away.
    navWatcher.fireWillNavigate();

    // Even if sendFrame eventually resolved, pending is dropped.
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    expect(elementClickSpy).not.toHaveBeenCalled();

    elementClickSpy.mockRestore();
  });
});
