import { describe, expect, it } from "vitest";
import { detectPRPage } from "./page-detection.js";

describe("detectPRPage", () => {
  it("returns ok:true for a GitHub PR URL", () => {
    const result = detectPRPage("https://github.com/tibtof/lgtm-buzzer/pull/42");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok:true");
    expect(result.pr).toEqual({
      kind: "github",
      owner: "tibtof",
      repo: "lgtm-buzzer",
      number: 42,
    });
  });

  it("returns ok:true for an ADO dev.azure.com PR URL", () => {
    const result = detectPRPage(
      "https://dev.azure.com/my-org/My%20Project/_git/myrepo/pullrequest/7",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok:true");
    expect(result.pr).toEqual({
      kind: "ado",
      org: "my-org",
      project: "My Project",
      repo: "myrepo",
      pullRequestId: 7,
    });
  });

  it("returns ok:false for a GitHub issues URL (not a PR)", () => {
    const result = detectPRPage("https://github.com/tibtof/lgtm-buzzer/issues/42");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected ok:false");
    expect(result.error.kind).toBe("unsupported-url");
  });

  it("returns ok:false for a non-https URL", () => {
    const result = detectPRPage("http://github.com/tibtof/lgtm-buzzer/pull/42");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected ok:false");
    expect(result.error.kind).toBe("unsupported-url");
  });

  it("returns ok:true for a legacy ADO visualstudio.com PR URL", () => {
    const result = detectPRPage(
      "https://myorg.visualstudio.com/MyProj/_git/myrepo/pullrequest/3",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok:true");
    expect(result.pr).toEqual({
      kind: "ado",
      org: "myorg",
      project: "MyProj",
      repo: "myrepo",
      pullRequestId: 3,
    });
  });

  it("returns ok:true for a legacy ADO URL with percent-encoded project name", () => {
    const result = detectPRPage(
      "https://myorg.visualstudio.com/My%20Proj/_git/myrepo/pullrequest/3",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok:true");
    expect(result.pr).toMatchObject({
      kind: "ado",
      org: "myorg",
      repo: "myrepo",
      pullRequestId: 3,
    });
    // Project name should be decoded.
    if (result.pr.kind === "ado") {
      expect(result.pr.project).toBe("My Proj");
    }
  });

  it("returns ok:true for an ADO PR URL with trailing query string", () => {
    const result = detectPRPage(
      "https://dev.azure.com/my-org/MyProj/_git/myrepo/pullrequest/5?_a=files",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok:true");
    expect(result.pr).toMatchObject({
      kind: "ado",
      org: "my-org",
      project: "MyProj",
      repo: "myrepo",
      pullRequestId: 5,
    });
  });
});
