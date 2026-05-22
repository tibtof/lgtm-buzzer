import { IO } from "monadyssey";
import type { LLMProvider, LLMProviderError, GenerateQuizInput, Quiz } from "@lgtm-buzzer/core";
import type { SpawnError } from "@lgtm-buzzer/adapter-shared";
import type { spawnIO as SpawnIOFn } from "@lgtm-buzzer/adapter-shared";
import { buildPrompt } from "./prompt.js";
import { parseResponse } from "./response.js";
import { defaultIdGenerator } from "./ids.js";
import type { IdGenerator } from "./ids.js";

/**
 * Stable identifier for the copilot-cli adapter.
 *
 * ## gh copilot invocation decision (v1)
 *
 * The `gh copilot` extension ships two user-facing subcommands:
 *   - `gh copilot suggest -t shell "<prompt>"` — suggests shell commands.
 *   - `gh copilot explain "<code>"` — explains shell commands.
 *
 * Neither subcommand is designed for arbitrary LLM completions from stdin;
 * both expect a short positional string argument and apply their own internal
 * framing before forwarding to the Copilot API.
 *
 * ### Chosen approach: stdin-pipe workaround via `gh copilot explain`
 *
 * We use `gh copilot explain` with an empty positional (`""`) and pipe the
 * full system+user prompt through stdin. The argv is:
 *
 * ```ts
 * ["copilot", "explain", ""]
 * ```
 *
 * This causes `gh copilot explain` to receive the prompt on stdin (the empty
 * positional is overridden or supplemented by the piped content in tested
 * versions). The model's response is captured from stdout.
 *
 * ### Limitations (document for v1)
 *
 * 1. **Interactive prompts**: `gh copilot` may emit interactive "Do you want to
 *    run this command? (yes/no)" prompts on stdout or stderr in some versions.
 *    The `parseResponse` function uses the same fence-stripping + JSON parse
 *    logic as the other CLI adapters; if the model output is contaminated with
 *    interactive text, `parseResponse` will return `malformed-response`.
 *    A future version of this adapter should strip known `gh copilot` UI
 *    decoration before parsing.
 *
 * 2. **No official non-interactive mode**: `gh copilot` does not expose a
 *    `--no-interactive` or `--output-format json` flag (as of v1.0.x). The
 *    adapter is therefore a best-effort placeholder. It will work reliably only
 *    if a future CLI release adds proper non-interactive / piped-stdin support.
 *
 * 3. **stdin forwarding**: some versions of `gh copilot explain` do not read
 *    from stdin at all — they treat the positional string as the only input.
 *    In that case this adapter will return `malformed-response` because the
 *    model will respond to the empty string, not to the quiz prompt.
 *
 * The scaffolding (factory + tests with fake spawnIO) is complete and correct.
 * Real `gh copilot` invocation can be refined in a follow-up issue once the CLI
 * gains better non-interactive support.
 */
export const ADAPTER_ID = "copilot-cli" as const;

/**
 * Per-instance configuration for `createCopilotCliProvider`.
 *
 * All fields are optional; defaults match the copilot-cli adapter design.
 */
export type CopilotCliConfig = {
  /** Path or name of the gh binary. Default: `"gh"`. */
  readonly binary?: string;
  /** Wall-clock budget in milliseconds before a `timeout` error is returned. Default: `60_000`. */
  readonly timeoutMs?: number;
  /** Grace period (ms) between SIGTERM and SIGKILL on cancellation. Default: `5000`. */
  readonly graceMs?: number;
};

/**
 * Dependencies injected into `createCopilotCliProvider`.
 *
 * `spawnIO` is the only mandatory runtime dep; `ids` and `config` are
 * optional to ease testing.
 */
export type CopilotCliDeps = {
  readonly spawnIO: typeof SpawnIOFn;
  readonly ids?: IdGenerator;
  readonly config?: CopilotCliConfig;
};

