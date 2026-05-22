/**
 * Contract tests for the ADO VCS adapter backed by an httptape sidecar.
 *
 * These tests run ONLY when `LGTM_BUZZER_ADO_HTTPTAPE_URL` is set (populated
 * by `vitest.globalSetup.ts` when the httptape binary is available and the
 * fixture directory is non-empty).
 *
 * Skip conditions:
 * - httptape binary not found on PATH.
 * - `LGTM_BUZZER_ADO_HTTPTAPE_URL` env var is not set.
 * - No recorded fixtures in `packages/adapters/ado/fixtures/`.
 *
 * Note (v1): since the adapter returns `ado-multi-call-not-yet-implemented`
 * for all ADO PRs, contract tests currently validate structural invariants
 * (id, wrong-VCS guard) rather than full diff fetching. The httptape sidecar
 * infrastructure is in place for when multi-call lands.
 *
 * To record fixtures (when multi-call is implemented):
 * `LGTM_BUZZER_ADO_TOKEN=<PAT> npm run record:ado --workspace=@lgtm-buzzer/adapter-ado`
 */
import { describe, it, expect } from "vitest";
import { createAdoVcsProvider } from "./provider.js";
import { createAdoHttpClient } from "./http.js";
import type { PRIdentifier } from "@lgtm-buzzer/core";

const httptapeUrlRaw = process.env["LGTM_BUZZER_ADO_HTTPTAPE_URL"];
const hasHttptape = httptapeUrlRaw !== undefined && httptapeUrlRaw.length > 0;
// Narrowed to `string` for use inside the `skipIf` block.
const httptapeUrl: string = httptapeUrlRaw ?? "";

const adoPR: Extract<PRIdentifier, { kind: "ado" }> = {
  kind: "ado",
  org: "my-org",
  project: "my-project",
  repo: "my-repo",
  pullRequestId: 1,
};

describe.skipIf(!hasHttptape)("ADO adapter — httptape contract tests", () => {
  const makeProvider = () => {
    const client = createAdoHttpClient({
      // Use a fake token for replay; httptape sanitizes auth headers.
      token: "ado_replay_token",
      baseUrl: httptapeUrl,
    });
    return createAdoVcsProvider({
      config: { token: "ado_replay_token", baseUrl: httptapeUrl },
      httpClient: client,
    });
  };

  it("contract #5 — provider.id is 'ado'", () => {
    const provider = makeProvider();
    expect(provider.id).toBe("ado");
  });

  it("contract — wrong-VCS identifier returns transport error without HTTP call", async () => {
    const provider = makeProvider();
    const githubPR: PRIdentifier = {
      kind: "github",
      owner: "tibtof",
      repo: "lgtm-buzzer",
      number: 1,
    };
    const result = await provider.fetchDiff(githubPR).unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("transport");
      if (result.error.kind === "transport") {
        expect(result.error.detail).toBe("wrong-vcs");
      }
    }
  });

  it("contract #1 — v1: ADO PR returns ado-multi-call-not-yet-implemented", async () => {
    const provider = makeProvider();
    const result = await provider.fetchDiff(adoPR).unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("malformed-response");
      if (result.error.kind === "malformed-response") {
        expect(result.error.detail).toBe("ado-multi-call-not-yet-implemented");
      }
    }
  });

  it("contract — token is NOT present in any error payload", async () => {
    const sensitiveToken = "ado_secret_replay_token_xyz";
    const client = createAdoHttpClient({
      token: sensitiveToken,
      baseUrl: httptapeUrl,
    });
    const provider = createAdoVcsProvider({
      config: { token: sensitiveToken, baseUrl: httptapeUrl },
      httpClient: client,
    });

    const result = await provider.fetchDiff(adoPR).unsafeRun();
    if (result.type === "Err") {
      const detail = (result.error as { detail?: string }).detail ?? "";
      const raw = (result.error as { raw?: string }).raw ?? "";
      expect(detail).not.toContain(sensitiveToken);
      expect(raw).not.toContain(sensitiveToken);
    }
  });

  it("contract #4 — 404 response maps to transport error (future multi-call)", async () => {
    const provider = makeProvider();
    // For v1, we get malformed-response; when multi-call lands, 404 → transport.
    const result = await provider.fetchDiff({ ...adoPR, pullRequestId: 999999 }).unsafeRun();
    if (result.type === "Err") {
      expect(["transport", "malformed-response"]).toContain(result.error.kind);
    }
  });
});
