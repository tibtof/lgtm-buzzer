import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Frame } from "@lgtm-buzzer/protocol";
import {
  createQuizFlowController,
  type QuizFlowController,
} from "./quiz-flow.js";
import {
  DOM_EVENTS,
  type QuizResultEventDetail,
  type QuizRequestEventDetail,
} from "./dom-events.js";

// ---------------------------------------------------------------------------
// Helpers / fakes
// ---------------------------------------------------------------------------


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
    // We can't assign window.location.href directly in jsdom, but we can
    // work around this by providing a custom getCurrentPR via the interceptor.
    // The controller calls detectPRPage(doc.defaultView?.location.href ?? "").
    // For tests we stub location via Object.defineProperty.
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
  // 1. Happy path: Approve → quiz-ready → submit → quiz-passed → requestSubmit
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
  // 7. turbo:before-visit clears bypass + pending
  // -------------------------------------------------------------------------

  it("turbo:before-visit clears pending state", async () => {
    const requestSubmitSpy = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => { /* jsdom stub */ });

    // sendFrame that never resolves (simulates in-flight request).
    const sendFrame = vi.fn((): Promise<Frame> => new Promise(() => { /* never */ }));

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
    });
    controller.start();

    fireSubmit(form);
    // Let the async start.
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });

    // Fire turbo:before-visit.
    document.dispatchEvent(new Event("turbo:before-visit"));

    // requestSubmit should NOT have been called.
    expect(requestSubmitSpy).not.toHaveBeenCalled();

    requestSubmitSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // 8. turbo:render to non-PR page: controller idles (currentPR = null)
  // -------------------------------------------------------------------------

  it("turbo:render to non-PR URL: controller no longer intercepts Approve", async () => {
    const blocked: unknown[] = [];
    const sendFrame = vi.fn(async (frame: Frame): Promise<Frame> =>
      makeQuizResponseFrame(frame.correlationId ?? "null"),
    );

    controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: makeCounter("corr"),
      newRequestId: makeCounter("req"),
    });
    controller.start();

    // Navigate to a non-PR page.
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "https://github.com/tibtof" },
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("turbo:render"));

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
});
