import { describe, it } from "vitest";
import { spawnIO } from "@lgtm-buzzer/adapter-shared";
import type { Diff } from "@lgtm-buzzer/core";
import { createClaudeCliProvider, defaultIdGenerator } from "./index.js";

/**
 * Integration test that calls the real `claude` CLI.
 *
 * Skipped by default — not in CI. Run manually with:
 *   npx vitest run packages/adapters/claude-cli/src/integration.test.ts
 *
 * Requires the `claude` CLI to be installed and authenticated in the test
 * environment. Set `CLAUDE_INTEGRATION=1` to un-skip locally if needed.
 */
describe.skip("createClaudeCliProvider (real claude CLI)", () => {
  it("generates a quiz from a real diff", async () => {
    const provider = createClaudeCliProvider({
      spawnIO,
      ids: defaultIdGenerator(),
      config: { model: "sonnet", timeoutMs: 120_000 },
    });

    const diff: Diff =
      `--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1,5 +1,8 @@\n-export const add = (a: number, b: number): number => a + b;\n+export const add = (a: number, b: number): number => {\n+  if (a < 0 || b < 0) {\n+    throw new RangeError('add: negative operands not allowed');\n+  }\n+  return a + b;\n+};\n` as Diff;

    const result = await provider
      .generateQuiz({ diff, questionCount: 2 })
      .unsafeRun();

    if (result.type === "Ok") {
      const quiz = result.value;
      console.info(
        `Integration: got ${quiz.questions.size} question(s) — quiz id ${quiz.id}`,
      );
    } else {
      throw new Error(`Integration test failed: ${JSON.stringify(result.error)}`);
    }
  }, 130_000 /* generous wall-clock timeout for CI-less runs */);
});
