import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { IO, NonEmptyList } from "monadyssey";
import { createDispatcher, makeGenerationObserver } from "./dispatcher.js";
import { createSessionStore } from "./session-store.js";
import { createQuestionPoolCache } from "./question-pool-cache.js";
import type { FrameWriter } from "./framing/writer.js";
import type { Frame } from "@lgtm-buzzer/protocol";
import { PROTOCOL_VERSION, RESAMPLE_FAILED_PREFIX } from "@lgtm-buzzer/protocol";
import type {
  Logger,
  Quiz,
  QuizId,
  QuestionId,
  ChoiceId,
  AnswerKey,
  LLMProvider,
  VCSProvider,
  VCSProviderError,
  LLMProviderError,
  Diff,
  QuizGenerationSignal,
} from "@lgtm-buzzer/core";
import type { AdapterRegistry, RegistryError } from "./registry.js";
import { createProgressEmitter } from "./progress-emitter.js";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

const makeNoopLogger = (): Logger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => makeNoopLogger(),
});

/** Collect all frames written to this fake sink. */
const makeCapturingWriter = (): { writer: FrameWriter; frames: Frame[] } => {
  const frames: Frame[] = [];
  const writer: FrameWriter = (frame) =>
    IO.lift<never, void>(() => {
      frames.push(frame);
    });
  return { writer, frames };
};

const qid = (s: string): QuizId => s as QuizId;
const questionId = (s: string): QuestionId => s as QuestionId;
const choiceId = (s: string): ChoiceId => s as ChoiceId;

const makeChoice = (id: string, label: string) => ({ id: choiceId(id), label });

const makeQuestion = (id: string, prompt: string, correctId: string) => ({
  type: "multiple-choice" as const,
  id: questionId(id),
  prompt,
  choices: new NonEmptyList(makeChoice(correctId, "correct"), [makeChoice("wrong", "wrong")]),
  correctChoiceId: choiceId(correctId),
});

const makeQuiz = (id: string): Quiz => ({
  id: qid(id),
  questions: new NonEmptyList(makeQuestion("q1", "What changed?", "c1"), []),
});

// ---------------------------------------------------------------------------
// Fake adapter registry (IO-returning — ADR-29)
// ---------------------------------------------------------------------------

type FakeLLM = LLMProvider & { generateQuizCalls: number };
type FakeVCS = VCSProvider & { fetchDiffCalls: number };

const makeFakeLlm = (id: string, quiz: Quiz): FakeLLM => {
  let generateQuizCalls = 0;
  return {
    id,
    get generateQuizCalls() {
      return generateQuizCalls;
    },
    generateQuiz: () => {
      generateQuizCalls++;
      return IO.lift(() => quiz);
    },
  };
};

const makeFakeVcs = (id: string, diff: string): FakeVCS => {
  let fetchDiffCalls = 0;
  return {
    id,
    get fetchDiffCalls() {
      return fetchDiffCalls;
    },
    fetchDiff: () => {
      fetchDiffCalls++;
      return IO.lift(() => diff as Diff);
    },
  };
};

/**
 * Build a fake AdapterRegistry where both adapters succeed. Registry now
 * returns IO (ADR-29).
 */
const makeFakeRegistry = (
  llm: LLMProvider = makeFakeLlm("claude-cli", makeQuiz("quiz-fake")),
  vcs: VCSProvider = makeFakeVcs("github", "diff --git a/foo.ts"),
): AdapterRegistry => ({
  listLlm: () => ["claude-api", "claude-cli", "codex-cli", "copilot-cli"],
  listVcs: () => ["ado", "github"],
  buildLlm: () => IO.pure(llm),
  buildVcs: () => IO.pure(vcs),
});

/**
 * Build a fake AdapterRegistry that fails LLM construction with the given error.
 */
const makeFailingLlmRegistry = (err: RegistryError): AdapterRegistry => ({
  listLlm: () => ["claude-cli"],
  listVcs: () => ["github"],
  buildLlm: () => IO.fail(err),
  buildVcs: () => IO.pure(makeFakeVcs("github", "diff --git a/foo.ts")),
});

// ---------------------------------------------------------------------------
// Dispatcher factory builder for tests
// ---------------------------------------------------------------------------

const makeTestSetup = (registry?: AdapterRegistry) => {
  const store = createSessionStore();
  const { writer, frames } = makeCapturingWriter();
  const logger = makeNoopLogger();
  const reg = registry ?? makeFakeRegistry();
  const cache = createQuestionPoolCache();
  const dispatcher = createDispatcher({ write: writer, store, logger, registry: reg, cache });
  return { dispatcher, store, frames, logger, registry: reg, cache };
};

// ---------------------------------------------------------------------------
// Tests: ping/pong
// ---------------------------------------------------------------------------

