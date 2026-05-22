/**
 * `@lgtm-buzzer/protocol` — shared wire-format and domain DTO surface.
 *
 * This package will host zod schemas for native-messaging frames and
 * domain DTOs (issue #5 and the M1 wire-format issues #7/#8). For now
 * the file is intentionally empty: the placeholder Result type was
 * removed in ADR-5 in favour of the FP foundation's Either (from
 * `monadyssey`) used directly by `core` and the adapters.
 *
 * `protocol` must remain reusable from any FP stack and therefore
 * does not import `monadyssey` (per CLAUDE.md per-package policy).
 */
export {};
