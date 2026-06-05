/**
 * Unit tests for `createAdoVcsProvider` — the ADR-34 multi-call diff
 * orchestration.
 *
 * Uses a fake `HttpClient` that records every `.get()` call and returns
 * configurable responses per URL pattern. No real HTTP is made.
 */
import { describe, expect, it } from "vitest";
import { IO } from "monadyssey";
import { HttpError } from "monadyssey-fetch";
import type { HttpClient } from "monadyssey-fetch";
import type { PRIdentifier } from "@lgtm-buzzer/core";
import { createAdoVcsProvider, ADAPTER_ID } from "./provider.js";

// ---------------------------------------------------------------------------
// Fixtures — synthetic ADO 7.1 response shapes
// ---------------------------------------------------------------------------

/** Minimal iterations response with one iteration (id=2). */
const ITERATIONS_RESPONSE = JSON.stringify({
  value: [{ id: 1 }, { id: 2 }],
  count: 2,
});

/** Changes response with one edited text file and one binary file. */
const CHANGES_RESPONSE = JSON.stringify({
  changeEntries: [
    {
      changeType: "edit",
      item: {
        path: "/src/foo.ts",
        objectId: "newblob1",
        originalObjectId: "oldblob1",
        gitObjectType: "blob",
      },
    },
    {
      changeType: "add",
      item: {
        path: "/assets/logo.png",
        objectId: "binblob",
        gitObjectType: "blob",
        contentMetadata: { isBinary: true },
      },
    },
  ],
});

/** Changes response with two edited text files (for multi-blob test). */
const CHANGES_RESPONSE_TWO_FILES = JSON.stringify({
  changeEntries: [
    {
      changeType: "edit",
      item: {
        path: "/src/file1.ts",
        objectId: "new1",
        originalObjectId: "old1",
      },
    },
    {
      changeType: "edit",
      item: {
        path: "/src/file2.ts",
        objectId: "new2",
        originalObjectId: "old2",
      },
    },
  ],
});

/** Old content for blob old1. */
const OLD_CONTENT_1 = "const x = 1;\n";
/** New content for blob new1. */
const NEW_CONTENT_1 = "const x = 2;\n";

/** Old content for blob old2. */
const OLD_CONTENT_2 = "const y = 1;\n";
/** New content for blob new2. */
const NEW_CONTENT_2 = "const y = 99;\n";

// ---------------------------------------------------------------------------
// Fake HttpClient helpers
// ---------------------------------------------------------------------------

type GetCall = { readonly uri: string };

/**
 * A configurable fake `HttpClient` that maps URL substrings to response IOs.
 * The `calls` array records every `.get()` invocation in order.
 *
 * Matching: iterates `routes` in order; first match wins. Falls back to
 * a 404 error IO for unmatched URLs.
 */
const makeFakeClient = (
  routes: Array<{
    match: (uri: string) => boolean;
    io: IO<HttpError, Response>;
  }>,
): { client: HttpClient; calls: GetCall[] } => {
  const calls: GetCall[] = [];
  const client = {
    get: (uri: string): IO<HttpError, Response> => {
      calls.push({ uri });
      const route = routes.find((r) => r.match(uri));
      if (route !== undefined) return route.io;
      // Fallback: 404
      return IO.fail<HttpError, Response>(
        new HttpError(404, "Not Found", null, uri),
      );
    },
  } as unknown as HttpClient;
  return { client, calls };
};

/** Creates a fake `Response` with a given text body and status. */
const makeResponse = (body: string, status = 200): Response =>
  ({
    status,
    text: () => Promise.resolve(body),
  }) as unknown as Response;

/** IO that succeeds with the given body. */
const okIO = (body: string): IO<HttpError, Response> =>
  IO.lift<HttpError, Response>(() => makeResponse(body));

/** IO that fails with an HttpError at the given status. */
const errIO = (status: number): IO<HttpError, Response> =>
  IO.fail<HttpError, Response>(
    new HttpError(status, `HTTP ${status}`, null, "https://dev.azure.com/..."),
  );

/** ADO PR identifier factory. */
const adoPR = (pullRequestId = 42): Extract<PRIdentifier, { kind: "ado" }> => ({
  kind: "ado",
  org: "my-org",
  project: "my-project",
  repo: "my-repo",
  pullRequestId,
});

