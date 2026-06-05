import { describe, expect, it } from "vitest";
import { IO } from "monadyssey";
import type { Diff, QuizGenerationSignal, GenerateQuizObserver } from "@lgtm-buzzer/core";
import type { SpawnError, SpawnOutput, SpawnOptions, spawnIO as SpawnIOType } from "@lgtm-buzzer/adapter-shared";
import type { IdGenerator } from "./ids.js";
import type { ChoiceId, QuestionId, QuizId } from "@lgtm-buzzer/core";
import { createClaudeCliProvider, ADAPTER_ID } from "./provider.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type SpawnCall = {
  readonly command: string;
  readonly args: readonly string[];
  readonly stdin: string | undefined;
  readonly options: SpawnOptions | undefined;
};

/** Builds a fake spawnIO that records calls and returns a fixed IO result. */
const makeFakeSpawn = (
  result: IO<SpawnError, SpawnOutput>,
): { spawnIO: typeof SpawnIOType; calls: SpawnCall[] } => {
  const calls: SpawnCall[] = [];
  const spawnIO = (
    command: string,
    args: readonly string[],
    stdin?: string,
    options?: SpawnOptions,
  ): IO<SpawnError, SpawnOutput> => {
    calls.push({ command, args, stdin, options });
    return result;
  };
  return { spawnIO, calls };
};

/**
 * Build a valid `--output-format stream-json` stdout blob (ADR-36).
 * Mimics the NDJSON event stream emitted by claude CLI ≥2.1.165.
 */
const makeValidStdout = (questionCount = 1): string => {
  const questions = Array.from({ length: questionCount }, (_, i) => ({
    prompt: `Question ${i + 1}?`,
    choices: ["Option A", "Option B"],
    correctChoiceIndex: 0,
  }));
  const systemLine = JSON.stringify({ type: "system", subtype: "init" });
  const assistantLine = JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "text", text: "Generating quiz..." }] },
  });
  const resultLine = JSON.stringify({
    type: "result",
    subtype: "success",
    result: JSON.stringify({ questions }),
  });
  return [systemLine, assistantLine, resultLine].join("\n");
};

const successOutput = (stdout: string): IO<SpawnError, SpawnOutput> =>
  IO.lift<SpawnError, SpawnOutput>(() => ({ stdout, stderr: "", exitCode: 0 }));

const spawnFailedIO = (reason: string): IO<SpawnError, SpawnOutput> =>
  IO.fail<SpawnError, SpawnOutput>({ kind: "spawn-failed", reason });

const processFailedIO = (exitCode: number, stderr: string): IO<SpawnError, SpawnOutput> =>
  IO.fail<SpawnError, SpawnOutput>({ kind: "process-failed", exitCode, stderr });

/** Deterministic counter-based IdGenerator. */
const makeCounterIds = (): IdGenerator => {
  let q = 0;
  let c = 0;
  let qz = 0;
  return {
    quizId: () => `quiz-${++qz}` as QuizId,
    questionId: () => `question-${++q}` as QuestionId,
    choiceId: () => `choice-${++c}` as ChoiceId,
  };
};

