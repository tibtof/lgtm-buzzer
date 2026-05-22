import { describe, expect, it } from "vitest";
import { pickLLMProvider, pickVCSProvider } from "./adapter-registry.js";
import type { PRIdentifier } from "@lgtm-buzzer/core";

describe("pickLLMProvider", () => {
  it("defaults to cli when LGTM_BUZZER_LLM is not set", async () => {
    const result = await pickLLMProvider({}).unsafeRun();
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      expect(result.value.id).toBe("claude-cli");
    }
  });

  it("returns claude-cli provider when LGTM_BUZZER_LLM=cli", async () => {
    const result = await pickLLMProvider({ LGTM_BUZZER_LLM: "cli" }).unsafeRun();
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      expect(result.value.id).toBe("claude-cli");
    }
  });

  it("returns error when LGTM_BUZZER_LLM=api (not implemented in M2)", async () => {
    const result = await pickLLMProvider({ LGTM_BUZZER_LLM: "api" }).unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("llm-not-configured");
      expect(result.error.detail).toContain("not implemented");
    }
  });

  it("returns error for unrecognised LGTM_BUZZER_LLM value", async () => {
    const result = await pickLLMProvider({ LGTM_BUZZER_LLM: "openai" }).unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("llm-not-configured");
      expect(result.error.detail).toContain("openai");
    }
  });

  it("trims and lowercases the env var value", async () => {
    const result = await pickLLMProvider({ LGTM_BUZZER_LLM: "  CLI  " }).unsafeRun();
    expect(result.type).toBe("Ok");
  });
});

describe("pickVCSProvider", () => {
  const githubPR: PRIdentifier = {
    kind: "github",
    owner: "owner",
    repo: "repo",
    number: 1,
  };

  const adoPR: PRIdentifier = {
    kind: "ado",
    org: "myorg",
    project: "myproject",
    repo: "myrepo",
    pullRequestId: 42,
  };

  it("returns github provider when pr.kind=github and token is set", async () => {
    const result = await pickVCSProvider(githubPR, {
      LGTM_BUZZER_GH_TOKEN: "ghp_test",
    }).unsafeRun();
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      expect(result.value.id).toBe("github");
    }
  });

  it("returns error when pr.kind=github and LGTM_BUZZER_GH_TOKEN is missing", async () => {
    const result = await pickVCSProvider(githubPR, {}).unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("vcs-not-configured");
      expect(result.error.detail).toContain("LGTM_BUZZER_GH_TOKEN");
    }
  });

  it("returns error when pr.kind=github and LGTM_BUZZER_GH_TOKEN is empty string", async () => {
    const result = await pickVCSProvider(githubPR, {
      LGTM_BUZZER_GH_TOKEN: "",
    }).unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("vcs-not-configured");
    }
  });

  it("returns not-implemented error for ado PRs", async () => {
    const result = await pickVCSProvider(adoPR, {
      LGTM_BUZZER_GH_TOKEN: "token",
    }).unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("vcs-not-implemented");
      expect(result.error.detail).toContain("M2");
    }
  });
});
