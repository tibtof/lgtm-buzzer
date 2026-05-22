/**
 * Canonical test data for the e2e suite (ADR-25 §5).
 *
 * The two-question multiple-choice quiz used across happy-path tests. Error-
 * path and options-page specs override per-test; failure-retry uses these
 * same values.
 */

import type { CannedQuiz, CannedCorrectAnswers } from "./sw-stub.js";

/**
 * The canonical two-question multiple-choice quiz used across happy-path tests.
 *
 * Questions reference realistic-looking file names so the data reads naturally
 * in failure output, but they are not connected to any real codebase — the
 * diff-only invariant is preserved (ADR-25 §Test strategy).
 */
export const CANONICAL_QUIZ: CannedQuiz = {
  id: "e2e-quiz-1",
  questions: [
    {
      type: "multiple-choice",
      id: "q1",
      prompt: "Which file was modified?",
      choices: [
        { id: "c1", label: "src/foo.ts" },
        { id: "c2", label: "src/bar.ts" },
      ],
    },
    {
      type: "multiple-choice",
      id: "q2",
      prompt: "What did the change add?",
      choices: [
        { id: "c1", label: "A bug" },
        { id: "c2", label: "A feature" },
      ],
    },
  ],
};

/** The correct answers for `CANONICAL_QUIZ`. */
export const CANONICAL_CORRECT: CannedCorrectAnswers = { q1: "c1", q2: "c2" };
