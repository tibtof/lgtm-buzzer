import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Playwright configuration for the LGTM-Buzzer e2e suite (ADR-19).
 *
 * Single Chromium project with a persistent context that loads the unpacked
 * MV3 extension from `.output/chrome-mv3/`. The SW native channel is stubbed
 * via `addInitScript` — no real host process involved.
 *
 * Run:
 *   npm run test:e2e --workspace=@lgtm-buzzer/extension
 *
 * Prerequisites:
 *   1. npm run build --workspace=@lgtm-buzzer/extension
 *   2. npm run test:e2e:install --workspace=@lgtm-buzzer/extension
 */
export default defineConfig({
  testDir: path.resolve(__dirname),
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    // headless: false is binding — Chrome does NOT expose MV3 extension service
    // workers to CDP in headless mode. `context.waitForEvent("serviceworker")`
    // times out unconditionally with headless: true. See ADR-19 §spec-comment-1
    // and ADR-25 §Context. This value is vestigial; each spec launches its own
    // persistent context with headless: false via launchExtensionContext().
    // On CI: use xvfb-run (#54).
    headless: false,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium-extension",
      use: {
        // browserName is irrelevant here — we use launchPersistentContext
        // in the spec directly to load the unpacked extension.
        browserName: "chromium",
      },
    },
  ],
});
