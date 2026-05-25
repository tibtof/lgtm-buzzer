/**
 * SW-stub builder for Playwright e2e tests (ADR-19 §3, extended by ADR-25).
 *
 * Produces a self-contained script string passed to `sw.evaluate(...)` that
 * replaces `chrome.runtime.connectNative` in the persistent Chromium context.
 *
 * The stub is scenario-parameterised so error-path specs do not need separate
 * stub modules. Six scenario kinds are supported (ADR-25 §2).
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
 * The wire-level error reason values the stub can return.
 * Mirrors `ErrorReason` in `@lgtm-buzzer/protocol`.
 *
 * ADR-29: `"bad-credentials"` was removed from the protocol.
 */
export type WireErrorReason =
  | "missing-credentials"
  | "internal"
  | "unsupported-llm-adapter"
  | "unsupported-vcs-adapter";

/**
 * The six scenario kinds the stub knows how to play (ADR-25 §2).
 *
 * - `happy` — quiz-request → quiz-response; quiz-submit → quiz-result (scored).
 * - `wrong-then-right` — first quiz-submit always fails; second is scored normally.
 * - `error-on-quiz-request` — quiz-request → ErrorFrame with the given reason.
 * - `list-adapters` — list-adapters-request → list-adapters-response; other frames → error.
 * - `list-adapters-then-happy` — list-adapters succeeds; quiz flow also works.
 * - `probe-missing-credentials` — list-adapters succeeds; ping → ErrorFrame missing-credentials.
 *   ADR-29: `probe-bad-credentials` removed; replaced by `probe-missing-credentials`.
 */
export type StubScenario =
  | {
      readonly kind: "happy";
      readonly quiz: CannedQuiz;
      readonly correctAnswers: CannedCorrectAnswers;
    }
  | {
      readonly kind: "wrong-then-right";
      readonly quiz: CannedQuiz;
      readonly correctAnswers: CannedCorrectAnswers;
    }
  | {
      readonly kind: "error-on-quiz-request";
      readonly reason: WireErrorReason;
      readonly message: string;
    }
  | {
      readonly kind: "list-adapters";
      readonly llm: readonly string[];
      readonly vcs: readonly string[];
    }
  | {
      readonly kind: "list-adapters-then-happy";
      readonly llm: readonly string[];
      readonly vcs: readonly string[];
      readonly quiz: CannedQuiz;
      readonly correctAnswers: CannedCorrectAnswers;
    }
  | {
      readonly kind: "probe-missing-credentials";
      readonly llm: readonly string[];
      readonly vcs: readonly string[];
    };

/**
 * Builds the inline script string for `sw.evaluate(script)`.
 *
 * The returned string replaces `chrome.runtime.connectNative` with a stub
 * port whose `postMessage` handler services frames according to the scenario.
 *
 * Sets `globalThis.__LGTM_E2E_STUB__` to the scenario kind so specs can
 * assert the correct scenario was installed before proceeding.
 *
 * Each scenario reply frame is self-consistent with the protocol schema:
 * - `quiz-response` contains a valid `CannedQuiz` (the caller's).
 * - `quiz-result` contains `passed`, `correct`, `total`, `perQuestion`.
 * - `list-adapters-response` contains `{ llm, vcs }` arrays.
 * - Error frames contain `{ reason, message }`.
 *
 * @param scenario - The scenario to install.
 * @returns A string that can be passed to `sw.evaluate(...)`.
 */
