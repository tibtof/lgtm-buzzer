import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("zod is installed and importable in protocol", () => {
  it("parses a trivial schema", () => {
    const schema = z.object({ id: z.string().min(1) });
    const result = schema.safeParse({ id: "abc" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid input via safeParse", () => {
    const schema = z.object({ id: z.string().min(1) });
    const result = schema.safeParse({ id: "" });
    expect(result.success).toBe(false);
  });
});
