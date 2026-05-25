import { describe, expect, it } from "vitest";
import { QuizRequestFrameSchema } from "./quiz-request.js";

const BASE = {
  v: 1 as const,
  kind: "quiz-request" as const,
  correlationId: "cid-qreq",
};

const GITHUB_PR = {
  kind: "github" as const,
  owner: "acme",
  repo: "api",
  number: 42,
};

const ADO_PR = {
  kind: "ado" as const,
  org: "myorg",
  project: "myproject",
  repo: "myrepo",
  pullRequestId: 7,
};

describe("QuizRequestFrameSchema", () => {
  it("parses a well-formed quiz-request frame with a GitHub PR", () => {
    const result = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: { pr: GITHUB_PR, questionCount: 3 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.pr.kind).toBe("github");
      expect(result.data.payload.questionCount).toBe(3);
    }
  });

  it("parses a well-formed quiz-request frame with an ADO PR", () => {
    const result = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: { pr: ADO_PR, questionCount: 5 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.pr.kind).toBe("ado");
    }
  });

  it("rejects when questionCount is below minimum (0)", () => {
    const result = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: { pr: GITHUB_PR, questionCount: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when questionCount exceeds maximum (11)", () => {
    const result = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: { pr: GITHUB_PR, questionCount: 11 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when pr is missing from payload", () => {
    const result = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: { questionCount: 3 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when pr has a malformed nested PRIdentifier (unknown kind)", () => {
    const result = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: {
        pr: { kind: "gitlab", namespace: "acme", repo: "api", number: 1 },
        questionCount: 3,
      },
    });
    expect(result.success).toBe(false);
  });

  // ADR-29: credentials field is REMOVED. Test passthrough behaviour.
  it("parses a stale quiz-request that still contains a credentials field (passthrough)", () => {
    // A stale extension still sends credentials. The schema should still parse
    // (zod passthrough default) without crashing the host.
    const result = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: {
        pr: GITHUB_PR,
        questionCount: 3,
        llmAdapterId: "claude-api",
        vcsAdapterId: "github",
        credentials: { apiKey: "sk-ant-xxx", pat: "ghp_yyy" },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // adapter IDs are still parsed
      expect(result.data.payload.llmAdapterId).toBe("claude-api");
      expect(result.data.payload.vcsAdapterId).toBe("github");
      // credentials field is NOT on the typed payload — the handler should never read it
      // (TypeScript type does not expose it, but zod passthrough keeps it in the runtime object)
    }
  });

  it("parses a quiz-request with only pr + questionCount (minimal envelope)", () => {
    const result = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: { pr: GITHUB_PR, questionCount: 5 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.llmAdapterId).toBeUndefined();
      expect(result.data.payload.vcsAdapterId).toBeUndefined();
    }
  });

  it("rejects when llmAdapterId is an empty string", () => {
    const result = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: {
        pr: GITHUB_PR,
        questionCount: 3,
        llmAdapterId: "",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when vcsAdapterId is an empty string", () => {
    const result = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: {
        pr: GITHUB_PR,
        questionCount: 3,
        vcsAdapterId: "",
      },
    });
    expect(result.success).toBe(false);
  });

  // ADR-30: questionPoolSize field.

  it("parses when questionPoolSize is absent (legacy mode)", () => {
    const result = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: { pr: GITHUB_PR, questionCount: 5 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.questionPoolSize).toBeUndefined();
    }
  });

  it("parses when questionPoolSize is present and valid", () => {
    const result = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: { pr: GITHUB_PR, questionCount: 5, questionPoolSize: 20 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.questionPoolSize).toBe(20);
    }
  });

  it("parses when questionPoolSize is less than questionCount (schema does not enforce cross-field — handler does)", () => {
    // The schema intentionally does not enforce questionPoolSize >= questionCount.
    // The dispatcher handler enforces this at runtime and returns an error frame.
    const result = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: { pr: GITHUB_PR, questionCount: 5, questionPoolSize: 3 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects when questionPoolSize exceeds maximum (51)", () => {
    const result = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: { pr: GITHUB_PR, questionCount: 5, questionPoolSize: 51 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when questionPoolSize is zero", () => {
    const result = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: { pr: GITHUB_PR, questionCount: 5, questionPoolSize: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts questionPoolSize at boundaries (1 and 50)", () => {
    const r1 = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: { pr: GITHUB_PR, questionCount: 1, questionPoolSize: 1 },
    });
    expect(r1.success).toBe(true);

    const r50 = QuizRequestFrameSchema.safeParse({
      ...BASE,
      payload: { pr: GITHUB_PR, questionCount: 5, questionPoolSize: 50 },
    });
    expect(r50.success).toBe(true);
  });
});
