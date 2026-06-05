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
 * Schema for one NDJSON line in the `claude --output-format stream-json`
 * output (ADR-36). We only care about the `result` line for quiz parsing;
 * all other lines are handled by the streaming reducer in stream.ts.
 */
export const StreamJsonResultLineSchema = z.object({
  type: z.literal("result"),
  result: z.string().min(1),
});

/**
 * Extract the complete model text from a `--output-format stream-json` stdout
 * blob (ADR-36 §2).
 *
 * The strategy: scan the full buffered stdout for the LAST line whose
 * `type === "result"` and return its `result` field. This is identical in
 * content to what `--output-format json` returned in the old `.result` field.
 * The parser (`parseQuizFromText`) remains unchanged — it always sees the
 * complete model text.
 *
 * BINDING: This function reads the complete buffered stdout, not the streaming
 * incremental data. Streaming cannot corrupt the parse.
 *
 * @param stdout - The full buffered stdout from the claude CLI process.
 * @returns `Right<string>` (the model text) or `Left<LLMProviderError>`.
 */
export const selectResultText = (stdout: string): Either<LLMProviderError, string> => {
  const lines = stdout.split("\n");
  let lastResultText: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const parsed = StreamJsonResultLineSchema.safeParse(obj);
    if (parsed.success) {
      lastResultText = parsed.data.result;
    }
  }

  if (lastResultText === undefined) {
    return Left.pure<LLMProviderError>({
      kind: "malformed-response",
      detail: "no-result-event",
      raw: clipRaw(stdout),
    });
  }

  return Right.pure(lastResultText);
};

/**
 * Parse the raw stdout from a `claude --output-format stream-json` run into
 * a `Quiz` domain object (ADR-36).
 *
 * Pipeline:
 * 1. `selectResultText(stdout)` — find the terminal `{type:"result"}` line
 *    and extract its `result` field. Fail → `malformed-response { detail: "no-result-event" }`.
 * 2. `parseQuizFromText(modelText, ids)` — existing 7-step pipeline.
 *
 * The `raw` field in error payloads is clipped to 8 KiB and MUST NOT
 * contain diff bytes (the diff is in stdin only, never in stdout).
 *
 * @param stdout - The full buffered stdout captured from the claude CLI process.
 * @param ids - Injected ID factory; use `defaultIdGenerator()` in production.
 * @returns `Right<Quiz>` on success, `Left<LLMProviderError>` on any failure.
 */
export const parseResponse = (
  stdout: string,
  ids: IdGenerator,
): Either<LLMProviderError, Quiz> => {
  return selectResultText(stdout).fold(
    (err) => Left.pure<LLMProviderError>(err),
    (modelText) => parseQuizFromText(modelText, ids),
  );
};

// Ensure Right and Left imports are not unused (used via parseQuizFromText delegate).
// These re-exports are kept for any consumers that may import them directly.
export type { Either };
export { Right, Left };