export const buildSwStubScript = (scenario: StubScenario): string => {
  const PROTOCOL_VERSION = 1;

  switch (scenario.kind) {
    case "happy": {
      const quizJson = JSON.stringify(scenario.quiz);
      const answersJson = JSON.stringify(scenario.correctAnswers);
      return makeStubScript(scenario.kind, PROTOCOL_VERSION, `
        var CANNED_QUIZ = ${quizJson};
        var CORRECT_ANSWERS = ${answersJson};

        function handleFrame(frame) {
          if (!frame || typeof frame.kind !== 'string') {
            return makeErrorFrame(null, 'schema-violation', 'SW stub: invalid frame');
          }
          var cid = frame.correlationId != null ? frame.correlationId : null;
          switch (frame.kind) {
            case 'ping':
              return { v: PROTOCOL_VERSION, kind: 'pong', correlationId: cid,
                payload: { nonce: (frame.payload && frame.payload.nonce) ? frame.payload.nonce : null } };
            case 'quiz-request':
              return { v: PROTOCOL_VERSION, kind: 'quiz-response', correlationId: cid, payload: { quiz: CANNED_QUIZ } };
            case 'quiz-resample-request':
              // ADR-30: resample returns the same canned quiz with a fresh id.
              return { v: PROTOCOL_VERSION, kind: 'quiz-response', correlationId: cid,
                payload: { quiz: Object.assign({}, CANNED_QUIZ, { id: 'quiz-resampled-' + Date.now() }) } };
            case 'quiz-submit':
              return scoreSubmit(frame, cid);
            default:
              return makeErrorFrame(cid, 'internal', 'SW stub: unhandled frame kind');
          }
        }

        function scoreSubmit(frame, cid) {
          var answers = (frame.payload && Array.isArray(frame.payload.answers)) ? frame.payload.answers : [];
          var total = Object.keys(CORRECT_ANSWERS).length;
          var correct = 0;
          var perQuestion = Object.keys(CORRECT_ANSWERS).map(function(qId) {
            var submitted = answers.find(function(a) { return a.questionId === qId; });
            var isCorrect = submitted != null && submitted.chosenChoiceId === CORRECT_ANSWERS[qId];
            if (isCorrect) correct++;
            return { questionId: qId, correct: isCorrect };
          });
          var passed = correct === total && total > 0;
          return { v: PROTOCOL_VERSION, kind: 'quiz-result', correlationId: cid,
            payload: { passed: passed, correct: correct, total: total, perQuestion: perQuestion } };
        }
      `);
    }

    case "wrong-then-right": {
      const quizJson = JSON.stringify(scenario.quiz);
      const answersJson = JSON.stringify(scenario.correctAnswers);
      return makeStubScript(scenario.kind, PROTOCOL_VERSION, `
        var CANNED_QUIZ = ${quizJson};
        var CORRECT_ANSWERS = ${answersJson};
        var submitCount = 0;

        function handleFrame(frame) {
          if (!frame || typeof frame.kind !== 'string') {
            return makeErrorFrame(null, 'schema-violation', 'SW stub: invalid frame');
          }
          var cid = frame.correlationId != null ? frame.correlationId : null;
          switch (frame.kind) {
            case 'ping':
              return { v: PROTOCOL_VERSION, kind: 'pong', correlationId: cid,
                payload: { nonce: (frame.payload && frame.payload.nonce) ? frame.payload.nonce : null } };
            case 'quiz-request':
              return { v: PROTOCOL_VERSION, kind: 'quiz-response', correlationId: cid, payload: { quiz: CANNED_QUIZ } };
            case 'quiz-resample-request':
              // ADR-30: resample returns the same canned quiz with a fresh id.
              return { v: PROTOCOL_VERSION, kind: 'quiz-response', correlationId: cid,
                payload: { quiz: Object.assign({}, CANNED_QUIZ, { id: 'quiz-resampled-' + Date.now() }) } };
            case 'quiz-submit':
              return scoreSubmit(frame, cid);
            default:
              return makeErrorFrame(cid, 'internal', 'SW stub: unhandled frame kind');
          }
        }

        function scoreSubmit(frame, cid) {
          submitCount++;
          // First submit always fails regardless of answers.
          if (submitCount === 1) {
            var total = Object.keys(CORRECT_ANSWERS).length;
            var perQuestion = Object.keys(CORRECT_ANSWERS).map(function(qId) {
              return { questionId: qId, correct: false };
            });
            return { v: PROTOCOL_VERSION, kind: 'quiz-result', correlationId: cid,
              payload: { passed: false, correct: 0, total: total, perQuestion: perQuestion } };
          }
          // Second submit: score normally.
          var answers = (frame.payload && Array.isArray(frame.payload.answers)) ? frame.payload.answers : [];
          var total2 = Object.keys(CORRECT_ANSWERS).length;
          var correct = 0;
          var perQuestion2 = Object.keys(CORRECT_ANSWERS).map(function(qId) {
            var submitted = answers.find(function(a) { return a.questionId === qId; });
            var isCorrect = submitted != null && submitted.chosenChoiceId === CORRECT_ANSWERS[qId];
            if (isCorrect) correct++;
            return { questionId: qId, correct: isCorrect };
          });
          var passed = correct === total2 && total2 > 0;
          return { v: PROTOCOL_VERSION, kind: 'quiz-result', correlationId: cid,
            payload: { passed: passed, correct: correct, total: total2, perQuestion: perQuestion2 } };
        }
      `);
    }

    case "error-on-quiz-request": {
      const reasonJson = JSON.stringify(scenario.reason);
      const messageJson = JSON.stringify(scenario.message);
      return makeStubScript(scenario.kind, PROTOCOL_VERSION, `
        var ERROR_REASON = ${reasonJson};
        var ERROR_MESSAGE = ${messageJson};

        function handleFrame(frame) {
          if (!frame || typeof frame.kind !== 'string') {
            return makeErrorFrame(null, 'schema-violation', 'SW stub: invalid frame');
          }
          var cid = frame.correlationId != null ? frame.correlationId : null;
          switch (frame.kind) {
            case 'ping':
              return { v: PROTOCOL_VERSION, kind: 'pong', correlationId: cid,
                payload: { nonce: (frame.payload && frame.payload.nonce) ? frame.payload.nonce : null } };
            case 'quiz-request':
              return makeErrorFrame(cid, ERROR_REASON, ERROR_MESSAGE);
            default:
              return makeErrorFrame(cid, 'internal', 'SW stub: unhandled frame kind');
          }
        }
      `);
    }

    case "list-adapters": {
      const llmJson = JSON.stringify(scenario.llm);
      const vcsJson = JSON.stringify(scenario.vcs);
      return makeStubScript(scenario.kind, PROTOCOL_VERSION, `
        var LLM_ADAPTERS = ${llmJson};
        var VCS_ADAPTERS = ${vcsJson};

        function handleFrame(frame) {
          if (!frame || typeof frame.kind !== 'string') {
            return makeErrorFrame(null, 'schema-violation', 'SW stub: invalid frame');
          }
          var cid = frame.correlationId != null ? frame.correlationId : null;
          switch (frame.kind) {
            case 'ping':
              return { v: PROTOCOL_VERSION, kind: 'pong', correlationId: cid,
                payload: { nonce: (frame.payload && frame.payload.nonce) ? frame.payload.nonce : null } };
            case 'list-adapters-request':
              return { v: PROTOCOL_VERSION, kind: 'list-adapters-response', correlationId: cid,
                payload: { llm: LLM_ADAPTERS, vcs: VCS_ADAPTERS } };
            default:
              return makeErrorFrame(cid, 'internal', 'SW stub: scenario does not handle this kind');
          }
        }
      `);
    }

    case "list-adapters-then-happy": {
      const llmJson = JSON.stringify(scenario.llm);
      const vcsJson = JSON.stringify(scenario.vcs);
      const quizJson = JSON.stringify(scenario.quiz);
      const answersJson = JSON.stringify(scenario.correctAnswers);
      return makeStubScript(scenario.kind, PROTOCOL_VERSION, `
        var LLM_ADAPTERS = ${llmJson};
        var VCS_ADAPTERS = ${vcsJson};
        var CANNED_QUIZ = ${quizJson};
        var CORRECT_ANSWERS = ${answersJson};

        function handleFrame(frame) {
          if (!frame || typeof frame.kind !== 'string') {
            return makeErrorFrame(null, 'schema-violation', 'SW stub: invalid frame');
          }
          var cid = frame.correlationId != null ? frame.correlationId : null;
          switch (frame.kind) {
            case 'ping':
              return { v: PROTOCOL_VERSION, kind: 'pong', correlationId: cid,
                payload: { nonce: (frame.payload && frame.payload.nonce) ? frame.payload.nonce : null } };
            case 'list-adapters-request':
              return { v: PROTOCOL_VERSION, kind: 'list-adapters-response', correlationId: cid,
                payload: { llm: LLM_ADAPTERS, vcs: VCS_ADAPTERS } };
            case 'quiz-request':
              return { v: PROTOCOL_VERSION, kind: 'quiz-response', correlationId: cid, payload: { quiz: CANNED_QUIZ } };
            case 'quiz-resample-request':
              // ADR-30: resample returns the same canned quiz with a fresh id.
              return { v: PROTOCOL_VERSION, kind: 'quiz-response', correlationId: cid,
                payload: { quiz: Object.assign({}, CANNED_QUIZ, { id: 'quiz-resampled-' + Date.now() }) } };
            case 'quiz-submit':
              return scoreSubmit(frame, cid);
            default:
              return makeErrorFrame(cid, 'internal', 'SW stub: unhandled frame kind');
          }
        }

        function scoreSubmit(frame, cid) {
          var answers = (frame.payload && Array.isArray(frame.payload.answers)) ? frame.payload.answers : [];
          var total = Object.keys(CORRECT_ANSWERS).length;
          var correct = 0;
          var perQuestion = Object.keys(CORRECT_ANSWERS).map(function(qId) {
            var submitted = answers.find(function(a) { return a.questionId === qId; });
            var isCorrect = submitted != null && submitted.chosenChoiceId === CORRECT_ANSWERS[qId];
            if (isCorrect) correct++;
            return { questionId: qId, correct: isCorrect };
          });
          var passed = correct === total && total > 0;
          return { v: PROTOCOL_VERSION, kind: 'quiz-result', correlationId: cid,
            payload: { passed: passed, correct: correct, total: total, perQuestion: perQuestion } };
        }
      `);
    }

    case "probe-missing-credentials": {
      const llmJson = JSON.stringify(scenario.llm);
      const vcsJson = JSON.stringify(scenario.vcs);
      return makeStubScript(scenario.kind, PROTOCOL_VERSION, `
        var LLM_ADAPTERS = ${llmJson};
        var VCS_ADAPTERS = ${vcsJson};

        function handleFrame(frame) {
          if (!frame || typeof frame.kind !== 'string') {
            return makeErrorFrame(null, 'schema-violation', 'SW stub: invalid frame');
          }
          var cid = frame.correlationId != null ? frame.correlationId : null;
          switch (frame.kind) {
            case 'list-adapters-request':
              return { v: PROTOCOL_VERSION, kind: 'list-adapters-response', correlationId: cid,
                payload: { llm: LLM_ADAPTERS, vcs: VCS_ADAPTERS } };
            case 'ping':
              return makeErrorFrame(cid, 'missing-credentials', 'Run gh auth login');
            default:
              return makeErrorFrame(cid, 'internal', 'SW stub: scenario does not handle this kind');
          }
        }
      `);
    }
  }
};

