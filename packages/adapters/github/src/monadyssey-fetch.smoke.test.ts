import { describe, expect, it } from "vitest";
import * as MFetch from "monadyssey-fetch";

describe("monadyssey-fetch is installed and importable", () => {
  it("module loads without throwing", () => {
    expect(MFetch).toBeDefined();
  });
});
