import { IO } from "monadyssey";
import type { Either } from "monadyssey";
import type { LLMProvider, VCSProvider } from "@lgtm-buzzer/core";
import { createClaudeCliProvider } from "@lgtm-buzzer/adapter-claude-cli";
import { createCodexCliProvider } from "@lgtm-buzzer/adapter-codex-cli";
import { createCopilotCliProvider } from "@lgtm-buzzer/adapter-copilot-cli";
import { createClaudeApiProvider } from "@lgtm-buzzer/adapter-claude-api";
import { createGithubVcsProvider } from "@lgtm-buzzer/adapter-github";
import { createAdoVcsProvider } from "@lgtm-buzzer/adapter-ado";
import type { spawnIO as SpawnIOFn } from "@lgtm-buzzer/adapter-shared";
import type { CredentialResolver } from "./credentials/index.js";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Error returned by the adapter registry during adapter construction.
 *
 * As of ADR-29, `"bad-credentials"` is REMOVED — the wire no longer carries
 * a credentials bag, so there is nothing to validate. `"missing-credentials"`
 * grows `attempted` and `hint` from the resolver's error shape.
 */
export type RegistryError =
  | { readonly kind: "unsupported-llm-adapter"; readonly id: string }
  | { readonly kind: "unsupported-vcs-adapter"; readonly id: string }
  | {
      readonly kind: "missing-credentials";
      readonly adapterId: string;
      readonly attempted: ReadonlyArray<string>;
      readonly hint: string;
    };

// ---------------------------------------------------------------------------
// Factory function types
// ---------------------------------------------------------------------------

/**
 * Factory for an LLM adapter. Resolves credentials internally and returns IO.
 *
 * As of ADR-29, adapter construction is IO-bearing because credential
 * resolution may spawn external CLI processes.
 */
export type LLMAdapterFactory = () => IO<RegistryError, LLMProvider>;

/**
 * Factory for a VCS adapter. Resolves credentials internally and returns IO.
 */
export type VCSAdapterFactory = () => IO<RegistryError, VCSProvider>;

// ---------------------------------------------------------------------------
// Adapter registry interface
// ---------------------------------------------------------------------------

/**
 * Registry of all available LLM and VCS adapters.
 *
 * `buildLlm` / `buildVcs` return `IO<RegistryError, Provider>` because
 * credential resolution is IO-bearing (env reads + optional subprocess).
 * No adapter instances are cached — each call produces a fresh instance.
 */
export type AdapterRegistry = {
  /** Returns the sorted list of available LLM adapter IDs. */
  readonly listLlm: () => readonly string[];
  /** Returns the sorted list of available VCS adapter IDs. */
  readonly listVcs: () => readonly string[];
  /**
   * Construct an LLM provider by ID, resolving credentials via the host's
   * `CredentialResolver`.
   *
   * Returns `Left<RegistryError>` when the ID is unknown or credentials
   * cannot be resolved. NEVER echoes credential bytes in the error.
   */
  readonly buildLlm: (id: string) => IO<RegistryError, LLMProvider>;
  /**
   * Construct a VCS provider by ID, resolving credentials via the host's
   * `CredentialResolver`.
   *
   * Same invariants as `buildLlm`.
   */
  readonly buildVcs: (id: string) => IO<RegistryError, VCSProvider>;
};

// ---------------------------------------------------------------------------
// Registry deps
// ---------------------------------------------------------------------------

/** Dependencies required to build the default adapter registry. */
export type AdapterRegistryDeps = {
  readonly spawnIO: typeof SpawnIOFn;
  readonly resolver: CredentialResolver;
};

// ---------------------------------------------------------------------------
// createDefaultAdapterRegistry
// ---------------------------------------------------------------------------

