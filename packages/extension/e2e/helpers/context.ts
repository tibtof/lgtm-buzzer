/**
 * Shared spec scaffolding for the e2e suite (ADR-25 §3).
 *
 * Provides `launchExtensionContext`, `assertBuiltExtension`, and
 * `routeFixtures` — the three helpers shared by every spec.
 *
 * Implementation notes (inherited from ADR-19):
 *   - `headless: false` is required. Chrome does NOT expose MV3 extension
 *     service workers to CDP in headless mode.
 *   - The stub is injected via `sw.evaluate(script)` after the SW event fires
 *     but before any page navigation.
 *   - Each spec gets its own temp `userDataDir`; cleanup() removes it.
 */

import { chromium, type BrowserContext, type Worker, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { buildSwStubScript, type StubScenario } from "./sw-stub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The built extension artifact directory (relative to the e2e/helpers/ folder). */
const EXTENSION_DIR = path.resolve(__dirname, "../../.output/chrome-mv3");

/** The e2e directory (parent of this file). */
const E2E_DIR = path.resolve(__dirname, "..");

/**
 * The return type of `launchExtensionContext`.
 *
 * `extensionId` is parsed from `sw.url()` which is
 * `chrome-extension://<id>/background.js`. The options-page spec uses it
 * to navigate to `chrome-extension://<id>/options.html`.
 */
export type LaunchedContext = {
  readonly context: BrowserContext;
  readonly sw: Worker;
  readonly extensionId: string;
  readonly cleanup: () => Promise<void>;
};

/**
 * Asserts the built extension artifact exists at `.output/chrome-mv3/`.
 * Fails fast with the same "Run npm run build first" message as ADR-19.
 *
 * @throws {Error} if the artifact directory is missing.
 */
export const assertBuiltExtension = (): void => {
  if (!fs.existsSync(EXTENSION_DIR)) {
    throw new Error(
      `Extension build artifact not found at: ${EXTENSION_DIR}\n` +
        "Run `npm run build --workspace=@lgtm-buzzer/extension` first.",
    );
  }
};

/**
 * Launches a persistent Chromium context with the unpacked extension loaded
 * and the named SW stub scenario installed.
 *
 * Resolves only after the SW event fires AND the stub marker is confirmed via
 * a polling evaluate call (prevents races where the page navigates before the
 * stub is ready).
 *
 * `headless: false` is binding per ADR-19 §spec-comment-1 and ADR-25 §Context.
 * On CI, use `xvfb-run` with a virtual display (#54).
 *
 * @param deps.scenario - The stub scenario to install in the SW context.
 * @returns A `LaunchedContext` with context, sw, extensionId, and cleanup.
 */
export const launchExtensionContext = async (deps: {
  readonly scenario: StubScenario;
}): Promise<LaunchedContext> => {
  assertBuiltExtension();

  const { scenario } = deps;
  const stubScript = buildSwStubScript(scenario);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lgtm-e2e-"));

  // headless: false is required — MV3 extension SWs are not visible to CDP
  // in headless mode. CI equivalent: xvfb-run + headless: false (#54).
  // See spec-level comment 1 in quiz-happy-path.spec.ts (ADR-19).
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--load-extension=${EXTENSION_DIR}`,
      `--disable-extensions-except=${EXTENSION_DIR}`,
      "--no-sandbox",
      "--disable-gpu",
    ],
  });

  // Wait for the extension service worker to register.
  const sw = await context.waitForEvent("serviceworker");

  // Inject the stub into the SW context. connectNative is called lazily
  // (first message from CS), so the stub is always installed in time.
  await sw.evaluate(stubScript);

  // Poll until the stub marker is set (race-free detection).
  const expectedMarker = scenario.kind;
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const marker = await sw.evaluate(
      () => (globalThis as unknown as Record<string, unknown>)["__LGTM_E2E_STUB__"],
    );
    if (marker === expectedMarker) break;
    await new Promise<void>((res) => setTimeout(res, 50));
  }

  // Parse the extensionId from the SW URL:
  // `chrome-extension://<id>/background.js` → second segment.
  const swUrl = sw.url();
  const extensionId = swUrl.split("/")[2] ?? "";

  const cleanup = async (): Promise<void> => {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  };

  return { context, sw, extensionId, cleanup };
};

/**
 * Routes one or more URLs to local fixture HTML files via `page.route(...)`.
 *
 * Centralised so specs do not duplicate the URL list. Every navigation in
 * the suite MUST go through this helper — no real network calls allowed.
 *
 * @param page - The Playwright page to install routes on.
 * @param routes - Array of `{ url, fixturePath }` pairs. `fixturePath` is
 *   relative to the `e2e/` directory.
 */
export const routeFixtures = async (
  page: Page,
  routes: ReadonlyArray<{ readonly url: string; readonly fixturePath: string }>,
): Promise<void> => {
  for (const { url, fixturePath } of routes) {
    const absolutePath = path.resolve(E2E_DIR, fixturePath);
    const html = fs.readFileSync(absolutePath, "utf-8");
    await page.route(url, (route) =>
      route.fulfill({ contentType: "text/html", body: html }),
    );
  }
};
