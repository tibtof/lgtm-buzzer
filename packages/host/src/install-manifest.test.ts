import { describe, expect, it } from "vitest";
import { buildManifest } from "./install-manifest.js";
import type { BuildManifestInput } from "./install-manifest.js";

const baseInput: BuildManifestInput = {
  platform: "darwin",
  homedir: "/Users/test",
  hostBinaryPath: "/abs/cli.js",
  extensionId: "testextensionid",
};

describe("buildManifest", () => {
  it("macOS: returns supported with ~/Library/... target", () => {
    const result = buildManifest({ ...baseInput, platform: "darwin" });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.targetDir).toBe(
      "/Users/test/Library/Application Support/Google/Chrome/NativeMessagingHosts",
    );
    expect(result.targetPath).toBe(
      "/Users/test/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.lgtm_buzzer.host.json",
    );
  });

  it("Linux: returns supported with ~/.config/google-chrome/... target", () => {
    const result = buildManifest({
      ...baseInput,
      platform: "linux",
      homedir: "/home/test",
    });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.targetDir).toBe(
      "/home/test/.config/google-chrome/NativeMessagingHosts",
    );
    expect(result.targetPath).toBe(
      "/home/test/.config/google-chrome/NativeMessagingHosts/com.lgtm_buzzer.host.json",
    );
  });

  it("Windows (win32): returns { supported: false }", () => {
    const result = buildManifest({ ...baseInput, platform: "win32" });
    expect(result).toEqual({ supported: false });
  });

  it("Unknown platform (freebsd): returns { supported: false }", () => {
    const result = buildManifest({ ...baseInput, platform: "freebsd" });
    expect(result).toEqual({ supported: false });
  });

  it("Extension ID from env: manifest allowed_origins[0] includes the extension ID", () => {
    const result = buildManifest({
      ...baseInput,
      extensionId: "abcd1234efgh5678",
    });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.manifest.allowed_origins[0]).toBe(
      "chrome-extension://abcd1234efgh5678/",
    );
  });

  it('Manifest name is always "com.lgtm_buzzer.host" regardless of platform', () => {
    const platforms: Array<NodeJS.Platform> = ["darwin", "linux"];
    for (const platform of platforms) {
      const result = buildManifest({ ...baseInput, platform });
      expect(result.supported).toBe(true);
      if (!result.supported) continue;
      expect(result.manifest.name).toBe("com.lgtm_buzzer.host");
    }
  });
});
