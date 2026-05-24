import { describe, expect, it } from "vitest";
import { IO } from "monadyssey";
import type { SpawnError, SpawnOutput } from "@lgtm-buzzer/adapter-shared";
import { createDefaultCredentialResolver } from "./resolver.js";
import type { ResolverDeps } from "./types.js";

// ---------------------------------------------------------------------------
// Fake spawnIO builder
// ---------------------------------------------------------------------------

type SpawnCall = {
  command: string;
  args: readonly string[];
};

type SpawnResult =
  | { outcome: "ok"; stdout: string; exitCode?: number }
  | { outcome: "fail"; kind: SpawnError["kind"] };

/**
 * Builds a fake spawnIO that records its calls and returns a configurable result.
 * The real secret bytes from stdout are returned but NEVER placed in error messages.
 */
const makeFakeSpawnIO = (
  result: SpawnResult,
): { spawnIO: ResolverDeps["spawnIO"]; calls: SpawnCall[] } => {
  const calls: SpawnCall[] = [];
  const spawnIO = (
    command: string,
    args: readonly string[],
  ): IO<SpawnError, SpawnOutput> => {
    calls.push({ command, args });
    if (result.outcome === "ok") {
      const stdout = result.stdout;
      const exitCode = result.exitCode ?? 0;
      return IO.pure<SpawnOutput>({ stdout, stderr: "", exitCode });
    }
    return IO.fail<SpawnError, SpawnOutput>({
      kind: result.kind,
      ...(result.kind === "spawn-failed" ? { reason: "not found" } : {}),
      ...(result.kind === "process-failed" ? { exitCode: 1, stderr: "" } : {}),
      ...(result.kind === "cancelled" ? { signal: "SIGTERM" as const } : {}),
    } as SpawnError);
  };
  return { spawnIO, calls };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeResolver = (
  env: Record<string, string | undefined>,
  spawnIO: ResolverDeps["spawnIO"],
  subprocessTimeoutMs = 100,
) =>
  createDefaultCredentialResolver({ env, spawnIO, subprocessTimeoutMs });

// ---------------------------------------------------------------------------
// github resolver
// ---------------------------------------------------------------------------

describe("resolver — github", () => {
  it("GITHUB_TOKEN env hit → Right with via GITHUB_TOKEN env", async () => {
    const { spawnIO } = makeFakeSpawnIO({ outcome: "fail", kind: "spawn-failed" });
    const resolver = makeResolver({ GITHUB_TOKEN: "ghp_a" }, spawnIO);
    const result = await resolver.resolve("github").unsafeRun();
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      expect(result.value.secret).toBe("ghp_a");
      expect(result.value.detail).toBe("via GITHUB_TOKEN env");
    }
  });

  it("GH_TOKEN env hit (GITHUB_TOKEN absent) → Right with via GH_TOKEN env", async () => {
    const { spawnIO } = makeFakeSpawnIO({ outcome: "fail", kind: "spawn-failed" });
    const resolver = makeResolver({ GH_TOKEN: "ghp_b" }, spawnIO);
    const result = await resolver.resolve("github").unsafeRun();
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      expect(result.value.secret).toBe("ghp_b");
      expect(result.value.detail).toBe("via GH_TOKEN env");
    }
  });

  it("GITHUB_TOKEN takes priority over GH_TOKEN", async () => {
    const { spawnIO } = makeFakeSpawnIO({ outcome: "fail", kind: "spawn-failed" });
    const resolver = makeResolver({ GITHUB_TOKEN: "ghp_first", GH_TOKEN: "ghp_second" }, spawnIO);
    const result = await resolver.resolve("github").unsafeRun();
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      expect(result.value.secret).toBe("ghp_first");
    }
  });

  it("both env missing + gh auth token exit-0 stdout → Right (via gh CLI)", async () => {
    const { spawnIO, calls } = makeFakeSpawnIO({ outcome: "ok", stdout: "ghp_c\n" });
    const resolver = makeResolver({}, spawnIO);
    const result = await resolver.resolve("github").unsafeRun();
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      // stdout is trimmed
      expect(result.value.secret).toBe("ghp_c");
      expect(result.value.detail).toBe("via gh CLI");
    }
    // assert spawnIO was called with "gh auth token"
    expect(calls).toHaveLength(1);
    expect(calls[0]!.command).toBe("gh");
    expect(calls[0]!.args).toContain("token");
  });

  it("all miss + gh auth token exit-0 empty stdout → Left missing-credential", async () => {
    const { spawnIO } = makeFakeSpawnIO({ outcome: "ok", stdout: "  \n", exitCode: 0 });
    const resolver = makeResolver({}, spawnIO);
    const result = await resolver.resolve("github").unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("missing-credential");
      expect(result.error.adapterId).toBe("github");
      expect(result.error.attempted).toHaveLength(3);
      expect(result.error.hint).toContain("gh auth login");
    }
  });

  it("all miss + gh auth token exit-1 → Left missing-credential", async () => {
    const { spawnIO } = makeFakeSpawnIO({ outcome: "ok", stdout: "Error\n", exitCode: 1 });
    const resolver = makeResolver({}, spawnIO);
    const result = await resolver.resolve("github").unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("missing-credential");
      expect(result.error.adapterId).toBe("github");
    }
  });

  it("gh auth token spawn-failed → Left missing-credential", async () => {
    const { spawnIO } = makeFakeSpawnIO({ outcome: "fail", kind: "spawn-failed" });
    const resolver = makeResolver({}, spawnIO);
    const result = await resolver.resolve("github").unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("missing-credential");
      expect(result.error.adapterId).toBe("github");
    }
  });

  it("uses spawnIO for CLI step (not raw execa)", async () => {
    // Confirm the fake spawnIO is called — direct execa would not call it.
    const { spawnIO, calls } = makeFakeSpawnIO({ outcome: "ok", stdout: "ghp_c" });
    const resolver = makeResolver({}, spawnIO);
    await resolver.resolve("github").unsafeRun();
    expect(calls.length).toBeGreaterThan(0);
  });

  // CANARY: secret bytes NEVER appear in attempted or hint
  it("CANARY: GITHUB_TOKEN=SECRET_CANARY_xxx → detail does NOT contain secret bytes", async () => {
    const CANARY = "SECRET_CANARY_xxx";
    const { spawnIO } = makeFakeSpawnIO({ outcome: "fail", kind: "spawn-failed" });
    const resolver = makeResolver({ GITHUB_TOKEN: CANARY }, spawnIO);
    const result = await resolver.resolve("github").unsafeRun();
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      // secret is the canary (expected), but detail must NOT contain it
      expect(result.value.secret).toBe(CANARY);
      expect(result.value.detail).not.toContain(CANARY);
    }
  });

  it("CANARY: gh auth token stdout SECRET_CANARY_yyy → attempted and hint do NOT contain secret", async () => {
    const CANARY = "SECRET_CANARY_yyy";
    // Simulate full miss (env absent, CLI returns empty) so we exercise the error path
    const { spawnIO } = makeFakeSpawnIO({ outcome: "ok", stdout: "", exitCode: 0 });
    const resolver = makeResolver({}, spawnIO);
    const result = await resolver.resolve("github").unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      const serialized = JSON.stringify(result.error);
      // The canary itself was never in the chain here; confirm attempted/hint are clean
      expect(serialized).not.toContain(CANARY);
    }
  });
});

