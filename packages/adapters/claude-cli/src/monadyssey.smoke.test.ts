import { describe, expect, it } from "vitest";
import { Right } from "monadyssey";

describe("monadyssey is installed and importable", () => {
  it("Right.pure wraps a value", () => {
    const r = Right.pure(1);
    expect(r.fold(() => 0, (v) => v)).toBe(1);
  });
});
