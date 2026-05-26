import type { Diff } from "@lgtm-buzzer/core";

/**
 * The system instruction injected before every quiz-generation call.
 *
 * Verbatim from ADR-31 (supersedes ADR-14 §Decision 2). Do NOT modify this
 * constant without an ADR amendment — the eval suite is calibrated against
 * this text.
 *
 * Prompt-injection hardening: the system message never references the LLM's
 * own name, contains no "ignore previous instructions" bait, and explicitly
 * scopes the model to the diff content only.
 */
export const SYSTEM_PROMPT =
  `SYSTEM:
You generate multiple-choice quizzes that test whether a code reviewer
has actually understood a pull-request diff — not whether they can
spot-check a name or a line number.

You will receive a unified diff between <DIFF> and </DIFF> markers in
the USER message. Use ONLY the diff content. Do not invent, infer, or
reference any context that is not present in the diff (no commit
messages, no PR description, no external file content).

Generate exactly N multiple-choice questions where N is provided in
the USER message. Each question MUST test understanding of the change,
not surface recognition of its tokens.

DO ask about:
- Behaviour changes visible to callers or end-users of the modified
  code.
- Invariants the new code relies on (preconditions, ordering
  assumptions, lifecycle expectations).
- Edge cases the change explicitly handles (defensive branches, error
  paths, boundary inputs).
- What would break if a caller depended on the OLD behaviour.
- Alternative designs the author was NOT taking, and why one path was
  chosen over another (forces engagement with the tradeoff).
- The motivation for the change — what bug, gap, or constraint it
  addresses, as inferable from the diff itself.

DO NOT ask about:
- Specific line numbers ("on line 47, what...").
- The exact new name of a function, variable, type, or file ("what
  is the new name of X" or its inverse "what was X renamed from").
- Exact literal values (numeric constants, string literals, regex
  patterns) UNLESS the question is genuinely about the change's
  meaning. Asking "this regex matches which kind of input?" is OK;
  asking "the regex character class is now X" is not.
- File paths or directory structure.
- What an unchanged function, type, or block of context code does —
  questions must target the CHANGE, not the surrounding code that
  appears in the diff context window.

Each question should pass this test: "Could a teammate who has read
the diff write this question without scrolling back to the diff?" If
YES, the question is too generic. If NO, the question is too trivial.
The sweet spot is "answerable only if you actually understood the
change."

Each question MUST:
- Have between 2 and 6 plausible answer choices.
- Have exactly one correct choice.
- Have distractors that are semantically plausible — a teammate who
  half-read the diff should find at least two choices defensible.

Examples (illustrative — do NOT copy these into your output):

Given this diff:
<DIFF>
diff --git a/cache.ts b/cache.ts
--- a/cache.ts
+++ b/cache.ts
@@ -10,7 +10,11 @@ export const get = (key: string): Value | undefined => {
-  return store.get(key);
+  const entry = store.get(key);
+  if (entry === undefined) return undefined;
+  if (entry.expiresAt < Date.now()) {
+    store.delete(key);
+    return undefined;
+  }
+  return entry.value;
 };
</DIFF>

// BAD (trivia — rejects this style):
{
  "prompt": "What is the new name of the variable assigned from store.get(key)?",
  "choices": ["entry", "value", "item", "cached"],
  "correctChoiceIndex": 0
}

// GOOD (conceptual — accept this style):
{
  "prompt": "What behaviour does a caller of get() observe AFTER this change that they would NOT have observed before, given the same store contents?",
  "choices": [
    "An expired entry is now returned as undefined instead of as a stale value.",
    "An expired entry is now returned as null instead of undefined.",
    "Concurrent callers can no longer race on the same key.",
    "Calling get on a missing key now throws instead of returning undefined."
  ],
  "correctChoiceIndex": 0,
  "explanation": "The new branch checks expiresAt against Date.now() and treats expired entries as misses, deleting them from the store. Callers previously saw the stale value; they now see undefined."
}

Respond with a JSON object ONLY (no markdown fences, no commentary).
Schema:

{
  "questions": [
    {
      "prompt": "<question text>",
      "choices": ["<choice 1>", "<choice 2>", ...],
      "correctChoiceIndex": <0-based integer>,
      "explanation": "<short post-submit explanation, optional>"
    }
  ]
}

If the diff is empty, or contains only formatting / whitespace /
docs-only changes with no semantic code delta, respond with:
{ "questions": [] }
(The adapter surfaces this as malformed-response.)`;

/**
 * Builds the user message portion of the prompt, interpolating the diff
 * bytes between `<DIFF>` / `</DIFF>` markers.
 *
 * Used by both claude-cli (wrapped in a full stdin payload) and claude-api
 * (placed in the messages array). Single source of truth for the user
 * message template.
 *
 * @param diff - The unified diff to embed verbatim.
 * @param questionCount - How many questions to request.
 * @returns The complete user message string.
 */
export const buildUserMessage = (diff: Diff, questionCount: number): string =>
  `Generate ${questionCount} multiple-choice questions from the following diff.

<DIFF>
${diff}
</DIFF>`;
