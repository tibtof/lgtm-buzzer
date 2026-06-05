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
import type { BuildManifestInput, PassThroughEnvVar } from "./install-manifest.js";

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
    fs.writeFileSync(path.join(tmpDir, "cli.js"), "#!/usr/bin/env node\n");
    fs.writeFileSync(path.join(tmpDir, "index.js"), "// library entry\n");
    expect(pickHostBinaryPath(tmpDir)).toBe(path.join(tmpDir, "cli.js"));
  });

  it("falls back to index.js path even when neither file exists (caller can fs.stat)", () => {
    expect(pickHostBinaryPath(tmpDir)).toBe(path.join(tmpDir, "index.js"));
  });
});

describe("renderNodeWrapper", () => {
  const PATH_FIXTURE = "/Users/test/.local/bin:/opt/homebrew/bin:/usr/bin:/bin";

  it("emits a POSIX shell script with shebang, exec, and absolute paths", () => {
    const script = renderNodeWrapper({
      nodePath: "/Users/test/.nvm/versions/node/v22.22.0/bin/node",
      jsEntryPath: "/Users/test/workspace/host/dist/cli.js",
      capturedPath: PATH_FIXTURE,
      capturedUser: "test",
      capturedShell: "/bin/zsh",
    });
    expect(script.startsWith("#!/bin/sh\n")).toBe(true);
    expect(script).toContain("NODE='/Users/test/.nvm/versions/node/v22.22.0/bin/node'");
    expect(script).toContain("exec \"$NODE\" '/Users/test/workspace/host/dist/cli.js' \"$@\"");
  });

  it("falls back to PATH discovery when the captured node is gone", () => {
    const script = renderNodeWrapper({
      nodePath: "/missing/node",
      jsEntryPath: "/abs/cli.js",
      capturedPath: PATH_FIXTURE,
      capturedUser: "test",
      capturedShell: "/bin/zsh",
    });
    expect(script).toContain('if [ ! -x "$NODE" ]; then');
    expect(script).toContain("command -v node");
    expect(script).toContain('exit 127');
  });

  it("escapes paths containing single quotes", () => {
    const script = renderNodeWrapper({
      nodePath: "/weird/node",
      jsEntryPath: "/has'quote/cli.js",
      capturedPath: PATH_FIXTURE,
      capturedUser: "test",
      capturedShell: "/bin/zsh",
    });
    expect(script).toContain("/has'\\''quote/cli.js");
  });

  it("escapes paths containing spaces (macOS Application Support path)", () => {
    const script = renderNodeWrapper({
      nodePath: "/usr/local/bin/node",
      jsEntryPath: "/Users/test/Application Support/host/cli.js",
      capturedPath: PATH_FIXTURE,
      capturedUser: "test",
      capturedShell: "/bin/zsh",
    });
    expect(script).toContain("'/Users/test/Application Support/host/cli.js'");
  });

  it("bakes the captured PATH into the wrapper (preserves user-specific dirs)", () => {
    // The wrapper inherits whatever PATH the user had at install time —
    // this is how `~/.local/bin/claude`, `~/.cargo/bin/foo`, and other
    // user-specific CLIs reach the host's subprocess invocations under
    // Chrome's minimal-PATH spawn. Regression for the third PATH bug
    // (claude not found) after ADR-29 + the first PATH attempt shipped.
    const userPath =
      "/Users/tibtof/.local/bin:/Users/tibtof/.cargo/bin:/opt/homebrew/bin:/usr/bin:/bin";
    const script = renderNodeWrapper({
      nodePath: "/abs/node",
      jsEntryPath: "/abs/cli.js",
      capturedPath: userPath,
      capturedUser: "tibtof",
      capturedShell: "/bin/zsh",
    });
    // PATH must appear verbatim, single-quoted, BEFORE the NODE= line so the
    // fallback discovery (command -v node) also benefits.
    expect(script).toContain(`PATH='${userPath}'`);
    const pathLine = script.search(/^PATH=/m);
    const nodeLine = script.search(/^NODE=/m);
    expect(pathLine).toBeGreaterThan(-1);
    expect(nodeLine).toBeGreaterThan(-1);
    expect(pathLine).toBeLessThan(nodeLine);
  });

  it("escapes single quotes in the captured PATH (defensive — unusual but valid)", () => {
    const weirdPath = "/abs/with'apostrophe/bin:/usr/bin";
    const script = renderNodeWrapper({
      nodePath: "/abs/node",
      jsEntryPath: "/abs/cli.js",
      capturedPath: weirdPath,
      capturedUser: "test",
      capturedShell: "/bin/zsh",
    });
    expect(script).toContain("/abs/with'\\''apostrophe/bin:/usr/bin");
  });

  it("bakes USER, LOGNAME and SHELL into the wrapper (claude-cli auth needs them)", () => {
    // Regression for the fourth Chrome-spawn env bug: claude-cli's keyring
    // lookup returns "Not logged in" when USER is unset, even if HOME and
    // PATH resolve. Chrome forwards HOME but not USER/SHELL. The wrapper
    // restores both explicitly.
    const script = renderNodeWrapper({
      nodePath: "/abs/node",
      jsEntryPath: "/abs/cli.js",
      capturedPath: "/usr/bin:/bin",
      capturedUser: "tibtof",
      capturedShell: "/bin/zsh",
    });
    expect(script).toContain("USER='tibtof'");
    expect(script).toContain("LOGNAME='tibtof'");
    expect(script).toContain("SHELL='/bin/zsh'");
    expect(script).toMatch(/export PATH USER LOGNAME SHELL/);
  });
});

