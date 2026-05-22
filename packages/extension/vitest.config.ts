/**
 * Per-package Vitest configuration for `packages/extension`.
 *
 * The environment split (node default, jsdom for `src/lib/dom/**`) is
 * configured at the root `vitest.config.ts` via `environmentMatchGlobs`
 * because the root config is what Vitest uses as the single configuration
 * entry-point for the monorepo (no `defineWorkspace` is in use).
 *
 * This file is a documentation stub. If the project migrates to
 * `defineWorkspace`, move the `environmentMatchGlobs` entry here and remove
 * it from the root config.
 */
