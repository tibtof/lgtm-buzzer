/**
 * Happy-path Playwright e2e spec (ADR-19 §6).
 *
 * Loads the unpacked MV3 extension from `.output/chrome-mv3/` into a
 * persistent Chromium context. Stubs `chrome.runtime.connectNative` via
 * `Worker.evaluate()` with a canned quiz/scoring response. Navigates to a
 * static GitHub PR fixture served via `page.route` and asserts the full
 * quiz gate: Approve is blocked → modal appears → correct answers submitted
 * → form goes through.
 *
 * Implementation notes (ADR-19 deviations / clarifications):
 *
 * 1. `headless: false` is required. Chrome does NOT expose MV3 extension
 *    service workers to the DevTools Protocol in headless mode; `headless: true`
 *    makes `context.waitForEvent("serviceworker")` time out unconditionally.
 *    Headless-new and non-headed both produce visible windows on CI — `headless:
 *    false` + `--disable-gpu` is the standard workaround.
 *
 * 2. `context.addInitScript` does NOT inject into extension service worker
 *    contexts. The stub is injected via `sw.evaluate()` after the SW is
 *    registered, before any page navigation. `connectNative` is called lazily
 *    (first message from CS), so the stub is always installed in time.
 *
 * 3. `data-testid="lgtm-buzzer-quiz-modal"` is on the host `<div>` element whose
 *    visual content (backdrop, questions, buttons) lives in its open shadow root.
 *    Playwright's default `waitForSelector` checks visibility by element bounding
 *    box; the host div has no layout box (its `position: fixed` shadow child does
 *    not contribute). We use `{ state: "attached" }` for the host element and
 *    shadow-piercing `>>` selectors (`css=host >> css=child`) for inner elements.
 *
 * Prerequisites:
 *   npm run build --workspace=@lgtm-buzzer/extension
 *   npm run test:e2e:install --workspace=@lgtm-buzzer/extension
 */

import { test, expect, chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { buildSwStubScript, type CannedQuiz, type CannedCorrectAnswers } from "./sw-stub.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(__dirname, "../.output/chrome-mv3");
const fixtureHtmlPath = path.resolve(__dirname, "fixtures/github-pr.html");

// ---------------------------------------------------------------------------
// Canned test data (ADR-19 §5)
// ---------------------------------------------------------------------------

const cannedQuiz: CannedQuiz = {
  id: "e2e-quiz-1",
  questions: [
    {
      type: "multiple-choice",
      id: "q1",
      prompt: "Which file was modified?",
      choices: [
        { id: "c1", label: "src/foo.ts" },
        { id: "c2", label: "src/bar.ts" },
      ],
    },
    {
      type: "multiple-choice",
      id: "q2",
      prompt: "What did the change add?",
      choices: [
        { id: "c1", label: "A bug" },
        { id: "c2", label: "A feature" },
      ],
    },
  ],
};

const correctAnswers: CannedCorrectAnswers = { q1: "c1", q2: "c2" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Asserts the built extension artifact exists.
 * Fails fast with a clear message if the developer forgot to run `npm run build`.
 */
const assertBuiltExtension = (dir: string): void => {
  if (!fs.existsSync(dir)) {
    throw new Error(
      `Extension build artifact not found at: ${dir}\n` +
        "Run `npm run build --workspace=@lgtm-buzzer/extension` first.",
    );
  }
};

// ---------------------------------------------------------------------------
// Happy-path spec (ADR-19 §6)
// ---------------------------------------------------------------------------

test("happy path: approve gates on quiz, opens on correct answers", async () => {
  assertBuiltExtension(extensionDir);

  const fixtureHtml = fs.readFileSync(fixtureHtmlPath, "utf-8");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lgtm-e2e-"));

  // headless: false is required — MV3 extension SWs are not visible to CDP
  // in headless mode. The CI equivalent is Xvfb + headless: false.
  // See spec-level comment 1.
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--load-extension=${extensionDir}`,
      `--disable-extensions-except=${extensionDir}`,
      "--no-sandbox",
      "--disable-gpu",
    ],
  });

  try {
    // Wait for the extension service worker to be registered.
    // The event fires when Chrome registers the SW from the extension manifest.
    const sw = await context.waitForEvent("serviceworker");
    expect(sw).toBeTruthy();

    // Inject the SW stub directly into the service worker context.
    // connectNative is called lazily (first quiz-request from CS), so the
    // stub is always installed before it is needed.  See spec-level comment 2.
    await sw!.evaluate(buildSwStubScript(cannedQuiz, correctAnswers));

    const page = await context.newPage();

    // Serve the GitHub PR fixture locally — no real network.
    await page.route("https://github.com/owner/repo/pull/1", (route) =>
      route.fulfill({ contentType: "text/html", body: fixtureHtml }),
    );

    await page.goto("https://github.com/owner/repo/pull/1");

    // Click the Approve button — CS capture handler intercepts it.
    await page.click("#approve-btn");

    // Wait for the modal host element to appear in the DOM.
    // Uses `state: "attached"` because the host div's visual content lives in its
    // shadow root (position: fixed backdrop), so Playwright's default visibility
    // check (bounding-box > 0) would fail on the host element itself.
    // See spec-level comment 3.
    await page.waitForSelector("[data-testid='lgtm-buzzer-quiz-modal']", {
      state: "attached",
    });

    // The form must NOT have been submitted yet (CS called preventDefault).
    expect(await page.getAttribute("body", "data-form-submitted")).toBeNull();

    // Wait for the submit button inside the shadow DOM, which signals that the
    // quiz-active state has been reached (quiz-response arrived from SW stub).
    await page.waitForSelector(
      "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=[data-testid='lgtm-buzzer-quiz-submit']",
    );

    // Answer both questions correctly.
    // data-question / data-choice attributes live inside the shadow root.
    await page.click(
      "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=[data-question='q1'] [data-choice='c1']",
    );
    await page.click(
      "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=[data-question='q2'] [data-choice='c2']",
    );

    // Submit the quiz — submit button is now enabled (both questions answered).
    await page.click(
      "css=[data-testid='lgtm-buzzer-quiz-modal'] >> css=[data-testid='lgtm-buzzer-quiz-submit']",
    );

    // The form should now have been submitted (bypass flag set by quiz-flow
    // controller, requestSubmit() re-fired the submit event; fixture's bubble-
    // phase listener set the attribute).
    await page.waitForSelector("body[data-form-submitted='true']");
  } finally {
    await context.close();
    // Best-effort cleanup of the temp profile dir.
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
