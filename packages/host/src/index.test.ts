import { describe, expect, it } from "vitest";
import { HOST_ID } from "./index.js";

describe("host", () => {
  it("identifies itself", () => {
    expect(HOST_ID).toBe("@lgtm-buzzer/host");
  });
});
