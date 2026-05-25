import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";
import {
  createQuizFlowController,
  createQuizModal,
  setupApproveInterceptor,
  setupAdoVoteInterceptor,
  createGitHubNavigationWatcher,
  createAdoNavigationWatcher,
  createManualTriggerButton,
  detectPRPage,
} from "../src/lib/dom/index.js";
import { createOptionsStore } from "../src/lib/options/storage.js";
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

    // Resolve the LLM adapter id for stats recording. Reads chrome.storage
    // once at start; if the user has not picked one yet, defaults to the
    // host-side default `"claude-cli"` (per ADR-22). Without this, every
    // unconfigured user sees `via unknown` in the stats footer.
    const adapterIdPromise = (async (): Promise<string> => {
      const store = createOptionsStore({
        area: {
          get: (key: string) =>
            browser.storage.local.get(key) as Promise<Record<string, unknown>>,
          set: (items: Record<string, unknown>) => browser.storage.local.set(items),
          remove: (key: string) => browser.storage.local.remove(key),
        },
      });
      const result = await store.read();
      return result.fold(
        () => "claude-cli",
        (opts) => opts.llmAdapterId ?? "claude-cli",
      );
    })();

    const controller = createQuizFlowController({
      doc: document,
      sendFrame,
      newCorrelationId: () => crypto.randomUUID(),
      newRequestId: () => crypto.randomUUID(),
      setupInterceptor,
      navigationWatcher,
      logger,
      // adapterId is read async; quiz-flow accepts undefined and re-reads
      // from the resolved promise. See createQuizFlowController in
      // quiz-flow.ts for the deferred-resolution contract.
      adapterIdPromise,
    });

    controller.start();

    // Mount the modal with the default adapter id; the async storage read
    // refreshes it before any result render. The stats footer (renders
    // only on `passed`/`failed`) is what consumes this; the user clicks
    // through the quiz long after storage settles, so the refresh always
    // wins.
    const modal = createQuizModal({
      doc: document,
      logger: {
        warn: (msg, ctx) => {
          console.warn(`[lgtm-buzzer:modal] ${msg}`, ctx ?? {});
        },
      },
      adapterIdPromise,
    });
    modal.start();

    // ADR-23: forward "open options page" requests from the modal to the SW.
    document.addEventListener("lgtm-buzzer:open-options", () => {
      void browser.runtime.sendMessage({ kind: "open-options" });
    });

    // Floating "Quiz me on this PR" button (manual trigger). Renders only on
    // PR pages and re-evaluates on SPA navigation through the same watcher
    // the quiz flow uses.
    const triggerButton = createManualTriggerButton({
      doc: document,
      onClick: () => {
        controller.triggerManual();
      },
      subscribeNavigation: (cb: () => void) =>
        navigationWatcher.start({
          onWillNavigate: () => {},
          onDidNavigate: cb,
        }),
    });
    triggerButton.mount();

    // Toolbar popup → CS message bridge. Popup sends
    // `{ kind: "trigger-manual-quiz" }` via chrome.tabs.sendMessage; the SW
    // ignores it (no `send-frame` shape) and Chrome routes it here too.
    browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (
        typeof msg === "object" &&
        msg !== null &&
        (msg as { kind?: string }).kind === "trigger-manual-quiz"
      ) {
        const result = controller.triggerManual();
        sendResponse({ ok: result.ok });
        return true;
      }
      return undefined;
    });
  },
});
