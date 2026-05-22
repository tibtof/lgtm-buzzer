/**
 * Options page e2e specs (ADR-25 §D).
 *
 * Test 1: list-adapters populates dropdowns.
 * Test 2: Save → reload → values persist via chrome.storage.local.
 * Test 3: Test connection success → green banner.
 * Test 4: Test connection bad-credentials → red banner with ADR-23 copy.
 *
 * The options page uses `chrome.runtime.sendMessage` → SW router → `connectNative`
 * (stubbed). The stub's `list-adapters-request` / `ping` responses flow through
 * the existing SW routing layer.
 *
 * Note on credentials: `claude-cli` requires no credentials (empty fields);
 * `claude-api` requires an `apiKey`. Tests that save credentials use `claude-api`
 * so the credential input is actually rendered.
 */

import { test, expect } from "@playwright/test";
import { launchExtensionContext } from "./helpers/context.js";
import { OptionsPage } from "./pages/options-page.js";

const LLM_ADAPTERS = ["claude-cli", "claude-api", "codex-cli"];
const VCS_ADAPTERS = ["github", "ado"];

test("list-adapters populates dropdowns", async () => {
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

    // Wait for adapters to load (the page calls listAdapters on mount).
    await page.waitForFunction(() => {
      const sel = document.querySelector("[data-lgtm-select='llm']") as HTMLSelectElement | null;
      return sel !== null && sel.options.length > 0;
    }, { timeout: 10_000 });

    const choices = await opts.getAdapterChoices();
    expect(choices.llm).toEqual(LLM_ADAPTERS);
    expect(choices.vcs).toEqual(VCS_ADAPTERS);
  } finally {
    await cleanup();
  }
});

test("Save → reload → selected adapter and credentials persist", async () => {
  // Use list-adapters-then-happy so adapter listing works without quiz flow.
  const { context, extensionId, cleanup } = await launchExtensionContext({
    scenario: {
      kind: "list-adapters",
      llm: LLM_ADAPTERS,
      vcs: VCS_ADAPTERS,
    },
  });

  try {
    // Page 1: configure and save.
    const page1 = await context.newPage();
    const opts1 = new OptionsPage(page1, extensionId);

    await opts1.open();

    // Wait for adapters to load.
    await page1.waitForFunction(() => {
      const sel = document.querySelector("[data-lgtm-select='llm']") as HTMLSelectElement | null;
      return sel !== null && sel.options.length > 0;
    }, { timeout: 10_000 });

    // Select claude-api (requires apiKey credential input).
    await opts1.selectLlmAdapter("claude-api");

    // Wait for the credential input to render.
    await page1.waitForSelector("[data-lgtm-creds='llm'] [data-lgtm-cred-input='apiKey']");

    // Fill in API key.
    await opts1.setLlmCredential("apiKey", "sk-ant-test-key");

    // Select github VCS.
    await opts1.selectVcsAdapter("github");

    // Wait for VCS credential input.
    await page1.waitForSelector("[data-lgtm-creds='vcs'] [data-lgtm-cred-input='pat']");

    // Fill PAT.
    await opts1.setVcsCredential("pat", "ghp_test_pat");

    // Save.
    const banner1 = await opts1.save();
    expect(banner1.kind).toBe("success");
    await page1.close();

    // Page 2: reload options and assert persistence.
    const page2 = await context.newPage();
    const opts2 = new OptionsPage(page2, extensionId);

    await opts2.open();

    // Wait for adapters to load.
    await page2.waitForFunction(() => {
      const sel = document.querySelector("[data-lgtm-select='llm']") as HTMLSelectElement | null;
      return sel !== null && sel.options.length > 0;
    }, { timeout: 10_000 });

    // Wait for credentials to pre-fill.
    await page2.waitForSelector("[data-lgtm-creds='llm'] [data-lgtm-cred-input='apiKey']");
    await page2.waitForSelector("[data-lgtm-creds='vcs'] [data-lgtm-cred-input='pat']");

    // Assert selected adapter.
    const selectedLlm = await opts2.getSelectedLlm();
    expect(selectedLlm).toBe("claude-api");

    const selectedVcs = await opts2.getSelectedVcs();
    expect(selectedVcs).toBe("github");

    // Assert credentials are pre-filled.
    const apiKey = await opts2.getLlmCredentialValue("apiKey");
    expect(apiKey).toBe("sk-ant-test-key");

    const pat = await opts2.getVcsCredentialValue("pat");
    expect(pat).toBe("ghp_test_pat");

    // Security canary: the raw credential string must NOT appear in page HTML.
    const pageContent = await page2.content();
    expect(pageContent).not.toContain("sk-ant-test-key");
    expect(pageContent).not.toContain("ghp_test_pat");
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

    // Wait for adapters to load.
    await page.waitForFunction(() => {
      const sel = document.querySelector("[data-lgtm-select='llm']") as HTMLSelectElement | null;
      return sel !== null && sel.options.length > 0;
    }, { timeout: 10_000 });

    // Select claude-cli (no credentials required) + github.
    await opts.selectLlmAdapter("claude-cli");
    await opts.selectVcsAdapter("github");

    // Wait for VCS credential input.
    await page.waitForSelector("[data-lgtm-creds='vcs'] [data-lgtm-cred-input='pat']");
    await opts.setVcsCredential("pat", "ghp_test_for_probe");

    // Test connection — the list-adapters scenario replies to ping with pong.
    const banner = await opts.testConnection();
    expect(banner.kind).toBe("success");
    expect(banner.message).toContain("successful");
  } finally {
    await cleanup();
  }
});

test("Test connection bad-credentials → red banner with ADR-23 copy", async () => {
  const { context, extensionId, cleanup } = await launchExtensionContext({
    scenario: {
      kind: "probe-bad-credentials",
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

    // Select claude-api (credential input required).
    await opts.selectLlmAdapter("claude-api");
    await page.waitForSelector("[data-lgtm-creds='llm'] [data-lgtm-cred-input='apiKey']");
    await opts.setLlmCredential("apiKey", "SECRET_CANARY_bad-key");

    await opts.selectVcsAdapter("github");
    await page.waitForSelector("[data-lgtm-creds='vcs'] [data-lgtm-cred-input='pat']");
    await opts.setVcsCredential("pat", "ghp_canary_test");

    // Test connection — probe-bad-credentials scenario replies with bad-credentials error.
    const banner = await opts.testConnection();
    expect(banner.kind).toBe("error");
    // ADR-23 binding copy.
    expect(banner.message).toContain("Credentials rejected by the adapter");

    // Security canary: credential value must NOT appear in page HTML.
    const pageContent = await page.content();
    expect(pageContent).not.toContain("SECRET_CANARY_bad-key");
  } finally {
    await cleanup();
  }
});
