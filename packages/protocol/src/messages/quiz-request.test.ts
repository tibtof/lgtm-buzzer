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
});
