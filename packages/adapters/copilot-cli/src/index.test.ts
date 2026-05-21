import { describe, expect, it } from "vitest";
import { ADAPTER_ID, adapterInfo } from "./index.js";

describe("adapter-copilot-cli", () => {
  it("has the expected adapter id", () => {
    expect(ADAPTER_ID).toBe("copilot-cli");
  });

  it("adapterInfo reports core version", () => {
    expect(adapterInfo()).toEqual({
      ok: true,
      value: { id: "copilot-cli", coreVersion: "0.0.0" },
    });
  });
});
