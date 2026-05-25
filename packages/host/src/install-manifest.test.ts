import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildManifest,
  pickHostBinaryPath,
  renderManifestTemplate,
  renderNodeWrapper,
} from "./install-manifest.js";
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

// ---------------------------------------------------------------------------
// Template text used across renderManifestTemplate tests.
// Mirrors the content of packages/host/manifest.template.json.
// ---------------------------------------------------------------------------
const TEMPLATE = `{
  "name": "com.lgtm_buzzer.host",
  "description": "LGTM-Buzzer native messaging host",
  "path": "__HOST_BINARY_PATH__",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://__EXTENSION_ID__/"]
}
`;

describe("renderManifestTemplate", () => {
  it("substitutes both placeholders in the happy path", () => {
    const result = renderManifestTemplate({
      template: TEMPLATE,
      hostBinaryPath: "/usr/local/bin/lgtm-host/index.js",
      extensionId: "abcdefghijklmnop",
    });
    const parsed = JSON.parse(result) as {
      path: string;
      allowed_origins: string[];
    };
    expect(parsed.path).toBe("/usr/local/bin/lgtm-host/index.js");
    expect(parsed.allowed_origins[0]).toBe("chrome-extension://abcdefghijklmnop/");
  });

  it("JSON-escapes a backslash in the binary path", () => {
    // Windows-style path (hypothetical; Windows is out of scope for v1, but the
    // escaping must still be correct so the output remains valid JSON).
    const result = renderManifestTemplate({
      template: TEMPLATE,
      hostBinaryPath: "C:\\Users\\user\\host\\index.js",
      extensionId: "ext123",
    });
    const parsed = JSON.parse(result) as { path: string };
    expect(parsed.path).toBe("C:\\Users\\user\\host\\index.js");
  });

  it("JSON-escapes a double-quote in the binary path", () => {
    const result = renderManifestTemplate({
      template: TEMPLATE,
      hostBinaryPath: '/weird"path/index.js',
      extensionId: "ext123",
    });
    const parsed = JSON.parse(result) as { path: string };
    expect(parsed.path).toBe('/weird"path/index.js');
  });

  it("preserves forward slashes in the extension ID verbatim", () => {
    // Extension IDs don't contain slashes, but the template wraps the value
    // inside a URL so any incidental slash must survive round-trip.
    const result = renderManifestTemplate({
      template: TEMPLATE,
      hostBinaryPath: "/abs/index.js",
      extensionId: "abcd/1234",
    });
    const parsed = JSON.parse(result) as { allowed_origins: string[] };
    expect(parsed.allowed_origins[0]).toBe("chrome-extension://abcd/1234/");
  });

  it("throws when __HOST_BINARY_PATH__ is missing from the template", () => {
    const badTemplate = TEMPLATE.replace("__HOST_BINARY_PATH__", "__WRONG__");
    expect(() =>
      renderManifestTemplate({
        template: badTemplate,
        hostBinaryPath: "/abs/index.js",
        extensionId: "ext123",
      }),
    ).toThrow("__HOST_BINARY_PATH__");
  });

  it("throws when __EXTENSION_ID__ is missing from the template", () => {
    const badTemplate = TEMPLATE.replace("__EXTENSION_ID__", "__WRONG__");
    expect(() =>
      renderManifestTemplate({
        template: badTemplate,
        hostBinaryPath: "/abs/index.js",
        extensionId: "ext123",
      }),
    ).toThrow("__EXTENSION_ID__");
  });
});

// ---------------------------------------------------------------------------
// pickHostBinaryPath dual-layout tests.
// Tests the pure exported function directly with tmpdir-simulated layouts.
// ---------------------------------------------------------------------------

