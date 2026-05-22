import { describe, expect, it } from "vitest";
import { ADAPTER_ID, createGithubVcsProvider } from "./index.js";

describe("@lgtm-buzzer/adapter-github barrel", () => {
  it("ADAPTER_ID is 'github'", () => {
    expect(ADAPTER_ID).toBe("github");
  });

  it("createGithubVcsProvider is exported and returns a provider with the correct id", () => {
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test" },
    });
    expect(provider.id).toBe("github");
  });
});
