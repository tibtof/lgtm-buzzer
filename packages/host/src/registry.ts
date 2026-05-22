import { z } from "zod";
import { Left, Right } from "monadyssey";
import type { Either } from "monadyssey";
import type { LLMProvider, VCSProvider } from "@lgtm-buzzer/core";
import type { CredentialsBag } from "@lgtm-buzzer/protocol";
import { createClaudeCliProvider } from "@lgtm-buzzer/adapter-claude-cli";
import { createCodexCliProvider } from "@lgtm-buzzer/adapter-codex-cli";
import { createCopilotCliProvider } from "@lgtm-buzzer/adapter-copilot-cli";
import { createClaudeApiProvider } from "@lgtm-buzzer/adapter-claude-api";
import { createGithubVcsProvider } from "@lgtm-buzzer/adapter-github";
import { createAdoVcsProvider } from "@lgtm-buzzer/adapter-ado";
import type { spawnIO as SpawnIOFn } from "@lgtm-buzzer/adapter-shared";

// ---------------------------------------------------------------------------
// Per-adapter credential schemas (host-owned; host is the only layer that
// understands the runtime shape of each adapter's credentials).
// .strict() rejects unknown keys — keeps the wire honest.
// ---------------------------------------------------------------------------

const ClaudeCliCredsSchema = z.object({}).strict();
const CodexCliCredsSchema = z.object({}).strict();
const CopilotCliCredsSchema = z.object({}).strict();
const ClaudeApiCredsSchema = z.object({ apiKey: z.string().min(1) }).strict();
const GithubCredsSchema = z.object({ pat: z.string().min(1) }).strict();
const AdoCredsSchema = z.object({ pat: z.string().min(1) }).strict();

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Error returned by the adapter registry during adapter construction.
 *
 * All variants deliberately omit credential bytes — `detail` contains
 * only field PATHS (e.g., `"apiKey"`, `"pat"`), never values.
 */
export type RegistryError =
  | { readonly kind: "unsupported-llm-adapter"; readonly id: string }
  | { readonly kind: "unsupported-vcs-adapter"; readonly id: string }
  | { readonly kind: "missing-credentials"; readonly adapterId: string }
  | {
      readonly kind: "bad-credentials";
      readonly adapterId: string;
      readonly detail: string;
    };

// ---------------------------------------------------------------------------
// Factory function types
// ---------------------------------------------------------------------------

/** Factory for an LLM adapter. Takes the raw credentials bag and returns Either. */
export type LLMAdapterFactory = (
  creds: CredentialsBag | undefined,
) => Either<RegistryError, LLMProvider>;

/** Factory for a VCS adapter. Takes the raw credentials bag and returns Either. */
export type VCSAdapterFactory = (
  creds: CredentialsBag | undefined,
) => Either<RegistryError, VCSProvider>;

// ---------------------------------------------------------------------------
// Adapter registry interface
// ---------------------------------------------------------------------------

/**
 * Registry of all available LLM and VCS adapters.
 *
 * `buildLlm` / `buildVcs` are pure `Either`-returning factories —
 * adapter construction is synchronous. Only the resulting provider methods
 * (`generateQuiz` / `fetchDiff`) are IO-bearing.
 */
export type AdapterRegistry = {
  /** Returns the sorted list of available LLM adapter IDs. */
  readonly listLlm: () => readonly string[];
  /** Returns the sorted list of available VCS adapter IDs. */
  readonly listVcs: () => readonly string[];
  /**
   * Construct an LLM provider by ID, validating credentials per the adapter's schema.
   *
   * Returns `Left<RegistryError>` when the ID is unknown, credentials are absent
   * but required, or credentials fail zod validation. NEVER echoes credential bytes
   * in the error.
   */
  readonly buildLlm: (
    id: string,
    creds: CredentialsBag | undefined,
  ) => Either<RegistryError, LLMProvider>;
  /**
   * Construct a VCS provider by ID, validating credentials per the adapter's schema.
   *
   * Same invariants as `buildLlm`.
   */
  readonly buildVcs: (
    id: string,
    creds: CredentialsBag | undefined,
  ) => Either<RegistryError, VCSProvider>;
};

// ---------------------------------------------------------------------------
// Internal: credential validation helper
// ---------------------------------------------------------------------------

/**
 * Validate a `CredentialsBag` against a per-adapter zod schema.
 *
 * BINDING: never echo credential bytes in the returned error. The `detail`
 * field carries only field PATHS extracted from zod's issue list.
 *
 * @param schema - The per-adapter zod schema (must be strict).
 * @param adapterId - The adapter ID, used only in the error.
 * @param bag - The raw credentials bag (may be undefined).
 * @param required - When `true`, an absent bag is a `missing-credentials` error.
 * @returns `Right<T>` on success, `Left<RegistryError>` on failure.
 */
