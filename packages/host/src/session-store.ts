import type { AnswerKey } from "@lgtm-buzzer/core";
import type { QuizId } from "@lgtm-buzzer/core";

/**
 * In-process store that maps `QuizId` → `AnswerKey` for the duration of a
 * quiz session.
 *
 * Host owns this state (ADR-16 §3). `get` + `delete` are deliberately
 * separate so callers control the lifetime precisely — the dispatcher calls
 * `delete` after scoring to prevent answer-key replay.
 */
export type SessionStore = {
  /** Store an answer key for a quiz. Overwrites any existing entry. */
  readonly set: (quizId: QuizId, key: AnswerKey) => void;
  /** Retrieve the answer key for a quiz, or `undefined` if not found. */
  readonly get: (quizId: QuizId) => AnswerKey | undefined;
  /** Remove the answer key for a quiz (no-replay invariant). */
  readonly delete: (quizId: QuizId) => void;
  /** Number of active quiz sessions (for debugging/metrics). */
  readonly size: () => number;
};

/**
 * Create a `SessionStore` backed by a plain `Map`.
 *
 * No TTL. A host restart clears all sessions, and the extension receives
 * `ErrorFrame { reason: "unknown-quiz-id" }` on the next submit — an
 * acceptable "session expired, retry" UX per ADR-13.
 *
 * @returns A fresh, empty `SessionStore`.
 */
export const createSessionStore = (): SessionStore => {
  const map = new Map<QuizId, AnswerKey>();

  return {
    set: (quizId, key) => {
      map.set(quizId, key);
    },
    get: (quizId) => map.get(quizId),
    delete: (quizId) => {
      map.delete(quizId);
    },
    size: () => map.size,
  };
};
