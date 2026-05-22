/**
 * Result shape returned by every eval provider's `callApi` implementation.
 *
 * `output` contains a JSON-stringified `Quiz` on success, or an empty string
 * on error. `error` is populated when the adapter returned an `LLMProviderError`.
 * `metadata` carries structured diagnostics consumed by the `schema-conformance`
 * javascript assert and promptfoo's report renderer.
 */
export type EvalProviderResult = {
  readonly output: string;
  readonly error?: string;
  readonly metadata: {
    readonly adapter: string;
    readonly latencyMs: number;
    readonly errKind?:
      | "skipped"
      | "internal"
      | "subprocess"
      | "transport"
      | "malformed-response"
      | "timeout"
      | "cancelled";
  };
  readonly cached: false;
};

/**
 * Context object passed by promptfoo to each provider's `callApi`.
 *
 * Only `vars.diff` is forwarded to the adapter; all other fields in `vars` are
 * consumed exclusively by the promptfoo assertion runner and MUST NOT reach the
 * LLM. The diff-only invariant (CLAUDE.md §Key differentiator) is enforced by
 * the LEAK_CANARY canary tests in `*.test.ts`.
 */
export type CallApiContext = {
  readonly vars: {
    readonly diff: string;
    readonly [key: string]: unknown;
  };
};

/**
 * The module shape expected by promptfoo for a custom provider.
 *
 * Each provider file exports a plain object (not a class) with `id` and
 * `callApi`. promptfoo loads the compiled JS file via `file://` URL.
 */
export type EvalProviderModule = {
  readonly id: () => string;
  readonly callApi: (
    prompt: string,
    context: CallApiContext,
  ) => Promise<EvalProviderResult>;
};
