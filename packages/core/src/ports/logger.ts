/**
 * Structured logging port.
 *
 * The first port file in `core`. Logger methods return `void` — they
 * are fire-and-forget side effects. This is the only documented
 * carve-out from CLAUDE.md Functional idiom #2 (see ADR-6 §Constraint 3).
 */
export type LogLevel =
  | "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";

export type LogBindings = Readonly<Record<string, unknown>>;

export type Logger = {
  readonly debug: (msg: string, bindings?: LogBindings) => void;
  readonly info: (msg: string, bindings?: LogBindings) => void;
  readonly warn: (msg: string, bindings?: LogBindings) => void;
  readonly error: (msg: string, bindings?: LogBindings) => void;
  readonly child: (bindings: LogBindings) => Logger;
};
