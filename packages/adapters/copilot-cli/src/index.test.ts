import { describe, expect, it } from "vitest";
import { ADAPTER_ID, createCopilotCliProvider } from "./index.js";
import type { SpawnError, SpawnOutput, spawnIO as SpawnIOType } from "@lgtm-buzzer/adapter-shared";
import { IO } from "monadyssey";

describe("adapter-copilot-cli index barrel", () => {
  it("has the expected adapter id constant", () => {
    expect(ADAPTER_ID).toBe("copilot-cli");
  });

  it("createCopilotCliProvider factory is exported and returns a provider with the correct id", () => {
    const fakeSpawn: typeof SpawnIOType = () =>
      IO.lift<SpawnError, SpawnOutput>(() => ({
        stdout: "",
        stderr: "",
        exitCode: 0,
      }));
    const provider = createCopilotCliProvider({ spawnIO: fakeSpawn });
    expect(provider.id).toBe("copilot-cli");
  });
});
