import { describe, expect, it } from "vitest";
import { IO } from "monadyssey";
import { HttpError } from "monadyssey-fetch";
import type { HttpClient } from "monadyssey-fetch";
import type { PRIdentifier } from "@lgtm-buzzer/core";
import { createAdoVcsProvider, ADAPTER_ID } from "./provider.js";
import { mapHttpError } from "./errors.js";

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
  } as unknown as Response;
};

/** An `IO` that succeeds with the given body. */
const successIO = (body: string): IO<HttpError, Response> =>
  IO.lift<HttpError, Response>(() => makeResponse(body));

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
// Tests
// ---------------------------------------------------------------------------

describe("createAdoVcsProvider", () => {
  it("case #10 — provider.id equals 'ado'", () => {
    const { client } = makeFakeClient(successIO(""));
    const provider = createAdoVcsProvider({
      config: { token: "ado_pat_test" },
      httpClient: client,
    });
    expect(provider.id).toBe("ado");
    expect(provider.id).toBe(ADAPTER_ID);
  });

  it("case #9 — wrong-VCS guard: GitHub identifier returns transport { detail: 'wrong-vcs' } without HTTP call", async () => {
    const { client, calls } = makeFakeClient(successIO(""));
    const provider = createAdoVcsProvider({
      config: { token: "ado_pat_test" },
      httpClient: client,
    });

    const result = await provider.fetchDiff(githubPR as PRIdentifier).unsafeRun();

    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({ kind: "transport", detail: "wrong-vcs" }),
      }),
    );
    // No HTTP call must have been made
    expect(calls).toHaveLength(0);
  });

  it("case #1 — v1 limitation: ADO PR returns malformed-response { detail: 'ado-multi-call-not-yet-implemented' }", async () => {
    const { client, calls } = makeFakeClient(successIO(""));
    const provider = createAdoVcsProvider({
      config: { token: "ado_pat_test" },
      httpClient: client,
    });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();

    expect(result).toEqual(
      expect.objectContaining({
        type: "Err",
        error: expect.objectContaining({
          kind: "malformed-response",
          detail: "ado-multi-call-not-yet-implemented",
        }),
      }),
    );
    // The v1 implementation does not make any HTTP calls
    expect(calls).toHaveLength(0);
  });

  it("case #2 — BINDING: HTTP call list contains ONLY diff-related endpoints (zero calls in v1)", async () => {
    const { client, calls } = makeFakeClient(successIO(""));
    const provider = createAdoVcsProvider({
      config: { token: "ado_pat_test" },
      httpClient: client,
    });

    await provider.fetchDiff(adoPR()).unsafeRun();

    // v1: no HTTP calls made at all; assert no forbidden endpoints are hit.
    for (const call of calls) {
      expect(call.uri).not.toContain("/description");
      expect(call.uri).not.toContain("/comments");
      expect(call.uri).not.toContain("/threads");
      expect(call.uri).not.toContain("/workItems");
      expect(call.uri).not.toContain("/policies");
      expect(call.uri).not.toContain("/votes");
    }
  });

  it("case #3 — BINDING: error detail does NOT contain the token", async () => {
    const token = "ado_super_secret_pat_abc123";
    const { client } = makeFakeClient(successIO(""));
    const provider = createAdoVcsProvider({
      config: { token },
      httpClient: client,
    });

    const result = await provider.fetchDiff(adoPR()).unsafeRun();

    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      const detail = (result.error as { detail?: string }).detail ?? "";
      expect(detail).not.toContain(token);
    }
  });

  it("case #3b — BINDING: wrong-VCS error detail does NOT contain the token", async () => {
    const token = "ado_super_secret_pat_xyz789";
    const { client } = makeFakeClient(successIO(""));
    const provider = createAdoVcsProvider({
      config: { token },
      httpClient: client,
    });

    const result = await provider.fetchDiff(githubPR as PRIdentifier).unsafeRun();

    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      const detail = (result.error as { detail?: string }).detail ?? "";
      expect(detail).not.toContain(token);
    }
  });

  it("case #4 (401) — ADO 401 maps to transport { status: 401 } via error mapper", () => {
    const err = new HttpError(401, "Unauthorized", null, "https://dev.azure.com/...");
    const mapped = mapHttpError(err);
    expect(mapped).toEqual(expect.objectContaining({ kind: "transport", status: 401 }));
  });

  it("case #4 (403) — ADO 403 maps to transport { status: 403 } via error mapper", () => {
    const err = new HttpError(403, "Forbidden", null, "https://dev.azure.com/...");
    const mapped = mapHttpError(err);
    expect(mapped).toEqual(expect.objectContaining({ kind: "transport", status: 403 }));
  });

  it("case #4 (429) — ADO 429 maps to transport { status: 429 } via error mapper", () => {
    const err = new HttpError(429, "TooManyRequests", null, "https://dev.azure.com/...");
    const mapped = mapHttpError(err);
    expect(mapped).toEqual(expect.objectContaining({ kind: "transport", status: 429 }));
  });

  it("case #4 (5xx) — ADO 500 maps to transport { status: 500 } via error mapper", () => {
    const err = new HttpError(500, "InternalServerError", null, "https://dev.azure.com/...");
    const mapped = mapHttpError(err);
    expect(mapped).toEqual(expect.objectContaining({ kind: "transport", status: 500 }));
  });

  it("case #5 — network failure (status 0) maps to transport without status via error mapper", () => {
    const err = new HttpError(0, "fetch failed", null, "https://dev.azure.com/...");
    const mapped = mapHttpError(err);
    expect(mapped.kind).toBe("transport");
    expect("status" in mapped).toBe(false);
  });

  it("case #11 — cancellation propagates as Cancelled (NOT manufactured into Err)", async () => {
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
    const provider = createAdoVcsProvider({
      config: { token: "ado_pat_test", timeoutMs: 60_000 },
      httpClient: client,
    });

    // The v1 provider does not make HTTP calls — it returns IO.fail immediately.
    // Cancellation test verifies the IO composition does not prevent cancellation
    // from propagating. Since v1 returns a synchronous IO.fail, fork+cancel
    // produces either Cancelled (if cancel wins) or Err<malformed-response>
    // (if the fail resolves first). Neither must be Err<cancelled> manufactured
    // by the adapter.
    const fetchIO = provider.fetchDiff(adoPR());
    const forkResult = await fetchIO.fork().unsafeRun();
    if (forkResult.type !== "Ok") throw new Error("fork IO failed unexpectedly");
    const fiber = forkResult.value;

    await fiber.cancel();
    const joinResult = await fiber.join();

    if (joinResult.type === "Err") {
      // The sync IO.fail resolved before cancel could take effect — acceptable.
      // The key constraint: adapter MUST NOT manufacture Err<cancelled>.
      expect(joinResult.error.kind).not.toBe("cancelled" as string);
      expect(joinResult.error.kind).toBe("malformed-response");
    } else {
      expect(joinResult.type).toBe("Cancelled");
    }
  }, 10_000);

  it("wrong-VCS: fetchDiff with github PRIdentifier does not trigger ADO HTTP call", async () => {
    const { client, calls } = makeFakeClient(successIO(""));
    const provider = createAdoVcsProvider({
      config: { token: "ado_pat_test" },
      httpClient: client,
    });

    await provider.fetchDiff(githubPR as PRIdentifier).unsafeRun();
    expect(calls).toHaveLength(0);
  });

  it("config with all optional fields provided still constructs without error", () => {
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
});
