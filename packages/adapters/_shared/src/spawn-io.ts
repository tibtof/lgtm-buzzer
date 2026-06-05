import { spawn } from "node:child_process";
import { IO } from "monadyssey";
import type { SpawnError, SpawnOutput } from "./errors.js";

/**
 * Options for `spawnIO`.
 *
 * ADR-36: `onLine` is an NDJSON-aware line-buffered callback invoked once per
 * complete newline-terminated line from stdout. The residual (no trailing
 * newline) is flushed as a final call on process exit. Absent ⇒ pure
 * buffering (unchanged behaviour for all existing callers).
 *
 * BINDING: `onLine` MUST NOT throw. `spawnIO` wraps each invocation in
 * try/catch and swallows any exception so progress is always best-effort
 * and can never break the spawn. The full buffered `SpawnOutput.stdout` is
 * STILL returned; streaming is purely additive.
 */
export type SpawnOptions = {
  /** Milliseconds to wait after SIGTERM before sending SIGKILL. Default: 5000. Non-finite or negative values fall back to 5000. */
  readonly graceMs?: number;
  /**
   * ADR-36: line-buffered stdout callback. Receives one complete line at a
   * time (newline stripped). Residual text with no trailing newline is
   * flushed as a final call when the process exits. MUST NOT throw —
   * `spawnIO` wraps it in try/catch. Absent ⇒ pure buffering (unchanged).
   */
  readonly onLine?: (line: string) => void;
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
// Test hooks (internal — do NOT use outside tests)
// ---------------------------------------------------------------------------

/**
 * @internal
 * Test-only hook. Subscribe to PID notifications from `spawnIO`. The callback
 * is invoked synchronously after `spawn()` returns, before any I/O begins.
 * Reset to a no-op after each test to avoid state leakage.
 *
 * DO NOT USE OUTSIDE TESTS.
 */
export const __spawnIO_testHooks: { onSpawn: (pid: number) => void } = {
  onSpawn: () => {},
};

// ---------------------------------------------------------------------------
// Core subprocess runner
// ---------------------------------------------------------------------------

/**
 * Safely invoke `onLine` with a single complete line, swallowing any
 * exception. Progress is best-effort and MUST NOT break the spawn.
 */
const safeOnLine = (onLine: ((line: string) => void) | undefined, line: string): void => {
  if (onLine === undefined) return;
  try {
    onLine(line);
  } catch {
    // Swallow — progress callback errors must never affect spawn outcome.
  }
};

/**
 * Run a child process and return a Promise that resolves with `SpawnOutput`
 * on success, or rejects with a sentinel-wrapped `SpawnError` on failure.
 * Never throws directly — all failures go through `Promise.reject(thrown(...))`.
 *
 * ADR-36: when `onLine` is provided, stdout is split on `\n` as data arrives.
 * Complete lines are dispatched immediately; the unterminated residual is
 * held and flushed as one final `onLine` call on process exit (before settle).
 * The full buffered `stdout` string is still returned in `SpawnOutput`.
 */
const runChildProcess = (
  command: string,
  args: string[],
  stdin: string | undefined,
  graceMs: number,
  signal: AbortSignal,
  onLine?: (line: string) => void,
): Promise<SpawnOutput> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    // Notify test hooks synchronously so tests can capture the PID before
    // any cancellation is issued. No-op in production (hook defaults to () => {}).
    __spawnIO_testHooks.onSpawn(child.pid!);

    let stdoutChunks = "";
    let stderrChunks = "";
    // ADR-36: residual buffer for incomplete lines (no trailing newline yet).
    let lineBuffer = "";
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = (action: () => void): void => {
      if (settled) return;
      settled = true;
      // ADR-36: flush residual line (no trailing newline) before settling.
      if (onLine !== undefined && lineBuffer.length > 0) {
        safeOnLine(onLine, lineBuffer);
        lineBuffer = "";
      }
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
    // ADR-36: when onLine is provided, also split on newlines and dispatch
    // complete lines immediately. The lineBuffer holds partial line content
    // across chunk boundaries; the full stdoutChunks is still accumulated.
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdoutChunks += text;

      if (onLine !== undefined) {
        // Append to residual and split on newlines.
        lineBuffer += text;
        const lines = lineBuffer.split("\n");
        // All but the last element are complete lines; the last is the new residual.
        lineBuffer = lines[lines.length - 1] ?? "";
        for (let i = 0; i < lines.length - 1; i++) {
          safeOnLine(onLine, lines[i]!);
        }
      }
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
        options?.onLine,
      ),
    liftSpawnError,
  );
