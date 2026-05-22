import { describe, expect, it } from "vitest";
import { buildPullDiffUrl } from "./url.js";
import type { PRIdentifier } from "@lgtm-buzzer/core";

type AdoPR = Extract<PRIdentifier, { kind: "ado" }>;

const pr: AdoPR = {
  kind: "ado",
  org: "my-org",
  project: "my-project",
  repo: "my-repo",
  pullRequestId: 42,
};

describe("buildPullDiffUrl", () => {
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
