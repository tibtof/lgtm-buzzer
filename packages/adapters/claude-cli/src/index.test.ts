import { describe, expect, it } from "vitest";
import { ADAPTER_ID, createClaudeCliProvider } from "./index.js";

describe("adapter-claude-cli index", () => {
  it("exports ADAPTER_ID as 'claude-cli'", () => {
    expect(ADAPTER_ID).toBe("claude-cli");
  });

  it("exports createClaudeCliProvider as a function", () => {
    expect(typeof createClaudeCliProvider).toBe("function");
  });

  it("createClaudeCliProvider returns a provider with the correct id", () => {
    const provider = createClaudeCliProvider({
      // minimal stub spawnIO — never called in this test
      spawnIO: () => {
        throw new Error("should not be called");
      },
    });
    expect(provider.id).toBe("claude-cli");
  });
});
