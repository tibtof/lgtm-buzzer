import { IO } from "monadyssey";
import type { LLMProvider, LLMProviderError, GenerateQuizInput, Quiz } from "@lgtm-buzzer/core";
import type { SpawnError } from "@lgtm-buzzer/adapter-shared";
import type { spawnIO as SpawnIOFn } from "@lgtm-buzzer/adapter-shared";
import { buildPrompt } from "./prompt.js";
import { parseResponse } from "./response.js";
import { defaultIdGenerator } from "./ids.js";
import type { IdGenerator } from "./ids.js";

/**
 * Stable identifier for the codex-cli adapter.
 *
 * codex-cli adapter v1: invocation is `codex exec -` with flags
 * `["exec", "-", "--model", model, "--ephemeral", "--skip-git-repo-check", "--full-auto"]`.
 * Verified against `codex exec --help` (OpenAI Codex CLI). The `-` positional
 * causes the agent to read its full prompt from stdin. `--ephemeral` prevents
 * session persistence. `--full-auto` enables non-interactive sandboxed
 * execution. `--skip-git-repo-check` allows running outside a git repository.
 * The model's final text response is emitted to stdout (no JSON envelope unlike
 * `claude --output-format json`); `parseResponse` fence-strips and parses it
 * directly.
 */
export const ADAPTER_ID = "codex-cli" as const;

/**
 * Per-instance configuration for `createCodexCliProvider`.
 *
 * All fields are optional; defaults match the codex-cli adapter design.
 */
export type CodexCliConfig = {
  /** Path or name of the codex binary. Default: `"codex"`. */
  readonly binary?: string;
  /** Model flag value. Default: `"o4-mini"`. */
  readonly model?: string;
  /** Wall-clock budget in milliseconds before a `timeout` error is returned. Default: `60_000`. */
  readonly timeoutMs?: number;
  /** Grace period (ms) between SIGTERM and SIGKILL on cancellation. Default: `5000`. */
  readonly graceMs?: number;
};

/**
 * Dependencies injected into `createCodexCliProvider`.
 *
 * `spawnIO` is the only mandatory runtime dep; `ids` and `config` are
 * optional to ease testing.
 */
export type CodexCliDeps = {
  readonly spawnIO: typeof SpawnIOFn;
  readonly ids?: IdGenerator;
  readonly config?: CodexCliConfig;
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
 * Factory that creates a `LLMProvider` backed by the OpenAI Codex CLI.
 *
 * Calling convention:
 * - Binary: `codex` (default).
 * - Fixed argv: `["exec", "-", "--model", <model>, "--ephemeral",
 *   "--skip-git-repo-check", "--full-auto"]`
 * - The `-` positional reads the full prompt from stdin.
 * - The diff bytes are written to stdin ONLY — never in argv.
 * - `--ephemeral` prevents session files from being written to disk.
 * - `--skip-git-repo-check` allows the adapter to run from any directory.
 * - `--full-auto` enables non-interactive sandboxed execution.
 * - Codex emits the model's final response as plain text to stdout (no JSON
 *   envelope); `parseResponse` handles optional fence-stripping.
 * - A wall-clock timeout of `config.timeoutMs` (default 60 s) is applied via
 *   `io.timeout()` — the monadyssey@2.0.1 IO instance method.
 *   Budget exhaustion → `Err<LLMProviderError.timeout { afterMs }>`.
 *   Caller cancellation → `Cancelled` runtime outcome (not Err).
 *
 * @param deps - Injected dependencies (`spawnIO`, optional `ids`, optional `config`).
 * @returns A fully wired `LLMProvider`.
 */
export const createCodexCliProvider = (deps: CodexCliDeps): LLMProvider => {
  const binary = deps.config?.binary ?? "codex";
  const model = deps.config?.model ?? "o4-mini";
  const timeoutMs = deps.config?.timeoutMs ?? 60_000;
  const graceMs = deps.config?.graceMs ?? 5_000;
  const ids = deps.ids ?? defaultIdGenerator();

  // Fixed argv — no diff bytes, no positional prompt other than the `-` sentinel.
  // The `-` causes codex exec to read the full prompt from stdin.
  // Length is exactly 7 elements (invariant asserted by provider.test.ts case #3).
  const fixedArgs: readonly string[] = [
    "exec",
    "-",
    "--model",
    model,
    "--ephemeral",
    "--skip-git-repo-check",
    "--full-auto",
  ];

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
