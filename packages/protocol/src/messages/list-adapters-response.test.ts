import { describe, expect, it } from "vitest";
import { ListAdaptersResponseFrameSchema } from "./list-adapters-response.js";

const BASE = {
  v: 1 as const,
  kind: "list-adapters-response" as const,
  correlationId: "cid-lars",
};

describe("ListAdaptersResponseFrameSchema", () => {
  it("parses a well-formed frame with both llm and vcs arrays", () => {
    const result = ListAdaptersResponseFrameSchema.safeParse({
      ...BASE,
      payload: {
        llm: ["claude-cli", "codex-cli", "copilot-cli", "claude-api"],
        vcs: ["github", "ado"],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("list-adapters-response");
      expect(result.data.payload.llm).toHaveLength(4);
      expect(result.data.payload.vcs).toHaveLength(2);
    }
  });

  it("parses a frame with empty arrays (degenerate host)", () => {
    const result = ListAdaptersResponseFrameSchema.safeParse({
      ...BASE,
      payload: { llm: [], vcs: [] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.llm).toHaveLength(0);
      expect(result.data.payload.vcs).toHaveLength(0);
    }
  });

  it("parses a frame with null correlationId", () => {
    const result = ListAdaptersResponseFrameSchema.safeParse({
      v: 1,
      kind: "list-adapters-response",
      correlationId: null,
      payload: { llm: ["claude-cli"], vcs: ["github"] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a frame where llm contains a non-string element", () => {
    const result = ListAdaptersResponseFrameSchema.safeParse({
      ...BASE,
      payload: { llm: [42], vcs: ["github"] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a frame where llm contains an empty string element", () => {
    const result = ListAdaptersResponseFrameSchema.safeParse({
      ...BASE,
      payload: { llm: [""], vcs: ["github"] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a frame where vcs is missing", () => {
    const result = ListAdaptersResponseFrameSchema.safeParse({
      ...BASE,
      payload: { llm: ["claude-cli"] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a frame where llm is missing", () => {
    const result = ListAdaptersResponseFrameSchema.safeParse({
      ...BASE,
      payload: { vcs: ["github"] },
    });
    expect(result.success).toBe(false);
  });
});
