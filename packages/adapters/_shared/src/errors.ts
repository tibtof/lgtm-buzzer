/**
 * Discriminated union of all failure modes that `spawnIO` can produce.
 *
 * - `spawn-failed`: the OS could not start the process (ENOENT, EACCES, etc.).
 * - `process-failed`: the process ran and exited with a non-zero exit code.
 * - `cancelled`: the surrounding IO was cancelled and the child was terminated.
 */
export type SpawnError =
  | { readonly kind: "spawn-failed"; readonly reason: string }
  | { readonly kind: "process-failed"; readonly exitCode: number; readonly stderr: string }
  | { readonly kind: "cancelled"; readonly signal: "SIGTERM" | "SIGKILL" };

/**
 * The buffered output of a successfully completed subprocess.
 */
export type SpawnOutput = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};
