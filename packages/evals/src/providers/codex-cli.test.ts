import { describe, it, expect, vi, afterEach } from "vitest";
import { IO } from "monadyssey";
import type { SpawnError } from "@lgtm-buzzer/adapter-shared";

vi.mock("@lgtm-buzzer/adapter-shared", async () => {
  const mod = await vi.importActual<Record<string, unknown>>("@lgtm-buzzer/adapter-shared");
  return {
    ...mod,
    spawnIO: vi.fn(),
  };
});

vi.mock("./precheck.js", () => ({
  checkBinary: vi.fn().mockResolvedValue({ kind: "available" }),
  checkAnthropicApiKey: vi.fn().mockReturnValue({ kind: "available" }),
}));

import { callApi } from "./codex-cli.js";
import { spawnIO } from "@lgtm-buzzer/adapter-shared";

const mockSpawnIO = vi.mocked(spawnIO);

const VALID_QUIZ_JSON = JSON.stringify({
  questions: [
    {
      prompt: "What change was made to the nil pointer handling?",
      choices: [
        "Added an early nil check before dereferencing",
        "Removed the nil check",
        "Changed the variable name",
        "Added logging",
      ],
      correctChoiceIndex: 0,
      explanation: "A nil check was added to prevent panics.",
    },
  ],
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("codex-cli provider — diff-only invariant (LEAK_CANARY)", () => {
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
        diff: "--- a/main.go\n+++ b/main.go\n@@ -10 +10 @@\n+  if ptr == nil { return }",
        prTitle: "LEAK_CANARY",
        expectedSymbols: ["LEAK_CANARY"],
        notes: "LEAK_CANARY",
      },
    });

    for (const stdin of capturedStdinCalls) {
      expect(stdin).not.toContain("LEAK_CANARY");
    }
  });
});

describe("codex-cli provider — error mapping", () => {
  it("returns errKind=skipped when precheck fails", async () => {
    const { checkBinary } = await import("./precheck.js");
    vi.mocked(checkBinary).mockResolvedValueOnce({ kind: "skipped", reason: "binary not found" });

    const result = await callApi("{{diff}}", {
      vars: { diff: "diff content" },
    });

    expect(result.metadata.errKind).toBe("skipped");
    expect(result.output).toBe("");
  });

  it("returns error output when spawn fails", async () => {
    const err: SpawnError = { kind: "process-failed", exitCode: 1, stderr: "error" };
    mockSpawnIO.mockReturnValue(IO.fail<SpawnError, never>(err));

    const result = await callApi("{{diff}}", {
      vars: { diff: "diff content" },
    });

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
        diff: "--- a/main.go\n+++ b/main.go\n@@ -10 +10 @@\n+  if ptr == nil { return }",
      },
    });

    expect(result.metadata.errKind).toBeUndefined();
    expect(() => JSON.parse(result.output)).not.toThrow();
  });
});
