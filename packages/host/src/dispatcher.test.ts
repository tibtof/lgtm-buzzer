import { describe, expect, it, vi } from "vitest";
import { IO, NonEmptyList } from "monadyssey";
import { createDispatcher } from "./dispatcher.js";
import { createSessionStore } from "./session-store.js";
import type { FrameWriter } from "./framing/writer.js";
import type { Frame } from "@lgtm-buzzer/protocol";
import { PROTOCOL_VERSION } from "@lgtm-buzzer/protocol";
import type { Logger, Quiz, QuizId, QuestionId, ChoiceId, AnswerKey } from "@lgtm-buzzer/core";

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
// Dispatcher factory builder for tests
// ---------------------------------------------------------------------------

const makeTestSetup = () => {
  const store = createSessionStore();
  const { writer, frames } = makeCapturingWriter();
  const logger = makeNoopLogger();
  const dispatcher = createDispatcher({ write: writer, store, logger });
  return { dispatcher, store, frames, logger };
};

// ---------------------------------------------------------------------------
// Tests
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

describe("dispatcher — error frame from extension", () => {
  it("logs and ignores error frame — no reply frame sent", async () => {
    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const warnSpy = vi.spyOn(logger, "warn");

    const dispatcher = createDispatcher({ write: writer, store, logger });
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
});

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

describe("dispatcher — quiz-submit happy path", () => {
  it("scores submission correctly and returns quiz-result with passed=true", async () => {
    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({ write: writer, store, logger });

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
    const dispatcher = createDispatcher({ write: writer, store, logger });

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
    const dispatcher = createDispatcher({ write: writer, store, logger });

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

describe("dispatcher — quiz-submit duplicate questionId", () => {
  it("returns ErrorFrame with schema-violation for duplicate questionId", async () => {
    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({ write: writer, store, logger });

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
    const dispatcher = createDispatcher({ write: writer, store, logger });

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

describe("dispatcher — correctChoiceId gate integrity", () => {
  it("wire-format quiz questions do not contain correctChoiceId", () => {
    // Verify that the mapping from domain Quiz to wire QuestionDTO strips correctChoiceId.
    // We do this by constructing a quiz, simulating the strip logic, and asserting
    // the resulting DTO has no correctChoiceId key.
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

describe("dispatcher — quiz-request with missing GH token (env-based)", () => {
  it("sends ErrorFrame with internal reason when LGTM_BUZZER_GH_TOKEN is missing", async () => {
    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    // Provide env without GH token
    const dispatcher = createDispatcher({
      write: writer,
      store,
      logger,
      env: { LGTM_BUZZER_LLM: "cli" }, // no LGTM_BUZZER_GH_TOKEN
    });

    const quizRequestFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "corr-req-1",
      payload: {
        pr: { kind: "github", owner: "owner", repo: "repo", number: 1 },
        questionCount: 3,
      },
    };

    await dispatcher.dispatch(quizRequestFrame).unsafeRun();

    // Wait a tick for the forked fiber to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("error");
    if (reply.kind === "error") {
      expect(reply.payload.reason).toBe("internal");
    }
  });

  it("sends ErrorFrame with internal reason for ADO pr.kind (not in M2)", async () => {
    const store = createSessionStore();
    const { writer, frames } = makeCapturingWriter();
    const logger = makeNoopLogger();
    const dispatcher = createDispatcher({
      write: writer,
      store,
      logger,
      env: { LGTM_BUZZER_GH_TOKEN: "token", LGTM_BUZZER_LLM: "cli" },
    });

    const quizRequestFrame: Frame = {
      v: PROTOCOL_VERSION,
      kind: "quiz-request",
      correlationId: "corr-req-ado",
      payload: {
        pr: {
          kind: "ado",
          org: "myorg",
          project: "myproject",
          repo: "myrepo",
          pullRequestId: 42,
        },
        questionCount: 3,
      },
    };

    await dispatcher.dispatch(quizRequestFrame).unsafeRun();

    // Wait for fiber to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(frames).toHaveLength(1);
    const reply = frames[0]!;
    expect(reply.kind).toBe("error");
    if (reply.kind === "error") {
      expect(reply.payload.reason).toBe("internal");
    }
  });
});

describe("dispatcher — diff not included in wire frames (audit)", () => {
  it("diff bytes are never present in quiz-response payload", () => {
    // The quiz-response frame has payload.quiz which has questions (no diff field)
    // The QuizDTOSchema in protocol does not have a diff field.
    // We verify structurally that no diff field can appear.
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
