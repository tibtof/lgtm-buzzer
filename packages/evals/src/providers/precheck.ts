import { spawnIO } from "@lgtm-buzzer/adapter-shared";

/**
 * Result of a precheck probe.
 *
 * `available` — the binary responded to `--version` within 3 s.
 * `skipped` — the binary was not found or timed out; the eval cell should be reported as SKIP.
 */
export type PrecheckResult =
  | { readonly kind: "available" }
  | { readonly kind: "skipped"; readonly reason: string };

/**
 * Probes whether a CLI binary is available by running `<binary> --version`
 * with a hard 3-second budget.
 *
 * Returns `{ kind: "skipped" }` when the spawn fails (binary not on PATH,
 * EACCES, etc.) or when the process exits non-zero. Returns `{ kind:
 * "available" }` when the process exits 0 within the budget.
 *
 * @param binary - The binary name or absolute path to probe.
 * @returns A resolved `PrecheckResult`.
 */
export const checkBinary = async (binary: string): Promise<PrecheckResult> => {
  const io = spawnIO(binary, ["--version"]).timeout(
    3_000,
    () => ({ kind: "spawn-failed" as const, reason: "version check timed out" }),
  );

  const result = await io.unsafeRun();

  if (result.type === "Ok") {
    return { kind: "available" };
  }
  return {
    kind: "skipped",
    reason: `binary not available: ${JSON.stringify(result.type === "Err" ? result.error : "cancelled")}`,
  };
};

/**
 * Checks whether `ANTHROPIC_API_KEY` is set in the current environment.
 *
 * Returns `{ kind: "skipped" }` when the key is absent or empty.
 *
 * @returns A `PrecheckResult` based on the environment.
 */
export const checkAnthropicApiKey = (): PrecheckResult => {
  const key = process.env["ANTHROPIC_API_KEY"];
  if (key === undefined || key.trim() === "") {
    return {
      kind: "skipped",
      reason: "ANTHROPIC_API_KEY is not set",
    };
  }
  return { kind: "available" };
};
