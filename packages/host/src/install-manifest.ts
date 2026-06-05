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
// Pure helpers
// ---------------------------------------------------------------------------

/** Input for `renderManifestTemplate`. */
export type RenderManifestTemplateInput = {
  readonly template: string;
  readonly hostBinaryPath: string;
  readonly extensionId: string;
};

/**
 * Substitutes `__HOST_BINARY_PATH__` and `__EXTENSION_ID__` in the manifest
 * template string. Both placeholders are replaced with properly JSON-string-
 * escaped values so the result remains valid JSON.
 *
 * @param input - The template text and the two placeholder values.
 * @returns The template with both placeholders substituted.
 * @throws {Error} if either placeholder is absent from the template
 *   (invariant: template is authored alongside the installer).
 */
export const renderManifestTemplate = (input: RenderManifestTemplateInput): string => {
  const { template, hostBinaryPath, extensionId } = input;

  if (!template.includes("__HOST_BINARY_PATH__")) {
    throw new Error(
      "renderManifestTemplate: template is missing the __HOST_BINARY_PATH__ placeholder",
    );
  }
  if (!template.includes("__EXTENSION_ID__")) {
    throw new Error(
      "renderManifestTemplate: template is missing the __EXTENSION_ID__ placeholder",
    );
  }

  // JSON-encode the values so special chars (backslash, quote) are safely escaped.
  // JSON.stringify produces a quoted string like `"/abs/path"`, so we slice off the
  // surrounding quotes to get only the escaped interior.
  const escapedBinaryPath = JSON.stringify(hostBinaryPath).slice(1, -1);
  const escapedExtensionId = JSON.stringify(extensionId).slice(1, -1);

  return template
    .replace(/__HOST_BINARY_PATH__/g, escapedBinaryPath)
    .replace(/__EXTENSION_ID__/g, escapedExtensionId);
};

// ---------------------------------------------------------------------------
// buildManifest
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
 * Picks the host binary in `distDir`. Exported for tests.
 *
 * Supports two layouts:
 * - **Dev layout**: `cli.js` (shebang executable, `tsc -b` output) lives next
 *   to `install-manifest.js` inside `packages/host/dist/`. `index.js` (the
 *   library entry) is ALSO present here but is not a CLI — it has no shebang
 *   and is not chmod +x. Chrome treats the manifest `path` as an executable
 *   and `index.js` here breaks the connection silently.
 * - **Bundled tarball layout**: only a single `index.js` (esbuild bundle with
 *   shebang) is shipped next to `install-manifest.js`. No `cli.js`.
 *
 * Dev is detected by the presence of `cli.js` — that signal exists in dev
 * AND only in dev. Order matters: a `dist/` containing both files (any dev
 * checkout) MUST resolve to `cli.js`, never `index.js`.
 */
export const pickHostBinaryPath = (distDir: string): string => {
  const dev = path.join(distDir, "cli.js");
  if (fs.existsSync(dev)) return dev;
  return path.join(distDir, "index.js");
};

/** Resolves the host binary relative to this file. Thin wrapper around `pickHostBinaryPath`. */
const resolveHostBinaryPath = (): string => {
  const thisFile = fileURLToPath(import.meta.url);
  return pickHostBinaryPath(path.dirname(thisFile));
};

/**
 * A single name/value env var to bake into the wrapper's export block.
 *
 * Captured at install time and re-exported in `host-wrapper.sh` so the host
 * sees the value under Chrome's minimal-environment spawn. ONLY emitted when
 * `value` is non-empty (no `export NAME=''` shadow lines).
 */
export type PassThroughEnvVar = {
  /**
   * Env var name. MUST match `/^[A-Z_][A-Z0-9_]*$/` (validated by
   * `renderNodeWrapper`). The name list is a hard-coded constant, never user
   * input — a bad name is a programmer error → `throw`.
   */
  readonly name: string;
  /** Captured value. Single-quote-escaped before emission. */
  readonly value: string;
};

/** Regex for valid POSIX env var names (all-caps). */
const VALID_ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

