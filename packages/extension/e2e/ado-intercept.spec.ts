/**
 * ADO intercept e2e specs (ADR-25 §F).
 *
 * Test 1: ADO fixture vote button intercepted → modal opens.
 * Test 2: After quiz passes, vote replay proceeds (data-vote-clicked="true").
 *
 * The ADO fixture uses `data-testid="complete-vote-button"` which matches
 * the first entry in `KNOWN_ADO_VOTE_TESTIDS` from `ado-vote-intercept.ts`.
 *
 * ADO uses click handlers (not form submit), so the bypass path calls
 * `element.click()` on replay.
 */

import { test } from "@playwright/test";
import { launchExtensionContext, routeFixtures } from "./helpers/context.js";
import { FIXTURE_URLS, FIXTURE_FILES } from "./helpers/fixture-paths.js";
import { CANONICAL_QUIZ, CANONICAL_CORRECT } from "./helpers/canned-quiz.js";
import { PRPage } from "./pages/pr-page.js";
import { QuizModal } from "./pages/quiz-modal.js";

test("ADO vote click intercepted → modal opens → gate blocks vote", async () => {
  const { context, cleanup } = await launchExtensionContext({
    scenario: { kind: "happy", quiz: CANONICAL_QUIZ, correctAnswers: CANONICAL_CORRECT },
  });

  try {
    const page = await context.newPage();

    // Route both GitHub (for extension init) and ADO fixture.
    await routeFixtures(page, [
      { url: FIXTURE_URLS.ado, fixturePath: FIXTURE_FILES.ado },
    ]);

    await page.goto(FIXTURE_URLS.ado);

    const pr = new PRPage(page, "ado");
    const modal = new QuizModal(page);

    // 1. Click the vote button — CS intercepts it.
    await pr.clickApprove();

    // 2. Modal should open.
    await modal.waitForOpen();

    // 3. Vote must be blocked.
    await pr.expectBlocked();
  } finally {
    await cleanup();
  }
});

test("ADO vote: correct answers → quiz passes → vote click replayed", async () => {
  const { context, cleanup } = await launchExtensionContext({
    scenario: { kind: "happy", quiz: CANONICAL_QUIZ, correctAnswers: CANONICAL_CORRECT },
  });

  try {
    const page = await context.newPage();

    await routeFixtures(page, [
      { url: FIXTURE_URLS.ado, fixturePath: FIXTURE_FILES.ado },
    ]);

    await page.goto(FIXTURE_URLS.ado);

    const pr = new PRPage(page, "ado");
    const modal = new QuizModal(page);

    // 1. Click vote button → modal opens.
    await pr.clickApprove();
    await modal.waitForOpen();
    await pr.expectBlocked();

    // 2. Wait for ready state.
    await page.waitForSelector(
      "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=[data-testid='lgtm-buzzer-quiz-submit']",
    );

    // 3. Answer correctly.
    await modal.answerQuestion("q1", "c1");
    await modal.answerQuestion("q2", "c2");

    // 4. Submit → passed → vote replayed via element.click().
    await modal.submit();

    // Wait for vote to go through (ADO fixture marks body[data-vote-clicked]).
    await page.waitForSelector("body[data-vote-clicked='true']");
    await pr.expectApproved();
  } finally {
    await cleanup();
  }
});
