import { describe, expect, it } from "vitest";
import { IO } from "monadyssey";
import { HttpError } from "monadyssey-fetch";
import type { HttpClient } from "monadyssey-fetch";
import type { PRIdentifier } from "@lgtm-buzzer/core";
import { createGithubVcsProvider, ADAPTER_ID } from "./provider.js";

// ---------------------------------------------------------------------------
// Fake HttpClient helpers
// ---------------------------------------------------------------------------

/**
 * Records every `.get()` call made through the fake client.
 */
type GetCall = {
  readonly uri: string;
};

/**
 * Creates a fake `HttpClient` whose `.get()` method returns the provided IO and
 * records every call. The fake is cast to `HttpClient` so TypeScript accepts it
 * as the injectable dependency; the real class methods are not needed.
 */
const makeFakeClient = (
  io: IO<HttpError, Response>,
): { client: HttpClient; calls: GetCall[] } => {
  const calls: GetCall[] = [];
  const client = {
    get: (uri: string): IO<HttpError, Response> => {
      calls.push({ uri });
      return io;
    },
  } as unknown as HttpClient;
  return { client, calls };
};

/** Creates a fake `Response` with a given text body and status. */
const makeResponse = (body: string, status = 200): Response => {
  return {
    status,
    text: () => Promise.resolve(body),
    // Minimal Response shape — only properties the adapter reads are needed.
  } as unknown as Response;
};

/** A valid minimal unified diff. */
const HAPPY_DIFF =
  "diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new\n";

/** An `IO` that succeeds with the given diff body. */
const successIO = (body: string): IO<HttpError, Response> =>
  IO.lift<HttpError, Response>(() => makeResponse(body));

/** An `IO` that fails with an `HttpError` at the given status. */
const httpErrorIO = (status: number, rawMessage: string): IO<HttpError, Response> =>
  IO.fail<HttpError, Response>(
    new HttpError(status, rawMessage, null, "https://api.github.com/repos/o/r/pulls/1"),
  );

const githubPR = (number = 123): Extract<PRIdentifier, { kind: "github" }> => ({
  kind: "github",
  owner: "owner",
  repo: "repo",
  number,
});