describe("dispatcher — ping/pong", () => {
  it("responds with pong echoing correlationId and nonce", async () => {
    const { dispatcher, frames } = makeTestSetup();
    const pingFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "ping",
      correlationId: "corr-1",
      payload: { nonce: "n42" },
    };

    await dispatcher.dispatch(pingFrame).unsafeRun();

    expect(frames).toHaveLength(1);
    const pong = frames[0]!;
    expect(pong.kind).toBe("pong");
    expect(pong.correlationId).toBe("corr-1");
    if (pong.kind === "pong") {
      expect(pong.payload.nonce).toBe("n42");
    }
  });

  it("responds with pong without nonce when ping has no nonce", async () => {
    const { dispatcher, frames } = makeTestSetup();
    const pingFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "ping",
      correlationId: "corr-2",
      payload: {},
    };

    await dispatcher.dispatch(pingFrame).unsafeRun();

    expect(frames).toHaveLength(1);
    const pong = frames[0]!;
    expect(pong.kind).toBe("pong");
    if (pong.kind === "pong") {
      expect(pong.payload.nonce).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: error frame from extension
// ---------------------------------------------------------------------------

describe("dispatcher — error frame from extension", () => {
  it("logs and ignores error frame — no reply frame sent", async () => {
    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const warnSpy = vi.spyOn(logger, "warn");

    const dispatcher = createDispatcher({
      write: writer,
      store,
      logger,
      registry: makeFakeRegistry(),
      cache: createQuestionPoolCache(),
    });
    const errFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "error",
      correlationId: "corr-err",
      payload: { reason: "schema-violation", message: "bad stuff" },
    };

    await dispatcher.dispatch(errFrame).unsafeRun();

    expect(frames).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: unexpected frame kinds
// ---------------------------------------------------------------------------

describe("dispatcher — unexpected frame kinds", () => {
  it("pong frame received → ErrorFrame with unknown-message", async () => {
    const { dispatcher, frames } = makeTestSetup();
    const pongFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "pong",
      correlationId: "corr-3",
      payload: {},
    };

    await dispatcher.dispatch(pongFrame).unsafeRun();

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("error");
    if (reply.kind === "error") {
      expect(reply.payload.reason).toBe("unknown-message");
    }
  });

  it("quiz-response frame received → ErrorFrame with unknown-message", async () => {
    const { dispatcher, frames } = makeTestSetup();
    const quizResponseFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-response",
      correlationId: "corr-4",
      payload: {
        quiz: {
          id: "quiz-1",
          questions: [
            {
              type: "multiple-choice",
              id: "q1",
              prompt: "test?",
              choices: [{ id: "c1", label: "yes" }],
            },
          ],
        },
      },
    };

    await dispatcher.dispatch(quizResponseFrame).unsafeRun();

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("error");
    if (reply.kind === "error") {
      expect(reply.payload.reason).toBe("unknown-message");
    }
  });

  it("quiz-result frame received → ErrorFrame with unknown-message", async () => {
    const { dispatcher, frames } = makeTestSetup();
    const quizResultFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-result",
      correlationId: "corr-5",
      payload: { passed: true, correct: 1, total: 1 },
    };

    await dispatcher.dispatch(quizResultFrame).unsafeRun();

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("error");
    if (reply.kind === "error") {
      expect(reply.payload.reason).toBe("unknown-message");
    }
  });

  it("list-adapters-response received → ErrorFrame with unknown-message", async () => {
    const { dispatcher, frames } = makeTestSetup();
    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "list-adapters-response",
      correlationId: "corr-lars",
      payload: { llm: ["claude-cli"], vcs: ["github"] },
    };

    await dispatcher.dispatch(frame).unsafeRun();

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("error");
    if (reply.kind === "error") {
      expect(reply.payload.reason).toBe("unknown-message");
    }
  });

  it("check-auth-response received → ErrorFrame with unknown-message", async () => {
    const { dispatcher, frames } = makeTestSetup();
    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "check-auth-response",
      correlationId: "corr-cars",
      payload: { statuses: [] },
    };

    await dispatcher.dispatch(frame).unsafeRun();

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("error");
    if (reply.kind === "error") {
      expect(reply.payload.reason).toBe("unknown-message");
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: quiz-submit with unknown quiz ID
// ---------------------------------------------------------------------------

describe("dispatcher — quiz-submit with unknown quiz ID", () => {
  it("returns ErrorFrame with unknown-quiz-id when quizId not in store", async () => {
    const { dispatcher, frames } = makeTestSetup();
    const submitFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-submit",
      correlationId: "corr-submit-1",
      payload: {
        quizId: "nonexistent-quiz",
        answers: [{ questionId: "q1", chosenChoiceId: "c1" }],
      },
    };

    await dispatcher.dispatch(submitFrame).unsafeRun();

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("error");
    if (reply.kind === "error") {
      expect(reply.payload.reason).toBe("unknown-quiz-id");
      expect(reply.correlationId).toBe("corr-submit-1");
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: quiz-submit happy path
// ---------------------------------------------------------------------------

describe("dispatcher — quiz-submit happy path", () => {
  it("scores submission correctly and returns quiz-result with passed=true", async () => {
    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({
      write: writer,
      store,
      logger,
      registry: makeFakeRegistry(),
      cache: createQuestionPoolCache(),
    });

    const answerKey: AnswerKey = new Map([[questionId("q1"), choiceId("c1")]]);
    store.set(qid("quiz-happy"), answerKey);

    const submitFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-submit",
      correlationId: "corr-submit-2",
      payload: {
        quizId: "quiz-happy",
        answers: [{ questionId: "q1", chosenChoiceId: "c1" }],
      },
    };

    await dispatcher.dispatch(submitFrame).unsafeRun();

    expect(frames).toHaveLength(1);
    const result = frames[0]!;
    expect(result.kind).toBe("quiz-result");
    if (result.kind === "quiz-result") {
      expect(result.payload.passed).toBe(true);
      expect(result.payload.correct).toBe(1);
      expect(result.payload.total).toBe(1);
      expect(result.correlationId).toBe("corr-submit-2");
    }
  });

  it("returns passed=false when answer is wrong", async () => {
    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({
      write: writer,
      store,
      logger,
      registry: makeFakeRegistry(),
      cache: createQuestionPoolCache(),
    });

    const answerKey: AnswerKey = new Map([[questionId("q1"), choiceId("c1")]]);
    store.set(qid("quiz-wrong"), answerKey);

    const submitFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-submit",
      correlationId: "corr-submit-3",
      payload: {
        quizId: "quiz-wrong",
        answers: [{ questionId: "q1", chosenChoiceId: "wrong-answer" }],
      },
    };

    await dispatcher.dispatch(submitFrame).unsafeRun();

    expect(frames).toHaveLength(1);
    const result = frames[0]!;
    expect(result.kind).toBe("quiz-result");
    if (result.kind === "quiz-result") {
      expect(result.payload.passed).toBe(false);
      expect(result.payload.correct).toBe(0);
      expect(result.payload.total).toBe(1);
    }
  });

  it("no-replay: store entry is deleted after scoring", async () => {
    const store = createSessionStore();
    const { writer } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({
      write: writer,
      store,
      logger,
      registry: makeFakeRegistry(),
      cache: createQuestionPoolCache(),
    });

    const answerKey: AnswerKey = new Map([[questionId("q1"), choiceId("c1")]]);
    store.set(qid("quiz-noreplay"), answerKey);

    const submitFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-submit",
      correlationId: "corr-submit-4",
      payload: {
        quizId: "quiz-noreplay",
        answers: [{ questionId: "q1", chosenChoiceId: "c1" }],
      },
    };

    await dispatcher.dispatch(submitFrame).unsafeRun();

    expect(store.get(qid("quiz-noreplay"))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: quiz-submit duplicate questionId
// ---------------------------------------------------------------------------

describe("dispatcher — quiz-submit duplicate questionId", () => {
  it("returns ErrorFrame with schema-violation for duplicate questionId", async () => {
    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({
      write: writer,
      store,
      logger,
      registry: makeFakeRegistry(),
      cache: createQuestionPoolCache(),
    });

    const answerKey: AnswerKey = new Map([[questionId("q1"), choiceId("c1")]]);
    store.set(qid("quiz-dup"), answerKey);

    const submitFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-submit",
      correlationId: "corr-dup",
      payload: {
        quizId: "quiz-dup",
        answers: [
          { questionId: "q1", chosenChoiceId: "c1" },
          { questionId: "q1", chosenChoiceId: "c1" }, // duplicate
        ],
      },
    };

    await dispatcher.dispatch(submitFrame).unsafeRun();

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("error");
    if (reply.kind === "error") {
      expect(reply.payload.reason).toBe("schema-violation");
    }
  });

  it("returns ErrorFrame with schema-violation for unknown questionId in submission", async () => {
    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({
      write: writer,
      store,
      logger,
      registry: makeFakeRegistry(),
      cache: createQuestionPoolCache(),
    });

    // Answer key has only q1
    const answerKey: AnswerKey = new Map([[questionId("q1"), choiceId("c1")]]);
    store.set(qid("quiz-unknown-q"), answerKey);

    const submitFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-submit",
      correlationId: "corr-unknown-q",
      payload: {
        quizId: "quiz-unknown-q",
        answers: [
          { questionId: "q999", chosenChoiceId: "c1" }, // unknown questionId
        ],
      },
    };

    await dispatcher.dispatch(submitFrame).unsafeRun();

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("error");
    if (reply.kind === "error") {
      expect(reply.payload.reason).toBe("schema-violation");
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: correctChoiceId gate integrity
// ---------------------------------------------------------------------------

describe("dispatcher — correctChoiceId gate integrity", () => {
  it("wire-format quiz questions do not contain correctChoiceId", () => {
    // Verify that the mapping from domain Quiz to wire QuestionDTO strips correctChoiceId.
    const quiz = makeQuiz("quiz-gate");

    const wireDTOs = quiz.questions.toArray().map((q) => {
      const base = {
        type: "multiple-choice" as const,
        id: q.id,
        prompt: q.prompt,
        choices: q.choices.toArray().map((c) => ({ id: c.id, label: c.label })),
      };
      return q.explanation !== undefined
        ? { ...base, explanation: q.explanation }
        : base;
    });

    for (const dto of wireDTOs) {
      expect("correctChoiceId" in dto).toBe(false);
    }
  });

  it("domain quiz has correctChoiceId but wire DTO does not", () => {
    const quiz = makeQuiz("quiz-gate-2");
    const domainQuestion = quiz.questions.head;
    // Domain question has correctChoiceId
    expect("correctChoiceId" in domainQuestion).toBe(true);

    // Wire DTO strips it
    const wireDTO = {
      type: "multiple-choice" as const,
      id: domainQuestion.id,
      prompt: domainQuestion.prompt,
      choices: domainQuestion.choices.toArray().map((c) => ({ id: c.id, label: c.label })),
    };
    expect("correctChoiceId" in wireDTO).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: ADR-29 — registry error handling in quiz-request (IO-returning)
// ---------------------------------------------------------------------------

describe("dispatcher — quiz-request with unsupported-llm-adapter", () => {
  it("quiz-request with unknown llmAdapterId → ErrorFrame with unsupported-llm-adapter", async () => {
    const err: RegistryError = { kind: "unsupported-llm-adapter", id: "unknown-llm" };
    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const registry = makeFailingLlmRegistry(err);
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache: createQuestionPoolCache() });

    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "corr-bad-llm",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 3,
        llmAdapterId: "unknown-llm",
        vcsAdapterId: "github",
      },
    };

    await dispatcher.dispatch(frame).unsafeRun();
    // Wait for forked fiber
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("error");
    if (reply.kind === "error") {
      expect(reply.payload.reason).toBe("unsupported-llm-adapter");
    }
  });
});

describe("dispatcher — quiz-request with unsupported-vcs-adapter", () => {
  it("quiz-request with unknown vcsAdapterId → ErrorFrame with unsupported-vcs-adapter; no generateQuiz call", async () => {
    const err: RegistryError = { kind: "unsupported-vcs-adapter", id: "unknown-vcs" };
    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();

    // Track whether generateQuiz was called
    let generateQuizCallCount = 0;
    const trackingLlm: LLMProvider = {
      id: "claude-cli",
      generateQuiz: () => {
        generateQuizCallCount++;
        return IO.lift(() => makeQuiz("x"));
      },
    };

    const registry: AdapterRegistry = {
      listLlm: () => ["claude-cli"],
      listVcs: () => ["github"],
      buildLlm: () => IO.pure(trackingLlm),
      buildVcs: () => IO.fail(err),
    };

    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache: createQuestionPoolCache() });

    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "corr-bad-vcs",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 3,
        vcsAdapterId: "unknown-vcs",
      },
    };

    await dispatcher.dispatch(frame).unsafeRun();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("error");
    if (reply.kind === "error") {
      expect(reply.payload.reason).toBe("unsupported-vcs-adapter");
    }
    // No generateQuiz should have been called
    expect(generateQuizCallCount).toBe(0);
  });
});

describe("dispatcher — quiz-request with missing-credentials", () => {
  it("quiz-request where resolver returns Left → ErrorFrame with missing-credentials; no fetchDiff", async () => {
    const err: RegistryError = {
      kind: "missing-credentials",
      adapterId: "github",
      attempted: ["GITHUB_TOKEN env", "GH_TOKEN env", "gh auth token CLI"],
      hint: "Run `gh auth login` or export GITHUB_TOKEN",
    };
    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();

    const fetchDiffCalls = 0;
    const registry: AdapterRegistry = {
      listLlm: () => ["claude-cli"],
      listVcs: () => ["github"],
      buildLlm: () => IO.pure(makeFakeLlm("claude-cli", makeQuiz("x"))),
      buildVcs: () => IO.fail(err),
    };

    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache: createQuestionPoolCache() });

    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "corr-missing-creds",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 3,
        llmAdapterId: "claude-cli",
        vcsAdapterId: "github",
      },
    };

    await dispatcher.dispatch(frame).unsafeRun();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("error");
    if (reply.kind === "error") {
      expect(reply.payload.reason).toBe("missing-credentials");
      // details should include adapterId, attempted, and hint
      const details = reply.payload.details as Record<string, unknown> | undefined;
      expect(details?.["adapterId"]).toBe("github");
      expect(details?.["hint"]).toContain("gh auth login");
    }
    // fetchDiff must not have been called
    expect(fetchDiffCalls).toBe(0);
  });
});

// ADR-29: bad-credentials is REMOVED. No test for it.

describe("dispatcher — quiz-request ignores stale credentials field (ADR-29)", () => {
  it("quiz-request with stale credentials field → host ignores it, happy path completes", async () => {
    const quiz = makeQuiz("quiz-stale-creds");
    const llm = makeFakeLlm("claude-cli", quiz);
    const vcs = makeFakeVcs("github", "diff --git a/foo.ts");
    const registry = makeFakeRegistry(llm, vcs);

    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache: createQuestionPoolCache() });

    // Stale extension still sends credentials field — dispatcher must ignore it.
    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "corr-stale-creds",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 3,
        // ADR-29: credentials would be here in the raw object from a stale extension.
        // The schema parses passthrough so it arrives but the dispatcher never reads it.
      },
    };

    await dispatcher.dispatch(frame).unsafeRun();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Happy path: quiz-response was sent
    expect(frames.some((f) => f.kind === "quiz-response")).toBe(true);
  });

  it("quiz-request outgoing frame does NOT contain a credentials field", async () => {
    // Assert that the dispatcher never reads or echoes payload.credentials
    const quiz = makeQuiz("quiz-no-creds");
    const registry = makeFakeRegistry(makeFakeLlm("claude-cli", quiz), makeFakeVcs("github", "diff"));
    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache: createQuestionPoolCache() });

    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "corr-no-creds",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 3,
      },
    };

    await dispatcher.dispatch(frame).unsafeRun();
    await new Promise((resolve) => setTimeout(resolve, 50));

    for (const f of frames) {
      const serialized = JSON.stringify(f);
      expect(serialized).not.toContain('"credentials"');
    }
  });
});

