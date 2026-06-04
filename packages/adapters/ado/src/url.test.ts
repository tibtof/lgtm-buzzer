import { describe, expect, it } from "vitest";
import { buildPullDiffUrl, buildIterationsUrl, buildChangesUrl, buildBlobUrl } from "./url.js";
import type { PRIdentifier } from "@lgtm-buzzer/core";

type AdoPR = Extract<PRIdentifier, { kind: "ado" }>;

const pr: AdoPR = {
  kind: "ado",
  org: "my-org",
  project: "my-project",
  repo: "my-repo",
  pullRequestId: 42,
};

describe("buildPullDiffUrl (alias for buildIterationsUrl)", () => {
  const cases: Array<{ name: string; baseUrl: string; pr: AdoPR; want: string }> = [
    {
      name: "happy path — standard base URL",
      baseUrl: "https://dev.azure.com",
      pr,
      want: "https://dev.azure.com/my-org/my-project/_apis/git/repositories/my-repo/pullRequests/42/iterations?api-version=7.1",
    },
    {
      name: "trailing slash on baseUrl is stripped",
      baseUrl: "https://dev.azure.com/",
      pr,
      want: "https://dev.azure.com/my-org/my-project/_apis/git/repositories/my-repo/pullRequests/42/iterations?api-version=7.1",
    },
    {
      name: "multiple trailing slashes are stripped",
      baseUrl: "https://dev.azure.com///",
      pr,
      want: "https://dev.azure.com/my-org/my-project/_apis/git/repositories/my-repo/pullRequests/42/iterations?api-version=7.1",
    },
    {
      name: "org, project and repo with special characters are percent-encoded",
      baseUrl: "https://dev.azure.com",
      pr: { kind: "ado", org: "my org", project: "my project", repo: "my repo", pullRequestId: 1 },
      want: "https://dev.azure.com/my%20org/my%20project/_apis/git/repositories/my%20repo/pullRequests/1/iterations?api-version=7.1",
    },
    {
      name: "custom baseUrl (ADO Server on-premises)",
      baseUrl: "https://ado.example.com/tfs",
      pr,
      want: "https://ado.example.com/tfs/my-org/my-project/_apis/git/repositories/my-repo/pullRequests/42/iterations?api-version=7.1",
    },
    {
      name: "large pull request id",
      baseUrl: "https://dev.azure.com",
      pr: { ...pr, pullRequestId: 999999 },
      want: "https://dev.azure.com/my-org/my-project/_apis/git/repositories/my-repo/pullRequests/999999/iterations?api-version=7.1",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(buildPullDiffUrl(c.baseUrl, c.pr)).toBe(c.want);
    });
  }
});

describe("buildIterationsUrl", () => {
  it("is identical to buildPullDiffUrl", () => {
    expect(buildIterationsUrl("https://dev.azure.com", pr)).toBe(
      buildPullDiffUrl("https://dev.azure.com", pr),
    );
  });

  it("includes api-version=7.1", () => {
    const url = buildIterationsUrl("https://dev.azure.com", pr);
    expect(url).toContain("api-version=7.1");
  });
});

describe("buildChangesUrl", () => {
  it("includes iterationId in the path", () => {
    const url = buildChangesUrl("https://dev.azure.com", pr, 3);
    expect(url).toContain("/iterations/3/changes");
  });

  it("includes api-version=7.1", () => {
    const url = buildChangesUrl("https://dev.azure.com", pr, 1);
    expect(url).toContain("api-version=7.1");
  });

  it("includes $compareTo=0 query param", () => {
    const url = buildChangesUrl("https://dev.azure.com", pr, 1);
    expect(url).toContain("$compareTo=0");
  });

  it("includes $top=10000 query param", () => {
    const url = buildChangesUrl("https://dev.azure.com", pr, 1);
    expect(url).toContain("$top=10000");
  });

  it("percent-encodes special chars in org/project/repo", () => {
    const specialPr: AdoPR = {
      kind: "ado",
      org: "my org",
      project: "my project",
      repo: "my repo",
      pullRequestId: 5,
    };
    const url = buildChangesUrl("https://dev.azure.com", specialPr, 2);
    expect(url).toContain("my%20org");
    expect(url).toContain("my%20project");
    expect(url).toContain("my%20repo");
  });

  it("strips trailing slashes from baseUrl", () => {
    const url = buildChangesUrl("https://dev.azure.com///", pr, 1);
    expect(url).not.toMatch(/\/\/\//);
  });
});

describe("buildBlobUrl", () => {
  it("includes the objectId in the path", () => {
    const url = buildBlobUrl("https://dev.azure.com", pr, "abc1234567890");
    expect(url).toContain("/blobs/abc1234567890");
  });

  it("includes api-version=7.1", () => {
    const url = buildBlobUrl("https://dev.azure.com", pr, "blobid");
    expect(url).toContain("api-version=7.1");
  });

  it("includes $format=text", () => {
    const url = buildBlobUrl("https://dev.azure.com", pr, "blobid");
    expect(url).toContain("$format=text");
  });

  it("percent-encodes special chars in org/project/repo but NOT in objectId", () => {
    const specialPr: AdoPR = {
      kind: "ado",
      org: "my org",
      project: "my project",
      repo: "my repo",
      pullRequestId: 1,
    };
    const url = buildBlobUrl("https://dev.azure.com", specialPr, "deadbeef");
    expect(url).toContain("my%20org");
    expect(url).toContain("/blobs/deadbeef");
  });

  it("strips trailing slashes from baseUrl", () => {
    const url = buildBlobUrl("https://dev.azure.com/", pr, "x");
    expect(url).not.toContain("azure.com//");
  });

  it("URL structure: /{org}/{project}/_apis/git/repositories/{repo}/blobs/{objectId}", () => {
    const url = buildBlobUrl("https://dev.azure.com", pr, "blobid");
    expect(url).toBe(
      "https://dev.azure.com/my-org/my-project/_apis/git/repositories/my-repo/blobs/blobid?api-version=7.1&$format=text",
    );
  });
});
