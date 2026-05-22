/**
 * Tests for scripts/release.mjs pure helpers and I/O wrappers.
 *
 * The smoke test for runRelease is skipped here because it requires a fully
 * built host dist/ and a working esbuild installation. Run it manually with:
 *   npm run release:check
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Dynamic import resolves the .mjs file at test runtime.
// The explicit path is relative to the test runner's cwd (repo root).
const {
  readRootVersion,
  computeArtifactPaths,
  fillManifestTemplate,
  computeHostTarballFileList,
  parseArgs,
  sha256File,
} = await import("./release.mjs");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "release-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// readRootVersion
// ---------------------------------------------------------------------------

describe("readRootVersion", () => {
  it("reads the version from a package.json", () => {
    const pkgDir = fs.mkdtempSync(path.join(tmpDir, "pkg-"));
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "test", version: "1.2.3" }),
      "utf8",
    );
    expect(readRootVersion(pkgDir)).toBe("1.2.3");
  });

  it("throws when package.json is missing", () => {
    const emptyDir = fs.mkdtempSync(path.join(tmpDir, "empty-"));
    expect(() => readRootVersion(emptyDir)).toThrow("cannot read root package.json");
  });

  it("throws when version field is missing", () => {
    const pkgDir = fs.mkdtempSync(path.join(tmpDir, "nover-"));
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "test" }),
      "utf8",
    );
    expect(() => readRootVersion(pkgDir)).toThrow('missing a "version" field');
  });

  it("throws when version is an empty string", () => {
    const pkgDir = fs.mkdtempSync(path.join(tmpDir, "emver-"));
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "test", version: "" }),
      "utf8",
    );
    expect(() => readRootVersion(pkgDir)).toThrow('missing a "version" field');
  });
});

// ---------------------------------------------------------------------------
// computeArtifactPaths
// ---------------------------------------------------------------------------

describe("computeArtifactPaths", () => {
  it("returns the three expected absolute paths", () => {
    const outputDir = "/abs/dist";
    const result = computeArtifactPaths({ version: "0.1.0", outputDir });
    expect(result.extensionZip).toBe("/abs/dist/lgtm-buzzer-extension-v0.1.0.zip");
    expect(result.hostTarball).toBe("/abs/dist/lgtm-buzzer-host-v0.1.0.tar.gz");
    expect(result.checksums).toBe("/abs/dist/checksums.txt");
  });

  it("paths are under the given outputDir", () => {
    const outputDir = "/tmp/my-release";
    const result = computeArtifactPaths({ version: "2.0.0", outputDir });
    for (const p of [result.extensionZip, result.hostTarball, result.checksums]) {
      expect(p.startsWith(outputDir)).toBe(true);
    }
  });

  it("version appears in artifact filenames", () => {
    const result = computeArtifactPaths({ version: "3.14.159", outputDir: "/dist" });
    expect(result.extensionZip).toContain("3.14.159");
    expect(result.hostTarball).toContain("3.14.159");
  });
});

// ---------------------------------------------------------------------------
// fillManifestTemplate
// ---------------------------------------------------------------------------

const TEMPLATE = `{
  "name": "com.lgtm_buzzer.host",
  "description": "LGTM-Buzzer native messaging host",
  "path": "__HOST_BINARY_PATH__",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://__EXTENSION_ID__/"]
}
`;

describe("fillManifestTemplate", () => {
  it("substitutes both placeholders — happy path", () => {
    const result = fillManifestTemplate({
      template: TEMPLATE,
      hostBinaryPath: "/usr/local/lgtm/host/index.js",
      extensionId: "abcdefghijklmnop",
    });
    const parsed = JSON.parse(result) as { path: string; allowed_origins: string[] };
    expect(parsed.path).toBe("/usr/local/lgtm/host/index.js");
    expect(parsed.allowed_origins[0]).toBe("chrome-extension://abcdefghijklmnop/");
  });

  it("JSON-escapes a backslash in the binary path", () => {
    const result = fillManifestTemplate({
      template: TEMPLATE,
      hostBinaryPath: "C:\\Users\\user\\lgtm\\host\\index.js",
      extensionId: "ext123",
    });
    const parsed = JSON.parse(result) as { path: string };
    expect(parsed.path).toBe("C:\\Users\\user\\lgtm\\host\\index.js");
  });

  it("JSON-escapes a double-quote in the binary path", () => {
    const result = fillManifestTemplate({
      template: TEMPLATE,
      hostBinaryPath: '/weird"path/index.js',
      extensionId: "ext123",
    });
    const parsed = JSON.parse(result) as { path: string };
    expect(parsed.path).toBe('/weird"path/index.js');
  });

  it("preserves forward slashes in the extension ID", () => {
    const result = fillManifestTemplate({
      template: TEMPLATE,
      hostBinaryPath: "/abs/index.js",
      extensionId: "abcd/1234",
    });
    const parsed = JSON.parse(result) as { allowed_origins: string[] };
    expect(parsed.allowed_origins[0]).toBe("chrome-extension://abcd/1234/");
  });

  it("throws when __HOST_BINARY_PATH__ is absent", () => {
    const badTemplate = TEMPLATE.replace("__HOST_BINARY_PATH__", "__NOPE__");
    expect(() =>
      fillManifestTemplate({
        template: badTemplate,
        hostBinaryPath: "/abs/index.js",
        extensionId: "ext",
      }),
    ).toThrow("__HOST_BINARY_PATH__");
  });

  it("throws when __EXTENSION_ID__ is absent", () => {
    const badTemplate = TEMPLATE.replace("__EXTENSION_ID__", "__NOPE__");
    expect(() =>
      fillManifestTemplate({
        template: badTemplate,
        hostBinaryPath: "/abs/index.js",
        extensionId: "ext",
      }),
    ).toThrow("__EXTENSION_ID__");
  });
});

// ---------------------------------------------------------------------------
// computeHostTarballFileList
// ---------------------------------------------------------------------------

describe("computeHostTarballFileList", () => {
  it("returns the expected five absolute paths", () => {
    const stagingDir = "/tmp/lgtm-buzzer-host-v0.1.0";
    const list = computeHostTarballFileList(stagingDir);
    expect(list).toHaveLength(5);
    expect(list).toContain(path.join(stagingDir, "host", "index.js"));
    expect(list).toContain(path.join(stagingDir, "host", "install-manifest.js"));
    expect(list).toContain(path.join(stagingDir, "host", "manifest.template.json"));
    expect(list).toContain(path.join(stagingDir, "LICENSE"));
    expect(list).toContain(path.join(stagingDir, "README.md"));
  });

  it("all returned paths are absolute", () => {
    const list = computeHostTarballFileList("/some/staging");
    for (const p of list) {
      expect(path.isAbsolute(p)).toBe(true);
    }
  });

  it("all paths are under the staging dir", () => {
    const stagingDir = "/some/staging";
    const list = computeHostTarballFileList(stagingDir);
    for (const p of list) {
      expect(p.startsWith(stagingDir)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  // Write a mock package.json so readRootVersion succeeds.
  const setupMockPkg = (dir: string, version = "0.1.0") => {
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "test", version }),
      "utf8",
    );
  };

  it("defaults: no flags → force=false, allowDirty=false, skipCheck=false, writeChecksums=true, outputDir=<repoRoot>/dist", () => {
    setupMockPkg(tmpDir);
    const config = parseArgs([], tmpDir);
    expect(config.force).toBe(false);
    expect(config.allowDirty).toBe(false);
    expect(config.skipCheck).toBe(false);
    expect(config.writeChecksums).toBe(true);
    expect(config.outputDir).toBe(path.join(tmpDir, "dist"));
    expect(config.version).toBe("0.1.0");
    expect(config.repoRoot).toBe(tmpDir);
  });

  it("--force sets force=true", () => {
    setupMockPkg(tmpDir);
    const config = parseArgs(["--force"], tmpDir);
    expect(config.force).toBe(true);
  });

  it("--allow-dirty sets allowDirty=true", () => {
    setupMockPkg(tmpDir);
    const config = parseArgs(["--allow-dirty"], tmpDir);
    expect(config.allowDirty).toBe(true);
  });

  it("--skip-check sets skipCheck=true", () => {
    setupMockPkg(tmpDir);
    const config = parseArgs(["--skip-check"], tmpDir);
    expect(config.skipCheck).toBe(true);
  });

  it("--no-checksums sets writeChecksums=false", () => {
    setupMockPkg(tmpDir);
    const config = parseArgs(["--no-checksums"], tmpDir);
    expect(config.writeChecksums).toBe(false);
  });

  it("--output-dir <path> sets outputDir to the resolved path", () => {
    setupMockPkg(tmpDir);
    const customDir = path.join(tmpDir, "my-output");
    const config = parseArgs(["--output-dir", customDir], tmpDir);
    expect(config.outputDir).toBe(customDir);
  });

  it("--output-dir=<path> (equals form) sets outputDir", () => {
    setupMockPkg(tmpDir);
    const customDir = path.join(tmpDir, "my-output");
    const config = parseArgs([`--output-dir=${customDir}`], tmpDir);
    expect(config.outputDir).toBe(customDir);
  });

  it("multiple flags combined", () => {
    setupMockPkg(tmpDir);
    const config = parseArgs(["--force", "--allow-dirty", "--skip-check", "--no-checksums"], tmpDir);
    expect(config.force).toBe(true);
    expect(config.allowDirty).toBe(true);
    expect(config.skipCheck).toBe(true);
    expect(config.writeChecksums).toBe(false);
  });

  it("unknown flag throws", () => {
    setupMockPkg(tmpDir);
    expect(() => parseArgs(["--unknown-flag"], tmpDir)).toThrow("unknown flag");
  });

  it("--output-dir without value throws", () => {
    setupMockPkg(tmpDir);
    expect(() => parseArgs(["--output-dir"], tmpDir)).toThrow("requires a path argument");
  });
});

// ---------------------------------------------------------------------------
// sha256File
// ---------------------------------------------------------------------------

describe("sha256File", () => {
  it("returns the known SHA256 of 'hello'", async () => {
    const filePath = path.join(tmpDir, "hello.txt");
    fs.writeFileSync(filePath, "hello");
    const result = await sha256File(filePath);
    // SHA256 of the ASCII bytes for "hello"
    const expected = crypto.createHash("sha256").update("hello").digest("hex");
    expect(result).toBe(expected);
  });

  it("returns lowercase hex", async () => {
    const filePath = path.join(tmpDir, "data.bin");
    fs.writeFileSync(filePath, Buffer.from([0xff, 0x00, 0xab]));
    const result = await sha256File(filePath);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a 64-character hex string", async () => {
    const filePath = path.join(tmpDir, "empty.txt");
    fs.writeFileSync(filePath, "");
    const result = await sha256File(filePath);
    expect(result).toHaveLength(64);
  });
});
