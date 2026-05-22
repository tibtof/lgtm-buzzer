/**
 * Per-package Vitest configuration for `packages/adapters/github`.
 *
 * This config is picked up by the root `vitest.config.ts` via the workspace's
 * test inclusion pattern. It adds the httptape global setup so contract tests
 * can discover the live fixture server URL.
 *
 * Note: the root config's `resolve.alias` map handles `@lgtm-buzzer/*` imports.
 * This per-package config extends the root configuration implicitly (both are
 * discovered by Vitest's workspace resolution). `globalSetup` is the only
 * addition — it must be an absolute path.
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    globalSetup: [
      fileURLToPath(new URL("./vitest.globalSetup.ts", import.meta.url)),
    ],
  },
});
