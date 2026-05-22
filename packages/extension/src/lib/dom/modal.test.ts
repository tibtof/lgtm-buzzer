import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createQuizModal } from "./modal.js";
import {
  DOM_EVENTS,
  emitDOMEvent,
  type QuizRequestEventDetail,
  type QuizResultEventDetail,
  type QuizSubmitEventDetail,
  type QuizCancelEventDetail,
} from "./dom-events.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const makeQuizDTO = (questionCount = 2) => ({
  id: "quiz-1",
  questions: Array.from({ length: questionCount }, (_, i) => ({
    type: "multiple-choice" as const,
    id: `q${i + 1}`,
    prompt: `Question ${i + 1}: What changed?`,
    choices: [
      { id: "a", label: "Option A" },
      { id: "b", label: "Option B" },
      { id: "c", label: "Option C" },
    ],
  })),
});

const makeQuizResultPayload = (
  passed: boolean,
  withPerQuestion = false,
) => ({
  passed,
  correct: passed ? 2 : 0,
  total: 2,
  perQuestion: withPerQuestion
    ? [
        { questionId: "q1", correct: passed, explanation: "Because reasons." },
        { questionId: "q2", correct: passed },
      ]
    : undefined,
});

const makeQuizRequestDetail = (requestId = "req-1"): QuizRequestEventDetail => ({
  requestId,
  correlationId: "corr-1",
  pr: { kind: "github", owner: "tibtof", repo: "lgtm-buzzer", number: 42 },
});

const fireQuizRequest = (doc: Document, requestId = "req-1"): void => {
  emitDOMEvent(doc, DOM_EVENTS.quizRequest, makeQuizRequestDetail(requestId));
};

const fireQuizReady = (doc: Document, requestId = "req-1"): void => {
  const detail: QuizResultEventDetail = {
    requestId,
    outcome: { kind: "quiz-ready", quiz: makeQuizDTO() },
  };
  emitDOMEvent(doc, DOM_EVENTS.quizResult, detail);
};

const fireQuizPassed = (
  doc: Document,
  requestId = "req-1",
  withPerQuestion = false,
): void => {
  const detail: QuizResultEventDetail = {
    requestId,
    outcome: { kind: "quiz-passed", result: makeQuizResultPayload(true, withPerQuestion) },
  };
  emitDOMEvent(doc, DOM_EVENTS.quizResult, detail);
};

const fireQuizFailed = (
  doc: Document,
  requestId = "req-1",
  withPerQuestion = false,
): void => {
  const detail: QuizResultEventDetail = {
    requestId,
    outcome: { kind: "quiz-failed", result: makeQuizResultPayload(false, withPerQuestion) },
  };
  emitDOMEvent(doc, DOM_EVENTS.quizResult, detail);
};

const fireQuizError = (
  doc: Document,
  requestId = "req-1",
  message = "host disconnected",
): void => {
  const detail: QuizResultEventDetail = {
    requestId,
    outcome: { kind: "error", reason: "internal", message },
  };
  emitDOMEvent(doc, DOM_EVENTS.quizResult, detail);
};

/** Returns the shadow root of the mounted modal host. */
const getShadow = (doc: Document): ShadowRoot | null => {
  const host = doc.querySelector("[data-lgtm-modal-host]");
  return host?.shadowRoot ?? null;
};

