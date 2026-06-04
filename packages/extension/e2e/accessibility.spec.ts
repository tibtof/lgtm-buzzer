/**
 * Accessibility e2e specs (ADR-25 §E).
 *
 * Test 1: Focus trap — Tab/Shift+Tab cycles within the modal panel.
 * Test 2: Esc dismisses (in non-passed states emits quiz-cancel; in passed, dismisses silently).
 * Test 3: ARIA contract — aria-modal, aria-labelledby, aria-live present and updated.
 */

import { test, expect } from "@playwright/test";
import { launchExtensionContext, routeFixtures } from "./helpers/context.js";
import { FIXTURE_URLS, FIXTURE_FILES } from "./helpers/fixture-paths.js";
import { CANONICAL_QUIZ, CANONICAL_CORRECT } from "./helpers/canned-quiz.js";
import { PRPage } from "./pages/pr-page.js";
import { QuizModal } from "./pages/quiz-modal.js";

test("focus trap: Tab wraps through focusable elements in the panel", async () => {
  // This test verifies the wrap invariant of the focus trap:
  //   - Tab from the last focusable element wraps focus back to the first.
  //   - Shift+Tab from the first focusable element wraps focus to the last.
  //
  // Approach: press Tab exactly `focusableCount` times — one full cycle —
  // waiting for focus to settle inside the shadow root after each press before
  // firing the next one. This eliminates the race where a rapid back-to-back
  // Tab press fires before the trap's synchronous keydown handler has re-homed
  // focus, which caused the previous implementation to flake intermittently
  // under xvfb/headless Chrome. We only check the end-state of the cycle
  // (focus returns to the first element), so a single shadow-root poll per
  // press is sufficient and timing-stable.

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

    // Open modal and wait for ready state (progress indicator is present).
    await pr.clickApprove();
    await modal.waitForOpen();
    await page.waitForSelector(
      "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=[data-testid='lgtm-buzzer-quiz-progress']",
    );

    // The focus trap activates automatically when the modal enters ready state
    // and moves focus to the first focusable element (index 0 in the panel).
    // Wait for focus to be inside the shadow panel before proceeding.
    await modal.waitForFocusInPanel();

    // Discover the actual Tab-stop cycle by pressing Tab until focus returns to
    // index 0. We use focusable-list indices as stable element identifiers.
    // Radio inputs in the same group share one Tab stop (Tab skips the rest of
    // the group), so the number of real Tab stops can be fewer than the
    // selector count. Discovering the cycle length is more robust than
    // hard-coding it.
    const visited: number[] = [0];
    let currentIndex = 0;
    for (let i = 0; i < 20; i++) {
      // Safety cap: a modal with more than 20 Tab stops is pathological.
      currentIndex = await modal.pressTabSettled({ currentIndex });
      if (currentIndex === 0) break;
      visited.push(currentIndex);
    }
    // The cycle must have wrapped: the last pressTabSettled returned index 0.
    expect(currentIndex).toBe(0);
    // There must be at least one Tab stop beyond the starting element.
    expect(visited.length).toBeGreaterThan(1);

    // Verify the Shift+Tab wrap from index 0: one Shift+Tab from the first
    // element must wrap to the last element in the Tab-stop cycle.
    // "Last" is the element that precedes index 0 in the cycle (i.e., the
    // element that Tab-wrap landed on last).
    const lastTabStop = visited[visited.length - 1]!;
    const shiftIdx = await modal.pressTabSettled({ shift: true, currentIndex: 0 });
    expect(shiftIdx).toBe(lastTabStop);
  } finally {
    await cleanup();
  }
});

test("Esc dismisses modal (cancel semantics) and does not pass the form", async () => {
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

    // Wait for ready state.
    await page.waitForSelector(
      "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=[data-testid='lgtm-buzzer-quiz-progress']",
    );

    // 2. Press Escape in ready state → modal dismisses with quiz-cancel.
    await page.keyboard.press("Escape");
    await modal.waitForClosed();

    // Form must NOT have been submitted (quiz was cancelled).
    await pr.expectBlocked();
  } finally {
    await cleanup();
  }
});

test("ARIA contract: aria-modal, aria-labelledby, aria-live present on open modal", async () => {
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

    // 2. Assert ARIA contract on the backdrop (role="dialog" element).
    const hasContract = await modal.hasAriaContract();
    expect(hasContract).toBe(true);

    // 3. In generating state, aria-live should have announcement text.
    const generatingText = await modal.getAriaLive();
    expect(generatingText.length).toBeGreaterThan(0);

    // 4. Wait for ready state — aria-live should update.
    await page.waitForSelector(
      "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=[data-testid='lgtm-buzzer-quiz-progress']",
    );

    const readyText = await modal.getAriaLive();
    expect(readyText.length).toBeGreaterThan(0);
    // Announcement should mention "Quiz ready" or similar.
    expect(readyText.toLowerCase()).toContain("quiz");

    // 5. Submit → submitting state → aria-live updates again.
    await modal.answerQuestion("q1", "c1");
    await modal.answerQuestion("q2", "c2");
    await modal.submit();

    // Wait for passed state.
    await page.waitForSelector("body[data-form-submitted='true']");

    const passedText = await modal.getAriaLive();
    expect(passedText.length).toBeGreaterThan(0);
  } finally {
    await cleanup();
  }
});
