# GitHub Actions Workflows

## What runs when

| Trigger | Workflow | Jobs |
|---|---|---|
| `push` to `main` | `ci.yml` | `unit-and-build`, `e2e` (parallel) |
| `pull_request` against `main` | `ci.yml` | `unit-and-build`, `e2e` (parallel) |
| `workflow_dispatch` | `evals.yml` | `evals` (chosen suite) |
| Schedule: Mon 09:00 UTC | `evals.yml` | `evals` (quick suite) |
| `pull_request` with `run-evals` label | `evals.yml` | `evals` (quick suite) |

---

## `ci.yml` — required CI

Two parallel jobs on every push to `main` and every PR against `main`:

- **`unit-and-build`**: runs `npm run check` (build → test → lint →
  typecheck:tests). On failure, uploads `coverage/` artifacts.
- **`e2e`**: installs Chromium, builds the MV3 extension, then runs the
  Playwright suite under `xvfb-run` (required because `headless: false` is
  binding — Chrome does not expose MV3 service workers to CDP in headless
  mode). On failure, uploads `playwright-report/` and `test-results/`
  artifacts.

The two jobs share no state and run in parallel. Both must go green before
a PR can be merged (once branch protection is configured — see below).

---

## `evals.yml` — non-gating LLM quality evals

Runs the `promptfoo` eval suite against the `claude-api` provider. The
three CLI providers (`claude-cli`, `codex-cli`, `copilot-cli`) **skip
automatically** — they require interactive login (`claude login`, `codex
login`, `gh auth`) that CI cannot complete. No binary install for CLI
providers is attempted.

`ANTHROPIC_API_KEY` must be set in Repo Settings → Secrets and variables →
Actions for the `claude-api` provider to run. If the secret is absent, the
API cells skip gracefully; the workflow still exits green (evals are
non-gating).

**This workflow is intentionally not a required check.** It costs real
money ($0.30–$1 per run) and is meant as a quality signal, not a gate.

### How to manually trigger evals

Via the GitHub Actions tab:

1. Go to Actions → "Evals (non-gating)" → "Run workflow".
2. Choose the suite: `quick` (3 fixtures, ~$0.30), `full` (10 fixtures,
   ~$1.00), or `empty-quiz-control` (negative control).
3. Click "Run workflow".

Via the CLI:

```bash
# quick suite (default)
gh workflow run evals.yml --repo tibtof/lgtm-buzzer -f suite=quick

# full suite
gh workflow run evals.yml --repo tibtof/lgtm-buzzer -f suite=full

# negative-control suite
gh workflow run evals.yml --repo tibtof/lgtm-buzzer -f suite=empty-quiz-control
```

### How to opt a PR into evals

Add the `run-evals` label to the PR. The workflow will trigger on the next
`labeled` or `synchronize` event and run the quick suite. Download the
artifact from the Actions run to inspect the results.

---

## Adding a new job to `ci.yml`

1. Keep the job's `timeout-minutes` within budget (10 min for
   `unit-and-build`-style jobs, 15 min for browser-driven jobs).
2. Start with `npm ci` (not `npm install`) for reproducibility.
3. Gate on `pull_request` + `push` triggers only — do not add `schedule`
   to `ci.yml` (that belongs in `evals.yml` or a new dedicated workflow).
4. Add `if: failure()` guards on every artifact upload step.
5. Do not add `continue-on-error: true` — it hides real breaks.

---

## Required secrets

| Secret | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `evals.yml` | `claude-api` provider + `llm-rubric` judge |

Add secrets in: Repo Settings → Secrets and variables → Actions → New
repository secret.

Note: forked PRs do not receive secrets by default (GitHub security policy).
Evals on forked PRs skip the `claude-api` provider and exit green.

---

## Why CLI evals don't run in CI

The `claude`, `codex`, and `gh copilot` CLIs require interactive
authentication (`claude login`, `codex login`, `gh auth login`). CI runners
have no browser and no interactive terminal, so these logins cannot complete.
The adapters detect the missing binary or failed auth and return
`errKind: "skipped"` per ADR-26 §5. No binary install is attempted in CI.

To run CLI evals locally, authenticate each CLI first, then:

```bash
npm run evals --workspace=@lgtm-buzzer/evals
```

---

## Branch protection follow-up (manual, post-first-green-run)

After this workflow lands and runs green at least once on `main`, the repo
admin must configure branch protection for `main` in Repo Settings →
Branches:

1. Mark these status checks as **Required**:
   - `unit-and-build` (from `ci.yml`)
   - `e2e` (from `ci.yml`)
2. Leave `evals` **un-required** — it is intentionally non-gating.
3. Keep "Require branches to be up to date before merging" enabled.

This step is manual because configuring branch protection via Actions
requires a PAT with `repo` scope, which we do not want to introduce for a
one-time toggle. The steps above are reproducible if the repo is ever
re-bootstrapped.
