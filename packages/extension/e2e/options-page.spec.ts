/**
 * Options page e2e specs (ADR-25 §D, updated for ADR-29).
 *
 * Test 1: list-adapters populates LLM dropdown; no VCS dropdown in DOM.
 * Test 2: Save → reload → llmAdapterId persists; no credential inputs in DOM.
 * Test 3: Test connection success → green banner.
 * Test 4: Test connection missing-credentials → red banner (ADR-29 replaces bad-credentials).
 *
 * ADR-29: VCS dropdown and credential inputs are removed from the options page.
 * The options page now only stores `llmAdapterId`. Auth status comes from
 * `check-auth-request` (host-resolved).
 */

import { test, expect } from "@playwright/test";
import { launchExtensionContext } from "./helpers/context.js";
import { OptionsPage } from "./pages/options-page.js";

const LLM_ADAPTERS = ["claude-cli", "claude-api", "codex-cli"];
const VCS_ADAPTERS = ["github", "ado"];

test("list-adapters populates LLM dropdown; no VCS dropdown in DOM", async () => {
  const { context, extensionId, cleanup } = await launchExtensionContext({
    scenario: {
      kind: "list-adapters",
      llm: LLM_ADAPTERS,
      vcs: VCS_ADAPTERS,
    },
  });

  try {
    const page = await context.newPage();
    const opts = new OptionsPage(page, extensionId);

    await opts.open();

    // Wait for adapters to load.
    await page.waitForFunction(() => {
      const sel = document.querySelector("[data-lgtm-select='llm']") as HTMLSelectElement | null;
      return sel !== null && sel.options.length > 0;
    }, { timeout: 10_000 });

    const llmChoices = await opts.getLlmChoices();
    expect(llmChoices).toEqual(LLM_ADAPTERS);

    // ADR-29: VCS dropdown must NOT be present in the DOM.
    const hasVcs = await page.evaluate(() =>
      document.querySelector("[data-lgtm-select='vcs']") !== null,
    );
    expect(hasVcs).toBe(false);

    // No credential inputs anywhere.
    const hasCredInputs = await page.evaluate(() =>
      document.querySelectorAll("[data-lgtm-cred-input]").length > 0,
    );
    expect(hasCredInputs).toBe(false);
  } finally {
    await cleanup();
  }
});

test("Save → reload → llmAdapterId persists; no credential inputs in DOM", async () => {
  const { context, extensionId, cleanup } = await launchExtensionContext({
    scenario: {
      kind: "list-adapters",
      llm: LLM_ADAPTERS,
      vcs: VCS_ADAPTERS,
    },
  });

  try {
    // Page 1: select claude-api and save.
    const page1 = await context.newPage();
    const opts1 = new OptionsPage(page1, extensionId);

    await opts1.open();

    await page1.waitForFunction(() => {
      const sel = document.querySelector("[data-lgtm-select='llm']") as HTMLSelectElement | null;
      return sel !== null && sel.options.length > 0;
    }, { timeout: 10_000 });

    await opts1.selectLlmAdapter("claude-api");

    const banner1 = await opts1.save();
    expect(banner1.kind).toBe("success");
    await page1.close();

    // Page 2: reload and assert llmAdapterId is persisted.
    const page2 = await context.newPage();
    const opts2 = new OptionsPage(page2, extensionId);

    await opts2.open();

    await page2.waitForFunction(() => {
      const sel = document.querySelector("[data-lgtm-select='llm']") as HTMLSelectElement | null;
      return sel !== null && sel.options.length > 0;
    }, { timeout: 10_000 });

    const selectedLlm = await opts2.getSelectedLlm();
    expect(selectedLlm).toBe("claude-api");

    // ADR-29: no credential inputs anywhere (even for claude-api).
    const hasCredInputs = await page2.evaluate(() =>
      document.querySelectorAll("[data-lgtm-cred-input]").length > 0,
    );
    expect(hasCredInputs).toBe(false);

    // ADR-29: page HTML must not contain any credential-like attribute.
    const pageContent = await page2.content();
    expect(pageContent).not.toContain("data-lgtm-creds=");
  } finally {
    await cleanup();
  }
});

test("Test connection success → green banner", async () => {
  const { context, extensionId, cleanup } = await launchExtensionContext({
    scenario: {
      kind: "list-adapters",
      llm: LLM_ADAPTERS,
      vcs: VCS_ADAPTERS,
    },
  });

  try {
    const page = await context.newPage();
    const opts = new OptionsPage(page, extensionId);

    await opts.open();

    await page.waitForFunction(() => {
      const sel = document.querySelector("[data-lgtm-select='llm']") as HTMLSelectElement | null;
      return sel !== null && sel.options.length > 0;
    }, { timeout: 10_000 });

    // Select claude-cli (no credentials — the list-adapters scenario replies to ping with pong).
    await opts.selectLlmAdapter("claude-cli");

    const banner = await opts.testConnection();
    expect(banner.kind).toBe("success");
    expect(banner.message).toContain("successful");
  } finally {
    await cleanup();
  }
});

test("Test connection missing-credentials → red banner (ADR-29)", async () => {
  // ADR-29: probe-bad-credentials replaced by probe-missing-credentials.
  const { context, extensionId, cleanup } = await launchExtensionContext({
    scenario: {
      kind: "probe-missing-credentials",
      llm: LLM_ADAPTERS,
      vcs: VCS_ADAPTERS,
    },
  });

  try {
    const page = await context.newPage();
    const opts = new OptionsPage(page, extensionId);

    await opts.open();

    await page.waitForFunction(() => {
      const sel = document.querySelector("[data-lgtm-select='llm']") as HTMLSelectElement | null;
      return sel !== null && sel.options.length > 0;
    }, { timeout: 10_000 });

    await opts.selectLlmAdapter("claude-cli");

    // Test connection — probe-missing-credentials scenario replies to ping with missing-credentials.
    const banner = await opts.testConnection();
    expect(banner.kind).toBe("error");
    // The host message flows through to the banner copy.
    expect(banner.message).toContain("Test connection failed");

    // Security canary: no credential bytes leaked into page HTML.
    const pageContent = await page.content();
    expect(pageContent).not.toContain("SECRET_CANARY");
  } finally {
    await cleanup();
  }
});
