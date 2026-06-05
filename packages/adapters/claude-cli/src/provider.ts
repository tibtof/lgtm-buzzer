import { IO } from "monadyssey";
import type { LLMProvider, LLMProviderError, GenerateQuizInput, GenerateQuizObserver, Quiz } from "@lgtm-buzzer/core";
import type { SpawnError } from "@lgtm-buzzer/adapter-shared";
import type { spawnIO as SpawnIOFn } from "@lgtm-buzzer/adapter-shared";
import { buildPrompt } from "./prompt.js";
import { parseResponse } from "./response.js";
import { defaultIdGenerator } from "./ids.js";
import type { IdGenerator } from "./ids.js";
import { mapStreamLine, initialStreamState } from "./stream.js";
import type { StreamState } from "./stream.js";

/** Stable identifier for the claude-cli adapter. */
export const ADAPTER_ID = "claude-cli" as const;

/**
 * Per-instance configuration for `createClaudeCliProvider`.
 *
 * All fields are optional; defaults match ADR-14 §Decision 1.
 */
export type ClaudeCliConfig = {
  /** Path or name of the claude binary. Default: `"claude"`. */
  readonly binary?: string;
  /** Model flag value. Default: `"sonnet"`. */
  readonly model?: string;
  /** Wall-clock budget in milliseconds before a `timeout` error is returned. Default: `60_000`. */
  readonly timeoutMs?: number;
  /** Grace period (ms) between SIGTERM and SIGKILL on cancellation. Default: `5000`. */
  readonly graceMs?: number;
};

/**
 * Dependencies injected into `createClaudeCliProvider`.
 *
 * `spawnIO` is the only mandatory runtime dep; `ids` and `config` are
 * optional to ease testing.
 */
export type ClaudeCliDeps = {
  readonly spawnIO: typeof SpawnIOFn;
  readonly ids?: IdGenerator;
  readonly config?: ClaudeCliConfig;
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
 * Factory that creates a `LLMProvider` backed by the Claude Code CLI.
 *
 * Calling convention (ADR-14 §Decision 1 + §Decision 2):
 * - Fixed argv: `["--print", "--output-format", "json", "--model", <model>, "--permission-mode", "default"]`
 * - The diff bytes are written to stdin ONLY — never in argv.
 * - A wall-clock timeout of `config.timeoutMs` (default 60 s) is applied via
 *   `io.timeout()` — the IO instance method from monadyssey@2.0.1.
 *   Budget exhaustion → `Err<LLMProviderError.timeout { afterMs }>`.
 *   Caller cancellation → `Cancelled` runtime outcome (not Err).
 *
 * Note: ADR-14 §Decision 5 names `Schedule.timeout`; monadyssey@2.0.1 exposes
 * the timeout combinator as `io.timeout(ms, onTimeout)` instead. The semantics
 * are identical — budget exhaustion returns `Err<timeout>` in the error channel.
 * No escalation needed.
 *
 * @param deps - Injected dependencies (`spawnIO`, optional `ids`, optional `config`).
 * @returns A fully wired `LLMProvider`.
 */
export const createClaudeCliProvider = (deps: ClaudeCliDeps): LLMProvider => {
  const binary = deps.config?.binary ?? "claude";
  const model = deps.config?.model ?? "sonnet";
  // 180s default. ADR-30 first-quiz generates a 20-question pool which
  // routinely takes 60-90s. The 60s default predates ADR-30 (M2's 5-question
  // path). Tests can still override via deps.config.timeoutMs.
  const timeoutMs = deps.config?.timeoutMs ?? 180_000;
  const graceMs = deps.config?.graceMs ?? 5_000;
  const ids = deps.ids ?? defaultIdGenerator();

  // Fixed argv — no diff bytes, no positional prompt, no --bare flag.
  //
  // ADR-36: switched from `--output-format json` to `--output-format
  // stream-json --verbose`. The `--verbose` flag is required by the Claude
  // Code CLI (≥2.1.165) to emit the full NDJSON event sequence under --print;
  // without it only the bare result text is printed (no {type:"result"} wrapper).
  //
  // Flag set verified against claude@2.1.165 via live run:
  //   echo hi | claude --print --output-format stream-json --verbose \
  //                    --model sonnet --permission-mode default
  // Exit 0. Stream emits:
  //   {"type":"system","subtype":"init",...}
  //   {"type":"assistant","message":{"content":[{"type":"text","text":"..."}],...},...}
  //   {"type":"result","subtype":"success","result":"<full model text>",...}
  // The terminal "result" line carries the complete model text in its `result`
  // field — identical in content to the old --output-format json .result field.
  //
  // --no-cache-prompts is NOT a recognised flag in claude@2.1.165 and causes
  // exit 1 with "unknown option '--no-cache-prompts'". It has been removed.
  // Prompt caching does not affect correctness here (we parse the final result
  // line regardless), so there is no substitute flag required.
  //
  // Length is exactly 8 elements (invariant — provider.test.ts case #3 asserts this).
  const fixedArgs: readonly string[] = [
    "--print",
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    model,
    "--permission-mode",
    "default",
  ];

  const generateQuiz = (
    input: GenerateQuizInput,
    observer?: GenerateQuizObserver,
  ): IO<LLMProviderError, Quiz> => {
    const stdin = buildPrompt(input.diff, input.questionCount);

    // ADR-36: wire onLine → mapStreamLine reducer → observer.onSignal when
    // an observer is supplied. State is mutable per-call (not shared across
    // concurrent calls — each generateQuiz call gets its own closure).
    let streamState: StreamState = initialStreamState;
    const onLine =
      observer !== undefined
        ? (line: string): void => {
            const result = mapStreamLine(line, streamState, input.questionCount);
            streamState = result.state;
            if (result.signal !== undefined) {
              observer.onSignal(result.signal);
            }
          }
        : undefined;

    const spawnOptions = onLine !== undefined
      ? { graceMs, onLine }
      : { graceMs };
    const spawnResult = deps.spawnIO(binary, fixedArgs, stdin, spawnOptions);

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
