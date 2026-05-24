import { IO } from "monadyssey";
import type { ResolverDeps } from "./types.js";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/**
 * Discriminated error for failed credential resolution.
 *
 * `attempted` lists the human-readable names of every chain step tried,
 * in order. `hint` is a single remediation string suitable for surfacing
 * to the user. Neither field carries env-var VALUES or token bytes —
 * only well-known step labels.
 */
export type ResolverError = {
  readonly kind: "missing-credential";
  readonly adapterId: string;
  readonly attempted: ReadonlyArray<string>;
  readonly hint: string;
};

/**
 * Outcome of a successful resolution.
 *
 * `secret` is the resolved token / API key, or `undefined` for adapters
 * whose auth lives outside the resolver (CLI-managed login).
 * `detail` is a short human-readable step label ("via GITHUB_TOKEN env",
 * "via gh CLI", "uses CLI's own login"). NEVER includes the secret bytes.
 */
export type ResolvedCredential = {
  readonly secret: string | undefined;
  readonly detail: string;
};

/**
 * Port: resolves a credential for an adapter from the host's environment.
 *
 * Implementation lives in `packages/host/src/credentials/`. The resolver
 * is constructed once at host startup and injected into the registry.
 *
 * Resolution is IO-bearing (env reads are pure but subprocess spawning
 * is not). No caching across calls — every call re-runs the chain.
 */
