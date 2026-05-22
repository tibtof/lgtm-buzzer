import { describe, expect, it } from "vitest";
import { getCredsSpec, ADAPTER_CREDS_SPECS } from "./adapter-creds.js";

describe("getCredsSpec", () => {
  it("claude-cli → fields empty, note 'no credentials required'", () => {
    const spec = getCredsSpec("claude-cli");
    expect(spec).not.toBeUndefined();
    expect(spec!.fields).toHaveLength(0);
    expect(spec!.note).toBe("no credentials required");
    expect(spec!.category).toBe("llm");
  });

  it("claude-api → one field with key 'apiKey'", () => {
    const spec = getCredsSpec("claude-api");
    expect(spec).not.toBeUndefined();
    expect(spec!.fields).toHaveLength(1);
    expect(spec!.fields[0]!.key).toBe("apiKey");
    expect(spec!.category).toBe("llm");
  });

  it("github → one field with key 'pat'", () => {
    const spec = getCredsSpec("github");
    expect(spec).not.toBeUndefined();
    expect(spec!.fields).toHaveLength(1);
    expect(spec!.fields[0]!.key).toBe("pat");
    expect(spec!.category).toBe("vcs");
  });

  it("ado → one field with key 'pat'", () => {
    const spec = getCredsSpec("ado");
    expect(spec).not.toBeUndefined();
    expect(spec!.fields).toHaveLength(1);
    expect(spec!.fields[0]!.key).toBe("pat");
    expect(spec!.category).toBe("vcs");
  });

  it("unknown adapter ID → undefined", () => {
    const spec = getCredsSpec("unknown-adapter-xyz");
    expect(spec).toBeUndefined();
  });

  it("codex-cli and copilot-cli are in the registry with no fields", () => {
    const codex = getCredsSpec("codex-cli");
    const copilot = getCredsSpec("copilot-cli");
    expect(codex?.fields).toHaveLength(0);
    expect(copilot?.fields).toHaveLength(0);
  });

  it("ADAPTER_CREDS_SPECS contains all 6 known adapters", () => {
    const ids = ADAPTER_CREDS_SPECS.map((s) => s.adapterId);
    expect(ids).toContain("claude-cli");
    expect(ids).toContain("codex-cli");
    expect(ids).toContain("copilot-cli");
    expect(ids).toContain("claude-api");
    expect(ids).toContain("github");
    expect(ids).toContain("ado");
  });
});
