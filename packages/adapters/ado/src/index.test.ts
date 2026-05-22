import { describe, expect, it } from "vitest";
import { ADAPTER_ID, createAdoVcsProvider } from "./index.js";

describe("adapter-ado index", () => {
  it("has the expected adapter id", () => {
    expect(ADAPTER_ID).toBe("ado");
  });

  it("createAdoVcsProvider returns a provider with id 'ado'", () => {
    const provider = createAdoVcsProvider({ config: { token: "test_pat" } });
    expect(provider.id).toBe("ado");
    expect(provider.id).toBe(ADAPTER_ID);
  });

  it("createAdoVcsProvider exposes a fetchDiff function", () => {
    const provider = createAdoVcsProvider({ config: { token: "test_pat" } });
    expect(typeof provider.fetchDiff).toBe("function");
  });
});
