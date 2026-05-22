import { describe, it, expect, expectTypeOf } from "vitest";
import type { IO } from "monadyssey";
import type {
  Diff,
  PRIdentifier,
  VCSProvider,
  VCSProviderError,
  UnsupportedURL,
} from "./vcs-provider.js";
import { parsePRIdentifier } from "./vcs-provider.js";

// ---------------------------------------------------------------------------
// Test-fixture helper — constructs a branded Diff for test use only.
// VCS adapters do `rawString as Diff` at the trust boundary; tests use this.
// ---------------------------------------------------------------------------
const asDiff = (s: string): Diff => s as Diff;

// ---------------------------------------------------------------------------
// 1. Type-only smoke for VCSProvider
// ---------------------------------------------------------------------------

describe("VCSProvider port — type-only smoke", () => {
  it("fetchDiff signature matches IO<VCSProviderError, Diff>", () => {
    expectTypeOf<VCSProvider>().toMatchTypeOf<{
      readonly id: string;
      readonly fetchDiff: (input: PRIdentifier) => IO<VCSProviderError, Diff>;
    }>();
  });

  it("PRIdentifier kind is 'github' | 'ado'", () => {
    type Kind = PRIdentifier["kind"];
    expectTypeOf<Kind>().toEqualTypeOf<"github" | "ado">();
  });

  it("Diff extends string", () => {
    expectTypeOf<Diff>().toMatchTypeOf<string>();
  });

  it("Diff is not plain string — branded", () => {
    // A plain string is NOT assignable to Diff (brand blocks it).
    // We verify the brand field exists.
    expectTypeOf<Diff>().toMatchTypeOf<{ readonly __brand: "Diff" }>();
  });

  it("a noop fake satisfies the VCSProvider port type", () => {
    const _fake: VCSProvider = {
      id: "noop",
      fetchDiff: (_input: PRIdentifier): IO<VCSProviderError, Diff> => {  // eslint-disable-line @typescript-eslint/no-unused-vars
        return undefined as never;
      },
    };
    expectTypeOf(_fake.id).toBeString();
  });
});

// ---------------------------------------------------------------------------
// 2. Unit tests for parsePRIdentifier — 8 table-driven cases
// ---------------------------------------------------------------------------

describe("parsePRIdentifier", () => {
  type SuccessCase = {
    readonly name: string;
    readonly url: string;
    readonly want: PRIdentifier;
  };

  type FailureCase = {
    readonly name: string;
    readonly url: string;
  };

  const successCases: readonly SuccessCase[] = [
    {
      name: "GitHub canonical PR URL",
      url: "https://github.com/tibtof/lgtm-buzzer/pull/34",
      want: { kind: "github", owner: "tibtof", repo: "lgtm-buzzer", number: 34 },
    },
    {
      name: "GitHub PR URL with trailing /files path",
      url: "https://github.com/foo/bar/pull/1/files",
      want: { kind: "github", owner: "foo", repo: "bar", number: 1 },
    },
    {
      name: "ADO dev.azure.com URL with percent-encoded project",
      url: "https://dev.azure.com/my-org/My%20Project/_git/repo/pullrequest/123",
      want: { kind: "ado", org: "my-org", project: "My Project", repo: "repo", pullRequestId: 123 },
    },
    {
      name: "ADO visualstudio.com legacy URL",
      url: "https://my-org.visualstudio.com/MyProj/_git/repo/pullrequest/7",
      want: { kind: "ado", org: "my-org", project: "MyProj", repo: "repo", pullRequestId: 7 },
    },
  ];

  for (const c of successCases) {
    it(`parses ${c.name}`, () => {
      const result = parsePRIdentifier(c.url);
      expect(result.type).toBe("Right");
      result.fold(
        () => { throw new Error("Expected Right but got Left"); },
        (id) => { expect(id).toEqual(c.want); },
      );
    });
  }

  const failureCases: readonly FailureCase[] = [
    {
      name: "GitLab merge request URL",
      url: "https://gitlab.com/foo/bar/-/merge_requests/1",
    },
    {
      name: "GitHub PR URL with http (non-https)",
      url: "http://github.com/foo/bar/pull/1",
    },
    {
      name: "GitHub URL missing /pull/<n>",
      url: "https://github.com/foo",
    },
    {
      name: "not-a-url string",
      url: "not-a-url",
    },
  ];

  for (const c of failureCases) {
    it(`rejects ${c.name}`, () => {
      const result = parsePRIdentifier(c.url);
      expect(result.type).toBe("Left");
      result.fold(
        (err: UnsupportedURL) => {
          expect(err.kind).toBe("unsupported-url");
          expect(err.url).toBe(c.url);
          expect(typeof err.detail).toBe("string");
          expect(err.detail.length).toBeGreaterThan(0);
        },
        () => { throw new Error("Expected Left but got Right"); },
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Structural smoke for VCSProviderError — 6 distinguishable shapes
// ---------------------------------------------------------------------------

describe("VCSProviderError — structural smoke", () => {
  type ErrorCase = {
    readonly name: string;
    readonly err: VCSProviderError;
  };

  const cases: readonly ErrorCase[] = [
    {
      name: "transport with status",
      err: { kind: "transport", status: 404, detail: "not found" },
    },
    {
      name: "transport without status (network failure)",
      err: { kind: "transport", detail: "TLS handshake failed" },
    },
    {
      name: "malformed-response with raw",
      err: { kind: "malformed-response", detail: "body is not unified diff", raw: "<!DOCTYPE html>" },
    },
    {
      name: "malformed-response without raw",
      err: { kind: "malformed-response", detail: "body is empty" },
    },
    {
      name: "timeout",
      err: { kind: "timeout", afterMs: 5000 },
    },
    {
      name: "cancelled",
      err: { kind: "cancelled" },
    },
  ];

  for (const c of cases) {
    it(`constructs ${c.name}`, () => {
      expect(c.err.kind).toBeTruthy();
    });
  }

  it("has exactly 6 distinct shapes (4 variants, transport and malformed-response have 2 shapes each)", () => {
    expect(cases.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 4. Diff-only invariant type assertions
// ---------------------------------------------------------------------------

describe("PRIdentifier — diff-only invariant", () => {
  it("does not have a 'description' field", () => {
    expectTypeOf<PRIdentifier>().not.toHaveProperty("description");
  });

  it("does not have a 'title' field", () => {
    expectTypeOf<PRIdentifier>().not.toHaveProperty("title");
  });

  it("does not have a 'comments' field", () => {
    expectTypeOf<PRIdentifier>().not.toHaveProperty("comments");
  });

  it("asDiff helper produces a Diff from a string for test use", () => {
    const d = asDiff("--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new");
    expectTypeOf(d).toMatchTypeOf<Diff>();
    expectTypeOf(d).toMatchTypeOf<string>();
  });
});
