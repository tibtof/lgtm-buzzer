import { describe, expect, it } from "vitest";
import { buildPullDiffUrl } from "./url.js";
import type { PRIdentifier } from "@lgtm-buzzer/core";

type GithubPR = Extract<PRIdentifier, { kind: "github" }>;

const pr: GithubPR = { kind: "github", owner: "tibtof", repo: "lgtm-buzzer", number: 37 };

describe("buildPullDiffUrl", () => {
  const cases: Array<{ name: string; baseUrl: string; pr: GithubPR; want: string }> = [
    {
      name: "happy path — standard base URL",
      baseUrl: "https://api.github.com",
      pr,
      want: "https://api.github.com/repos/tibtof/lgtm-buzzer/pulls/37",
    },
    {
      name: "trailing slash on baseUrl is stripped",
      baseUrl: "https://api.github.com/",
      pr,
      want: "https://api.github.com/repos/tibtof/lgtm-buzzer/pulls/37",
    },
    {
      name: "multiple trailing slashes are stripped",
      baseUrl: "https://api.github.com///",
      pr,
      want: "https://api.github.com/repos/tibtof/lgtm-buzzer/pulls/37",
    },
    {
      name: "owner and repo with special characters are percent-encoded",
      baseUrl: "https://api.github.com",
      pr: { kind: "github", owner: "my org", repo: "my repo", number: 1 },
      want: "https://api.github.com/repos/my%20org/my%20repo/pulls/1",
    },
    {
      name: "custom baseUrl with port (GitHub Enterprise)",
      baseUrl: "https://ghe.example.com",
      pr,
      want: "https://ghe.example.com/repos/tibtof/lgtm-buzzer/pulls/37",
    },
    {
      name: "GitHub Enterprise with api/v3 path prefix",
      baseUrl: "https://ghe.example.com/api/v3",
      pr,
      want: "https://ghe.example.com/api/v3/repos/tibtof/lgtm-buzzer/pulls/37",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(buildPullDiffUrl(c.baseUrl, c.pr)).toBe(c.want);
    });
  }
});
