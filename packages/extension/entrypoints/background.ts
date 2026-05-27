import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import { createCorrelationMap } from "../src/lib/correlation.js";
import { createPortClient } from "../src/lib/port.js";
import { createProgressMap } from "../src/lib/progress-map.js";
import { createCSMessageHandler } from "../src/lib/router.js";
import { NATIVE_HOST_ID } from "../src/lib/host-id.js";
import { createOptionsStore } from "../src/lib/options/storage.js";
import { readSwOptions } from "../src/lib/options/storage-reader.js";

export default defineBackground(() => {
  const map = createCorrelationMap();
  // ADR-32: progress map routes quiz-progress heartbeat frames from host to CS.
  const progressMap = createProgressMap();
  const portClient = createPortClient({
    connect: () => browser.runtime.connectNative(NATIVE_HOST_ID),
    map,
    now: () => Date.now(),
    // 180s budget: ADR-30 first-quiz generates a 20-question pool which
    // routinely takes 60-90s on real PRs. The budget is reset on every
    // heartbeat tick (ADR-32), so in practice the host can run indefinitely
    // as long as it keeps emitting progress frames.
    timeoutMs: 180_000,
    progressMap,
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
      progressMap,
      sendTabMessage: (tabId, msg) =>
        browser.tabs.sendMessage(tabId, msg) as Promise<unknown>,
      logger: {
        warn: (msg, ctx) => console.warn(`[lgtm-buzzer:sw] ${msg}`, ctx ?? {}),
      },
    }),
  );
});
