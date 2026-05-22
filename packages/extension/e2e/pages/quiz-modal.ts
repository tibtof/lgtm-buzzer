/**
 * Page object for the LGTM-Buzzer quiz modal (ADR-25 §4).
 *
 * Wraps the Shadow-DOM modal exposed via `data-testid="lgtm-buzzer-quiz-modal"`.
 * All selector details are encapsulated here; specs never use raw `data-testid`
 * strings directly.
 *
 * Shadow DOM access uses Playwright's `>>` piercing syntax:
 *   `css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=<inner-selector>`
 *
 * Implementation notes (inherited from ADR-19):
 *   - The modal host `<div>` has `data-testid="lgtm-buzzer-quiz-modal"`.
 *     Its visual content (backdrop, panel, questions, buttons) lives in the
 *     open shadow root.
 *   - Use `state: "attached"` for the host element (the host has no layout
 *     box — its `position: fixed` shadow child does not contribute to its
 *     bounding box, so Playwright's default visibility check would fail).
 *   - Shadow-DOM `>>` piercing is stable across Playwright versions tested.
 */

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The host element selector. */
const MODAL_HOST = "[data-testid='lgtm-buzzer-quiz-modal']";

/** Shadow-root piercing prefix. */
const SHADOW = `css=${MODAL_HOST} >> `;

/**
 * The six observable modal states derivable from on-screen test-ids.
 *
 * Matches the ADR-24 state machine, excluding `idle` (modal not in DOM).
 */
export type ObservedState =
  | "generating"
  | "ready"
  | "submitting"
  | "passed"
  | "failed"
  | "error";

/**
 * Page object for the quiz modal. Wraps the Shadow-DOM and exposes a typed
 * API over the binding `data-testid` and `data-lgtm-*` attribute contracts.
 */
export class QuizModal {
  constructor(private readonly page: Page) {}

  /**
   * Waits for the modal host to attach to the DOM.
   *
   * Uses `state: "attached"` per ADR-19 §spec-comment-3 — the host div has
   * no layout box, so the default visibility check (bounding-box > 0) fails.
   */
  async waitForOpen(): Promise<void> {
    await this.page.waitForSelector(MODAL_HOST, { state: "attached" });
  }

  /**
   * Waits for the modal to close.
   *
   * The host `<div>` is not removed on idle (it is reused across opens to
   * avoid re-mounting). We detect "closed" by the absence of the backdrop
   * inside the shadow DOM. The backdrop element is removed on idle transition.
   */
  async waitForClosed(): Promise<void> {
    // Wait for the inner backdrop to disappear (shadow-piercing locator).
    await this.page
      .locator(`${SHADOW}css=.backdrop`)
      .waitFor({ state: "detached", timeout: 10_000 });
  }