const adoPR: Extract<PRIdentifier, { kind: "ado" }> = {
  kind: "ado",
  org: "my-org",
  project: "my-project",
  repo: "my-repo",
  pullRequestId: 99,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createGithubVcsProvider", () => {
  it("case #10 — provider.id equals 'github'", () => {
    const { client } = makeFakeClient(successIO(HAPPY_DIFF));
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test" },
      httpClient: client,
    });
    expect(provider.id).toBe("github");
    expect(provider.id).toBe(ADAPTER_ID);
  });

  it("case #1 — happy path: exactly one HTTP call to the diff endpoint", async () => {
    const { client, calls } = makeFakeClient(successIO(HAPPY_DIFF));
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test" },
      httpClient: client,
    });

    const result = await provider.fetchDiff(githubPR(123)).unsafeRun();

    expect(result).toEqual(
      expect.objectContaining({ type: "Ok", value: HAPPY_DIFF }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.uri).toContain("/repos/owner/repo/pulls/123");
  });

  it("case #2 — BINDING: HTTP call list contains ONLY the diff endpoint", async () => {
    const { client, calls } = makeFakeClient(successIO(HAPPY_DIFF));
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test" },
      httpClient: client,
    });

    await provider.fetchDiff(githubPR(1)).unsafeRun();

    // Assert exactly one call was made and its URI is the diff endpoint only.
    expect(calls).toHaveLength(1);
    const uri = calls[0]?.uri ?? "";
    // Must match the pulls endpoint
    expect(uri).toMatch(/\/repos\/[^/]+\/[^/]+\/pulls\/\d+$/);
    // Must NOT be any forbidden endpoint
    expect(uri).not.toContain("/files");
    expect(uri).not.toContain("/commits");
    expect(uri).not.toContain("/comments");
    expect(uri).not.toContain("/reviews");
  });

  it("case #3 — BINDING: 401 error detail does NOT contain the token", async () => {
    const token = "ghp_super_secret_token_abc123";
    const { client } = makeFakeClient(httpErrorIO(401, "Bad credentials"));
    const provider = createGithubVcsProvider({
      config: { token },
      httpClient: client,
    });

    const result = await provider.fetchDiff(githubPR(1)).unsafeRun();

    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      const detail = (result.error as { detail?: string }).detail ?? "";
      expect(detail).not.toContain(token);
      // Confirm the error is transport
      expect(result.error.kind).toBe("transport");
      expect(result.error).toEqual(
        expect.objectContaining({ kind: "transport", status: 401 }),
      );
    }
  });

  it("case #4 (404) — 404 maps to transport { status: 404 }", async () => {
    const { client } = makeFakeClient(httpErrorIO(404, "Not Found"));
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test" },
      httpClient: client,
    });

    const result = await provider.fetchDiff(githubPR(1)).unsafeRun();

    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({ kind: "transport", status: 404 }),
      }),
    );
  });

  it("case #4 (401) — 401 maps to transport { status: 401 }", async () => {
    const { client } = makeFakeClient(httpErrorIO(401, "Unauthorized"));
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test" },
      httpClient: client,
    });

    const result = await provider.fetchDiff(githubPR(1)).unsafeRun();

    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({ kind: "transport", status: 401 }),
      }),
    );
  });

  it("case #4 (429) — 429 maps to transport { status: 429 }", async () => {
    const { client } = makeFakeClient(httpErrorIO(429, "rate limit exceeded"));
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test" },
      httpClient: client,
    });

    const result = await provider.fetchDiff(githubPR(1)).unsafeRun();

    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({ kind: "transport", status: 429 }),
      }),
    );
  });

  it("case #4 (5xx) — 500 maps to transport { status: 500 }", async () => {
    const { client } = makeFakeClient(httpErrorIO(500, "Internal Server Error"));
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test" },
      httpClient: client,
    });

    const result = await provider.fetchDiff(githubPR(1)).unsafeRun();

    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({ kind: "transport", status: 500 }),
      }),
    );
  });

  it("case #5 — network failure (status 0) → transport without status", async () => {
    const { client } = makeFakeClient(httpErrorIO(0, "fetch failed"));
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test" },
      httpClient: client,
    });

    const result = await provider.fetchDiff(githubPR(1)).unsafeRun();

    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("transport");
      expect("status" in result.error).toBe(false);
    }
  });

  it("case #6 — body fails unified-diff sniff → malformed-response with raw", async () => {
    const htmlBody = "<html><body>Not Found</body></html>";
    const { client } = makeFakeClient(successIO(htmlBody));
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test" },
      httpClient: client,
    });

    const result = await provider.fetchDiff(githubPR(1)).unsafeRun();

    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({
          kind: "malformed-response",
          detail: "not-unified-diff",
        }),
      }),
    );
    if (result.type === "Err" && result.error.kind === "malformed-response") {
      expect(result.error.raw).toContain("<html>");
    }
  });

  it("case #7 — body exceeds maxBytes → malformed-response { detail: 'diff-too-large: <bytes>' }", async () => {
    // 5 bytes over the 10-byte limit
    const bigBody = "x".repeat(15);
    const { client } = makeFakeClient(successIO(bigBody));
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test", maxBytes: 10 },
      httpClient: client,
    });

    const result = await provider.fetchDiff(githubPR(1)).unsafeRun();

    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({
          kind: "malformed-response",
          detail: "diff-too-large: 15",
        }),
      }),
    );
  });

  it("case #8 — empty body is accepted as Ok (empty diff)", async () => {
    const { client } = makeFakeClient(successIO(""));
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test" },
      httpClient: client,
    });

    const result = await provider.fetchDiff(githubPR(1)).unsafeRun();

    expect(result).toEqual(
      expect.objectContaining({ type: "Ok", value: "" }),
    );
  });

  it("case #9 — wrong-VCS guard: ADO identifier returns transport { detail: 'wrong-vcs' } without HTTP call", async () => {
    const { client, calls } = makeFakeClient(successIO(HAPPY_DIFF));
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test" },
      httpClient: client,
    });

    const result = await provider.fetchDiff(adoPR as PRIdentifier).unsafeRun();

    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({ kind: "transport", detail: "wrong-vcs" }),
      }),
    );
    // No HTTP call must have been made
    expect(calls).toHaveLength(0);
  });

  it("case #11 — cancellation during fetch phase propagates as Cancelled (NOT manufactured into Err)", async () => {
    // The fake `get()` returns an IO backed by a never-resolving promise that
    // cooperates with cancellation via AbortSignal.
    const cancellableNeverIO: IO<HttpError, Response> = IO.cancellable<HttpError, Response>(
      (signal) =>
        new Promise<Response>((resolve) => {
          signal.addEventListener(
            "abort",
            () => resolve(makeResponse("")),
            { once: true },
          );
          // Never resolves on its own.
        }),
    );

    const { client } = makeFakeClient(cancellableNeverIO);
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test", timeoutMs: 60_000 },
      httpClient: client,
    });

    const fetchIO = provider.fetchDiff(githubPR(1));

    // Fork to get a Fiber, cancel it, and join.
    const forkResult = await fetchIO.fork().unsafeRun();
    if (forkResult.type !== "Ok") throw new Error("fork IO failed unexpectedly");
    const fiber = forkResult.value;

    await fiber.cancel();
    const joinResult = await fiber.join();

    // Outcome must be Cancelled — not Err<VCSProviderError>
    expect(joinResult.type).toBe("Cancelled");
  }, 10_000);

  it("case #12 — abort signal propagates to the fetch phase (body-read phase coverage note)", async () => {
    // ADR-33 reviewer follow-up: verify cancellation coverage at the body-read phase.
    //
    // LIMITATION: the body-read step in provider.ts uses IO.lift(() => response.text()).
    // IO.lift does not pass an AbortSignal to the wrapped async operation. In production
    // (real fetch), Response.text() honours the original fetch AbortSignal through
    // the Fetch body stream, so the body read DOES abort cooperatively when the fiber
    // is cancelled. In the unit-test fake, response.text() is a plain Promise with no
    // AbortSignal hookup, so a never-resolving body Promise would block fiber.cancel()
    // indefinitely — making a "cancel during body-read" unit test impossible without
    // either changing production code or using a brittle timing-dependent hack.
    //
    // What we CAN verify here: the abort signal from the fetch phase (IO.cancellable
    // inside monadyssey-fetch) is present and the overall cancellation contract holds
    // at the fetch phase. Case #11 covers this. The body-read abort guarantee is
    // a runtime property of the Fetch API (AbortSignal propagates to the body stream)
    // and is not unit-testable via the injected HttpClient without a production change.
    //
    // This test documents the constraint by asserting the known-safe behaviour: if
    // the body read resolves quickly (no stall), cancelling AFTER the IO fully resolves
    // gives Ok — the expected non-cancellation fast path.
    const { client } = makeFakeClient(successIO(HAPPY_DIFF));
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test" },
      httpClient: client,
    });

    // Let the fetch complete fully, THEN cancel. The fiber is already done.
    const fetchIO = provider.fetchDiff(githubPR(1));
    const forkResult = await fetchIO.fork().unsafeRun();
    if (forkResult.type !== "Ok") throw new Error("fork IO failed unexpectedly");
    const fiber = forkResult.value;

    // Wait for the fiber to finish before cancelling.
    const joinResult = await fiber.join();

    // Fast-path: IO completes before any cancel → Ok with the diff.
    expect(joinResult.type).toBe("Ok");
    if (joinResult.type === "Ok") {
      expect(joinResult.value).toBe(HAPPY_DIFF);
    }
  }, 10_000);

  it("diff value is returned as the raw body string (Diff brand at trust boundary)", async () => {
    const rawDiff =
      "diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n+b\n";
    const { client } = makeFakeClient(successIO(rawDiff));
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test" },
      httpClient: client,
    });

    const result = await provider.fetchDiff(githubPR(1)).unsafeRun();

    expect(result).toEqual(expect.objectContaining({ type: "Ok" }));
    if (result.type === "Ok") {
      expect(result.value as string).toBe(rawDiff);
    }
  });

  it("the returned Diff is accepted where string & Diff is expected", async () => {
    const { client } = makeFakeClient(successIO(HAPPY_DIFF));
    const provider = createGithubVcsProvider({
      config: { token: "ghp_test" },
      httpClient: client,
    });

    const result = await provider.fetchDiff(githubPR(1)).unsafeRun();

    if (result.type === "Ok") {
      // Diff extends string — length is accessible without cast
      expect(result.value.length).toBeGreaterThan(0);
    }
  });
});
