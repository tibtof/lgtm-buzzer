# lgtm-buzzer

Browser extension that quizzes you on the diff before letting you approve a PR.
Powered by your local LLM CLI (Claude Code, Codex, or `gh copilot`) via a
native messaging host.

---

## Status: M2 vertical slice — Chrome + Claude CLI + GitHub

The M2 slice is complete. You can install the extension today, load it in
Chrome, and gate a real GitHub PR approval behind a quiz generated from the
actual diff by the `claude` CLI running on your machine. No remote model calls,
no API keys in the extension.

---

## What works today

- Approve-button interception on `github.com` PR review pages.
- Quiz generation from the raw diff via the `claude` CLI (Claude Code).
- Native messaging host that runs as a subprocess: the extension never calls
  the LLM directly.
- Quiz modal: displays questions, collects answers, shows pass/fail.
- Native-messaging manifest installer for macOS and Linux.
- GitHub PAT-authenticated diff fetching.

## What's coming in M3

- Additional LLM adapters: Codex CLI (`#45`), `gh copilot` (`#46`).
- Azure DevOps support (`#47`, `#48`).
- Runtime LLM/VCS adapter selection via an options page (`#49`, `#50`).
- Playwright end-to-end tests (`#51`).
- `promptfoo` quiz-quality evals (`#52`).
- Quiz modal polish — error states, retry, accessibility (`#53`).
- GitHub Actions CI workflow (`#54`).
- Packaging script (extension zip + host tarball) (`#55`).
- Polished public README (`#56`).

---

## Quick start

```bash
# 1. Clone and install
git clone https://github.com/tibtof/lgtm-buzzer.git
cd lgtm-buzzer
npm install

# 2. Build everything
npm run build

# 3. Install the native-messaging manifest
LGTM_BUZZER_EXTENSION_ID=<your-extension-id> \
  node packages/host/dist/install-manifest.js

# 4. Set your GitHub PAT (add to your shell profile to persist)
export LGTM_BUZZER_GH_TOKEN=<your-github-pat>

# 5. Load the extension in Chrome
#    chrome://extensions → Developer mode → Load unpacked
#    → packages/extension/.output/chrome-mv3/
```

See **[docs/getting-started.md](docs/getting-started.md)** for the full
step-by-step walkthrough, including prerequisites, the extension ID lookup,
and a troubleshooting section.

---

## Architecture and decisions

See [`CLAUDE.md`](./CLAUDE.md) for the project constitution (architecture,
conventions, agent pipeline) and [`decisions.md`](./decisions.md) for all
ADRs and PM logs.
