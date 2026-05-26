import { describe, expect, it } from "vitest";
import type { Diff } from "@lgtm-buzzer/core";
import { buildPrompt, SYSTEM_PROMPT } from "./prompt.js";

/** Test helper: brand a string as a `Diff`. */
const asDiff = (s: string): Diff => s as Diff;

describe("buildPrompt", () => {
  it("has exactly 2 parameters (diff-only invariant signature size)", () => {
    expect(buildPrompt.length).toBe(2);
  });

  it("happy path: includes the diff bytes verbatim", () => {
    const diff = asDiff("--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new\n");
    const result = buildPrompt(diff, 3);
    expect(result).toContain("--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new");
  });

  it("interpolates the question count into the user message", () => {
    const diff = asDiff("diff --git a/x.ts b/x.ts");
    const result = buildPrompt(diff, 5);
    expect(result).toContain("Generate 5 multiple-choice questions");
  });

  it("places the diff between <DIFF> and </DIFF> markers in the user section", () => {
    // The system prompt's schema example also contains <DIFF>/<\/DIFF> as
    // illustrative text. We look for the markers in the USER section only.
    const diff = asDiff("some diff content");
    const result = buildPrompt(diff, 2);
    const userSection = result.slice(result.lastIndexOf("USER:"));
    const openCount = (userSection.match(/<DIFF>/g) ?? []).length;
    const closeCount = (userSection.match(/<\/DIFF>/g) ?? []).length;
    expect(openCount).toBe(1);
    expect(closeCount).toBe(1);
  });

  it("diff bytes appear between the markers in the user section", () => {
    const diff = asDiff("UNIQUE_DIFF_TOKEN");
    const result = buildPrompt(diff, 1);
    // Use the last occurrence of <DIFF> (in the USER section)
    const openIdx = result.lastIndexOf("<DIFF>");
    const closeIdx = result.lastIndexOf("</DIFF>");
    const between = result.slice(openIdx + "<DIFF>".length, closeIdx);
    expect(between).toContain("UNIQUE_DIFF_TOKEN");
  });

  it("embeds the SYSTEM_PROMPT constant verbatim", () => {
    const diff = asDiff("x");
    const result = buildPrompt(diff, 1);
    expect(result).toContain(SYSTEM_PROMPT);
  });

  it("includes JSON output instruction", () => {
    const diff = asDiff("x");
    const result = buildPrompt(diff, 1);
    expect(result).toContain("Respond with a JSON object ONLY");
  });

  it("preserves newlines inside the diff", () => {
    const diff = asDiff("line1\nline2\nline3");
    const result = buildPrompt(diff, 1);
    expect(result).toContain("line1\nline2\nline3");
  });

  it("does not contain prompt-injection bait: 'ignore previous instructions'", () => {
    const diff = asDiff("x");
    const result = buildPrompt(diff, 1);
    expect(result.toLowerCase()).not.toContain("ignore previous instructions");
  });

  it("does not contain prompt-injection bait: 'you are a senior engineer'", () => {
    const diff = asDiff("x");
    const result = buildPrompt(diff, 1);
    expect(result.toLowerCase()).not.toContain("you are a senior engineer");
  });

  it("does not contain the literal string 'LGTM' as a bait answer", () => {
    const diff = asDiff("x");
    const result = buildPrompt(diff, 1);
    // The word LGTM should not appear in the static prompt template
    expect(result).not.toContain("LGTM");
  });

  it("does not reference the LLM's own name in the system prompt", () => {
    // Copilot and GitHub must not appear in the system prompt (prompt-injection hardening)
    expect(SYSTEM_PROMPT).not.toContain("Copilot");
    expect(SYSTEM_PROMPT).not.toContain("GitHub");
  });

  it("correctChoiceIndex schema hint appears in system prompt", () => {
    expect(SYSTEM_PROMPT).toContain("correctChoiceIndex");
  });

  // ADR-31 canary tests: ban-list phrases, few-shot markers, sweet-spot sentence
  it("ban-list: DO NOT section mentions line numbers", () => {
    expect(SYSTEM_PROMPT).toContain("Specific line numbers");
  });

  it("ban-list: DO NOT section mentions exact identifier names", () => {
    expect(SYSTEM_PROMPT).toContain("exact new name of a function");
  });

  it("ban-list: DO NOT section mentions file paths", () => {
    expect(SYSTEM_PROMPT).toContain("File paths or directory structure");
  });

  it("ban-list: DO NOT section mentions unchanged context", () => {
    expect(SYSTEM_PROMPT).toContain("unchanged function");
  });

  it("few-shot: BAD marker is present", () => {
    expect(SYSTEM_PROMPT).toContain("// BAD");
  });

  it("few-shot: GOOD marker is present", () => {
    expect(SYSTEM_PROMPT).toContain("// GOOD");
  });

  it("sweet-spot: teammate test sentence is present", () => {
    expect(SYSTEM_PROMPT).toContain("teammate who has read");
  });

  it("length sanity: SYSTEM_PROMPT is at least 1 KB and at most 8 KB", () => {
    const bytes = Buffer.byteLength(SYSTEM_PROMPT, "utf8");
    expect(bytes).toBeGreaterThan(1000);
    expect(bytes).toBeLessThan(8000);
  });

  it("handles backticks in diff without breaking format", () => {
    const diff = asDiff("const x = `template ${literal}`");
    const result = buildPrompt(diff, 1);
    expect(result).toContain("const x = `template ${literal}`");
  });

  it("question count 1 singular form is preserved literally", () => {
    const diff = asDiff("x");
    const result = buildPrompt(diff, 1);
    expect(result).toContain("Generate 1 multiple-choice questions");
  });
});
