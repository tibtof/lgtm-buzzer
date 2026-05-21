import { describe, expect, it } from "vitest";
import { ADAPTER_ID, adapterInfo } from "./index.js";

describe("adapter-ado", () => {
  it("has the expected adapter id", () => {
    expect(ADAPTER_ID).toBe("ado");
  });

  it("adapterInfo reports core version", () => {
    expect(adapterInfo()).toEqual({
      ok: true,
      value: { id: "ado", coreVersion: "0.0.0" },
    });
  });
});
