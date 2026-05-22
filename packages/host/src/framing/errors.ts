import type { z } from "zod";

/**
 * Errors that may occur while decoding a length-prefixed native-messaging frame
 * from stdin. Variants with `continue: no` end the iterator; variants with
 * `continue: yes` allow the reader to advance to the next frame.
 *
 * See ADR-8 §Decision 8 for the full termination policy.
 */
export type DecodeError =
  | { readonly kind: "length-overflow"; readonly declared: number }
  | { readonly kind: "invalid-json"; readonly reason: string }
  | { readonly kind: "schema-violation"; readonly issues: readonly z.ZodIssue[] }
  | { readonly kind: "stream-error"; readonly reason: string }
  | { readonly kind: "premature-eof" };

/**
 * Errors that may occur while writing a length-prefixed native-messaging frame
 * to stdout.
 *
 * See ADR-8 §Decision 10 for the full variant list.
 */
export type WriteError =
  | { readonly kind: "stream-closed" }
  | { readonly kind: "stream-error"; readonly reason: string }
  | { readonly kind: "size-overflow"; readonly bytes: number };

/**
 * Maximum payload size enforced by Chrome's native messaging protocol (1 MiB).
 * Frames exceeding this limit are rejected before any bytes are written or read.
 */
export const MAX_FRAME_BYTES = 1_048_576 as const;

/**
 * Byte length of the uint32 length header that precedes every frame payload.
 * Always 4 bytes, little-endian (Chrome spec).
 */
export const HEADER_BYTES = 4 as const;
