import { Left } from "monadyssey";
import type { Either } from "monadyssey";
import { z } from "zod";
import type { LLMProviderError, Quiz } from "@lgtm-buzzer/core";
import { clipRaw, parseQuizFromText } from "@lgtm-buzzer/adapter-shared";
import type { IdGenerator } from "@lgtm-buzzer/adapter-shared";

/**
 * Schema for the outer envelope of an Anthropic Messages API response.
 *
 * Tolerant of unknown content block types (future-proofing) while requiring
 * at least one block. Per ADR-20 §4.
 */
export const AnthropicMessageEnvelopeSchema = z.object({
  type: z.literal("message"),
  role: z.literal("assistant"),
  content: z
    .array(
      z.union([
        z.object({ type: z.literal("text"), text: z.string().min(1) }),
        z.object({ type: z.string() }).passthrough(),
      ]),
    )
    .min(1),
  stop_reason: z
    .enum(["end_turn", "max_tokens", "stop_sequence", "tool_use"])
    .nullable()
    .optional(),
});

type AnthropicEnvelope = z.infer<typeof AnthropicMessageEnvelopeSchema>;

/**
 * Parses the raw JSON body returned by the Anthropic Messages API into a
 * `Quiz` domain object.
 *
 * Implements the 7-step pipeline from ADR-20 §4:
 * 1. Validate envelope against `AnthropicMessageEnvelopeSchema`.
 * 2. Find the first text block.
 * 3–7. Delegated to `parseQuizFromText` from `@lgtm-buzzer/adapter-shared`.
 *
 * The `raw` field in error payloads is clipped to 8 KiB. The API key MUST NOT
 * appear in any error payload.
 *
 * @param body - The parsed JSON body from the Anthropic response (type `unknown`).
 * @param ids - Injected ID factory; use `defaultIdGenerator()` in production.
 * @returns `Right<Quiz>` on success, `Left<LLMProviderError>` on any parse failure.
 */
export const parseAnthropicResponse = (
  body: unknown,
  ids: IdGenerator,
): Either<LLMProviderError, Quiz> => {
  // Step 1: validate envelope
  const envelopeResult = AnthropicMessageEnvelopeSchema.safeParse(body);
  if (!envelopeResult.success) {
    const raw = typeof body === "string" ? clipRaw(body) : clipRaw(JSON.stringify(body));
    return Left.pure<LLMProviderError>({
      kind: "malformed-response",
      detail: `envelope-schema: ${envelopeResult.error.issues.map((i) => i.message).join("; ")}`,
      raw,
    });
  }

  const envelope: AnthropicEnvelope = envelopeResult.data;

  // Step 2: find the first text block
  const textBlock = envelope.content.find(
    (block): block is { type: "text"; text: string } => block.type === "text",
  );

  if (textBlock === undefined) {
    return Left.pure<LLMProviderError>({
      kind: "malformed-response",
      detail: "no-text-block",
      raw: clipRaw(JSON.stringify(envelope.content)),
    });
  }

  // Steps 3–7: delegated to shared parser
  return parseQuizFromText(textBlock.text, ids);
};
