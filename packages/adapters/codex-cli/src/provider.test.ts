import { describe, expect, it } from "vitest";
import { IO } from "monadyssey";
import type { Diff } from "@lgtm-buzzer/core";
import type { SpawnError, SpawnOutput, SpawnOptions, spawnIO as SpawnIOType } from "@lgtm-buzzer/adapter-shared";
import type { IdGenerator } from "./ids.js";
import type { ChoiceId, QuestionId, QuizId } from "@lgtm-buzzer/core";
import { createCodexCliProvider, ADAPTER_ID } from "./provider.js";

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
 * A valid codex exec response — raw quiz JSON (no envelope wrapper).
 * Codex emits the model's text directly to stdout.
 */
const makeValidStdout = (questionCount = 1): string => {
  const questions = Array.from({ length: questionCount }, (_, i) => ({
    prompt: `Question ${i + 1}?`,
    choices: ["Option A", "Option B"],
    correctChoiceIndex: 0,
  }));
  return JSON.stringify({ questions });
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

describe("createCodexCliProvider", () => {
  it("case #11 — provider.id equals ADAPTER_ID ('codex-cli')", () => {
    const { spawnIO } = makeFakeSpawn(successOutput(makeValidStdout()));
    const provider = createCodexCliProvider({ spawnIO, ids: makeCounterIds() });
    expect(provider.id).toBe("codex-cli");
    expect(provider.id).toBe(ADAPTER_ID);
  });

  it("case #1 — happy path: generates a quiz from a valid response", async () => {
    const { spawnIO } = makeFakeSpawn(successOutput(makeValidStdout()));
    const provider = createCodexCliProvider({ spawnIO, ids: makeCounterIds() });
    const result = await provider
      .generateQuiz({ diff: asDiff("some diff"), questionCount: 1 })
      .unsafeRun();
    expect(result).toEqual(expect.objectContaining({ type: "Ok" }));
  });

  it("case #2 — BINDING: diff bytes in stdin only, never in argv", async () => {
    const diffContent = "--- a/secret.ts\n+++ b/secret.ts\n@@ -1 +1 @@\n-old\n+new";
    const { spawnIO, calls } = makeFakeSpawn(successOutput(makeValidStdout()));
    const provider = createCodexCliProvider({ spawnIO, ids: makeCounterIds() });
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

  it("case #3 — no positional prompt: fixed argv has exactly 7 elements", async () => {
    const { spawnIO, calls } = makeFakeSpawn(successOutput(makeValidStdout()));
    const provider = createCodexCliProvider({ spawnIO, ids: makeCounterIds() });
    await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    expect(calls[0]?.args).toHaveLength(7);
  });

  it("case #1 (argv) — fixed argv matches expected codex exec flags exactly", async () => {
    const { spawnIO, calls } = makeFakeSpawn(successOutput(makeValidStdout()));
    const provider = createCodexCliProvider({ spawnIO, ids: makeCounterIds() });
    await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    expect(calls[0]?.args).toEqual([
      "exec",
      "-",
      "--model",
      "o4-mini",
      "--ephemeral",
      "--skip-git-repo-check",
      "--full-auto",
    ]);
  });

  it("case #4 — spawn-failed error is mapped to subprocess { reason: 'spawn-failed' }", async () => {
    const { spawnIO } = makeFakeSpawn(spawnFailedIO("ENOENT: codex not found"));
    const provider = createCodexCliProvider({ spawnIO, ids: makeCounterIds() });
    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({
          kind: "subprocess",
          reason: "spawn-failed",
          detail: "ENOENT: codex not found",
        }),
      }),
    );
  });

  it("case #5 — process-failed error carries exitCode and stderr", async () => {
    const { spawnIO } = makeFakeSpawn(processFailedIO(1, "fatal: auth failed"));
    const provider = createCodexCliProvider({ spawnIO, ids: makeCounterIds() });
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

  it("case #6 — malformed stdout (not JSON) → malformed-response error", async () => {
    const { spawnIO } = makeFakeSpawn(successOutput("not json"));
    const provider = createCodexCliProvider({ spawnIO, ids: makeCounterIds() });
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

  it("case #7 — model output invalid quiz schema → malformed-response error", async () => {
    const badQuiz = JSON.stringify({ questions: [{ prompt: "Q" }] }); // missing choices + index
    const { spawnIO } = makeFakeSpawn(successOutput(badQuiz));
    const provider = createCodexCliProvider({ spawnIO, ids: makeCounterIds() });
    const result = await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({
          kind: "malformed-response",
          detail: expect.stringContaining("quiz-schema"),
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
    const provider = createCodexCliProvider({
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
    const provider = createCodexCliProvider({
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
    const provider = createCodexCliProvider({
      spawnIO,
      ids: makeCounterIds(),
      config: { binary: "/usr/local/bin/codex", model: "o3" },
    });
    await provider
      .generateQuiz({ diff: asDiff("d"), questionCount: 1 })
      .unsafeRun();

    expect(calls[0]?.command).toBe("/usr/local/bin/codex");
    expect(calls[0]?.args).toContain("o3");
    expect(calls[0]?.args).not.toContain("o4-mini");
  });
});
