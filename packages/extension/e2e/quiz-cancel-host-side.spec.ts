/**
 * Host-side cancel e2e spec (ADR-33 follow-up).
 *
 * Verifies that pressing Esc while the modal is in `generating` state:
 *   (a) closes the modal immediately, AND
 *   (b) causes the SW to emit a `quiz-cancel-request` frame with the
 *       correct correlationId to the stub (standing in for the real host).
 *
 * The `slow-then-never` stub scenario never replies to `quiz-request`,
 * which keeps the modal in `generating` long enough to press Esc, and
 * records the inbound `quiz-cancel-request` frame in
 * `globalThis.__LGTM_CANCEL_FRAME__` for assertion via `sw.evaluate(...)`.
 */

import { test, expect } from "@playwright/test";
import { launchExtensionContext, routeFixtures } from "./helpers/context.js";
import { FIXTURE_URLS, FIXTURE_FILES } from "./helpers/fixture-paths.js";
import { PRPage } from "./pages/pr-page.js";
import { QuizModal } from "./pages/quiz-modal.js";

test("Esc during generating: modal closes immediately AND quiz-cancel-request frame reaches the stub", async () => {
  const { context, sw, cleanup } = await launchExtensionContext({
    scenario: { kind: "slow-then-never" },
  });

  try {
    const page = await context.newPage();

    await routeFixtures(page, [
      { url: FIXTURE_URLS.github, fixturePath: FIXTURE_FILES.github },
    ]);

    await page.goto(FIXTURE_URLS.github);

    const pr = new PRPage(page, "github");
    const modal = new QuizModal(page);

    // 1. Click Approve — gate intercepts, stub never replies so the modal
    //    stays in `generating` state.
    await pr.clickApprove();
    await modal.waitForOpen();

    // 2. Confirm the modal is in `generating` state before cancelling.
    const stateBeforeCancel = await modal.getState();
    expect(stateBeforeCancel).toBe("generating");

    // 3. Press Esc to cancel — ADR-33: modal emits quiz-cancel DOM event,
    //    CS sends quiz-cancel-request frame to the SW, SW forwards to host.
    await page.keyboard.press("Escape");

    // 4. (a) The modal must close immediately.
    await modal.waitForClosed();

    // 5. (b) The SW stub must have received a quiz-cancel-request frame.
    //    Poll briefly to allow the async postMessage round-trip to settle.
    let cancelFrame: Record<string, unknown> | null = null;
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      cancelFrame = await sw.evaluate(
        () =>
          (globalThis as unknown as Record<string, unknown>)[
            "__LGTM_CANCEL_FRAME__"
          ] as Record<string, unknown> | undefined ?? null,
      );
      if (cancelFrame !== null) break;
      await new Promise<void>((res) => setTimeout(res, 100));
    }

    expect(cancelFrame).not.toBeNull();
    expect(cancelFrame?.kind).toBe("quiz-cancel-request");

    // The outer correlationId must be a non-empty string — its exact value
    // is allocated by the SW at quiz-request time so we cannot predict it,
    // but we can assert it is present and self-consistent with the payload.
    const outerCid = cancelFrame?.correlationId;
    expect(typeof outerCid).toBe("string");
    expect((outerCid as string).length).toBeGreaterThan(0);

    // The payload embeds the same correlationId (ADR-33 §self-describing).
    const payloadCid = (cancelFrame?.payload as Record<string, unknown> | undefined)?.correlationId;
    expect(payloadCid).toBe(outerCid);
  } finally {
    await cleanup();
  }
});
