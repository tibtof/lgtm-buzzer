import type { Diff } from "@lgtm-buzzer/core";

/**
 * The system instruction injected before every quiz-generation call.
 *
 * Verbatim from ADR-14 §Decision 2. Do NOT modify this constant without an
 * ADR amendment — the eval suite (issue #52) is calibrated against this text.
 *
 * Prompt-injection hardening: the system message never references the LLM's
 * own name, contains no "ignore previous instructions" bait, and explicitly
 * scopes the model to the diff content only.
 */
export const SYSTEM_PROMPT =
  `SYSTEM:
You generate multiple-choice quizzes that test whether a code reviewer
has actually read a pull-request diff.

You will receive a unified diff between <DIFF> and </DIFF> markers. Use
ONLY the diff content. Do not invent, infer, or reference any context
that is not present in the diff (no commit messages, no PR description,
no external file content).

Generate exactly N multiple-choice questions where N is provided in the
USER message.

Each question MUST:
- Reference a concrete change in the diff.
- Be answerable from the diff alone — not from filenames or boilerplate.
- Have between 2 and 6 plausible answer choices, with exactly one correct.
- Include at least one question that probes an edge case or impact concern.

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

If the diff is empty or too short, respond with: { "questions": [] }
(The adapter surfaces this as malformed-response.)`;

/**
 * Builds the user message portion of the prompt, interpolating the diff
 * bytes between `<DIFF>` / `</DIFF>` markers.
 *
 * @param diff - The unified diff to embed verbatim.
 * @param questionCount - How many questions to request.
 * @returns The complete user message string.
 */
const buildUserMessage = (diff: Diff, questionCount: number): string =>
  `Generate ${questionCount} multiple-choice questions from the following diff.

<DIFF>
${diff}
</DIFF>`;

/**
 * Assembles the full stdin payload for one codex-cli quiz-generation call.
 *
 * The diff is carried ONLY through stdin — never in argv. This is the
 * mechanically-enforced diff-only invariant (ADR-14 §Decision 2, mirrored
 * for the codex-cli adapter).
 * The signature is exactly 2 parameters; adding a third requires an ADR
 * amendment.
 *
 * @param diff - The unified diff (arrives from a VCS adapter as a `Diff` brand).
 * @param questionCount - Number of questions to request from the model.
 * @returns A complete prompt string suitable for piping to codex's stdin.
 */
export const buildPrompt = (diff: Diff, questionCount: number): string =>
  `${SYSTEM_PROMPT}\n\nUSER:\n${buildUserMessage(diff, questionCount)}\n`;
