import { describe, expect, it } from "vitest";
import { NATIVE_HOST_ID } from "./host-id.js";

describe("NATIVE_HOST_ID", () => {
  it("uses the dot-separated lowercase form required by native messaging", () => {
    expect(NATIVE_HOST_ID).toBe("com.lgtm_buzzer.host");
  });

  it("matches the native messaging host name regex", () => {
    expect(NATIVE_HOST_ID).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/);
  });
});
