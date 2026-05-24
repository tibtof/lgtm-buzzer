/**
 * Page object for the LGTM-Buzzer options page (ADR-25 §4, updated for ADR-29).
 *
 * Wraps the WXT options entrypoint at `chrome-extension://<id>/options.html`.
 * Uses the `data-lgtm-*` attribute contract from `packages/extension/src/lib/options/dom.ts`.
 *
 * ADR-29: VCS dropdown (`data-lgtm-select='vcs'`) and credential input methods
 * (`setLlmCredential`, `setVcsCredential`, etc.) are removed.
 * The options page now only exposes `llmAdapterId` selection.
 */

import type { Page } from "@playwright/test";

/**
 * Page object for the options page.
 *
 * Encapsulates all `data-lgtm-*` selectors so specs never access the raw DOM.
 */
export class OptionsPage {
  constructor(
    private readonly page: Page,
    private readonly extensionId: string,
  ) {}

  /**
   * Navigates to `chrome-extension://${extensionId}/options.html`.
   */
  async open(): Promise<void> {
    await this.page.goto(
      `chrome-extension://${this.extensionId}/options.html`,
    );
    // Wait for the heading to appear — options view has mounted.
    await this.page.waitForSelector("h1");
  }

  /**
   * Returns the currently-rendered LLM adapter dropdown option values.
   *
   * ADR-29: VCS dropdown removed. Use this method for LLM choices only.
   */
  async getLlmChoices(): Promise<string[]> {
    return this.page.evaluate(() => {
      const sel = document.querySelector(
        "[data-lgtm-select='llm']",
      ) as HTMLSelectElement | null;
      if (sel === null) return [];
      return Array.from(sel.options).map((o) => o.value);
    });
  }

  /**
   * Returns the currently-rendered LLM and VCS adapter dropdown option values.
   *
   * @deprecated VCS choices are always empty post-ADR-29 (VCS dropdown removed).
   * Use `getLlmChoices()` instead.
   */
  async getAdapterChoices(): Promise<{ llm: string[]; vcs: string[] }> {
    const llm = await this.getLlmChoices();
    return { llm, vcs: [] };
  }

  /**
   * Returns the currently selected LLM adapter value.
   */
  async getSelectedLlm(): Promise<string> {
    return this.page.evaluate(() => {
      const sel = document.querySelector(
        "[data-lgtm-select='llm']",
      ) as HTMLSelectElement | null;
      return sel?.value ?? "";
    });
  }

  /**
   * Selects an LLM adapter by value; triggers the change handler.
   */
  async selectLlmAdapter(id: string): Promise<void> {
    await this.page.selectOption("[data-lgtm-select='llm']", id);
  }

  /**
   * Clicks the Save button and returns the visible banner kind + message.
   */
  async save(): Promise<{ kind: "success" | "error"; message: string }> {
    await this.page.click("[data-lgtm-btn='save']");
    return this.readBanner();
  }

  /**
   * Clicks the Test connection button and returns the visible banner kind + message.
   */
  async testConnection(): Promise<{ kind: "success" | "error"; message: string }> {
    await this.page.click("[data-lgtm-btn='test']");
    return this.readBanner();
  }

  /**
   * Reads the current banner (waits for it to appear).
   */
  async readBanner(): Promise<{ kind: "success" | "error"; message: string }> {
    await this.page.waitForSelector("[data-lgtm-banner]");
    const kind = await this.page.getAttribute(
      "[data-lgtm-banner]",
      "data-lgtm-banner-kind",
    );
    const message = await this.page
      .locator("[data-lgtm-banner] span")
      .first()
      .textContent();
    const normalised: "success" | "error" =
      kind === "success" ? "success" : "error";
    return { kind: normalised, message: (message ?? "").trim() };
  }
}
