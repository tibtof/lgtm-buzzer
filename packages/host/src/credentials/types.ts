import type { spawnIO as SpawnIOFn } from "@lgtm-buzzer/adapter-shared";

/**
 * Dependencies needed by the default resolver chain.
 *
 * All fields are injected so tests can supply fakes without touching the OS.
 */
export type ResolverDeps = {
  /** Env source — defaults to `process.env` in production; tests pass a fake. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Subprocess primitive (already wraps cancellation + 5s grace). */
  readonly spawnIO: typeof SpawnIOFn;
  /** Per-subprocess timeout in ms. Default 5000. */
  readonly subprocessTimeoutMs?: number;
};
