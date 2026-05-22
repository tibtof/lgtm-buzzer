import { describe, it, expect } from "vitest";
import type { Diff } from "@lgtm-buzzer/core";
import { buildMessagesPayload, SYSTEM_PROMPT } from "./prompt.js";
import type { AnthropicModel } from "./prompt.js";

/** Brand a string as Diff for tests. */
const asDiff = (s: string): Diff => s as Diff;

const MODEL: AnthropicModel = "claude-sonnet-4-7";
const MAX_TOKENS = 4096;

describe("buildMessagesPayload", () => {
  it("has exactly 4 parameters (diff-only invariant signature size)", () => {
    expect(buildMessagesPayload.length).toBe(4);
  });

  it("happy path: returns a valid MessagesRequestBody object", () => {
    const payload = buildMessagesPayload(asDiff("diff content"), 3, MODEL, MAX_TOKENS);
    expect(payload.model).toBe(MODEL);
    expect(payload.max_tokens).toBe(MAX_TOKENS);
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0]?.role).toBe("user");
  });

  it("model field is set from the model argument", () => {
    const payload = buildMessagesPayload(asDiff("x"), 1, "claude-haiku-4-5", MAX_TOKENS);
    expect(payload.model).toBe("claude-haiku-4-5");
  });

  it("max_tokens field is set from the maxTokens argument", () => {
    const payload = buildMessagesPayload(asDiff("x"), 1, MODEL, 2048);
    expect(payload.max_tokens).toBe(2048);
  });

  it("system block contains the SYSTEM_PROMPT text", () => {
    const payload = buildMessagesPayload(asDiff("x"), 1, MODEL, MAX_TOKENS);
    expect(payload.system).toHaveLength(1);
    expect(payload.system[0]?.text).toBe(SYSTEM_PROMPT);
  });

  it("system block has cache_control: { type: 'ephemeral' }", () => {
    const payload = buildMessagesPayload(asDiff("x"), 1, MODEL, MAX_TOKENS);
    expect(payload.system[0]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("user content block has cache_control: { type: 'ephemeral' }", () => {
    const payload = buildMessagesPayload(asDiff("x"), 1, MODEL, MAX_TOKENS);
    const content = payload.messages[0]?.content;
    expect(content).toHaveLength(1);
    expect(content?.[0]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("BINDING: diff bytes appear only inside <DIFF>...</DIFF> in the user content", () => {
    const diffMarker = "UNIQUE_CANARY_DIFF_TOKEN_PR_DESCRIPTION_LEAK_GUARD";
    const payload = buildMessagesPayload(asDiff(diffMarker), 3, MODEL, MAX_TOKENS);

    // System prompt must NOT contain the canary diff marker
    const systemText = payload.system[0]?.text ?? "";
    expect(systemText).not.toContain(diffMarker);

    // Model field must NOT contain the canary
    expect(payload.model).not.toContain(diffMarker);

    // The user content must contain the canary only between markers
    const userText = payload.messages[0]?.content[0]?.text ?? "";
    expect(userText).toContain(diffMarker);

    const openIdx = userText.indexOf("<DIFF>");
    const closeIdx = userText.indexOf("</DIFF>");
    expect(openIdx).toBeGreaterThanOrEqual(0);
    expect(closeIdx).toBeGreaterThan(openIdx);
    const between = userText.slice(openIdx + "<DIFF>".length, closeIdx);
    expect(between).toContain(diffMarker);

    // Nothing before <DIFF> should contain the diff marker
    const beforeDiff = userText.slice(0, openIdx);
    expect(beforeDiff).not.toContain(diffMarker);
  });

  it("question count is interpolated into the user content", () => {
    const payload = buildMessagesPayload(asDiff("x"), 7, MODEL, MAX_TOKENS);
    const userText = payload.messages[0]?.content[0]?.text ?? "";
    expect(userText).toContain("Generate 7 multiple-choice questions");
  });

  it("SYSTEM_PROMPT identity: system block text matches the shared constant", () => {
    const payload = buildMessagesPayload(asDiff("x"), 1, MODEL, MAX_TOKENS);
    expect(payload.system[0]?.text).toBe(SYSTEM_PROMPT);
  });

  it("all AnthropicModel values are accepted without error", () => {
    const models: AnthropicModel[] = ["claude-sonnet-4-7", "claude-opus-4-7", "claude-haiku-4-5"];
    for (const m of models) {
      const payload = buildMessagesPayload(asDiff("x"), 1, m, MAX_TOKENS);
      expect(payload.model).toBe(m);
    }
  });

  it("preserves newlines inside the diff", () => {
    const diff = asDiff("line1\nline2\nline3");
    const payload = buildMessagesPayload(diff, 1, MODEL, MAX_TOKENS);
    const userText = payload.messages[0]?.content[0]?.text ?? "";
    expect(userText).toContain("line1\nline2\nline3");
  });
});
