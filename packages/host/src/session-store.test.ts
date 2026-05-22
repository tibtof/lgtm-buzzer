import { describe, expect, it } from "vitest";
import { createSessionStore } from "./session-store.js";
import type { QuizId, QuestionId, ChoiceId, AnswerKey } from "@lgtm-buzzer/core";

const qid = (s: string): QuizId => s as QuizId;
const questionId = (s: string): QuestionId => s as QuestionId;
const choiceId = (s: string): ChoiceId => s as ChoiceId;

const makeKey = (pairs: ReadonlyArray<[string, string]>): AnswerKey =>
  new Map(pairs.map(([q, c]) => [questionId(q), choiceId(c)]));

describe("SessionStore", () => {
  it("set and get returns the stored key", () => {
    const store = createSessionStore();
    const key = makeKey([["q1", "c1"]]);
    store.set(qid("quiz-1"), key);
    expect(store.get(qid("quiz-1"))).toBe(key);
  });

  it("get returns undefined for unknown quiz id", () => {
    const store = createSessionStore();
    expect(store.get(qid("nonexistent"))).toBeUndefined();
  });

  it("delete removes the entry", () => {
    const store = createSessionStore();
    const key = makeKey([["q1", "c1"]]);
    store.set(qid("quiz-1"), key);
    store.delete(qid("quiz-1"));
    expect(store.get(qid("quiz-1"))).toBeUndefined();
  });

  it("no-replay: delete then get returns undefined", () => {
    const store = createSessionStore();
    const key = makeKey([["q1", "c1"]]);
    store.set(qid("quiz-1"), key);
    store.delete(qid("quiz-1"));
    // second get after delete must still return undefined (no replay)
    expect(store.get(qid("quiz-1"))).toBeUndefined();
  });

  it("size reflects current number of active sessions", () => {
    const store = createSessionStore();
    expect(store.size()).toBe(0);
    store.set(qid("q1"), makeKey([]));
    store.set(qid("q2"), makeKey([]));
    expect(store.size()).toBe(2);
    store.delete(qid("q1"));
    expect(store.size()).toBe(1);
  });

  it("set overwrites an existing entry", () => {
    const store = createSessionStore();
    const key1 = makeKey([["q1", "c1"]]);
    const key2 = makeKey([["q1", "c2"]]);
    store.set(qid("quiz-1"), key1);
    store.set(qid("quiz-1"), key2);
    expect(store.get(qid("quiz-1"))).toBe(key2);
  });

  it("delete on nonexistent id is a no-op", () => {
    const store = createSessionStore();
    expect(() => store.delete(qid("never-existed"))).not.toThrow();
    expect(store.size()).toBe(0);
  });
});
