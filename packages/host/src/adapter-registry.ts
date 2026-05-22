import { IO } from "monadyssey";
import type { LLMProvider, VCSProvider, PRIdentifier } from "@lgtm-buzzer/core";
import { createClaudeCliProvider } from "@lgtm-buzzer/adapter-claude-cli";
import { createGithubVcsProvider } from "@lgtm-buzzer/adapter-github";
import { spawnIO } from "@lgtm-buzzer/adapter-shared";
import type { Frame } from "@lgtm-buzzer/protocol";
import { PROTOCOL_VERSION } from "@lgtm-buzzer/protocol";

/**
 * Error returned when adapter selection fails.
 */
export type AdapterError =
  | { readonly kind: "llm-not-configured"; readonly detail: string }
  | { readonly kind: "vcs-not-configured"; readonly detail: string }
  | { readonly kind: "vcs-not-implemented"; readonly detail: string };

/**
 * Build an `ErrorFrame` suitable for sending over the wire.
 *
 * @param reason - The `ErrorReason` string from ADR-13.
 * @param message - A human-readable message (never includes diff bytes).
 * @param correlationId - The correlationId from the incoming frame, if any.
 * @returns A well-formed error `Frame`.
 */
export const buildErrorFrame = (
  reason: "internal" | "unknown-quiz-id" | "schema-violation" | "unknown-message",
  message: string,
  correlationId: string | null,
): Frame => ({
  v: PROTOCOL_VERSION,
  kind: "error",
  correlationId,
  payload: { reason, message },
});

/**
 * Select the LLM provider based on the `LGTM_BUZZER_LLM` environment variable.
 *
 * Supported values: `cli` (default). `api` is a placeholder until #59 lands.
 *
 * @param env - The environment record to read from. Defaults to `process.env`.
 * @returns `IO<AdapterError, LLMProvider>` — resolves on success, errors on
 *   unsupported or misconfigured values.
 */
export const pickLLMProvider = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): IO<AdapterError, LLMProvider> => {
  const raw = (env["LGTM_BUZZER_LLM"] ?? "cli").trim().toLowerCase();

  if (raw === "api") {
    return IO.fail<AdapterError>({
      kind: "llm-not-configured",
      detail: "api adapter is not implemented in M2 — use LGTM_BUZZER_LLM=cli",
    });
  }

  if (raw === "cli") {
    const provider = createClaudeCliProvider({ spawnIO });
    return IO.lift<AdapterError, LLMProvider>(() => provider);
  }

  return IO.fail<AdapterError>({
    kind: "llm-not-configured",
    detail: `unrecognised LGTM_BUZZER_LLM value: "${raw}" — supported: cli`,
  });
};

/**
 * Select the VCS provider based on the `pr.kind` discriminant.
 *
 * - `github` → `createGithubVcsProvider`; requires `LGTM_BUZZER_GH_TOKEN`.
 * - `ado` → not implemented in M2; returns `AdapterError`.
 *
 * @param pr - The PR identifier from the incoming quiz-request frame.
 * @param env - The environment record to read from. Defaults to `process.env`.
 * @returns `IO<AdapterError, VCSProvider>` — resolves on success, errors when
 *   the adapter is not configured or not yet implemented.
 */
export const pickVCSProvider = (
  pr: PRIdentifier,
  env: Readonly<Record<string, string | undefined>> = process.env,
): IO<AdapterError, VCSProvider> => {
  if (pr.kind === "ado") {
    return IO.fail<AdapterError>({
      kind: "vcs-not-implemented",
      detail: "ado adapter not in M2",
    });
  }

  // pr.kind === "github"
  const token = env["LGTM_BUZZER_GH_TOKEN"];
  if (!token) {
    return IO.fail<AdapterError>({
      kind: "vcs-not-configured",
      detail: "GH token not configured — set LGTM_BUZZER_GH_TOKEN",
    });
  }

  const provider = createGithubVcsProvider({ config: { token } });
  return IO.lift<AdapterError, VCSProvider>(() => provider);
};
