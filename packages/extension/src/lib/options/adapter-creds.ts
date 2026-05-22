/**
 * Static per-adapter credential UI specification.
 *
 * Mirrors the host's adapter registry from ADR-22. When a new adapter lands,
 * update both the host registry (ADR-22) and this table. The test suite asserts
 * the well-known adapter IDs are present to catch drift.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Specification for a single credential field rendered in the options UI.
 */
export type CredFieldSpec = {
  /** The credential bag key, e.g. `"apiKey"` or `"pat"`. */
  readonly key: string;
  /** The UI label shown above the input. */
  readonly label: string;
  /** Placeholder text inside the password input. */
  readonly placeholder: string;
};

/**
 * Specification for the credential inputs required by one adapter.
 */
export type AdapterCredsSpec = {
  readonly adapterId: string;
  readonly category: "llm" | "vcs";
  readonly fields: ReadonlyArray<CredFieldSpec>;
  /** Short note shown when no credential inputs are needed. */
  readonly note?: string;
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Static registry of per-adapter credential UI specifications.
 *
 * `claude-cli`, `codex-cli`, and `copilot-cli` require no credentials —
 * they read them from the local CLI tool's own config. `claude-api` needs
 * an API key. `github` and `ado` need a personal access token.
 */
export const ADAPTER_CREDS_SPECS: ReadonlyArray<AdapterCredsSpec> = [
  {
    adapterId: "claude-cli",
    category: "llm",
    fields: [],
    note: "no credentials required",
  },
  {
    adapterId: "codex-cli",
    category: "llm",
    fields: [],
    note: "no credentials required",
  },
  {
    adapterId: "copilot-cli",
    category: "llm",
    fields: [],
    note: "no credentials required",
  },
  {
    adapterId: "claude-api",
    category: "llm",
    fields: [{ key: "apiKey", label: "API key", placeholder: "sk-ant-..." }],
  },
  {
    adapterId: "github",
    category: "vcs",
    fields: [
      { key: "pat", label: "Personal access token", placeholder: "ghp_..." },
    ],
  },
  {
    adapterId: "ado",
    category: "vcs",
    fields: [
      { key: "pat", label: "Personal access token", placeholder: "azp_..." },
    ],
  },
];

/**
 * Looks up the credential spec for a given adapter ID.
 *
 * Returns `undefined` when the adapter ID is not in the static registry
 * (i.e., an adapter the host advertises that the UI does not yet know about).
 *
 * @param adapterId - The adapter ID to look up.
 */
export const getCredsSpec = (adapterId: string): AdapterCredsSpec | undefined =>
  ADAPTER_CREDS_SPECS.find((s) => s.adapterId === adapterId);
