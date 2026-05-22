/**
 * Page object for the GitHub / ADO PR fixture page (ADR-25 §4).
 *
 * Wraps the fixture HTML's approve/vote button and the body-level assertions
 * that indicate whether the approval went through.
 *
 * GitHub: the CS intercepts a form submit; the fixture's bubble-phase listener
 * sets `body[data-form-submitted="true"]` when the submit is not prevented.
 *
 * ADO: the CS intercepts a click; the fixture's bubble-phase listener sets
 * `body[data-vote-clicked="true"]` when the click is not prevented.
 */

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Which fixture variant this page object wraps. */
export type PRVariant = "github" | "ado";

/**
 * Page object for the GitHub or ADO PR fixture page.
 *
 * Encapsulates the approve/vote button click and the submitted/blocked
 * assertions. Specs never touch raw selectors; they call these methods.
 */
export class PRPage {
  constructor(
    private readonly page: Page,
    private readonly variant: PRVariant,
  ) {}

  /**
   * Clicks the Approve / Vote button.
   *
   * The content script's capture-phase handler runs first. If the gate is
   * active it calls `preventDefault()` and the modal opens; otherwise the
   * underlying form submit / click proceeds.
   */
  async clickApprove(): Promise<void> {
    if (this.variant === "github") {
      await this.page.click("#approve-btn");
    } else {
      await this.page.click("[data-testid='complete-vote-button']");
    }
  }

  /**
   * Asserts the underlying form submit (GitHub) or click (ADO) succeeded —
   * i.e. the gate let the approval through.
   */
  async expectApproved(): Promise<void> {
    if (this.variant === "github") {
      await expect(this.page.locator("body")).toHaveAttribute(
        "data-form-submitted",
        "true",
      );
    } else {
      await expect(this.page.locator("body")).toHaveAttribute(
        "data-vote-clicked",
        "true",
      );
    }
  }

  /**
   * Asserts the gate blocked the submit — the form/click attribute must
   * NOT be set on `body`.
   */
  async expectBlocked(): Promise<void> {
    if (this.variant === "github") {
      const val = await this.page.getAttribute("body", "data-form-submitted");
      expect(val).toBeNull();
    } else {
      const val = await this.page.getAttribute("body", "data-vote-clicked");
      expect(val).toBeNull();
    }
  }
}
