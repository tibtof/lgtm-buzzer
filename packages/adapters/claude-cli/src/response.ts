import { Left, Right } from "monadyssey";
import type { Either } from "monadyssey";
import { z } from "zod";
import type { LLMProviderError, Quiz } from "@lgtm-buzzer/core";
import {
  LlmQuestionSchema,
  LlmQuizSchema,
  clipRaw,
  parseQuizFromText,
} from "@lgtm-buzzer/adapter-shared";
import type { IdGenerator } from "./ids.js";

// Re-export shared schemas so existing consumers of this module are unaffected.
export { LlmQuestionSchema, LlmQuizSchema };

/**
 * Schema for the outer JSON envelope that `claude --output-format json`
 * always wraps around the model's response.
 */
export const ClaudePrintEnvelopeSchema = z.object({
  type: z.literal("result"),
  subtype: z
    .enum(["success", "error_max_turns", "error_during_execution"])
    .optional(),
  result: z.string().min(1),
});

/**
 * Pure function that parses the raw stdout from a `claude --output-format json`
 * run into a `Quiz` domain object.
 *
 * Implements the 7-step pipeline from ADR-14 §Decision 3:
 * 1. Parse stdout as JSON → `ClaudePrintEnvelopeSchema`. Fail → `malformed-response`.
 * 2. Extract `envelope.result`.
 * 3–7. Delegated to `parseQuizFromText` from `@lgtm-buzzer/adapter-shared`.
 *
 * The `raw` field in error payloads is the LLM's response clipped to 8 KiB.
 * It MUST NOT contain diff bytes (the diff is never present in stdout).
 *
 * @param stdout - The full stdout captured from the claude CLI process.
 * @param ids - Injected ID factory; use `defaultIdGenerator()` in production.
 * @returns `Right<Quiz>` on success, `Left<LLMProviderError>` on any parse failure.
 */
export const parseResponse = (
  stdout: string,
  ids: IdGenerator,
): Either<LLMProviderError, Quiz> => {
  // Step 1: parse outer envelope
  let envelopeRaw: unknown;
  try {
    envelopeRaw = JSON.parse(stdout);
  } catch {
    return Left.pure<LLMProviderError>({
      kind: "malformed-response",
      detail: "envelope-parse-failed",
      raw: clipRaw(stdout),
    });
  }

  const envelopeResult = ClaudePrintEnvelopeSchema.safeParse(envelopeRaw);
  if (!envelopeResult.success) {
    return Left.pure<LLMProviderError>({
      kind: "malformed-response",
      detail: `envelope-schema: ${envelopeResult.error.issues.map((i) => i.message).join("; ")}`,
      raw: clipRaw(stdout),
    });
  }

  // Step 2: extract model text; steps 3–7 handled by shared helper
  const modelText = envelopeResult.data.result;
  return parseQuizFromText(modelText, ids);
};

// Ensure Right and Left imports are not unused (used via parseQuizFromText delegate).
// These re-exports are kept for any consumers that may import them directly.
export type { Either };
export { Right, Left };
