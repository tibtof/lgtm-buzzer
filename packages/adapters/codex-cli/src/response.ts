import { Left, NonEmptyList, Right } from "monadyssey";
import type { Either } from "monadyssey";
import { z } from "zod";
import type { LLMProviderError, Quiz, Question, Choice } from "@lgtm-buzzer/core";
import type { IdGenerator } from "./ids.js";

/** Maximum number of bytes kept in `raw` error payloads (8 KiB). */
const MAX_RAW_BYTES = 8 * 1024;

/** Clip a string to at most `MAX_RAW_BYTES` characters. */
const clipRaw = (s: string): string =>
  s.length > MAX_RAW_BYTES ? s.slice(0, MAX_RAW_BYTES) : s;

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

/** Regex that strips optional markdown code fences around JSON. */
const CODE_FENCE_RE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

/**
 * Pure function that parses the raw stdout from a `codex exec` run into a
 * `Quiz` domain object.
 *
 * Unlike the claude-cli adapter, codex does not wrap its output in a JSON
 * envelope — the model's text is emitted directly to stdout. The pipeline is:
 *
 * 1. Strip optional markdown code fences from stdout.
 * 2. `JSON.parse` the stripped text → `LlmQuizSchema`. Fail → `malformed-response`.
 * 3. Cross-check `correctChoiceIndex < choices.length`. OOB → `malformed-response`.
 * 4. Empty `questions` array → `malformed-response { detail: "empty-quiz" }`.
 * 5. Map to `core.Quiz` via the injected `IdGenerator`.
 *
 * The `raw` field in error payloads is the LLM's response clipped to 8 KiB.
 * It MUST NOT contain diff bytes (the diff is never present in stdout).
 *
 * @param stdout - The full stdout captured from the codex CLI process.
 * @param ids - Injected ID factory; use `defaultIdGenerator()` in production.
 * @returns `Right<Quiz>` on success, `Left<LLMProviderError>` on any parse failure.
 */
export const parseResponse = (
  stdout: string,
  ids: IdGenerator,
): Either<LLMProviderError, Quiz> => {
  // Step 1: strip markdown fences if present
  let modelText = stdout.trim();
  const fenceMatch = CODE_FENCE_RE.exec(modelText);
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
      raw: clipRaw(stdout),
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