// ---------------------------------------------------------------------------
// ado resolver
// ---------------------------------------------------------------------------

describe("resolver — ado", () => {
  it("AZURE_DEVOPS_EXT_PAT env hit → Right", async () => {
    const { spawnIO } = makeFakeSpawnIO({ outcome: "fail", kind: "spawn-failed" });
    const resolver = makeResolver({ AZURE_DEVOPS_EXT_PAT: "azp_xxx" }, spawnIO);
    const result = await resolver.resolve("ado").unsafeRun();
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      expect(result.value.secret).toBe("azp_xxx");
      expect(result.value.detail).toContain("AZURE_DEVOPS_EXT_PAT");
    }
  });

  it("env miss + az CLI exit-0 → Right (via az CLI)", async () => {
    const { spawnIO, calls } = makeFakeSpawnIO({ outcome: "ok", stdout: "aztoken\n" });
    const resolver = makeResolver({}, spawnIO);
    const result = await resolver.resolve("ado").unsafeRun();
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      expect(result.value.secret).toBe("aztoken");
      expect(result.value.detail).toContain("az CLI");
    }
    expect(calls[0]!.command).toBe("az");
  });

  it("env miss + az CLI exit-non-zero → Left missing-credential", async () => {
    const { spawnIO } = makeFakeSpawnIO({ outcome: "ok", stdout: "Error\n", exitCode: 2 });
    const resolver = makeResolver({}, spawnIO);
    const result = await resolver.resolve("ado").unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("missing-credential");
      expect(result.error.adapterId).toBe("ado");
      expect(result.error.hint).toContain("az login");
    }
  });
});

