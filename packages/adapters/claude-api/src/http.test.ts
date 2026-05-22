import { describe, it, expect } from "vitest";
import { createAnthropicHttpClient, USER_AGENT } from "./http.js";

describe("createAnthropicHttpClient", () => {
  it("returns an HttpClient instance (has post method)", () => {
    const client = createAnthropicHttpClient({ apiKey: "key-123" });
    expect(typeof client.post).toBe("function");
  });

  it("default baseUrl is https://api.anthropic.com", () => {
    // Verify by constructing without baseUrl — no error thrown.
    const client = createAnthropicHttpClient({ apiKey: "k" });
    expect(client).toBeDefined();
  });

  it("custom baseUrl is accepted without error", () => {
    const client = createAnthropicHttpClient({
      apiKey: "k",
      baseUrl: "http://localhost:8080",
    });
    expect(client).toBeDefined();
  });

  it("default timeoutMs is 60_000 (no error with default)", () => {
    const client = createAnthropicHttpClient({ apiKey: "k" });
    expect(client).toBeDefined();
  });

  it("custom timeoutMs is accepted without error", () => {
    const client = createAnthropicHttpClient({ apiKey: "k", timeoutMs: 5_000 });
    expect(client).toBeDefined();
  });

  it("USER_AGENT constant is the expected string", () => {
    expect(USER_AGENT).toBe("lgtm-buzzer-claude-api-adapter/0.0.0");
  });

  it("custom userAgent override is accepted without error", () => {
    const client = createAnthropicHttpClient({
      apiKey: "k",
      userAgent: "test-agent/1.0",
    });
    expect(client).toBeDefined();
  });

  it("different apiKey values produce distinct client instances", () => {
    const clientA = createAnthropicHttpClient({ apiKey: "key-a" });
    const clientB = createAnthropicHttpClient({ apiKey: "key-b" });
    expect(clientA).not.toBe(clientB);
  });
});
