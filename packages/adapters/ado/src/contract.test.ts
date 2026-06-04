/**
 * Contract tests for the ADO VCS adapter backed by synthetic fixtures.
 *
 * ## Synthetic fixtures (ADR-34 §CRITICAL CONSTRAINT)
 *
 * We have no live ADO instance. These tests run against hand-authored JSON
 * fixtures that match the documented ADO REST API 7.1 response shapes. They
 * stand in for httptape-recorded fixtures until a live org is available.
 *
 * The `describe.skipIf(!hasHttptape)` guard is kept so that if a real
 * httptape server is started (e.g. in a future live-validation run), the
 * tests will exercise the real wire format too.
 *
 * ## When httptape is absent (the common case)
 *
 * An alternative `describe` block runs unconditionally with a fake
 * HttpClient replaying the synthetic fixture bodies. This ensures the
 * 5 contract scenarios are always exercised even without httptape.
 *
 * To record real fixtures (when a live ADO instance is available):
 * `LGTM_BUZZER_ADO_TOKEN=<PAT> npm run record:ado --workspace=@lgtm-buzzer/adapter-ado`
 */
import { describe, it, expect } from "vitest";
import { IO } from "monadyssey";
import { HttpError } from "monadyssey-fetch";
import type { HttpClient } from "monadyssey-fetch";
import { createAdoVcsProvider } from "./provider.js";
import { createAdoHttpClient } from "./http.js";
import type { PRIdentifier } from "@lgtm-buzzer/core";

// ---------------------------------------------------------------------------
// Synthetic fixture data — hand-authored from ADO REST API 7.1 docs (ADR-34)
// ---------------------------------------------------------------------------

/**
 * Synthetic iterations response: two iterations, latest id=2.
 * Models: `GET …/pullRequests/{id}/iterations?api-version=7.1`
 */
const FIXTURE_ITERATIONS = JSON.stringify({
  value: [{ id: 1 }, { id: 2 }],
  count: 2,
});

/**
 * Synthetic changes response: one edited text file, one binary file.
 * Models: `GET …/iterations/2/changes?api-version=7.1&$top=10000&$compareTo=0`
 */
const FIXTURE_CHANGES = JSON.stringify({
  changeEntries: [
    {
      changeType: "edit",
      item: {
        path: "/src/index.ts",
        objectId: "newtextblob",
        originalObjectId: "oldtextblob",
        gitObjectType: "blob",
      },
    },
    {
      changeType: "add",
      item: {
        path: "/assets/logo.png",
        objectId: "binblob1",
        gitObjectType: "blob",
        contentMetadata: { isBinary: true },
      },
    },
  ],
});

/** Synthetic old blob content for `src/index.ts`. */
const FIXTURE_OLD_BLOB = 'export const greeting = "hello";\n';

/** Synthetic new blob content for `src/index.ts`. */
const FIXTURE_NEW_BLOB = 'export const greeting = "hello world";\n';


// ---------------------------------------------------------------------------
// Fake HttpClient for synthetic-fixture tests
// ---------------------------------------------------------------------------

type GetCall = { readonly uri: string };

const makeSyntheticClient = (
  scenarios: {
    iterationsBody?: string;
    iterationsStatus?: number;
    changesBody?: string;
    changesStatus?: number;
    blobBody?: string;
    blobStatus?: number;
  },
): { client: HttpClient; calls: GetCall[] } => {
  const calls: GetCall[] = [];
  const {
    iterationsBody = FIXTURE_ITERATIONS,
    iterationsStatus = 200,
    changesBody = FIXTURE_CHANGES,
    changesStatus = 200,
    blobBody = FIXTURE_NEW_BLOB,
    blobStatus = 200,
  } = scenarios;

  const makeResponse = (body: string, status: number): Response =>
    ({ status, text: () => Promise.resolve(body) }) as unknown as Response;

  const client = {
    get: (uri: string): IO<HttpError, Response> => {
      calls.push({ uri });
      if (uri.includes("/iterations?")) {
        if (iterationsStatus !== 200) {
          return IO.fail(new HttpError(iterationsStatus, `HTTP ${iterationsStatus}`, null, uri));
        }
        return IO.lift(() => makeResponse(iterationsBody, iterationsStatus));
      }
      if (uri.includes("/changes")) {
        if (changesStatus !== 200) {
          return IO.fail(new HttpError(changesStatus, `HTTP ${changesStatus}`, null, uri));
        }
        return IO.lift(() => makeResponse(changesBody, changesStatus));
      }
      if (uri.includes("/blobs/")) {
        if (blobStatus !== 200) {
          return IO.fail(new HttpError(blobStatus, `HTTP ${blobStatus}`, null, uri));
        }
        // Return old or new blob content based on the objectId in the URI.
        const body = uri.includes("oldtextblob") ? FIXTURE_OLD_BLOB : blobBody;
        return IO.lift(() => makeResponse(body, blobStatus));
      }
      return IO.fail(new HttpError(404, "Not Found", null, uri));
    },
  } as unknown as HttpClient;

  return { client, calls };
};