// ---------------------------------------------------------------------------
// renderNodeWrapper — passThroughEnv (ADR-35, Fix 2)
// ---------------------------------------------------------------------------

describe("renderNodeWrapper — passThroughEnv (ADR-35)", () => {
  const BASE_INPUT = {
    nodePath: "/usr/local/bin/node",
    jsEntryPath: "/abs/cli.js",
    capturedPath: "/usr/bin:/bin",
    capturedUser: "test",
    capturedShell: "/bin/sh",
  } as const;

  it("passThroughEnv present → wrapper contains NAME='value' and export NAME", () => {
    const passThroughEnv: readonly PassThroughEnvVar[] = [
      { name: "AZURE_DEVOPS_EXT_PAT", value: "my_ado_pat_abc123" },
    ];
    const script = renderNodeWrapper({ ...BASE_INPUT, passThroughEnv });
    expect(script).toContain("AZURE_DEVOPS_EXT_PAT='my_ado_pat_abc123'");
    expect(script).toContain("export AZURE_DEVOPS_EXT_PAT");
  });

  it("passThroughEnv absent → no AZURE_DEVOPS_EXT_PAT line at all", () => {
    const script = renderNodeWrapper({ ...BASE_INPUT });
    expect(script).not.toContain("AZURE_DEVOPS_EXT_PAT");
  });

  it("passThroughEnv empty array → no AZURE_DEVOPS_EXT_PAT line at all", () => {
    const script = renderNodeWrapper({ ...BASE_INPUT, passThroughEnv: [] });
    expect(script).not.toContain("AZURE_DEVOPS_EXT_PAT");
  });

  it("entry with empty value is silently skipped — no empty export line", () => {
    const passThroughEnv: readonly PassThroughEnvVar[] = [
      { name: "AZURE_DEVOPS_EXT_PAT", value: "" },
    ];
    const script = renderNodeWrapper({ ...BASE_INPUT, passThroughEnv });
    expect(script).not.toContain("AZURE_DEVOPS_EXT_PAT");
    // Specifically: no 'export AZURE_DEVOPS_EXT_PAT=' shadow line
    expect(script).not.toMatch(/export AZURE_DEVOPS_EXT_PAT/);
  });

  it("value containing a single quote is single-quote-escaped", () => {
    // A PAT value like "abc'def" must be escaped as 'abc'\''def'
    const passThroughEnv: readonly PassThroughEnvVar[] = [
      { name: "AZURE_DEVOPS_EXT_PAT", value: "abc'def" },
    ];
    const script = renderNodeWrapper({ ...BASE_INPUT, passThroughEnv });
    // The escaped form of "abc'def" in single-quoted shell is 'abc'\''def'
    expect(script).toContain("AZURE_DEVOPS_EXT_PAT='abc'\\''def'");
    expect(script).toContain("export AZURE_DEVOPS_EXT_PAT");
  });

  it("value with special shell metacharacters is safely quoted", () => {
    const passThroughEnv: readonly PassThroughEnvVar[] = [
      { name: "AZURE_DEVOPS_EXT_PAT", value: "tok$en&value;here" },
    ];
    const script = renderNodeWrapper({ ...BASE_INPUT, passThroughEnv });
    expect(script).toContain("AZURE_DEVOPS_EXT_PAT='tok$en&value;here'");
  });

  it("CANARY: PAT value appears exactly once in the wrapper (no duplication into comments)", () => {
    const PAT = "UNIQUE_CANARY_PAT_abc123xyz";
    const passThroughEnv: readonly PassThroughEnvVar[] = [
      { name: "AZURE_DEVOPS_EXT_PAT", value: PAT },
    ];
    const script = renderNodeWrapper({ ...BASE_INPUT, passThroughEnv });
    // The PAT value must appear exactly once — in the assignment line.
    const occurrences = (script.match(new RegExp(PAT, "g")) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("invalid env var name throws (programmer error guard)", () => {
    const passThroughEnv: readonly PassThroughEnvVar[] = [
      { name: "lowercase_name", value: "value" },
    ];
    expect(() => renderNodeWrapper({ ...BASE_INPUT, passThroughEnv })).toThrow(
      "invalid env var name",
    );
  });

  it("invalid env var name with injection characters throws", () => {
    const passThroughEnv: readonly PassThroughEnvVar[] = [
      { name: "NAME; rm -rf /", value: "value" },
    ];
    expect(() => renderNodeWrapper({ ...BASE_INPUT, passThroughEnv })).toThrow(
      "invalid env var name",
    );
  });

  it("multiple pass-through entries are all emitted", () => {
    const passThroughEnv: readonly PassThroughEnvVar[] = [
      { name: "AZURE_DEVOPS_EXT_PAT", value: "pat_value" },
      { name: "MY_OTHER_SECRET", value: "other_value" },
    ];
    const script = renderNodeWrapper({ ...BASE_INPUT, passThroughEnv });
    expect(script).toContain("AZURE_DEVOPS_EXT_PAT='pat_value'");
    expect(script).toContain("export AZURE_DEVOPS_EXT_PAT");
    expect(script).toContain("MY_OTHER_SECRET='other_value'");
    expect(script).toContain("export MY_OTHER_SECRET");
  });

  it("existing export PATH USER LOGNAME SHELL line is not modified", () => {
    const passThroughEnv: readonly PassThroughEnvVar[] = [
      { name: "AZURE_DEVOPS_EXT_PAT", value: "pat" },
    ];
    const script = renderNodeWrapper({ ...BASE_INPUT, passThroughEnv });
    // The core identity exports must still be present and unchanged.
    expect(script).toMatch(/export PATH USER LOGNAME SHELL/);
  });
});