/**
 * Renders the POSIX shell wrapper that exec's `node` with an absolute path
 * to the host JS entry. Exported for tests.
 *
 * Why this exists: Chrome launches native messaging hosts without sourcing
 * the user's shell init (`.zshrc`, `.bash_profile`), so `PATH` is minimal
 * (typically `/usr/bin:/bin:/usr/sbin:/sbin`). nvm-managed node lives in
 * `~/.nvm/versions/node/<v>/bin` which is NOT in that PATH. The host's
 * `#!/usr/bin/env node` shebang therefore fails with "env: node: No such
 * file or directory", Chrome reports the host disconnected, and the user
 * sees "Failed to load adapters: host disconnected" with no actionable
 * error in any log.
 *
 * The wrapper hardcodes the absolute path to the node binary discovered at
 * install time (via `process.execPath`) and uses `exec` so the wrapper
 * shell replaces itself with the node process — Chrome's stdio piping
 * stays clean.
 *
 * Single-quote-escaped paths protect against spaces and shell metacharacters
 * (notably `~/Library/Application Support/...` style macOS paths).
 *
 * Pass-through env vars (e.g. `AZURE_DEVOPS_EXT_PAT`) are baked into the
 * wrapper ONLY when non-empty. Empty/absent entries produce NO export line,
 * so a value the user later exports into a re-launched host environment is
 * not shadowed by an empty bake.
 *
 * @returns A small POSIX shell script as a string, ready to write to disk
 *   and `chmod +x`.
 * @throws {Error} if any `passThroughEnv` name does not match
 *   `/^[A-Z_][A-Z0-9_]*$/` (programmer error — the list is a hard-coded
 *   constant, never user input).
 */
export const renderNodeWrapper = (input: {
  readonly nodePath: string;
  readonly jsEntryPath: string;
  /**
   * The user's `process.env.PATH` at install time. Captured by `main()` and
   * baked into the wrapper so the host inherits the same lookup chain the
   * user has when they invoked the installer. Without this, every CLI the
   * user has under `~/.local/bin`, `~/.cargo/bin`, etc. fails to resolve
   * for ADR-29 subprocess invocations under Chrome's minimal-PATH spawn.
   */
  readonly capturedPath: string;
  /**
   * Captured `process.env.USER` (or LOGNAME). Some user CLIs (notably the
   * Claude Code CLI's keyring lookup) refuse to load credentials when USER
   * is unset, even if HOME is set. Chrome only forwards HOME — not USER —
   * so the wrapper must restore it explicitly.
   */
  readonly capturedUser: string;
  /**
   * Captured `process.env.SHELL`. Same reasoning as USER — required by the
   * Claude Code CLI's keyring path on macOS. Chrome's host spawn does not
   * include it.
   */
  readonly capturedShell: string;
  /**
   * Optional list of env vars to bake verbatim into the wrapper. Each entry
   * is emitted as `NAME='<escaped value>'` + `export NAME`. Entries whose
   * `value` is empty are silently skipped — no empty export line is emitted.
   *
   * Today the only entry populated is `AZURE_DEVOPS_EXT_PAT` (Fix 2,
   * ADR-35), but the param is general so future env secrets need no
   * signature change.
   */
  readonly passThroughEnv?: readonly PassThroughEnvVar[];
}): string => {
  const escape = (p: string): string => `'${p.replace(/'/g, `'\\''`)}'`;

  // Validate and render the pass-through env block.
  const passThroughBlock = (input.passThroughEnv ?? [])
    .filter((entry) => entry.value.length > 0)
    .map((entry) => {
      if (!VALID_ENV_NAME.test(entry.name)) {
        throw new Error(
          `renderNodeWrapper: invalid env var name "${entry.name}" — must match /^[A-Z_][A-Z0-9_]*$/`,
        );
      }
      return `${entry.name}=${escape(entry.value)}\nexport ${entry.name}`;
    })
    .join("\n");

  const passThroughSection =
    passThroughBlock.length > 0 ? `\n# Pass-through env vars baked in at install time.\n${passThroughBlock}\n` : "";

  // Strategy: bake the user's install-time PATH into the wrapper verbatim.
  // It already reflects whatever shell init they have (homebrew, nvm, pyenv,
  // mise, asdf, custom ~/.local/bin entries — anything they normally use).
  // The user can pick up PATH changes by re-running the installer; stable
  // contract and easier to debug than a guessed dir list.
  return `#!/bin/sh
# Auto-generated by install-manifest.ts — do not edit.
# Wraps the host so Chrome's minimal-PATH spawn finds node and any CLIs
# (gh, az, claude, codex, …) that ADR-29 resolvers shell out to.

# Inherit the PATH and identity env vars captured from the user's shell at
# install time. Chrome forwards HOME but NOT PATH/USER/SHELL — claude-cli's
# keyring lookup needs USER + SHELL to resolve stored credentials on macOS.
PATH=${escape(input.capturedPath)}
USER=${escape(input.capturedUser)}
LOGNAME=${escape(input.capturedUser)}
SHELL=${escape(input.capturedShell)}
export PATH USER LOGNAME SHELL
${passThroughSection}
NODE=${escape(input.nodePath)}
if [ ! -x "$NODE" ]; then
  # Captured node binary is gone (nvm upgrade, profile move…). Fall back to
  # the baked PATH lookup.
  NODE=$(command -v node 2>/dev/null || true)
fi
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  echo "lgtm-buzzer host: node not found." >&2
  echo "Re-run: node packages/host/dist/install-manifest.js" >&2
  exit 127
fi
exec "$NODE" ${escape(input.jsEntryPath)} "$@"
`;
};

