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

import { callApi } from "./copilot-cli.js";
import { spawnIO } from "@lgtm-buzzer/adapter-shared";

const mockSpawnIO = vi.mocked(spawnIO);

const VALID_QUIZ_JSON = JSON.stringify({
  questions: [
    {
      prompt: "What HTTP method does the new /api/users route handle?",
      choices: ["GET", "POST", "PUT", "DELETE"],
      correctChoiceIndex: 1,
      explanation: "The route handler responds to POST requests.",
    },
  ],
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("copilot-cli provider — diff-only invariant (LEAK_CANARY)", () => {
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
        diff: "--- a/routes.py\n+++ b/routes.py\n@@ -0 +1 @@\n+@app.route('/api/users', methods=['POST'])\ndef create_user(): pass",
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

describe("copilot-cli provider — error mapping", () => {
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
    const err: SpawnError = { kind: "spawn-failed", reason: "ENOENT: gh not found" };
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
        diff: "--- a/routes.py\n+++ b/routes.py\n@@ -0 +1 @@\n+@app.route('/api/users', methods=['POST'])\ndef create_user(): pass",
      },
    });

    expect(result.metadata.errKind).toBeUndefined();
    expect(() => JSON.parse(result.output)).not.toThrow();
  });
});
