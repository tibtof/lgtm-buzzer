import { describe, expect, it } from "vitest";
import { CORE_VERSION, ready } from "./index.js";

describe("core", () => {
  it("exposes a version constant", () => {
    expect(CORE_VERSION).toBe("0.0.0");
  });

  it("ready() returns the version wrapped in a Result", () => {
    expect(ready()).toEqual({ ok: true, value: "0.0.0" });
  });
});
