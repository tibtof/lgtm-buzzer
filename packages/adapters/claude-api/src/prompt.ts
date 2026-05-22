import type { Diff } from "@lgtm-buzzer/core";
import { SYSTEM_PROMPT, buildUserMessage } from "@lgtm-buzzer/adapter-shared";

// Re-export SYSTEM_PROMPT so consumers of this module have access to it.
export { SYSTEM_PROMPT };

/**
 * The closed set of Anthropic model identifiers supported by this adapter.
 *
 * This is a closed union (not a free string) to prevent typos and ensure
 * prompt-caching eligibility. Adding a new model requires an ADR amendment
 * (ADR-20 §6).
 */
export type AnthropicModel =
  | "claude-sonnet-4-7"
  | "claude-opus-4-7"
  | "claude-haiku-4-5";

/**
 * The shape of the `system` block in an Anthropic Messages API request body.
 * Each block may carry optional prompt-caching metadata.
 */
type SystemBlock = {
  readonly type: "text";
  readonly text: string;
  readonly cache_control?: { readonly type: "ephemeral" };
};

/**
 * The shape of a content block inside a user message.
 */
type ContentBlock = {
  readonly type: "text";
  readonly text: string;
  readonly cache_control?: { readonly type: "ephemeral" };
};

/**
 * The full request body sent to `POST /v1/messages`.
 *
 * Two ephemeral cache blocks are added (system + diff user message) so that
 * quiz regeneration on the same PR within ~5 minutes is mostly cache hits.
 */
export type MessagesRequestBody = {
  readonly model: string;
  readonly max_tokens: number;
  readonly system: readonly SystemBlock[];
  readonly messages: readonly [
    {
      readonly role: "user";
      readonly content: readonly ContentBlock[];
    },
  ];
};

/**
 * Builds the full request body for a `POST /v1/messages` call.
 *
 * The signature has exactly 4 parameters — `diff`, `questionCount`, `model`,
 * `maxTokens`. Adding a 5th PR-derived parameter requires an ADR amendment
 * (ADR-20 §3 — diff-only invariant).
 *
 * Two `cache_control: { type: "ephemeral" }` blocks are attached:
 * 1. The system prompt block — stable across all calls, high cache hit rate.
 * 2. The user diff block — stable for the same PR within ~5 minutes.
 *
 * @param diff - The unified diff to embed verbatim in the user message.
 * @param questionCount - Number of questions to request from the model.
 * @param model - The Anthropic model to use.
 * @param maxTokens - Maximum tokens in the completion.
 * @returns A `MessagesRequestBody` object ready to JSON-serialize.
 */
export const buildMessagesPayload = (
  diff: Diff,
  questionCount: number,
  model: AnthropicModel,
  maxTokens: number,
): MessagesRequestBody => {
  const userMessage = buildUserMessage(diff, questionCount);

  return {
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: userMessage,
            cache_control: { type: "ephemeral" },
          },
        ],
      },
    ],
  };
};