// ---------------------------------------------------------------------------
// PR fixture
// ---------------------------------------------------------------------------

const adoPR: Extract<PRIdentifier, { kind: "ado" }> = {
  kind: "ado",
  org: "my-org",
  project: "my-project",
  repo: "my-repo",
  pullRequestId: 1,
};

// ---------------------------------------------------------------------------
// httptape-gated contract tests (skipped when httptape is absent)
// ---------------------------------------------------------------------------

const httptapeUrlRaw = process.env["LGTM_BUZZER_ADO_HTTPTAPE_URL"];
const hasHttptape = httptapeUrlRaw !== undefined && httptapeUrlRaw.length > 0;
const httptapeUrl: string = httptapeUrlRaw ?? "";

describe.skipIf(!hasHttptape)("ADO adapter — httptape contract tests (synthetic fixtures)", () => {
  const makeProvider = () => {
    const client = createAdoHttpClient({
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

  it("contract #1 — happy path: fetchDiff returns Ok with a unified diff", async () => {
    const provider = makeProvider();
    const result = await provider.fetchDiff(adoPR).unsafeRun();
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      expect(result.value).toMatch(/diff --git |^--- /m);
    }
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

  it("contract — token is NOT present in any error payload", async () => {
    const sensitiveToken = "ado_secret_replay_token_xyz_CANARY";
    const client = createAdoHttpClient({
      token: sensitiveToken,
      baseUrl: httptapeUrl,
    });
    const provider = createAdoVcsProvider({
      config: { token: sensitiveToken, baseUrl: httptapeUrl },
      httpClient: client,
    });

    const result = await provider.fetchDiff({ ...adoPR, pullRequestId: 999999 }).unsafeRun();
    if (result.type === "Err") {
      const detail = (result.error as { detail?: string }).detail ?? "";
      const raw = (result.error as { raw?: string }).raw ?? "";
      expect(detail).not.toContain(sensitiveToken);
      expect(raw).not.toContain(sensitiveToken);
    }
  });

  it("contract #4 — 404 on iterations maps to transport error", async () => {
    const provider = makeProvider();
    const result = await provider.fetchDiff({ ...adoPR, pullRequestId: 999999 }).unsafeRun();
    if (result.type === "Err") {
      expect(["transport", "malformed-response"]).toContain(result.error.kind);
    }
  });
});

// ---------------------------------------------------------------------------
// Synthetic-fixture contract tests (always run — no httptape required)
// ---------------------------------------------------------------------------

describe("ADO adapter — synthetic-fixture contract tests (ADR-34)", () => {
  it("contract #5 — provider.id is 'ado'", () => {
    const { client } = makeSyntheticClient({});
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });
    expect(provider.id).toBe("ado");
  });

  it("contract #1 — happy path: fetchDiff returns Ok(Diff) with a unified diff", async () => {
    const { client } = makeSyntheticClient({});
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR).unsafeRun();

    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      // Must satisfy the looksLikeUnifiedDiff sniff (ADR-15).
      expect(result.value).toMatch(/^diff --git /m);
      // Must contain the changed file.
      expect(result.value).toContain("src/index.ts");
      // Must contain a hunk header.
      expect(result.value).toContain("@@");
      // Binary stub must appear for the binary file.
      expect(result.value).toContain("Binary files a/assets/logo.png and b/assets/logo.png differ");
    }
  });

  it("contract — wrong-VCS identifier returns transport { detail: 'wrong-vcs' } without HTTP call", async () => {
    const { client, calls } = makeSyntheticClient({});
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

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
    expect(calls).toHaveLength(0);
  });

  it("contract — token is NOT present in any error payload (404 scenario)", async () => {
    const sensitiveToken = "ado_secret_CANARY_TOKEN_contract";
    const { client } = makeSyntheticClient({ iterationsStatus: 404 });
    const provider = createAdoVcsProvider({ config: { token: sensitiveToken }, httpClient: client });

    const result = await provider.fetchDiff(adoPR).unsafeRun();

    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      const detail = (result.error as { detail?: string }).detail ?? "";
      const raw = (result.error as { raw?: string }).raw ?? "";
      expect(detail).not.toContain(sensitiveToken);
      expect(raw).not.toContain(sensitiveToken);
    }
  });

  it("contract #4 — 404 on iterations maps to transport { status: 404 }", async () => {
    const { client } = makeSyntheticClient({ iterationsStatus: 404 });
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR).unsafeRun();

    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({ kind: "transport", status: 404 }),
      }),
    );
  });
});
