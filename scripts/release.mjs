#!/usr/bin/env node
/**
 * Release packaging script for LGTM-Buzzer.
 *
 * Produces two artifacts under dist/ (or --output-dir):
 *   lgtm-buzzer-extension-v<version>.zip   MV3-ready Chrome extension
 *   lgtm-buzzer-host-v<version>.tar.gz     Bundled host + installer (no npm install needed)
 *   checksums.txt                           SHA256 + byte size of each artifact
 *
 * Usage:
 *   npm run release:build [-- options]
 *   node scripts/release.mjs [options]
 *
 * Options:
 *   --force                Overwrite existing dist/ artifacts for the same version
 *   --allow-dirty          Skip the "uncommitted changes" gate
 *   --skip-check           Skip `npm run check` (NOT recommended for real releases)
 *   --no-checksums         Do not write checksums.txt
 *   --output-dir <path>    Override the default dist/ output directory
 *   --help, -h             Print this usage and exit 0
 *
 * @module release
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// JSDoc types (documentation only — plain JS)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ReleaseConfig
 * @property {string} version            Read from root package.json.
 * @property {string} repoRoot           Absolute path to the repo root.
 * @property {string} outputDir          Where to write the two artifacts.
 * @property {boolean} force             Overwrite existing artifacts.
 * @property {boolean} allowDirty        Skip git-clean check.
 * @property {boolean} skipCheck         Skip `npm run check`.
 * @property {boolean} writeChecksums    Emit dist/checksums.txt.
 */

/**
 * @typedef {Object} ReleaseArtifact
 * @property {"extension" | "host" | "checksums"} kind
 * @property {string} path               Absolute path to the artifact.
 * @property {number} sizeBytes
 * @property {string} sha256             Hex-encoded SHA256, or "" for checksums.txt itself.
 */

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Reads the root package.json and returns the version string.
 *
 * @param {string} repoRoot
 * @returns {string}
 * @throws {Error} if package.json is missing or has no version field (invariant violation).
 */
export const readRootVersion = (repoRoot) => {
  const pkgPath = path.join(repoRoot, "package.json");
  let raw;
  try {
    raw = fs.readFileSync(pkgPath, "utf8");
  } catch (/** @type {unknown} */ err) {
    throw new Error(
      `release: cannot read root package.json at ${pkgPath}: ${String(err)}`,
    );
  }
  const pkg = JSON.parse(raw);
  if (typeof pkg.version !== "string" || pkg.version.length === 0) {
    throw new Error(
      `release: root package.json at ${pkgPath} is missing a "version" field`,
    );
  }
  return pkg.version;
};

/**
 * Returns true when the working tree has no uncommitted changes.
 *
 * @param {string} repoRoot
 * @returns {boolean}
 */
export const isWorkingTreeClean = (repoRoot) => {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `release: git status failed (exit ${String(result.status)}): ${result.stderr ?? ""}`,
    );
  }
  return (result.stdout ?? "").trim().length === 0;
};

/**
 * Computes the three artifact paths under outputDir.
 *
 * @param {{ version: string, outputDir: string }} input
 * @returns {{ extensionZip: string, hostTarball: string, checksums: string }}
 */
export const computeArtifactPaths = ({ version, outputDir }) => ({
  extensionZip: path.join(outputDir, `lgtm-buzzer-extension-v${version}.zip`),
  hostTarball: path.join(outputDir, `lgtm-buzzer-host-v${version}.tar.gz`),
  checksums: path.join(outputDir, "checksums.txt"),
});

/**
 * Substitutes `__HOST_BINARY_PATH__` and `__EXTENSION_ID__` in the manifest
 * template string. Values are JSON-escaped so the result remains valid JSON.
 *
 * @param {{ template: string, hostBinaryPath: string, extensionId: string }} input
 * @returns {string} Substituted JSON text.
 * @throws {Error} if either placeholder is absent from the template.
 */
