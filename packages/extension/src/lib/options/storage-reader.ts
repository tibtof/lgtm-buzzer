import type { CredentialsBag } from "@lgtm-buzzer/protocol";
import type { OptionsStore } from "./storage.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The subset of stored options the service worker needs when assembling an
 * outbound `quiz-request` frame.
 *
 * Credentials from the chosen LLM adapter and VCS adapter are merged into a
 * single flat bag (VCS values win on key conflicts per ADR-23).
 */
export type SwOptionsProjection = {
  readonly llmAdapterId: string | undefined;
  readonly vcsAdapterId: string | undefined;
  readonly credentials: CredentialsBag | undefined;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a function that reads `OptionsStore` and projects the fields needed
 * by the service worker.
 *
 * On any `Left` (absent / corrupt / io), the projection returns all-`undefined`
 * so the SW forwards the request without adapter overrides, letting the host
 * apply its ADR-22 defaults. If those defaults need credentials and none are
 * present the host returns `missing-credentials`.
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
    vcsAdapterId: undefined,
    credentials: undefined,
  };

  return async (): Promise<SwOptionsProjection> => {
    const result = await store.read();
    return result.fold(
      () => empty,
      (options) => {
        const emptyBag: CredentialsBag = {};
        const llmCreds: CredentialsBag =
          options.llmAdapterId !== undefined
            ? (options.credentials?.[options.llmAdapterId] ?? emptyBag)
            : emptyBag;
        const vcsCreds: CredentialsBag =
          options.vcsAdapterId !== undefined
            ? (options.credentials?.[options.vcsAdapterId] ?? emptyBag)
            : emptyBag;

        // VCS creds merged last — VCS values win on key conflicts.
        const merged: CredentialsBag = { ...llmCreds, ...vcsCreds };
        const credentials: CredentialsBag | undefined =
          Object.keys(merged).length > 0 ? merged : undefined;

        return {
          llmAdapterId: options.llmAdapterId,
          vcsAdapterId: options.vcsAdapterId,
          credentials,
        };
      },
    );
  };
};