const asDiff = (s: string): Diff => s as Diff;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createClaudeCliProvider", () => {
  it("case #11 — provider.id equals ADAPTER_ID ('claude-cli')", () => {
    const { spawnIO } = makeFakeSpawn(successOutput(makeValidStdout()));
    const provider = createClaudeCliProvider({ spawnIO, ids: makeCounterIds() });
    expect(provider.id).toBe("claude-cli");
    expect(provider.id).toBe(ADAPTER_ID);
  });

  it("case #1 — happy path: generates a quiz from a valid response", async () => {
    const { spawnIO } = makeFakeSpawn(successOutput(makeValidStdout()));
    const provider = createClaudeCliProvider({ spawnIO, ids: makeCounterIds() });
    const result = await provider
      .generateQuiz({ diff: asDiff("some diff"), questionCount: 1 })
      .unsafeRun();
    expect(result).toEqual(expect.objectContaining({ type: "Ok" }));
  });

  it("case #2 — BINDING: diff bytes in stdin only, never in argv", async () => {
    const diffContent = "--- a/secret.ts\n+++ b/secret.ts\n@@ -1 +1 @@\n-old\n+new";
    const { spawnIO, calls } = makeFakeSpawn(successOutput(makeValidStdout()));
    const provider = createClaudeCliProvider({ spawnIO, ids: makeCounterIds() });
    await provider
      .generateQuiz({ diff: asDiff(diffContent), questionCount: 1 })
      .unsafeRun();

    expect(calls).toHaveLength(1);
    const call = calls[0]!;

    // Assertion A: stdin contains the diff bytes
    expect(call.stdin).toContain(diffContent);

    // Assertion B: argv joined does NOT contain the diff bytes
    expect(call.args.join(" ")).not.toContain(diffContent);

    // Assertion C: no individual arg contains <DIFF>
    for (const arg of call.args) {
      expect(arg).not.toContain("<DIFF>");
    }
  });

  it("case #3 — no positional prompt: fixed argv has exactly 9 elements (ADR-36: stream-json)", async () => {
    const { spawnIO, calls } = makeFakeSpawn(successOutput(makeValidStdout()));
    const provider = createClaudeCliProvider({ spawnIO, ids: makeCounterIds() });
    await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    expect(calls[0]?.args).toHaveLength(9);
  });

  it("case #1 (argv) — fixed argv matches expected flags exactly (ADR-36: stream-json)", async () => {
    const { spawnIO, calls } = makeFakeSpawn(successOutput(makeValidStdout()));
    const provider = createClaudeCliProvider({ spawnIO, ids: makeCounterIds() });
    await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    expect(calls[0]?.args).toEqual([
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--model",
      "sonnet",
      "--permission-mode",
      "default",
      "--no-cache-prompts",
    ]);
  });

  it("case #4 — spawn-failed error is mapped to subprocess { reason: 'spawn-failed' }", async () => {
    const { spawnIO } = makeFakeSpawn(spawnFailedIO("ENOENT: claude not found"));
    const provider = createClaudeCliProvider({ spawnIO, ids: makeCounterIds() });
    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({
          kind: "subprocess",
          reason: "spawn-failed",
          detail: "ENOENT: claude not found",
        }),
      }),
    );
  });

  it("case #5 — process-failed error carries exitCode and stderr", async () => {
    const { spawnIO } = makeFakeSpawn(processFailedIO(1, "fatal: auth failed"));
    const provider = createClaudeCliProvider({ spawnIO, ids: makeCounterIds() });
    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({
          kind: "subprocess",
          reason: "process-failed",
          exitCode: 1,
          stderr: "fatal: auth failed",
          detail: "exit 1",
        }),
      }),
    );
  });

  it("case #6 — no result line in stdout → malformed-response error (ADR-36: stream-json)", async () => {
    // With stream-json, stdout must contain a {type:"result"} line; plain text doesn't have one.
    const { spawnIO } = makeFakeSpawn(successOutput("not json"));
    const provider = createClaudeCliProvider({ spawnIO, ids: makeCounterIds() });
    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({
          kind: "malformed-response",
          detail: "no-result-event",
        }),
      }),
    );
  });

  it("case #7 — model output invalid JSON → malformed-response error", async () => {
    const badEnvelope = JSON.stringify({
      type: "result",
      subtype: "success",
      result: "not a json quiz",
    });
    const { spawnIO } = makeFakeSpawn(successOutput(badEnvelope));
    const provider = createClaudeCliProvider({ spawnIO, ids: makeCounterIds() });
    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({
          kind: "malformed-response",
          detail: "model-output-not-json",
        }),
      }),
    );
  });

  it("case #8 — timeout: io.timeout fires after deadline → timeout error", async () => {
    // Use a very short timeout (1 ms) and a spawn that never resolves
    const neverResolves = IO.lift<SpawnError, SpawnOutput>(
      () => new Promise(() => {}), // hangs forever
    );
    const { spawnIO } = makeFakeSpawn(neverResolves);
    const provider = createClaudeCliProvider({
      spawnIO,
      ids: makeCounterIds(),
      config: { timeoutMs: 1 },
    });
    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({
          kind: "timeout",
          afterMs: 1,
        }),
      }),
    );
  });

  it("case #9 — cancellation propagates as Cancelled (not Err)", async () => {
    // This test verifies that SpawnError.cancelled does NOT get manufactured into
    // Err<LLMProviderError.cancelled>. We fork the generateQuiz IO, cancel the
    // fiber immediately, and assert the outcome is `Cancelled` not `Err`.
    //
    // We use IO.cancellable for the fake spawnIO so the AbortSignal is respected
    // when fiber.cancel() fires — IO.lift() does not cooperate with cancellation.
    const cancellableNeverIO: IO<SpawnError, SpawnOutput> = IO.cancellable<
      SpawnError,
      SpawnOutput
    >(
      (signal) =>
        new Promise<SpawnOutput>((resolve) => {
          // Resolve with an abort handler that never returns, but cleans up on abort
          signal.addEventListener("abort", () => resolve({ stdout: "", stderr: "", exitCode: 0 }), {
            once: true,
          });
          // Never resolves on its own
        }),
    );
    const { spawnIO } = makeFakeSpawn(cancellableNeverIO);
    const provider = createClaudeCliProvider({
      spawnIO,
      ids: makeCounterIds(),
      config: { timeoutMs: 60_000 }, // don't let provider timeout fire first
    });
    const generateIO = provider.generateQuiz({ diff: asDiff("d"), questionCount: 1 });

    // Fork the IO to get a Fiber
    const forkResult = await generateIO.fork().unsafeRun();
    if (forkResult.type !== "Ok") throw new Error("fork IO failed unexpectedly");
    const fiber = forkResult.value;

    // Cancel and join
    await fiber.cancel();
    const joinResult = await fiber.join();

    // The fiber outcome should be Cancelled — not Err<LLMProviderError>
    expect(joinResult.type).toBe("Cancelled");
  }, 10_000);

  it("case #10 — custom binary and model are forwarded to spawnIO", async () => {
    const { spawnIO, calls } = makeFakeSpawn(successOutput(makeValidStdout()));
    const provider = createClaudeCliProvider({
      spawnIO,
      ids: makeCounterIds(),
      config: { binary: "/usr/local/bin/claude", model: "opus" },
    });
    await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    expect(calls[0]?.command).toBe("/usr/local/bin/claude");
    expect(calls[0]?.args).toContain("opus");
    expect(calls[0]?.args).not.toContain("sonnet");
  });

  // ---------------------------------------------------------------------------
  // ADR-36: observer + onLine tests
  // ---------------------------------------------------------------------------

  it("case #12 — observer receives thinking signal from stream-json stdout via onLine", async () => {
    // Build a fake spawnIO that captures the onLine callback and replays lines.
    const signals: QuizGenerationSignal[] = [];
    const observer: GenerateQuizObserver = {
      onSignal: (s) => { signals.push(s); },
    };

    let capturedOnLine: ((line: string) => void) | undefined;
    const fakeSpawnIO = (
      _command: string,
      _args: readonly string[],
      _stdin?: string,
      options?: SpawnOptions,
    ): IO<SpawnError, SpawnOutput> => {
      capturedOnLine = options?.onLine;
      // Return the full valid stdout synchronously after the onLine is captured.
      const stdout = makeValidStdout(1);
      return IO.lift<SpawnError, SpawnOutput>(() => ({ stdout, stderr: "", exitCode: 0 }));
    };

    const provider = createClaudeCliProvider({ spawnIO: fakeSpawnIO, ids: makeCounterIds() });
    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 }, observer)
      .unsafeRun();

    expect(result.type).toBe("Ok");

    // The fake spawn above resolves immediately without replaying lines, so
    // onLine was NOT called. Now manually replay what the real CLI would emit
    // to assert mapStreamLine→observer integration.
    if (capturedOnLine !== undefined) {
      capturedOnLine(JSON.stringify({ type: "system", subtype: "init" }));
      capturedOnLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "..." }] } }));
    }

    expect(signals.some((s) => s.kind === "thinking")).toBe(true);
  });

  it("case #13 — observer is not called when not provided (no regression)", async () => {
    // Ensure the provider works when no observer is passed.
    const { spawnIO } = makeFakeSpawn(successOutput(makeValidStdout()));
    const provider = createClaudeCliProvider({ spawnIO, ids: makeCounterIds() });
    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();
    expect(result.type).toBe("Ok");
  });

  it("case #14 — stream-json result produces same quiz as before (correctness invariant)", async () => {
    const { spawnIO } = makeFakeSpawn(successOutput(makeValidStdout(2)));
    const provider = createClaudeCliProvider({ spawnIO, ids: makeCounterIds() });
    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 2 })
      .unsafeRun();

    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      expect(result.value.questions.toArray()).toHaveLength(2);
    }
  });
});
