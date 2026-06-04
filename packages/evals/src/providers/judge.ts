/**
 * Promptfoo custom file provider for the `llm-rubric` assertion (ADR-31).
 *
 * Auto-detects the local LLM CLI to use as judge. Resolution order:
 * `claude` → `codex` → `copilot` → `claude-api`.
 *
 * Override with `LGTM_EVAL_JUDGE=claude|codex|copilot|claude-api`.
 *
 * NOTE: The default export below is required by promptfoo's `loadApiProvider`
 * which calls `new Module(options)` on the compiled JS. This is the only file
 * in the codebase that uses a default export; it is a framework-mandated
 * exception to CLAUDE.md §Code style "Named exports only".
 */

import { spawnIO } from "@lgtm-buzzer/adapter-shared";
import { createAnthropicHttpClient } from "@lgtm-buzzer/adapter-claude-api";
import { z } from "zod";
import { checkBinary, checkAnthropicApiKey } from "./precheck.js";

/** Valid judge kind values. */
export type JudgeKind = "claude" | "codex" | "copilot" | "claude-api";

const VALID_JUDGE_KINDS: readonly JudgeKind[] = ["claude", "codex", "copilot", "claude-api"];

/**
 * Zod schema for the judge's verdict response.
 *
 * The judge MUST respond with JSON matching this schema.
 * The `score` field is the minimum of the three axis scores.
 */
const JudgeVerdictSchema = z.object({
  relevance: z.number().int().min(1).max(5),
  conceptualDepth: z.number().int().min(1).max(5),
  discrimination: z.number().int().min(1).max(5),
  score: z.number().int().min(1).max(5),
  notes: z.string().min(1),
});

/** Parsed judge verdict. */
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

/** Result shape returned to promptfoo from the `llm-rubric` provider. */
export type PromptfooLlmRubricResult = {
  readonly pass: boolean;
  readonly score: number;
  readonly reason: string;
};

/**
 * Resolved judge state — either a specific judge is ready, or none could
 * be found.
 */
export type JudgeResolution =
  | { readonly kind: "resolved"; readonly judge: JudgeKind; readonly how: string }
  | { readonly kind: "unresolvable"; readonly reason: string };

/** Cache slot — populated on first `callApi` invocation, reused thereafter. */
let resolvedJudgeCache: JudgeResolution | undefined;

/**
 * Resolves the judge once per process. Subsequent calls return the cached value.
 *
 * Resolution order (ADR-31 §Part 2):
 * 1. `LGTM_EVAL_JUDGE` set + valid + precheck passes → use that judge.
 * 2. `LGTM_EVAL_JUDGE` set + unknown value → throw (programmer error / typo).
 * 3. `LGTM_EVAL_JUDGE` set + valid + precheck fails → throw (explicit intent failed).
 * 4. Unset → auto-detect `claude` → `codex` → `copilot` → `claude-api`.
 * 5. None available → throw listing all failures.
 *
 * @returns The resolved `JudgeResolution`.
 */
