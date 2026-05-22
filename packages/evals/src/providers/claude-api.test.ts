import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { IO } from "monadyssey";

// Mock the precheck so we control when API key is "available".
vi.mock("./precheck.js", () => ({
  checkBinary: vi.fn().mockResolvedValue({ kind: "available" }),
  checkAnthropicApiKey: vi.fn().mockReturnValue({ kind: "available" }),
}));

// Use a stable mock for fakeHttpPost accessible from the mock factory.
// We cannot use a top-level variable in the factory (hoisting issue),
// so we expose the spy via the module mock and retrieve it via vi.mocked.
vi.mock("@lgtm-buzzer/adapter-claude-api", async () => {
  const original = await vi.importActual<Record<string, unknown>>("@lgtm-buzzer/adapter-claude-api");
  const fakePost = vi.fn();
  return {
    ...original,
    createAnthropicHttpClient: vi.fn().mockReturnValue({
      post: fakePost,
    }),
    // Expose the spy for retrieval in tests.
    __fakePost: fakePost,
  };
});

import { callApi } from "./claude-api.js";
import { checkAnthropicApiKey } from "./precheck.js";
import * as claudeApiMod from "@lgtm-buzzer/adapter-claude-api";

// Retrieve the stable spy exposed by the mock.
const getFakePost = (): ReturnType<typeof vi.fn> =>
  (claudeApiMod as unknown as { __fakePost: ReturnType<typeof vi.fn> }).__fakePost;

const VALID_ANTHROPIC_RESPONSE = JSON.stringify({
  id: "msg_001",
  type: "message",
  role: "assistant",
  content: [
    {
      type: "text",
      text: JSON.stringify({
        questions: [
          {
            prompt: "What does the new createAnthropicHttpClient do?",
            choices: [
              "Creates a pre-configured HTTP client for Anthropic",
              "Sends a test message to the API",
              "Validates the API key",
              "Logs all requests",
            ],
            correctChoiceIndex: 0,
            explanation: "The function creates an HttpClient with Anthropic-specific headers.",
          },
        ],
      }),
    },
  ],
  model: "claude-sonnet-4-7",
  stop_reason: "end_turn",
  usage: { input_tokens: 100, output_tokens: 200 },
});

beforeEach(() => {
  process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-key";
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env["ANTHROPIC_API_KEY"];
});

describe("claude-api provider — diff-only invariant (LEAK_CANARY)", () => {
  it("LEAK_CANARY: does NOT forward prTitle or expectedSymbols to the HTTP body", async () => {
    const capturedBodies: unknown[] = [];
    const fakePost = getFakePost();

    fakePost.mockImplementation(
      (path: string, body: unknown): IO<never, Response> => {
        if (path === "/v1/messages") {
          capturedBodies.push(body);
        }
        const mockResponse = new Response(VALID_ANTHROPIC_RESPONSE, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
        return IO.lift<never, Response>(() => mockResponse);
      },
    );

    await callApi("{{diff}}", {
      vars: {
        diff: "--- a/http.ts\n+++ b/http.ts\n@@ -0 +1 @@\n+export const createAnthropicHttpClient = () => {};",
        prTitle: "LEAK_CANARY",
        expectedSymbols: ["LEAK_CANARY"],
        notes: "LEAK_CANARY",
      },
    });

    // The canary value must not appear in any HTTP body sent to the API.
    for (const body of capturedBodies) {
      const serialised = JSON.stringify(body);
      expect(serialised).not.toContain("LEAK_CANARY");
    }
  });
});

describe("claude-api provider — error mapping", () => {
  it("returns errKind=skipped when ANTHROPIC_API_KEY is not set", async () => {
    vi.mocked(checkAnthropicApiKey).mockReturnValueOnce({
      kind: "skipped",
      reason: "ANTHROPIC_API_KEY is not set",
    });

    const result = await callApi("{{diff}}", {
      vars: { diff: "diff content" },
    });

    expect(result.metadata.errKind).toBe("skipped");
    expect(result.output).toBe("");
  });

  it("returns error output when HTTP call fails", async () => {
    const fakePost = getFakePost();
    fakePost.mockReturnValue(
      IO.fail<{ kind: string; message: string }, never>({
        kind: "network",
        message: "connection refused",
      }),
    );

    const result = await callApi("{{diff}}", {
      vars: { diff: "diff content" },
    });

    expect(result.output).toBe("");
    expect(result.metadata.errKind).toBeDefined();
  });

  it("happy path: returns JSON-stringified quiz on success", async () => {
    const fakePost = getFakePost();
    fakePost.mockReturnValue(
      IO.lift<never, Response>(
        () =>
          new Response(VALID_ANTHROPIC_RESPONSE, {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const result = await callApi("{{diff}}", {
      vars: {
        diff: "--- a/http.ts\n+++ b/http.ts\n@@ -0 +1 @@\n+export const createAnthropicHttpClient = () => {};",
      },
    });

    expect(result.metadata.errKind).toBeUndefined();
    expect(() => JSON.parse(result.output)).not.toThrow();
  });
});