export type CredentialResolver = {
  /**
   * Resolve the credential for `adapterId`. Returns `Right<{ secret, detail }>`
   * on a hit, `Left<ResolverError>` on a miss. NEVER throws — every failure
   * lands in the IO error channel.
   */
  readonly resolve: (adapterId: string) => IO<ResolverError, ResolvedCredential>;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Try env vars in order; return the first non-empty trimmed value.
 *
 * BINDING: the returned `via` label names the key (acceptable), NEVER its value.
 */
const tryEnv = (
  env: Readonly<Record<string, string | undefined>>,
  keys: ReadonlyArray<string>,
): { hit: string; via: string } | undefined => {
  for (const key of keys) {
    const value = (env[key] ?? "").trim();
    if (value.length > 0) {
      // `via` records the key name only — not the value.
      return { hit: value, via: `${key} env` };
    }
  }
  return undefined;
};

/**
 * Run an external CLI via spawnIO with a bounded wall-clock timeout.
 *
 * Returns `Right<{hit, via}>` when the process exits 0 and stdout is non-empty
 * after trimming. Returns `Left<undefined>` on any failure (non-zero exit,
 * spawn error, empty stdout) or `Left<{timedOut: true; timeoutMs: number}>`
 * when the wall-clock budget expires so the caller can surface a diagnostic hint.
 *
 * BINDING: the returned `hit` is the raw secret; it MUST NOT appear in
 * `via`, `attempted`, or `hint`. Only the step label appears in those fields.
 *
 * Implementation note: `graceMs` (500 ms) governs SIGTERM → SIGKILL; `timeoutMs`
 * is the independent wall-clock budget enforced via `io.timeout()`. When
 * `io.timeout()` fires it cancels the inner IO, which triggers the SIGTERM →
 * SIGKILL sequence in `spawnIO`. Total worst-case elapsed time is therefore
 * `timeoutMs + graceMs` (≈ 5.5 s by default), well under the 60 s host watchdog.
 */
const CLI_GRACE_MS = 500;

type CliTimedOut = { readonly timedOut: true; readonly timeoutMs: number };
type CliMiss = undefined | CliTimedOut;

/** Narrow `SpawnError | CliMiss` down to `CliMiss` for the foldM error branch. */
const toCliMiss = (err: unknown): CliMiss => {
  if (
    err !== null &&
    typeof err === "object" &&
    (err as { timedOut?: unknown }).timedOut === true
  ) {
    return err as CliTimedOut;
  }
  // Any SpawnError variant → treat as normal miss (undefined).
  return undefined;
};

const tryCli = (
  spawnIO: ResolverDeps["spawnIO"],
  bin: string,
  args: ReadonlyArray<string>,
  timeoutMs: number,
  via: string,
): IO<CliMiss, { hit: string; via: string }> => {
  const runSpawn = spawnIO(bin, args, undefined, { graceMs: CLI_GRACE_MS });

  // Apply wall-clock budget via io.timeout(). When the budget expires, the
  // inner IO is cancelled — spawnIO's AbortSignal fires (SIGTERM → SIGKILL
  // after CLI_GRACE_MS). The timeout error propagates as Left<CliTimedOut> so
  // callers can distinguish a hung CLI from a normal miss and emit a
  // diagnostic hint instead of a generic "not found" message.
  const withTimeout = runSpawn.timeout(timeoutMs, (): CliTimedOut => ({ timedOut: true, timeoutMs }));

  return withTimeout.foldM(
    // SpawnError OR CliTimedOut → narrow to CliMiss and propagate
    (err): IO<CliMiss, { hit: string; via: string }> =>
      IO.fail<CliMiss, { hit: string; via: string }>(toCliMiss(err)),
    (output): IO<CliMiss, { hit: string; via: string }> => {
      const trimmed = output.stdout.trim();
      if (output.exitCode !== 0 || trimmed.length === 0) {
        return IO.fail<CliMiss, { hit: string; via: string }>(undefined);
      }
      return IO.pure({ hit: trimmed, via });
    },
  );
};

// ---------------------------------------------------------------------------
// Per-adapter resolver chains
// ---------------------------------------------------------------------------

/** Resolve a no-op adapter (CLI-managed auth). Always succeeds. */
const resolveCliManaged = (): IO<ResolverError, ResolvedCredential> =>
  IO.pure<ResolvedCredential>({ secret: undefined, detail: "uses CLI's own login" });

/** Resolve `github` credentials: GITHUB_TOKEN → GH_TOKEN → gh auth token CLI. */
const resolveGitHub = (
  env: Readonly<Record<string, string | undefined>>,
  spawnIO: ResolverDeps["spawnIO"],
  timeoutMs: number,
): IO<ResolverError, ResolvedCredential> => {
  const attempted = ["GITHUB_TOKEN env", "GH_TOKEN env", "gh auth token CLI"];

  // Step 1: env vars
  const envHit = tryEnv(env, ["GITHUB_TOKEN", "GH_TOKEN"]);
  if (envHit !== undefined) {
    return IO.pure<ResolvedCredential>({
      secret: envHit.hit,
      detail: `via ${envHit.via}`,
    });
  }

  // Step 2: gh auth token CLI
  return tryCli(spawnIO, "gh", ["auth", "token"], timeoutMs, "gh CLI").foldM(
    (err): IO<ResolverError, ResolvedCredential> => {
      const hint =
        err !== undefined && err.timedOut
          ? `\`gh auth token\` timed out after ${err.timeoutMs}ms — is the CLI hanging?`
          : "Run `gh auth login` or export GITHUB_TOKEN";
      return IO.fail<ResolverError, ResolvedCredential>({
        kind: "missing-credential",
        adapterId: "github",
        attempted,
        hint,
      });
    },
    (result): IO<ResolverError, ResolvedCredential> =>
      IO.pure<ResolvedCredential>({ secret: result.hit, detail: `via ${result.via}` }),
  );
};

/** Resolve `ado` credentials: AZURE_DEVOPS_EXT_PAT → az CLI access token. */
const resolveAdo = (
  env: Readonly<Record<string, string | undefined>>,
  spawnIO: ResolverDeps["spawnIO"],
  timeoutMs: number,
): IO<ResolverError, ResolvedCredential> => {
  const attempted = ["AZURE_DEVOPS_EXT_PAT env", "az CLI access token"];

  // Step 1: env var
  const envHit = tryEnv(env, ["AZURE_DEVOPS_EXT_PAT"]);
  if (envHit !== undefined) {
    return IO.pure<ResolvedCredential>({
      secret: envHit.hit,
      detail: `via ${envHit.via}`,
    });
  }

  // Step 2: az account get-access-token
  const azArgs = [
    "account",
    "get-access-token",
    "--resource",
    "499b84ac-1321-427f-aa17-267ca6975798",
    "--query",
    "accessToken",
    "-o",
    "tsv",
  ] as const;

  return tryCli(spawnIO, "az", azArgs, timeoutMs, "az CLI").foldM(
    (err): IO<ResolverError, ResolvedCredential> => {
      const hint =
        err !== undefined && err.timedOut
          ? `\`az account get-access-token\` timed out after ${err.timeoutMs}ms — is the CLI hanging?`
          : "Run `az login` or export AZURE_DEVOPS_EXT_PAT";
      return IO.fail<ResolverError, ResolvedCredential>({
        kind: "missing-credential",
        adapterId: "ado",
        attempted,
        hint,
      });
    },
    (result): IO<ResolverError, ResolvedCredential> =>
      IO.pure<ResolvedCredential>({ secret: result.hit, detail: `via ${result.via}` }),
  );
};

/** Resolve `claude-api` credentials: ANTHROPIC_API_KEY env. */
const resolveClaudeApi = (
  env: Readonly<Record<string, string | undefined>>,
): IO<ResolverError, ResolvedCredential> => {
  const attempted = ["ANTHROPIC_API_KEY env"];

  const envHit = tryEnv(env, ["ANTHROPIC_API_KEY"]);
  if (envHit !== undefined) {
    return IO.pure<ResolvedCredential>({
      secret: envHit.hit,
      detail: `via ${envHit.via}`,
    });
  }

  return IO.fail<ResolverError, ResolvedCredential>({
    kind: "missing-credential",
    adapterId: "claude-api",
    attempted,
    hint: "Export ANTHROPIC_API_KEY",
  });
};

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Builds the default per-adapter credential resolver. Chains env → CLI fallback
 * as documented in ADR-29 §Per-adapter resolver chain.
 *
 * @param deps - env source + spawnIO + optional timeout override.
 * @returns A `CredentialResolver` covering all six adapter IDs.
 */
export const createDefaultCredentialResolver = (deps: ResolverDeps): CredentialResolver => {
  const { env, spawnIO, subprocessTimeoutMs = 5000 } = deps;

  return {
    resolve: (adapterId: string): IO<ResolverError, ResolvedCredential> => {
      switch (adapterId) {
        case "github":
          return resolveGitHub(env, spawnIO, subprocessTimeoutMs);
        case "ado":
          return resolveAdo(env, spawnIO, subprocessTimeoutMs);
        case "claude-api":
          return resolveClaudeApi(env);
        case "claude-cli":
        case "codex-cli":
        case "copilot-cli":
          return resolveCliManaged();
        default:
          return IO.fail<ResolverError, ResolvedCredential>({
            kind: "missing-credential",
            adapterId,
            attempted: [],
            hint: `No resolver registered for adapter "${adapterId}"`,
          });
      }
    },
  };
};