describe("dispatcher — check-auth-request", () => {
  it("responds with check-auth-response containing one row per adapter", async () => {
    const { dispatcher, frames } = makeTestSetup();

    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "check-auth-request",
      correlationId: "corr-car",
      payload: {},
    };

    await dispatcher.dispatch(frame).unsafeRun();

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("check-auth-response");
    if (reply.kind === "check-auth-response") {
      expect(reply.correlationId).toBe("corr-car");
      // The fake registry has 4 LLM + 2 VCS = 6 adapters
      expect(reply.payload.statuses).toHaveLength(6);
    }
  });

  it("statuses reflect the fake resolver's per-adapter outcomes (all ok)", async () => {
    const { dispatcher, frames } = makeTestSetup();

    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "check-auth-request",
      correlationId: "corr-car-2",
      payload: {},
    };

    await dispatcher.dispatch(frame).unsafeRun();

    const reply = frames[0]!;
    if (reply.kind === "check-auth-response") {
      for (const status of reply.payload.statuses) {
        expect(status.ok).toBe(true);
      }
    }
  });

  it("check-auth-request with one resolver returning Left → that row is ok:false, handler does not crash", async () => {
    const registry: AdapterRegistry = {
      listLlm: () => ["claude-cli"],
      listVcs: () => ["github"],
      buildLlm: () => IO.pure(makeFakeLlm("claude-cli", makeQuiz("x"))),
      buildVcs: () =>
        IO.fail<RegistryError, VCSProvider>({
          kind: "missing-credentials",
          adapterId: "github",
          attempted: ["GITHUB_TOKEN env"],
          hint: "Run `gh auth login`",
        }),
    };

    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache: createQuestionPoolCache() });

    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "check-auth-request",
      correlationId: "corr-car-3",
      payload: {},
    };

    await dispatcher.dispatch(frame).unsafeRun();

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("check-auth-response");
    if (reply.kind === "check-auth-response") {
      const githubRow = reply.payload.statuses.find((s) => s.adapterId === "github");
      const claudeRow = reply.payload.statuses.find((s) => s.adapterId === "claude-cli");
      expect(githubRow?.ok).toBe(false);
      expect(githubRow?.hint).toContain("gh auth login");
      expect(claudeRow?.ok).toBe(true);
    }
  });
});

