import tseslint from "typescript-eslint";

/**
 * Human-readable message shown by ESLint when a forbidden FP library import is detected.
 * Points contributors directly at the CLAUDE.md section that explains the rationale.
 */
const FORBIDDEN_FP_LIBS_MESSAGE =
  'This library is forbidden across the monorepo. See CLAUDE.md "Forbidden libraries" section. Use monadyssey instead.';

/**
 * Exact package names for every FP library that must not be imported anywhere in the monorepo.
 * A future ADR that adds another forbidden library edits only this array.
 */
const FORBIDDEN_FP_LIB_NAMES = [
  "neverthrow",
  "fp-ts",
  "io-ts",
  "effect",
  "purify-ts",
  "true-myth",
];

/**
 * ESLint `no-restricted-imports` paths + patterns for forbidden FP libraries.
 * Spread this constant into every scoped block that has a `no-restricted-imports` rule.
 */
const FORBIDDEN_FP_LIBS = {
  paths: FORBIDDEN_FP_LIB_NAMES.map((name) => ({
    name,
    message: FORBIDDEN_FP_LIBS_MESSAGE,
  })),
  patterns: [
    {
      group: FORBIDDEN_FP_LIB_NAMES.map((name) => `${name}/*`),
      message: FORBIDDEN_FP_LIBS_MESSAGE,
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "tmp/**",
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
  // Protocol may not depend on Node APIs, outer-layer packages, or forbidden FP libraries.
  {
    files: ["packages/protocol/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...FORBIDDEN_FP_LIBS.paths],
          patterns: [
            ...FORBIDDEN_FP_LIBS.patterns,
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
                "Protocol must not depend on Node APIs. Define a port instead.",
            },
            {
              group: [
                "@lgtm-buzzer/adapter-*",
                "@lgtm-buzzer/host",
                "@lgtm-buzzer/extension",
              ],
              message:
                "Protocol must not depend on outer-layer packages.",
            },
          ],
        },
      ],
    },
  },
  // Core may not depend on Node APIs, outer-layer packages, forbidden FP libraries,
  // or the monadyssey IO/Schedule surface (IO, Schedule, and related effect types).
  // Core is side-effect-free by construction; ports describe effectful capabilities,
  // adapters implement them. See CLAUDE.md per-package dependency policy.
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...FORBIDDEN_FP_LIBS.paths,
            {
              name: "monadyssey",
              importNames: [
                "IO",
                "Schedule",
                "Policy",
                "RepeatError",
                "RetryError",
                "PolicyValidationError",
                "TimeoutError",
                "CancellationError",
                "ConditionalRetryError",
                "Fiber",
                "Cancelled",
                "EvaluationError",
                "Reader",
              ],
              message:
                "Core must use only the IO-free surface of monadyssey (Either, Option, Eval, NonEmptyList, etc.). IO and Schedule belong in adapters. See CLAUDE.md per-package dependency policy.",
            },
          ],
          patterns: [
            ...FORBIDDEN_FP_LIBS.patterns,
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
                "Core must not depend on Node APIs. Define a port instead.",
            },
            {
              group: [
                "@lgtm-buzzer/adapter-*",
                "@lgtm-buzzer/host",
                "@lgtm-buzzer/extension",
              ],
              message:
                "Core must not depend on outer-layer packages.",
            },
          ],
        },
      ],
    },
  },
  // Ports in core may type-import `IO` from monadyssey (ADR-11 §Decision 6).
  // This block MUST restate ALL paths and patterns from the parent core block —
  // ESLint flat-config replaces (does not merge) rule configs on overlapping file
  // globs. Omitting any pattern would silently re-enable the banned import in
  // ports/. The only change from the parent block: `IO`'s entry adds
  // `allowTypeImports: true`. Value imports of IO remain forbidden.
  {
    files: ["packages/core/src/ports/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...FORBIDDEN_FP_LIBS.paths,
            {
              name: "monadyssey",
              importNames: [
                "Schedule",
                "Policy",
                "RepeatError",
                "RetryError",
                "PolicyValidationError",
                "TimeoutError",
                "CancellationError",
                "ConditionalRetryError",
                "Fiber",
                "Cancelled",
                "EvaluationError",
                "Reader",
              ],
              message:
                "Core must use only the IO-free surface of monadyssey (Either, Option, Eval, NonEmptyList, etc.). IO and Schedule belong in adapters. See CLAUDE.md per-package dependency policy.",
            },
            {
              name: "monadyssey",
              importNames: ["IO"],
              allowTypeImports: true,
              message:
                "Core must use only the IO-free surface of monadyssey (Either, Option, Eval, NonEmptyList, etc.). IO and Schedule belong in adapters. See CLAUDE.md per-package dependency policy.",
            },
          ],
          patterns: [
            ...FORBIDDEN_FP_LIBS.patterns,
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
                "Core must not depend on Node APIs. Define a port instead.",
            },
            {
              group: [
                "@lgtm-buzzer/adapter-*",
                "@lgtm-buzzer/host",
                "@lgtm-buzzer/extension",
              ],
              message:
                "Core must not depend on outer-layer packages.",
            },
          ],
        },
      ],
    },
  },
  // WXT entrypoints require default exports.
  {
    files: ["packages/extension/entrypoints/**/*.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // Extension may not depend on host or adapters directly, or on forbidden FP libraries.
  {
    files: ["packages/extension/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...FORBIDDEN_FP_LIBS.paths],
          patterns: [
            ...FORBIDDEN_FP_LIBS.patterns,
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
  // e2e tests run in Node via Playwright — node:* and default exports are allowed.
  // Narrow override: browser-side bans for entrypoints/** and src/** are unchanged.
  {
    files: ["packages/extension/e2e/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-syntax": "off",
    },
  },
  // Adapters and host may not import forbidden FP libraries.
  {
    files: ["packages/adapters/**/*.ts", "packages/host/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...FORBIDDEN_FP_LIBS.paths],
          patterns: [...FORBIDDEN_FP_LIBS.patterns],
        },
      ],
    },
  },
  // Evals workspace: re-apply forbidden FP libraries rule.
  // Node APIs and DOM APIs are explicitly allowed (evals run in Node only).
  // No dependency-direction constraints apply to evals — it imports from
  // adapters/* and core (the correct inward direction) and is never imported.
  {
    files: ["packages/evals/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...FORBIDDEN_FP_LIBS.paths],
          patterns: [...FORBIDDEN_FP_LIBS.patterns],
        },
      ],
    },
  },
);
