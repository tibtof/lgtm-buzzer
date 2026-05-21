/**
 * Discriminated success/failure tuple shared across LGTM-Buzzer.
 *
 * Reserve `throw` for invariant violations; every expected failure path
 * returns a `Result<T, E>` with a structured `E`.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Wrap a value as a successful Result. */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/** Wrap an error as a failed Result. */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
