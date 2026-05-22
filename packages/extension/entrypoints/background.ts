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
    timeoutMs: 60_000,
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