/** Selects the first radio for a given question index and checks it. */
const selectFirstChoice = (shadow: ShadowRoot, questionIndex = 0): void => {
  const radios = shadow.querySelectorAll<HTMLInputElement>(
    `input[name="lgtm-q-${questionIndex}"]`,
  );
  const first = radios[0];
  if (first !== undefined) {
    first.checked = true;
    first.dispatchEvent(new Event("change", { bubbles: true }));
  }
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createQuizModal", () => {
  let dispose: (() => void) | null = null;

  afterEach(() => {
    dispose?.();
    dispose = null;
    // Clean up any stale host nodes that survived the dispose.
    document
      .querySelectorAll("[data-lgtm-modal-host]")
      .forEach((n) => n.remove());
  });

  // 1. Mount on first quiz-request event
  it("mounts the modal host on the first quiz-request event", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    expect(document.querySelector("[data-lgtm-modal-host]")).toBeNull();

    fireQuizRequest(document);

    expect(document.querySelector("[data-lgtm-modal-host]")).not.toBeNull();
  });

  // 2. Loading state shown immediately on quiz-request
  it("shows a loading state immediately after quiz-request", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);

    const shadow = getShadow(document);
    expect(shadow).not.toBeNull();
    const spinner = shadow!.querySelector(".spinner");
    expect(spinner).not.toBeNull();
  });

  // 3. Renders questions on quiz-ready outcome
  it("renders quiz questions when quiz-ready outcome arrives", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document);
    expect(shadow).not.toBeNull();
    const questionBlocks = shadow!.querySelectorAll(".question-block");
    expect(questionBlocks.length).toBe(2);
  });

  // 4. Radio buttons grouped per question
  it("groups radio buttons by question using unique name attributes", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    const q0Radios = shadow.querySelectorAll('input[name="lgtm-q-0"]');
    const q1Radios = shadow.querySelectorAll('input[name="lgtm-q-1"]');

    expect(q0Radios.length).toBe(3); // 3 choices per question
    expect(q1Radios.length).toBe(3);
  });

  // 5. Submit button dispatches quiz-submit with collected answers
  it("submit button dispatches lgtm-buzzer:quiz-submit with collected answers", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    const receivedSubmits: QuizSubmitEventDetail[] = [];
    const cleanup = document.addEventListener(
      DOM_EVENTS.quizSubmit,
      (e) => { receivedSubmits.push((e as CustomEvent).detail as QuizSubmitEventDetail); },
    );

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;

    // Select one choice per question.
    selectFirstChoice(shadow, 0);
    selectFirstChoice(shadow, 1);

    const submitBtn = shadow.querySelector<HTMLButtonElement>(".btn-primary");
    expect(submitBtn).not.toBeNull();
    expect(submitBtn!.disabled).toBe(false);
    submitBtn!.click();

    expect(receivedSubmits).toHaveLength(1);
    const submitted = receivedSubmits[0]!;
    expect(submitted.requestId).toBe("req-1");
    expect(submitted.quizId).toBe("quiz-1");
    expect(submitted.answers).toHaveLength(2);
    expect(submitted.answers[0]!.chosenChoiceId).toBe("a");

    // Cleanup (addEventListener returns void, not a dispose fn — remove manually).
    document.removeEventListener(DOM_EVENTS.quizSubmit, cleanup as unknown as EventListener);
  });

  // 6. Submit disabled when not all questions answered
  it("submit button is disabled when not all questions are answered", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    const submitBtn = shadow.querySelector<HTMLButtonElement>(".btn-primary");
    expect(submitBtn).not.toBeNull();

    // Initially disabled.
    expect(submitBtn!.disabled).toBe(true);

    // Select only the first question's answer.
    selectFirstChoice(shadow, 0);
    expect(submitBtn!.disabled).toBe(true);

    // Select second question too.
    selectFirstChoice(shadow, 1);
    expect(submitBtn!.disabled).toBe(false);
  });

  // 7. quiz-passed outcome closes the modal
  it("closes the modal on quiz-passed outcome", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    // Simulate submit flow: select answers and submit.
    const shadow = getShadow(document)!;
    selectFirstChoice(shadow, 0);
    selectFirstChoice(shadow, 1);
    shadow.querySelector<HTMLButtonElement>(".btn-primary")!.click();

    // Now fire quiz-passed.
    fireQuizPassed(document);

    // The modal should show the result state (pass banner visible, backdrop still there).
    const shadow2 = getShadow(document)!;
    const backdrop = shadow2.querySelector(".backdrop");
    expect(backdrop).not.toBeNull();
    const passBanner = shadow2.querySelector(".result-pass");
    expect(passBanner).not.toBeNull();
  });

  // 7b. quiz-passed dismiss button closes the modal completely
  it("dismiss button on pass result closes the modal", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizPassed(document);

    const shadow = getShadow(document)!;
    const dismissBtn = shadow.querySelector<HTMLButtonElement>(".btn-secondary");
    expect(dismissBtn).not.toBeNull();
    dismissBtn!.click();

    // Modal is idle — backdrop removed.
    const shadow2 = getShadow(document)!;
    expect(shadow2.querySelector(".backdrop")).toBeNull();
  });

  // 8. quiz-failed outcome shows result + per-question feedback
  it("shows fail result with per-question feedback on quiz-failed outcome", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    selectFirstChoice(shadow, 0);
    selectFirstChoice(shadow, 1);
    shadow.querySelector<HTMLButtonElement>(".btn-primary")!.click();

    fireQuizFailed(document, "req-1", /* withPerQuestion */ true);

    const shadow2 = getShadow(document)!;
    const failBanner = shadow2.querySelector(".result-fail");
    expect(failBanner).not.toBeNull();

    const perQuestionItems = shadow2.querySelectorAll(".per-question-item");
    expect(perQuestionItems.length).toBe(2);

    // Each item has a red X icon.
    perQuestionItems.forEach((item) => {
      expect(item.querySelector(".pq-icon")?.textContent).toBe("❌");
    });
  });

  // 9. error outcome shows error message + dismiss button
  it("shows error message and dismiss button on error outcome", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizError(document, "req-1", "LLM timeout after 30s");

    const shadow = getShadow(document)!;
    const errorBanner = shadow.querySelector(".result-error");
    expect(errorBanner).not.toBeNull();

    const errorMsg = shadow.querySelector(".error-msg");
    expect(errorMsg).not.toBeNull();
    // textContent must match the error message (no innerHTML risk).
    expect(errorMsg!.textContent).toBe("LLM timeout after 30s");

    const dismissBtn = shadow.querySelector<HTMLButtonElement>(".btn-secondary");
    expect(dismissBtn).not.toBeNull();
  });

  // 10. Dismiss / Esc emits lgtm-buzzer:quiz-cancel
  it("Esc key emits quiz-cancel and closes the modal", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    const cancelEvents: QuizCancelEventDetail[] = [];
    const handler = (e: Event): void => {
      cancelEvents.push((e as CustomEvent).detail as QuizCancelEventDetail);
    };
    document.addEventListener(DOM_EVENTS.quizCancel, handler);

    fireQuizRequest(document, "req-esc");

    // Fire Escape key.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(cancelEvents).toHaveLength(1);
    expect(cancelEvents[0]!.requestId).toBe("req-esc");

    // Modal should be idle.
    const shadow = getShadow(document)!;
    expect(shadow.querySelector(".backdrop")).toBeNull();

    document.removeEventListener(DOM_EVENTS.quizCancel, handler);
  });

  it("dismiss button on error emits quiz-cancel", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    const cancelEvents: QuizCancelEventDetail[] = [];
    const handler = (e: Event): void => {
      cancelEvents.push((e as CustomEvent).detail as QuizCancelEventDetail);
    };
    document.addEventListener(DOM_EVENTS.quizCancel, handler);

    fireQuizRequest(document, "req-err");
    fireQuizError(document, "req-err", "boom");

    const shadow = getShadow(document)!;
    shadow.querySelector<HTMLButtonElement>(".btn-secondary")!.click();

    expect(cancelEvents).toHaveLength(1);
    expect(cancelEvents[0]!.requestId).toBe("req-err");

    document.removeEventListener(DOM_EVENTS.quizCancel, handler);
  });

  // 11. Idempotent mount: second quiz-request does not double-mount
  it("does not mount a second host element on a second quiz-request", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document, "req-1");
    fireQuizRequest(document, "req-2");

    const hosts = document.querySelectorAll("[data-lgtm-modal-host]");
    expect(hosts.length).toBe(1);
  });

  // 12. Shadow DOM isolation: modal styles do not bleed to the document
  it("applies styles inside the shadow root, not the document", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);

    // No <style> elements in the document head.
    const docStyles = document.querySelectorAll("head style");
    const lgtmStyles = Array.from(docStyles).filter(
      (s) => s.textContent?.includes("lgtm-fadein"),
    );
    expect(lgtmStyles.length).toBe(0);

    // The style IS inside the shadow root.
    const shadow = getShadow(document)!;
    const shadowStyles = shadow.querySelectorAll("style");
    const hasCss = Array.from(shadowStyles).some(
      (s) => s.textContent?.includes("lgtm-fadein"),
    );
    expect(hasCss).toBe(true);
  });

  // 13. User-controlled text rendered via textContent (XSS safety)
  it("renders LLM-generated question text via textContent only", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    const xssAttempt = '<img src=x onerror="window.__xss=true">';
    const maliciousDetail: QuizResultEventDetail = {
      requestId: "req-xss",
      outcome: {
        kind: "quiz-ready",
        quiz: {
          id: "quiz-xss",
          questions: [
            {
              type: "multiple-choice",
              id: "q1",
              prompt: xssAttempt,
              choices: [{ id: "a", label: xssAttempt }],
            },
          ],
        },
      },
    };

    emitDOMEvent(document, DOM_EVENTS.quizRequest, makeQuizRequestDetail("req-xss"));
    emitDOMEvent(document, DOM_EVENTS.quizResult, maliciousDetail);

    const shadow = getShadow(document)!;
    // The img tag must NOT have been created as an element.
    expect(shadow.querySelector("img")).toBeNull();
    // The text content must be present as-is (escaped, not executed).
    const prompt = shadow.querySelector(".question-prompt");
    expect(prompt?.textContent).toBe(xssAttempt);
  });

  // 14. Cancel button in loading state emits quiz-cancel
  it("cancel button in loading state emits quiz-cancel and closes modal", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    const cancelEvents: QuizCancelEventDetail[] = [];
    const handler = (e: Event): void => {
      cancelEvents.push((e as CustomEvent).detail as QuizCancelEventDetail);
    };
    document.addEventListener(DOM_EVENTS.quizCancel, handler);

    fireQuizRequest(document, "req-cancel-loading");

    const shadow = getShadow(document)!;
    const cancelBtn = shadow.querySelector<HTMLButtonElement>(".btn-secondary");
    expect(cancelBtn).not.toBeNull();
    cancelBtn!.click();

    expect(cancelEvents).toHaveLength(1);
    expect(cancelEvents[0]!.requestId).toBe("req-cancel-loading");
    expect(shadow.querySelector(".backdrop")).toBeNull();

    document.removeEventListener(DOM_EVENTS.quizCancel, handler);
  });

  // 15. data-testid contract (ADR-19 §7) — all five attributes must be present
  it("sets data-testid='lgtm-buzzer-quiz-modal' on the modal host element", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);

    const host = document.querySelector("[data-lgtm-modal-host]");
    expect(host).not.toBeNull();
    expect(host!.getAttribute("data-testid")).toBe("lgtm-buzzer-quiz-modal");
  });

  it("sets data-question on each question container and data-choice on each radio", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document); // transitions to quiz-active with 2 questions

    const shadow = getShadow(document)!;

    // data-question attributes
    const q1Block = shadow.querySelector("[data-question='q1']");
    const q2Block = shadow.querySelector("[data-question='q2']");
    expect(q1Block).not.toBeNull();
    expect(q2Block).not.toBeNull();

    // data-choice attributes inside q1
    const c1Radio = q1Block!.querySelector("[data-choice='a']");
    const c2Radio = q1Block!.querySelector("[data-choice='b']");
    expect(c1Radio).not.toBeNull();
    expect(c2Radio).not.toBeNull();
  });

  it("sets data-testid='lgtm-buzzer-quiz-submit' on the submit button in quiz-active state", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    const submitBtn = shadow.querySelector("[data-testid='lgtm-buzzer-quiz-submit']");
    expect(submitBtn).not.toBeNull();
    expect(submitBtn!.tagName.toLowerCase()).toBe("button");
  });

  it("sets data-testid='lgtm-buzzer-quiz-cancel' on the cancel button in loading state", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document); // loading state

    const shadow = getShadow(document)!;
    const cancelBtn = shadow.querySelector("[data-testid='lgtm-buzzer-quiz-cancel']");
    expect(cancelBtn).not.toBeNull();
    expect(cancelBtn!.tagName.toLowerCase()).toBe("button");
  });

  it("sets data-testid='lgtm-buzzer-quiz-cancel' on the cancel button in quiz-active state", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document); // quiz-active state

    const shadow = getShadow(document)!;
    const cancelBtn = shadow.querySelector("[data-testid='lgtm-buzzer-quiz-cancel']");
    expect(cancelBtn).not.toBeNull();
    expect(cancelBtn!.tagName.toLowerCase()).toBe("button");
  });

  beforeEach(() => {
    // Ensure a fresh document.body for each test.
    document.body.innerHTML = "";
  });
});
