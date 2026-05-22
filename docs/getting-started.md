# Getting started — M2 vertical slice

This guide walks you through installing and running the M2 vertical slice of
lgtm-buzzer: Clone the repo, build the host, install the native-messaging
manifest, load the unpacked extension in Chrome, and gate a real GitHub PR
approval behind a diff-generated quiz.

---

## Prerequisites

| Requirement | Minimum version | Notes |
|---|---|---|
| Node.js | 20 | `node --version` to check |
| npm | ships with Node 20 | used for workspaces |
| Chrome | any recent stable | Developer mode required |
| `claude` CLI | any | [Anthropic install docs](https://docs.anthropic.com/en/docs/claude-code/getting-started) |
| GitHub PAT | — | [GitHub PAT docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) |

The `claude` CLI must be on your `PATH` and authenticated before starting.
Run `claude --version` to confirm.

The GitHub PAT needs `repo` scope (or `pull_requests:read` for fine-grained
tokens) so the host can fetch the diff from the GitHub API. The token is read
from the `LGTM_BUZZER_GH_TOKEN` environment variable at runtime — it is never
stored in the extension or the manifest.

---

## Step 1 — Clone and install

```bash
git clone https://github.com/tibtof/lgtm-buzzer.git
cd lgtm-buzzer
npm install
```

`npm install` hoists shared devDependencies, links workspace packages, and
runs `wxt prepare` inside the extension workspace automatically.

---

## Step 2 — Build the monorepo

```bash
npm run build
```

This runs `tsc -b` for all library packages (`protocol`, `core`, `adapters/*`,
`host`) and then `wxt build` for the extension. Compiled host files land in
`packages/host/dist/`. The extension lands in
`packages/extension/.output/chrome-mv3/`.

To build only the host (e.g., after changing host code without touching the
extension):

```bash
npm run build --workspace=@lgtm-buzzer/host
```

To build only the extension:

```bash
npm run build --workspace=@lgtm-buzzer/extension
```

---

## Step 3 — Set the GitHub PAT

Export the token in your terminal (or add it to your shell profile to persist
across sessions):

```bash
export LGTM_BUZZER_GH_TOKEN=<your-github-pat>
```

The host process reads this variable at quiz-request time. If it is absent,
the host responds with an `ErrorFrame` and the modal shows an error instead of
a quiz.

---

## Step 4 — Install the native-messaging manifest

The native-messaging manifest tells Chrome where to find the host binary and
which extension is allowed to start it.

Before running the install script, you need the Chrome extension ID. You will
get it in Step 5 after loading the extension. For now, run the installer with a
placeholder and re-run after you have the real ID:

```bash
node packages/host/dist/install-manifest.js
```

The script reads `LGTM_BUZZER_EXTENSION_ID` from the environment. If the
variable is absent it writes `<unset>` as the extension ID, which is wrong but
harmless for a first run — you will fix it in Step 6.

Supported platforms:
- **macOS** — writes to `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
- **Linux** — writes to `~/.config/google-chrome/NativeMessagingHosts/`
- **Windows** — not yet supported; the script exits cleanly and prints a
  message to stderr.

---

## Step 5 — Load the unpacked extension in Chrome

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Navigate to `packages/extension/.output/chrome-mv3/` inside the repo and
   select it.
5. The extension appears in the list. Note the **extension ID** shown below the
   extension name — it looks like `abcdefghijklmnopabcdefghijklmnop`.

---

## Step 6 — Re-run the manifest installer with the real extension ID

```bash
LGTM_BUZZER_EXTENSION_ID=<your-extension-id> \
  node packages/host/dist/install-manifest.js
```

Replace `<your-extension-id>` with the ID from Step 5. The installer
overwrites the manifest file with the correct `allowed_origins` entry.

To verify the manifest was written correctly:

```bash
# macOS
cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.lgtm_buzzer.host.json

# Linux
cat ~/.config/google-chrome/NativeMessagingHosts/com.lgtm_buzzer.host.json
```

The `allowed_origins` array must contain `chrome-extension://<your-id>/` and
the `path` field must point to an existing `cli.js` inside `packages/host/dist/`.

After updating the manifest, **reload the extension** on `chrome://extensions`
(click the refresh icon on the extension card) so Chrome picks up the new
manifest.

---

## Step 7 — Gate a real PR

1. Navigate to a GitHub pull request you own (or a test PR in a repo you
   control).
2. Click the **Review changes** button, select **Approve**, and click
   **Submit review** (or click the **Approve** button directly if the page
   renders it as a standalone element — the content script intercepts both).
3. The quiz modal appears instead of the review being submitted immediately.
4. Read the questions generated from the PR diff and type your answers.
5. Click **Submit**.
6. The modal shows **Pass** (review submitted) or **Fail** (try again).

The host spawns `claude` as a subprocess, passes only the raw diff on stdin,
and receives a structured quiz response. No PR title, description, commit
messages, or labels are included in the prompt.

---

## Troubleshooting

### Host not connecting — "Could not establish connection"

Chrome logs this when the native-messaging manifest is missing, has the wrong
extension ID in `allowed_origins`, or points to a binary path that does not
exist.

Check the following in order:

1. Confirm the manifest file exists at the platform path shown in Step 4.
2. Confirm `allowed_origins` matches your extension ID exactly
   (`chrome-extension://<id>/` — trailing slash required).
3. Confirm `path` in the manifest points to an existing file:
   ```bash
   node -e "const m = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log(m.path)" \
     ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.lgtm_buzzer.host.json
   ls -la <the-path-printed-above>
   ```
4. Make sure you rebuilt the host (`npm run build --workspace=@lgtm-buzzer/host`)
   before installing the manifest.
5. Reload the extension after re-running the manifest installer.

### `claude` not found — quiz fails with "spawn-failed"

The host cannot find `claude` on `PATH`. Confirm:

```bash
which claude
claude --version
```

If `claude` is installed but not on the `PATH` the host process inherits,
ensure your shell profile exports the directory correctly and restart Chrome
(the host is spawned with Chrome's environment, not your interactive shell's
environment).

### PAT missing or expired — quiz fails with "internal" error

The host returns an `ErrorFrame` with `reason: "internal"` when
`LGTM_BUZZER_GH_TOKEN` is absent or the token is rejected by the GitHub API
(e.g., expired, wrong scope, or revoked).

```bash
# Confirm the variable is set in the terminal where Chrome was launched
echo $LGTM_BUZZER_GH_TOKEN

# Quick API smoke-test
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: token $LGTM_BUZZER_GH_TOKEN" \
  https://api.github.com/user
# Should print 200
```

If you set the variable after Chrome was already running, you need to restart
Chrome or set the variable in your shell profile and then relaunch Chrome so
the host subprocess inherits it.

### Quiz modal does not appear at all

The content script may not have injected on the PR page. Check:

1. Open DevTools on the PR page → **Console** tab — look for errors from
   the content script.
2. Open DevTools → **Application** → **Service Workers** — confirm the
   background service worker is registered and not in an error state.
3. Make sure the extension is enabled on `chrome://extensions`.
4. Hard-refresh the PR page (`Ctrl+Shift+R` / `Cmd+Shift+R`) after loading
   the extension.

The content script targets `github.com/*/pull/*/files` and the PR review
submit path. It will not inject on issue pages, PR list pages, or other
github.com paths.

---

## Limitations of the M2 slice

These are known gaps, not bugs. All are tracked as M3 issues.

- **Single LLM only.** Only the `claude` CLI is wired in M2. Codex CLI and
  `gh copilot` are M3 (`#45`, `#46`).
- **GitHub only.** Azure DevOps is M3 (`#47`, `#48`). The host rejects
  non-GitHub quiz requests.
- **No runtime adapter selection.** The LLM and VCS adapters are chosen at
  build time. An options page for per-user config is M3 (`#49`, `#50`).
- **No Playwright end-to-end tests in CI.** The e2e suite is M3 (`#51`).
  There is no GitHub Actions workflow yet (`#54`).
- **No quiz-modal polish.** Error states, retry-on-transient-error, and
  accessibility pass are M3 (`#53`).
- **Windows is not supported.** The manifest installer exits cleanly on
  Windows but writes nothing. Windows support requires registry-based manifest
  installation and is deferred.
- **macOS and Linux only** for the native-messaging manifest installer.
- **No packaging.** There is no zip/tarball distribution yet (`#55`). You
  must build from source and load unpacked.

---

## Reference

- [`CLAUDE.md`](../CLAUDE.md) — project constitution: architecture,
  conventions, dependency rules, FP idioms.
- [`decisions.md`](../decisions.md) — all ADRs (ADR-1 through ADR-18) and
  PM logs. Each ADR explains the rationale for a specific design decision.
- [`packages/host/src/cli.ts`](../packages/host/src/cli.ts) — host entry
  point: dispatch table, env vars, error frames.
- [`packages/host/src/install-manifest.ts`](../packages/host/src/install-manifest.ts) — manifest installer: platform paths, `buildManifest` API.
