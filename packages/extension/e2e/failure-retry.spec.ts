/**
 * Failure and retry e2e specs (ADR-25 §B).
 *
 * Test 1: Wrong answers → `failed` state → Try Again → correct → pass.
 * Test 2: Partial answers → Submit button stays disabled.
 */

import { test, expect } from "@playwright/test";
import { launchExtensionContext, routeFixtures } from "./helpers/context.js";
import { FIXTURE_URLS, FIXTURE_FILES } from "./helpers/fixture-paths.js";
import { CANONICAL_QUIZ, CANONICAL_CORRECT } from "./helpers/canned-quiz.js";
import { PRPage } from "./pages/pr-page.js";
import { QuizModal } from "./pages/quiz-modal.js";

test("wrong answers → failed state → Try Again → correct answers → pass", async () => {
  const { context, cleanup } = await launchExtensionContext({
    scenario: {
      kind: "wrong-then-right",
      quiz: CANONICAL_QUIZ,
      correctAnswers: CANONICAL_CORRECT,
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
    await modal.waitForOpen();
    await pr.expectBlocked();

    // 2. Wait for ready state.
    await page.waitForSelector(
      "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=[data-testid='lgtm-buzzer-quiz-submit']",
    );

    // 3. Answer with wrong choices (c2 for both — correct is c1 for q1, c2 for q2).
    await modal.answerQuestion("q1", "c2");
    await modal.answerQuestion("q2", "c1");

    // 4. Submit → stub always returns failed on first submit.
    await modal.submit();

    // 5. Wait for failed state.
    await page.waitForSelector(
      "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=[data-testid='lgtm-buzzer-quiz-retry']",
    );
    const stateAfterFail = await modal.getState();
    expect(stateAfterFail).toBe("failed");

    // 6. Form must still be blocked.
    await pr.expectBlocked();

    // 7. Click Try Again → emits quiz-retry → transitions to generating → ready.
    await modal.retry();

    // Wait for ready state again (new quiz-response from stub).
    await page.waitForSelector(
      "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=[data-testid='lgtm-buzzer-quiz-submit']",
    );
    const stateAfterRetry = await modal.getState();
    expect(stateAfterRetry).toBe("ready");

    // 8. Answer correctly.
    await modal.answerQuestion("q1", "c1");
    await modal.answerQuestion("q2", "c2");

    // 9. Submit → second submit is scored normally → modal reaches `passed` state.
    await modal.submit();

    // Wait for the pass banner in the shadow DOM.
    await page.locator(
      "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=.result-banner.result-pass",
    ).waitFor({ state: "attached", timeout: 10_000 });

    const finalState = await modal.getState();
    expect(finalState).toBe("passed");

    // Note: form re-submission after retry is a known limitation — the original
    // `blocked` event reference is dropped after quiz-failed (quiz-flow.ts
    // `dropPending` is called in handleQuizSubmitReply). The retry path creates
    // a fresh pending with a dummy form, so the approve replay calls
    // requestSubmit() on a disconnected element. The modal state is the
    // observable we assert here; the re-submit is exercised by the happy-path spec.
  } finally {
    await cleanup();
  }
});

test("partial answers: Submit button stays disabled", async () => {
  const { context, cleanup } = await launchExtensionContext({
    scenario: { kind: "happy", quiz: CANONICAL_QUIZ, correctAnswers: CANONICAL_CORRECT },
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
    await modal.waitForOpen();

    // 2. Wait for ready state.
    await page.waitForSelector(
      "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=[data-testid='lgtm-buzzer-quiz-submit']",
    );

    // 3. Answer only q1 — q2 not answered.
    await modal.answerQuestion("q1", "c1");

    // 4. Submit button must be disabled (q2 unanswered).
    await modal.expectSubmitDisabled();

    // 5. Modal must still be in ready state (no submit was sent).
    const currentState = await modal.getState();
    expect(currentState).toBe("ready");

    // 6. Form is still blocked.
    await pr.expectBlocked();
  } finally {
    await cleanup();
  }
});