// ---------------------------------------------------------------------------
// Shared script template
// ---------------------------------------------------------------------------

/**
 * Wraps the scenario-specific `handleFrame` implementation in the shared
 * port-stub boilerplate. The `scenarioKind` is used to set the stub marker.
 */
const makeStubScript = (
  scenarioKind: string,
  protocolVersion: number,
  handleFrameImpl: string,
): string => {
  const scenarioJson = JSON.stringify(scenarioKind);
  return `
(function () {
  'use strict';
  var PROTOCOL_VERSION = ${protocolVersion};

  function makeStubbedPort() {
    var messageListeners = [];
    var disconnectListeners = [];
    var port = {
      name: 'com.lgtm_buzzer.host',
      onMessage: {
        addListener: function(fn) { messageListeners.push(fn); },
        removeListener: function(fn) {
          messageListeners = messageListeners.filter(function(l) { return l !== fn; });
        },
      },
      onDisconnect: {
        addListener: function(fn) { disconnectListeners.push(fn); },
        removeListener: function(fn) {
          disconnectListeners = disconnectListeners.filter(function(l) { return l !== fn; });
        },
      },
      disconnect: function() {
        disconnectListeners.forEach(function(fn) { try { fn(port); } catch(_) {} });
      },
      postMessage: function(frame) {
        Promise.resolve().then(function() {
          var response = handleFrame(frame);
          if (response !== null) {
            messageListeners.forEach(function(fn) { try { fn(response); } catch(_) {} });
          }
        });
      },
    };
    return port;
  }

  function makeErrorFrame(correlationId, reason, message) {
    return { v: PROTOCOL_VERSION, kind: 'error', correlationId: correlationId,
      payload: { reason: reason, message: message } };
  }

  ${handleFrameImpl}

  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.connectNative = function() { return makeStubbedPort(); };
  }

  globalThis.__LGTM_E2E_STUB__ = ${scenarioJson};
})();
`;
};
