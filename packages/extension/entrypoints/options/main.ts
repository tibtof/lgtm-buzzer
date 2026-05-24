import { browser } from "wxt/browser";
import { createOptionsStore } from "../../src/lib/options/storage.js";
import { createSWBridge, createListAdapters } from "../../src/lib/options/sw-bridge.js";
import { createProbe } from "../../src/lib/options/probe.js";
import { createCheckAuth } from "../../src/lib/options/auth-status.js";
import { createOptionsView } from "../../src/lib/options/dom.js";

/**
 * Options page entrypoint.
 *
 * Constructs the dependency graph and mounts the options view.
 * Vanilla TS + DOM — no framework (ADR-23 §Wire-shape choices).
 *
 * ADR-29: `checkAuth` replaces the removed credential plumbing.
 * Credentials are now resolved host-side; the options page only stores
 * `llmAdapterId` and shows the per-adapter auth status from the host.
 */
const main = async (): Promise<void> => {
  const root = document.getElementById("lgtm-options-root");
  if (root === null) {
    // Invariant violation: the HTML template is wrong.
    throw new Error("[lgtm-buzzer:options] #lgtm-options-root not found in DOM");
  }

  // Storage area wrapper — bridge browser.storage.local to StorageArea shape.
  const area = {
    get: (key: string) =>
      (browser.storage.local.get(key) as Promise<Record<string, unknown>>),
    set: (items: Record<string, unknown>) => browser.storage.local.set(items),
    remove: (key: string) => browser.storage.local.remove(key),
  };

  const store = createOptionsStore({ area });

  // SW bridge — sends frames via chrome.runtime.sendMessage.
  const bridge = createSWBridge({
    sendMessage: (msg: unknown) =>
      browser.runtime.sendMessage(msg) as Promise<unknown>,
  });

  const listAdapters = createListAdapters({
    sendFrame: bridge.sendFrame,
    newCorrelationId: () => crypto.randomUUID(),
  });

  const probe = createProbe({
    sendFrame: bridge.sendFrame,
    newCorrelationId: () => crypto.randomUUID(),
    newNonce: () => crypto.randomUUID(),
  });

  // ADR-29: check-auth replaces wire-carried credentials.
  const checkAuth = createCheckAuth({
    sendFrame: bridge.sendFrame,
    newCorrelationId: () => crypto.randomUUID(),
  });

  const view = createOptionsView({
    doc: document,
    root: root as HTMLElement,
    store,
    listAdapters,
    probe,
    checkAuth,
  });

  await view.mount();
};

void main();
