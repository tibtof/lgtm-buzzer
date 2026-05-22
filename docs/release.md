# LGTM-Buzzer — Release Guide

Maintainer reference for bumping the version, producing release artifacts, and
publishing a GitHub Release.

---

## Prerequisites

- Node.js 22 or later
- npm (bundled with Node)
- `git` on PATH
- `tar` on PATH (macOS and Linux ship it in the baseline)
- A clean working tree (uncommitted changes block the release script)

---

## Bump-version flow

```bash
# 1. Bump the root package.json version (patch / minor / major).
#    --no-git-tag-version skips the automatic tag and commit so you can
#    review the diff first. Only the root package.json is bumped; workspace
#    package.json files stay at 0.0.0 (private, never published to npm).
npm version patch --no-git-tag-version
# or: npm version minor --no-git-tag-version
# or: npm version major --no-git-tag-version

# 2. Review the change.
git diff package.json

# 3. Commit the version bump.
git add package.json
git commit -m "chore(release): v$(node -p "require('./package.json').version")"

# 4. Run the packaging script (builds + packages both artifacts).
npm run release:build

# 5. Verify the artifacts (see "Verify a release locally" below).

# 6. Tag and push.
git tag "v$(node -p "require('./package.json').version")" -a -m "Release $(node -p "require('./package.json').version")"
git push origin main --tags

# 7. Create a GitHub Release (manual).
#    Attach dist/lgtm-buzzer-extension-v<version>.zip,
#           dist/lgtm-buzzer-host-v<version>.tar.gz, and
#           dist/checksums.txt.
```

---

## What `npm run release:build` produces

Under `dist/` at the repo root:

| File | Description |
|---|---|
| `lgtm-buzzer-extension-v<version>.zip` | MV3-ready Chrome extension — load as unpacked or submit to Chrome Web Store |
| `lgtm-buzzer-host-v<version>.tar.gz` | Bundled native messaging host + installer; no `npm install` needed |
| `checksums.txt` | SHA256 + byte size of both artifacts (omit with `--no-checksums`) |

The host tarball extracts to:

```
lgtm-buzzer-host-v<version>/
  host/
    index.js                  Bundled host entry (executable, Node 22+)
    install-manifest.js       Bundled installer (executable, Node 22+)
    manifest.template.json    Native-messaging manifest template
  README.md                   End-user quick-install guide
  LICENSE                     MIT license
```

---

## CLI flags

```
Usage: npm run release:build [-- options]

Options:
  --force                Overwrite existing dist/ artifacts for the same version
  --allow-dirty          Skip the "uncommitted changes" gate (CI / hotfix path)
  --skip-check           Skip `npm run check`. NOT recommended for real releases.
                         If you use this flag in a release, document why.
  --no-checksums         Do not write checksums.txt
  --output-dir <path>    Override the default dist/ output directory
  --help, -h             Print usage and exit 0
```

### When to use each flag

| Flag | Appropriate use |
|---|---|
| `--force` | Re-running the script after fixing a build issue without bumping the version |
| `--allow-dirty` | CI pipeline where the checkout is clean but git detects no tracked files; or a hotfix that bypasses the normal flow |
| `--skip-check` | Iterating on the packaging script itself (never for a real release artifact) |
| `--no-checksums` | Smoke-testing locally when you don't need the checksum file |
| `--output-dir` | Redirecting artifacts to a temp dir for smoke testing |

The `release:check` npm script is a convenience alias for a fast local smoke:

```bash
npm run release:check
# equivalent to: node scripts/release.mjs --skip-check --no-checksums --output-dir tmp/release-test --force
```

---

## Verify a release locally

After running `npm run release:build`:

```bash
VERSION=$(node -p "require('./package.json').version")

# 1. List the extension zip contents.
unzip -l "dist/lgtm-buzzer-extension-v${VERSION}.zip"

# 2. List the host tarball contents.
tar -tzf "dist/lgtm-buzzer-host-v${VERSION}.tar.gz"

# 3. Extract the host into a scratch dir and verify it runs.
mkdir -p /tmp/lgtm-host-smoke
tar -xzf "dist/lgtm-buzzer-host-v${VERSION}.tar.gz" -C /tmp/lgtm-host-smoke
# The host exits when stdin closes — just verify it starts.
echo "" | node "/tmp/lgtm-host-smoke/lgtm-buzzer-host-v${VERSION}/host/index.js" || true

# 4. Run the installer with a test extension ID.
LGTM_BUZZER_EXTENSION_ID=test_extension_id_here \
  node "/tmp/lgtm-host-smoke/lgtm-buzzer-host-v${VERSION}/host/install-manifest.js"

# 5. Verify the manifest was written (macOS).
cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.lgtm_buzzer.host.json

# 5. Verify the manifest was written (Linux).
cat ~/.config/google-chrome/NativeMessagingHosts/com.lgtm_buzzer.host.json

# Clean up.
rm -rf /tmp/lgtm-host-smoke
```

---

## Post-release checklist

- [ ] GitHub Release created with both artifacts and `checksums.txt` attached.
- [ ] Extension zip submitted to Chrome Web Store developer dashboard (manual upload).
- [ ] Release notes written (what changed since the last release).
- [ ] `dist/` cleaned before the next bump: `npm run release:clean` or `rm -rf dist/`.

---

## Windows

Windows host installation is **not supported in v1**. Windows requires native-
messaging manifest registration in the registry, and a `.bat` or `.exe`
wrapper is needed to invoke the Node script. Users on Windows may run the host
under WSL.

The Chrome extension zip works on Windows; only the native host packaging is
limited.

---

## Known limitations (v1)

- **Reproducible builds**: two runs from the same source may produce artifacts
  with different SHA256 hashes. Zip and tar metadata (timestamps, file ordering)
  are not normalised. The `checksums.txt` is run-specific. Strict
  reproducibility is out of scope for v1.
- **No auto-release on tag push**: `release.mjs` is invoked manually. A CI
  GitHub Actions workflow is a future ADR.
- **No code signing or macOS notarisation**: the bundled host is plain
  interpreted JS; macOS does not require notarisation for interpreted scripts.
- **No Chrome Web Store auto-submission**: manual upload for v1.
- **No THIRD-PARTY-NOTICES file**: `esbuild`'s `legalComments: "inline"` option
  preserves bundled dependency license notices inside the compiled JS. A
  separate NOTICE file is future-work.
- **Cross-version compatibility**: v1 assumes the extension and host share the
  same version number. Protocol version negotiation (ADR-7) prevents
  catastrophic mismatch, but a mixed-version pair is not formally tested.
