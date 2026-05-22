import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";
import {
  createQuizFlowController,
  createQuizModal,
  setupApproveInterceptor,
  setupAdoVoteInterceptor,
  createGitHubNavigationWatcher,
  createAdoNavigationWatcher,
  detectPRPage,
} from "../src/lib/dom/index.js";
import type {
  InterceptorFactory,
} from "../src/lib/dom/index.js";
import type { Frame } from "@lgtm-buzzer/protocol";
import { CSResponseSchema } from "../src/lib/cs-protocol.js";

export default defineContentScript({
  matches: [
    "*://github.com/*",
    "*://dev.azure.com/*",
    "*://*.visualstudio.com/*",
  ],
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

    const logger = {
      warn: (msg: string, ctx?: Record<string, unknown>): void => {
        console.warn(`[lgtm-buzzer:cs] ${msg}`, ctx ?? {});
      },
    };

    // -------------------------------------------------------------------------
    // Platform selection — computed once at main() time (per ADR-21 §Types).
    //
    // Each page load is a fresh document; cross-host SPA navigation does not
    // exist, so a static-at-load choice is correct. The CS idles on non-PR
    // URLs within the matched hosts — `detectPRPage` is the gate.
    // -------------------------------------------------------------------------
    const initialPR = detectPRPage(window.location.href);
    const platform: "github" | "ado" =
      initialPR.ok && initialPR.pr.kind === "ado" ? "ado" : "github";

    const setupInterceptor: InterceptorFactory =
      platform === "ado"
        ? (interceptorDeps) =>
            setupAdoVoteInterceptor({
              ...interceptorDeps,
              logger,
            })
        : (interceptorDeps) => setupApproveInterceptor(interceptorDeps);

    const navigationWatcher =
      platform === "ado"
        ? createAdoNavigationWatcher(document)
        : createGitHubNavigationWatcher(document);

    const controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: () => crypto.randomUUID(),
      newRequestId: () => crypto.randomUUID(),
      setupInterceptor,
      navigationWatcher,
      logger,
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

    // ADR-23: forward "open options page" requests from the modal to the SW.
    document.addEventListener("lgtm-buzzer:open-options", () => {
      void browser.runtime.sendMessage({ kind: "open-options" });
    });
  },
});