  /**
   * Returns the modal's currently-observable state derived from on-screen
   * test-ids and DOM content.
   *
   * Priority:
   * 1. `lgtm-buzzer-quiz-submit` present → `ready` (questions visible).
   * 2. Pass banner text visible → `passed`.
   * 3. Fail banner text visible → `failed`.
   * 4. Error title element visible → `error`.
   * 5. Cancel-only and spinner visible → `generating` or `submitting`.
   *    Distinguish by subtitle text ("Checking answers" → submitting).
   */
  async getState(): Promise<ObservedState> {
    // Wait for the host to be attached first.
    await this.page.waitForSelector(MODAL_HOST, { state: "attached" });

    // Check for submit button → ready state.
    const submitVisible = await this.page
      .locator(`${SHADOW}css=[data-testid='lgtm-buzzer-quiz-submit']`)
      .isVisible()
      .catch(() => false);
    if (submitVisible) return "ready";

    // Check for retry button in the panel (failed or error).
    const retryVisible = await this.page
      .locator(`${SHADOW}css=[data-testid='lgtm-buzzer-quiz-retry']`)
      .isVisible()
      .catch(() => false);

    if (retryVisible) {
      // Distinguish failed vs error by looking for the error-title element.
      const errorTitleVisible = await this.page
        .locator(`${SHADOW}css=.error-title`)
        .isVisible()
        .catch(() => false);
      return errorTitleVisible ? "error" : "failed";
    }

    // Check for "open options" / install-host buttons → error state.
    const optsBtnVisible = await this.page
      .locator(`${SHADOW}css=[data-testid='lgtm-buzzer-configure-options']`)
      .isVisible()
      .catch(() => false);
    if (optsBtnVisible) return "error";

    const installVisible = await this.page
      .locator(`${SHADOW}css=[data-testid='lgtm-buzzer-install-host']`)
      .isVisible()
      .catch(() => false);
    if (installVisible) return "error";

    // Use a short timeout — if we're in a stable state the elements are either
    // present immediately or not at all. 1s is ample for DOM readiness.
    const QUICK = { timeout: 1_000 };

    // Check for pass banner text.
    const passText = await this.page
      .locator(`${SHADOW}css=.result-banner.result-pass`)
      .textContent(QUICK)
      .catch(() => null);
    if (passText !== null) return "passed";

    // Check for fail banner.
    const failText = await this.page
      .locator(`${SHADOW}css=.result-banner.result-fail`)
      .textContent(QUICK)
      .catch(() => null);
    if (failText !== null) return "failed";

    // Check subtitle for submitting.
    const subtitleText = await this.page
      .locator(`${SHADOW}css=.subtitle`)
      .textContent(QUICK)
      .catch(() => "");
    if ((subtitleText ?? "").includes("Checking")) return "submitting";

    return "generating";
  }

  /**
   * Selects a choice within a question by id.
   *
   * @param questionId - The `data-question` attribute value.
   * @param choiceId - The `data-choice` attribute value (radio input).
   */
  async answerQuestion(questionId: string, choiceId: string): Promise<void> {
    await this.page.click(
      `${SHADOW}css=[data-question='${questionId}'] [data-choice='${choiceId}']`,
    );
  }

  /**
   * Clicks the Submit button. The button must be enabled (all questions answered).
   */
  async submit(): Promise<void> {
    await this.page.click(
      `${SHADOW}css=[data-testid='lgtm-buzzer-quiz-submit']`,
    );
  }

  /**
   * Clicks the Retry / Try Again button (available in `failed` and `error`
   * states via the `lgtm-buzzer-quiz-retry` testid).
   */
  async retry(): Promise<void> {
    await this.page.click(
      `${SHADOW}css=[data-testid='lgtm-buzzer-quiz-retry']`,
    );
  }

  /**
   * Clicks the Cancel / Dismiss button.
   *
   * In `generating`, `ready`, `submitting`, and `failed` states the button
   * carries `data-testid="lgtm-buzzer-quiz-cancel"`. In `passed` state the
   * Dismiss button has no testid — click by text.
   */
  async cancel(): Promise<void> {
    const cancelExists = await this.page
      .locator(`${SHADOW}css=[data-testid='lgtm-buzzer-quiz-cancel']`)
      .isVisible()
      .catch(() => false);

    if (cancelExists) {
      await this.page.click(
        `${SHADOW}css=[data-testid='lgtm-buzzer-quiz-cancel']`,
      );
    } else {
      // In `passed` state the Dismiss button has no testid.
      await this.page.click(`${SHADOW}css=button:has-text("Dismiss")`);
    }
  }

