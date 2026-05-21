import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.wxt/**",
      "**/.output/**",
      "**/coverage/**",
      "eslint.config.js",
      "vitest.config.ts",
      "**/*.config.ts",
      "**/*.config.js",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportDefaultDeclaration",
          message: "Default exports are forbidden — use named exports.",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
    },
  },
  // Core and protocol may not depend on Node APIs or outer-layer packages.
  {
    files: ["packages/protocol/**/*.ts", "packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "node:*",
                "fs",
                "fs/*",
                "path",
                "child_process",
                "os",
                "stream",
                "util",
                "crypto",
              ],
              message:
                "Core and protocol must not depend on Node APIs. Define a port instead.",
            },
            {
              group: [
                "@lgtm-buzzer/adapter-*",
                "@lgtm-buzzer/host",
                "@lgtm-buzzer/extension",
              ],
              message:
                "Core and protocol must not depend on outer-layer packages.",
            },
          ],
        },
      ],
    },
  },
  // Extension may not depend on host or adapters directly.
  {
    files: ["packages/extension/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@lgtm-buzzer/adapter-*", "@lgtm-buzzer/host"],
              message:
                "Extension must not import adapters or host directly. Use the native messaging port.",
            },
            {
              group: ["node:*", "fs", "child_process"],
              message: "Extension runs in the browser — no Node APIs.",
            },
          ],
        },
      ],
    },
  },
);
