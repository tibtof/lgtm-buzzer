import { describe, expect, it } from "vitest";
import { ADAPTER_ID, adapterInfo } from "./index.js";

describe("adapter-github", () => {
  it("has the expected adapter id", () => {
    expect(ADAPTER_ID).toBe("github");
  });

  it("adapterInfo reports core version", () => {
    expect(adapterInfo()).toEqual({
      ok: true,
      value: { id: "github", coreVersion: "0.0.0" },
    });
  });
});