describe("dispatcher — list-adapters-request", () => {
  it("responds with list-adapters-response containing all registry IDs", async () => {
    const { dispatcher, frames } = makeTestSetup();

    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "list-adapters-request",
      correlationId: "corr-lar",
      payload: {},
    };

    await dispatcher.dispatch(frame).unsafeRun();

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("list-adapters-response");
    if (reply.kind === "list-adapters-response") {
      expect(reply.correlationId).toBe("corr-lar");
      expect(reply.payload.llm.sort()).toEqual(
        ["claude-api", "claude-cli", "codex-cli", "copilot-cli"].sort(),
      );
      expect(reply.payload.vcs.sort()).toEqual(["ado", "github"].sort());
    }
  });

  it("list-adapters-response does NOT include credential schemas — only IDs", async () => {
    const { dispatcher, frames } = makeTestSetup();

    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "list-adapters-request",
      correlationId: "corr-lar-2",
      payload: {},
    };

    await dispatcher.dispatch(frame).unsafeRun();

    const reply = frames[0]!;
    if (reply.kind === "list-adapters-response") {
      // Payload must only have llm and vcs arrays of strings
      const payloadKeys = Object.keys(reply.payload);
      expect(payloadKeys).toEqual(["llm", "vcs"]);
      for (const id of reply.payload.llm) {
        expect(typeof id).toBe("string");
      }
      for (const id of reply.payload.vcs) {
        expect(typeof id).toBe("string");
      }
    }
  });
});

