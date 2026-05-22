# LGTM-Buzzer

**Gate your PR approvals behind a quiz on the actual diff.**

[![CI](https://github.com/tibtof/lgtm-buzzer/actions/workflows/ci.yml/badge.svg)](https://github.com/tibtof/lgtm-buzzer/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/tibtof/lgtm-buzzer)](https://github.com/tibtof/lgtm-buzzer/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

---

## What this is

LGTM-Buzzer is a Chrome extension that intercepts the Approve button on GitHub
pull requests and gates it behind a short quiz generated from the actual diff.
If you can answer the quiz, the approval goes through. If you can't, you didn't
read the PR.

**The quiz is always generated from the raw diff bytes — never from the PR
title, description, commit messages, labels, or comments.** A teammate writing
a great PR description cannot short-circuit the gate. This is the core
invariant of the project, enforced at six layers from the VCS adapter through
the wire protocol to the LLM prompt.

**All LLM calls stay local.** The extension never contacts an LLM directly.
The native messaging host shells out to whichever CLI or API you already have
configured on your machine. No credentials live in the extension, no diff bytes
leave your machine through a third-party proxy, no telemetry of any kind.

Four LLM adapters are available: Claude Code CLI, Codex CLI, `gh copilot`, and
the Anthropic API (host-held key). Two VCS adapters are available: GitHub
(fully functional) and Azure DevOps (UI interception works; the multi-call diff
adapter is deferred to the next milestone — see the status table below).

---

## Status: v0.1.0 — M3 release

| Area | Status | Notes |
|---|---|---|
| Chrome MV3 extension | Working | Approve-button interception on `github.com` PR pages |
| Quiz modal | Working | Questions, answers, pass/fail, error states, retry, WCAG AA |
| `claude-cli` adapter | Working | Shells out to the `claude` binary |
| `codex-cli` adapter | Working | Shells out to the `codex` binary |
| `copilot-cli` adapter | Working | Shells out to `gh copilot` |
| `claude-api` adapter | Working | Anthropic REST API with prompt caching |
| GitHub VCS adapter | Working | PAT-authenticated diff fetch from the GitHub API |
| ADO VCS adapter | Stubbed | Approve button intercepted on `dev.azure.com`; the diff-fetching adapter (multi-call ADO API) is deferred to v0.2 |
| Options page | Working | Runtime LLM + VCS adapter selection, credential storage |
| Native messaging host | Working | macOS and Linux; Windows deferred |
| GitHub Actions CI | Working | `npm run check` on every push and PR |
| Release packaging | Working | Extension zip + host tarball with checksums |
| Playwright e2e | Working | Happy-path quiz gate in CI (xvfb-run on Linux) |
| promptfoo evals | Working | Quiz-quality eval suite across all four adapters |
| Safari port | Deferred | Post-v1.0 via Xcode MV3 converter |
| Firefox MV3 | Deferred | Future milestone |
| OS keychain integration | Deferred | Credentials currently stored as plaintext |

---

## Screenshots

Screenshots TBD — no screenshots have been captured yet for v0.1.0. A short
screen recording of the quiz gate in action will be added before the v0.1.0
tag is published.

---

## Quick start

### Prerequisites

| Requirement | Minimum | Notes |
|---|---|---|
| Node.js | 22 LTS | `node --version` to check |
| Chrome | any recent stable | Developer mode required |
| At least one LLM | — | See table below |
| GitHub PAT | — | `Contents: read` scope (or `repo` scope for classic tokens) |

**LLM prerequisites — pick at least one:**

| Adapter | What you need |
|---|---|
| `claude-cli` | `claude` CLI installed and authenticated |
| `codex-cli` | `codex` CLI installed and authenticated |
| `copilot-cli` | `gh` CLI with `gh copilot` extension, authenticated via `gh auth login` |
| `claude-api` | `ANTHROPIC_API_KEY` environment variable set |

### Install steps

```bash
# 1. Clone and install
git clone https://github.com/tibtof/lgtm-buzzer.git
cd lgtm-buzzer
npm install

# 2. Build everything
npm run build

# 3. Install the native-messaging manifest (macOS / Linux)
node packages/host/dist/install-manifest.js
# Re-run with your extension ID after Step 5:
# LGTM_BUZZER_EXTENSION_ID=<id> node packages/host/dist/install-manifest.js

# 4. Load the extension in Chrome
#    chrome://extensions → Developer mode → Load unpacked
#    → packages/extension/.output/chrome-mv3/

# 5. Open the extension options page, pick your LLM + VCS adapter,
#    and enter credentials (GitHub PAT, or Anthropic API key if using claude-api).
```

See **[docs/getting-started.md](docs/getting-started.md)** for the full
step-by-step walkthrough, including the extension ID lookup, troubleshooting,
and a detailed description of each step.

### Downloading a pre-built release

Pre-built artifacts are on the
[GitHub Releases page](https://github.com/tibtof/lgtm-buzzer/releases):

- `lgtm-buzzer-extension-v<version>.zip` — Chrome MV3 extension (load unpacked or submit to the Web Store).
- `lgtm-buzzer-host-v<version>.tar.gz` — Native messaging host with installer; no `npm install` needed.

See **[docs/release.md](docs/release.md)** for the maintainer release guide.

---

## How to use

Once installed and configured:

1. Navigate to a GitHub pull request.
2. Click the **Approve** button (or go through **Review changes → Approve →
   Submit review**).
3. A quiz modal appears in place of the usual confirmation.
4. Read the questions — they are generated from the PR diff, not the description.
5. Type your answers and click **Submit**.
6. **Pass**: your approval is submitted. **Fail**: close the modal and re-read the diff.

The quiz is generated fresh for each approval attempt. There is no "skip" path.

---

## Configuration

Open the extension options page by clicking the LGTM-Buzzer icon in Chrome's
toolbar and selecting **Options** (or navigating to
`chrome-extension://<id>/options.html`).

On the options page you can:

- Select your preferred LLM adapter (Claude CLI, Codex CLI, Copilot CLI, or Claude API).
- Select your VCS adapter (GitHub or ADO — ADO diff fetch is stubbed in v0.1.0).
- Enter adapter credentials (GitHub PAT, Anthropic API key).

Settings are saved immediately to `chrome.storage.local`. The storage schema
is validated with Zod on every read; corrupt storage falls back to defaults
with a visible warning.

---

## Security

### Credential storage

Credentials (GitHub PAT, Anthropic API key) are stored in **`chrome.storage.local` as plaintext**. This is a v1 limitation. We do not yet integrate with OS keychains (macOS Keychain, Linux SecretService). A future ADR will track this upgrade — the `StorageArea` port in the extension is the designed injection point.

### Diff-only invariant

PRs are quizzed on the diff bytes only — never on the PR title, description,
commit messages, labels, or comments. This is enforced at six layers:

1. The VCS port (`VCSProvider`) accepts only a PR identifier and returns a raw diff string. No other PR metadata is in the type.
2. The GitHub adapter fetches only the `application/vnd.github.diff` media type from the GitHub API.
3. The wire-format `quiz-request` message schema (ADR-7, ADR-11) carries only `prId` and `diff` — no title or description fields exist in the schema.
4. The `QuizSession` aggregate (ADR-14) receives only the diff from the wire message; it never sees PR metadata.
5. Each LLM adapter prompt template is diff-in / structured-JSON-out with no slot for PR metadata.
6. The promptfoo eval suite includes a negative-control fixture (`docs-readme-update`) that asserts adapters return an error rather than a quiz when fed a docs-only change with no code symbols.

Any change that adds non-diff PR text to any of these layers is treated as a security boundary violation and requires a new ADR.

### LLM calls

- **CLI adapters** (`claude-cli`, `codex-cli`, `copilot-cli`): the host spawns a subprocess. The diff bytes go in on stdin. No network egress from the extension or the host beyond the subprocess's own network activity.
- **API adapter** (`claude-api`): the host calls the Anthropic REST API directly with the API key you configured. No third-party proxy, no telemetry.
- The extension itself makes no LLM calls and holds no LLM credentials.

---

## Architecture

LGTM-Buzzer uses hexagonal architecture enforced by npm workspace boundaries:

```
packages/
  protocol/    Wire-format schemas (zod) and domain DTOs. Zero runtime deps except zod.
  core/        Pure domain logic: ports, QuizSession, ReviewGate. No Node, no DOM, no I/O.
  adapters/    Concrete port implementations (claude-cli, codex-cli, copilot-cli,
               claude-api, github, ado). One subfolder per adapter.
  host/        Native messaging host. Node-only wiring of adapters into core.
  extension/   Chrome MV3 service worker, content scripts, options page, quiz modal.
  evals/       promptfoo eval suite for quiz quality.
```

Dependency direction is strict and enforced by ESLint:

```
protocol  <- core  <- adapters  <- host
protocol  <- core  <- extension
```

See [`CLAUDE.md`](./CLAUDE.md) for the full project constitution (architecture
principles, dependency rules, FP idioms, code style) and
[`decisions.md`](./decisions.md) for the full architecture decision log (28 ADRs
covering every significant design choice from the FP foundation through the
release pipeline).

---

## LLM + VCS adapter matrix

| Adapter | Type | Status | Credentials | Notes |
|---|---|---|---|---|
| `claude-cli` | LLM | Working | none (CLI login) | requires `claude` binary on PATH |
| `codex-cli` | LLM | Working | none (CLI login) | requires `codex` binary on PATH |
| `copilot-cli` | LLM | Working | none (`gh auth login`) | requires `gh` + `gh-copilot` extension |
| `claude-api` | LLM | Working | `ANTHROPIC_API_KEY` | prompt caching enabled |
| `github` | VCS | Working | GitHub PAT (`Contents: read`) | fetches raw diff via GitHub API |
| `ado` | VCS | Stubbed | ADO PAT (when impl lands) | UI interception works; multi-call diff adapter deferred to v0.2 |

---

## Development

### Setup

```bash
git clone https://github.com/tibtof/lgtm-buzzer.git
cd lgtm-buzzer
npm install
npm run build
```

### Common commands

```bash
npm run build          # tsc -b for all lib packages + wxt build for the extension
npm run build:libs     # tsc -b only (skip the extension)
npm test               # vitest run across all packages
npm run lint           # eslint with flat config (enforces dependency direction)
npm run format         # prettier --write
npm run typecheck:tests  # type-check all *.test.ts files (excluded from tsc -b)
npm run check          # full CI gate: build + test + lint + typecheck:tests
```

### Running e2e tests

The Playwright suite requires a display. On Linux without a desktop:

```bash
xvfb-run --auto-servernum npm test
```

On macOS, run `npm test` directly.

### Running evals

Evals make real LLM calls and are excluded from `npm run check`. They require
the adapter tools and credentials described in the prerequisites section.

```bash
npm run evals          # full suite — all adapters x all fixtures
npm run evals:quick    # fast fixtures only (ts-add-validator, dep-bump-only)
```

See [`packages/evals/README.md`](packages/evals/README.md) for the full eval
guide including the negative-control fixture and how to update the baseline.

### Workspace READMEs

- [`packages/extension/README.md`](packages/extension/README.md) — options page, quiz modal, monadyssey usage, WCAG commitments.
- [`packages/evals/README.md`](packages/evals/README.md) — promptfoo eval suite, fixtures, how to run and interpret results.

---

## Contributing

The canonical contribution flow uses the four-agent pipeline (PM → Architect →
Dev → Reviewer) described in [`CLAUDE.md`](./CLAUDE.md). See
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for a short orientation.

For bug reports and feature requests, open a GitHub issue. The PM agent will
triage and file the structured spec; the architect will write an ADR; the dev
agent will implement; the reviewer agent will gate the PR before human review.

---

## Roadmap

Items planned after v0.1.0:

- **ADO multi-call diff adapter** — complete Azure DevOps support (the Approve button interception is already in; the diff adapter needs the multi-call ADO API).
- **Quiz cancel wire frame** (#96) — `quiz-cancel-request` message so the host can abort the in-flight LLM fiber and stop billing tokens when the user closes the modal.
- **OS keychain integration** — macOS Keychain and Linux SecretService for encrypted credential storage.
- **Firefox MV3 port** — Firefox MV3 compatibility (the codebase is designed for it; no architectural changes needed).
- **Dark mode** — extension UI currently follows the host page's color scheme; a first-class dark-mode pass is planned.
- **i18n** — all user-facing strings are currently English-only.
- **Chrome Web Store listing** — public listing once the extension reaches a stable UX.
- **Safari port** — wrap the MV3 extension via the Xcode converter (locked decision: post-v1.0).

---

## License

MIT — see [`LICENSE`](./LICENSE).

---

## Acknowledgments

- [monadyssey](https://github.com/lean-mind/monodyssey) — the FP foundation (`IO`, `Either`, `Option`, `Schedule`) used across every non-extension workspace.
- [WXT](https://wxt.dev) — the extension framework that handles the MV3 build, HMR, and cross-browser plumbing.
- [promptfoo](https://promptfoo.dev) — the eval framework used to measure quiz quality across LLM adapters.
- [httptape](https://github.com/tibtof/httptape) — HTTP fixture recording and replay used in adapter contract tests.
- [Anthropic Claude](https://anthropic.com) — the LLM behind the Claude CLI and API adapters, and the agent pipeline that built this project.
