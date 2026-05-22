/**
 * Quiz modal for LGTM-Buzzer.
 *
 * Implements the state machine, accessibility, error UX, focus trap, and
 * aria-live announcements described in ADR-24.
 *
 * State machine (ADR-24 §Decision 1):
 *   idle → generating → ready → submitting → passed | failed | error
 *
 * Cancel during `generating` (Option A — ADR-24 §Decision 6):
 *   The modal emits `quiz-cancel` and transitions to `idle`. The host
 *   continues generating; its reply is eventually discarded by the CS.
 *   FOLLOW-UP: Implement Option B (quiz-cancel-request wire frame +
 *   host fiber cancellation) in a separate issue.
 *   See packages/extension/README.md for the a11y commitments and cancel note.
 */

import type { QuizDTO, QuizResultPayload } from "@lgtm-buzzer/protocol";
import {
  DOM_EVENTS,
  QuizRequestEventDetailSchema,
  QuizResultEventDetailSchema,
  emitDOMEvent,
  addDOMEventListener,
  type DOMEventLogger,
} from "./dom-events.js";
import { classifyError, errorClassToUI } from "./error-classes.js";
import { createFocusTrap } from "./focus-trap.js";
import type { FocusTrap } from "./focus-trap.js";

// DOM event name for "open options page" (ADR-23).
const OPEN_OPTIONS_EVENT = "lgtm-buzzer:open-options";

// ---------------------------------------------------------------------------
// State machine (ADR-24 §Decision 1)
// ---------------------------------------------------------------------------

/**
 * The internal state of the quiz modal.
 *
 * State transitions (ADR-24):
 *   idle → generating          (on quiz-request DOM event)
 *   generating → ready         (on outcome:quiz-ready)
 *   generating → error         (on outcome:error)
 *   generating → idle          (on Cancel button | Esc  → emits quiz-cancel)
 *   ready → submitting         (on Submit button with all questions answered)
 *   ready → idle               (on Cancel button | Esc  → emits quiz-cancel)
 *   submitting → passed        (on outcome:quiz-passed)
 *   submitting → failed        (on outcome:quiz-failed)
 *   submitting → error         (on outcome:error)
 *   submitting → idle          (on Esc → emits quiz-cancel)
 *   passed → idle              (on Dismiss button | Esc — NO quiz-cancel)
 *   failed → generating        (on Try Again button → emits quiz-retry)
 *   failed → idle              (on Dismiss button | Esc → emits quiz-cancel)
 *   error → generating         (on Retry CTA → emits quiz-retry)
 *   error → idle               (on Open Options CTA → emits quiz-cancel + open-options)
 *   error → idle               (on Install Host CTA → emits quiz-cancel)
 *   error → idle               (on Dismiss button | Esc → emits quiz-cancel)
 */