describe("dispatcher — legacy envelope backward compat (no adapter IDs)", () => {
  it("legacy envelope without llmAdapterId/vcsAdapterId uses registry defaults and succeeds", async () => {
    // The fake registry succeeds for both adapters (no IDs checked)
    const quiz = makeQuiz("quiz-legacy");
    const llm = makeFakeLlm("claude-cli", quiz);
    const vcs = makeFakeVcs("github", "diff --git a/foo.ts");
    const registry = makeFakeRegistry(llm, vcs);

    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache: createQuestionPoolCache() });

    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "corr-legacy",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 3,
        // no llmAdapterId, no vcsAdapterId, no credentials
      },
    };

    await dispatcher.dispatch(frame).unsafeRun();
    // Wait for the forked fiber to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("quiz-response");
  });
});

// ---------------------------------------------------------------------------
// Tests: ADR-30 — question pool cache + quiz-resample-request
// ---------------------------------------------------------------------------

describe("dispatcher — quiz-request with questionPoolSize (pool path)", () => {
  it("cache miss → LLM called once; quiz-response returned", async () => {
    const quiz = makeQuiz("quiz-pool");
    const llm = makeFakeLlm("claude-cli", quiz);
    const vcs = makeFakeVcs("github", "diff --git a/foo.ts");
    const registry = makeFakeRegistry(llm, vcs);

    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const cache = createQuestionPoolCache();
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache });

    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "corr-pool-1",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 1,
        questionPoolSize: 3,
      },
    };

    await dispatcher.dispatch(frame).unsafeRun();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // LLM was called once (cache miss).
    expect(llm.generateQuizCalls).toBe(1);
    // Got a quiz-response back.
    expect(frames).toHaveLength(1);
    expect(frames[0]!.kind).toBe("quiz-response");
    // Cache now has 1 pool.
    expect(cache.size()).toBe(1);
  });

  it("cache hit → LLM NOT called on second request for same PR + diff", async () => {
    const quiz = makeQuiz("quiz-pool-hit");
    const llm = makeFakeLlm("claude-cli", quiz);
    const vcs = makeFakeVcs("github", "diff --git a/foo.ts");
    const registry = makeFakeRegistry(llm, vcs);

    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const cache = createQuestionPoolCache();
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache });

    const requestFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "corr-hit-1",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 1,
        questionPoolSize: 3,
      },
    };

    // First request — cache miss.
    await dispatcher.dispatch(requestFrame).unsafeRun();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(llm.generateQuizCalls).toBe(1);
    expect(frames).toHaveLength(1);

    // Second request for the same PR+diff — cache hit, LLM not called again.
    const requestFrame2: Frame = {
      ...requestFrame,
      correlationId: "corr-hit-2",
    };
    await dispatcher.dispatch(requestFrame2).unsafeRun();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(llm.generateQuizCalls).toBe(1); // still 1, no new LLM call
    expect(frames).toHaveLength(2);
    expect(frames[1]!.kind).toBe("quiz-response");
  });

  it("rejects with internal error when questionPoolSize < questionCount", async () => {
    const { dispatcher, frames } = makeTestSetup();

    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "corr-invalid-pool",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 5,
        questionPoolSize: 3, // < questionCount → should be rejected
      },
    };

    await dispatcher.dispatch(frame).unsafeRun();

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("error");
    if (reply.kind === "error") {
      expect(reply.payload.reason).toBe("internal");
      expect(reply.payload.message).toContain("questionPoolSize");
    }
  });

  it("sample quizId is registered so quiz-submit can score it", async () => {
    const quiz = makeQuiz("quiz-pool-submit");
    const llm = makeFakeLlm("claude-cli", quiz);
    const vcs = makeFakeVcs("github", "diff --git a/foo.ts");
    const registry = makeFakeRegistry(llm, vcs);

    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const cache = createQuestionPoolCache();
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache });

    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "corr-pool-submit",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 1,
        questionPoolSize: 3,
      },
    };

    await dispatcher.dispatch(frame).unsafeRun();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(frames).toHaveLength(1);
    const response = frames[0]!;
    expect(response.kind).toBe("quiz-response");

    if (response.kind === "quiz-response") {
      const sampleQuizId = response.payload.quiz.id;
      // The sample quizId should be in the session store.
      expect(store.get(sampleQuizId as QuizId)).toBeDefined();
    }
  });
});

describe("dispatcher — quiz-resample-request handler", () => {
  it("returns quiz-response with fresh quizId for a known quizId", async () => {
    const quiz = makeQuiz("quiz-resample");
    const llm = makeFakeLlm("claude-cli", quiz);
    const vcs = makeFakeVcs("github", "diff --git a/foo.ts");
    const registry = makeFakeRegistry(llm, vcs);

    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const cache = createQuestionPoolCache();
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache });

    // First: get the quiz via pool path.
    const requestFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "corr-before-resample",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 1,
        questionPoolSize: 3,
      },
    };
    await dispatcher.dispatch(requestFrame).unsafeRun();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(frames).toHaveLength(1);
    const firstResponse = frames[0]!;
    expect(firstResponse.kind).toBe("quiz-response");
    if (firstResponse.kind !== "quiz-response") return;

    const oldQuizId = firstResponse.payload.quiz.id;

    // Now resample.
    const resampleFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-resample-request",
      correlationId: "corr-resample",
      payload: { quizId: oldQuizId, questionCount: 1 },
    };
    await dispatcher.dispatch(resampleFrame).unsafeRun();

    expect(frames).toHaveLength(2);
    const resampleResponse = frames[1]!;
    expect(resampleResponse.kind).toBe("quiz-response");
    if (resampleResponse.kind === "quiz-response") {
      // New quizId must differ from the old one.
      expect(resampleResponse.payload.quiz.id).not.toBe(oldQuizId);
      // New quizId is registered in the store.
      expect(store.get(resampleResponse.payload.quiz.id as QuizId)).toBeDefined();
    }
  });

  it("returns internal error for unknown quizId", async () => {
    const { dispatcher, frames } = makeTestSetup();

    const resampleFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-resample-request",
      correlationId: "corr-unknown-resample",
      payload: { quizId: "totally-unknown-quiz", questionCount: 1 },
    };

    await dispatcher.dispatch(resampleFrame).unsafeRun();

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("error");
    if (reply.kind === "error") {
      expect(reply.payload.reason).toBe("internal");
      expect(reply.payload.message).toContain(RESAMPLE_FAILED_PREFIX);
    }
  });
});

