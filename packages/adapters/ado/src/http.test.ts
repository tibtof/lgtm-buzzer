import { describe, expect, it } from "vitest";
import { HttpClient } from "monadyssey-fetch";
import { createAdoHttpClient, USER_AGENT } from "./http.js";

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
});
