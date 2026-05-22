import { describe, expect, it } from "vitest";
import {
  GitHubPRIdentifierSchema,
  AdoPRIdentifierSchema,
  PRIdentifierSchema,
} from "./pr-identifier.js";

describe("PRIdentifierSchema", () => {
  it("parses a well-formed GitHub PR identifier", () => {
    const result = PRIdentifierSchema.safeParse({
      kind: "github",
      owner: "acme",
      repo: "api",
      number: 42,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("github");
    }
  });

  it("parses a well-formed ADO PR identifier", () => {
    const result = PRIdentifierSchema.safeParse({
      kind: "ado",
      org: "myorg",
      project: "myproject",
      repo: "myrepo",
      pullRequestId: 7,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("ado");
    }
  });

  it("rejects a PR identifier with an unknown kind", () => {
    const result = PRIdentifierSchema.safeParse({
      kind: "bitbucket",
      owner: "acme",
      repo: "api",
      number: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a PR identifier with missing kind", () => {
    const result = PRIdentifierSchema.safeParse({
      owner: "acme",
      repo: "api",
      number: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a GitHub identifier with an empty owner string", () => {
    const result = GitHubPRIdentifierSchema.safeParse({
      kind: "github",
      owner: "",
      repo: "api",
      number: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a GitHub identifier with an empty repo string", () => {
    const result = GitHubPRIdentifierSchema.safeParse({
      kind: "github",
      owner: "acme",
      repo: "",
      number: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a GitHub identifier with a non-positive PR number", () => {
    const result = GitHubPRIdentifierSchema.safeParse({
      kind: "github",
      owner: "acme",
      repo: "api",
      number: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an ADO identifier with a non-positive pullRequestId", () => {
    const result = AdoPRIdentifierSchema.safeParse({
      kind: "ado",
      org: "myorg",
      project: "myproject",
      repo: "myrepo",
      pullRequestId: -1,
    });
    expect(result.success).toBe(false);
  });
});
