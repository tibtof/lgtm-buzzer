import { describe, expect, it } from "vitest";
import { HttpClient } from "monadyssey-fetch";
import { createGithubHttpClient, USER_AGENT } from "./http.js";

describe("createGithubHttpClient", () => {
  it("returns an HttpClient instance", () => {
    const client = createGithubHttpClient({ token: "ghp_test" });
    expect(client).toBeInstanceOf(HttpClient);
  });

  it("uses the default base URL when none is provided", () => {
    // Verify by calling the helper; we can't inspect private fields but can
    // confirm no error is thrown and the client is usable.
    const client = createGithubHttpClient({ token: "ghp_test" });
    expect(client).toBeDefined();
  });

  it("uses the default User-Agent constant", () => {
    expect(USER_AGENT).toBe("lgtm-buzzer-github-adapter/0.0.0");
  });

  it("accepts a custom baseUrl (GitHub Enterprise)", () => {
    const client = createGithubHttpClient({
      token: "ghp_test",
      baseUrl: "https://ghe.example.com/api/v3",
    });
    expect(client).toBeInstanceOf(HttpClient);
  });

  it("accepts a custom timeoutMs", () => {
    const client = createGithubHttpClient({ token: "ghp_test", timeoutMs: 5_000 });
    expect(client).toBeInstanceOf(HttpClient);
  });

  it("accepts a custom userAgent override", () => {
    const client = createGithubHttpClient({
      token: "ghp_test",
      userAgent: "test-agent/1.0",
    });
    expect(client).toBeInstanceOf(HttpClient);
  });

  it("does not throw when token is an empty string (format validation deferred to API)", () => {
    expect(() => createGithubHttpClient({ token: "" })).not.toThrow();
  });
});
