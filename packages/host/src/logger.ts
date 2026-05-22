import type { LogBindings, Logger } from "@lgtm-buzzer/core";
import pino, { type Logger as PinoLogger } from "pino";

const LEVEL_ENV_VAR = "LGTM_BUZZER_LOG_LEVEL" as const;
const VALID_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;

/** @internal Redact paths that may carry diff or prompt content — see ADR-6 §Constraint 4. */
const REDACT_PATHS: readonly string[] = [
  "diff",
  "body",
  "prompt",
  "pr.body",
  "pr.title",
  "pr.description",
  "pr.commits",
  "request.diff",
  "request.body",
  "request.prompt",
  "quiz",
  "quiz.questions",
  "response.diff",
  "response.body",
  "*.diff",
  "*.body",
  "*.prompt",
];

/** Options accepted by {@link createPinoLogger}. */
export type PinoLoggerOptions = {
  readonly level?: string;
  readonly bindings?: LogBindings;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly destination?: pino.DestinationStream | number;
};

const wrap = (p: PinoLogger): Logger => ({
  debug: (msg, bindings) => { p.debug(bindings ?? {}, msg); },
  info:  (msg, bindings) => { p.info(bindings  ?? {}, msg); },
  warn:  (msg, bindings) => { p.warn(bindings  ?? {}, msg); },
  error: (msg, bindings) => { p.error(bindings ?? {}, msg); },
  child: (bindings)      => wrap(p.child(bindings)),
});

/**
 * Creates a structured {@link Logger} backed by pino, hard-wired to stderr.
 *
 * Log level resolves from (highest priority first):
 * 1. `opts.level`
 * 2. `opts.env.LGTM_BUZZER_LOG_LEVEL`
 * 3. `"info"` (default)
 *
 * Unrecognised level values fall back to `"info"` and emit a single `warn`
 * line naming the bad value. Destination defaults to fd 2 (stderr).
 *
 * @param opts - Optional configuration overrides.
 * @returns A `Logger` instance satisfying the core port contract.
 */
export const createPinoLogger = (opts?: PinoLoggerOptions): Logger => {
  const env = opts?.env ?? process.env;
  const rawLevel = (opts?.level ?? env[LEVEL_ENV_VAR] ?? "info").trim().toLowerCase();

  const isValid = (VALID_LEVELS as readonly string[]).includes(rawLevel);
  const level = isValid ? rawLevel : "info";

  const dest: pino.DestinationStream =
    opts?.destination === undefined
      ? pino.destination(2)
      : typeof opts.destination === "number"
        ? pino.destination(opts.destination)
        : opts.destination;

  // One-time error listener on the destination — single stderr write, no retry (ADR-6 §Constraint 1).
  // Cast through EventEmitter since pino's DestinationStream type does not declare the error event,
  // but the underlying SonicBoom / Writable does expose it at runtime.
  (dest as unknown as NodeJS.EventEmitter).once("error", (err: unknown) => {
    process.stderr.write(`pino destination error: ${String(err)}\n`);
  });

  const pinoInstance = pino(
    {
      level,
      redact: {
        paths: REDACT_PATHS as string[],
        censor: "[Redacted]",
        remove: false,
      },
    },
    dest,
  );

  const wrappedLogger = opts?.bindings
    ? wrap(pinoInstance.child(opts.bindings))
    : wrap(pinoInstance);

  if (!isValid) {
    wrappedLogger.warn(`Unrecognised value for ${LEVEL_ENV_VAR}: "${rawLevel}" — falling back to "info"`);
  }

  return wrappedLogger;
};