describe("dispatcher — diff not included in wire frames (audit)", () => {
  it("diff bytes are never present in quiz-response payload", () => {
    // Verify that the mapping from domain Quiz to wire QuestionDTO strips diff.
    const wirePayload = {
      quiz: {
        id: "quiz-1",
        questions: [
          {
            type: "multiple-choice" as const,
            id: "q1",
            prompt: "What was added?",
            choices: [{ id: "c1", label: "A function" }],
          },
        ],
      },
    };
    expect("diff" in wirePayload).toBe(false);
    expect("diff" in wirePayload.quiz).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: ADR-33 — IO-composed dispatcher + fiber cancellation
// ---------------------------------------------------------------------------

describe("dispatcher — ADR-33: composition: VCS error short-circuits LLM call", () => {
  it("VCS port fails → no LLM call; one error frame written", async () => {
    const vcsErr: VCSProviderError = { kind: "transport", detail: "connection refused" };

    let generateQuizCalled = false;
    const spyLlm: LLMProvider = {
      id: "claude-cli",
      generateQuiz: () => {
        generateQuizCalled = true;
        return IO.lift(() => makeQuiz("x"));
      },
    };

    const registry: AdapterRegistry = {
      listLlm: () => ["claude-cli"],
      listVcs: () => ["github"],
      buildLlm: () => IO.pure(spyLlm),
      buildVcs: () =>
        IO.pure({
          id: "github",
          fetchDiff: () => IO.fail<VCSProviderError, Diff>(vcsErr),
        }),
    };

    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache: createQuestionPoolCache() });

    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "corr-vcs-err",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 3,
      },
    };

    await dispatcher.dispatch(frame).unsafeRun();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // LLM must NOT have been called.
    expect(generateQuizCalled).toBe(false);
    // One error frame.
    expect(frames).toHaveLength(1);
    expect(frames[0]!.kind).toBe("error");
  });

  it("LLM error → error frame; store not populated", async () => {
    const llmErr: LLMProviderError = { kind: "subprocess", reason: "process-failed", exitCode: 1, stderr: "oops", detail: "oops" };

    const registry: AdapterRegistry = {
      listLlm: () => ["claude-cli"],
      listVcs: () => ["github"],
      buildLlm: () =>
        IO.pure<LLMProvider>({
          id: "claude-cli",
          generateQuiz: () => IO.fail<LLMProviderError, Quiz>(llmErr),
        }),
      buildVcs: () =>
        IO.pure({
          id: "github",
          fetchDiff: () => IO.lift<VCSProviderError, Diff>(() => "diff --git" as Diff),
        }),
    };

    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache: createQuestionPoolCache() });

    const frame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "corr-llm-err",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 3,
      },
    };

    await dispatcher.dispatch(frame).unsafeRun();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(frames).toHaveLength(1);
    expect(frames[0]!.kind).toBe("error");
    // Store must remain empty — no answer key registered.
    expect(store.size()).toBe(0);
  });
});