  /**
   * Returns the rendered error title, body, and CTA label when in `error` state.
   */
  async getErrorPanel(): Promise<{ title: string; body: string; cta?: string }> {
    // Use a short timeout for all textContent() calls — the error panel is
    // already visible at this point, so elements are either present or absent.
    // Without a timeout, Playwright waits up to 30s for each element to appear,
    // which makes CTA detection extremely slow when the button is not in the DOM.
    const QUICK = { timeout: 1_000 };

    const title = await this.page
      .locator(`${SHADOW}css=.error-title`)
      .textContent(QUICK);
    const body = await this.page
      .locator(`${SHADOW}css=.error-body`)
      .textContent(QUICK);

    // CTA label: either retry button, configure-options button, or install-host link.
    let cta: string | undefined;

    const retryText = await this.page
      .locator(`${SHADOW}css=[data-testid='lgtm-buzzer-quiz-retry']`)
      .textContent(QUICK)
      .catch(() => null);
    if (retryText !== null) {
      cta = retryText.trim();
    }

    const optsText = await this.page
      .locator(`${SHADOW}css=[data-testid='lgtm-buzzer-configure-options']`)
      .textContent(QUICK)
      .catch(() => null);
    if (optsText !== null) {
      cta = optsText.trim();
    }

    const installText = await this.page
      .locator(`${SHADOW}css=[data-testid='lgtm-buzzer-install-host']`)
      .textContent(QUICK)
      .catch(() => null);
    if (installText !== null) {
      cta = installText.trim();
    }

    const result: { title: string; body: string; cta?: string } = {
      title: (title ?? "").trim(),
      body: (body ?? "").trim(),
    };
    if (cta !== undefined) {
      result.cta = cta;
    }
    return result;
  }

  /**
   * Returns the textContent of the aria-live region inside the modal.
   */
  async getAriaLive(): Promise<string> {
    const text = await this.page
      .locator(`${SHADOW}css=[aria-live='polite']`)
      .textContent({ timeout: 1_000 })
      .catch(() => "");
    return (text ?? "").trim();
  }

  /**
   * Returns true if the backdrop carries the expected ARIA contract:
   * `role="dialog"`, `aria-modal="true"`, `aria-labelledby="lgtm-buzzer-modal-title"`.
   */
  async hasAriaContract(): Promise<boolean> {
    const backdrop = this.page.locator(`${SHADOW}css=[role='dialog']`);
    const ariaModal = await backdrop.getAttribute("aria-modal");
    const ariaLabelledBy = await backdrop.getAttribute("aria-labelledby");
    return ariaModal === "true" && ariaLabelledBy === "lgtm-buzzer-modal-title";
  }

  /**
   * Presses Tab (or Shift+Tab) `count` times and returns the `data-testid`
   * of the focused element, or its trimmed `textContent` if no testid.
   *
   * Used to walk the focus trap in accessibility tests.
   *
   * @param count - Number of Tab presses.
   * @param opts.shift - If true, use Shift+Tab.
   */
  async tabAndReadFocus(
    count: number,
    opts?: { readonly shift?: boolean },
  ): Promise<string | null> {
    const key = opts?.shift === true ? "Shift+Tab" : "Tab";
    for (let i = 0; i < count; i++) {
      await this.page.keyboard.press(key);
    }
    // Read the focused element's data-testid or textContent.
    return this.page.evaluate(() => {
      const el = document.activeElement;
      if (el === null || el === document.body) {
        // Focus might be inside shadow DOM — try the composed path.
        return null;
      }
      const testid = el.getAttribute("data-testid");
      if (testid !== null) return testid;
      return (el.textContent ?? "").trim() || null;
    });
  }

  /**
   * Waits for the Submit button to become enabled (all questions answered).
   *
   * Useful for asserting partial-answer state: if the button never becomes
   * enabled, the test proceeds and asserts disabled state.
   */
  async waitForSubmitEnabled(timeout = 2_000): Promise<void> {
    await expect(
      this.page.locator(`${SHADOW}css=[data-testid='lgtm-buzzer-quiz-submit']`),
    ).toBeEnabled({ timeout });
  }

  /**
   * Asserts the Submit button is disabled (aria-disabled or native disabled).
   */
  async expectSubmitDisabled(): Promise<void> {
    await expect(
      this.page.locator(`${SHADOW}css=[data-testid='lgtm-buzzer-quiz-submit']`),
    ).toBeDisabled();
  }
}
