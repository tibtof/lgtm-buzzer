import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import { createCorrelationMap } from "../src/lib/correlation.js";
import { createPortClient } from "../src/lib/port.js";
import { createCSMessageHandler } from "../src/lib/router.js";
import { NATIVE_HOST_ID } from "../src/lib/host-id.js";
import { createOptionsStore } from "../src/lib/options/storage.js";
import { readSwOptions } from "../src/lib/options/storage-reader.js";

export default defineBackground(() => {
  const map = createCorrelationMap();
  const portClient = createPortClient({
    connect: () => browser.runtime.connectNative(NATIVE_HOST_ID),
    map,
    now: () => Date.now(),
    // 180s budget: ADR-30 first-quiz generates a 20-question pool which
    // routinely takes 60-90s on real PRs. 60s was tuned for the M2 5-question
    // path. The host's own LLM-adapter timeout (claude-cli, etc.) caps at
    // 180s too — they should fail together rather than the SW giving up
    // mid-generation. Future improvement: stream heartbeat frames from host
    // (#TBD) so the modal's ETA bar can advance smoothly.
    timeoutMs: 180_000,
    logger: {
      warn: (msg, ctx) => console.warn(`[lgtm-buzzer:sw] ${msg}`, ctx ?? {}),
    },
  });

  // ADR-23: options storage layer — read on every quiz-request (no cache).
  const optionsStore = createOptionsStore({
    area: {
      get: (key) =>
        (browser.storage.local.get(key) as Promise<Record<string, unknown>>),
      set: (items) => browser.storage.local.set(items),
      remove: (key) => browser.storage.local.remove(key),
    },
  });
  const swOptionsReader = readSwOptions({ store: optionsStore });

  browser.runtime.onMessage.addListener(
    createCSMessageHandler({
      portClient,
      readSwOptions: swOptionsReader,
      openOptionsPage: () => {
        void browser.runtime.openOptionsPage();
      },
      logger: {
        warn: (msg, ctx) => console.warn(`[lgtm-buzzer:sw] ${msg}`, ctx ?? {}),
      },
    }),
  );
});
