import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import { createCorrelationMap } from "../src/lib/correlation.js";
import { createPortClient } from "../src/lib/port.js";
import { createCSMessageHandler } from "../src/lib/router.js";
import { NATIVE_HOST_ID } from "../src/lib/host-id.js";

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
  browser.runtime.onMessage.addListener(
    createCSMessageHandler({ portClient }),
  );
});
