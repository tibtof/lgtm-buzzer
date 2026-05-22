import { describe, expect, it } from "vitest";
import type { LogBindings, LogLevel, Logger } from "./logger.js";

describe("Logger port", () => {
  it("is a type-only surface (no runtime export)", () => {
    const noop: Logger = {
      debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
      child: () => noop,
    };
    const bindings: LogBindings = { traceId: "abc" };
    const level: LogLevel = "info";
    noop.info("hello", bindings);
    expect(level).toBe("info");
  });
});