/** Map a `SpawnError` to the matching `LLMProviderError` variant per ADR-14 §7. */
const mapSpawnError = (e: SpawnError): LLMProviderError => {
  switch (e.kind) {
    case "spawn-failed":
      return {
        kind: "subprocess",
        reason: "spawn-failed",
        detail: e.reason,
      };
    case "process-failed":
      return {
        kind: "subprocess",
        reason: "process-failed",
        exitCode: e.exitCode,
        stderr: e.stderr,
        detail: `exit ${e.exitCode}`,
      };
    case "cancelled":
      // SpawnError.cancelled must not be mapped to Err<LLMProviderError>.
      // Per ADR-14 §7 and ADR-10: cancellation propagates as the `Cancelled`
      // runtime outcome. This branch is unreachable in practice because
      // io.timeout() cancels the IO at the monadyssey level, causing the
      // Cancelled outcome to bubble up before mapSpawnError is ever called.
      throw new Error(
        "Invariant violation: SpawnError.cancelled must not reach mapSpawnError — " +
          "cancellation propagates as the Cancelled runtime outcome, not as Err",
      );
  }
};

/**
 * Factory that creates a `LLMProvider` backed by the `gh copilot` CLI extension.
 *
 * Calling convention:
 * - Binary: `gh` (default).
 * - Fixed argv: `["copilot", "explain", ""]`
 * - The full prompt (system + user message with diff) is written to stdin ONLY
 *   — never in argv.
 * - `gh copilot explain` is used in stdin-pipe mode with an empty positional
 *   argument as a v1 workaround (see ADAPTER_ID comment for full rationale and
 *   limitations).
 * - `gh copilot` emits the model's response as plain text to stdout (no JSON
 *   envelope); `parseResponse` handles optional fence-stripping.
 * - A wall-clock timeout of `config.timeoutMs` (default 60 s) is applied via
 *   `io.timeout()` — the monadyssey@2.0.1 IO instance method.
 *   Budget exhaustion → `Err<LLMProviderError.timeout { afterMs }>`.
 *   Caller cancellation → `Cancelled` runtime outcome (not Err).
 *
 * @param deps - Injected dependencies (`spawnIO`, optional `ids`, optional `config`).
 * @returns A fully wired `LLMProvider`.
 */
export const createCopilotCliProvider = (deps: CopilotCliDeps): LLMProvider => {
  const binary = deps.config?.binary ?? "gh";
  const timeoutMs = deps.config?.timeoutMs ?? 60_000;
  const graceMs = deps.config?.graceMs ?? 5_000;
  const ids = deps.ids ?? defaultIdGenerator();

  // Fixed argv — no diff bytes, no positional prompt containing the diff.
  // We use `gh copilot explain ""` as a v1 stdin-pipe workaround. The empty
  // string positional is required by `gh copilot explain`'s argument parser;
  // the real prompt arrives via stdin.
  // See the ADAPTER_ID comment block for the full invocation rationale and
  // known limitations.
  // Length is exactly 3 elements (invariant asserted by provider.test.ts case #3).
  const fixedArgs: readonly string[] = ["copilot", "explain", ""];

  const generateQuiz = (input: GenerateQuizInput): IO<LLMProviderError, Quiz> => {
    const stdin = buildPrompt(input.diff, input.questionCount);

    const spawnResult = deps.spawnIO(binary, fixedArgs, stdin, { graceMs });

    // Apply wall-clock timeout using io.timeout() — the monadyssey@2.0.1 API.
    // On timeout: spawnIO's AbortSignal fires (SIGTERM → SIGKILL), and the IO
    // error channel receives `LLMProviderError.timeout`.
    const withTimeout: IO<SpawnError | LLMProviderError, { readonly stdout: string }> =
      spawnResult.timeout(timeoutMs, (): LLMProviderError => ({
        kind: "timeout",
        afterMs: timeoutMs,
      }));

    // Map SpawnError → LLMProviderError and parse the LLM response.
    return withTimeout
      .mapErr((e): LLMProviderError => {
        // Discriminate: LLMProviderError kinds that can come from the timeout branch.
        const kind = (e as { kind: string }).kind;
        if (
          kind === "timeout" ||
          kind === "malformed-response" ||
          kind === "subprocess" ||
          kind === "transport" ||
          kind === "cancelled"
        ) {
          return e as LLMProviderError;
        }
        // Must be a SpawnError.
        return mapSpawnError(e as SpawnError);
      })
      .flatMap(({ stdout }): IO<LLMProviderError, Quiz> => {
        const parsed = parseResponse(stdout, ids);
        return parsed.fold(
          (err) => IO.fail<LLMProviderError, Quiz>(err),
          (quiz) => IO.lift<LLMProviderError, Quiz>(() => quiz),
        );
      });
  };

  return {
    id: ADAPTER_ID,
    generateQuiz,
  };
};
