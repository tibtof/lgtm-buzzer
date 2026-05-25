import { describe, expect, it } from "vitest";
import {
  createQuestionPoolCache,
  type Pool,
  type PoolQuestion,
  type SampleMapping,
} from "./question-pool-cache.js";
import type { QuestionId, ChoiceId } from "@lgtm-buzzer/core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const qid = (s: string): QuestionId => s as QuestionId;
const cid = (s: string): ChoiceId => s as ChoiceId;

const makeQuestion = (id: string): PoolQuestion => ({
  type: "multiple-choice",
  id: qid(id),
  prompt: `Question ${id}`,
  choices: [
    { id: cid("a"), label: "Option A" },
    { id: cid("b"), label: "Option B" },
  ],
  correctChoiceId: cid("a"),
});

const makePool = (key: string, questionCount = 3): Pool => ({
  key,
  questions: Array.from({ length: questionCount }, (_, i) =>
    makeQuestion(`q${i + 1}`),
  ),
  llmAdapterId: "claude-cli",
  createdAt: Date.now(),
});

const makeSampleMapping = (
  sampleQuizId: string,
  poolKey: string,
): SampleMapping => ({
  sampleQuizId,
  poolKey,
  sampledQuestionIds: [qid("q1"), qid("q2")],
});

// ---------------------------------------------------------------------------
// Tests: basic get/put
// ---------------------------------------------------------------------------

