import { Left, NonEmptyList, Right } from "monadyssey";
import type { Either } from "monadyssey";
import { z } from "zod";
import type { LLMProviderError, Quiz, Question, Choice } from "@lgtm-buzzer/core";
import type { IdGenerator } from "./ids.js";

/** Maximum number of bytes kept in `raw` error payloads (8 KiB). */
export const MAX_RAW_BYTES = 8 * 1024;

/**
 * Clips a string to at most `MAX_RAW_BYTES` characters.
 *
 * Used to cap the `raw` field in `LLMProviderError.malformed-response`
 * so that error payloads don't balloon with large LLM responses.
 *
 * @param s - The string to clip.
 * @returns The string unchanged if it fits; the first `MAX_RAW_BYTES` chars otherwise.
 */
export const clipRaw = (s: string): string =>
  s.length > MAX_RAW_BYTES ? s.slice(0, MAX_RAW_BYTES) : s;

/** Regex that strips optional markdown code fences around JSON. */
export const CODE_FENCE_RE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

/** The shape of a single question as emitted by the model. */
export const LlmQuestionSchema = z.object({
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(6),
  correctChoiceIndex: z.number().int().min(0),
  explanation: z.string().min(1).optional(),
});

/** The top-level shape of the model's JSON payload. */
export const LlmQuizSchema = z.object({
  questions: z.array(LlmQuestionSchema).min(1),
});

type LlmQuestion = z.infer<typeof LlmQuestionSchema>;

/**
 * Parses the model's raw text output (after envelope extraction) into a `Quiz`
 * domain object.
 *
 * This is the shared core of the response parsing pipeline used by both
 * `claude-cli` (step 3-7 of ADR-14) and `claude-api` (step 3-7 of ADR-20):
 *
 * 1. Strip optional markdown code fences.
 * 2. `JSON.parse` the stripped text → `LlmQuizSchema`. Fail → `malformed-response`.
 * 3. Cross-check `correctChoiceIndex < choices.length`. Out-of-bounds → `malformed-response`.
 * 4. Empty questions → `malformed-response { detail: "empty-quiz" }`.
 * 5. Map to `core.Quiz` via the injected `IdGenerator`.
 *
 * @param text - The raw text content from the model (may include markdown fences).
 * @param ids - Injected ID factory; use `defaultIdGenerator()` in production.
 * @returns `Right<Quiz>` on success, `Left<LLMProviderError>` on any parse failure.
 */
export const parseQuizFromText = (
  text: string,
  ids: IdGenerator,
): Either<LLMProviderError, Quiz> => {
  // Step 1: strip markdown fences if present
  let modelText = text;
  const fenceMatch = CODE_FENCE_RE.exec(modelText.trim());
  if (fenceMatch !== null && fenceMatch[1] !== undefined) {
    modelText = fenceMatch[1];
  }

  // Step 2: parse model JSON
  let quizRaw: unknown;
  try {
    quizRaw = JSON.parse(modelText);
  } catch {
    return Left.pure<LLMProviderError>({
      kind: "malformed-response",
      detail: "model-output-not-json",
      raw: clipRaw(modelText),
    });
  }

  const quizResult = LlmQuizSchema.safeParse(quizRaw);
  if (!quizResult.success) {
    return Left.pure<LLMProviderError>({
      kind: "malformed-response",
      detail: `quiz-schema: ${quizResult.error.issues.map((i) => i.message).join("; ")}`,
      raw: clipRaw(modelText),
    });
  }

  const llmQuestions = quizResult.data.questions;

  // Step 3: cross-check correctChoiceIndex bounds
  for (const q of llmQuestions) {
    if (q.correctChoiceIndex >= q.choices.length) {
      return Left.pure<LLMProviderError>({
        kind: "malformed-response",
        detail: "correctChoiceIndex out of range",
      });
    }
  }

  // Step 4: empty questions guard (LlmQuizSchema.min(1) catches this during
  // schema parse, but we keep an explicit guard for completeness)
  if (llmQuestions.length === 0) {
    return Left.pure<LLMProviderError>({
      kind: "malformed-response",
      detail: "empty-quiz",
    });
  }

  // Step 5: map to core.Quiz
  const questions = llmQuestions.map((q: LlmQuestion): Question => {
    const choiceObjects: Choice[] = q.choices.map(
      (label): Choice => ({ id: ids.choiceId(), label }),
    );
    // correctChoiceIndex is guaranteed in-bounds by step 3
    const correctChoice = choiceObjects[q.correctChoiceIndex];
    if (correctChoice === undefined) {
      // This is an invariant violation — the bounds check in step 3 must have
      // been bypassed. Throw to surface the programmer error.
      throw new Error(
        `Invariant violation: correctChoiceIndex ${q.correctChoiceIndex} out of bounds after bounds check`,
      );
    }
    const base = {
      type: "multiple-choice" as const,
      id: ids.questionId(),
      prompt: q.prompt,
      choices: NonEmptyList.fromArray(choiceObjects),
      correctChoiceId: correctChoice.id,
    };
    return q.explanation !== undefined
      ? { ...base, explanation: q.explanation }
      : base;
  });

  return Right.pure<Quiz>({
    id: ids.quizId(),
    questions: NonEmptyList.fromArray(questions),
  });
};
