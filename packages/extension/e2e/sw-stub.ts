/**
 * SW-stub builder for Playwright e2e tests (ADR-19 §3).
 *
 * Produces a self-contained `addInitScript` string that replaces
 * `chrome.runtime.connectNative` in the persistent Chromium context.
 * The stub handles `quiz-request`, `quiz-submit`, and `ping` frames;
 * everything else returns an ErrorFrame.
 *
 * The script is an inline string literal — it MUST NOT import from
 * `@lgtm-buzzer/protocol` or any workspace package, because it runs
 * inside the browser process, not Node.
 */

/** Minimal quiz shape accepted by the stub (mirrors QuizDTO in protocol). */
export type CannedQuiz = {
  readonly id: string;
  readonly questions: ReadonlyArray<{
    readonly type: "multiple-choice";
    readonly id: string;
    readonly prompt: string;
    readonly choices: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  }>;
};

/** Map of questionId → correct choiceId, kept only in the stub (not on the wire). */
export type CannedCorrectAnswers = Readonly<Record<string, string>>;

/**
 * Builds the inline init-script string for `context.addInitScript`.
 *
 * The returned string replaces `chrome.runtime.connectNative` with a stub
 * port whose `postMessage` handler services three frame kinds:
 *   - `ping`          → synthetic `pong` frame.
 *   - `quiz-request`  → `quiz-response` frame containing `cannedQuiz`.
 *   - `quiz-submit`   → `quiz-result` frame scored against `correctAnswers`.
 *   - anything else   → `error` frame with `reason: "internal"`.
 *
 * Sets `globalThis.__LGTM_E2E_STUB__ = true` so the spec can assert the
 * stub is installed before clicking the Approve button.
 *
 * @param quiz - The canned quiz to return on `quiz-request`.
 * @param correctAnswers - Map of questionId → correct choiceId used for scoring.
 */
export const buildSwStubScript = (
  quiz: CannedQuiz,
  correctAnswers: CannedCorrectAnswers,
): string => {
  // Serialize into the script as JSON literals — no closures that could leak.
  const quizJson = JSON.stringify(quiz);
  const answersJson = JSON.stringify(correctAnswers);

  return `
(function () {
  'use strict';

  var CANNED_QUIZ = ${quizJson};
  var CORRECT_ANSWERS = ${answersJson};
  var PROTOCOL_VERSION = 1;

  /**
   * Minimal stub port that satisfies the extension SW's connectNative call.
   * Listeners are stored in an array; postMessage dispatches frames back via
   * a microtask (matching real native messaging behavior).
   */
  function makeStubbedPort() {
    var messageListeners = [];
    var disconnectListeners = [];

    var port = {
      name: 'com.lgtm_buzzer.host',
      onMessage: {
        addListener: function (fn) { messageListeners.push(fn); },
        removeListener: function (fn) {
          messageListeners = messageListeners.filter(function (l) { return l !== fn; });
        },
      },
      onDisconnect: {
        addListener: function (fn) { disconnectListeners.push(fn); },
        removeListener: function (fn) {
          disconnectListeners = disconnectListeners.filter(function (l) { return l !== fn; });
        },
      },
      disconnect: function () {
        disconnectListeners.forEach(function (fn) { try { fn(port); } catch (_) {} });
      },
      postMessage: function (frame) {
        Promise.resolve().then(function () {
          var response = handleFrame(frame);
          if (response !== null) {
            messageListeners.forEach(function (fn) { try { fn(response); } catch (_) {} });
          }
        });
      },
    };

    return port;
  }

  function handleFrame(frame) {
    if (!frame || typeof frame.kind !== 'string') {
      return makeErrorFrame(null, 'schema-violation');
    }

    var correlationId = frame.correlationId != null ? frame.correlationId : null;

    switch (frame.kind) {
      case 'ping':
        return { v: PROTOCOL_VERSION, kind: 'pong', correlationId: correlationId, payload: {} };

      case 'quiz-request':
        return {
          v: PROTOCOL_VERSION,
          kind: 'quiz-response',
          correlationId: correlationId,
          payload: { quiz: CANNED_QUIZ },
        };

      case 'quiz-submit': {
        var answers = (frame.payload && Array.isArray(frame.payload.answers))
          ? frame.payload.answers
          : [];
        var correct = 0;
        var total = Object.keys(CORRECT_ANSWERS).length;
        var perQuestion = Object.keys(CORRECT_ANSWERS).map(function (qId) {
          var submitted = answers.find(function (a) { return a.questionId === qId; });
          var isCorrect = submitted != null && submitted.chosenChoiceId === CORRECT_ANSWERS[qId];
          if (isCorrect) correct++;
          return { questionId: qId, correct: isCorrect };
        });
        var passed = correct === total && total > 0;
        return {
          v: PROTOCOL_VERSION,
          kind: 'quiz-result',
          correlationId: correlationId,
          payload: { passed: passed, correct: correct, total: total, perQuestion: perQuestion },
        };
      }

      default:
        return makeErrorFrame(correlationId, 'internal');
    }
  }

  function makeErrorFrame(correlationId, reason) {
    return {
      v: PROTOCOL_VERSION,
      kind: 'error',
      correlationId: correlationId,
      payload: { reason: reason, message: 'SW stub: unhandled frame kind' },
    };
  }

  // Replace chrome.runtime.connectNative before extension code runs.
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.connectNative = function () {
      return makeStubbedPort();
    };
  }

  // Marker so the spec can wait until the stub is installed.
  globalThis.__LGTM_E2E_STUB__ = true;
})();
`;
};