const githubPR: Extract<PRIdentifier, { kind: "github" }> = {
  kind: "github",
  owner: "tibtof",
  repo: "lgtm-buzzer",
  number: 37,
};

// ---------------------------------------------------------------------------
// Standard routes for happy-path tests
// ---------------------------------------------------------------------------

const happyRoutes = (
  opts: {
    changesBody?: string;
    oldBlobBody?: string;
    newBlobBody?: string;
    oldBlob2Body?: string;
    newBlob2Body?: string;
  } = {},
) => [
  {
    match: (u: string) => u.includes("/iterations?"),
    io: okIO(ITERATIONS_RESPONSE),
  },
  {
    match: (u: string) => u.includes("/iterations/2/changes"),
    io: okIO(opts.changesBody ?? CHANGES_RESPONSE),
  },
  {
    match: (u: string) => u.includes("/blobs/oldblob1"),
    io: okIO(opts.oldBlobBody ?? OLD_CONTENT_1),
  },
  {
    match: (u: string) => u.includes("/blobs/newblob1"),
    io: okIO(opts.newBlobBody ?? NEW_CONTENT_1),
  },
  {
    match: (u: string) => u.includes("/blobs/old1"),
    io: okIO(opts.oldBlob2Body ?? OLD_CONTENT_1),
  },
  {
    match: (u: string) => u.includes("/blobs/new1"),
    io: okIO(opts.newBlob2Body ?? NEW_CONTENT_1),
  },
  {
    match: (u: string) => u.includes("/blobs/old2"),
    io: okIO(OLD_CONTENT_2),
  },
  {
    match: (u: string) => u.includes("/blobs/new2"),
    io: okIO(NEW_CONTENT_2),
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createAdoVcsProvider", () => {
  // -------------------------------------------------------------------------
  // Case #10 — provider identity
  // -------------------------------------------------------------------------
  it("case #10 — provider.id equals 'ado'", () => {
    const { client } = makeFakeClient([]);
    const provider = createAdoVcsProvider({
      config: { token: "ado_pat_test" },
      httpClient: client,
    });
    expect(provider.id).toBe("ado");
    expect(provider.id).toBe(ADAPTER_ID);
  });

  // -------------------------------------------------------------------------
  // Case #1 — happy path
  // -------------------------------------------------------------------------
  it("case #1 — happy path: returns Ok(Diff) with a unified diff containing the changed file", async () => {
    const { client } = makeFakeClient(happyRoutes());
    const provider = createAdoVcsProvider({
      config: { token: "ado_pat_test" },
      httpClient: client,
    });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();

    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      // Must contain a hunk header and the changed content.
      expect(result.value).toContain("@@");
      expect(result.value).toContain("diff --git");
      expect(result.value).toContain("src/foo.ts");
    }
  });

  // -------------------------------------------------------------------------
  // Case #2 — BINDING: exact endpoint allowlist
  // -------------------------------------------------------------------------
  it("case #2 — BINDING: recorded GET URIs match ONLY iterations/changes/blobs; iterations and changes each exactly once", async () => {
    const { client, calls } = makeFakeClient(happyRoutes());
    const provider = createAdoVcsProvider({
      config: { token: "ado_pat_test" },
      httpClient: client,
    });

    await provider.fetchDiff(adoPR()).unsafeRun();

    // Positive allowlist: every call must match one of the three families.
    const iterationsPattern = /\/pullRequests\/\d+\/iterations\?/;
    const changesPattern = /\/pullRequests\/\d+\/iterations\/\d+\/changes\?/;
    const blobsPattern = /\/blobs\/[^/?]+\?/;

    for (const call of calls) {
      const allowed =
        iterationsPattern.test(call.uri) ||
        changesPattern.test(call.uri) ||
        blobsPattern.test(call.uri);
      expect(allowed).toBe(true);
    }

    // Iterations and changes each appear exactly once.
    const iterationsCalls = calls.filter((c) => iterationsPattern.test(c.uri));
    const changesCalls = calls.filter((c) => changesPattern.test(c.uri));
    expect(iterationsCalls).toHaveLength(1);
    expect(changesCalls).toHaveLength(1);

    // Forbidden endpoint families must never appear.
    const forbidden = ["/threads", "/comments", "/workItems", "/workitems",
      "/reviewers", "/votes", "/policy", "diffs/commits"];
    for (const call of calls) {
      for (const f of forbidden) {
        expect(call.uri).not.toContain(f);
      }
    }

    // The PR metadata root endpoint must not appear (carries description/title).
    // Positive check: every pull-request call must include /iterations in the path.
    const prCalls = calls.filter((c) => c.uri.includes("/pullRequests/"));
    for (const c of prCalls) {
      expect(c.uri).toMatch(/\/pullRequests\/\d+\/iterations/);
    }
  });

  // -------------------------------------------------------------------------
  // Case #3 — PAT not in error payloads across multi-call paths
  // -------------------------------------------------------------------------
  it("case #3 — BINDING: PAT not in error detail on iterations 401", async () => {
    const sensitiveToken = "ado_secret_pat_CANARY_TOKEN_abc123";
    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: errIO(401) },
    ]);
    const provider = createAdoVcsProvider({
      config: { token: sensitiveToken },
      httpClient: client,
    });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      const detail = (result.error as { detail?: string }).detail ?? "";
      const raw = (result.error as { raw?: string }).raw ?? "";
      expect(detail).not.toContain(sensitiveToken);
      expect(raw).not.toContain(sensitiveToken);
    }
  });

  it("case #3b — PAT not in error detail on changes 401", async () => {
    const sensitiveToken = "ado_secret_pat_CANARY_TOKEN_xyz789";
    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u) => u.includes("/changes"), io: errIO(401) },
    ]);
    const provider = createAdoVcsProvider({
      config: { token: sensitiveToken },
      httpClient: client,
    });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      const detail = (result.error as { detail?: string }).detail ?? "";
      expect(detail).not.toContain(sensitiveToken);
    }
  });

  it("case #3c — PAT not in error detail on blob 401", async () => {
    const sensitiveToken = "ado_secret_pat_CANARY_blob_404";
    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u) => u.includes("/changes"), io: okIO(CHANGES_RESPONSE) },
      { match: (u) => u.includes("/blobs/"), io: errIO(401) },
    ]);
    const provider = createAdoVcsProvider({
      config: { token: sensitiveToken },
      httpClient: client,
    });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      const detail = (result.error as { detail?: string }).detail ?? "";
      expect(detail).not.toContain(sensitiveToken);
    }
  });

  it("case #3d — wrong-VCS error detail does NOT contain the token", async () => {
    const sensitiveToken = "ado_secret_wrong_vcs_CANARY";
    const { client } = makeFakeClient([]);
    const provider = createAdoVcsProvider({
      config: { token: sensitiveToken },
      httpClient: client,
    });

    const result = await provider.fetchDiff(githubPR as PRIdentifier).unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      const detail = (result.error as { detail?: string }).detail ?? "";
      expect(detail).not.toContain(sensitiveToken);
    }
  });

  // -------------------------------------------------------------------------
  // Case #4 — HTTP error codes per leg
  // -------------------------------------------------------------------------
  it("case #4a — 404 on iterations → transport { status: 404 }", async () => {
    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: errIO(404) },
    ]);
    const provider = createAdoVcsProvider({
      config: { token: "tok" },
      httpClient: client,
    });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({ kind: "transport", status: 404 }),
      }),
    );
  });

  it("case #4b — 401 on changes → transport { status: 401 }", async () => {
    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u) => u.includes("/changes"), io: errIO(401) },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({ kind: "transport", status: 401 }),
      }),
    );
  });

  it("case #4c — 429 on blob → transport { status: 429 }", async () => {
    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u) => u.includes("/changes"), io: okIO(CHANGES_RESPONSE) },
      { match: (u) => u.includes("/blobs/"), io: errIO(429) },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({ kind: "transport", status: 429 }),
      }),
    );
  });

  it("case #4d — 500 on iterations → transport { status: 500 }", async () => {
    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: errIO(500) },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({ kind: "transport", status: 500 }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Case #5 — network failure
  // -------------------------------------------------------------------------
  it("case #5 — network failure (status 0) on iterations → transport without status", async () => {
    const { client } = makeFakeClient([
      {
        match: (u) => u.includes("/iterations?"),
        io: IO.fail<HttpError, Response>(
          new HttpError(0, "fetch failed", null, "https://dev.azure.com/..."),
        ),
      },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("transport");
      expect("status" in result.error).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // Case #6 — empty iterations
  // -------------------------------------------------------------------------
  it("case #6 — empty iterations.value → malformed-response { detail: 'ado-no-iterations' }", async () => {
    const { client } = makeFakeClient([
      {
        match: (u) => u.includes("/iterations?"),
        io: okIO(JSON.stringify({ value: [], count: 0 })),
      },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({
          kind: "malformed-response",
          detail: "ado-no-iterations",
        }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Case #7 — 2 MiB cap (incremental, short-circuit)
  // -------------------------------------------------------------------------
  it("case #7 — 2 MiB cap: oversize file → malformed-response { detail: 'diff-too-large: ...' } and chain short-circuits", async () => {
    // Build a changes response with two text files.
    const changesBody = JSON.stringify({
      changeEntries: [
        {
          changeType: "edit",
          item: { path: "/src/big.ts", objectId: "newBig", originalObjectId: "oldBig" },
        },
        {
          changeType: "edit",
          item: { path: "/src/small.ts", objectId: "newSmall", originalObjectId: "oldSmall" },
        },
      ],
    });

    // Old and new content differ (so a real diff is produced).
    // Combined rendered section will exceed the 100-byte cap: the diff header alone
    // is ~70 bytes, and the hunk lines add another ~100+ bytes from the changed line.
    const oldBigContent = "x".repeat(100) + "\n";
    const newBigContent = "y".repeat(100) + "\n";

    const callLog: string[] = [];
    const routes = [
      { match: (u: string) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u: string) => u.includes("/changes"), io: okIO(changesBody) },
      {
        match: (u: string) => u.includes("/blobs/oldBig"),
        io: IO.lift<HttpError, Response>(() => {
          callLog.push("oldBig");
          return makeResponse(oldBigContent);
        }),
      },
      {
        match: (u: string) => u.includes("/blobs/newBig"),
        io: IO.lift<HttpError, Response>(() => {
          callLog.push("newBig");
          return makeResponse(newBigContent);
        }),
      },
      {
        match: (u: string) => u.includes("/blobs/oldSmall"),
        io: IO.lift<HttpError, Response>(() => {
          callLog.push("oldSmall");
          return makeResponse("tiny\n");
        }),
      },
      {
        match: (u: string) => u.includes("/blobs/newSmall"),
        io: IO.lift<HttpError, Response>(() => {
          callLog.push("newSmall");
          return makeResponse("tiny\n");
        }),
      },
    ];

    const { client } = makeFakeClient(routes);
    const provider = createAdoVcsProvider({
      // 100-byte cap to trigger on the first file's diff section.
      config: { token: "tok", maxBytes: 100 },
      httpClient: client,
    });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();

    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("malformed-response");
      if (result.error.kind === "malformed-response") {
        expect(result.error.detail).toMatch(/^diff-too-large:/);
      }
    }

    // Short-circuit: blobs for the second file must NOT have been fetched.
    expect(callLog).not.toContain("oldSmall");
    expect(callLog).not.toContain("newSmall");
  });

  // -------------------------------------------------------------------------
  // Case #8 — per-file failure: all-or-nothing
  // -------------------------------------------------------------------------
  it("case #8 — blob failure mid-chain: whole fetchDiff fails, no partial diff, later blobs not fetched", async () => {
    const callLog: string[] = [];
    const routes = [
      { match: (u: string) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u: string) => u.includes("/changes"), io: okIO(CHANGES_RESPONSE_TWO_FILES) },
      {
        match: (u: string) => u.includes("/blobs/old1"),
        io: IO.lift<HttpError, Response>(() => {
          callLog.push("old1");
          return makeResponse(OLD_CONTENT_1);
        }),
      },
      {
        match: (u: string) => u.includes("/blobs/new1"),
        io: IO.lift<HttpError, Response>(() => {
          callLog.push("new1");
          // Simulate a 500 on the new-side blob for file #1.
          throw new HttpError(500, "Internal Server Error", null, "");
        }),
      },
      {
        match: (u: string) => u.includes("/blobs/old2"),
        io: IO.lift<HttpError, Response>(() => {
          callLog.push("old2-SHOULD-NOT-BE-CALLED");
          return makeResponse(OLD_CONTENT_2);
        }),
      },
      {
        match: (u: string) => u.includes("/blobs/new2"),
        io: IO.lift<HttpError, Response>(() => {
          callLog.push("new2-SHOULD-NOT-BE-CALLED");
          return makeResponse(NEW_CONTENT_2);
        }),
      },
    ];

    const { client } = makeFakeClient(routes);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();

    // Whole operation must fail.
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("transport");
    }

    // File #2's blobs must not have been fetched.
    expect(callLog).not.toContain("old2-SHOULD-NOT-BE-CALLED");
    expect(callLog).not.toContain("new2-SHOULD-NOT-BE-CALLED");
  });

  // -------------------------------------------------------------------------
  // Case #9 — binary file: stub emitted, blob URLs not called
  // -------------------------------------------------------------------------
  it("case #9 — binary file: stub emitted, binary blob URLs NOT in call list", async () => {
    const { client, calls } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u) => u.includes("/changes"), io: okIO(CHANGES_RESPONSE) },
      // Provide text blob responses for the non-binary file.
      { match: (u) => u.includes("/blobs/oldblob1"), io: okIO(OLD_CONTENT_1) },
      { match: (u) => u.includes("/blobs/newblob1"), io: okIO(NEW_CONTENT_1) },
      // binblob should never be called.
      {
        match: (u) => u.includes("/blobs/binblob"),
        io: IO.fail<HttpError, Response>(
          new HttpError(500, "SHOULD NOT BE CALLED", null, ""),
        ),
      },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();

    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      // Binary stub must appear in the diff.
      expect(result.value).toContain("Binary files a/assets/logo.png and b/assets/logo.png differ");
    }

    // Binary blob URL must not appear in call list.
    const binaryBlobCalls = calls.filter((c) => c.uri.includes("binblob"));
    expect(binaryBlobCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Case #10 (already covered above) + wrong-VCS guard
  // -------------------------------------------------------------------------
  it("case #10b — wrong-VCS guard: GitHub identifier returns transport { detail: 'wrong-vcs' } without HTTP call", async () => {
    const { client, calls } = makeFakeClient([]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(githubPR as PRIdentifier).unsafeRun();

    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({ kind: "transport", detail: "wrong-vcs" }),
      }),
    );
    expect(calls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Case #11 — cancellation
  // -------------------------------------------------------------------------
  it("case #11 — cancellation: cancel mid-chain aborts in-flight get; Diff is never produced", async () => {
    // The blob call is a never-resolving IO that respects AbortSignal.
    const cancellableNeverIO: IO<HttpError, Response> = IO.cancellable<HttpError, Response>(
      (signal) =>
        new Promise<Response>((resolve) => {
          signal.addEventListener("abort", () => resolve(makeResponse("")), { once: true });
          // Never resolves on its own.
        }),
    );

    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u) => u.includes("/changes"), io: okIO(CHANGES_RESPONSE) },
      // Blob call hangs until cancelled.
      { match: (u) => u.includes("/blobs/"), io: cancellableNeverIO },
    ]);
    const provider = createAdoVcsProvider({
      config: { token: "tok", timeoutMs: 60_000 },
      httpClient: client,
    });

    const fetchIO = provider.fetchDiff(adoPR());
    const forkResult = await fetchIO.fork().unsafeRun();
    if (forkResult.type !== "Ok") throw new Error("fork failed unexpectedly");
    const fiber = forkResult.value;

    await fiber.cancel();
    const joinResult = await fiber.join();

    // Outcome must be Cancelled — never Err<VCSProviderError>.
    expect(joinResult.type).toBe("Cancelled");
  }, 10_000);

  // -------------------------------------------------------------------------
  // Additional edge cases
  // -------------------------------------------------------------------------
  it("iterations body fails JSON.parse → malformed-response { detail: 'ado-bad-iterations-response' }", async () => {
    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO("not-json") },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({
          kind: "malformed-response",
          detail: "ado-bad-iterations-response",
        }),
      }),
    );
  });

  it("iterations body fails zod schema → malformed-response { detail: 'ado-bad-iterations-response' }", async () => {
    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO(JSON.stringify({ unexpected: "shape" })) },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({
          kind: "malformed-response",
          detail: "ado-bad-iterations-response",
        }),
      }),
    );
  });

  it("changes body fails JSON.parse → malformed-response { detail: 'ado-bad-changes-response' }", async () => {
    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u) => u.includes("/changes"), io: okIO("not-json-changes") },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({
          kind: "malformed-response",
          detail: "ado-bad-changes-response",
        }),
      }),
    );
  });

  it("changes body fails zod schema → malformed-response { detail: 'ado-bad-changes-response' }", async () => {
    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u) => u.includes("/changes"), io: okIO(JSON.stringify({ wrong: "key" })) },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();
    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({
          kind: "malformed-response",
          detail: "ado-bad-changes-response",
        }),
      }),
    );
  });

  it("pickLatestIteration: picks the iteration with the maximum id", async () => {
    const { client, calls } = makeFakeClient([
      {
        match: (u) => u.includes("/iterations?"),
        io: okIO(JSON.stringify({ value: [{ id: 1 }, { id: 5 }, { id: 3 }], count: 3 })),
      },
      { match: (u) => u.includes("/iterations/5/changes"), io: okIO(JSON.stringify({ changeEntries: [] })) },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    await provider.fetchDiff(adoPR()).unsafeRun();

    // Leg 2 must use iteration id 5 (max).
    const changesCalls = calls.filter((c) => c.uri.includes("/iterations/") && c.uri.includes("/changes"));
    expect(changesCalls).toHaveLength(1);
    expect(changesCalls[0]?.uri).toContain("/iterations/5/changes");
  });

  it("config with all optional fields provided constructs without error", () => {
    expect(() =>
      createAdoVcsProvider({
        config: {
          token: "ado_pat_test",
          baseUrl: "https://ado.example.com/tfs",
          timeoutMs: 5_000,
          maxBytes: 1024,
          userAgent: "custom-agent/1.0",
        },
      }),
    ).not.toThrow();
  });

  it("happy path with no file changes (empty changeEntries) returns Ok with empty diff", async () => {
    const emptyChanges = JSON.stringify({ changeEntries: [] });
    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u) => u.includes("/changes"), io: okIO(emptyChanges) },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();
    // Empty diff is valid (looksLikeUnifiedDiff("") === true).
    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      expect(result.value).toBe("");
    }
  });

  // -------------------------------------------------------------------------
  // Live-API shape: delete entry with item.path null
  // -------------------------------------------------------------------------
  it("live-API delete entry (item.path null, originalPath set) → diff headed by originalPath", async () => {
    // Verified real delete shape from Hackathon-2021/Battleship PR #82:
    // item.path is explicitly null; originalPath carries the removed file's path.
    const deletedFilePath = "/server-webflux/src/main/resources/shapes/square.txt";
    const changesWithDelete = JSON.stringify({
      changeEntries: [
        {
          changeTrackingId: 13,
          originalPath: deletedFilePath,
          changeId: 13,
          item: { originalObjectId: "AE82abc", path: null },
          changeType: "delete",
        },
      ],
    });

    const { client, calls } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u) => u.includes("/changes"), io: okIO(changesWithDelete) },
      {
        match: (u) => u.includes("/blobs/AE82abc"),
        io: okIO("line1\nline2\n"),
      },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();

    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      // The diff must reference the original path (without leading slash).
      expect(result.value).toContain("server-webflux/src/main/resources/shapes/square.txt");
      // Must look like a real unified diff.
      expect(result.value).toContain("diff --git");
    }

    // The old-side blob was fetched (delete = old content → empty).
    const blobCalls = calls.filter((c) => c.uri.includes("/blobs/"));
    expect(blobCalls).toHaveLength(1);
    expect(blobCalls[0]?.uri).toContain("AE82abc");
  });

  it("live-API delete entry: no new-side blob URL is called", async () => {
    const changesWithDelete = JSON.stringify({
      changeEntries: [
        {
          changeType: "delete",
          item: { path: null, originalObjectId: "oldSideBlob" },
          originalPath: "/src/deleted.ts",
        },
      ],
    });

    const { client, calls } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u) => u.includes("/changes"), io: okIO(changesWithDelete) },
      { match: (u) => u.includes("/blobs/oldSideBlob"), io: okIO("old content\n") },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    await provider.fetchDiff(adoPR()).unsafeRun();

    // Only the old-side blob should be fetched; no new-side blob exists for a delete.
    const blobCalls = calls.filter((c) => c.uri.includes("/blobs/"));
    expect(blobCalls).toHaveLength(1);
    expect(blobCalls[0]?.uri).toContain("oldSideBlob");
  });

  // -------------------------------------------------------------------------
  // NUL-byte binary detection (Fix C — primary live-API binary path)
  // -------------------------------------------------------------------------
  it("NUL-byte in new-side blob content → binary stub emitted, not line diff", async () => {
    // contentMetadata is absent (live-API norm). Binary detection MUST use NUL heuristic.
    const changesNoBinaryMeta = JSON.stringify({
      changeEntries: [
        {
          changeType: "edit",
          item: {
            path: "/assets/photo.jpg",
            objectId: "newBinBlob",
            originalObjectId: "oldBinBlob",
            // No contentMetadata — live-API norm
          },
        },
      ],
    });

    const binaryContent = "JPEG\xff\xfe\0some binary data";

    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u) => u.includes("/changes"), io: okIO(changesNoBinaryMeta) },
      { match: (u) => u.includes("/blobs/oldBinBlob"), io: okIO("normal text\n") },
      { match: (u) => u.includes("/blobs/newBinBlob"), io: okIO(binaryContent) },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();

    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      // Must emit binary stub, not line-by-line diff.
      expect(result.value).toContain(
        "Binary files a/assets/photo.jpg and b/assets/photo.jpg differ",
      );
      // Must NOT contain the raw binary content in the diff.
      expect(result.value).not.toContain("JPEG");
    }
  });

  it("NUL-byte in old-side blob content → binary stub emitted", async () => {
    const changesNoBinaryMeta = JSON.stringify({
      changeEntries: [
        {
          changeType: "edit",
          item: {
            path: "/lib/native.so",
            objectId: "newSoBlob",
            originalObjectId: "oldSoBlob",
          },
        },
      ],
    });

    // Old side has NUL byte.
    const oldBinaryContent = "ELF\0binary data here";

    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u) => u.includes("/changes"), io: okIO(changesNoBinaryMeta) },
      { match: (u) => u.includes("/blobs/oldSoBlob"), io: okIO(oldBinaryContent) },
      { match: (u) => u.includes("/blobs/newSoBlob"), io: okIO("also binary\0x") },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();

    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      expect(result.value).toContain(
        "Binary files a/lib/native.so and b/lib/native.so differ",
      );
    }
  });

  it("text blobs without NUL bytes do NOT trigger binary stub", async () => {
    const changesNoBinaryMeta = JSON.stringify({
      changeEntries: [
        {
          changeType: "edit",
          item: {
            path: "/src/service.ts",
            objectId: "newTextBlob",
            originalObjectId: "oldTextBlob",
          },
        },
      ],
    });

    const { client } = makeFakeClient([
      { match: (u) => u.includes("/iterations?"), io: okIO(ITERATIONS_RESPONSE) },
      { match: (u) => u.includes("/changes"), io: okIO(changesNoBinaryMeta) },
      { match: (u) => u.includes("/blobs/oldTextBlob"), io: okIO("const x = 1;\n") },
      { match: (u) => u.includes("/blobs/newTextBlob"), io: okIO("const x = 2;\n") },
    ]);
    const provider = createAdoVcsProvider({ config: { token: "tok" }, httpClient: client });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();

    expect(result.type).toBe("Ok");
    if (result.type === "Ok") {
      // Must NOT emit binary stub; must contain actual diff hunks.
      expect(result.value).not.toContain("Binary files");
      expect(result.value).toContain("@@");
      expect(result.value).toContain("src/service.ts");
    }
  });
});
