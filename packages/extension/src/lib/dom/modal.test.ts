import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createQuizModal } from "./modal.js";
import {
  DOM_EVENTS,
  emitDOMEvent,
  type QuizRequestEventDetail,
  type QuizResultEventDetail,
  type QuizSubmitEventDetail,
  type QuizCancelEventDetail,
  type QuizRetryEventDetail,
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
  reason: "internal" | "missing-credentials" = "internal",
): void => {
  const detail: QuizResultEventDetail = {
    requestId,
    outcome: { kind: "error", reason, message },
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

/** Clicks the Next button if visible. */
const clickNext = (shadow: ShadowRoot): void => {
  const next = shadow.querySelector<HTMLButtonElement>(
    "[data-testid='lgtm-buzzer-quiz-next']",
  );
  if (next !== null && !next.hidden) next.click();
};

/**
 * Walks the stepper to the last question by selecting the first choice on
 * each step except the last. Caller still needs to selectFirstChoice on the
 * last question and click Submit.
 */
const advanceToLastQuestion = (
  shadow: ShadowRoot,
  totalQuestions: number,
): void => {
  for (let i = 0; i < totalQuestions - 1; i++) {
    selectFirstChoice(shadow, i);
    clickNext(shadow);
  }
};

// ---------------------------------------------------------------------------
// Tests — Original backward-compat suite (ADR-18, ADR-19, ADR-23)
// ---------------------------------------------------------------------------

describe("createQuizModal", () => {
  let dispose: (() => void) | null = null;

  afterEach(() => {
    dispose?.();
    dispose = null;
    document
      .querySelectorAll("[data-lgtm-modal-host]")
      .forEach((n) => n.remove());
  });

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  // 1. Mount on first quiz-request event
  it("mounts the modal host on the first quiz-request event", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    expect(document.querySelector("[data-lgtm-modal-host]")).toBeNull();

    fireQuizRequest(document);

    expect(document.querySelector("[data-lgtm-modal-host]")).not.toBeNull();
  });

  // 2. Loading / generating state shown immediately on quiz-request
  it("shows a generating state (spinner) immediately after quiz-request", () => {
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
    // In ADR-24 state machine, quiz-active is now "ready" and uses <fieldset>
    const fieldsets = shadow!.querySelectorAll("fieldset");
    expect(fieldsets.length).toBe(2);
  });

  // 4. Radio buttons grouped per question (via <fieldset>)
  it("groups radio buttons by question using unique name attributes inside fieldsets", () => {
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

    // Step through the 2-question quiz: answer + Next on Q1, answer on Q2,
    // then Submit appears.
    advanceToLastQuestion(shadow, 2);
    selectFirstChoice(shadow, 1);

    const submitBtn = shadow.querySelector<HTMLButtonElement>(
      "[data-testid='lgtm-buzzer-quiz-submit']",
    );
    expect(submitBtn).not.toBeNull();
    expect(submitBtn!.hidden).toBe(false);
    expect(submitBtn!.disabled).toBe(false);
    submitBtn!.click();

    expect(receivedSubmits).toHaveLength(1);
    const submitted = receivedSubmits[0]!;
    expect(submitted.requestId).toBe("req-1");
    expect(submitted.quizId).toBe("quiz-1");
    expect(submitted.answers).toHaveLength(2);
    expect(submitted.answers[0]!.chosenChoiceId).toBe("a");

    document.removeEventListener(DOM_EVENTS.quizSubmit, cleanup as unknown as EventListener);
  });

  // 6. Stepper: Next disabled until current question answered;
  //    Submit hidden until last question reached.
  it("Next/Submit are gated on the current question's answer (stepper)", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    const nextBtn = shadow.querySelector<HTMLButtonElement>(
      "[data-testid='lgtm-buzzer-quiz-next']",
    );
    const submitBtn = shadow.querySelector<HTMLButtonElement>(
      "[data-testid='lgtm-buzzer-quiz-submit']",
    );
    expect(nextBtn).not.toBeNull();
    expect(submitBtn).not.toBeNull();

    // Initial state: on Q1 of 2. Next visible but disabled; Submit hidden.
    expect(nextBtn!.hidden).toBe(false);
    expect(nextBtn!.disabled).toBe(true);
    expect(submitBtn!.hidden).toBe(true);

    // Answer Q1: Next enables, Submit still hidden.
    selectFirstChoice(shadow, 0);
    expect(nextBtn!.disabled).toBe(false);
    expect(submitBtn!.hidden).toBe(true);

    // Advance to Q2 — Next swaps for Submit; Submit gated on Q2 answer.
    nextBtn!.click();
    expect(nextBtn!.hidden).toBe(true);
    expect(submitBtn!.hidden).toBe(false);
    expect(submitBtn!.disabled).toBe(true);

    selectFirstChoice(shadow, 1);
    expect(submitBtn!.disabled).toBe(false);
  });

  // 7. quiz-passed outcome shows pass result
  it("shows pass result banner on quiz-passed outcome", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    advanceToLastQuestion(shadow, 2);
    selectFirstChoice(shadow, 1);
    shadow.querySelector<HTMLButtonElement>(
      "[data-testid='lgtm-buzzer-quiz-submit']",
    )!.click();

    fireQuizPassed(document);

    const shadow2 = getShadow(document)!;
    const backdrop = shadow2.querySelector(".backdrop");
    expect(backdrop).not.toBeNull();
    const passBanner = shadow2.querySelector(".result-pass");
    expect(passBanner).not.toBeNull();
  });

  // 7b. quiz-passed dismiss button closes the modal
  it("dismiss button on pass result closes the modal", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizPassed(document);

    const shadow = getShadow(document)!;
    const dismissBtn = shadow.querySelector<HTMLButtonElement>(".btn-secondary");
    expect(dismissBtn).not.toBeNull();
    dismissBtn!.click();

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
    advanceToLastQuestion(shadow, 2);
    selectFirstChoice(shadow, 1);
    shadow.querySelector<HTMLButtonElement>(
      "[data-testid='lgtm-buzzer-quiz-submit']",
    )!.click();

    fireQuizFailed(document, "req-1", /* withPerQuestion */ true);

    const shadow2 = getShadow(document)!;
    const failBanner = shadow2.querySelector(".result-fail");
    expect(failBanner).not.toBeNull();

    const perQuestionItems = shadow2.querySelectorAll(".per-question-item");
    expect(perQuestionItems.length).toBe(2);

    perQuestionItems.forEach((item) => {
      expect(item.querySelector(".pq-icon")?.textContent).toBe("❌");
    });
  });

  // 9. error outcome shows error title/body + dismiss button
  it("shows error title, body, and dismiss button on error outcome", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizError(document, "req-1", "host did not respond");

    const shadow = getShadow(document)!;
    const errorBanner = shadow.querySelector(".result-error");
    expect(errorBanner).not.toBeNull();

    // error-classes.ts maps "host did not respond" → host-timeout → "Host didn't respond"
    const errorTitle = shadow.querySelector(".error-title");
    expect(errorTitle).not.toBeNull();
    expect(errorTitle!.textContent).toContain("Host didn't respond");

    const dismissBtn = shadow.querySelector<HTMLButtonElement>(".btn-secondary");
    expect(dismissBtn).not.toBeNull();
  });

  // 10. Esc key emits quiz-cancel and closes modal (non-idle, non-passed states)
  it("Esc key emits quiz-cancel and closes the modal in generating state", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    const cancelEvents: QuizCancelEventDetail[] = [];
    const handler = (e: Event): void => {
      cancelEvents.push((e as CustomEvent).detail as QuizCancelEventDetail);
    };
    document.addEventListener(DOM_EVENTS.quizCancel, handler);

    fireQuizRequest(document, "req-esc");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(cancelEvents).toHaveLength(1);
    expect(cancelEvents[0]!.requestId).toBe("req-esc");

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

  // 11. Idempotent mount
  it("does not mount a second host element on a second quiz-request", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document, "req-1");
    fireQuizRequest(document, "req-2");

    const hosts = document.querySelectorAll("[data-lgtm-modal-host]");
    expect(hosts.length).toBe(1);
  });

  // 12. Shadow DOM isolation
  it("applies styles inside the shadow root, not the document", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);

    const docStyles = document.querySelectorAll("head style");
    const lgtmStyles = Array.from(docStyles).filter(
      (s) => s.textContent?.includes("lgtm-fadein"),
    );
    expect(lgtmStyles.length).toBe(0);

    const shadow = getShadow(document)!;
    const shadowStyles = shadow.querySelectorAll("style");
    const hasCss = Array.from(shadowStyles).some(
      (s) => s.textContent?.includes("lgtm-fadein"),
    );
    expect(hasCss).toBe(true);
  });

  // 13. XSS safety (textContent only)
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
    expect(shadow.querySelector("img")).toBeNull();
    const legend = shadow.querySelector("legend");
    expect(legend?.textContent).toBe(xssAttempt);
  });

  // 14. Cancel button in generating state emits quiz-cancel
  it("cancel button in generating state emits quiz-cancel and closes modal", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    const cancelEvents: QuizCancelEventDetail[] = [];
    const handler = (e: Event): void => {
      cancelEvents.push((e as CustomEvent).detail as QuizCancelEventDetail);
    };
    document.addEventListener(DOM_EVENTS.quizCancel, handler);

    fireQuizRequest(document, "req-cancel-generating");

    const shadow = getShadow(document)!;
    const cancelBtn = shadow.querySelector<HTMLButtonElement>(".btn-secondary");
    expect(cancelBtn).not.toBeNull();
    cancelBtn!.click();

    expect(cancelEvents).toHaveLength(1);
    expect(cancelEvents[0]!.requestId).toBe("req-cancel-generating");
    expect(shadow.querySelector(".backdrop")).toBeNull();

    document.removeEventListener(DOM_EVENTS.quizCancel, handler);
  });

  // 15. data-testid attributes (ADR-19 §7)
  it("sets data-testid='lgtm-buzzer-quiz-modal' on the modal host element", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);

    const host = document.querySelector("[data-lgtm-modal-host]");
    expect(host).not.toBeNull();
    expect(host!.getAttribute("data-testid")).toBe("lgtm-buzzer-quiz-modal");
  });

  it("sets data-question on each fieldset and data-choice on each radio", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;

    const q1Block = shadow.querySelector("[data-question='q1']");
    const q2Block = shadow.querySelector("[data-question='q2']");
    expect(q1Block).not.toBeNull();
    expect(q2Block).not.toBeNull();

    const c1Radio = q1Block!.querySelector("[data-choice='a']");
    const c2Radio = q1Block!.querySelector("[data-choice='b']");
    expect(c1Radio).not.toBeNull();
    expect(c2Radio).not.toBeNull();
  });

  it("sets data-testid='lgtm-buzzer-quiz-submit' on the submit button in ready state", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    const submitBtn = shadow.querySelector("[data-testid='lgtm-buzzer-quiz-submit']");
    expect(submitBtn).not.toBeNull();
    expect(submitBtn!.tagName.toLowerCase()).toBe("button");
  });

  it("sets data-testid='lgtm-buzzer-quiz-cancel' on the cancel button in generating state", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);

    const shadow = getShadow(document)!;
    const cancelBtn = shadow.querySelector("[data-testid='lgtm-buzzer-quiz-cancel']");
    expect(cancelBtn).not.toBeNull();
    expect(cancelBtn!.tagName.toLowerCase()).toBe("button");
  });

  it("sets data-testid='lgtm-buzzer-quiz-cancel' on the cancel button in ready state", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    const cancelBtn = shadow.querySelector("[data-testid='lgtm-buzzer-quiz-cancel']");
    expect(cancelBtn).not.toBeNull();
    expect(cancelBtn!.tagName.toLowerCase()).toBe("button");
  });

  // ADR-23 backward-compat: missing-credentials → openOptionsPage
  it("missing-credentials error renders 'Open options' CTA button (ADR-23 backward-compat)", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document, "req-mc");
    fireQuizError(document, "req-mc", "credentials required", "missing-credentials");

    const shadow = getShadow(document)!;
    // ADR-24: the CTA button now uses data-testid="lgtm-buzzer-configure-options"
    const configBtn = shadow.querySelector("[data-testid='lgtm-buzzer-configure-options']");
    expect(configBtn).not.toBeNull();
    expect(configBtn!.textContent).toContain("Open options");
  });

  // ADR-23: clicking the "Open options" CTA emits lgtm-buzzer:open-options event
  it("clicking open-options CTA emits lgtm-buzzer:open-options event", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    const openOptionsEvents: Event[] = [];
    const handler = (e: Event): void => { openOptionsEvents.push(e); };
    document.addEventListener("lgtm-buzzer:open-options", handler);

    fireQuizRequest(document, "req-oo");
    fireQuizError(document, "req-oo", "credentials required", "missing-credentials");

    const shadow = getShadow(document)!;
    const configBtn = shadow.querySelector<HTMLButtonElement>(
      "[data-testid='lgtm-buzzer-configure-options']",
    );
    expect(configBtn).not.toBeNull();
    configBtn!.click();

    expect(openOptionsEvents).toHaveLength(1);

    document.removeEventListener("lgtm-buzzer:open-options", handler);
  });
});