export const fillManifestTemplate = ({ template, hostBinaryPath, extensionId }) => {
  if (!template.includes("__HOST_BINARY_PATH__")) {
    throw new Error(
      "fillManifestTemplate: template is missing the __HOST_BINARY_PATH__ placeholder",
    );
  }
  if (!template.includes("__EXTENSION_ID__")) {
    throw new Error(
      "fillManifestTemplate: template is missing the __EXTENSION_ID__ placeholder",
    );
  }

  // JSON.stringify produces a quoted string; slice off the surrounding quotes
  // to get only the JSON-escaped interior.
  const escapedBinaryPath = JSON.stringify(hostBinaryPath).slice(1, -1);
  const escapedExtensionId = JSON.stringify(extensionId).slice(1, -1);

  return template
    .replace(/__HOST_BINARY_PATH__/g, escapedBinaryPath)
    .replace(/__EXTENSION_ID__/g, escapedExtensionId);
};

/**
 * Lists the absolute paths that belong in the host tarball, given a staging
 * directory laid out by stageHostFiles.
 *
 * @param {string} stagingDir  Absolute path to the versioned staging root
 *   (e.g. /tmp/lgtm-buzzer-release-1234/lgtm-buzzer-host-v0.1.0/).
 * @returns {readonly string[]}
 */
export const computeHostTarballFileList = (stagingDir) => {
  return [
    path.join(stagingDir, "host", "index.js"),
    path.join(stagingDir, "host", "install-manifest.js"),
    path.join(stagingDir, "host", "manifest.template.json"),
    path.join(stagingDir, "LICENSE"),
    path.join(stagingDir, "README.md"),
  ];
};

/**
 * Parses argv and returns a ReleaseConfig. Throws on unknown flags.
 *
 * @param {readonly string[]} argv   Should be process.argv.slice(2).
 * @param {string} repoRoot
 * @returns {ReleaseConfig}
 */
export const parseArgs = (argv, repoRoot) => {
  let force = false;
  let allowDirty = false;
  let skipCheck = false;
  let writeChecksums = true;
  let outputDir = path.join(repoRoot, "dist");

  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case "--force":
        force = true;
        break;
      case "--allow-dirty":
        allowDirty = true;
        break;
      case "--skip-check":
        skipCheck = true;
        break;
      case "--no-checksums":
        writeChecksums = false;
        break;
      case "--output-dir": {
        const dir = args.shift();
        if (dir === undefined) {
          throw new Error("release: --output-dir requires a path argument");
        }
        outputDir = path.resolve(repoRoot, dir);
        break;
      }
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        // Handle --output-dir=<path> form
        if (arg !== undefined && arg.startsWith("--output-dir=")) {
          const dir = arg.slice("--output-dir=".length);
          outputDir = path.resolve(repoRoot, dir);
          break;
        }
        throw new Error(`release: unknown flag: ${String(arg)}`);
    }
  }

  // Version is read after arg parsing so --help works without package.json.
  const version = readRootVersion(repoRoot);

  return { version, repoRoot, outputDir, force, allowDirty, skipCheck, writeChecksums };
};

// ---------------------------------------------------------------------------
// I/O helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Computes the SHA256 of a file as a lowercase hex string.
 *
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export const sha256File = async (filePath) => {
  const content = await fs.promises.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
};

/**
 * Bundles a host entry point into a single ESM file using esbuild.
 *
 * @param {{ entryPoint: string, outFile: string }} input
 * @returns {Promise<void>}
 */
export const bundleHost = async ({ entryPoint, outFile }) => {
  // Dynamic import so the script can still parse when esbuild isn't installed.
  const esbuild = await import("esbuild");

  await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: outFile,
    banner: { js: "#!/usr/bin/env node" },
    external: [],
    minify: false,
    sourcemap: "inline",
    legalComments: "inline",
    logLevel: "warning",
  });

  // Make executable.
  await fs.promises.chmod(outFile, 0o755);
};

/**
 * Stages the host tarball contents under a temp dir.
 * Bundles host/index.js + host/install-manifest.js, copies
 * manifest.template.json, README.md, LICENSE.
 *
 * @param {{ repoRoot: string, version: string, tmpDir: string }} input
 * @returns {Promise<string>} Absolute path to the staging directory's versioned root.
 */
