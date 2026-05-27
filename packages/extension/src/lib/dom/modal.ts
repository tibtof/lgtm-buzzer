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
  QuizProgressEventDetailSchema,
  emitDOMEvent,
  addDOMEventListener,
  type DOMEventLogger,
} from "./dom-events.js";
import type { QuizProgressPhase } from "@lgtm-buzzer/protocol";
import type { PRIdentifier } from "@lgtm-buzzer/core";
import { classifyError, errorClassToUI } from "./error-classes.js";
import { createFocusTrap } from "./focus-trap.js";
import type { FocusTrap } from "./focus-trap.js";
import type { StatsStore } from "../stats/store.js";

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
  | { readonly kind: "generating"; readonly requestId: string; readonly pr?: PRIdentifier }
  | {
      readonly kind: "ready";
      readonly requestId: string;
      readonly quiz: QuizDTO;
      readonly pr?: PRIdentifier;
    }
  | {
      readonly kind: "submitting";
      readonly requestId: string;
      readonly quiz: QuizDTO;
      readonly pr?: PRIdentifier;
    }
  | {
      readonly kind: "passed";
      readonly requestId: string;
      readonly result: QuizResultPayload;
      readonly pr?: PRIdentifier;
    }
  | {
      readonly kind: "failed";
      readonly requestId: string;
      readonly result: QuizResultPayload;
      readonly pr?: PRIdentifier;
    }
  | {
      readonly kind: "error";
      readonly requestId: string;
      readonly reason: string;
      readonly message: string;
      readonly pr?: PRIdentifier;
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
    /* Softer overlay so a hint of the underlying PR shows through —
       feels less like a page takeover, more like a layered dialog. */
    background: rgba(13, 17, 23, 0.45);
    backdrop-filter: blur(2px);
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
  .pr-id {
    font-size: 12px;
    color: #57606a;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    margin: 0 0 6px 0;
    line-height: 1.4;
    user-select: text;
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
  fieldset[hidden] {
    display: none;
  }
  fieldset[data-locked="true"] {
    background: #f6f8fa;
  }
  fieldset[data-locked="true"] .choice-label {
    cursor: default;
  }
  [data-lgtm-progress] {
    text-align: center;
    font-size: 12px;
    color: #57606a;
    margin: -4px 0 12px 0;
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
    /* Blue, not green — keeps ✅ green as the unique correct-answer signal. */
    background: #1f6feb;
    color: #ffffff;
    border-color: rgba(31,35,40,0.15);
  }
  .btn-primary:hover:not(:disabled) {
    background: #1158c7;
  }
  .btn-primary:disabled {
    background: #a8c7fa;
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
    padding: 6px 0;
    border-bottom: 1px solid #f0f0f0;
    font-size: 12.5px;
    color: #57606a;
    line-height: 1.5;
  }
  .per-question-item:last-child {
    border-bottom: none;
  }
  .pq-icon {
    flex-shrink: 0;
    font-size: 14px;
    line-height: 1.5;
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
  .generation-timer {
    font-variant-numeric: tabular-nums;
    color: #57606a;
    font-size: 13px;
    margin-left: 4px;
  }
  .eta-bar {
    margin: 8px 0 0 0;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    accent-color: #0969da;
  }
  .score-header {
    font-size: 14px;
    font-weight: 600;
    color: #24292f;
    margin: 0 0 8px 0;
  }
  .stats-footer {
    font-size: 12px;
    color: #57606a;
    margin: 12px 0 0 0;
    padding-top: 8px;
    border-top: 1px solid #f0f0f0;
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
  /**
   * Optional stats store for recording and reading generation/quiz history.
   *
   * When provided:
   * - A live generation timer is shown in `generating` state.
   * - An ETA progress bar is shown when ≥3 historical samples exist.
   * - A score header and stats footer are rendered on `passed`/`failed` states.
   */
  readonly stats?: StatsStore;
  /**
   * The LLM adapter id used for the current quiz flow. Shown in the stats
   * footer on result screens. Defaults to `"claude-cli"` when absent —
   * matches the host-side ADR-22 default so unconfigured users see a real
   * adapter id rather than "unknown".
   */
  readonly adapterId?: string;
  /**
   * Async-resolved adapter id, mirroring the same plumbing in `quiz-flow.ts`.
   * When provided, the modal awaits this promise and updates its internal
   * cached adapter id; subsequent result renders reflect the resolved value.
   */
  readonly adapterIdPromise?: Promise<string>;
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
// PR identifier formatting
// ---------------------------------------------------------------------------

/**
 * Formats a `PRIdentifier` as a short human-readable coordinate string.
 *
 * - GitHub: `{owner}/{repo} #{number}`
 * - ADO:    `{org}/{project}/{repo} !{pullRequestId}`
 */
const formatPRIdentifier = (pr: PRIdentifier): string => {
  switch (pr.kind) {
    case "github": return `${pr.owner}/${pr.repo} #${pr.number}`;
    case "ado":    return `${pr.org}/${pr.project}/${pr.repo} !${pr.pullRequestId}`;
  }
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
 * Renders the `ready` (quiz-active) panel body as a one-question-at-a-time
 * stepper with Prev / Next / Submit + a "i/n" progress indicator.
 *
 * UX contract (locked-on-advance):
 *   - Only one fieldset is visible at a time (index i).
 *   - Next is disabled until the current question has an answer.
 *   - Clicking Next moves to i+1 AND locks question i's radios (read-only on
 *     revisit via Prev). This prevents the user from skim-then-revise after
 *     seeing all questions.
 *   - Prev is disabled at index 0.
 *   - At the last question, the primary button becomes Submit (still gated on
 *     having selected an answer for that question).
 *
 * Submit is wired by the caller; this function returns it (and the panel
 * fragment + answer collector) so the caller can keep its existing wire-up.
 */
const renderReady = (
  doc: Document,
  quiz: QuizDTO,
): {
  fragment: DocumentFragment;
  collectAnswers: () => ReadonlyArray<{ questionId: string; chosenChoiceId: string }>;
  prevBtn: HTMLButtonElement;
  nextBtn: HTMLButtonElement;
  submitBtn: HTMLButtonElement;
  progress: HTMLElement;
} => {
  const frag = doc.createDocumentFragment();
  const selectors: Array<{
    questionId: string;
    fieldset: HTMLFieldSetElement;
    getSelected: () => string | null;
    locked: boolean;
  }> = [];

  // Render all fieldsets up-front; we just toggle visibility per step. This
  // keeps state (which radio is checked) without recreating DOM on navigate.
  for (const [idx, question] of quiz.questions.entries()) {
    const groupName = `lgtm-q-${idx}`;
    const { fieldset, getSelected } = renderQuestion(doc, question, groupName);
    fieldset.setAttribute("data-question-index", String(idx));
    fieldset.hidden = idx !== 0;
    selectors.push({ questionId: question.id, fieldset, getSelected, locked: false });
    frag.appendChild(fieldset);
  }

  const progress = el(doc, "div", {
    "data-testid": "lgtm-buzzer-quiz-progress",
    "data-lgtm-progress": "",
  });
  frag.appendChild(progress);

  const prevBtn = textEl(doc, "button", "Prev", {
    class: "btn btn-secondary",
    "data-testid": "lgtm-buzzer-quiz-prev",
  }) as HTMLButtonElement;
  prevBtn.type = "button";

  const nextBtn = textEl(doc, "button", "Next", {
    class: "btn btn-primary",
    "data-testid": "lgtm-buzzer-quiz-next",
  }) as HTMLButtonElement;
  nextBtn.type = "button";

  const submitBtn = textEl(doc, "button", "Submit answers", {
    class: "btn btn-primary",
    "data-testid": "lgtm-buzzer-quiz-submit",
  }) as HTMLButtonElement;
  submitBtn.type = "submit";
  submitBtn.hidden = true;

  // Internal index — index of the currently-visible question (0-based).
  let i = 0;

  const lockFieldset = (entry: (typeof selectors)[number]): void => {
    if (entry.locked) return;
    entry.locked = true;
    const inputs = entry.fieldset.querySelectorAll<HTMLInputElement>(
      "input[type=\"radio\"]",
    );
    for (const r of inputs) {
      r.disabled = true;
    }
    entry.fieldset.setAttribute("data-locked", "true");
  };

  const refresh = (): void => {
    const total = selectors.length;
    progress.textContent = `Question ${i + 1} of ${total}`;

    for (const [j, entry] of selectors.entries()) {
      entry.fieldset.hidden = j !== i;
    }

    prevBtn.disabled = i === 0;
    const currentAnswered = selectors[i]?.getSelected() !== null;
    const isLast = i === total - 1;
    nextBtn.hidden = isLast;
    submitBtn.hidden = !isLast;
    nextBtn.disabled = !currentAnswered;
    submitBtn.disabled = !currentAnswered;
  };

  // Wire each fieldset's change event to re-evaluate the current button state.
  for (const entry of selectors) {
    entry.fieldset.addEventListener("change", () => {
      refresh();
    });
  }

  prevBtn.addEventListener("click", () => {
    if (i > 0) {
      i -= 1;
      refresh();
    }
  });

  nextBtn.addEventListener("click", () => {
    const currentEntry = selectors[i];
    if (currentEntry === undefined || currentEntry.getSelected() === null) return;
    lockFieldset(currentEntry);
    if (i < selectors.length - 1) {
      i += 1;
      refresh();
    }
  });

  // Initial render: show first question, both nav buttons sized for n>1.
  refresh();

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

  return {
    fragment: frag,
    collectAnswers,
    prevBtn,
    nextBtn,
    submitBtn,
    progress,
  };
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

  // Score is shown in the dedicated score-header above the banner — no
  // redundant "Score: X / Y" line here.

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
  const { doc, logger, stats, adapterIdPromise } = deps;
  // Mutable so the async storage read can refresh it before the next render.
  let adapterId = deps.adapterId ?? "claude-cli";
  if (adapterIdPromise !== undefined) {
    void adapterIdPromise.then((resolved) => {
      if (resolved !== "") adapterId = resolved;
    });
  }

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

  // Generation start time (set when entering `generating`, cleared on exit).
  let generationStartMs: number | null = null;

  // Duration of the last generation (ms), for display on result screens.
  let lastGenerationDurationMs: number | null = null;

  // setInterval id for the live timer in `generating` state.
  let timerIntervalId: ReturnType<typeof setInterval> | null = null;

  // Median generation time cached on entering `generating` state.
  let cachedMedianMs: number | null = null;

  // Recent pass rate cached on entering result states.
  let cachedPassRate: { passed: number; total: number } | null = null;

  // ADR-32: heartbeat tracking. Set to Date.now() when a quiz-progress arrives.
  // Null when no heartbeat has been received for the current generation.
  let lastHeartbeatMs: number | null = null;

  // ADR-32: current phase from heartbeat. Used to update the subtitle text.
  let currentPhase: QuizProgressPhase | null = null;

  // ---------------------------------------------------------------------------
  // ADR-32: phase-copy helper
  // ---------------------------------------------------------------------------

  /** Returns human-readable copy for the current heartbeat phase. */
  const phaseCopy = (phase: QuizProgressPhase): string => {
    switch (phase) {
      case "fetching-diff":    return "Fetching diff…";
      case "generating-quiz":  return "Generating quiz…";
      case "parsing":          return "Parsing response…";
      case "caching":          return "Almost ready…";
    }
  };

  // ---------------------------------------------------------------------------
  // Stats footer helper (closes over factory-scope state)
  // ---------------------------------------------------------------------------

  /**
   * Renders the stats footer line: `via <adapter> · generated in Xs · Last 10: Y passed`.
   *
   * Parts are omitted when the corresponding data is unavailable.
   */
  const renderStatsFooter = (d: Document): HTMLElement => {
    const footer = el(d, "footer", {
      "data-testid": "lgtm-buzzer-stats-footer",
      class: "stats-footer",
    });

    const parts: string[] = [adapterId];

    if (lastGenerationDurationMs !== null) {
      const seconds = Math.round(lastGenerationDurationMs / 1000);
      parts.push(`${seconds}s`);
    }

    if (cachedPassRate !== null) {
      parts.push(
        `${cachedPassRate.passed}/${cachedPassRate.total} passed`,
      );
    }

    footer.textContent = parts.join(" · ");
    return footer;
  };

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
        // ADR-32: show phase copy when we have a heartbeat; otherwise static text.
        subtitle.textContent = currentPhase !== null ? phaseCopy(currentPhase) : "Preparing your quiz…";
        subtitle.setAttribute("data-testid", "lgtm-buzzer-generation-subtitle");
        content.appendChild(renderGenerating(doc));

        // Live generation timer.
        const timerEl = el(doc, "time", {
          "data-testid": "lgtm-buzzer-generation-timer",
          class: "generation-timer",
        });
        timerEl.setAttribute("datetime", "");

        // Insert timer into the loading div (first child of content).
        const loadingDiv = content.querySelector(".loading");
        if (loadingDiv !== null) {
          loadingDiv.appendChild(timerEl);
        }

        // ETA progress bar — shown only when we have a cached median AND no
        // heartbeat has arrived yet (ADR-32: first heartbeat clears cachedMedianMs
        // and switches to indeterminate progress).
        if (cachedMedianMs !== null && lastHeartbeatMs === null) {
          const etaBar = el(doc, "progress", {
            "data-testid": "lgtm-buzzer-generation-eta",
            class: "eta-bar",
            max: String(cachedMedianMs),
          }) as HTMLProgressElement;
          etaBar.value = 0;
          content.appendChild(etaBar);
        }

        // Tick function: update timer text and ETA bar.
        const tick = (): void => {
          if (generationStartMs === null) return;
          const elapsed = Date.now() - generationStartMs;
          const seconds = Math.floor(elapsed / 1000);
          timerEl.textContent = `${seconds}s`;
          timerEl.setAttribute("datetime", `PT${seconds}S`);

          // ADR-32: after 10s of no heartbeat, revert subtitle to static text.
          if (lastHeartbeatMs !== null && Date.now() - lastHeartbeatMs > 10_000) {
            subtitle.textContent = "Preparing your quiz…";
          }

          if (cachedMedianMs !== null && lastHeartbeatMs === null) {
            const etaBar = shadow?.querySelector<HTMLProgressElement>(
              "[data-testid='lgtm-buzzer-generation-eta']",
            );
            if (etaBar !== null && etaBar !== undefined) {
              const fraction = Math.min(0.95, elapsed / cachedMedianMs);
              etaBar.value = fraction * cachedMedianMs;
            }
          }
        };

        // Clear any stale interval before starting a new one.
        if (timerIntervalId !== null) {
          clearInterval(timerIntervalId);
          timerIntervalId = null;
        }
        tick(); // Immediate first tick.
        timerIntervalId = setInterval(tick, 250);

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
        subtitle.textContent = `${quiz.questions.length} question${quiz.questions.length === 1 ? "" : "s"} — one at a time.`;

        const { fragment, collectAnswers: ca, prevBtn, nextBtn, submitBtn } =
          renderReady(doc, quiz);
        collectAnswers = ca;
        content.appendChild(fragment);

        submitBtn.addEventListener("click", () => { handleSubmit(requestId, quiz.id); });

        const cancelBtn = textEl(doc, "button", "Cancel", {
          class: "btn btn-secondary",
          "data-testid": "lgtm-buzzer-quiz-cancel",
        });
        cancelBtn.addEventListener("click", () => { handleCancel(requestId); });

        actions.appendChild(cancelBtn);
        actions.appendChild(prevBtn);
        actions.appendChild(nextBtn);
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

        const scoreHeader = textEl(doc, "header", `${state.result.correct} of ${state.result.total} correct`, {
          "data-testid": "lgtm-buzzer-score-header",
          class: "score-header",
        });
        content.appendChild(scoreHeader);

        content.appendChild(
          renderPassed(doc, state.result, activeQuiz ?? { id: "", questions: [] }),
        );

        content.appendChild(renderStatsFooter(doc));

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

        const scoreHeader = textEl(doc, "header", `${state.result.correct} of ${state.result.total} correct`, {
          "data-testid": "lgtm-buzzer-score-header",
          class: "score-header",
        });
        content.appendChild(scoreHeader);

        content.appendChild(
          renderFailed(doc, state.result, activeQuiz ?? { id: "", questions: [] }),
        );

        content.appendChild(renderStatsFooter(doc));

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
          // Emit the quiz id of the failed quiz so the CS can send a
          // quiz-resample-request instead of a fresh quiz-request. ADR-30.
          const detail = activeQuiz !== null
            ? { requestId, quizId: activeQuiz.id }
            : { requestId };
          emitDOMEvent(doc, DOM_EVENTS.quizRetry, detail);
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
                // Include quizId if we have an active quiz (error-after-quiz-arrived).
                // The CS uses this to send quiz-resample-request. ADR-30.
                const detail = activeQuiz !== null
                  ? { requestId, quizId: activeQuiz.id }
                  : { requestId };
                emitDOMEvent(doc, DOM_EVENTS.quizRetry, detail);
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

    if (state.pr !== undefined) {
      const prIdEl = textEl(doc, "div", formatPRIdentifier(state.pr), {
        class: "pr-id",
        "data-testid": "lgtm-buzzer-modal-pr-id",
      });
      panel.appendChild(prIdEl);
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

  const stopTimer = (): void => {
    if (timerIntervalId !== null) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
  };

  const transition = (next: ModalState): void => {
    const prev = state;

    // --- Stats side-effects before state change ---

    // Leaving generating: stop timer, record duration.
    if (prev.kind === "generating" && next.kind !== "generating") {
      stopTimer();
      if (generationStartMs !== null) {
        lastGenerationDurationMs = Date.now() - generationStartMs;
        generationStartMs = null;
      }
    }

    // Entering generating: record start time, cache median, reset duration.
    if (next.kind === "generating") {
      generationStartMs = Date.now();
      lastGenerationDurationMs = null;
      // Fetch median asynchronously — re-render once we have it.
      if (stats !== undefined) {
        void stats.getMedianGenerationMs(adapterId).then((median) => {
          cachedMedianMs = median;
          // Only re-render if we're still in generating state.
          if (state.kind === "generating") {
            render();
          }
        });
      }
    }

    // Entering a result state: fetch pass rate asynchronously.
    if (next.kind === "passed" || next.kind === "failed") {
      if (stats !== undefined) {
        void stats.getRecentPassRate(10).then((rate) => {
          cachedPassRate = rate;
          // Only re-render if we're still in the same result state.
          if (state.kind === next.kind) {
            render();
          }
        });
      }
    }

    // Entering idle: clear stats.
    if (next.kind === "idle") {
      stopTimer();
      generationStartMs = null;
      cachedMedianMs = null;
      cachedPassRate = null;
      lastHeartbeatMs = null;
      currentPhase = null;
    }

    // Leaving generating: clear heartbeat state.
    if (prev.kind === "generating" && next.kind !== "generating") {
      lastHeartbeatMs = null;
      currentPhase = null;
    }

    // Entering generating: reset heartbeat state for fresh generation.
    if (next.kind === "generating") {
      lastHeartbeatMs = null;
      currentPhase = null;
    }

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
    stopTimer();
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

    // Read pr BEFORE calling transition to avoid stale-closure bugs.
    const pr = state.kind !== "idle" ? state.pr : undefined;
    transition({ kind: "submitting", requestId, quiz, ...(pr !== undefined ? { pr } : {}) });

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

  const onQuizRequest = (detail: { requestId: string; correlationId: string; pr: PRIdentifier }): void => {
    ensureMounted();
    // If we get a new quiz-request while in any non-idle state (e.g., from
    // a retry), transition to generating with the new requestId.
    transition({ kind: "generating", requestId: detail.requestId, pr: detail.pr });
  };

  /**
   * ADR-32: handles `lgtm-buzzer:quiz-progress` DOM events emitted by the CS
   * via `QuizFlowController.onProgressFrame`.
   *
   * In `generating` state:
   * - Updates the subtitle to phase-aware copy.
   * - Clears `cachedMedianMs` so the ETA bar switches to indeterminate.
   * - Resets `lastHeartbeatMs`.
   *
   * In any other state: ignored (no-op).
   */
  const onQuizProgress = (detail: {
    requestId: string;
    phase: QuizProgressPhase;
    elapsedMs: number;
  }): void => {
    if (state.kind !== "generating") return;
    // Only handle progress for the active request.
    if (state.requestId !== detail.requestId) return;

    // ADR-32: first heartbeat cancels the cached-median ETA bar (switch to
    // indeterminate) and marks the heartbeat timestamp.
    if (lastHeartbeatMs === null) {
      // Clear the median — ETA bar disappears on next tick (indeterminate).
      cachedMedianMs = null;
    }

    lastHeartbeatMs = Date.now();
    currentPhase = detail.phase;

    // Update the subtitle text directly (avoid a full re-render).
    const subtitleEl = shadow?.querySelector<HTMLElement>("[data-testid='lgtm-buzzer-generation-subtitle']");
    if (subtitleEl !== null && subtitleEl !== undefined) {
      subtitleEl.textContent = phaseCopy(detail.phase);
    }
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
    // Read pr BEFORE calling transition to avoid stale-closure bugs.
    const pr = state.kind !== "idle" ? state.pr : undefined;

    switch (outcome.kind) {
      case "quiz-ready": {
        activeQuiz = outcome.quiz;
        transition({
          kind: "ready",
          requestId,
          quiz: outcome.quiz,
          ...(pr !== undefined ? { pr } : {}),
        });
        break;
      }

      case "quiz-passed": {
        transition({
          kind: "passed",
          requestId,
          result: outcome.result,
          ...(pr !== undefined ? { pr } : {}),
        });
        break;
      }

      case "quiz-failed": {
        transition({
          kind: "failed",
          requestId,
          result: outcome.result,
          ...(pr !== undefined ? { pr } : {}),
        });
        break;
      }

      case "error": {
        transition({
          kind: "error",
          requestId,
          reason: outcome.reason,
          message: outcome.message,
          ...(pr !== undefined ? { pr } : {}),
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

      // ADR-32: subscribe to quiz-progress heartbeat events.
      const disposeProgress = addDOMEventListener(
        doc,
        DOM_EVENTS.quizProgress,
        QuizProgressEventDetailSchema,
        onQuizProgress,
        logger,
      );

      doc.addEventListener("keydown", handleKeyDown);

      return (): void => {
        disposeRequest();
        disposeResult();
        disposeProgress();
        doc.removeEventListener("keydown", handleKeyDown);
        stopTimer();
        focusTrap?.deactivate();
        focusTrap = null;
        host?.remove();
        host = null;
        shadow = null;
        state = { kind: "idle" };
        activeQuiz = null;
        collectAnswers = null;
        liveRegion = null;
        generationStartMs = null;
        lastGenerationDurationMs = null;
        cachedMedianMs = null;
        cachedPassRate = null;
        lastHeartbeatMs = null;
        currentPhase = null;
      };
    },
  };
};