export const resolveJudge = async (): Promise<JudgeResolution> => {
  if (resolvedJudgeCache !== undefined) {
    return resolvedJudgeCache;
  }

  const envJudge = process.env["LGTM_EVAL_JUDGE"];

  if (envJudge !== undefined) {
    const trimmed = envJudge.trim();
    if (trimmed === "") {
      // Treat empty string as unset.
    } else if (!isValidJudgeKind(trimmed)) {
      throw new Error(
        `LGTM_EVAL_JUDGE=${JSON.stringify(trimmed)} is not a valid judge kind. ` +
          `Valid values: ${VALID_JUDGE_KINDS.join(", ")}`,
      );
    } else {
      const kind: JudgeKind = trimmed as JudgeKind;
      const precheck = await runPrecheck(kind);
      if (precheck.kind === "skipped") {
        throw new Error(
          `LGTM_EVAL_JUDGE=${kind} was explicitly requested, but precheck failed: ${precheck.reason}`,
        );
      }
      const resolution: JudgeResolution = {
        kind: "resolved",
        judge: kind,
        how: `env LGTM_EVAL_JUDGE=${kind}`,
      };
      resolvedJudgeCache = resolution;
      process.stderr.write(`[lgtm-evals] judge: ${kind} (${resolution.how})\n`);
      return resolution;
    }
  }

  // Auto-detect: try each judge in precedence order.
  const failures: string[] = [];
  for (const candidate of VALID_JUDGE_KINDS) {
    const precheck = await runPrecheck(candidate);
    if (precheck.kind === "available") {
      const resolution: JudgeResolution = {
        kind: "resolved",
        judge: candidate,
        how: "auto-detected",
      };
      resolvedJudgeCache = resolution;
      process.stderr.write(`[lgtm-evals] judge: ${candidate} (${resolution.how})\n`);
      return resolution;
    }
    failures.push(`  ${candidate}: ${precheck.reason}`);
  }

  const reason =
    `No judge available. Tried all four candidates:\n${failures.join("\n")}\n` +
    `Set LGTM_EVAL_JUDGE=claude|codex|copilot|claude-api and ensure the binary is installed.`;
  throw new Error(reason);
};

/** Resets the judge cache. Used only in tests. */
export const _resetJudgeCache = (): void => {
  resolvedJudgeCache = undefined;
};

const isValidJudgeKind = (value: string): value is JudgeKind =>
  (VALID_JUDGE_KINDS as readonly string[]).includes(value);

type PrecheckResult = { kind: "available" } | { kind: "skipped"; reason: string };

const runPrecheck = async (judge: JudgeKind): Promise<PrecheckResult> => {
  switch (judge) {
    case "claude":
      return checkBinary("claude");
    case "codex":
      return checkBinary("codex");
    case "copilot":
      return checkBinary("gh");
    case "claude-api":
      return checkAnthropicApiKey();
  }
};

// ─── Output parsing ────────────────────────────────────────────────────────

/**
 * Strips optional ```json...``` fences from a text response.
 *
 * Tolerant: if no fence is found, the original text is returned untouched.
 *
 * @param text - The raw text from the judge.
 * @returns The text with any outermost JSON fence stripped.
 */
const stripJsonFences = (text: string): string => {
  const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenced !== null && fenced[1] !== undefined) {
    return fenced[1].trim();
  }
  return text.trim();
};

/**
 * Parses a text response from the judge into a `JudgeVerdict`.
 *
 * Steps:
 * 1. Strip optional ```json fences.
 * 2. `JSON.parse`.
 * 3. Validate against `JudgeVerdictSchema`.
 *
 * @param text - The raw text output from the judge LLM.
 * @returns `{ kind: "ok", verdict }` on success or `{ kind: "err", reason }` on failure.
 */
export const parseJudgeVerdict = (
  text: string,
): { kind: "ok"; verdict: JudgeVerdict } | { kind: "err"; reason: string } => {
  const stripped = stripJsonFences(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { kind: "err", reason: `JSON.parse failed on: ${stripped.slice(0, 200)}` };
  }

  const result = JudgeVerdictSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message).join("; ");
    return { kind: "err", reason: `verdict schema mismatch: ${issues}` };
  }

  return { kind: "ok", verdict: result.data };
};

// ─── Per-judge invocation ──────────────────────────────────────────────────

const JUDGE_TIMEOUT_MS = 60_000;

/**
 * Invokes the resolved judge with the rubric prompt and returns the raw text.
 *
 * The rubric prompt is the judge's stdin / message body. The candidate output
 * (quiz JSON) is embedded in the rubric prompt by promptfoo before it reaches
 * `callApi`.
 *
 * @param judge - The resolved judge kind to use.
 * @param rubricPrompt - The full rubric text with the candidate output interpolated.
 * @returns `{ kind: "ok", text }` on success or `{ kind: "err", reason }` on failure.
 */
export const callJudge = async (
  judge: JudgeKind,
  rubricPrompt: string,
): Promise<{ kind: "ok"; text: string } | { kind: "err"; reason: string }> => {
  if (judge === "claude-api") {
    return callJudgeViaApi(rubricPrompt);
  }
  return callJudgeViaCli(judge, rubricPrompt);
};

