import { describe, expect, it } from "vitest";
import { ADAPTER_ID, adapterInfo } from "./index.js";

describe("adapter-claude-cli", () => {
  it("has the expected adapter id", () => {
    expect(ADAPTER_ID).toBe("claude-cli");
  });

  it("adapterInfo reports core version", () => {
    expect(adapterInfo()).toEqual({
      ok: true,
      value: { id: "claude-cli", coreVersion: "0.0.0" },
    });
  });
});
