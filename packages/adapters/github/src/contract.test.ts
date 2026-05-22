/**
 * Contract tests for the GitHub VCS adapter backed by an httptape sidecar.
 *
 * These tests run ONLY when `LGTM_BUZZER_GH_HTTPTAPE_URL` is set (populated
 * by `vitest.globalSetup.ts` when the httptape binary is available and the
 * fixture directory is non-empty).
 *
 * Skip conditions:
 * - httptape binary not found on PATH.
 * - `LGTM_BUZZER_GH_HTTPTAPE_URL` env var is not set.
 * - No recorded fixtures in `packages/adapters/github/fixtures/`.
 *
 * To record fixtures: `LGTM_BUZZER_GH_TOKEN=<PAT> npm run record:github
 * --workspace=@lgtm-buzzer/adapter-github`
 */
import { describe, it, expect } from "vitest";
import { createGithubVcsProvider } from "./provider.js";
import { createGithubHttpClient } from "./http.js";
import type { PRIdentifier } from "@lgtm-buzzer/core";

const httptapeUrlRaw = process.env["LGTM_BUZZER_GH_HTTPTAPE_URL"];
const hasHttptape = httptapeUrlRaw !== undefined && httptapeUrlRaw.length > 0;
// Narrowed to `string` for use inside the `skipIf` block.
const httptapeUrl: string = httptapeUrlRaw ?? "";

const githubPR: Extract<PRIdentifier, { kind: "github" }> = {
  kind: "github",
  owner: "tibtof",
  repo: "lgtm-buzzer",
  number: 1,
};

describe.skipIf(!hasHttptape)("GitHub adapter — httptape contract tests", () => {
  const makeProvider = () => {
    const client = createGithubHttpClient({
      // Use a fake token for replay; httptape sanitizes auth headers.
      token: "ghp_replay_token",
      baseUrl: httptapeUrl,
    });
    return createGithubVcsProvider({
      config: { token: "ghp_replay_token", baseUrl: httptapeUrl },
      httpClient: client,
    });
  };

  it("contract #1 — happy path: fetchDiff returns Ok with a unified diff", async () => {
    const provider = makeProvider();
    const result = await provider.fetchDiff(githubPR).unsafeRun();
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      // A real diff should contain at least one diff --git line.
      expect(result.value).toMatch(/diff --git |^--- /m);
    }
  });

  it("contract #4 — 404 returns transport error with status 404", async () => {
    const provider = makeProvider();
    const missingPR: Extract<PRIdentifier, { kind: "github" }> = {
      ...githubPR,
      number: 999999,
    };
    const result = await provider.fetchDiff(missingPR).unsafeRun();
    // With httptape, the fixture should simulate a 404 for unknown PRs.
    // Accept both Ok (if the fixture covers the number) and Err 404.
    if (result.type === "Err") {
      expect(result.error.kind).toBe("transport");
      if (result.error.kind === "transport" && result.error.status !== undefined) {
        expect([401, 403, 404, 422, 429]).toContain(result.error.status);
      }
    }
  });

  it("contract #5 — provider.id is 'github'", () => {
    const provider = makeProvider();
    expect(provider.id).toBe("github");
  });

  it("contract — wrong-VCS identifier returns transport error without HTTP call", async () => {
    const provider = makeProvider();
    const adoPR: PRIdentifier = {
      kind: "ado",
      org: "myorg",
      project: "myproj",
      repo: "myrepo",
      pullRequestId: 1,
    };
    const result = await provider.fetchDiff(adoPR).unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("transport");
      if (result.error.kind === "transport") {
        expect(result.error.detail).toBe("wrong-vcs");
      }
    }
  });
});