export const stageHostFiles = async ({ repoRoot, version, tmpDir }) => {
  const stagingRoot = path.join(tmpDir, `lgtm-buzzer-host-v${version}`);
  const hostDir = path.join(stagingRoot, "host");
  fs.mkdirSync(hostDir, { recursive: true });

  // Bundle the two entry points.
  await bundleHost({
    entryPoint: path.join(repoRoot, "packages", "host", "dist", "cli.js"),
    outFile: path.join(hostDir, "index.js"),
  });
  await bundleHost({
    entryPoint: path.join(repoRoot, "packages", "host", "dist", "install-manifest.js"),
    outFile: path.join(hostDir, "install-manifest.js"),
  });

  // Copy manifest template.
  fs.copyFileSync(
    path.join(repoRoot, "packages", "host", "manifest.template.json"),
    path.join(hostDir, "manifest.template.json"),
  );

  // Write the tarball-specific README.
  const readmeContent = buildTarballReadme(version);
  fs.writeFileSync(path.join(stagingRoot, "README.md"), readmeContent, "utf8");

  // Copy LICENSE.
  fs.copyFileSync(path.join(repoRoot, "LICENSE"), path.join(stagingRoot, "LICENSE"));

  return stagingRoot;
};

/**
 * Runs `npm --workspace=@lgtm-buzzer/extension run zip`, then renames the
 * wxt-produced zip into the output path.
 *
 * @param {{ repoRoot: string, outputZip: string, force: boolean }} input
 * @returns {Promise<void>}
 */