const callJudgeViaCli = async (
  judge: "claude" | "codex" | "copilot",
  rubricPrompt: string,
): Promise<{ kind: "ok"; text: string } | { kind: "err"; reason: string }> => {
  const { binary, args } = judgeCliArgs(judge);

  const io = spawnIO(binary, args, rubricPrompt).timeout(
    JUDGE_TIMEOUT_MS,
    () => ({ kind: "spawn-failed" as const, reason: `judge ${judge} timed out after ${JUDGE_TIMEOUT_MS}ms` }),
  );

  const result = await io.unsafeRun();

  if (result.type === "Ok") {
    const stdout = result.value.stdout;
    // claude CLI wraps output in a JSON envelope; extract the `result` field.
    if (judge === "claude") {
      const extracted = extractClaudeEnvelope(stdout);
      if (extracted !== null) {
        return { kind: "ok", text: extracted };
      }
      // If envelope parse fails, fall through and use raw stdout.
      return { kind: "ok", text: stdout };
    }
    return { kind: "ok", text: stdout };
  }

  if (result.type === "Err") {
    const err = result.error;
    return { kind: "err", reason: `judge process error: ${JSON.stringify(err)}` };
  }

  // Cancelled
  return { kind: "err", reason: `judge ${judge} was cancelled` };
};

const judgeCliArgs = (
  judge: "claude" | "codex" | "copilot",
): { binary: string; args: readonly string[] } => {
  switch (judge) {
    case "claude":
      return {
        binary: "claude",
        args: ["--print", "--output-format", "json", "--model", "sonnet", "--permission-mode", "default"],
      };
    case "codex":
      return {
        binary: "codex",
        args: ["exec", "-", "--model", "o4-mini", "--ephemeral", "--skip-git-repo-check", "--full-auto"],
      };
    case "copilot":
      return {
        binary: "gh",
        args: ["copilot", "explain", ""],
      };
  }
};

/**
 * Extracts the `result` field from a `claude --output-format json` stdout envelope.
 *
 * Returns `null` if the stdout is not a valid Claude print envelope.
 *
 * @param stdout - Raw stdout from a `claude --output-format json` run.
 * @returns The extracted text or `null`.
 */
const extractClaudeEnvelope = (stdout: string): string | null => {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      (parsed as { type: unknown }).type === "result" &&
      "result" in parsed &&
      typeof (parsed as { result: unknown }).result === "string"
    ) {
      return (parsed as { result: string }).result;
    }
  } catch {
    // Not JSON — return null.
  }
  return null;
};

const callJudgeViaApi = async (
  rubricPrompt: string,
): Promise<{ kind: "ok"; text: string } | { kind: "err"; reason: string }> => {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (apiKey === undefined || apiKey.trim() === "") {
    return { kind: "err", reason: "ANTHROPIC_API_KEY is not set for claude-api judge" };
  }

  const client = createAnthropicHttpClient({
    apiKey,
    timeoutMs: JUDGE_TIMEOUT_MS,
  });

  const payload = {
    model: "claude-sonnet-4-7",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: rubricPrompt,
      },
    ],
  };

  const io = client.post("/v1/messages", payload, { observe: "response" });
  const result = await io.unsafeRun();

  if (result.type === "Ok") {
    try {
      const text = await result.value.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return { kind: "err", reason: `claude-api judge: response body not JSON: ${text.slice(0, 200)}` };
      }
      // Extract content[0].text from Anthropic response envelope.
      if (
        typeof body === "object" &&
        body !== null &&
        "content" in body &&
        Array.isArray((body as { content: unknown }).content)
      ) {
        const content = (body as { content: unknown[] }).content;
        const first = content[0];
        if (
          first !== undefined &&
          typeof first === "object" &&
          first !== null &&
          "type" in first &&
          (first as { type: unknown }).type === "text" &&
          "text" in first &&
          typeof (first as { text: unknown }).text === "string"
        ) {
          return { kind: "ok", text: (first as { text: string }).text };
        }
      }
      return { kind: "err", reason: `claude-api judge: unexpected response shape: ${text.slice(0, 400)}` };
    } catch (e: unknown) {
      return { kind: "err", reason: `claude-api judge: failed to read response: ${String(e)}` };
    }
  }

  if (result.type === "Err") {
    return { kind: "err", reason: `claude-api judge: HTTP error: ${JSON.stringify(result.error)}` };
  }

  return { kind: "err", reason: "claude-api judge: IO was cancelled" };
};

