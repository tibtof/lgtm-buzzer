import { describe, expect, it } from "vitest";
import { HttpError } from "monadyssey-fetch";
import { mapHttpError } from "./errors.js";
import type { VCSProviderError } from "@lgtm-buzzer/core";

/**
 * Creates a minimal `HttpError` for testing — only `status` and `rawMessage`
 * are meaningful for `mapHttpError`.
 */
const makeHttpError = (status: number, rawMessage: string): HttpError =>
  new HttpError(status, rawMessage, null, "https://dev.azure.com/org/proj/_apis/git/repositories/repo/pullRequests/1/iterations");

describe("mapHttpError", () => {
  const cases: Array<{ name: string; status: number; rawMessage: string; want: VCSProviderError }> =
    [
      {
        name: "401 Unauthorized → transport with status",
        status: 401,
        rawMessage: "Unauthorized",
        want: { kind: "transport", status: 401, detail: "Unauthorized" },
      },
      {
        name: "403 Forbidden → transport with status",
        status: 403,
        rawMessage: "Forbidden",
        want: { kind: "transport", status: 403, detail: "Forbidden" },
      },
      {
        name: "404 Not Found → transport with status",
        status: 404,
        rawMessage: "Not Found",
        want: { kind: "transport", status: 404, detail: "Not Found" },
      },
      {
        name: "429 Too Many Requests → transport with status",
        status: 429,
        rawMessage: "rate limit exceeded",
        want: { kind: "transport", status: 429, detail: "rate limit exceeded" },
      },
      {
        name: "500 Internal Server Error → transport with status",
        status: 500,
        rawMessage: "Internal Server Error",
        want: { kind: "transport", status: 500, detail: "Internal Server Error" },
      },
      {
        name: "status 0 (network/TLS failure) → transport without status field",
        status: 0,
        rawMessage: "fetch failed",
        want: { kind: "transport", detail: "fetch failed" },
      },
    ];

  for (const c of cases) {
    it(c.name, () => {
      const result = mapHttpError(makeHttpError(c.status, c.rawMessage));
      expect(result).toEqual(c.want);
    });
  }

  it("status 0 result does NOT have a status property", () => {
    const result = mapHttpError(makeHttpError(0, "network error"));
    // exactOptionalPropertyTypes — the field must be absent, not undefined.
    expect("status" in result).toBe(false);
  });
});
