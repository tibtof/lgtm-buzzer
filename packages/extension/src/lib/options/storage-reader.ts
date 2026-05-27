import type { OptionsStore } from "./storage.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The subset of stored options the service worker needs when assembling an
 * outbound `quiz-request` frame.
 *
 * As of ADR-29:
 * - `vcsAdapterId` is REMOVED — inferred from `pr.kind` by the SW router.
 * - `credentials` is REMOVED — resolved host-side by `CredentialResolver`.
 * - Only `llmAdapterId` remains as a user preference.
 *
 * As of ADR-32:
 * - `questionPoolSize` is added. Undefined means "use default (5)".
 */
export type SwOptionsProjection = {
  readonly llmAdapterId: string | undefined;
  /** One of {5, 10, 20} or undefined (default 5). ADR-32. */
  readonly questionPoolSize: 5 | 10 | 20 | undefined;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a function that reads `OptionsStore` and projects the fields needed
 * by the service worker.
 *
 * On any `Left` (absent / corrupt / io), the projection returns `{ llmAdapterId: undefined }`
 * so the SW forwards the request without adapter overrides, letting the host apply
 * its ADR-22 default (`claude-cli`). No credentials are ever read or forwarded.
 *
 * @param deps - Injected options store.
 * @returns An async function that always resolves with a `SwOptionsProjection`.
 */
export const readSwOptions = (deps: {
  readonly store: OptionsStore;
}): (() => Promise<SwOptionsProjection>) => {
  const { store } = deps;
  const empty: SwOptionsProjection = {
    llmAdapterId: undefined,
    questionPoolSize: undefined,
  };

  return async (): Promise<SwOptionsProjection> => {
    const result = await store.read();
    return result.fold(
      () => empty,
      (options) => ({
        llmAdapterId: options.llmAdapterId,
        questionPoolSize: options.questionPoolSize,
      }),
    );
  };
};