describe("pickHostBinaryPath dual-layout", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "install-manifest-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("dev layout: returns cli.js when only cli.js is present", () => {
    fs.writeFileSync(path.join(tmpDir, "cli.js"), "// dev build\n");
    expect(pickHostBinaryPath(tmpDir)).toBe(path.join(tmpDir, "cli.js"));
  });

  it("bundled layout: returns index.js when only index.js is present", () => {
    fs.writeFileSync(path.join(tmpDir, "index.js"), "// bundled\n");
    expect(pickHostBinaryPath(tmpDir)).toBe(path.join(tmpDir, "index.js"));
  });

  it("BUGFIX: returns cli.js when BOTH are present (the dev tsc -b case)", () => {
    // This is the case install-manifest.ts previously got wrong, producing a
    // manifest pointing at the non-executable library entry index.js. Real
    // dev `dist/` always has both — tsc -b emits cli.js (the @lgtm-buzzer-host
    // bin entry) alongside index.js (the library entry).
    fs.writeFileSync(path.join(tmpDir, "cli.js"), "#!/usr/bin/env node\n");
    fs.writeFileSync(path.join(tmpDir, "index.js"), "// library entry\n");
    expect(pickHostBinaryPath(tmpDir)).toBe(path.join(tmpDir, "cli.js"));
  });

  it("falls back to index.js path even when neither file exists (caller can fs.stat)", () => {
    // resolveHostBinaryPath never errors — it returns a path the caller can
    // pass to fs/exec which will surface the real error. Verifies the empty
    // tmpdir path is the bundled fallback (predictable).
    expect(pickHostBinaryPath(tmpDir)).toBe(path.join(tmpDir, "index.js"));
  });
});

describe("renderNodeWrapper", () => {
  it("emits a POSIX shell script with shebang, exec, and absolute paths", () => {
    const script = renderNodeWrapper({
      nodePath: "/Users/test/.nvm/versions/node/v22.22.0/bin/node",
      jsEntryPath: "/Users/test/workspace/host/dist/cli.js",
    });
    expect(script.startsWith("#!/bin/sh\n")).toBe(true);
    expect(script).toContain("NODE='/Users/test/.nvm/versions/node/v22.22.0/bin/node'");
    expect(script).toContain("exec \"$NODE\" '/Users/test/workspace/host/dist/cli.js' \"$@\"");
  });

  it("falls back to PATH discovery when the captured node is gone", () => {
    const script = renderNodeWrapper({
      nodePath: "/missing/node",
      jsEntryPath: "/abs/cli.js",
    });
    expect(script).toContain('if [ ! -x "$NODE" ]; then');
    expect(script).toContain("command -v node");
    expect(script).toContain('exit 127');
  });

  it("escapes paths containing single quotes", () => {
    const script = renderNodeWrapper({
      nodePath: "/weird/node",
      jsEntryPath: "/has'quote/cli.js",
    });
    // The shell `'\''` idiom: close quote, escaped quote, re-open quote.
    expect(script).toContain("/has'\\''quote/cli.js");
  });

  it("escapes paths containing spaces (macOS Application Support path)", () => {
    const script = renderNodeWrapper({
      nodePath: "/usr/local/bin/node",
      jsEntryPath: "/Users/test/Application Support/host/cli.js",
    });
    expect(script).toContain("'/Users/test/Application Support/host/cli.js'");
  });

  it("augments PATH with common CLI dirs unconditionally (ADR-29 resolvers need gh/az)", () => {
    // Chrome spawns native-messaging hosts with a minimal PATH (typically
    // /usr/bin:/bin), which is missing the dirs where gh, az, and other
    // CLIs live. The wrapper MUST extend PATH unconditionally so the host's
    // resolver subprocess invocations resolve. Regression for the second
    // bug surfaced after #113 shipped: github resolver returning missing-
    // credentials because `gh` was not on Chrome's PATH.
    const script = renderNodeWrapper({
      nodePath: "/abs/node",
      jsEntryPath: "/abs/cli.js",
    });
    expect(script).toMatch(/export PATH/);
    expect(script).toContain("/opt/homebrew/bin");
    expect(script).toContain("/usr/local/bin");
    expect(script).toContain("/opt/local/bin");
    expect(script).toContain("/home/linuxbrew/.linuxbrew/bin");
    // The augmentation must happen BEFORE we try to use NODE so the fallback
    // discovery path also benefits.
    const pathLine = script.search(/^PATH="/m);
    const nodeLine = script.search(/^NODE=/m);
    expect(pathLine).toBeGreaterThan(-1);
    expect(nodeLine).toBeGreaterThan(-1);
    expect(pathLine).toBeLessThan(nodeLine);
  });
});