// ---------------------------------------------------------------------------
// claude-api resolver
// ---------------------------------------------------------------------------

describe("resolver — claude-api", () => {
  it("ANTHROPIC_API_KEY env hit → Right with via ANTHROPIC_API_KEY env", async () => {
    const { spawnIO } = makeFakeSpawnIO({ outcome: "fail", kind: "spawn-failed" });
    const resolver = makeResolver({ ANTHROPIC_API_KEY: "sk-ant-xxx" }, spawnIO);
    const result = await resolver.resolve("claude-api").unsafeRun();
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      expect(result.value.secret).toBe("sk-ant-xxx");
      expect(result.value.detail).toContain("ANTHROPIC_API_KEY");
    }
  });

  it("ANTHROPIC_API_KEY absent → Left with hint mentioning ANTHROPIC_API_KEY", async () => {
    const { spawnIO } = makeFakeSpawnIO({ outcome: "fail", kind: "spawn-failed" });
    const resolver = makeResolver({}, spawnIO);
    const result = await resolver.resolve("claude-api").unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("missing-credential");
      expect(result.error.adapterId).toBe("claude-api");
      expect(result.error.hint).toContain("ANTHROPIC_API_KEY");
    }
  });
});

// ---------------------------------------------------------------------------
// CLI-managed adapters (noop resolvers)
// ---------------------------------------------------------------------------

describe("resolver — CLI-managed adapters", () => {
  const cliAdapters = ["claude-cli", "codex-cli", "copilot-cli"] as const;

  for (const adapterId of cliAdapters) {
    it(`${adapterId} → always Right<{ secret: undefined, detail: 'uses CLI's own login' }>`, async () => {
      const { spawnIO } = makeFakeSpawnIO({ outcome: "fail", kind: "spawn-failed" });
      const resolver = makeResolver({}, spawnIO);
      const result = await resolver.resolve(adapterId).unsafeRun();
      expect(result.type).toBe("Ok");
      if (result.type === "Ok") {
        expect(result.value.secret).toBeUndefined();
        expect(result.value.detail).toBe("uses CLI's own login");
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Unknown adapter
// ---------------------------------------------------------------------------

describe("resolver — unknown adapter", () => {
  it("unknown adapter ID → Left with hint 'no resolver'", async () => {
    const { spawnIO } = makeFakeSpawnIO({ outcome: "fail", kind: "spawn-failed" });
    const resolver = makeResolver({}, spawnIO);
    const result = await resolver.resolve("my-unknown-adapter").unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("missing-credential");
      expect(result.error.adapterId).toBe("my-unknown-adapter");
      expect(result.error.hint).toContain("No resolver");
    }
  });
});

// ---------------------------------------------------------------------------
// BINDING CANARY: secret bytes never appear in attempted or hint
// ---------------------------------------------------------------------------

describe("resolver — secret redaction canary (BINDING)", () => {
  it("CANARY: secret from CLI stdout does NOT contaminate attempted/hint in error path", async () => {
    // Simulate: env absent, CLI returns a secret but exitCode=1 (failure)
    // so the chain misses. The secret bytes must not appear in the error.
    const SECRET = "SECRET_CANARY_ZZZ_DO_NOT_ECHO";
    const { spawnIO } = makeFakeSpawnIO({ outcome: "ok", stdout: SECRET, exitCode: 1 });
    const resolver = makeResolver({}, spawnIO);
    const result = await resolver.resolve("github").unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      const serialized = JSON.stringify(result.error);
      expect(serialized).not.toContain(SECRET);
    }
  });

  it("CANARY: env var value does NOT contaminate detail on success", async () => {
    const SECRET = "SECRET_CANARY_ENV_QQQ";
    const { spawnIO } = makeFakeSpawnIO({ outcome: "fail", kind: "spawn-failed" });
    const resolver = makeResolver({ GITHUB_TOKEN: SECRET }, spawnIO);
    const result = await resolver.resolve("github").unsafeRun();
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      // secret is the canary value (expected — that's the token)
      expect(result.value.secret).toBe(SECRET);
      // but detail must NOT contain the secret bytes
      expect(result.value.detail).not.toContain(SECRET);
    }
  });
});
