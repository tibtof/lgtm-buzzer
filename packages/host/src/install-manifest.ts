#!/usr/bin/env node
/**
 * Installs the Chrome native-messaging manifest to the per-OS path.
 *
 * Supported platforms:
 *   - macOS  → ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
 *   - Linux  → ~/.config/google-chrome/NativeMessagingHosts/
 *   - Other  → prints a message to stderr and exits 0.
 *
 * The extension ID can be supplied via LGTM_BUZZER_EXTENSION_ID env-var.
 * Defaults to "<unset>" when the var is absent.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** The stable native-messaging host name, matching NATIVE_HOST_ID in the extension. */
const NATIVE_HOST_NAME = "com.lgtm_buzzer.host" as const;

/** The filename Chrome expects on disk. */
const MANIFEST_FILENAME = `${NATIVE_HOST_NAME}.json` as const;

// ---------------------------------------------------------------------------
// Pure helper
// ---------------------------------------------------------------------------

/** Input for `buildManifest`. */
export type BuildManifestInput = {
  readonly platform: NodeJS.Platform;
  readonly homedir: string;
  readonly hostBinaryPath: string;
  readonly extensionId: string;
};

/** Output when the platform is supported. */
export type SupportedManifestResult = {
  readonly supported: true;
  readonly targetDir: string;
  readonly targetPath: string;
  readonly manifest: {
    readonly name: string;
    readonly description: string;
    readonly path: string;
    readonly type: "stdio";
    readonly allowed_origins: readonly [string];
  };
};

/** Output when the platform is not supported. */
export type UnsupportedManifestResult = {
  readonly supported: false;
};

/** Union result of `buildManifest`. */
export type BuildManifestResult = SupportedManifestResult | UnsupportedManifestResult;

/**
 * Computes the native-messaging manifest and its install path for a given
 * platform, without performing any I/O.
 *
 * @param input - Platform, home directory, absolute path to the host binary,
 *   and the Chrome extension ID.
 * @returns `{ supported: false }` for unsupported platforms; otherwise a
 *   `supported: true` object with `targetDir`, `targetPath`, and the manifest
 *   JSON object.
 */
export const buildManifest = (input: BuildManifestInput): BuildManifestResult => {
  const { platform, homedir, hostBinaryPath, extensionId } = input;

  let nativeMessagingHostsDir: string;

  if (platform === "darwin") {
    nativeMessagingHostsDir = path.join(
      homedir,
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "NativeMessagingHosts",
    );
  } else if (platform === "linux") {
    nativeMessagingHostsDir = path.join(
      homedir,
      ".config",
      "google-chrome",
      "NativeMessagingHosts",
    );
  } else {
    return { supported: false };
  }

  const targetDir = nativeMessagingHostsDir;
  const targetPath = path.join(targetDir, MANIFEST_FILENAME);

  const manifest = {
    name: NATIVE_HOST_NAME,
    description: "LGTM-Buzzer native messaging host",
    path: hostBinaryPath,
    type: "stdio" as const,
    allowed_origins: [`chrome-extension://${extensionId}/`] as const,
  };

  return { supported: true, targetDir, targetPath, manifest };
};

// ---------------------------------------------------------------------------
// Effectful entry point
// ---------------------------------------------------------------------------

/**
 * Resolves the absolute path to `packages/host/dist/cli.js` relative to this
 * file, which lives at `packages/host/dist/install-manifest.js` after build.
 */
const resolveHostBinaryPath = (): string => {
  const thisFile = fileURLToPath(import.meta.url);
  const distDir = path.dirname(thisFile);
  return path.join(distDir, "cli.js");
};

/**
 * Entry point: writes the native-messaging manifest to the per-OS Chrome path.
 *
 * Reads `process.platform`, `os.homedir()`, and the `LGTM_BUZZER_EXTENSION_ID`
 * environment variable. Logs to stderr. Exits 0 on success or unsupported
 * platform; does not catch fs errors (let Node print them naturally).
 */
export const main = (): void => {
  const platform = process.platform;
  const homedir = os.homedir();
  const hostBinaryPath = resolveHostBinaryPath();
  const extensionId = process.env["LGTM_BUZZER_EXTENSION_ID"] ?? "<unset>";

  const result = buildManifest({ platform, homedir, hostBinaryPath, extensionId });

  if (!result.supported) {
    process.stderr.write(
      `install-manifest: not supported on this platform (${platform})\n`,
    );
    process.exit(0);
  }

  fs.mkdirSync(result.targetDir, { recursive: true });
  fs.writeFileSync(result.targetPath, JSON.stringify(result.manifest, null, 2) + "\n", {
    mode: 0o644,
  });

  process.stderr.write(`Installed native-messaging manifest at ${result.targetPath}\n`);
  process.exit(0);
};

// Run only when executed directly (not imported as a module in tests).
// In Node ESM, import.meta.url matches process.argv[1] only when the file is
// the entry point. Use a slightly different check that works with both ts-node
// and the compiled .js output: compare the resolved paths.
const isEntryPoint = (): boolean => {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    // process.argv[1] is the script path passed to node
    const entry = process.argv[1];
    if (entry === undefined) return false;
    return path.resolve(thisFile) === path.resolve(entry);
  } catch {
    return false;
  }
};

if (isEntryPoint()) {
  main();
}