/**
 * Construct the default adapter registry.
 *
 * Registers all six adapters: `claude-cli`, `codex-cli`, `copilot-cli`,
 * `claude-api` (LLM); `github`, `ado` (VCS).
 *
 * No adapter instances are constructed eagerly — each `buildLlm` / `buildVcs`
 * call invokes the `CredentialResolver` and constructs a fresh instance.
 * Adapter instances MUST NOT be cached across calls (ADR-22, ADR-29).
 *
 * @param deps - `spawnIO` for CLI adapters, `resolver` for credential resolution.
 * @returns A fully wired `AdapterRegistry`.
 */
export const createDefaultAdapterRegistry = (
  deps: AdapterRegistryDeps,
): AdapterRegistry => {
  const { spawnIO, resolver } = deps;

  // ---------- LLM factories ----------

  const llmFactories: Readonly<Record<string, LLMAdapterFactory>> = {
    "claude-cli": () =>
      IO.pure(createClaudeCliProvider({ spawnIO })),

    "codex-cli": () =>
      IO.pure(createCodexCliProvider({ spawnIO })),

    "copilot-cli": () =>
      IO.pure(createCopilotCliProvider({ spawnIO })),

    "claude-api": () =>
      resolver.resolve("claude-api").foldM(
        (err): IO<RegistryError, LLMProvider> =>
          IO.fail<RegistryError, LLMProvider>({
            kind: "missing-credentials",
            adapterId: err.adapterId,
            attempted: err.attempted,
            hint: err.hint,
          }),
        (cred): IO<RegistryError, LLMProvider> => {
          // secret is guaranteed non-undefined for claude-api (env-only resolver)
          const apiKey = cred.secret ?? "";
          return IO.pure(createClaudeApiProvider({ config: { apiKey } }));
        },
      ),
  };

  // ---------- VCS factories ----------

  const vcsFactories: Readonly<Record<string, VCSAdapterFactory>> = {
    github: () =>
      resolver.resolve("github").foldM(
        (err): IO<RegistryError, VCSProvider> =>
          IO.fail<RegistryError, VCSProvider>({
            kind: "missing-credentials",
            adapterId: err.adapterId,
            attempted: err.attempted,
            hint: err.hint,
          }),
        (cred): IO<RegistryError, VCSProvider> => {
          const token = cred.secret ?? "";
          return IO.pure(createGithubVcsProvider({ config: { token } }));
        },
      ),

    ado: () =>
      resolver.resolve("ado").foldM(
        (err): IO<RegistryError, VCSProvider> =>
          IO.fail<RegistryError, VCSProvider>({
            kind: "missing-credentials",
            adapterId: err.adapterId,
            attempted: err.attempted,
            hint: err.hint,
          }),
        (cred): IO<RegistryError, VCSProvider> => {
          const token = cred.secret ?? "";
          return IO.pure(createAdoVcsProvider({ config: { token } }));
        },
      ),
  };

  // Sorted ID lists (computed once, reused on every listLlm/listVcs call).
  const llmIds = Object.keys(llmFactories).sort() as readonly string[];
  const vcsIds = Object.keys(vcsFactories).sort() as readonly string[];

  return {
    listLlm: () => llmIds,
    listVcs: () => vcsIds,

    buildLlm: (id) => {
      const factory = llmFactories[id];
      if (factory === undefined) {
        return IO.fail<RegistryError, LLMProvider>({ kind: "unsupported-llm-adapter", id });
      }
      return factory();
    },

    buildVcs: (id) => {
      const factory = vcsFactories[id];
      if (factory === undefined) {
        return IO.fail<RegistryError, VCSProvider>({ kind: "unsupported-vcs-adapter", id });
      }
      return factory();
    },
  };
};

// ---------------------------------------------------------------------------
// Compatibility shim — legacy Either-returning signatures
// ---------------------------------------------------------------------------
// The old registry.ts exposed Either-returning buildLlm/buildVcs to
// support the old dispatcher. The new registry returns IO. The dispatcher
// is updated in this PR to use .foldM. No shim needed.

export type { Either };
