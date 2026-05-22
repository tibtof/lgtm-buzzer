import type { QuizDTO, QuizResultPayload } from "@lgtm-buzzer/protocol";
import {
  DOM_EVENTS,
  QuizRequestEventDetailSchema,
  QuizResultEventDetailSchema,
  emitDOMEvent,
  addDOMEventListener,
  type DOMEventLogger,
} from "./dom-events.js";

// DOM event name for "open options page" (ADR-23).
const OPEN_OPTIONS_EVENT = "lgtm-buzzer:open-options";

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/**
 * The internal state of the quiz modal.
 *
 * State transitions:
 *   idle → loading        (on quiz-request event)
 *   loading → quiz-active (on quiz-ready outcome)
 *   loading → error       (on error outcome)
 *   quiz-active → submitting (on submit button click)
 *   submitting → result   (on quiz-passed / quiz-failed outcome)
 *   submitting → error    (on error outcome)
 *   result → idle         (on dismiss / try-again)
 *   error → idle          (on dismiss)
 *   * → idle              (on quiz-cancel)
 */
type ModalState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly requestId: string }
  | {
      readonly kind: "quiz-active";
      readonly requestId: string;
      readonly quiz: QuizDTO;
    }
  | {
      readonly kind: "submitting";
      readonly requestId: string;
      readonly quiz: QuizDTO;
    }
  | {
      readonly kind: "result";
      readonly requestId: string;
      readonly passed: boolean;
      readonly result: QuizResultPayload;
    }
  | {
      readonly kind: "error";
      readonly requestId: string;
      readonly message: string;
      readonly reason: string;
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
    animation: lgtm-fadein 0.15s ease;
  }
  @keyframes lgtm-fadein {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .panel {
    background: #ffffff;
    color: #24292f;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.24);
    padding: 24px;
    max-width: 560px;
    width: calc(100vw - 48px);
    max-height: calc(100vh - 96px);
    overflow-y: auto;
    box-sizing: border-box;
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
    animation: lgtm-spin 0.75s linear infinite;
    flex-shrink: 0;
  }
  @keyframes lgtm-spin {
    to { transform: rotate(360deg); }
  }
  .question-block {
    margin-bottom: 20px;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    padding: 14px;
  }
  .question-prompt {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 10px 0;
    line-height: 1.45;
    color: #24292f;
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
  .error-msg {
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
 * Renders the loading state panel body.
 */
const renderLoading = (doc: Document): DocumentFragment => {
  const frag = doc.createDocumentFragment();

  const loadingDiv = el(doc, "div", { class: "loading" });
  const spinner = el(doc, "div", { class: "spinner" });
  spinner.setAttribute("aria-hidden", "true");
  const label = doc.createElement("span");
  label.textContent = "Generating quiz from the diff…";
  loadingDiv.appendChild(spinner);
  loadingDiv.appendChild(label);
  frag.appendChild(loadingDiv);

  return frag;
};

/**
 * Renders one multiple-choice question block.
 * Returns the block element and a getter for the selected choice id.
 */
const renderQuestion = (
  doc: Document,
  question: QuizDTO["questions"][number],
  groupName: string,
): { block: HTMLElement; getSelected: () => string | null } => {
  const block = el(doc, "div", { class: "question-block", "data-question": question.id });

  const prompt = el(doc, "p", { class: "question-prompt" });
  prompt.textContent = question.prompt;
  block.appendChild(prompt);

  const radioContainer = el(doc, "div", {
    role: "radiogroup",
    "aria-label": question.prompt,
  });

  for (const choice of question.choices) {
    const label = el(doc, "label", { class: "choice-label" });

    const radio = el(doc, "input", {
      type: "radio",
      name: groupName,
      value: choice.id,
      "data-choice": choice.id,
    }) as HTMLInputElement;
    radio.setAttribute("aria-label", choice.label);

    const choiceText = doc.createElement("span");
    choiceText.textContent = choice.label;

    label.appendChild(radio);
    label.appendChild(choiceText);
    radioContainer.appendChild(label);
  }

  block.appendChild(radioContainer);

  const getSelected = (): string | null => {
    const checked = radioContainer.querySelector<HTMLInputElement>(
      `input[name="${groupName}"]:checked`,
    );
    return checked?.value ?? null;
  };

  return { block, getSelected };
};

/**
 * Renders the quiz-active panel body.
 * Returns the fragment and a getter for collected answers.
 */
const renderQuizActive = (
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
    const { block, getSelected } = renderQuestion(doc, question, groupName);
    selectors.push({ questionId: question.id, getSelected });
    frag.appendChild(block);

    // Update submit button enabled state on any radio change.
    block.addEventListener("change", () => {
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

/**
 * Renders the error panel body.
 *
 * When `reason` is `"missing-credentials"` or `"bad-credentials"`, an
 * additional "Configure in extension options" link is rendered (ADR-23).
 */
const renderError = (doc: Document, message: string, reason?: string): DocumentFragment => {
  const frag = doc.createDocumentFragment();

  const banner = el(doc, "div", { class: "result-banner result-error" });
  banner.textContent = "⚠️ Something went wrong.";
  frag.appendChild(banner);

  const msg = el(doc, "p", { class: "error-msg" });
  msg.textContent = message;
  frag.appendChild(msg);

  if (reason === "missing-credentials" || reason === "bad-credentials") {
    const configLink = el(doc, "a", {
      href: "#",
      "data-action": "open-options",
      "data-testid": "lgtm-buzzer-configure-options",
    });
    configLink.textContent = "Configure credentials in the LGTM-Buzzer options page";
    configLink.addEventListener("click", (e) => {
      e.preventDefault();
      doc.dispatchEvent(
        new CustomEvent(OPEN_OPTIONS_EVENT, { bubbles: false }),
      );
    });
    frag.appendChild(configLink);
  }

  return frag;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the quiz modal that responds to DOM events emitted by the quiz flow
 * controller (ADR-18).
 *
 * The modal is mounted once on `document.body` (idempotent) and uses a Shadow
 * DOM for style isolation. It subscribes to `lgtm-buzzer:quiz-request` and
 * `lgtm-buzzer:quiz-result`, and dispatches `lgtm-buzzer:quiz-submit` and
 * `lgtm-buzzer:quiz-cancel` back to `document`.
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

  // Snapshot of the quiz when in quiz-active or submitting, so result render
  // can show per-question prompts.
  let activeQuiz: QuizDTO | null = null;

  // collectAnswers is wired during quiz-active render; valid only in that state.
  let collectAnswers: (() => ReadonlyArray<{ questionId: string; chosenChoiceId: string }>) | null =
    null;

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
  // Show / hide
  // ---------------------------------------------------------------------------

  /**
   * Renders the current state into the shadow DOM and makes the backdrop
   * visible. Creates the backdrop if it does not yet exist.
   */
  const render = (): void => {
    if (shadow === null) return;
    if (state.kind === "idle") {
      // Remove backdrop if present.
      const existing = shadow.querySelector(".backdrop");
      existing?.remove();
      return;
    }

    // Remove stale backdrop.
    shadow.querySelector(".backdrop")?.remove();

    const backdrop = doc.createElement("div");
    backdrop.className = "backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "PR Quiz");
    backdrop.setAttribute("tabindex", "-1");

    const panel = doc.createElement("div");
    panel.className = "panel";

    // Header.
    const heading = textEl(doc, "h2", "LGTM Buzzer");
    const subtitle = el(doc, "p", { class: "subtitle" });

    // Content area.
    const content = doc.createElement("div");
    content.setAttribute("data-lgtm-content", "");

    // Actions area (only certain states have buttons).
    const actions = el(doc, "div", { class: "actions" });

    switch (state.kind) {
      case "loading": {
        const { requestId } = state;
        subtitle.textContent = "Preparing your quiz…";
        content.appendChild(renderLoading(doc));
        // Cancel button.
        const cancelBtn = textEl(doc, "button", "Cancel", {
          class: "btn btn-secondary",
          "data-testid": "lgtm-buzzer-quiz-cancel",
        });
        cancelBtn.addEventListener("click", () => { handleCancel(requestId); });
        actions.appendChild(cancelBtn);
        break;
      }

      case "quiz-active": {
        const { requestId, quiz } = state;
        subtitle.textContent = `${quiz.questions.length} question${quiz.questions.length === 1 ? "" : "s"} — answer all to submit.`;

        const submitBtn = textEl(doc, "button", "Submit answers", {
          class: "btn btn-primary",
          "data-testid": "lgtm-buzzer-quiz-submit",
        }) as HTMLButtonElement;
        submitBtn.type = "submit";

        const { fragment, collectAnswers: ca } = renderQuizActive(
          doc,
          quiz,
          submitBtn,
        );
        collectAnswers = ca;
        content.appendChild(fragment);

        submitBtn.addEventListener("click", () => {
          handleSubmit(requestId, quiz.id);
        });

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
        subtitle.textContent = "Checking answers…";
        content.appendChild(renderLoading(doc));
        break;
      }

      case "result": {
        const { requestId, passed, result } = state;
        const quiz = activeQuiz;
        if (passed) {
          subtitle.textContent = "Well done!";
          content.appendChild(
            renderPassed(doc, result, quiz ?? { id: "", questions: [] }),
          );
          // Provide a dismiss button for accessibility.
          const dismissBtn = textEl(doc, "button", "Dismiss", {
            class: "btn btn-secondary",
          });
          dismissBtn.addEventListener("click", () => { closeModal(); });
          actions.appendChild(dismissBtn);
        } else {
          subtitle.textContent = "Approval blocked.";
          content.appendChild(
            renderFailed(doc, result, quiz ?? { id: "", questions: [] }),
          );

          const dismissBtn = textEl(doc, "button", "Dismiss", {
            class: "btn btn-secondary",
          });
          dismissBtn.addEventListener("click", () => {
            emitDOMEvent(doc, DOM_EVENTS.quizCancel, { requestId });
            closeModal();
          });
          actions.appendChild(dismissBtn);
        }
        break;
      }

      case "error": {
        const { requestId, message, reason } = state;
        subtitle.textContent = "An error occurred.";
        content.appendChild(renderError(doc, message, reason));

        const dismissBtn = textEl(doc, "button", "Dismiss", {
          class: "btn btn-secondary",
        });
        dismissBtn.addEventListener("click", () => {
          emitDOMEvent(doc, DOM_EVENTS.quizCancel, { requestId });
          closeModal();
        });
        actions.appendChild(dismissBtn);
        break;
      }
    }

    panel.appendChild(heading);
    panel.appendChild(subtitle);
    panel.appendChild(content);
    panel.appendChild(actions);
    backdrop.appendChild(panel);
    shadow.appendChild(backdrop);

    // Focus the backdrop for keyboard navigation.
    (backdrop as HTMLElement).focus();
  };

  // ---------------------------------------------------------------------------
  // State transitions
  // ---------------------------------------------------------------------------

  const transition = (next: ModalState): void => {
    state = next;
    render();
  };

  const closeModal = (): void => {
    activeQuiz = null;
    collectAnswers = null;
    transition({ kind: "idle" });
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

    transition({ kind: "submitting", requestId, quiz: activeQuiz! });

    emitDOMEvent(doc, DOM_EVENTS.quizSubmit, {
      requestId,
      quizId,
      answers,
    });
  };

  // ---------------------------------------------------------------------------
  // Keyboard handler
  // ---------------------------------------------------------------------------

  const handleKeyDown = (event: Event): void => {
    const kbEvent = event as KeyboardEvent;
    if (kbEvent.key !== "Escape") return;
    const current = state;
    if (current.kind === "idle") return;
    emitDOMEvent(doc, DOM_EVENTS.quizCancel, { requestId: current.requestId });
    closeModal();
  };

  // ---------------------------------------------------------------------------
  // DOM-event listeners
  // ---------------------------------------------------------------------------

  const onQuizRequest = (detail: { requestId: string }): void => {
    ensureMounted();
    transition({ kind: "loading", requestId: detail.requestId });
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
        transition({ kind: "quiz-active", requestId, quiz: outcome.quiz });
        break;
      }

      case "quiz-passed": {
        transition({
          kind: "result",
          requestId,
          passed: true,
          result: outcome.result,
        });
        break;
      }

      case "quiz-failed": {
        transition({
          kind: "result",
          requestId,
          passed: false,
          result: outcome.result,
        });
        break;
      }

      case "error": {
        transition({
          kind: "error",
          requestId,
          message: outcome.message,
          reason: outcome.reason,
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
        host?.remove();
        host = null;
        shadow = null;
        state = { kind: "idle" };
        activeQuiz = null;
        collectAnswers = null;
      };
    },
  };
};
