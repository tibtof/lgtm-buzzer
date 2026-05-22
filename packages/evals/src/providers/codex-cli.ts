import { spawnIO, defaultIdGenerator } from "@lgtm-buzzer/adapter-shared";
import { createCodexCliProvider } from "@lgtm-buzzer/adapter-codex-cli";
import type { LLMProviderError } from "@lgtm-buzzer/core";
import type { EvalProviderResult, CallApiContext } from "./types.js";
import { checkBinary } from "./precheck.js";

const ADAPTER_ID = "codex-cli";

/**
 * Promptfoo custom provider for the codex-cli adapter.
 *
 * Diff-only invariant: only `context.vars.diff` is forwarded to the adapter.
 * No other `vars` key reaches the LLM. This is verified by the LEAK_CANARY
 * test in `codex-cli.test.ts`.
 *
 * @param _prompt - The passthrough prompt value from promptfoo (unused).
 * @param context - The promptfoo call context; only `vars.diff` is consumed.
 * @returns A resolved `EvalProviderResult`.
 */
export const callApi = async (
  _prompt: string,
  context: CallApiContext,
): Promise<EvalProviderResult> => {
  const precheck = await checkBinary("codex");
  if (precheck.kind === "skipped") {
    return {
      output: "",
      error: precheck.reason,
      metadata: { adapter: ADAPTER_ID, latencyMs: 0, errKind: "skipped" },
      cached: false,
    };
  }

  const diff = context.vars.diff;
  // DIFF-ONLY INVARIANT: only `diff` is extracted from context.vars.

  const provider = createCodexCliProvider({
    spawnIO,
    ids: defaultIdGenerator(),
    config: { timeoutMs: 90_000 },
  });

  const start = Date.now();

  try {
    const io = provider.generateQuiz({ diff, questionCount: 3 });
    const result = await io.unsafeRun();
    const latencyMs = Date.now() - start;

    if (result.type === "Ok") {
      return {
        output: JSON.stringify(result.value),
        metadata: { adapter: ADAPTER_ID, latencyMs },
        cached: false,
      };
    }
    if (result.type === "Err") {
      const err: LLMProviderError = result.error;
      return {
        output: "",
        error: JSON.stringify(err),
        metadata: { adapter: ADAPTER_ID, latencyMs, errKind: err.kind },
        cached: false,
      };
    }
    // Cancelled
    return {
      output: "",
      error: "IO was cancelled",
      metadata: { adapter: ADAPTER_ID, latencyMs, errKind: "cancelled" },
      cached: false,
    };
  } catch (e: unknown) {
    const latencyMs = Date.now() - start;
    return {
      output: "",
      error: `internal: ${String(e)}`,
      metadata: { adapter: ADAPTER_ID, latencyMs, errKind: "internal" },
      cached: false,
    };
  }
};

export const id = (): string => ADAPTER_ID;
