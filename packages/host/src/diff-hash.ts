import { createHash } from "node:crypto";
import type { Diff } from "@lgtm-buzzer/core";

/**
 * Hash a diff for use as a cache key.
 *
 * The hash MUST cover the diff bytes verbatim — no normalisation, no
 * whitespace folding (that would make "small whitespace tweak" collide
 * with a real change). PR title / description / comments MUST NOT be
 * passed to this function. ADR-30 §Diff-only invariant.
 *
 * @param diff - The unified diff string to hash.
 * @returns A hex-encoded SHA-256 digest string.
 */
export const hashDiff = (diff: Diff): string =>
  createHash("sha256").update(diff, "utf8").digest("hex");
