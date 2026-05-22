/**
 * Page object for the LGTM-Buzzer options page (ADR-25 §4).
 *
 * Wraps the WXT options entrypoint at `chrome-extension://<id>/options.html`.
 * Uses the `data-lgtm-*` attribute contract from `packages/extension/src/lib/options/dom.ts`.
 *
 * The `extensionId` is parsed from the SW URL by `launchExtensionContext` and
 * passed to this constructor.
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
   * Returns the currently-rendered LLM and VCS adapter dropdown option values.
   */
  async getAdapterChoices(): Promise<{ llm: string[]; vcs: string[] }> {
    const llm = await this.page.evaluate(() => {
      const sel = document.querySelector(
        "[data-lgtm-select='llm']",
      ) as HTMLSelectElement | null;
      if (sel === null) return [];
      return Array.from(sel.options).map((o) => o.value);
    });

    const vcs = await this.page.evaluate(() => {
      const sel = document.querySelector(
        "[data-lgtm-select='vcs']",
      ) as HTMLSelectElement | null;
      if (sel === null) return [];
      return Array.from(sel.options).map((o) => o.value);
    });

    return { llm, vcs };
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
   * Returns the currently selected VCS adapter value.
   */
  async getSelectedVcs(): Promise<string> {
    return this.page.evaluate(() => {
      const sel = document.querySelector(
        "[data-lgtm-select='vcs']",
      ) as HTMLSelectElement | null;
      return sel?.value ?? "";
    });
  }

  /**
   * Selects an LLM adapter by value; triggers the change handler that renders
   * its credential inputs.
   */
  async selectLlmAdapter(id: string): Promise<void> {
    await this.page.selectOption("[data-lgtm-select='llm']", id);
  }

  /**
   * Selects a VCS adapter by value.
   */
  async selectVcsAdapter(id: string): Promise<void> {
    await this.page.selectOption("[data-lgtm-select='vcs']", id);
  }

  /**
   * Fills the named credential input under the LLM section.
   *
   * @param field - The `data-lgtm-cred-input` attribute value (field key).
   * @param value - The value to fill.
   */
  async setLlmCredential(field: string, value: string): Promise<void> {
    await this.page.fill(
      `[data-lgtm-creds='llm'] [data-lgtm-cred-input='${field}']`,
      value,
    );
  }

  /**
   * Fills the named credential input under the VCS section.
   *
   * @param field - The `data-lgtm-cred-input` attribute value (field key).
   * @param value - The value to fill.
   */
  async setVcsCredential(field: string, value: string): Promise<void> {
    await this.page.fill(
      `[data-lgtm-creds='vcs'] [data-lgtm-cred-input='${field}']`,
      value,
    );
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

  /**
   * Returns the value of the named credential input (LLM section).
   *
   * Used to assert persistence: after a page reload the input should be
   * pre-filled with the stored value.
   */
  async getLlmCredentialValue(field: string): Promise<string> {
    return this.page.inputValue(
      `[data-lgtm-creds='llm'] [data-lgtm-cred-input='${field}']`,
    );
  }

  /**
   * Returns the value of the named credential input (VCS section).
   */
  async getVcsCredentialValue(field: string): Promise<string> {
    return this.page.inputValue(
      `[data-lgtm-creds='vcs'] [data-lgtm-cred-input='${field}']`,
    );
  }
}
