import { describe, expect, it } from "vitest";
import { ADAPTER_ID, createCodexCliProvider } from "./index.js";
import type { SpawnError, SpawnOutput, spawnIO as SpawnIOType } from "@lgtm-buzzer/adapter-shared";
import { IO } from "monadyssey";

describe("adapter-codex-cli index barrel", () => {
  it("has the expected adapter id constant", () => {
    expect(ADAPTER_ID).toBe("codex-cli");
  });

  it("createCodexCliProvider factory is exported and returns a provider with the correct id", () => {
    const fakeSpawn: typeof SpawnIOType = () =>
      IO.lift<SpawnError, SpawnOutput>(() => ({
        stdout: "",
        stderr: "",
        exitCode: 0,
      }));
    const provider = createCodexCliProvider({ spawnIO: fakeSpawn });
    expect(provider.id).toBe("codex-cli");
  });
});