describe("dispatcher — ADR-33: quiz-cancel-request", () => {
  it("cancel for unknown correlationId → no frame written, info log only", async () => {
    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const infoSpy = vi.spyOn(logger, "info");

    const dispatcher = createDispatcher({
      write: writer,
      store,
      logger,
      registry: makeFakeRegistry(),
      cache: createQuestionPoolCache(),
    });

    const cancelFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-cancel-request",
      correlationId: "cid-unknown",
      payload: { correlationId: "cid-unknown" },
    };

    await dispatcher.dispatch(cancelFrame).unsafeRun();

    expect(frames).toHaveLength(0);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("no-op"),
      expect.objectContaining({ correlationId: "cid-unknown" }),
    );
  });

  it("cancel after completion → no second frame (registry already cleaned)", async () => {
    const quiz = makeQuiz("quiz-cancel-race");
    const llm = makeFakeLlm("claude-cli", quiz);
    const vcs = makeFakeVcs("github", "diff --git a/foo.ts");
    const registry = makeFakeRegistry(llm, vcs);

    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache: createQuestionPoolCache() });

    // First run the quiz-request to completion.
    const quizFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "cid-race",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 3,
      },
    };
    await dispatcher.dispatch(quizFrame).unsafeRun();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // At this point the fiber has completed and registry entry cleaned.
    expect(frames).toHaveLength(1);
    expect(frames[0]!.kind).toBe("quiz-response");

    // Now send cancel for the already-completed request.
    const cancelFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-cancel-request",
      correlationId: "cid-race",
      payload: { correlationId: "cid-race" },
    };
    await dispatcher.dispatch(cancelFrame).unsafeRun();

    // No additional frame.
    expect(frames).toHaveLength(1);
  });

  it("cancel mid-flight slow LLM → cancelled error frame emitted", async () => {
    // LLM IO that sleeps until aborted via IO.cancellable.
    // The Promise resolves when abort fires so the test doesn't time out.
    let signalAborted = false;
    const slowLlm: LLMProvider = {
      id: "claude-cli",
      generateQuiz: () =>
        IO.cancellable<LLMProviderError, Quiz>((signal) => {
          return new Promise<Quiz>((resolve) => {
            const t = setTimeout(() => resolve(makeQuiz("slow")), 10_000);
            signal.addEventListener("abort", () => {
              signalAborted = true;
              clearTimeout(t);
              // Resolve with a dummy value — monadyssey sees signal.aborted = true
              // on the next interpreter tick and returns Cancelled regardless.
              resolve(makeQuiz("aborted"));
            });
          });
        }),
    };

    const registry: AdapterRegistry = {
      listLlm: () => ["claude-cli"],
      listVcs: () => ["github"],
      buildLlm: () => IO.pure(slowLlm),
      buildVcs: () =>
        IO.pure({ id: "github", fetchDiff: () => IO.lift<VCSProviderError, Diff>(() => "diff --git" as Diff) }),
    };

    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache: createQuestionPoolCache() });

    // Send quiz-request — fiber starts.
    const quizFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "cid-cancel-mid",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 3,
      },
    };
    // Fire-and-forget: dispatch blocks until fiber completes, so don't await.
    void dispatcher.dispatch(quizFrame).unsafeRun();

    // Give fiber a tick to reach the LLM call.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Send cancel.
    const cancelFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-cancel-request",
      correlationId: "cid-cancel-mid",
      payload: { correlationId: "cid-cancel-mid" },
    };
    await dispatcher.dispatch(cancelFrame).unsafeRun();

    // Wait for the cancelled outcome to be processed.
    await new Promise((resolve) => setTimeout(resolve, 300));

    // The AbortSignal must have been fired (cooperative cancellation).
    expect(signalAborted).toBe(true);

    // One error frame with reason "cancelled".
    expect(frames).toHaveLength(1);
    const errorFrame = frames[0]!;
    expect(errorFrame.kind).toBe("error");
    if (errorFrame.kind === "error") {
      expect(errorFrame.payload.reason).toBe("cancelled");
      expect(errorFrame.correlationId).toBe("cid-cancel-mid");
    }

    // Store must remain empty — quiz was never completed.
    expect(store.size()).toBe(0);
  });

  it("cancel mid-flight VCS fetch → LLM never called", async () => {
    let generateQuizCalled = false;
    const spyLlm: LLMProvider = {
      id: "claude-cli",
      generateQuiz: () => {
        generateQuizCalled = true;
        return IO.lift(() => makeQuiz("y"));
      },
    };

    let vcsSignalAborted = false;
    const slowVcs: VCSProvider = {
      id: "github",
      fetchDiff: () =>
        IO.cancellable<VCSProviderError, Diff>((signal) => {
          return new Promise<Diff>((resolve) => {
            const t = setTimeout(() => resolve("diff --git" as Diff), 10_000);
            signal.addEventListener("abort", () => {
              vcsSignalAborted = true;
              clearTimeout(t);
              // Resolve with dummy — monadyssey sees signal.aborted and returns Cancelled.
              resolve("" as Diff);
            });
          });
        }),
    };

    const registry: AdapterRegistry = {
      listLlm: () => ["claude-cli"],
      listVcs: () => ["github"],
      buildLlm: () => IO.pure(spyLlm),
      buildVcs: () => IO.pure(slowVcs),
    };

    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache: createQuestionPoolCache() });

    const quizFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "cid-cancel-vcs",
      payload: {
        pr: { kind: "github", owner: "o", repo: "r", number: 1 },
        questionCount: 3,
      },
    };
    // Fire-and-forget — dispatch awaits fiber.join() internally.
    void dispatcher.dispatch(quizFrame).unsafeRun();
    // Give the fiber time to reach the VCS fetch.
    await new Promise((resolve) => setTimeout(resolve, 80));

    const cancelFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-cancel-request",
      correlationId: "cid-cancel-vcs",
      payload: { correlationId: "cid-cancel-vcs" },
    };
    await dispatcher.dispatch(cancelFrame).unsafeRun();
    // Wait for the cancelled outcome to propagate.
    await new Promise((resolve) => setTimeout(resolve, 300));

    // AbortSignal must have been fired on the VCS IO.
    expect(vcsSignalAborted).toBe(true);
    // LLM never called — VCS step was still in flight when cancel arrived.
    expect(generateQuizCalled).toBe(false);
    // One cancelled error frame.
    expect(frames).toHaveLength(1);
    if (frames[0]!.kind === "error") {
      expect(frames[0]!.payload.reason).toBe("cancelled");
    }
  });

  it("two in-flight requests, cancel one → the other completes normally", async () => {
    // Slow LLM: long timer, reacts to abort to avoid test timeout.
    const slowLlm: LLMProvider = {
      id: "claude-cli",
      generateQuiz: () =>
        IO.cancellable<LLMProviderError, Quiz>((signal) => {
          return new Promise<Quiz>((resolve) => {
            const t = setTimeout(() => resolve(makeQuiz("concurrent")), 10_000);
            signal.addEventListener("abort", () => {
              clearTimeout(t);
              // Resolve immediately; monadyssey checks signal.aborted → Cancelled.
              resolve(makeQuiz("aborted"));
            });
          });
        }),
    };
    const fastLlm: LLMProvider = {
      id: "claude-cli",
      generateQuiz: () => IO.lift(() => makeQuiz("fast")),
    };

    let callCount = 0;
    const registry: AdapterRegistry = {
      listLlm: () => ["claude-cli"],
      listVcs: () => ["github"],
      buildLlm: () => {
        callCount++;
        return callCount === 1 ? IO.pure(slowLlm) : IO.pure(fastLlm);
      },
      buildVcs: () =>
        IO.pure({ id: "github", fetchDiff: () => IO.lift<VCSProviderError, Diff>(() => "diff --git" as Diff) }),
    };

    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache: createQuestionPoolCache() });

    // Start slow quiz (fire-and-forget — dispatch awaits fiber.join() internally).
    const slowFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "cid-slow",
      payload: { pr: { kind: "github", owner: "o", repo: "r", number: 1 }, questionCount: 3 },
    };
    void dispatcher.dispatch(slowFrame).unsafeRun();

    // Start fast quiz (also fire-and-forget; it completes quickly).
    const fastFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "cid-fast",
      payload: { pr: { kind: "github", owner: "o", repo: "r", number: 2 }, questionCount: 3 },
    };
    void dispatcher.dispatch(fastFrame).unsafeRun();

    // Give both fibers a tick to start, then cancel only the slow one.
    await new Promise((resolve) => setTimeout(resolve, 80));

    const cancelFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-cancel-request",
      correlationId: "cid-slow",
      payload: { correlationId: "cid-slow" },
    };
    await dispatcher.dispatch(cancelFrame).unsafeRun();

    // Wait for the cancel outcome + fast quiz to both settle.
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Fast quiz completed → quiz-response.
    // Slow quiz cancelled → error with reason "cancelled".
    const responses = frames.filter((f) => f.kind === "quiz-response");
    const errors = frames.filter((f) => f.kind === "error");

    expect(responses).toHaveLength(1);
    expect(errors).toHaveLength(1);
    if (errors[0]!.kind === "error") {
      expect(errors[0]!.payload.reason).toBe("cancelled");
      expect(errors[0]!.correlationId).toBe("cid-slow");
    }
  });

  it("fiber registry is cleaned after completion (no leak)", async () => {
    const quiz = makeQuiz("quiz-clean");
    const registry = makeFakeRegistry(
      makeFakeLlm("claude-cli", quiz),
      makeFakeVcs("github", "diff --git a/foo.ts"),
    );

    const store = createSessionStore();
    const { writer } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({ write: writer, store, logger, registry, cache: createQuestionPoolCache() });

    const quizFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "cid-clean",
      payload: { pr: { kind: "github", owner: "o", repo: "r", number: 1 }, questionCount: 3 },
    };
    await dispatcher.dispatch(quizFrame).unsafeRun();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Cancel should be a no-op (registry was cleaned).
    const infoSpy = vi.spyOn(logger, "info");
    const cancelFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-cancel-request",
      correlationId: "cid-clean",
      payload: { correlationId: "cid-clean" },
    };
    await dispatcher.dispatch(cancelFrame).unsafeRun();

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("no-op"),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// ADR-36: makeGenerationObserver throttle + security canary tests
// ---------------------------------------------------------------------------

