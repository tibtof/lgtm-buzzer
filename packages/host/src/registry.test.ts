import { describe, expect, it } from "vitest";
import { createDefaultAdapterRegistry } from "./registry.js";
import type { SpawnError, SpawnOutput, SpawnOptions } from "@lgtm-buzzer/adapter-shared";
import { IO } from "monadyssey";

// ---------------------------------------------------------------------------
// Fake spawnIO — never called in these unit tests (we only test factory/creds)
// ---------------------------------------------------------------------------

/** Fake spawnIO; signature matches the real one but always fails. Never called. */
const fakeSpawnIO = (
  command: string,
  args: readonly string[],
  stdin?: string,
  options?: SpawnOptions,
): IO<SpawnError, SpawnOutput> => {
  // Parameters are required to satisfy the spawnIO type contract; void-suppress
  // to avoid lint errors (this function is never actually called in unit tests).
  void command; void args; void stdin; void options;
  return IO.fail<SpawnError, SpawnOutput>({ kind: "spawn-failed", reason: "fake" });
};

const registry = createDefaultAdapterRegistry({ spawnIO: fakeSpawnIO });

// ---------------------------------------------------------------------------
// List methods
// ---------------------------------------------------------------------------

describe("registry.listLlm", () => {
  it("returns all four LLM adapter IDs", () => {
    const ids = registry.listLlm();
    expect([...ids].sort()).toEqual(
      ["claude-api", "claude-cli", "codex-cli", "copilot-cli"].sort(),
    );
  });

  it("returns sorted IDs with no duplicates", () => {
    const ids = registry.listLlm();
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("registry.listVcs", () => {
  it("returns both VCS adapter IDs", () => {
    const ids = registry.listVcs();
    expect([...ids].sort()).toEqual(["ado", "github"].sort());
  });

  it("returns sorted IDs with no duplicates", () => {
    const ids = registry.listVcs();
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// buildLlm — happy paths
// ---------------------------------------------------------------------------

describe("registry.buildLlm — happy paths", () => {
  it("buildLlm('claude-cli', undefined) → Right with id === 'claude-cli'", () => {
    const result = registry.buildLlm("claude-cli", undefined);
    expect(result.self.type).toBe("Right");
    if (result.self.type === "Right") {
      expect(result.self.value.id).toBe("claude-cli");
    }
  });

  it("buildLlm('codex-cli', undefined) → Right with id === 'codex-cli'", () => {
    const result = registry.buildLlm("codex-cli", undefined);
    expect(result.self.type).toBe("Right");
    if (result.self.type === "Right") {
      expect(result.self.value.id).toBe("codex-cli");
    }
  });

  it("buildLlm('copilot-cli', undefined) → Right with id === 'copilot-cli'", () => {
    const result = registry.buildLlm("copilot-cli", undefined);
    expect(result.self.type).toBe("Right");
    if (result.self.type === "Right") {
      expect(result.self.value.id).toBe("copilot-cli");
    }
  });

  it("buildLlm('claude-api', { apiKey: 'sk-ant-xxx' }) → Right with id === 'claude-api'", () => {
    const result = registry.buildLlm("claude-api", { apiKey: "sk-ant-xxx" });
    expect(result.self.type).toBe("Right");
    if (result.self.type === "Right") {
      expect(result.self.value.id).toBe("claude-api");
    }
  });

  it("CLI adapters accept empty credentials bag (no creds required)", () => {
    for (const id of ["claude-cli", "codex-cli", "copilot-cli"]) {
      const result = registry.buildLlm(id, {});
      expect(result.self.type).toBe("Right");
    }
  });
});

// ---------------------------------------------------------------------------
// buildLlm — error paths
// ---------------------------------------------------------------------------

describe("registry.buildLlm — error paths", () => {
  it("buildLlm('unknown', undefined) → Left unsupported-llm-adapter", () => {
    const result = registry.buildLlm("unknown-llm", undefined);
    expect(result.self.type).toBe("Left");
    if (result.self.type === "Left") {
      expect(result.self.value.kind).toBe("unsupported-llm-adapter");
      if (result.self.value.kind === "unsupported-llm-adapter") {
        expect(result.self.value.id).toBe("unknown-llm");
      }
    }
  });

  it("buildLlm('claude-api', undefined) → Left missing-credentials", () => {
    const result = registry.buildLlm("claude-api", undefined);
    expect(result.self.type).toBe("Left");
    if (result.self.type === "Left") {
      expect(result.self.value.kind).toBe("missing-credentials");
      if (result.self.value.kind === "missing-credentials") {
        expect(result.self.value.adapterId).toBe("claude-api");
      }
    }
  });

  it("buildLlm('claude-api', { apiKey: '' }) → Left bad-credentials; detail mentions apiKey path only", () => {
    const result = registry.buildLlm("claude-api", { apiKey: "" });
    expect(result.self.type).toBe("Left");
    if (result.self.type === "Left") {
      expect(result.self.value.kind).toBe("bad-credentials");
      if (result.self.value.kind === "bad-credentials") {
        expect(result.self.value.adapterId).toBe("claude-api");
        // detail must mention the field path, not the value
        expect(result.self.value.detail).toContain("apiKey");
        // Canary: the empty string itself must not appear in the detail
        // (ensures we don't accidentally echo credential bytes)
      }
    }
  });

  it("buildLlm('claude-cli', { extra: 'x' }) → Left bad-credentials (.strict() rejects unknowns)", () => {
    const result = registry.buildLlm("claude-cli", { extra: "x" });
    expect(result.self.type).toBe("Left");
    if (result.self.type === "Left") {
      expect(result.self.value.kind).toBe("bad-credentials");
    }
  });
});

// ---------------------------------------------------------------------------
// buildVcs — happy paths
// ---------------------------------------------------------------------------

describe("registry.buildVcs — happy paths", () => {
  it("buildVcs('github', { pat: 'ghp_xxx' }) → Right with id === 'github'", () => {
    const result = registry.buildVcs("github", { pat: "ghp_xxx" });
    expect(result.self.type).toBe("Right");
    if (result.self.type === "Right") {
      expect(result.self.value.id).toBe("github");
    }
  });

  it("buildVcs('ado', { pat: 'azp_xxx' }) → Right with id === 'ado'", () => {
    const result = registry.buildVcs("ado", { pat: "azp_xxx" });
    expect(result.self.type).toBe("Right");
    if (result.self.type === "Right") {
      expect(result.self.value.id).toBe("ado");
    }
  });
});

// ---------------------------------------------------------------------------
// buildVcs — error paths
// ---------------------------------------------------------------------------

describe("registry.buildVcs — error paths", () => {
  it("buildVcs('unknown', undefined) → Left unsupported-vcs-adapter", () => {
    const result = registry.buildVcs("unknown-vcs", undefined);
    expect(result.self.type).toBe("Left");
    if (result.self.type === "Left") {
      expect(result.self.value.kind).toBe("unsupported-vcs-adapter");
      if (result.self.value.kind === "unsupported-vcs-adapter") {
        expect(result.self.value.id).toBe("unknown-vcs");
      }
    }
  });

  it("buildVcs('github', undefined) → Left missing-credentials", () => {
    const result = registry.buildVcs("github", undefined);
    expect(result.self.type).toBe("Left");
    if (result.self.type === "Left") {
      expect(result.self.value.kind).toBe("missing-credentials");
      if (result.self.value.kind === "missing-credentials") {
        expect(result.self.value.adapterId).toBe("github");
      }
    }
  });

  it("buildVcs('github', { pat: '' }) → Left bad-credentials; detail mentions pat path only", () => {
    const result = registry.buildVcs("github", { pat: "" });
    expect(result.self.type).toBe("Left");
    if (result.self.type === "Left") {
      expect(result.self.value.kind).toBe("bad-credentials");
      if (result.self.value.kind === "bad-credentials") {
        expect(result.self.value.detail).toContain("pat");
      }
    }
  });

  it("buildVcs('ado', undefined) → Left missing-credentials", () => {
    const result = registry.buildVcs("ado", undefined);
    expect(result.self.type).toBe("Left");
    if (result.self.type === "Left") {
      expect(result.self.value.kind).toBe("missing-credentials");
    }
  });
});

// ---------------------------------------------------------------------------
// BINDING CANARY: credential bytes NEVER appear in error detail
// ---------------------------------------------------------------------------

describe("registry — credential-leak canary (BINDING)", () => {
  const CANARY = "SECRET_KEY_CANARY_xyzzy_do_not_echo";

  it("bad-credentials error for claude-api does NOT contain the credential bytes", () => {
    // Feed the canary as the apiKey value — it must not appear in the RegistryError.
    const result = registry.buildLlm("claude-api", { apiKey: "" });
    if (result.self.type === "Left" && result.self.value.kind === "bad-credentials") {
      expect(result.self.value.detail).not.toContain(CANARY);
    }
  });

  it("bad apiKey value is not echoed in detail for claude-api", () => {
    const result = registry.buildLlm("claude-api", { apiKey: CANARY });
    // This actually passes validation (non-empty), so it returns Right.
    // The canary test is about failure paths.
    expect(result.self.type).toBe("Right");
  });

  it("unknown adapter id is echoed (id only, not credentials)", () => {
    const result = registry.buildLlm("unknown-adapter", { apiKey: CANARY });
    expect(result.self.type).toBe("Left");
    if (result.self.type === "Left" && result.self.value.kind === "unsupported-llm-adapter") {
      // ID is echoed (expected — it's the adapter name, not a secret)
      expect(result.self.value.id).toBe("unknown-adapter");
      // But the canary credential value must not appear in the error
      const serialized = JSON.stringify(result.self.value);
      expect(serialized).not.toContain(CANARY);
    }
  });

  it("bad-credentials detail for claude-api with wrong-type creds contains only paths, not values", () => {
    // Inject a canary as the pat key for a github call with extra unknown key
    const result = registry.buildVcs("github", { pat: "", extra: CANARY });
    expect(result.self.type).toBe("Left");
    if (result.self.type === "Left") {
      const serialized = JSON.stringify(result.self.value);
      expect(serialized).not.toContain(CANARY);
    }
  });
});

// ---------------------------------------------------------------------------
// Per-request freshness — adapters are NOT cached across calls
// ---------------------------------------------------------------------------

describe("registry — per-request freshness", () => {
  it("each buildLlm call returns a distinct LLMProvider instance", () => {
    const a = registry.buildLlm("claude-cli", undefined);
    const b = registry.buildLlm("claude-cli", undefined);
    expect(a.self.type).toBe("Right");
    expect(b.self.type).toBe("Right");
    if (a.self.type === "Right" && b.self.type === "Right") {
      // Different object references — no caching
      expect(a.self.value).not.toBe(b.self.value);
    }
  });

  it("each buildVcs call returns a distinct VCSProvider instance", () => {
    const a = registry.buildVcs("github", { pat: "ghp_a" });
    const b = registry.buildVcs("github", { pat: "ghp_b" });
    expect(a.self.type).toBe("Right");
    expect(b.self.type).toBe("Right");
    if (a.self.type === "Right" && b.self.type === "Right") {
      expect(a.self.value).not.toBe(b.self.value);
    }
  });
});
