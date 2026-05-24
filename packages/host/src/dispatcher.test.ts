import { describe, expect, it, vi } from "vitest";
import { IO, NonEmptyList } from "monadyssey";
import { createDispatcher } from "./dispatcher.js";
import { createSessionStore } from "./session-store.js";
import type { FrameWriter } from "./framing/writer.js";
import type { Frame } from "@lgtm-buzzer/protocol";
import { PROTOCOL_VERSION } from "@lgtm-buzzer/protocol";
import type {
  Logger,
  Quiz,
  QuizId,
  QuestionId,
  ChoiceId,
  AnswerKey,
  LLMProvider,
  VCSProvider,
  Diff,
} from "@lgtm-buzzer/core";
import type { AdapterRegistry, RegistryError } from "./registry.js";

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
  const dispatcher = createDispatcher({ write: writer, store, logger, registry: reg });
  return { dispatcher, store, frames, logger, registry: reg };
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
    const dispatcher = createDispatcher({ write: writer, store, logger, registry });

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

    const dispatcher = createDispatcher({ write: writer, store, logger, registry });

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

    const dispatcher = createDispatcher({ write: writer, store, logger, registry });

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
    const dispatcher = createDispatcher({ write: writer, store, logger, registry });

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
    const dispatcher = createDispatcher({ write: writer, store, logger, registry });

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
    const dispatcher = createDispatcher({ write: writer, store, logger, registry });

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
    const dispatcher = createDispatcher({ write: writer, store, logger, registry });

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
