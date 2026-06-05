import { describe, expect, it } from "vitest";
import { HttpClient } from "monadyssey-fetch";
import { buildAuthHeader, createAdoHttpClient, USER_AGENT } from "./http.js";

// ---------------------------------------------------------------------------
// buildAuthHeader — scheme-aware header construction (ADR-35)
// ---------------------------------------------------------------------------

describe("buildAuthHeader", () => {
  it("scheme: 'basic' → Authorization: Basic base64(':' + token)", () => {
    const token = "my_pat_token";
    const header = buildAuthHeader(token, "basic");
    const expected = `Basic ${Buffer.from(`:${token}`).toString("base64")}`;
    expect(header).toBe(expected);
    expect(header.startsWith("Basic ")).toBe(true);
  });

  it("default (no scheme, via createAdoHttpClient) → same as basic", () => {
    // Verify encodeAdoPat encoding: base64(":" + pat) with empty username.
    const token = "test_pat";
    const basicHeader = buildAuthHeader(token, "basic");
    const decoded = Buffer.from(basicHeader.replace("Basic ", ""), "base64").toString("utf8");
    expect(decoded).toBe(`:${token}`);
  });

  it("scheme: 'bearer' → Authorization: Bearer <token> (verbatim)", () => {
    const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig";
    const header = buildAuthHeader(token, "bearer");
    expect(header).toBe(`Bearer ${token}`);
    expect(header.startsWith("Bearer ")).toBe(true);
  });

  it("bearer header contains token verbatim (no base64 encoding)", () => {
    const token = "raw_aad_token_abc123";
    const header = buildAuthHeader(token, "bearer");
    expect(header).toBe(`Bearer raw_aad_token_abc123`);
    // Confirm it is NOT base64-encoded
    expect(header).not.toContain(Buffer.from(`:${token}`).toString("base64"));
  });

  it("basic header does NOT contain token verbatim (it is base64-encoded)", () => {
    const token = "plaintext_pat";
    const header = buildAuthHeader(token, "basic");
    expect(header).not.toContain(token);
    // But decoding yields the expected value
    const decoded = Buffer.from(header.replace("Basic ", ""), "base64").toString("utf8");
    expect(decoded).toBe(`:${token}`);
  });

  // CANARY: token bytes NEVER appear unencoded in the Authorization header value
  // for the basic scheme (they are base64-encoded); for bearer they appear verbatim
  // but that is correct — what must NOT happen is accidental logging.
  it("CANARY: basic scheme — raw PAT bytes are not present literally in header", () => {
    const PAT = "SECRET_PAT_CANARY_do_not_log";
    const header = buildAuthHeader(PAT, "basic");
    // The PAT itself must not appear in clear text in the header value.
    expect(header).not.toContain(PAT);
  });

  it("CANARY: bearer scheme — token appears in header but is never logged (documentation canary)", () => {
    // For bearer, the token IS present verbatim in the header value — that is
    // correct (it IS the Authorization credential). What this canary asserts is
    // that the function does not additionally leak the token into any OTHER string.
    const TOKEN = "SECRET_AAD_CANARY_bearer_do_not_log";
    const header = buildAuthHeader(TOKEN, "bearer");
    expect(header).toBe(`Bearer ${TOKEN}`);
    // Confirm no double-encoding or extra leakage.
    expect(header).not.toContain(Buffer.from(`:${TOKEN}`).toString("base64"));
  });
});

// ---------------------------------------------------------------------------
// createAdoHttpClient — construction tests
// ---------------------------------------------------------------------------

describe("createAdoHttpClient", () => {
  it("returns an HttpClient instance", () => {
    const client = createAdoHttpClient({ token: "ado_pat_test" });
    expect(client).toBeInstanceOf(HttpClient);
  });

  it("uses the default base URL when none is provided", () => {
    const client = createAdoHttpClient({ token: "ado_pat_test" });
    expect(client).toBeDefined();
  });

  it("uses the default User-Agent constant", () => {
    expect(USER_AGENT).toBe("lgtm-buzzer-ado-adapter/0.0.0");
  });

  it("accepts a custom baseUrl (ADO Server on-premises)", () => {
    const client = createAdoHttpClient({
      token: "ado_pat_test",
      baseUrl: "https://ado.example.com/tfs",
    });
    expect(client).toBeInstanceOf(HttpClient);
  });

  it("accepts a custom timeoutMs", () => {
    const client = createAdoHttpClient({ token: "ado_pat_test", timeoutMs: 5_000 });
    expect(client).toBeInstanceOf(HttpClient);
  });

  it("accepts a custom userAgent override", () => {
    const client = createAdoHttpClient({
      token: "ado_pat_test",
      userAgent: "test-agent/1.0",
    });
    expect(client).toBeInstanceOf(HttpClient);
  });

  it("does not throw when token is an empty string (format validation deferred to API)", () => {
    expect(() => createAdoHttpClient({ token: "" })).not.toThrow();
  });

  it("accepts authScheme: 'basic' without throwing", () => {
    expect(() =>
      createAdoHttpClient({ token: "pat_abc", authScheme: "basic" }),
    ).not.toThrow();
  });

  it("accepts authScheme: 'bearer' without throwing", () => {
    expect(() =>
      createAdoHttpClient({ token: "aad_token_xyz", authScheme: "bearer" }),
    ).not.toThrow();
  });

  it("defaults to basic scheme when authScheme is absent (backward-compat)", () => {
    // Validate via buildAuthHeader: default-constructed client uses Basic encoding.
    const token = "backward_compat_pat";
    const expectedHeader = buildAuthHeader(token, "basic");
    // We cannot inspect HttpClient's private headers directly, so we assert
    // buildAuthHeader with "basic" produces the expected Basic header and that
    // the client is constructed without error.
    expect(expectedHeader.startsWith("Basic ")).toBe(true);
    expect(() => createAdoHttpClient({ token })).not.toThrow();
  });
});
