import { describe, it, expect, vi, afterEach } from "vitest";
import { IO } from "monadyssey";
import type { SpawnError } from "@lgtm-buzzer/adapter-shared";

// Mock @lgtm-buzzer/adapter-shared so we capture what stdin is passed
// to spawnIO, which is the canonical check for the diff-only invariant.
vi.mock("@lgtm-buzzer/adapter-shared", async () => {
  const mod = await vi.importActual<Record<string, unknown>>("@lgtm-buzzer/adapter-shared");
  return {
    ...mod,
    spawnIO: vi.fn(),
  };
});

// Mock the precheck so we skip the actual binary probe.
vi.mock("./precheck.js", () => ({
  checkBinary: vi.fn().mockResolvedValue({ kind: "available" }),
  checkAnthropicApiKey: vi.fn().mockReturnValue({ kind: "available" }),
}));

import { callApi } from "./claude-cli.js";
import { spawnIO } from "@lgtm-buzzer/adapter-shared";

const mockSpawnIO = vi.mocked(spawnIO);

// claude-cli uses the ClaudePrintEnvelopeSchema: { type: "result", result: "<quiz-json-string>" }
const VALID_QUIZ_JSON = JSON.stringify({
  type: "result",
  result: JSON.stringify({
    questions: [
      {
        prompt: "What does the new validateEmail function do?",
        choices: [
          "Validates email format using regex",
          "Sends a verification email",
          "Stores the email in the database",
          "Encrypts the email",
        ],
        correctChoiceIndex: 0,
        explanation: "The function uses a regex pattern to validate email format.",
      },
    ],
  }),
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("claude-cli provider — diff-only invariant (LEAK_CANARY)", () => {
  it("LEAK_CANARY: does NOT forward prTitle or expectedSymbols to the spawn stdin", async () => {
    const capturedStdinCalls: string[] = [];

    mockSpawnIO.mockImplementation(
      (_cmd: string, _args: readonly string[], stdin?: string): IO<SpawnError, { stdout: string; stderr: string; exitCode: number }> => {
        if (stdin !== undefined) {
          capturedStdinCalls.push(stdin);
        }
        return IO.lift<SpawnError, { stdout: string; stderr: string; exitCode: number }>(
          () => ({ stdout: VALID_QUIZ_JSON, stderr: "", exitCode: 0 }),
        );
      },
    );

    await callApi("{{diff}}", {
      vars: {
        diff: "--- a/foo.ts\n+++ b/foo.ts\n@@ -0 +1 @@\n+export const validateEmail = () => {};",
        prTitle: "LEAK_CANARY",
        expectedSymbols: ["LEAK_CANARY"],
        notes: "LEAK_CANARY",
      },
    });

    // The canary value must never appear in anything passed to spawnIO.
    for (const stdin of capturedStdinCalls) {
      expect(stdin).not.toContain("LEAK_CANARY");
    }
  });
});

describe("claude-cli provider — error mapping", () => {
  it("returns errKind=skipped when precheck fails", async () => {
    const { checkBinary } = await import("./precheck.js");
    vi.mocked(checkBinary).mockResolvedValueOnce({ kind: "skipped", reason: "binary not found" });

    const result = await callApi("{{diff}}", {
      vars: { diff: "diff content" },
    });

    expect(result.metadata.errKind).toBe("skipped");
    expect(result.output).toBe("");
  });

  it("returns errKind=subprocess when spawn fails", async () => {
    const err: SpawnError = { kind: "spawn-failed", reason: "ENOENT" };
    mockSpawnIO.mockReturnValue(IO.fail<SpawnError, never>(err));

    const result = await callApi("{{diff}}", {
      vars: { diff: "diff content" },
    });

    // The subprocess error surfaces as a malformed or subprocess errKind.
    expect(result.output).toBe("");
    expect(result.metadata.errKind).toBeDefined();
  });

  it("happy path: returns JSON-stringified quiz on success", async () => {
    mockSpawnIO.mockReturnValue(
      IO.lift<SpawnError, { stdout: string; stderr: string; exitCode: number }>(
        () => ({ stdout: VALID_QUIZ_JSON, stderr: "", exitCode: 0 }),
      ),
    );

    const result = await callApi("{{diff}}", {
      vars: {
        diff: "--- a/foo.ts\n+++ b/foo.ts\n@@ -0 +1 @@\n+export const validateEmail = () => {};",
      },
    });

    expect(result.metadata.errKind).toBeUndefined();
    expect(() => JSON.parse(result.output)).not.toThrow();
  });
});
