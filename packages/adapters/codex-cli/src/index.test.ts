import { describe, expect, it } from "vitest";
import { ADAPTER_ID, adapterInfo } from "./index.js";

describe("adapter-codex-cli", () => {
  it("has the expected adapter id", () => {
    expect(ADAPTER_ID).toBe("codex-cli");
  });

  it("adapterInfo reports core version", () => {
    expect(adapterInfo()).toEqual({
      ok: true,
      value: { id: "codex-cli", coreVersion: "0.0.0" },
    });
  });
});
