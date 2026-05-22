import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";
import { createQuizFlowController, createQuizModal } from "../src/lib/dom/index.js";
import type { Frame } from "@lgtm-buzzer/protocol";
import { CSResponseSchema } from "../src/lib/cs-protocol.js";

export default defineContentScript({
  matches: ["*://github.com/*", "*://dev.azure.com/*"],
  runAt: "document_idle",

  main() {
    /**
     * Sends a frame to the service worker and returns the reply as a `Frame`.
     *
     * Wraps `browser.runtime.sendMessage` and always resolves — transport
     * failures are encoded as synthetic `ErrorFrame` values (ADR-17).
     */
    const sendFrame = async (frame: Frame): Promise<Frame> => {
      const syntheticError = (message: string): Frame => ({
        v: 1,
        kind: "error",
        correlationId: frame.correlationId,
        payload: { reason: "internal", message },
      });

      let rawResponse: unknown;
      try {
        rawResponse = await browser.runtime.sendMessage({
          kind: "send-frame",
          frame,
        });
      } catch (err) {
        return syntheticError(`sendMessage failed: ${String(err)}`);
      }

      const parsed = CSResponseSchema.safeParse(rawResponse);
      if (!parsed.success) {
        return syntheticError("invalid SW response shape");
      }

      const response = parsed.data;
      if (response.kind === "sw-error") {
        return syntheticError(`sw-error [${response.reason}]: ${response.message}`);
      }

      return response.frame;
    };

    const controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: () => crypto.randomUUID(),
      newRequestId: () => crypto.randomUUID(),
      logger: {
        warn: (msg, ctx) => {
          console.warn(`[lgtm-buzzer:cs] ${msg}`, ctx ?? {});
        },
      },
    });

    controller.start();

    const modal = createQuizModal({
      doc: document,
      logger: {
        warn: (msg, ctx) => {
          console.warn(`[lgtm-buzzer:modal] ${msg}`, ctx ?? {});
        },
      },
    });
    modal.start();
  },
});