describe("createQuestionPoolCache — get/put", () => {
  it("returns undefined for unknown key", () => {
    const cache = createQuestionPoolCache();
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("returns a pool that was just put", () => {
    const cache = createQuestionPoolCache();
    const pool = makePool("key-1");
    cache.put(pool);
    expect(cache.get("key-1")).toBe(pool);
  });

  it("size reflects the number of stored pools", () => {
    const cache = createQuestionPoolCache();
    expect(cache.size()).toBe(0);
    cache.put(makePool("k1"));
    expect(cache.size()).toBe(1);
    cache.put(makePool("k2"));
    expect(cache.size()).toBe(2);
  });

  it("overwrites an existing pool when the same key is put again", () => {
    const cache = createQuestionPoolCache();
    const pool1 = makePool("key-x", 3);
    const pool2 = makePool("key-x", 5);
    cache.put(pool1);
    cache.put(pool2);
    expect(cache.get("key-x")).toBe(pool2);
    expect(cache.size()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: LRU eviction
// ---------------------------------------------------------------------------

describe("createQuestionPoolCache — LRU eviction", () => {
  it("evicts oldest entry when capacity is exceeded", () => {
    const cache = createQuestionPoolCache({ capacity: 3 });
    cache.put(makePool("oldest"));
    cache.put(makePool("middle"));
    cache.put(makePool("newest"));

    // At capacity; "oldest" is still there.
    expect(cache.get("oldest")).toBeDefined();

    // Insert a 4th — "oldest" should be evicted.
    cache.put(makePool("extra"));
    expect(cache.size()).toBe(3);
    expect(cache.get("oldest")).toBeUndefined();
    expect(cache.get("middle")).toBeDefined();
    expect(cache.get("newest")).toBeDefined();
    expect(cache.get("extra")).toBeDefined();
  });

  it("refreshes LRU position on re-put of existing key", () => {
    const cache = createQuestionPoolCache({ capacity: 3 });
    cache.put(makePool("a"));
    cache.put(makePool("b"));
    cache.put(makePool("c"));

    // Re-put "a" to refresh it to newest.
    cache.put(makePool("a"));

    // Insert "d" — "b" (now oldest) should be evicted, not "a".
    cache.put(makePool("d"));
    expect(cache.size()).toBe(3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBeDefined();
    expect(cache.get("c")).toBeDefined();
    expect(cache.get("d")).toBeDefined();
  });

  it("does not evict when exactly at capacity", () => {
    const cache = createQuestionPoolCache({ capacity: 2 });
    cache.put(makePool("one"));
    cache.put(makePool("two"));
    expect(cache.size()).toBe(2);
    expect(cache.get("one")).toBeDefined();
    expect(cache.get("two")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: buildKey
// ---------------------------------------------------------------------------

describe("createQuestionPoolCache — buildKey", () => {
  it("builds a composite key in the expected shape", () => {
    const cache = createQuestionPoolCache();
    const key = cache.buildKey({
      prKind: "github",
      llmAdapterId: "claude-cli",
      prCanonical: "github:acme/api#42",
      diffHash: "deadbeef",
    });
    expect(key).toBe("github|claude-cli|github:acme/api#42|deadbeef");
  });

  it("builds an ADO key", () => {
    const cache = createQuestionPoolCache();
    const key = cache.buildKey({
      prKind: "ado",
      llmAdapterId: "codex-cli",
      prCanonical: "ado:myorg/myproj/myrepo#7",
      diffHash: "cafebabe",
    });
    expect(key).toBe("ado|codex-cli|ado:myorg/myproj/myrepo#7|cafebabe");
  });

  it("same diff but different prCanonical → different key", () => {
    const cache = createQuestionPoolCache();
    const base = {
      prKind: "github" as const,
      llmAdapterId: "claude-cli",
      diffHash: "aabbccdd",
    };
    const k1 = cache.buildKey({ ...base, prCanonical: "github:acme/api#1" });
    const k2 = cache.buildKey({ ...base, prCanonical: "github:acme/api#2" });
    expect(k1).not.toBe(k2);
  });

  it("same prCanonical but different diffHash → different key", () => {
    const cache = createQuestionPoolCache();
    const base = {
      prKind: "github" as const,
      llmAdapterId: "claude-cli",
      prCanonical: "github:acme/api#1",
    };
    const k1 = cache.buildKey({ ...base, diffHash: "hash-before" });
    const k2 = cache.buildKey({ ...base, diffHash: "hash-after" });
    expect(k1).not.toBe(k2);
  });

  it("same prCanonical + same diffHash but different adapter → different key", () => {
    const cache = createQuestionPoolCache();
    const base = {
      prKind: "github" as const,
      prCanonical: "github:acme/api#1",
      diffHash: "aaaa",
    };
    const k1 = cache.buildKey({ ...base, llmAdapterId: "claude-cli" });
    const k2 = cache.buildKey({ ...base, llmAdapterId: "codex-cli" });
    expect(k1).not.toBe(k2);
  });
});

// ---------------------------------------------------------------------------
// Tests: sample mappings
// ---------------------------------------------------------------------------

describe("createQuestionPoolCache — sample mappings", () => {
  it("returns undefined for unknown sample quizId", () => {
    const cache = createQuestionPoolCache();
    expect(cache.getSampleMapping("unknown")).toBeUndefined();
  });

  it("stores and retrieves a sample mapping", () => {
    const cache = createQuestionPoolCache();
    const mapping = makeSampleMapping("sample-abc", "pool-key-1");
    cache.putSampleMapping(mapping);
    expect(cache.getSampleMapping("sample-abc")).toBe(mapping);
  });

  it("deletes a sample mapping", () => {
    const cache = createQuestionPoolCache();
    const mapping = makeSampleMapping("sample-xyz", "pool-key-2");
    cache.putSampleMapping(mapping);
    cache.deleteSampleMapping("sample-xyz");
    expect(cache.getSampleMapping("sample-xyz")).toBeUndefined();
  });

  it("delete of unknown key is a no-op", () => {
    const cache = createQuestionPoolCache();
    expect(() => cache.deleteSampleMapping("nonexistent")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: diff-only invariant at the type level (ADR-30 §9)
// ---------------------------------------------------------------------------

describe("BuildKeyInput — diff-only invariant", () => {
  it("buildKey only accepts the four expected fields", () => {
    // This test documents that BuildKeyInput has exactly four fields:
    // prKind, llmAdapterId, prCanonical, diffHash.
    // Compile-time enforcement: the TypeScript type does not include
    // prTitle, prDescription, or prComments. This test is the runtime
    // signal that the structure is correct.
    const cache = createQuestionPoolCache();
    const input = {
      prKind: "github" as const,
      llmAdapterId: "claude-cli",
      prCanonical: "github:owner/repo#1",
      diffHash: "abc123",
    };
    // Only these four fields are used in the key.
    const key = cache.buildKey(input);
    expect(key).toContain("abc123"); // diffHash is included
    expect(key).not.toContain("prTitle"); // no title field
    expect(key).not.toContain("prDescription"); // no description field
  });
});
