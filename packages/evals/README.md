# @lgtm-buzzer/evals

Promptfoo eval suite measuring quiz quality across all four LLM adapters
(ADR-26). These evals make real LLM calls; running them costs money on
`claude-api` and requires CLI binaries for the other adapters.

## What this workspace does

Each eval run executes a matrix of (adapter) x (fixture diff) cells. For every
cell, the adapter generates a 3-question quiz from the diff. The eval asserts:

1. **Schema conformance** — the output is valid JSON that satisfies
   `LlmQuizSchema` from `@lgtm-buzzer/adapter-shared`.
2. **Symbol grounding** — at least one symbol from the fixture's
   `expectedSymbols` list appears in the output.
3. **LLM-rubric quality** — a separate Claude instance scores the quiz on
   Relevance, Difficulty, and Discrimination (each 1–5). Average >= 3.5 and
   per-axis minimum >= 2.
4. **Latency** — advisory; displayed in the report.

The negative-control fixture (`docs-readme-update`) runs separately via
`promptfoo.empty-quiz.config.yaml` and asserts the adapter returns
`malformed-response { detail: "empty-quiz" }` instead of a quiz.

## Running the evals

### Prerequisites

The four test-subject adapters each require their own tool:

| Adapter | Required (for test-subject) |
|---|---|
| `claude-cli` | `claude` CLI on PATH |
| `claude-api` | `ANTHROPIC_API_KEY` environment variable |
| `codex-cli` | `codex` CLI on PATH |
| `copilot-cli` | `gh` CLI with `gh copilot` extension on PATH |

Missing tools or keys → that adapter's cells are reported as `SKIP` (not
fail). A clean run of all four requires all four tools.

The **judge** (used by the LLM-rubric assertion) is auto-detected from the
same tools. Resolution order: `claude` → `codex` → `copilot` → `claude-api`.
Override with `LGTM_EVAL_JUDGE=claude|codex|copilot|claude-api`. You need at
least ONE of these for the rubric to score; otherwise the rubric assertion
fails with a clear error but the run completes.

### Full suite

```bash
# From repo root:
npm run evals

# Or directly:
cd packages/evals
npm run evals
```

This runs `scripts/generate-tests.mjs` to produce `tests.generated.json`, then
invokes `promptfoo eval -c promptfoo.config.yaml`.

### Quick suite (3 fast fixtures)

```bash
npm run evals:quick
```

Runs only `ts-add-validator` and `dep-bump-only` — fast fixtures, suitable for
a quick sanity check before committing a prompt change.

### Negative-control fixture

```bash
npm run evals:empty-quiz-control
```

Runs `promptfoo.empty-quiz.config.yaml` against the `docs-readme-update`
fixture only. Asserts every adapter returns an error (not a quiz).

## Interpreting results

Results are written to `results/latest.json` (HTML report at
`results/latest.html` if `--view` flag is used). Each cell shows:

- **PASS** — all assertions passed.
- **FAIL** — one or more assertions failed; check `reason` for details.
- **SKIP** — the adapter's binary or API key was not available.

The LLM-rubric assertion is advisory in v1 (threshold 0) — a fail here
surfaces in the report but does not count as a hard FAIL.

The resolved judge is logged to stderr at run start:
`[lgtm-evals] judge: claude (auto-detected)`. If you see `judge error` in
rubric results, check `LGTM_EVAL_JUDGE` and ensure at least one LLM tool is
available.

## Updating the baseline

1. Run the full eval suite: `npm run evals`.
2. Review `results/latest.json` — check scores and any regressions.
3. If the results are acceptable, copy `latest.json` to `baseline.json`:
   ```bash
   cp packages/evals/results/latest.json packages/evals/results/baseline.json
   ```
4. Commit `baseline.json` in a dedicated PR with a note on what changed.

Never auto-update `baseline.json` in CI or via a script that bypasses review.

## What does NOT run in `npm run check`

The evals are intentionally excluded from `npm run check` (the CI gate). They
are slow (CLI adapters 30–60 s/call), non-deterministic, and consume real LLM
credits. The **canary tests** in `src/providers/*.test.ts` DO run under
`npm run check` — they prove the diff-only invariant without making real LLM
calls.