/**
 * Entry point: writes the native-messaging manifest to the per-OS Chrome path.
 *
 * Reads `process.platform`, `os.homedir()`, and requires the
 * `LGTM_BUZZER_EXTENSION_ID` environment variable to be set to the Chrome
 * extension ID. Exits 2 with an explanatory message when the env-var is
 * missing — Chrome silently rejects any connectNative call from an extension
 * whose ID does not match `allowed_origins`, so a placeholder would produce
 * exactly the "Native host not installed" failure mode the user just hit.
 *
 * Logs to stderr. Exits 0 on success or unsupported platform; does not catch
 * fs errors (let Node print them naturally).
 */
export const main = (): void => {
  const platform = process.platform;
  const homedir = os.homedir();
  const hostBinaryPath = resolveHostBinaryPath();
  const extensionId = process.env["LGTM_BUZZER_EXTENSION_ID"];

  if (extensionId === undefined || extensionId.length === 0) {
    process.stderr.write(
      "install-manifest: LGTM_BUZZER_EXTENSION_ID env-var is required.\n" +
        "\n" +
        "Get the ID from chrome://extensions (Developer mode → LGTM-Buzzer → copy ID),\n" +
        "then re-run:\n" +
        "\n" +
        "  LGTM_BUZZER_EXTENSION_ID=<your-id> node packages/host/dist/install-manifest.js\n",
    );
    process.exit(2);
  }

  // Write a POSIX wrapper next to the JS entry so Chrome's minimal-PATH spawn
  // works regardless of how the user installed node (nvm, asdf, homebrew, …).
  // The manifest then points at the wrapper, NOT the JS entry directly.
  //
  // We capture the user's CURRENT PATH (the shell they ran the installer from)
  // and bake it into the wrapper. That way the wrapper sees whatever CLIs the
  // user has set up — `~/.local/bin/claude`, `~/.cargo/bin/...`, etc. — not a
  // guessed-static list. Re-running install-manifest refreshes the PATH.
  const capturedPath = process.env["PATH"] ?? "/usr/bin:/bin";
  const capturedUser =
    process.env["USER"] ?? process.env["LOGNAME"] ?? "";
  const capturedShell = process.env["SHELL"] ?? "/bin/sh";

  // Allow-list of env vars to bake into the wrapper for pass-through under
  // Chrome's minimal-environment spawn. Today only AZURE_DEVOPS_EXT_PAT:
  // Chrome strips it, so the ADO PAT path is unreachable without this.
  // Only bake when non-empty; omit entirely when unset (no empty shadow line).
  const PASS_THROUGH_ENV_NAMES = ["AZURE_DEVOPS_EXT_PAT"] as const;
  const passThroughEnv = PASS_THROUGH_ENV_NAMES.flatMap((name) => {
    const value = process.env[name];
    return value !== undefined && value.length > 0 ? [{ name, value }] : [];
  });

  const distDir = path.dirname(hostBinaryPath);
  const wrapperPath = path.join(distDir, "host-wrapper.sh");
  fs.writeFileSync(
    wrapperPath,
    renderNodeWrapper({
      nodePath: process.execPath,
      jsEntryPath: hostBinaryPath,
      capturedPath,
      capturedUser,
      capturedShell,
      passThroughEnv,
    }),
    { mode: 0o755 },
  );

  const result = buildManifest({
    platform,
    homedir,
    hostBinaryPath: wrapperPath,
    extensionId,
  });

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
