import { spawn } from "node:child_process";
import { IO } from "monadyssey";
import type { SpawnError, SpawnOutput } from "./errors.js";

/**
 * Options for `spawnIO`. Currently carries only `graceMs` — the window
 * between SIGTERM and SIGKILL during cancellation.
 */
export type SpawnOptions = {
  /** Milliseconds to wait after SIGTERM before sending SIGKILL. Default: 5000. Non-finite or negative values fall back to 5000. */
  readonly graceMs?: number;
};

// ---------------------------------------------------------------------------
// Sentinel-throw bridge
//
// `IO.cancellable` requires the inner Promise to reject with an `unknown`
// value that `liftSpawnError` converts into `SpawnError`. We use a
// Symbol-keyed sentinel on the rejected value so `liftSpawnError` can
// distinguish our typed errors from unexpected runtime exceptions.
// ---------------------------------------------------------------------------

const THROWN_SENTINEL = Symbol.for("@lgtm-buzzer/adapter-shared/spawn-thrown");

type ThrownSpawnError = {
  readonly [THROWN_SENTINEL]: true;
  readonly error: SpawnError;
};

/** Wrap a `SpawnError` in the sentinel so it can be identified by `liftSpawnError`. */
const thrown = (error: SpawnError): ThrownSpawnError => ({
  [THROWN_SENTINEL]: true,
  error,
});

/** Narrow `unknown` to `ThrownSpawnError`. */
const isThrownSpawnError = (u: unknown): u is ThrownSpawnError =>
  typeof u === "object" &&
  u !== null &&
  (u as Record<symbol, unknown>)[THROWN_SENTINEL] === true;

/**
 * The `liftE` argument passed to `IO.cancellable`. Unwraps the sentinel
 * into the IO error channel; unrecognised throws become `spawn-failed`.
 */
const liftSpawnError = (e: unknown): SpawnError => {
  if (isThrownSpawnError(e)) {
    return e.error;
  }
  return {
    kind: "spawn-failed",
    reason: `unexpected: ${String(e)}`,
  };
};

/**
 * Clamp `graceMs` to a sane default. Non-finite or negative values fall
 * back to 5000 ms.
 */
const clampGrace = (ms: number | undefined): number => {
  if (ms === undefined || !isFinite(ms) || ms < 0) return 5000;
  return ms;
};

// ---------------------------------------------------------------------------
// Core subprocess runner
// ---------------------------------------------------------------------------

/**
 * Run a child process and return a Promise that resolves with `SpawnOutput`
 * on success, or rejects with a sentinel-wrapped `SpawnError` on failure.
 * Never throws directly — all failures go through `Promise.reject(thrown(...))`.
 */
const runChildProcess = (
  command: string,
  args: string[],
  stdin: string | undefined,
  graceMs: number,
  signal: AbortSignal,
): Promise<SpawnOutput> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutChunks = "";
    let stderrChunks = "";
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = (action: () => void): void => {
      if (settled) return;
      settled = true;
      if (killTimer !== undefined) {
        clearTimeout(killTimer);
        killTimer = undefined;
      }
      signal.removeEventListener("abort", onAbort);
      action();
    };

    const onAbort = (): void => {
      // Send SIGTERM first; schedule SIGKILL after grace period.
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, graceMs);
    };

    signal.addEventListener("abort", onAbort, { once: true });

    // Collect stdout / stderr into strings.
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks += chunk.toString("utf8");
    });

    // OS failed to start the process.
    child.once("error", (err: NodeJS.ErrnoException) => {
      settle(() => {
        const code = err.code ?? "";
        reject(
          thrown({
            kind: "spawn-failed",
            reason: `${code}: ${err.message}`,
          }),
        );
      });
    });

    // Process exited (naturally or via signal).
    child.once("exit", (exitCode, exitSignal) => {
      settle(() => {
        // Cancellation invariant: if the signal was aborted, we always
        // report `cancelled` regardless of how the child managed to exit.
        if (signal.aborted) {
          // Determine which signal actually killed it. If a kill-timer
          // fired (meaning SIGKILL was sent), we report SIGKILL.
          const whichSignal: "SIGTERM" | "SIGKILL" =
            exitSignal === "SIGKILL" ? "SIGKILL" : "SIGTERM";
          reject(thrown({ kind: "cancelled", signal: whichSignal }));
          return;
        }

        const code = exitCode ?? 0;

        if (code !== 0) {
          reject(
            thrown({
              kind: "process-failed",
              exitCode: code,
              stderr: stderrChunks,
            }),
          );
          return;
        }

        resolve({ stdout: stdoutChunks, stderr: stderrChunks, exitCode: 0 });
      });
    });

    // Write stdin and close it (single-shot).
    if (stdin !== undefined) {
      child.stdin.write(stdin, "utf8", () => {
        child.stdin.end();
      });
    } else {
      child.stdin.end();
    }
  });

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Wraps a subprocess invocation in an `IO<SpawnError, SpawnOutput>` with
 * bounded SIGTERM → SIGKILL cancellation.
 *
 * Behaviour:
 * - `shell: false` is hardcoded; never passes through a shell.
 * - `args` is defensively copied at call-site to prevent mutation.
 * - `stdin`, when provided, is written once and the child's stdin is closed.
 * - On IO cancellation: SIGTERM → wait `graceMs` → SIGKILL.
 * - Three distinct error variants: `spawn-failed`, `process-failed`, `cancelled`.
 *
 * @param command - Absolute path or PATH-resolved name of the binary.
 * @param args - Positional arguments. The array is copied before spawn.
 * @param stdin - Optional string written to the child's stdin.
 * @param options - Optional spawn options (currently only `graceMs`).
 * @returns `IO<SpawnError, SpawnOutput>`
 */
export const spawnIO = (
  command: string,
  args: readonly string[],
  stdin?: string,
  options?: SpawnOptions,
): IO<SpawnError, SpawnOutput> =>
  IO.cancellable<SpawnError, SpawnOutput>(
    (signal) =>
      runChildProcess(
        command,
        [...args], // defensive copy
        stdin,
        clampGrace(options?.graceMs),
        signal,
      ),
    liftSpawnError,
  );
