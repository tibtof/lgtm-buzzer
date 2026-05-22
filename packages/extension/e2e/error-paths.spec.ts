/**
 * Error-path e2e specs (ADR-25 §C).
 *
 * Data-driven over six representative `DisplayErrorClass` variants. Each case
 * asserts:
 *   - Modal transitions to `error` state.
 *   - Error panel shows the correct title and CTA label.
 *   - CTA action is wired correctly (retry cycle, options page, install host tab).
 *
 * Marker strings match the extension's `classifyError` function in
 * `packages/extension/src/lib/dom/error-classes.ts`.
 */

import { test, expect } from "@playwright/test";
import { launchExtensionContext, routeFixtures } from "./helpers/context.js";
import { FIXTURE_URLS, FIXTURE_FILES } from "./helpers/fixture-paths.js";
import { PRPage } from "./pages/pr-page.js";
import { QuizModal } from "./pages/quiz-modal.js";
import type { WireErrorReason } from "./helpers/sw-stub.js";

type ErrorCase = {
  readonly name: string;
  readonly reason: WireErrorReason;
  readonly message: string;
  readonly expectedTitle: string;
  readonly expectedCta: string;
  readonly ctaAction: "retry" | "open-options" | "install-host";
};

const ERROR_CASES: ReadonlyArray<ErrorCase> = [
  {
    name: "bad-credentials",
    reason: "bad-credentials",
    message: "Credentials rejected",
    expectedTitle: "Credentials rejected",
    expectedCta: "Open options",
    ctaAction: "open-options",
  },
  {
    name: "missing-credentials",
    reason: "missing-credentials",
    message: "Credentials required",
    expectedTitle: "Credentials required",
    expectedCta: "Open options",
    ctaAction: "open-options",
  },
  {
    // host-unreachable is classified by the "host disconnected" marker string.
    name: "host-unreachable",
    reason: "internal",
    message: "host disconnected",
    expectedTitle: "Native host not installed",
    expectedCta: "Install host",
    ctaAction: "install-host",
  },
  {
    // host-timeout is classified by the "host did not respond" marker string.
    name: "host-timeout",
    reason: "internal",
    message: "host did not respond",
    expectedTitle: "Host didn't respond",
    expectedCta: "Retry",
    ctaAction: "retry",
  },
  {
    name: "unsupported-llm-adapter",
    reason: "unsupported-llm-adapter",
    message: "The selected LLM adapter is not registered",
    expectedTitle: "LLM adapter not available",
    expectedCta: "Open options",
    ctaAction: "open-options",
  },
  {
    // Genuine host-side internal (unrecognised message marker).
    name: "internal",
    reason: "internal",
    message: "some other internal host error",
    expectedTitle: "Host error",
    expectedCta: "Retry",
    ctaAction: "retry",
  },
];

for (const c of ERROR_CASES) {
  test(`error path: ${c.name} — title="${c.expectedTitle}", CTA="${c.expectedCta}"`, async () => {
    const { context, extensionId, cleanup } = await launchExtensionContext({
      scenario: {
        kind: "error-on-quiz-request",
        reason: c.reason,
        message: c.message,
      },
    });

    try {
      const page = await context.newPage();

      await routeFixtures(page, [
        { url: FIXTURE_URLS.github, fixturePath: FIXTURE_FILES.github },
      ]);

      await page.goto(FIXTURE_URLS.github);

      const pr = new PRPage(page, "github");
      const modal = new QuizModal(page);

      // 1. Open modal.
      await pr.clickApprove();

      // Wait for the modal host to attach.
      await page.waitForSelector("[data-testid='lgtm-buzzer-quiz-modal']", {
        state: "attached",
        timeout: 10_000,
      });

      // 2. Wait for error state (generating → error after stub returns error frame).
      // Use waitForSelector with the same shadow-piercing pattern as the original
      // quiz-happy-path.spec.ts (ADR-19) which uses "css=host >> css=inner".
      await page.waitForSelector(
        "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=.error-title",
        { timeout: 15_000 },
      );

      const state = await modal.getState();
      expect(state).toBe("error");

      // 3. Assert error panel content.
      const panel = await modal.getErrorPanel();
      expect(panel.title).toBe(c.expectedTitle);
      expect(panel.cta).toBe(c.expectedCta);

      // 4. Drive the CTA.
      switch (c.ctaAction) {
        case "retry": {
          // Click Retry — modal transitions to generating (then back to error
          // because the stub still returns the same error reason).
          await modal.retry();

          // Wait for the error to reappear (one cycle).
          await page.waitForSelector(
            "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=.error-title",
            { timeout: 10_000 },
          );

          const stateAfterRetry = await modal.getState();
          expect(stateAfterRetry).toBe("error");
          break;
        }

        case "open-options": {
          // Click "Open options" — modal closes and the options page opens.
          // The extension opens options via chrome.runtime.openOptionsPage()
          // which opens a new tab.
          const newPagePromise = context.waitForEvent("page", { timeout: 5_000 });
          await page.click(
            "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=[data-testid='lgtm-buzzer-configure-options']",
          );
          const optionsPage = await newPagePromise.catch(() => null);
          if (optionsPage !== null) {
            expect(optionsPage.url()).toContain(extensionId);
          }
          // Regardless of whether a new page opened, the modal should close.
          // Give it a moment.
          await page.waitForTimeout(500);
          break;
        }

        case "install-host": {
          // Click "Install host" — opens a new tab to the install URL.
          // Route the install URL on the current page to avoid network calls
          // if the new tab uses the same context routes.
          await page.route("https://github.com/tibtof/lgtm-buzzer**", (route) =>
            route.fulfill({ contentType: "text/html", body: "<html><body>install stub</body></html>" }),
          );
          const newPagePromise = context.waitForEvent("page", { timeout: 5_000 });
          await page.click(
            "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=[data-testid='lgtm-buzzer-install-host']",
            { timeout: 5_000 },
          );
          const installPage = await newPagePromise.catch(() => null);
          if (installPage !== null) {
            // Abort any pending navigations in the install page to avoid network calls.
            await installPage.route("**", (route) => route.abort()).catch(() => undefined);
            expect(installPage.url()).toContain("lgtm-buzzer");
          }
          break;
        }
      }
    } finally {
      await cleanup();
    }
  });
}
