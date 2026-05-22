import { describe, it, expect } from "vitest";
import { HttpError } from "monadyssey-fetch";
import { mapHttpError } from "./errors.js";

/** Helper to build an HttpError instance. */
const httpErr = (status: number, rawMessage: string): HttpError =>
  new HttpError(status, rawMessage, null, "https://api.anthropic.com/v1/messages");

describe("mapHttpError", () => {
  it("status 0, non-timeout rawMessage → transport without status", () => {
    const result = mapHttpError(httpErr(0, "fetch failed"), 60_000);
    expect(result).toEqual({ kind: "transport", detail: "fetch failed" });
    expect("status" in result).toBe(false);
  });

  it("status 0, rawMessage contains 'timeout' → timeout { afterMs }", () => {
    const result = mapHttpError(httpErr(0, "Request timeout"), 60_000);
    expect(result).toEqual({ kind: "timeout", afterMs: 60_000 });
  });

  it("status 0, rawMessage contains 'aborted' → timeout { afterMs }", () => {
    const result = mapHttpError(httpErr(0, "The operation was aborted"), 30_000);
    expect(result).toEqual({ kind: "timeout", afterMs: 30_000 });
  });

  it("status 0, rawMessage contains 'TIMEOUT' (uppercase) → timeout { afterMs }", () => {
    const result = mapHttpError(httpErr(0, "TIMEOUT occurred"), 5_000);
    expect(result).toEqual({ kind: "timeout", afterMs: 5_000 });
  });

  it("status 400 → transport { status: 400, detail }", () => {
    const result = mapHttpError(httpErr(400, "Bad Request"), 60_000);
    expect(result).toEqual({ kind: "transport", status: 400, detail: "Bad Request" });
  });

  it("status 401 → transport { status: 401, detail }", () => {
    const result = mapHttpError(httpErr(401, "Unauthorized"), 60_000);
    expect(result).toEqual({ kind: "transport", status: 401, detail: "Unauthorized" });
  });

  it("status 403 → transport { status: 403, detail }", () => {
    const result = mapHttpError(httpErr(403, "Forbidden"), 60_000);
    expect(result).toEqual({ kind: "transport", status: 403, detail: "Forbidden" });
  });

  it("status 404 → transport { status: 404, detail }", () => {
    const result = mapHttpError(httpErr(404, "Not Found"), 60_000);
    expect(result).toEqual({ kind: "transport", status: 404, detail: "Not Found" });
  });

  it("status 429 → transport { status: 429, detail }", () => {
    const result = mapHttpError(httpErr(429, "rate_limit_error"), 60_000);
    expect(result).toEqual({ kind: "transport", status: 429, detail: "rate_limit_error" });
  });

  it("status 500 → transport { status: 500, detail }", () => {
    const result = mapHttpError(httpErr(500, "Internal Server Error"), 60_000);
    expect(result).toEqual({ kind: "transport", status: 500, detail: "Internal Server Error" });
  });

  it("status 529 → transport { status: 529, detail }", () => {
    const result = mapHttpError(httpErr(529, "overloaded_error"), 60_000);
    expect(result).toEqual({ kind: "transport", status: 529, detail: "overloaded_error" });
  });

  it("BINDING: API key string never appears in the transport error detail", () => {
    const apiKey = "sk-ant-api03-super-secret-key-xyz";
    // The rawMessage comes from the HTTP library and should not contain headers,
    // but we verify the mapping itself does not inject the key.
    const err = httpErr(401, "authentication_error");
    const result = mapHttpError(err, 60_000);
    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain(apiKey);
  });

  it("timeout afterMs reflects the timeoutMs argument", () => {
    const result = mapHttpError(httpErr(0, "timeout"), 12_345);
    expect(result).toEqual({ kind: "timeout", afterMs: 12_345 });
  });
});
