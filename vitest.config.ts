import { defineConfig, defineProject, mergeConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

const sharedAlias = {
  "@lgtm-buzzer/protocol": r("./packages/protocol/src/index.ts"),
  "@lgtm-buzzer/core": r("./packages/core/src/index.ts"),
  "@lgtm-buzzer/adapter-shared": r(
    "./packages/adapters/_shared/src/index.ts",
  ),
  "@lgtm-buzzer/adapter-claude-cli": r(
    "./packages/adapters/claude-cli/src/index.ts",
  ),
  "@lgtm-buzzer/adapter-codex-cli": r(
    "./packages/adapters/codex-cli/src/index.ts",
  ),
  "@lgtm-buzzer/adapter-copilot-cli": r(
    "./packages/adapters/copilot-cli/src/index.ts",
  ),
  "@lgtm-buzzer/adapter-github": r(
    "./packages/adapters/github/src/index.ts",
  ),
  "@lgtm-buzzer/adapter-ado": r("./packages/adapters/ado/src/index.ts"),
  "@lgtm-buzzer/adapter-claude-api": r("./packages/adapters/claude-api/src/index.ts"),
  "@lgtm-buzzer/host": r("./packages/host/src/index.ts"),
};

const sharedExclude = [
  "**/node_modules/**",
  "**/dist/**",
  "**/.wxt/**",
  "**/.output/**",
];

/**
 * Shared base project config. Used by both the node and jsdom sub-projects
 * so that resolve aliases are defined exactly once.
 */
const sharedBase = defineProject({
  resolve: { alias: sharedAlias },
});

export default defineConfig({
  test: {
    projects: [
      // All packages in node environment (default).
      mergeConfig(sharedBase, defineProject({
        test: {
          name: "node",
          environment: "node",
          include: ["packages/**/*.test.ts"],
          exclude: [
            ...sharedExclude,
            // DOM tests handled by the jsdom project below.
            "packages/extension/src/lib/dom/**",
          ],
          passWithNoTests: true,
        },
      })),
      // extension/src/lib/dom/** tests run in jsdom (ADR-18).
      mergeConfig(sharedBase, defineProject({
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["packages/extension/src/lib/dom/**/*.test.ts"],
          exclude: sharedExclude,
          passWithNoTests: true,
        },
      })),
    ],
  },
});