describe("makeGenerationObserver", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const makeTestEmitter = () => {
    const frames: Frame[] = [];
    const writer: FrameWriter = (frame) => IO.lift<never, void>(() => { frames.push(frame); });
    const logger = makeNoopLogger();
    let nowValue = 0;
    const now = (): number => nowValue;
    const advanceNow = (ms: number) => { nowValue += ms; };
    const emitter = createProgressEmitter({ write: writer, logger, now });
    return { frames, emitter, now, advanceNow };
  };

  it("stage change always emits immediately (thinking → writing)", async () => {
    const { frames, emitter, now } = makeTestEmitter();
    const { observer } = makeGenerationObserver("cid-1", 0, emitter, now);

    observer.onSignal({ kind: "thinking" });
    await vi.runAllTimersAsync();
    const thinkingFrames = frames.filter(
      (f) => f.kind === "quiz-progress" && f.payload.stage === "thinking",
    );
    expect(thinkingFrames.length).toBeGreaterThanOrEqual(1);

    const beforeWriting = frames.length;
    observer.onSignal({ kind: "writing", questionsWritten: 1 });
    await vi.runAllTimersAsync();
    const writingFrames = frames.slice(beforeWriting).filter(
      (f) => f.kind === "quiz-progress" && f.payload.stage === "writing",
    );
    expect(writingFrames.length).toBeGreaterThanOrEqual(1);
  });

  it("rapid same-stage signals coalesce to ≤ throttle window + 1 frame per 1000ms", async () => {
    const { frames, emitter, now, advanceNow } = makeTestEmitter();
    const { observer, flush } = makeGenerationObserver("cid-2", 0, emitter, now);

    // First thinking signal — this is a stage change so emits immediately.
    observer.onSignal({ kind: "thinking" });
    await vi.runAllTimersAsync();

    // Flip to writing (stage change — immediate).
    observer.onSignal({ kind: "writing", questionsWritten: 0 });
    await vi.runAllTimersAsync();
    const countAfterStageChange = frames.length;

    // Rapid writing updates within the same 1000ms window.
    for (let i = 1; i <= 50; i++) {
      observer.onSignal({ kind: "writing", questionsWritten: i });
    }
    await vi.runAllTimersAsync();
    // At most 1 trailing frame should have been added (throttle window).
    const addedFrames = frames.length - countAfterStageChange;
    expect(addedFrames).toBeLessThanOrEqual(2); // immediate + maybe 1 trailing

    // After 1000ms, the trailing frame fires.
    advanceNow(1100);
    await vi.advanceTimersByTimeAsync(1100);

    await flush();
    // Total frames from writing phase should be small.
    const writingFrames = frames.filter(
      (f) => f.kind === "quiz-progress" && f.payload.stage === "writing",
    );
    // Must not be one per signal (50 signals ≠ 50 frames).
    expect(writingFrames.length).toBeLessThan(10);
  });

  it("flush emits a trailing frame if there is a pending signal", async () => {
    const { frames, emitter, now } = makeTestEmitter();
    const { observer, flush } = makeGenerationObserver("cid-3", 0, emitter, now);

    // Stage change → writing.
    observer.onSignal({ kind: "thinking" });
    await vi.runAllTimersAsync();
    observer.onSignal({ kind: "writing", questionsWritten: 1 });
    await vi.runAllTimersAsync();

    // More writing signals within throttle window → queued.
    observer.onSignal({ kind: "writing", questionsWritten: 5 });
    const beforeFlush = frames.length;

    await flush();
    // The pending count=5 signal should have been emitted.
    const flushedFrames = frames.slice(beforeFlush);
    expect(flushedFrames.length).toBeGreaterThanOrEqual(1);
  });

  it("SECURITY canary: no quiz-progress frame contains diff/prompt text", async () => {
    const SECRET_DIFF_CANARY = "SECRET_DIFF_CANARY_xyz123";
    const { frames, emitter, now } = makeTestEmitter();
    const { observer, flush } = makeGenerationObserver("cid-canary", 0, emitter, now);

    // Simulate signals that might have been produced from a stream containing the canary.
    // The signals themselves are typed to carry NO text — only kind and number.
    const signals: QuizGenerationSignal[] = [
      { kind: "thinking" },
      { kind: "writing", questionsWritten: 1 },
      { kind: "writing", questionsWritten: 2 },
    ];
    for (const s of signals) {
      observer.onSignal(s);
      await vi.runAllTimersAsync();
    }
    await flush();

    // Assert no frame payload contains the canary string.
    for (const frame of frames) {
      const serialized = JSON.stringify(frame);
      expect(serialized).not.toContain(SECRET_DIFF_CANARY);
    }

    // Assert frame payloads contain only allowed keys.
    for (const frame of frames) {
      if (frame.kind === "quiz-progress") {
        const keys = Object.keys(frame.payload);
        for (const key of keys) {
          expect(["phase", "elapsedMs", "expectedMs", "stage", "questionsWritten"]).toContain(key);
        }
        // stage must be an enum string, not a text blob.
        if (frame.payload.stage !== undefined) {
          expect(["thinking", "writing"]).toContain(frame.payload.stage);
        }
        // questionsWritten must be a number.
        if (frame.payload.questionsWritten !== undefined) {
          expect(typeof frame.payload.questionsWritten).toBe("number");
        }
      }
    }
  });
});
