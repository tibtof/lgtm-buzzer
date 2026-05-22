import { FrameSchema } from "./envelope.js";

/**
 * Parses an untrusted native-messaging payload against the `FrameSchema`.
 *
 * Synchronous and total — never throws. Returns zod's native
 * `{ success: true; data: Frame } | { success: false; error: ZodError }`.
 * Host code wraps the call in `IO.ofSync` and converts the failure to
 * an `ErrorFrame` with `reason: "schema-violation"` (see issue #10).
 *
 * @param raw - Any value arriving from the stdio boundary (typically the
 *   result of `JSON.parse`).
 * @returns A zod safe-parse result whose `.data` is typed as `Frame`
 *   on the happy path.
 */
export const parseFrame = (raw: unknown) => FrameSchema.safeParse(raw);
