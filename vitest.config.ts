import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.wxt/**",
      "**/.output/**",
    ],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@lgtm-buzzer/protocol": r("./packages/protocol/src/index.ts"),
      "@lgtm-buzzer/core": r("./packages/core/src/index.ts"),
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
      "@lgtm-buzzer/host": r("./packages/host/src/index.ts"),
    },
  },
});