type ModalState =
  | { readonly kind: "idle" }
  | { readonly kind: "generating"; readonly requestId: string }
  | {
      readonly kind: "ready";
      readonly requestId: string;
      readonly quiz: QuizDTO;
    }
  | {
      readonly kind: "submitting";
      readonly requestId: string;
      readonly quiz: QuizDTO;
    }
  | {
      readonly kind: "passed";
      readonly requestId: string;
      readonly result: QuizResultPayload;
    }
  | {
      readonly kind: "failed";
      readonly requestId: string;
      readonly result: QuizResultPayload;
    }
  | {
      readonly kind: "error";
      readonly requestId: string;
      readonly reason: string;
      readonly message: string;
    };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const MODAL_CSS = `
  :host {
    all: initial;
    display: block;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  @media (prefers-reduced-motion: no-preference) {
    .backdrop {
      animation: lgtm-fadein 0.15s ease;
    }
  }
  @keyframes lgtm-fadein {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .panel {
    background: #ffffff;
    color: #24292f;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.24);
    padding: 24px;
    max-width: 600px;
    width: calc(100vw - 48px);
    max-height: calc(100vh - 96px);
    overflow-y: auto;
    box-sizing: border-box;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    clip-path: inset(50%);
    overflow: hidden;
    white-space: nowrap;
  }
  h2 {
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 600;
    color: #24292f;
  }
  .subtitle {
    margin: 0 0 20px 0;
    font-size: 13px;
    color: #656d76;
  }
  .loading {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 0;
    color: #656d76;
    font-size: 14px;
  }
  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #d0d7de;
    border-top-color: #0969da;
    border-radius: 50%;
    flex-shrink: 0;
  }
  @media (prefers-reduced-motion: no-preference) {
    .spinner {
      animation: lgtm-spin 0.75s linear infinite;
    }
  }
  @keyframes lgtm-spin {
    to { transform: rotate(360deg); }
  }
  .skeleton-group {
    margin-bottom: 16px;
  }
  .skeleton-prompt {
    height: 14px;
    border-radius: 4px;
    background: #eaeef2;
    margin-bottom: 8px;
  }
  .skeleton-choices {
    display: flex;
    gap: 8px;
  }
  .skeleton-choice {
    height: 14px;
    border-radius: 4px;
    background: #eaeef2;
  }
  @media (prefers-reduced-motion: no-preference) {
    .skeleton-prompt,
    .skeleton-choice {
      animation: lgtm-pulse 1.5s ease-in-out infinite;
    }
  }
  @keyframes lgtm-pulse {
    0%, 100% { opacity: 0.4; }
    50%       { opacity: 0.8; }
  }
  fieldset {
    margin: 0 0 20px 0;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    padding: 14px;
  }
  legend {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.45;
    color: #24292f;
    padding: 0 4px;
  }
  .choice-label {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 0;
    font-size: 14px;
    cursor: pointer;
    color: #24292f;
    line-height: 1.4;
  }
  .choice-label input[type="radio"] {
    margin-top: 2px;
    flex-shrink: 0;
    accent-color: #0969da;
    cursor: pointer;
  }
  .choice-label:has(input:checked) {
    color: #0969da;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #d0d7de;
  }
  .btn {
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 0.12s;
    font-family: inherit;
  }
  .btn-primary {
    background: #1f883d;
    color: #ffffff;
    border-color: rgba(31,35,40,0.15);
  }
  .btn-primary:hover:not(:disabled) {
    background: #1a7f37;
  }
  .btn-primary:disabled {
    background: #94d3a2;
    cursor: not-allowed;
  }
  .btn-secondary {
    background: #f6f8fa;
    color: #24292f;
    border-color: #d0d7de;
  }
  .btn-secondary:hover {
    background: #f3f4f6;
  }
  .btn-danger {
    background: #cf222e;
    color: #ffffff;
    border-color: rgba(31,35,40,0.15);
  }
  .btn-danger:hover {
    background: #b91c1c;
  }
  .result-banner {
    border-radius: 6px;
    padding: 12px 14px;
    margin-bottom: 16px;
    font-size: 14px;
    font-weight: 600;
  }
  .result-pass {
    background: #dafbe1;
    color: #1a7f37;
    border: 1px solid #a7f3d0;
  }
  .result-fail {
    background: #fff0f0;
    color: #cf222e;
    border: 1px solid #ffc1c1;
  }
  .result-error {
    background: #fff8c5;
    color: #9a6700;
    border: 1px solid #eac54f;
  }
  .per-question-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .per-question-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid #f0f0f0;
    font-size: 13px;
    color: #24292f;
    line-height: 1.45;
  }
  .per-question-item:last-child {
    border-bottom: none;
  }
  .pq-icon {
    flex-shrink: 0;
    font-size: 16px;
    line-height: 1.45;
  }
  .score-line {
    font-size: 13px;
    color: #656d76;
    margin: 0 0 12px 0;
  }
  .error-title {
    font-size: 16px;
    font-weight: 600;
    color: #24292f;
    margin: 0 0 8px 0;
  }
  .error-body {
    font-size: 14px;
    color: #24292f;
    margin: 0 0 16px 0;
    line-height: 1.5;
  }
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dependencies injected into `createQuizModal`. */
export type QuizModalDeps = {
  /** The document used for event dispatch and listener attachment. */
  readonly doc: Document;
  /** Optional structured logger for unexpected-state warnings. */
  readonly logger?: DOMEventLogger;
};

/**
 * The public surface of the quiz modal.
 *
 * `start()` attaches all DOM-event listeners and mounts the modal host element.
 * It returns a `dispose()` function that removes all listeners and removes the
 * modal host from the document.
 */
export type QuizModal = {
  /** Wires document listeners and returns a dispose function. */
  readonly start: () => () => void;
};

// ---------------------------------------------------------------------------
// DOM helpers (no innerHTML for user-controlled text)
// ---------------------------------------------------------------------------

/**
 * Creates an element with optional attributes.
 */
const el = <K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Partial<Record<string, string>> = {},
): HTMLElementTagNameMap[K] => {
  const elem = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) {
      elem.setAttribute(key, value);
    }
  }
  return elem;
};

/**
 * Creates a text node element (safe against XSS — no innerHTML).
 */
const textEl = <K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  text: string,
  attrs: Partial<Record<string, string>> = {},
): HTMLElementTagNameMap[K] => {
  const elem = el(doc, tag, attrs);
  elem.textContent = text;
  return elem;
};

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/**
 * Renders a skeleton + spinner panel for `generating` state.
 */
const renderGenerating = (doc: Document): DocumentFragment => {
  const frag = doc.createDocumentFragment();

  const loadingDiv = el(doc, "div", { class: "loading" });
  const spinner = el(doc, "div", { class: "spinner" });
  spinner.setAttribute("aria-hidden", "true");
  const label = doc.createElement("span");
  label.textContent = "Generating quiz from the diff…";
  loadingDiv.appendChild(spinner);
  loadingDiv.appendChild(label);
  frag.appendChild(loadingDiv);

  // Two skeleton question blocks.
  for (let i = 0; i < 2; i++) {
    const group = el(doc, "div", { class: "skeleton-group", "aria-hidden": "true" });

    const prompt = el(doc, "div", { class: "skeleton-prompt" });
    prompt.style.width = i === 0 ? "80%" : "65%";
    group.appendChild(prompt);

    const choices = el(doc, "div", { class: "skeleton-choices" });
    for (const w of ["30%", "25%", "28%"]) {
      const choice = el(doc, "div", { class: "skeleton-choice" });
      choice.style.width = w;
      choices.appendChild(choice);
    }
    group.appendChild(choices);
    frag.appendChild(group);
  }

  return frag;
};

/**
 * Renders one multiple-choice question as a `<fieldset>` + `<legend>`.
 * Returns the fieldset element and a getter for the selected choice id.
 */
const renderQuestion = (
  doc: Document,
  question: QuizDTO["questions"][number],
  groupName: string,
): { fieldset: HTMLFieldSetElement; getSelected: () => string | null } => {
  const fieldset = doc.createElement("fieldset");
  fieldset.setAttribute("data-question", question.id);

  const legend = el(doc, "legend");
  legend.textContent = question.prompt;
  fieldset.appendChild(legend);

  for (const choice of question.choices) {
    const labelEl = el(doc, "label", { class: "choice-label" });

    const radio = el(doc, "input", {
      type: "radio",
      name: groupName,
      value: choice.id,
      "data-choice": choice.id,
    }) as HTMLInputElement;
    radio.setAttribute("aria-label", choice.label);

    const choiceText = doc.createElement("span");
    choiceText.textContent = choice.label;

    labelEl.appendChild(radio);
    labelEl.appendChild(choiceText);
    fieldset.appendChild(labelEl);
  }

  const getSelected = (): string | null => {
    const checked = fieldset.querySelector<HTMLInputElement>(
      `input[name="${groupName}"]:checked`,
    );
    return checked?.value ?? null;
  };

  return { fieldset, getSelected };
};

/**
 * Renders the `ready` (quiz-active) panel body.
 * Returns the fragment and a getter for collected answers.
 */
const renderReady = (
  doc: Document,
  quiz: QuizDTO,
  submitBtn: HTMLButtonElement,
): {
  fragment: DocumentFragment;
  collectAnswers: () => ReadonlyArray<{ questionId: string; chosenChoiceId: string }>;
} => {
  const frag = doc.createDocumentFragment();
  const selectors: Array<{ questionId: string; getSelected: () => string | null }> = [];

  for (const [idx, question] of quiz.questions.entries()) {
    const groupName = `lgtm-q-${idx}`;
    const { fieldset, getSelected } = renderQuestion(doc, question, groupName);
    selectors.push({ questionId: question.id, getSelected });
    frag.appendChild(fieldset);

    // Update submit button enabled state on any radio change.
    fieldset.addEventListener("change", () => {
      const allAnswered = selectors.every((s) => s.getSelected() !== null);
      submitBtn.disabled = !allAnswered;
    });
  }

  // Initially disabled until all questions answered.
  submitBtn.disabled = true;

  const collectAnswers = (): ReadonlyArray<{
    questionId: string;
    chosenChoiceId: string;
  }> =>
    selectors
      .map((s) => {
        const chosen = s.getSelected();
        return chosen !== null
          ? { questionId: s.questionId, chosenChoiceId: chosen }
          : null;
      })
      .filter((a): a is { questionId: string; chosenChoiceId: string } => a !== null);

  return { fragment: frag, collectAnswers };
};

/**
 * Renders per-question feedback list (safe: textContent only).
 */
const renderPerQuestion = (
  doc: Document,
  perQuestion: NonNullable<QuizResultPayload["perQuestion"]>,
  questions: ReadonlyArray<QuizDTO["questions"][number]>,
): HTMLElement => {
  const list = el(doc, "ul", { class: "per-question-list" });

  for (const pq of perQuestion) {
    const question = questions.find((q) => q.id === pq.questionId);
    const item = el(doc, "li", { class: "per-question-item" });

    const icon = el(doc, "span", { class: "pq-icon" });
    icon.textContent = pq.correct ? "✅" : "❌";

    const textSpan = doc.createElement("span");
    textSpan.textContent = question?.prompt ?? pq.questionId;

    if (pq.explanation !== undefined) {
      const exp = doc.createElement("span");
      exp.textContent = ` — ${pq.explanation}`;
      exp.style.color = "#656d76";
      textSpan.appendChild(exp);
    }

    item.appendChild(icon);
    item.appendChild(textSpan);
    list.appendChild(item);
  }

  return list;
};

/**
 * Renders the pass result panel body.
 */
const renderPassed = (
  doc: Document,
  result: QuizResultPayload,
  quiz: QuizDTO,
): DocumentFragment => {
  const frag = doc.createDocumentFragment();

  const banner = el(doc, "div", { class: "result-banner result-pass" });
  banner.textContent = "✅ Quiz passed! Your approval is going through.";
  frag.appendChild(banner);

  const scoreLine = el(doc, "p", { class: "score-line" });
  scoreLine.textContent = `Score: ${result.correct} / ${result.total}`;
  frag.appendChild(scoreLine);

  if (result.perQuestion !== undefined && result.perQuestion.length > 0) {
    frag.appendChild(renderPerQuestion(doc, result.perQuestion, quiz.questions));
  }

  return frag;
};

/**
 * Renders the fail result panel body.
 */
const renderFailed = (
  doc: Document,
  result: QuizResultPayload,
  quiz: QuizDTO,
): DocumentFragment => {
  const frag = doc.createDocumentFragment();

  const banner = el(doc, "div", { class: "result-banner result-fail" });
  banner.textContent = "❌ Quiz failed. Review the diff and try again.";
  frag.appendChild(banner);

  const scoreLine = el(doc, "p", { class: "score-line" });
  scoreLine.textContent = `Score: ${result.correct} / ${result.total}`;
  frag.appendChild(scoreLine);

  if (result.perQuestion !== undefined && result.perQuestion.length > 0) {
    frag.appendChild(renderPerQuestion(doc, result.perQuestion, quiz.questions));
  }

  return frag;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the quiz modal that responds to DOM events emitted by the quiz flow
 * controller (ADR-18, ADR-24).
 *
 * The modal is mounted once on `document.body` (idempotent) and uses a Shadow
 * DOM for style isolation. It subscribes to `lgtm-buzzer:quiz-request` and
 * `lgtm-buzzer:quiz-result`, and dispatches `lgtm-buzzer:quiz-submit`,
 * `lgtm-buzzer:quiz-cancel`, and `lgtm-buzzer:quiz-retry` back to `document`.
 *
 * @param deps - Injected dependencies: `doc` and optional `logger`.
 */
export const createQuizModal = (deps: QuizModalDeps): QuizModal => {
  const { doc, logger } = deps;

  // Modal host element + shadow root (created once; never re-mounted).
  let host: HTMLDivElement | null = null;
  let shadow: ShadowRoot | null = null;

  // Current state.
  let state: ModalState = { kind: "idle" };

  // Snapshot of the quiz when in ready or submitting, so result render
  // can show per-question prompts.
  let activeQuiz: QuizDTO | null = null;

  // collectAnswers is wired during ready render; valid only in that state.
  let collectAnswers: (() => ReadonlyArray<{ questionId: string; chosenChoiceId: string }>) | null =
    null;

  // Focus trap — created lazily on first non-idle render; reused thereafter.
  let focusTrap: FocusTrap | null = null;

  // aria-live region — a persistent element that announces state transitions.
  let liveRegion: HTMLElement | null = null;

  // ---------------------------------------------------------------------------
  // Mount
  // ---------------------------------------------------------------------------

  /**
   * Mounts the modal host element into `document.body` if not already mounted.
   * Idempotent: subsequent calls are no-ops.
   */
  const ensureMounted = (): void => {
    if (host !== null) return;

    host = doc.createElement("div");
    host.setAttribute("data-lgtm-modal-host", "");
    host.setAttribute("data-testid", "lgtm-buzzer-quiz-modal");
    shadow = host.attachShadow({ mode: "open" });

    const styleEl = doc.createElement("style");
    styleEl.textContent = MODAL_CSS;
    shadow.appendChild(styleEl);

    doc.body.appendChild(host);
  };

  // ---------------------------------------------------------------------------
  // aria-live announcement
  // ---------------------------------------------------------------------------

  /**
   * Updates the `aria-live` region with a new announcement.
   *
   * The region is a persistent element — it is NOT torn down and re-mounted
   * per state, because destroying and recreating it resets the live-region
   * announcement for screen readers.
   */
  const announce = (text: string): void => {
    if (liveRegion !== null) {
      liveRegion.textContent = text;
    }
  };

  /** Returns the aria-live announcement text for the current state. */
  const announcementForState = (s: ModalState): string => {
    switch (s.kind) {
      case "idle":        return "";
      case "generating":  return "Generating quiz from the diff";
      case "ready":
        return `Quiz ready, ${activeQuiz?.questions.length ?? 0} question${(activeQuiz?.questions.length ?? 0) === 1 ? "" : "s"}`;
      case "submitting":  return "Checking answers";
      case "passed":      return "Quiz passed";
      case "failed":      return "Quiz failed";
      case "error": {
        const cls = classifyError(s.reason as Parameters<typeof classifyError>[0], s.message);
        return `Error: ${errorClassToUI(cls).title}`;
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Show / hide
  // ---------------------------------------------------------------------------

  /**
   * Renders the current state into the shadow DOM and makes the backdrop
   * visible. Creates the backdrop if it does not yet exist.
   */
  const render = (): void => {
    if (shadow === null) return;

    // Deactivate old focus trap before rebuilding the DOM.
    focusTrap?.deactivate();

    if (state.kind === "idle") {
      shadow.querySelector(".backdrop")?.remove();
      liveRegion = null;
      return;
    }

    // Remove stale backdrop.
    shadow.querySelector(".backdrop")?.remove();

    const backdrop = doc.createElement("div");
    backdrop.className = "backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "lgtm-buzzer-modal-title");
    backdrop.setAttribute("tabindex", "-1");

    // aria-busy during generating and submitting.
    const busy = state.kind === "generating" || state.kind === "submitting";
    backdrop.setAttribute("aria-busy", busy ? "true" : "false");

    const panel = doc.createElement("div");
    panel.className = "panel";
    panel.setAttribute("tabindex", "-1");

    // Persistent aria-live region (created once per modal-open, kept across renders).
    const statusDiv = el(doc, "div", {
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
      class: "sr-only",
    });
    liveRegion = statusDiv;
    panel.appendChild(statusDiv);

    // Header.
    const heading = textEl(doc, "h2", "LGTM Buzzer", { id: "lgtm-buzzer-modal-title" });
    const subtitle = el(doc, "p", { class: "subtitle" });

    // Content area.
    const content = doc.createElement("div");
    content.setAttribute("data-lgtm-content", "");

    // Actions area.
    const actions = el(doc, "div", { class: "actions" });

    switch (state.kind) {
      case "generating": {
        const { requestId } = state;
        subtitle.textContent = "Preparing your quiz…";
        content.appendChild(renderGenerating(doc));

        const cancelBtn = textEl(doc, "button", "Cancel", {
          class: "btn btn-secondary",
          "data-testid": "lgtm-buzzer-quiz-cancel",
        });
        cancelBtn.addEventListener("click", () => { handleCancel(requestId); });
        actions.appendChild(cancelBtn);
        break;
      }

      case "ready": {
        const { requestId, quiz } = state;
        subtitle.textContent = `${quiz.questions.length} question${quiz.questions.length === 1 ? "" : "s"} — answer all to submit.`;

        const submitBtn = textEl(doc, "button", "Submit answers", {
          class: "btn btn-primary",
          "data-testid": "lgtm-buzzer-quiz-submit",
        }) as HTMLButtonElement;
        submitBtn.type = "submit";

        const { fragment, collectAnswers: ca } = renderReady(doc, quiz, submitBtn);
        collectAnswers = ca;
        content.appendChild(fragment);

        submitBtn.addEventListener("click", () => { handleSubmit(requestId, quiz.id); });

        const cancelBtn = textEl(doc, "button", "Cancel", {
          class: "btn btn-secondary",
          "data-testid": "lgtm-buzzer-quiz-cancel",
        });
        cancelBtn.addEventListener("click", () => { handleCancel(requestId); });

        actions.appendChild(cancelBtn);
        actions.appendChild(submitBtn);
        break;
      }

      case "submitting": {
        const { requestId } = state;
        subtitle.textContent = "Checking answers…";
        content.appendChild(renderGenerating(doc));

        const cancelBtn = textEl(doc, "button", "Cancel", {
          class: "btn btn-secondary",
          "data-testid": "lgtm-buzzer-quiz-cancel",
        });
        cancelBtn.addEventListener("click", () => { handleCancel(requestId); });
        actions.appendChild(cancelBtn);
        break;
      }

      case "passed": {
        subtitle.textContent = "Well done!";
        content.appendChild(
          renderPassed(doc, state.result, activeQuiz ?? { id: "", questions: [] }),
        );

        const dismissBtn = textEl(doc, "button", "Dismiss", {
          class: "btn btn-secondary",
        });
        dismissBtn.addEventListener("click", () => { closeModal(); });
        actions.appendChild(dismissBtn);
        break;
      }

      case "failed": {
        const { requestId } = state;
        subtitle.textContent = "Approval blocked.";
        content.appendChild(
          renderFailed(doc, state.result, activeQuiz ?? { id: "", questions: [] }),
        );

        const dismissBtn = textEl(doc, "button", "Dismiss", {
          class: "btn btn-secondary",
        });
        dismissBtn.addEventListener("click", () => {
          emitDOMEvent(doc, DOM_EVENTS.quizCancel, { requestId });
          closeModal();
        });

        const tryAgainBtn = textEl(doc, "button", "Try Again", {
          class: "btn btn-primary",
          "data-testid": "lgtm-buzzer-quiz-retry",
        });
        tryAgainBtn.addEventListener("click", () => {
          emitDOMEvent(doc, DOM_EVENTS.quizRetry, { requestId });
          // Modal transitions to generating via the quiz-request event emitted
          // by the CS's onQuizRetry handler — no direct transition here.
        });

        actions.appendChild(dismissBtn);
        actions.appendChild(tryAgainBtn);
        break;
      }

      case "error": {
        const { requestId, reason, message } = state;
        const cls = classifyError(reason as Parameters<typeof classifyError>[0], message);
        const uiSpec = errorClassToUI(cls);

        subtitle.textContent = "An error occurred.";

        const errBanner = el(doc, "div", { class: "result-banner result-error" });
        errBanner.textContent = "⚠️ Something went wrong.";
        content.appendChild(errBanner);

        const errTitle = textEl(doc, "p", uiSpec.title, { class: "error-title" });
        content.appendChild(errTitle);

        const errBody = textEl(doc, "p", uiSpec.body, { class: "error-body" });
        content.appendChild(errBody);

        const dismissBtn = textEl(doc, "button", "Dismiss", {
          class: "btn btn-secondary",
        });
        dismissBtn.addEventListener("click", () => {
          emitDOMEvent(doc, DOM_EVENTS.quizCancel, { requestId });
          closeModal();
        });
        actions.appendChild(dismissBtn);

        if (uiSpec.cta !== undefined) {
          const { label, action } = uiSpec.cta;
          switch (action.kind) {
            case "retry": {
              const retryBtn = textEl(doc, "button", label, {
                class: "btn btn-primary",
                "data-testid": "lgtm-buzzer-quiz-retry",
              });
              retryBtn.addEventListener("click", () => {
                emitDOMEvent(doc, DOM_EVENTS.quizRetry, { requestId });
              });
              actions.appendChild(retryBtn);
              break;
            }
            case "open-options": {
              // Keep backward-compat with ADR-23: also renders configure link.
              const optBtn = textEl(doc, "button", label, {
                class: "btn btn-primary",
                "data-testid": "lgtm-buzzer-configure-options",
                "data-action": "open-options",
              });
              optBtn.addEventListener("click", () => {
                doc.dispatchEvent(new CustomEvent(OPEN_OPTIONS_EVENT, { bubbles: false }));
                emitDOMEvent(doc, DOM_EVENTS.quizCancel, { requestId });
                closeModal();
              });
              actions.appendChild(optBtn);
              break;
            }
            case "install-host": {
              const { url } = action;
              const installLink = textEl(doc, "a", label, {
                href: url,
                target: "_blank",
                rel: "noopener",
                class: "btn btn-primary",
                "data-testid": "lgtm-buzzer-install-host",
              });
              installLink.addEventListener("click", () => {
                emitDOMEvent(doc, DOM_EVENTS.quizCancel, { requestId });
                closeModal();
              });
              actions.appendChild(installLink);
              break;
            }
            case "dismiss":
              // Already have dismiss button.
              break;
          }
        }
        break;
      }
    }

    panel.appendChild(heading);
    panel.appendChild(subtitle);
    panel.appendChild(content);
    panel.appendChild(actions);
    backdrop.appendChild(panel);
    shadow.appendChild(backdrop);

    // Update aria-live announcement for the new state.
    announce(announcementForState(state));

    // Activate focus trap on the panel.
    focusTrap = createFocusTrap({ doc, container: panel });
    focusTrap.activate();
  };

  // ---------------------------------------------------------------------------
  // State transitions
  // ---------------------------------------------------------------------------

  const transition = (next: ModalState): void => {
    const prev = state;
    state = next;

    // Validate transition: warn on invalid but always proceed.
    const valid = isValidTransition(prev.kind, next.kind);
    if (!valid) {
      logger?.warn("[lgtm-buzzer:modal] invalid state transition — proceeding anyway", {
        from: prev.kind,
        to: next.kind,
      });
    }

    render();
  };

  const closeModal = (): void => {
    focusTrap?.deactivate();
    focusTrap = null;
    liveRegion = null;
    activeQuiz = null;
    collectAnswers = null;
    transition({ kind: "idle" });
  };

  // ---------------------------------------------------------------------------
  // Transition validation
  // ---------------------------------------------------------------------------

  /**
   * Returns `true` if the `from → to` transition is a legal move in the
   * state machine. Invalid transitions log a warning and no-op the guard
   * (the transition always proceeds — UI consistency > correctness assertion).
   */
  const isValidTransition = (from: ModalState["kind"], to: ModalState["kind"]): boolean => {
    // from idle
    if (from === "idle" && to === "generating") return true;
    // from generating
    if (from === "generating" && (to === "ready" || to === "error" || to === "idle")) return true;
    // from ready
    if (from === "ready" && (to === "submitting" || to === "idle")) return true;
    // from submitting
    if (from === "submitting" && (to === "passed" || to === "failed" || to === "error" || to === "idle")) return true;
    // from passed / failed / error
    if ((from === "passed" || from === "failed" || from === "error") && to === "idle") return true;
    // from failed / error → generating (retry)
    if ((from === "failed" || from === "error") && to === "generating") return true;
    return false;
  };

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  const handleCancel = (requestId: string): void => {
    emitDOMEvent(doc, DOM_EVENTS.quizCancel, { requestId });
    closeModal();
  };

  const handleSubmit = (requestId: string, quizId: string): void => {
    if (collectAnswers === null) return;
    const answers = collectAnswers();
    if (answers.length === 0) return;

    const quiz = activeQuiz;
    if (quiz === null) return;

    transition({ kind: "submitting", requestId, quiz });

    emitDOMEvent(doc, DOM_EVENTS.quizSubmit, {
      requestId,
      quizId,
      answers,
    });
  };

  // ---------------------------------------------------------------------------
  // Keyboard handler (Esc)
  // ---------------------------------------------------------------------------

  const handleKeyDown = (event: Event): void => {
    const kbEvent = event as KeyboardEvent;
    if (kbEvent.key !== "Escape") return;
    const current = state;
    if (current.kind === "idle") return;

    // In `passed` state: Esc dismisses without emitting quiz-cancel.
    // The approval is already through.
    if (current.kind === "passed") {
      closeModal();
      return;
    }

    emitDOMEvent(doc, DOM_EVENTS.quizCancel, { requestId: current.requestId });
    closeModal();
  };

  // ---------------------------------------------------------------------------
  // DOM-event listeners
  // ---------------------------------------------------------------------------

  const onQuizRequest = (detail: { requestId: string }): void => {
    ensureMounted();
    // If we get a new quiz-request while in any non-idle state (e.g., from
    // a retry), transition to generating with the new requestId.
    transition({ kind: "generating", requestId: detail.requestId });
  };

  const onQuizResult = (detail: {
    requestId: string;
    outcome:
      | { kind: "quiz-ready"; quiz: QuizDTO }
      | { kind: "quiz-passed"; result: QuizResultPayload }
      | { kind: "quiz-failed"; result: QuizResultPayload }
      | { kind: "error"; reason: string; message: string };
  }): void => {
    const { requestId, outcome } = detail;

    switch (outcome.kind) {
      case "quiz-ready": {
        activeQuiz = outcome.quiz;
        transition({ kind: "ready", requestId, quiz: outcome.quiz });
        break;
      }

      case "quiz-passed": {
        transition({
          kind: "passed",
          requestId,
          result: outcome.result,
        });
        break;
      }

      case "quiz-failed": {
        transition({
          kind: "failed",
          requestId,
          result: outcome.result,
        });
        break;
      }

      case "error": {
        transition({
          kind: "error",
          requestId,
          reason: outcome.reason,
          message: outcome.message,
        });
        break;
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    start: (): (() => void) => {
      const disposeRequest = addDOMEventListener(
        doc,
        DOM_EVENTS.quizRequest,
        QuizRequestEventDetailSchema,
        onQuizRequest,
        logger,
      );

      const disposeResult = addDOMEventListener(
        doc,
        DOM_EVENTS.quizResult,
        QuizResultEventDetailSchema,
        onQuizResult,
        logger,
      );

      doc.addEventListener("keydown", handleKeyDown);

      return (): void => {
        disposeRequest();
        disposeResult();
        doc.removeEventListener("keydown", handleKeyDown);
        focusTrap?.deactivate();
        focusTrap = null;
        host?.remove();
        host = null;
        shadow = null;
        state = { kind: "idle" };
        activeQuiz = null;
        collectAnswers = null;
        liveRegion = null;
      };
    },
  };
};