export const buildExtensionZip = async ({ repoRoot, outputZip, force }) => {
  // Run wxt zip via npm workspace command.
  const result = spawnSync(
    "npm",
    ["--workspace=@lgtm-buzzer/extension", "run", "zip"],
    { cwd: repoRoot, stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error(
      `release: npm run zip failed with exit code ${String(result.status)}`,
    );
  }

  // Find the produced zip in packages/extension/.output/
  const outputBase = path.join(repoRoot, "packages", "extension", ".output");
  let candidates;
  try {
    candidates = fs.readdirSync(outputBase).filter((f) => f.endsWith(".zip"));
  } catch (/** @type {unknown} */ err) {
    throw new Error(
      `release: cannot read extension output dir ${outputBase}: ${String(err)}`,
    );
  }

  if (candidates.length === 0) {
    throw new Error(
      `release: wxt zip produced no .zip file in ${outputBase}. ` +
        `Check that 'npm run zip' completed successfully.`,
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `release: wxt zip produced multiple .zip files in ${outputBase}: ` +
        candidates.join(", ") +
        `. Remove stale zips and retry.`,
    );
  }

  const srcZip = path.join(outputBase, candidates[0]);

  if (force && fs.existsSync(outputZip)) {
    fs.rmSync(outputZip);
  }

  fs.mkdirSync(path.dirname(outputZip), { recursive: true });
  fs.renameSync(srcZip, outputZip);
};

/**
 * Builds the host tarball from a staging directory.
 *
 * @param {{ stagingRoot: string, outputTarball: string, tmpDir: string }} input
 * @returns {Promise<void>}
 */
export const buildHostTarball = async ({ stagingRoot, outputTarball, tmpDir }) => {
  fs.mkdirSync(path.dirname(outputTarball), { recursive: true });

  // The tarball top-level entry is the versioned dir name (not tmpDir itself).
  const dirName = path.basename(stagingRoot);
  const tarResult = spawnSync(
    "tar",
    ["-czf", outputTarball, "-C", tmpDir, dirName],
    { stdio: "inherit" },
  );

  if (tarResult.error) {
    if (
      tarResult.error instanceof Error &&
      "code" in tarResult.error &&
      tarResult.error.code === "ENOENT"
    ) {
      throw new Error(
        "release: tar not found on PATH; install GNU tar or BSD tar",
      );
    }
    throw tarResult.error;
  }
  if (tarResult.status !== 0) {
    throw new Error(
      `release: tar failed with exit code ${String(tarResult.status)}`,
    );
  }
};

/**
 * Writes `<outputDir>/checksums.txt` with one line per artifact:
 *   <sha256>  <byte_size>  <filename>
 * Lines are sorted by filename for stable diffs.
 *
 * @param {{ outputDir: string, artifacts: readonly ReleaseArtifact[] }} input
 * @returns {Promise<void>}
 */
export const writeChecksumsFile = async ({ outputDir, artifacts }) => {
  const lines = artifacts
    .filter((a) => a.kind !== "checksums")
    .map((a) => `${a.sha256}  ${String(a.sizeBytes)}  ${path.basename(a.path)}`)
    .sort();

  const content = lines.join("\n") + "\n";
  const checksumsPath = path.join(outputDir, "checksums.txt");
  await fs.promises.writeFile(checksumsPath, content, "utf8");
};

/**
 * Entry point. Runs the full release pipeline.
 *
 * @param {ReleaseConfig} config
 * @returns {Promise<readonly ReleaseArtifact[]>}
 */
export const runRelease = async (config) => {
  const { version, repoRoot, outputDir, force, allowDirty, skipCheck, writeChecksums } =
    config;

  const paths = computeArtifactPaths({ version, outputDir });

  // ------------------------------------------------------------------
  // Pre-flight checks
  // ------------------------------------------------------------------
  if (!allowDirty) {
    const clean = isWorkingTreeClean(repoRoot);
    if (!clean) {
      const statusResult = spawnSync("git", ["status", "--porcelain"], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      const lines = (statusResult.stdout ?? "").trim().split("\n");
      const shown = lines.slice(0, 5).join("\n");
      const extra = lines.length > 5 ? `\n  … and ${lines.length - 5} more` : "";
      throw new Error(
        `release: working tree has uncommitted changes — pass --allow-dirty to override.\n` +
          `  ${shown}${extra}`,
      );
    }
  }

  const collidingPaths = [paths.extensionZip, paths.hostTarball].filter((p) =>
    fs.existsSync(p),
  );
  if (!force && collidingPaths.length > 0) {
    throw new Error(
      `release: artifact(s) already exist — pass --force to overwrite:\n` +
        collidingPaths.map((p) => `  ${p}`).join("\n"),
    );
  }

  // ------------------------------------------------------------------
  // Build gate
  // ------------------------------------------------------------------
  if (!skipCheck) {
    console.log("release: running npm run check…");
    const checkResult = spawnSync("npm", ["run", "check"], {
      cwd: repoRoot,
      stdio: "inherit",
    });
    if (checkResult.status !== 0) {
      throw new Error(
        `release: npm run check failed with exit code ${String(checkResult.status)}`,
      );
    }
  } else {
    console.log("release: --skip-check is set; skipping npm run check");
  }

  // ------------------------------------------------------------------
  // Stage host files
  // ------------------------------------------------------------------
  console.log("release: staging host files…");
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `lgtm-buzzer-release-${String(process.pid)}-`),
  );

  // Register cleanup on exit (both normal exit and SIGINT).
  const cleanup = () => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors.
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  const stagingRoot = await stageHostFiles({ repoRoot, version, tmpDir });

  // ------------------------------------------------------------------
  // Build extension zip
  // ------------------------------------------------------------------
  console.log("release: building extension zip…");
  await buildExtensionZip({ repoRoot, outputZip: paths.extensionZip, force });

  // ------------------------------------------------------------------
  // Build host tarball
  // ------------------------------------------------------------------
  console.log("release: building host tarball…");
  if (force && fs.existsSync(paths.hostTarball)) {
    fs.rmSync(paths.hostTarball);
  }
  await buildHostTarball({
    stagingRoot,
    outputTarball: paths.hostTarball,
    tmpDir,
  });

  // ------------------------------------------------------------------
  // Compute checksums
  // ------------------------------------------------------------------
  /** @type {ReleaseArtifact[]} */
  const artifacts = [];

  for (const [kind, artifactPath] of /** @type {[string, string][]} */ ([
    ["extension", paths.extensionZip],
    ["host", paths.hostTarball],
  ])) {
    const sha256 = await sha256File(artifactPath);
    const stat = fs.statSync(artifactPath);
    artifacts.push({
      kind: /** @type {"extension" | "host"} */ (kind),
      path: artifactPath,
      sizeBytes: stat.size,
      sha256,
    });
  }

  if (writeChecksums) {
    await writeChecksumsFile({ outputDir, artifacts });
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log("\nrelease: done!\n");
  console.log("Artifacts:");
  for (const artifact of artifacts) {
    const sizeKb = (artifact.sizeBytes / 1024).toFixed(1);
    console.log(
      `  [${artifact.kind}] ${path.basename(artifact.path)}  (${sizeKb} KB)`,
    );
    console.log(`    SHA256: ${artifact.sha256}`);
    console.log(`    Path:   ${artifact.path}`);
  }
  if (writeChecksums) {
    console.log(`\n  checksums: ${paths.checksums}`);
  }

  return artifacts;
};

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

/**
 * Builds the README.md content to include in the host tarball.
 *
 * @param {string} version
 * @returns {string}
 */
const buildTarballReadme = (version) => `# LGTM-Buzzer Native Messaging Host v${version}

## What is this?

This package contains the native messaging host for the LGTM-Buzzer browser
extension. The host runs as a subprocess and bridges the extension to your
local LLM CLI (Claude Code, Codex, or \`gh copilot\`).

## Prerequisites

- Node.js 22 or later on your PATH
- Chrome or a Chromium-based browser with the LGTM-Buzzer extension installed

## Install (macOS and Linux)

1. Extract this archive:
   \`\`\`bash
   tar -xzf lgtm-buzzer-host-v${version}.tar.gz
   \`\`\`

2. Set your Chrome extension ID (copy it from \`chrome://extensions\`):
   \`\`\`bash
   export LGTM_BUZZER_EXTENSION_ID=<your-extension-id>
   \`\`\`

3. Run the installer:
   \`\`\`bash
   node lgtm-buzzer-host-v${version}/host/install-manifest.js
   \`\`\`

   The installer writes a native-messaging manifest to the per-OS Chrome path:
   - **macOS**: \`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/\`
   - **Linux**: \`~/.config/google-chrome/NativeMessagingHosts/\`

4. Restart Chrome if it is already running.

## Credentials

The host receives LLM credentials from the extension at runtime (via the native
messaging protocol). You do not need to put any tokens on disk for v1.

## Uninstall

Remove the native-messaging manifest file:
- **macOS**: \`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.lgtm_buzzer.host.json\`
- **Linux**: \`~/.config/google-chrome/NativeMessagingHosts/com.lgtm_buzzer.host.json\`

Then delete the extracted folder:
\`\`\`bash
rm -rf lgtm-buzzer-host-v${version}/
\`\`\`

## Windows

Windows is not supported in v1. Users on Windows may run the host under WSL.

## Source

https://github.com/tibtof/lgtm-buzzer
`;

/** Prints usage to stdout. */
const printHelp = () => {
  console.log(`Usage: npm run release:build [-- options]
       node scripts/release.mjs [options]

Packages the LGTM-Buzzer extension zip and host tarball for a release.

Options:
  --force                Overwrite existing dist/ artifacts for the same version
  --allow-dirty          Skip the "uncommitted changes" gate (CI / hotfix path)
  --skip-check           Skip \`npm run check\`. NOT recommended for real releases.
  --no-checksums         Do not write checksums.txt
  --output-dir <path>    Override the default dist/ output directory
  --help, -h             Print this usage and exit 0

Default behavior (no flags):
  1. Refuse if the working tree is dirty.
  2. Refuse if artifacts for the current version already exist.
  3. Run \`npm run check\` (full CI gate).
  4. Build artifacts under dist/.
  5. Write dist/checksums.txt.
  6. Print a summary table.
`);
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const isEntryPoint = () => {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const entry = process.argv[1];
    if (entry === undefined) return false;
    return path.resolve(thisFile) === path.resolve(entry);
  } catch {
    return false;
  }
};

if (isEntryPoint()) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  let config;
  try {
    config = parseArgs(process.argv.slice(2), repoRoot);
  } catch (/** @type {unknown} */ err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  runRelease(config).catch((/** @type {unknown} */ err) => {
    console.error(`\nerror: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
