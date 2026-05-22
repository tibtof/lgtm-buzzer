import { describe, it, expect, vi, afterEach } from "vitest";
import { IO } from "monadyssey";
import type { SpawnError } from "@lgtm-buzzer/adapter-shared";

// ---------------------------------------------------------------------------
// Precheck tests use a manually-wired approach: we import the module's
// dependencies via the module. Because precheck.ts imports spawnIO from
// @lgtm-buzzer/adapter-shared, we mock that module.
// ---------------------------------------------------------------------------

vi.mock("@lgtm-buzzer/adapter-shared", () => ({
  spawnIO: vi.fn(),
}));

// Import after mock registration so the mocked spawnIO is used.
import { checkBinary, checkAnthropicApiKey } from "./precheck.js";
import { spawnIO } from "@lgtm-buzzer/adapter-shared";

const mockSpawnIO = vi.mocked(spawnIO);

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env["ANTHROPIC_API_KEY"];
});

describe("checkBinary", () => {
  it("returns available when spawnIO exits 0 within budget", async () => {
    const fakeOutput = { stdout: "1.0.0", stderr: "", exitCode: 0 };
    mockSpawnIO.mockReturnValue(
      IO.lift<SpawnError, typeof fakeOutput>(() => fakeOutput),
    );

    const result = await checkBinary("some-binary");

    expect(result.kind).toBe("available");
  });

  it("returns skipped when spawnIO returns spawn-failed", async () => {
    const err: SpawnError = { kind: "spawn-failed", reason: "ENOENT: not found" };
    mockSpawnIO.mockReturnValue(IO.fail<SpawnError, never>(err));

    const result = await checkBinary("missing-binary");

    expect(result.kind).toBe("skipped");
    expect((result as { kind: "skipped"; reason: string }).reason).toContain("spawn-failed");
  });

  it("returns skipped when spawnIO returns process-failed", async () => {
    const err: SpawnError = { kind: "process-failed", exitCode: 1, stderr: "unknown flag" };
    mockSpawnIO.mockReturnValue(IO.fail<SpawnError, never>(err));

    const result = await checkBinary("broken-binary");

    expect(result.kind).toBe("skipped");
  });

  it("honours 3s budget (timeout mapped to skipped)", async () => {
    // Simulate a spawn that times out: timeout returns an error in the error channel.
    const timeoutErr: SpawnError = { kind: "spawn-failed", reason: "version check timed out" };
    const slowIO = IO.fail<SpawnError, never>(timeoutErr);
    mockSpawnIO.mockReturnValue(slowIO);

    const result = await checkBinary("slow-binary");

    expect(result.kind).toBe("skipped");
  });
});

describe("checkAnthropicApiKey", () => {
  it("returns skipped when env var is absent", () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const result = checkAnthropicApiKey();
    expect(result.kind).toBe("skipped");
    expect((result as { kind: "skipped"; reason: string }).reason).toContain("ANTHROPIC_API_KEY");
  });

  it("returns skipped when env var is empty string", () => {
    process.env["ANTHROPIC_API_KEY"] = "";
    const result = checkAnthropicApiKey();
    expect(result.kind).toBe("skipped");
  });

  it("returns skipped when env var is whitespace only", () => {
    process.env["ANTHROPIC_API_KEY"] = "   ";
    const result = checkAnthropicApiKey();
    expect(result.kind).toBe("skipped");
  });

  it("returns available when env var is set to a non-empty value", () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-key";
    const result = checkAnthropicApiKey();
    expect(result.kind).toBe("available");
  });
});