// ─── Promptfoo entry point ─────────────────────────────────────────────────

/**
 * Converts a parsed `JudgeVerdict` to the promptfoo llm-rubric result shape.
 *
 * The `score` field is the MIN of the three axis scores (already computed by
 * the judge per the rubric). The promptfoo 0–1 scale uses `minScore / 5`.
 * `pass` is true when the normalized score is >= 0.7 (≥ 3.5 / 5).
 *
 * @param verdict - The parsed judge verdict.
 * @returns The promptfoo result shape.
 */
const verdictToResult = (verdict: JudgeVerdict): PromptfooLlmRubricResult => {
  const normalised = verdict.score / 5;
  return {
    pass: normalised >= 0.7,
    score: normalised,
    reason:
      `relevance=${verdict.relevance}, conceptualDepth=${verdict.conceptualDepth}, ` +
      `discrimination=${verdict.discrimination}, score(min)=${verdict.score} — ${verdict.notes}`,
  };
};

/**
 * Promptfoo provider entry point for the `llm-rubric` assertion.
 *
 * Resolves the judge on first call (cached for the process lifetime), invokes
 * the judge with the rubric prompt, parses the verdict, and returns the
 * promptfoo llm-rubric result shape.
 *
 * Never throws — errors are returned as `{ pass: false, score: 0, reason: ... }`.
 *
 * @param prompt - The rendered rubric prompt from promptfoo (rubric text + candidate output).
 * @returns A resolved `PromptfooLlmRubricResult`.
 */
export const callApi = async (prompt: string): Promise<PromptfooLlmRubricResult> => {
  let judge: JudgeKind;
  try {
    const resolution = await resolveJudge();
    if (resolution.kind === "unresolvable") {
      return { pass: false, score: 0, reason: `judge error: ${resolution.reason}` };
    }
    judge = resolution.judge;
  } catch (e: unknown) {
    return { pass: false, score: 0, reason: `judge error: ${String(e)}` };
  }

  const judgeResult = await callJudge(judge, prompt);
  if (judgeResult.kind === "err") {
    return { pass: false, score: 0, reason: `judge error: ${judgeResult.reason}` };
  }

  const parsed = parseJudgeVerdict(judgeResult.text);
  if (parsed.kind === "err") {
    return {
      pass: false,
      score: 0,
      reason: `judge verdict could not be parsed: ${parsed.reason}`,
    };
  }

  return verdictToResult(parsed.verdict);
};

/**
 * Returns the stable identifier for this provider.
 *
 * @returns The provider ID string.
 */
export const id = (): string => "lgtm-buzzer-judge";

/**
 * Promptfoo-compatible provider class.
 *
 * promptfoo's `loadApiProvider` calls `new Module(options)` on the compiled
 * JS when a file:// URL is used as the provider string. This class wraps the
 * named module-level functions to satisfy that requirement.
 *
 * The default export is the ONLY place in the codebase where a default export
 * appears; it is a framework-mandated exception to CLAUDE.md §Code style.
 */
export class JudgeApiProvider {
  id(): string {
    return "lgtm-buzzer-judge";
  }

  async callApi(prompt: string): Promise<PromptfooLlmRubricResult> {
    return callApi(prompt);
  }
}

// Default export required by promptfoo's `new Module(options)` loading mechanism.
// See NOTE at top of file.
// eslint-disable-next-line no-restricted-syntax
export default JudgeApiProvider;