// ---------------------------------------------------------------------------
// Tests — ADR-24 new state machine + accessibility + error UX
// ---------------------------------------------------------------------------

describe("createQuizModal — ADR-24 state machine", () => {
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
    document.querySelectorAll("[data-lgtm-modal-host]").forEach((n) => n.remove());
  });

  // 1. idle → generating: skeleton + spinner + Cancel button
  it("1. idle→generating shows skeleton + spinner + Cancel button", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);

    const shadow = getShadow(document)!;
    expect(shadow.querySelector(".spinner")).not.toBeNull();
    expect(shadow.querySelector(".skeleton-group")).not.toBeNull();
    expect(shadow.querySelector("[data-testid='lgtm-buzzer-quiz-cancel']")).not.toBeNull();
  });

  // 2. Generating→ready: fieldsets rendered
  it("2. generating→ready renders fieldsets with legends", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    const fieldsets = shadow.querySelectorAll("fieldset");
    expect(fieldsets.length).toBe(2);

    const legends = shadow.querySelectorAll("legend");
    expect(legends.length).toBe(2);
    expect(legends[0]?.textContent).toBe("Question 1: What changed?");
  });

  // 3. Ready→submitting: spinner shown, Cancel present
  it("3. ready→submitting shows spinner and Cancel button in submitting state", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    selectFirstChoice(shadow, 0);
    selectFirstChoice(shadow, 1);
    shadow.querySelector<HTMLButtonElement>("[data-testid='lgtm-buzzer-quiz-submit']")!.click();

    const shadow2 = getShadow(document)!;
    expect(shadow2.querySelector(".spinner")).not.toBeNull();
    expect(shadow2.querySelector("[data-testid='lgtm-buzzer-quiz-cancel']")).not.toBeNull();
  });

  // 4. Submitting→passed: green banner
  it("4. submitting→passed: green banner visible", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizPassed(document);

    const shadow = getShadow(document)!;
    expect(shadow.querySelector(".result-pass")).not.toBeNull();
  });

  // 5. Submitting→failed: red banner + Try Again button
  it("5. submitting→failed: red banner and Try Again button", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizFailed(document);

    const shadow = getShadow(document)!;
    expect(shadow.querySelector(".result-fail")).not.toBeNull();
    const tryAgainBtn = shadow.querySelector("[data-testid='lgtm-buzzer-quiz-retry']");
    expect(tryAgainBtn).not.toBeNull();
    expect(tryAgainBtn!.textContent).toContain("Try Again");
  });

  // 6. Failed→generating: Try Again emits quiz-retry
  it("6. failed→generating: Try Again click emits quiz-retry", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    const retryEvents: QuizRetryEventDetail[] = [];
    const handler = (e: Event): void => {
      retryEvents.push((e as CustomEvent).detail as QuizRetryEventDetail);
    };
    document.addEventListener(DOM_EVENTS.quizRetry, handler);

    fireQuizRequest(document, "req-retry");
    fireQuizFailed(document, "req-retry");

    const shadow = getShadow(document)!;
    shadow.querySelector<HTMLButtonElement>("[data-testid='lgtm-buzzer-quiz-retry']")!.click();

    expect(retryEvents).toHaveLength(1);
    expect(retryEvents[0]!.requestId).toBe("req-retry");

    document.removeEventListener(DOM_EVENTS.quizRetry, handler);
  });

  // 7. Error missing-credentials → "Credentials required" + Open options CTA
  it("7. missing-credentials error → 'Credentials required' title + Open options", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document, "req-mc");
    fireQuizError(document, "req-mc", "credentials not found", "missing-credentials");

    const shadow = getShadow(document)!;
    const title = shadow.querySelector(".error-title");
    expect(title?.textContent).toBe("Credentials required");
    expect(shadow.querySelector("[data-testid='lgtm-buzzer-configure-options']")).not.toBeNull();
  });

  // 8. Error host-unreachable (synthesised from "host disconnected") → install-host CTA
  it("8. 'host disconnected' message → 'Native host not installed' + Install host", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document, "req-unreachable");
    fireQuizError(document, "req-unreachable", "host disconnected", "internal");

    const shadow = getShadow(document)!;
    const title = shadow.querySelector(".error-title");
    expect(title?.textContent).toBe("Native host not installed");
    const installLink = shadow.querySelector("[data-testid='lgtm-buzzer-install-host']");
    expect(installLink).not.toBeNull();
  });

  // 9. Error host-timeout (synthesised from "host did not respond") → Retry CTA
  it("9. 'host did not respond' message → 'Host didn't respond' + Retry", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document, "req-timeout");
    fireQuizError(document, "req-timeout", "host did not respond", "internal");

    const shadow = getShadow(document)!;
    const title = shadow.querySelector(".error-title");
    expect(title?.textContent).toBe("Host didn't respond");
    const retryBtn = shadow.querySelector("[data-testid='lgtm-buzzer-quiz-retry']");
    expect(retryBtn).not.toBeNull();
    expect(retryBtn!.textContent).toBe("Retry");
  });

  // 10. Error version-mismatch → "Protocol version mismatch" + Install host
  it("10. version-mismatch → 'Protocol version mismatch' + Install host", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document, "req-vm");
    const detail: QuizResultEventDetail = {
      requestId: "req-vm",
      outcome: { kind: "error", reason: "version-mismatch", message: "version mismatch" },
    };
    emitDOMEvent(document, DOM_EVENTS.quizResult, detail);

    const shadow = getShadow(document)!;
    const title = shadow.querySelector(".error-title");
    expect(title?.textContent).toBe("Protocol version mismatch");
    const installLink = shadow.querySelector("[data-testid='lgtm-buzzer-install-host']");
    expect(installLink).not.toBeNull();
  });

  // 11. aria-live region announces "Generating quiz" on entering generating
  it("11. aria-live region announces generating state", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);

    const shadow = getShadow(document)!;
    const liveRegion = shadow.querySelector("[aria-live='polite']");
    expect(liveRegion).not.toBeNull();
    expect(liveRegion!.textContent).toContain("Generating quiz");
  });

  // 12. aria-live announces "Quiz ready, 2 questions" on entering ready
  it("12. aria-live announces quiz ready with question count", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    const liveRegion = shadow.querySelector("[aria-live='polite']");
    expect(liveRegion).not.toBeNull();
    expect(liveRegion!.textContent).toContain("Quiz ready");
    expect(liveRegion!.textContent).toContain("2 question");
  });

  // 13. Each question in fieldset with legend
  it("13. each question is wrapped in <fieldset> with a <legend> containing the prompt", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    const fieldsets = shadow.querySelectorAll("fieldset");
    expect(fieldsets.length).toBe(2);

    fieldsets.forEach((fs, i) => {
      const legend = fs.querySelector("legend");
      expect(legend).not.toBeNull();
      expect(legend!.textContent).toBe(`Question ${i + 1}: What changed?`);
    });
  });

  // 14. aria-labelledby on backdrop points to h2
  it("14. aria-labelledby on backdrop points to modal title h2", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);

    const shadow = getShadow(document)!;
    const backdrop = shadow.querySelector(".backdrop");
    expect(backdrop).not.toBeNull();
    const labelId = backdrop!.getAttribute("aria-labelledby");
    expect(labelId).not.toBeNull();

    const heading = shadow.querySelector(`#${labelId}`);
    expect(heading).not.toBeNull();
    expect(heading!.tagName.toLowerCase()).toBe("h2");
  });

  // 15. Retry CTA in error state emits quiz-retry { requestId }
  it("15. Retry CTA in error state emits quiz-retry with requestId", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    const retryEvents: QuizRetryEventDetail[] = [];
    const handler = (e: Event): void => {
      retryEvents.push((e as CustomEvent).detail as QuizRetryEventDetail);
    };
    document.addEventListener(DOM_EVENTS.quizRetry, handler);

    fireQuizRequest(document, "req-retry-err");
    fireQuizError(document, "req-retry-err", "host did not respond", "internal");

    const shadow = getShadow(document)!;
    const retryBtn = shadow.querySelector<HTMLButtonElement>("[data-testid='lgtm-buzzer-quiz-retry']");
    expect(retryBtn).not.toBeNull();
    retryBtn!.click();

    expect(retryEvents).toHaveLength(1);
    expect(retryEvents[0]!.requestId).toBe("req-retry-err");

    document.removeEventListener(DOM_EVENTS.quizRetry, handler);
  });

  // 16. aria-busy=true in generating state, false in ready state
  it("16. aria-busy='true' in generating; 'false' in ready", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);

    let shadow = getShadow(document)!;
    let backdrop = shadow.querySelector(".backdrop");
    expect(backdrop?.getAttribute("aria-busy")).toBe("true");

    fireQuizReady(document);

    shadow = getShadow(document)!;
    backdrop = shadow.querySelector(".backdrop");
    expect(backdrop?.getAttribute("aria-busy")).toBe("false");
  });

  // 17. aria-busy=true in submitting
  it("17. aria-busy='true' in submitting state", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    selectFirstChoice(shadow, 0);
    selectFirstChoice(shadow, 1);
    shadow.querySelector<HTMLButtonElement>("[data-testid='lgtm-buzzer-quiz-submit']")!.click();

    const shadow2 = getShadow(document)!;
    const backdrop = shadow2.querySelector(".backdrop");
    expect(backdrop?.getAttribute("aria-busy")).toBe("true");
  });

  // 18. Esc in passed state closes WITHOUT emitting quiz-cancel
  it("18. Esc in passed state closes WITHOUT emitting quiz-cancel", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    const cancelEvents: QuizCancelEventDetail[] = [];
    const handler = (e: Event): void => {
      cancelEvents.push((e as CustomEvent).detail as QuizCancelEventDetail);
    };
    document.addEventListener(DOM_EVENTS.quizCancel, handler);

    fireQuizRequest(document, "req-passed-esc");
    fireQuizPassed(document, "req-passed-esc");

    // Verify we're in passed state.
    const shadow = getShadow(document)!;
    expect(shadow.querySelector(".result-pass")).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    // Should close the modal.
    const shadow2 = getShadow(document)!;
    expect(shadow2.querySelector(".backdrop")).toBeNull();

    // Must NOT have emitted quiz-cancel.
    expect(cancelEvents).toHaveLength(0);

    document.removeEventListener(DOM_EVENTS.quizCancel, handler);
  });

  // 19. Esc in error state emits quiz-cancel
  it("19. Esc in error state emits quiz-cancel", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    const cancelEvents: QuizCancelEventDetail[] = [];
    const handler = (e: Event): void => {
      cancelEvents.push((e as CustomEvent).detail as QuizCancelEventDetail);
    };
    document.addEventListener(DOM_EVENTS.quizCancel, handler);

    fireQuizRequest(document, "req-err-esc");
    fireQuizError(document, "req-err-esc", "boom");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(cancelEvents).toHaveLength(1);
    expect(cancelEvents[0]!.requestId).toBe("req-err-esc");

    document.removeEventListener(DOM_EVENTS.quizCancel, handler);
  });

  // 20. Cancel in submitting state (new) emits quiz-cancel
  it("20. Cancel button in submitting state emits quiz-cancel", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    const cancelEvents: QuizCancelEventDetail[] = [];
    const handler = (e: Event): void => {
      cancelEvents.push((e as CustomEvent).detail as QuizCancelEventDetail);
    };
    document.addEventListener(DOM_EVENTS.quizCancel, handler);

    fireQuizRequest(document, "req-sub-cancel");
    fireQuizReady(document, "req-sub-cancel");

    const shadow = getShadow(document)!;
    selectFirstChoice(shadow, 0);
    selectFirstChoice(shadow, 1);
    shadow.querySelector<HTMLButtonElement>("[data-testid='lgtm-buzzer-quiz-submit']")!.click();

    const shadow2 = getShadow(document)!;
    const cancelBtn = shadow2.querySelector<HTMLButtonElement>("[data-testid='lgtm-buzzer-quiz-cancel']");
    expect(cancelBtn).not.toBeNull();
    cancelBtn!.click();

    expect(cancelEvents).toHaveLength(1);
    expect(cancelEvents[0]!.requestId).toBe("req-sub-cancel");

    document.removeEventListener(DOM_EVENTS.quizCancel, handler);
  });

  // 21. aria-live announces "Quiz passed" on passed state
  it("21. aria-live announces 'Quiz passed' in passed state", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizPassed(document);

    const shadow = getShadow(document)!;
    const liveRegion = shadow.querySelector("[aria-live='polite']");
    expect(liveRegion?.textContent).toContain("Quiz passed");
  });

  // 22. aria-live announces error title in error state
  it("22. aria-live announces 'Error: <title>' in error state", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizError(document, "req-1", "host did not respond");

    const shadow = getShadow(document)!;
    const liveRegion = shadow.querySelector("[aria-live='polite']");
    expect(liveRegion?.textContent).toContain("Error:");
    expect(liveRegion?.textContent).toContain("Host didn't respond");
  });

  // 23. install-host CTA has correct testid
  it("23. install-host CTA has data-testid='lgtm-buzzer-install-host'", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document, "req-install");
    fireQuizError(document, "req-install", "host disconnected", "internal");

    const shadow = getShadow(document)!;
    const installLink = shadow.querySelector("[data-testid='lgtm-buzzer-install-host']");
    expect(installLink).not.toBeNull();
    expect(installLink!.tagName.toLowerCase()).toBe("a");
    expect(installLink!.getAttribute("href")).toContain("github.com/tibtof/lgtm-buzzer");
  });

  // ---- Stepper behaviour (new) -----------------------------------------

  // 24. Only the current question is visible
  it("24. stepper: only the current question fieldset is visible", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    const fieldsets = shadow.querySelectorAll<HTMLFieldSetElement>("fieldset");
    expect(fieldsets.length).toBe(2);
    expect(fieldsets[0]!.hidden).toBe(false);
    expect(fieldsets[1]!.hidden).toBe(true);

    selectFirstChoice(shadow, 0);
    clickNext(shadow);

    expect(fieldsets[0]!.hidden).toBe(true);
    expect(fieldsets[1]!.hidden).toBe(false);
  });

  // 25. Progress indicator updates
  it("25. stepper: progress indicator shows 'Question i of n'", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    const progress = shadow.querySelector("[data-testid='lgtm-buzzer-quiz-progress']");
    expect(progress).not.toBeNull();
    expect(progress!.textContent).toBe("Question 1 of 2");

    selectFirstChoice(shadow, 0);
    clickNext(shadow);
    expect(progress!.textContent).toBe("Question 2 of 2");
  });

  // 26. Answers lock on advance
  it("26. stepper: an answered question's radios lock when you click Next", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    selectFirstChoice(shadow, 0);
    clickNext(shadow);

    const q0Radios = shadow.querySelectorAll<HTMLInputElement>(
      "input[name='lgtm-q-0']",
    );
    for (const r of q0Radios) {
      expect(r.disabled).toBe(true);
    }
    const q0Fieldset = shadow.querySelector<HTMLFieldSetElement>(
      "fieldset[data-question-index='0']",
    );
    expect(q0Fieldset?.getAttribute("data-locked")).toBe("true");
  });

  // 27. Prev navigates back without unlocking
  it("27. stepper: Prev navigates back; previous answer is preserved and read-only", () => {
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    const shadow = getShadow(document)!;
    selectFirstChoice(shadow, 0);
    clickNext(shadow);

    // On Q2; click Prev.
    const prev = shadow.querySelector<HTMLButtonElement>(
      "[data-testid='lgtm-buzzer-quiz-prev']",
    );
    expect(prev).not.toBeNull();
    expect(prev!.disabled).toBe(false);
    prev!.click();

    // Q1 visible again; first radio still checked AND still disabled.
    const q0First = shadow.querySelector<HTMLInputElement>("input[name='lgtm-q-0']");
    expect(q0First).not.toBeNull();
    expect(q0First!.checked).toBe(true);
    expect(q0First!.disabled).toBe(true);

    // Prev disabled on Q1.
    expect(prev!.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — Quiz stats UI (timer, ETA bar, score header, stats footer)
// ---------------------------------------------------------------------------

/** Fake StatsStore builder for modal tests. */
const makeStatsStore = (overrides?: {
  medianMs?: number | null;
  passRate?: { passed: number; total: number } | null;
  recordGeneration?: () => Promise<void>;
  recordQuiz?: () => Promise<void>;
}) => ({
  recordGeneration: overrides?.recordGeneration ?? (() => Promise.resolve()),
  recordQuiz: overrides?.recordQuiz ?? (() => Promise.resolve()),
  getMedianGenerationMs: () => Promise.resolve(overrides?.medianMs ?? null),
  getRecentPassRate: () => Promise.resolve(overrides?.passRate ?? null),
});

describe("createQuizModal — stats UI", () => {
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    dispose?.();
    dispose = null;
    document.querySelectorAll("[data-lgtm-modal-host]").forEach((n) => n.remove());
  });

  // 28. Timer element renders in generating state
  it("28. stats: generation timer element is rendered in generating state", () => {
    const modal = createQuizModal({
      doc: document,
      stats: makeStatsStore(),
      adapterId: "claude-cli",
    });
    dispose = modal.start();

    fireQuizRequest(document);

    const shadow = getShadow(document)!;
    const timer = shadow.querySelector("[data-testid='lgtm-buzzer-generation-timer']");
    expect(timer).not.toBeNull();
    expect(timer!.tagName.toLowerCase()).toBe("time");
  });

  // 29. Timer text updates when fake time advances
  it("29. stats: generation timer ticks every 250ms", async () => {
    const modal = createQuizModal({
      doc: document,
      stats: makeStatsStore(),
      adapterId: "claude-cli",
    });
    dispose = modal.start();

    fireQuizRequest(document);

    const shadow = getShadow(document)!;
    const timer = shadow.querySelector<HTMLElement>(
      "[data-testid='lgtm-buzzer-generation-timer']",
    );
    expect(timer).not.toBeNull();

    // Initial tick shows 0s.
    expect(timer!.textContent).toBe("0s");

    // Advance 1 second → timer shows 1s.
    vi.advanceTimersByTime(1000);
    expect(timer!.textContent).toBe("1s");

    // Advance 4 more seconds → 5s.
    vi.advanceTimersByTime(4000);
    expect(timer!.textContent).toBe("5s");
  });

  // 30. ETA bar absent when no history (fewer than 3 samples)
  it("30. stats: ETA bar is absent when no history (medianMs = null)", () => {
    const modal = createQuizModal({
      doc: document,
      stats: makeStatsStore({ medianMs: null }),
      adapterId: "claude-cli",
    });
    dispose = modal.start();

    fireQuizRequest(document);

    const shadow = getShadow(document)!;
    // ETA bar should not be present yet (median is fetched async, and it's null)
    const etaBar = shadow.querySelector("[data-testid='lgtm-buzzer-generation-eta']");
    expect(etaBar).toBeNull();
  });

  // 31. ETA bar renders when history exists
  it("31. stats: ETA bar renders when medianMs is available", async () => {
    const modal = createQuizModal({
      doc: document,
      stats: makeStatsStore({ medianMs: 10000 }),
      adapterId: "claude-cli",
    });
    dispose = modal.start();

    fireQuizRequest(document);

    // Allow the async median Promise to resolve (1ms is enough for microtasks).
    await vi.advanceTimersByTimeAsync(1);

    const shadow = getShadow(document)!;
    const etaBar = shadow.querySelector("[data-testid='lgtm-buzzer-generation-eta']");
    expect(etaBar).not.toBeNull();
    expect(etaBar!.tagName.toLowerCase()).toBe("progress");
  });

  // 32. ETA bar value is capped at 95%
  it("32. stats: ETA bar value never exceeds 95% of max", async () => {
    const medianMs = 10000;
    const modal = createQuizModal({
      doc: document,
      stats: makeStatsStore({ medianMs }),
      adapterId: "claude-cli",
    });
    dispose = modal.start();

    fireQuizRequest(document);

    // Resolve the async median fetch, then advance well past the median.
    await vi.advanceTimersByTimeAsync(1);

    // Advance time well past the median (20 seconds).
    vi.advanceTimersByTime(20000);

    const shadow = getShadow(document)!;
    const etaBar = shadow.querySelector<HTMLProgressElement>(
      "[data-testid='lgtm-buzzer-generation-eta']",
    );
    expect(etaBar).not.toBeNull();
    // value should be <= 95% of max.
    const fraction = etaBar!.value / etaBar!.max;
    expect(fraction).toBeLessThanOrEqual(0.95);
  });

  // 33. Score header shows "X of N correct" on pass
  it("33. stats: score header shows 'X of N correct' on quiz-passed", () => {
    const modal = createQuizModal({
      doc: document,
      stats: makeStatsStore(),
      adapterId: "claude-cli",
    });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizPassed(document); // passes with correct:2, total:2

    const shadow = getShadow(document)!;
    const header = shadow.querySelector("[data-testid='lgtm-buzzer-score-header']");
    expect(header).not.toBeNull();
    expect(header!.textContent).toBe("2 of 2 correct");
  });

  // 34. Score header shows "X of N correct" on fail
  it("34. stats: score header shows 'X of N correct' on quiz-failed", () => {
    const modal = createQuizModal({
      doc: document,
      stats: makeStatsStore(),
      adapterId: "claude-cli",
    });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizFailed(document); // fails with correct:0, total:2

    const shadow = getShadow(document)!;
    const header = shadow.querySelector("[data-testid='lgtm-buzzer-score-header']");
    expect(header).not.toBeNull();
    expect(header!.textContent).toBe("0 of 2 correct");
  });

  // 35. Stats footer renders on pass result
  it("35. stats: stats footer is rendered on quiz-passed", () => {
    const modal = createQuizModal({
      doc: document,
      stats: makeStatsStore(),
      adapterId: "claude-cli",
    });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizPassed(document);

    const shadow = getShadow(document)!;
    const footer = shadow.querySelector("[data-testid='lgtm-buzzer-stats-footer']");
    expect(footer).not.toBeNull();
  });

  // 36. Stats footer contains adapter badge
  it("36. stats: stats footer shows the adapter id", () => {
    const modal = createQuizModal({
      doc: document,
      stats: makeStatsStore(),
      adapterId: "claude-cli",
    });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizPassed(document);

    const shadow = getShadow(document)!;
    const footer = shadow.querySelector("[data-testid='lgtm-buzzer-stats-footer']");
    expect(footer).not.toBeNull();
    expect(footer!.textContent).toContain("claude-cli");
  });

  // 37. Stats footer shows pass rate when available
  it("37. stats: stats footer shows pass rate when available", async () => {
    const modal = createQuizModal({
      doc: document,
      stats: makeStatsStore({ passRate: { passed: 7, total: 10 } }),
      adapterId: "claude-cli",
    });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizPassed(document);

    // Allow async pass-rate fetch to resolve (1ms is enough for microtasks).
    await vi.advanceTimersByTimeAsync(1);

    const shadow = getShadow(document)!;
    const footer = shadow.querySelector("[data-testid='lgtm-buzzer-stats-footer']");
    expect(footer).not.toBeNull();
    expect(footer!.textContent).toContain("7/10 passed");
  });

  // 38. Stats footer also renders on quiz-failed
  it("38. stats: stats footer is rendered on quiz-failed", () => {
    const modal = createQuizModal({
      doc: document,
      stats: makeStatsStore(),
      adapterId: "claude-cli",
    });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizFailed(document);

    const shadow = getShadow(document)!;
    const footer = shadow.querySelector("[data-testid='lgtm-buzzer-stats-footer']");
    expect(footer).not.toBeNull();
    expect(footer!.textContent).toContain("claude-cli");
  });

  // 39. Modal without stats dep still renders result states correctly
  it("39. stats: modal works without stats dep (no score header / footer)", () => {
    // No stats dep passed — backward-compat check.
    const modal = createQuizModal({ doc: document });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizPassed(document);

    const shadow = getShadow(document)!;
    // Score header still renders (it only depends on result payload, not stats).
    const header = shadow.querySelector("[data-testid='lgtm-buzzer-score-header']");
    expect(header).not.toBeNull();
    // Stats footer still renders even without an explicit adapter id — it
    // falls back to the host-side default "claude-cli" per ADR-22.
    const footer = shadow.querySelector("[data-testid='lgtm-buzzer-stats-footer']");
    expect(footer).not.toBeNull();
    expect(footer!.textContent).toContain("claude-cli");
  });

  // 40. Timer is cleared when transitioning out of generating state
  it("40. stats: timer interval is cleared on transition away from generating", async () => {
    const modal = createQuizModal({
      doc: document,
      stats: makeStatsStore(),
      adapterId: "claude-cli",
    });
    dispose = modal.start();

    fireQuizRequest(document);
    fireQuizReady(document);

    // Timer element should be gone after transitioning to ready.
    const shadow = getShadow(document)!;
    const timer = shadow.querySelector("[data-testid='lgtm-buzzer-generation-timer']");
    expect(timer).toBeNull();
  });
});