const validateCreds = <T>(
  schema: z.ZodType<T>,
  adapterId: string,
  bag: CredentialsBag | undefined,
  required: boolean,
): Either<RegistryError, T> => {
  const target: unknown = bag ?? {};

  if (required && bag === undefined) {
    const err: RegistryError = { kind: "missing-credentials", adapterId };
    return Left.pure(err) as Either<RegistryError, T>;
  }

  const result = schema.safeParse(target);
  if (!result.success) {
    // Extract field paths only — NEVER include the credential values.
    const fieldPaths = result.error.issues
      .map((issue) => issue.path.join(".") || "<root>")
      .join(", ");
    const detail = `invalid or unexpected fields: ${fieldPaths}`;
    const err: RegistryError = { kind: "bad-credentials", adapterId, detail };
    return Left.pure(err) as Either<RegistryError, T>;
  }

  return Right.pure(result.data);
};

// ---------------------------------------------------------------------------
// Registry deps
// ---------------------------------------------------------------------------

/** Dependencies required to build the default adapter registry. */
export type AdapterRegistryDeps = {
  readonly spawnIO: typeof SpawnIOFn;
  readonly env?: Readonly<Record<string, string | undefined>>;
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
 * No adapters are constructed eagerly — each `buildLlm` / `buildVcs` call
 * runs zod validation and constructs a fresh instance. Adapter instances
 * MUST NOT be cached across calls.
 *
 * @param deps - `spawnIO` for CLI adapters; optional `env` for override (tests).
 * @returns A fully wired `AdapterRegistry`.
 */
export const createDefaultAdapterRegistry = (
  deps: AdapterRegistryDeps,
): AdapterRegistry => {
  const { spawnIO } = deps;

  // ---------- LLM factories ----------

  const llmFactories: Readonly<Record<string, LLMAdapterFactory>> = {
    "claude-cli": (creds) => {
      return validateCreds(ClaudeCliCredsSchema, "claude-cli", creds, false).flatMap(
        () => Right.pure(createClaudeCliProvider({ spawnIO })),
      );
    },
    "codex-cli": (creds) => {
      return validateCreds(CodexCliCredsSchema, "codex-cli", creds, false).flatMap(
        () => Right.pure(createCodexCliProvider({ spawnIO })),
      );
    },
    "copilot-cli": (creds) => {
      return validateCreds(CopilotCliCredsSchema, "copilot-cli", creds, false).flatMap(
        () => Right.pure(createCopilotCliProvider({ spawnIO })),
      );
    },
    "claude-api": (creds) => {
      return validateCreds(
        ClaudeApiCredsSchema,
        "claude-api",
        creds,
        /* required = */ true,
      ).flatMap(({ apiKey }) =>
        Right.pure(createClaudeApiProvider({ config: { apiKey } })),
      );
    },
  };

  // ---------- VCS factories ----------

  const vcsFactories: Readonly<Record<string, VCSAdapterFactory>> = {
    github: (creds) => {
      return validateCreds(GithubCredsSchema, "github", creds, /* required = */ true).flatMap(
        ({ pat }) => Right.pure(createGithubVcsProvider({ config: { token: pat } })),
      );
    },
    ado: (creds) => {
      return validateCreds(AdoCredsSchema, "ado", creds, /* required = */ true).flatMap(
        ({ pat }) => Right.pure(createAdoVcsProvider({ config: { token: pat } })),
      );
    },
  };

  // Sorted ID lists (computed once, reused on every listLlm/listVcs call).
  const llmIds = Object.keys(llmFactories).sort() as readonly string[];
  const vcsIds = Object.keys(vcsFactories).sort() as readonly string[];

  return {
    listLlm: () => llmIds,
    listVcs: () => vcsIds,

    buildLlm: (id, creds) => {
      const factory = llmFactories[id];
      if (factory === undefined) {
        const err: RegistryError = { kind: "unsupported-llm-adapter", id };
        return Left.pure(err) as Either<RegistryError, LLMProvider>;
      }
      return factory(creds);
    },

    buildVcs: (id, creds) => {
      const factory = vcsFactories[id];
      if (factory === undefined) {
        const err: RegistryError = { kind: "unsupported-vcs-adapter", id };
        return Left.pure(err) as Either<RegistryError, VCSProvider>;
      }
      return factory(creds);
    },
  };
};
