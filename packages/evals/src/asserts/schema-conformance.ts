import { LlmQuizSchema } from "@lgtm-buzzer/adapter-shared";

/**
 * Assertion result shape matching the promptfoo `javascript` assert contract.
 *
 * `pass: true` — the assertion passed.
 * `pass: false` — the assertion failed; `reason` carries a human-readable explanation.
 */
export type AssertionResult = {
  readonly pass: boolean;
  readonly reason: string;
};

/**
 * Validates that a provider's output string is schema-conformant.
 *
 * Used as the body of the `javascript` assert in `promptfoo.config.yaml`.
 * Called by promptfoo with the `output` field of `EvalProviderResult`.
 *
 * Checks:
 * 1. `output` is non-empty (a skipped cell returns `""` and is tested by errKind).
 * 2. `output` parses as JSON.
 * 3. The parsed object satisfies `LlmQuizSchema` (from `@lgtm-buzzer/adapter-shared`).
 * 4. Every question's `correctChoiceIndex` is in bounds for its `choices` array.
 *
 * @param output - The `output` field from `EvalProviderResult`.
 * @returns `{ pass, reason }` for the promptfoo assertion runner.
 */
export const assertSchemaConformance = (output: string): AssertionResult => {
  // Step 1: allow skipped cells to pass (errKind assert handles the skip case).
  if (output === "") {
    return {
      pass: true,
      reason: "output is empty (skipped cell — errKind assert governs this cell)",
    };
  }

  // Step 2: parse as JSON.
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return {
      pass: false,
      reason: `output is not valid JSON: ${output.slice(0, 200)}`,
    };
  }

  // Step 3: validate against LlmQuizSchema.
  const result = LlmQuizSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message).join("; ");
    return {
      pass: false,
      reason: `schema validation failed: ${issues}`,
    };
  }

  // Step 4: cross-check correctChoiceIndex bounds.
  for (const question of result.data.questions) {
    if (question.correctChoiceIndex >= question.choices.length) {
      return {
        pass: false,
        reason: `correctChoiceIndex ${question.correctChoiceIndex} is out of bounds for choices.length ${question.choices.length}`,
      };
    }
  }

  return { pass: true, reason: "schema-conformant quiz" };
};
