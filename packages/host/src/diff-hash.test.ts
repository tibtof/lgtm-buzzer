import { describe, expect, it } from "vitest";
import { hashDiff } from "./diff-hash.js";
import type { Diff } from "@lgtm-buzzer/core";

const SAMPLE_DIFF = `diff --git a/foo.ts b/foo.ts
index abc..def 100644
--- a/foo.ts
+++ b/foo.ts
@@ -1,3 +1,4 @@
 export const x = 1;
+export const y = 2;` as Diff;

describe("hashDiff", () => {
  it("returns a non-empty hex string", () => {
    const result = hashDiff(SAMPLE_DIFF);
    expect(typeof result).toBe("string");
    expect(result.length).toBe(64); // SHA-256 hex = 64 chars
    expect(/^[0-9a-f]+$/.test(result)).toBe(true);
  });

  it("is deterministic — same diff produces same hash", () => {
    const h1 = hashDiff(SAMPLE_DIFF);
    const h2 = hashDiff(SAMPLE_DIFF);
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different diffs", () => {
    const diff1 = "diff --git a/foo b/foo\n+added line" as Diff;
    const diff2 = "diff --git a/foo b/foo\n+different line" as Diff;
    expect(hashDiff(diff1)).not.toBe(hashDiff(diff2));
  });

  it("produces different hash when bytes are appended (diff-only invariant canary)", () => {
    const base = "diff --git a/foo b/foo\n+changed" as Diff;
    const baseHash = hashDiff(base);
    // Appending bytes (even a comment about the PR title) changes the hash.
    const tampered = (base + " // SECRET_PR_TITLE_CANARY_v1") as Diff;
    expect(hashDiff(tampered)).not.toBe(baseHash);
  });

  it("handles empty diff string", () => {
    const result = hashDiff("" as Diff);
    expect(typeof result).toBe("string");
    expect(result.length).toBe(64);
  });
});
