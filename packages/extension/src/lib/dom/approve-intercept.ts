import type { PRIdentifier } from "@lgtm-buzzer/core";
import type { AdoInterceptedApproveEvent } from "./ado-vote-intercept.js";

/**
 * The payload passed to `onBlocked` when a GitHub Approve form submission is
 * intercepted and needs to be held until the quiz result is known.
 */
export type ApproveBlockedEvent = {
  /** The form that was submitted. Replayed via `requestSubmit` on pass. */
  readonly form: HTMLFormElement;
  /**
   * The element that triggered the submit (e.g. the Submit Review button).
   * May be `null` when the submit originated without a submitter element.
   */
  readonly submitter: HTMLElement | null;
  /** The parsed PR identifier derived from `window.location.href`. */
  readonly pr: PRIdentifier;
};

/**
 * Discriminated union over all platform-specific intercepted approve events.
 *
 * The `kind` field drives the replay branch in `quiz-flow.ts`:
 * - `"github"` → `form.requestSubmit(submitter)` path.
 * - `"ado"` → `element.click()` path.
 */
export type InterceptedApproveEvent =
  | (ApproveBlockedEvent & { readonly kind: "github" })
  | AdoInterceptedApproveEvent;

/**
 * Dependencies for `setupApproveInterceptor`.
 *
 * All DOM-touching fields are injected so that tests can supply a jsdom
 * document without a real browser.
 */
export type ApproveInterceptorDeps = {
  /** The document to attach the capture-phase submit listener to. */
  readonly doc: Document;
  /**
   * Returns the current `PRIdentifier` (from the latest `detectPRPage` call),
   * or `null` if the current page is not a PR page.
   */
  readonly getCurrentPR: () => PRIdentifier | null;
  /**
   * Returns `true` when the bypass flag is set, indicating the interceptor
   * should allow the current submit through without calling `preventDefault`.
   */
  readonly shouldBypass: () => boolean;
  /**
   * Invoked when an Approve submit is intercepted. The controller uses this
   * to initiate the quiz round-trip and store the pending submit.
   */
  readonly onBlocked: (e: ApproveBlockedEvent & { readonly kind: "github" }) => void;
};

/**
 * Attaches a capture-phase `submit` listener to `deps.doc` that intercepts
 * GitHub PR Approve form submissions.
 *
 * Detection relies on the form's `pull_request_review[event]` hidden input
 * having the value `"approve"` — this is the server-side API parameter and
 * the most stable contract GitHub offers.
 *
 * Intercept logic (per ADR-18 §Decision 1):
 * 1. `event.target` must be `HTMLFormElement`.
 * 2. `FormData` of the (form, submitter) pair must include
 *    `pull_request_review[event] === "approve"`.
 * 3. `getCurrentPR()` must return a non-null `PRIdentifier`.
 * 4. `shouldBypass()` true → allow through (bypass flag set after quiz pass).
 * 5. Else: `preventDefault()` + `stopPropagation()`, call `onBlocked`.
 *
 * Capture phase (not bubble) ensures this listener fires before any
 * bubble-phase handlers GitHub may have installed.
 *
 * @param deps - Injected dependencies.
 * @returns A dispose function that removes the listener from `deps.doc`.
 */
export const setupApproveInterceptor = (deps: ApproveInterceptorDeps): (() => void) => {
  const { doc, getCurrentPR, shouldBypass, onBlocked } = deps;

  const handler = (event: Event): void => {
    // 1. Must be a form submission.
    if (!(event.target instanceof HTMLFormElement)) return;
    const form = event.target;

    // Get the submitter element if available (HTMLFormElement submit events
    // carry it as a property on SubmitEvent in modern browsers).
    const submitter =
      event instanceof SubmitEvent && event.submitter instanceof HTMLElement
        ? event.submitter
        : null;

    // 2. Inspect form data to confirm this is an Approve action.
    const formData = new FormData(form, submitter);
    if (formData.get("pull_request_review[event]") !== "approve") return;

    // 3. Require a current PR context.
    const pr = getCurrentPR();
    if (pr === null) return;

    // 4. If bypass flag is set let the submit proceed (replay after quiz pass).
    if (shouldBypass()) return;

    // 5. Block the submit and hand off to the quiz flow controller.
    event.preventDefault();
    event.stopPropagation();

    onBlocked({ kind: "github", form, submitter, pr });
  };

  doc.addEventListener("submit", handler, { capture: true });

  return () => {
    doc.removeEventListener("submit", handler, { capture: true });
  };
};
