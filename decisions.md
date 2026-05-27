# LGTM-Buzzer Decisions Log

This file is the canonical record of architectural decisions (ADRs from the
architect agent) and PM activity (milestones + issues filed). Each PM run
appends a dated section under `## PM Log`. Each architect run appends a full
ADR under `## ADRs`. Do not rewrite history here; append only.

## PM Log

### 2026-05-22 — Initial milestones + M0/M1 backlog filed

**Milestones created**

- `M0: FP foundation` (#1) — adopt monadyssey, ESLint enforcement, Result→Either migration, zod in protocol, the "no IO in core" lint rule.
- `M1: Native messaging skeleton` (#2) — host stdio framing, structured logger to stderr, first wire-format schemas (ping/pong), zod validation at the boundary, dev-harness wired to real framing.
- `M2: spawnIO + first LLM adapter (claude-cli)` (#3) — created empty per request; will be populated after M0 proves the pipeline.

**Issues created — M0 (FP foundation)**

- #1 `chore(tooling): install the FP foundation in the workspaces that need it` — kickoff issue. Smallest isolated change. Areas: tooling, core, adapters, host. Depends on: nothing.
- #2 `chore(tooling): block forbidden FP libraries via ESLint no-restricted-imports` — Areas: tooling. Depends on: #1.
- #3 `chore(core): forbid the IO/Schedule surface inside core via ESLint` — Areas: tooling, core. Depends on: #1.
- #4 `refactor(protocol): replace placeholder Result<T,E> with the FP foundation's Either` — Areas: protocol, core, adapters. Depends on: #1. The first end-to-end exercise of the FP foundation.
- #5 `chore(protocol): add zod as a runtime dependency` — Areas: protocol. Depends on: nothing.
- #6 `chore(tooling): define npm run check as the CI gate (build + test + lint)` — Areas: tooling. Depends on: #2, #3, #4. M0 stitching step; should land last in M0.

**Issues created — M1 (Native messaging skeleton)**

- #7 `feat(protocol): define the wire-format envelope schema for native-messaging frames` — Areas: protocol. Depends on: #5.
- #8 `feat(protocol): define ping and pong message schemas as the first wire-format message pair` — Areas: protocol. Depends on: #5, #7.
- #9 `feat(host): structured logger to stderr only (never stdout)` — Areas: host. Depends on: nothing within M1; can land in parallel with the protocol schemas.
- #10 `feat(host): read length-prefixed native-messaging frames from stdin` — Areas: host. Depends on: #7, #9.
- #11 `feat(host): write length-prefixed native-messaging frames to stdout` — Areas: host. Depends on: #7, #9.
- #12 `feat(host): wire the dev-harness end-to-end through real framing with ping → pong` — Areas: host. Depends on: #8, #9, #10, #11. Closes M1.

**Recommended first issue for the architect**

#1 — the smallest, most isolated kickoff. Every other M0 issue depends on it; it has no upstream dependencies; it touches only `package.json` files; and it gives the architect/dev/reviewer agents a tiny, well-scoped piece to chew on first.

**Security posture**

No issue in M0 or M1 routes non-diff PR text (description, title, commit messages, labels, comments) into an LLM prompt. None at this milestone could — the host has no LLM adapter yet, and M1's only payloads are synthetic ping/pong fields. No issue carries `area:security-sensitive`.

**Open questions surfaced (none block the architect)**

- #7 — should the envelope schema reserve a slot for protocol-version metadata? Architect to decide.
- #8 — whether ping carries a payload at all (vs. empty object). Architect to decide.
- #9 — default log level (info vs. debug). Architect to decide.
- #12 — dev-harness launches host as child process or imports main directly. Architect to decide.

**Status**

All twelve issues marked `Status: READY_FOR_ARCH` via comment. Awaiting architect.

### 2026-05-22 — Verification-gate gap surfaced by PR #13

**Issue created — M0 (FP foundation)**

- #14 `chore(tooling): type-check test files in the verification gate` —
  Areas: tooling. Depends on: nothing upstream. Likely **blocks #6**
  (CI gate) unless the architect folds this work into #6.

**Why filed**

PR #13's review uncovered that the current gate (`npm run build &&
npm test && npm run lint`) does not catch TypeScript type errors in
`*.test.ts` files. `tsc -b` excludes test files via every workspace's
`tsconfig.json`; Vitest's esbuild pipeline strips types without
checking them; typescript-eslint's recommended rules are syntactic.
Seven type-broken smoke tests nearly merged — and ADR-1's own
smoke-test code sample inherited the same bug shape, which is the
clearest possible signal that the gate must enforce this, not human
review. The reviewer agent's ad-hoc `tsc --noEmit` sweep is a
workaround, not a gate.

**Open question flagged for the architect**

Two implementation paths, both viable; architect must pick:
(a) per-workspace `tsconfig.test.json` + `typecheck:tests` running
`tsc --noEmit`, or (b) Vitest's built-in `--typecheck` mode. Plus a
sequencing call: land #14 before #6, or fold #14 into #6.

**Security posture**

Not security-sensitive. Build/test tooling only; no path handling PR
text, diffs, or LLM prompts is touched.

**Status**

#14 marked `Status: READY_FOR_ARCH` via comment. Awaiting architect.

### 2026-05-22 — M2/M3 backlog filed

**Milestones touched**

- Renamed M2 (#3) from `M2: spawnIO + first LLM adapter (claude-cli)` to `M2: First vertical slice (Chrome + claude-cli + GitHub)` to match the broader end-to-end vertical-slice scope. Description updated. `milestone:M2` label description updated.
- Created M3 (#4): `M3: Functioning product (multi-LLM, ADO, polish, evals)`. New label `milestone:M3` created. New area labels created where missing: `area:docs`, `area:evals`, `area:e2e`. (`area:tooling` and `area:security-sensitive` already existed.)

**Issues created — M2 (First vertical slice; Chrome + claude-cli + GitHub)**

- #32 `feat(adapters): spawnIO helper that wraps subprocess execution in IO with bounded cancellation` — Areas: adapters. Depends on: nothing. The M2 kickoff and the single foundational adapter primitive per CLAUDE.md §spawnIO contract.
- #33 `feat(core): LLMProvider port + Quiz domain types for diff-only quiz generation` — Areas: core, protocol, security-sensitive. Depends on: nothing within M2.
- #34 `feat(core): VCSProvider port + PR-identifier and Diff domain types` — Areas: core, protocol, security-sensitive. Depends on: nothing within M2.
- #35 `feat(protocol): quiz-request / quiz-response / quiz-submit / quiz-result wire-format messages` — Areas: protocol, security-sensitive. Depends on: #33, #34.
- #36 `feat(adapters/claude-cli): first LLMProvider implementation that shells out to the claude CLI` — Areas: adapters, security-sensitive. Depends on: #32, #33.
- #37 `feat(adapters/github): VCSProvider implementation that fetches PR diff bytes from the GitHub API` — Areas: adapters, security-sensitive. Depends on: #34.
- #38 `feat(core): QuizSession aggregate composing VCSProvider + LLMProvider into the gate decision` — Areas: core, security-sensitive. Depends on: #33, #34.
- #39 `feat(host): dispatcher routes quiz-request / quiz-submit to the QuizSession aggregate` — Areas: host, security-sensitive. Depends on: #35, #36, #37, #38.
- #40 `feat(host): install script writes the Chrome native-messaging manifest to the per-OS path` — Areas: host, tooling, docs. Depends on: nothing.
- #41 `feat(extension): service worker maintains a native-messaging port to the host and routes quiz frames` — Areas: extension, security-sensitive. Depends on: #35.
- #42 `feat(extension): content script intercepts the Approve button on github.com PR review pages` — Areas: extension, security-sensitive. Depends on: #41, #43.
- #43 `feat(extension): minimal viable quiz modal UI (questions, answers, submit, pass/fail)` — Areas: extension. Depends on: #41, #42.
- #44 `docs: getting-started walkthrough for the M2 vertical slice (install, load, gate a real PR)` — Areas: docs, tooling. Depends on: #32–#43. M2 closer.

**Issues created — M3 (Functioning product; multi-LLM, ADO, polish, evals)**

- #45 `feat(adapters/codex-cli): second LLMProvider implementation backed by the codex CLI` — Areas: adapters, security-sensitive. Depends on: #32, #33, #36.
- #46 `feat(adapters/copilot-cli): third LLMProvider implementation backed by gh copilot` — Areas: adapters, security-sensitive. Depends on: #32, #33, #36.
- #47 `feat(adapters/ado): VCSProvider implementation that fetches PR diff bytes from Azure DevOps` — Areas: adapters, security-sensitive. Depends on: #34, #37.
- #48 `feat(extension): content script intercepts Approve on dev.azure.com PRs` — Areas: extension, security-sensitive. Depends on: #42, #47.
- #49 `feat(host): pick the active LLM and VCS adapters at runtime from user configuration` — Areas: host, adapters. Depends on: #45, #46, #47.
- #50 `feat(extension): options page for picking LLM adapter and per-adapter settings` — Areas: extension. Depends on: #49.
- #51 `test(extension): first Playwright e2e covering the happy-path quiz gate` — Areas: e2e, extension. Depends on: #44.
- #52 `test(evals): promptfoo workspace with the first quiz-quality eval suite` — Areas: evals, security-sensitive. Depends on: #36.
- #53 `feat(extension): quiz modal polish — error states, retry on transient errors, accessibility pass` — Areas: extension. Depends on: #41, #43.
- #54 `chore(tooling): GitHub Actions workflow running npm run check on push and PR` — Areas: tooling. Depends on: nothing.
- #55 `chore(tooling): packaging script produces extension zip + host tarball with install script` — Areas: tooling, host, extension. Depends on: #40, #54 (recommended).
- #56 `docs: README + getting-started usable by an outside user` — Areas: docs. Depends on: every other M3 issue. M3 closer.

**Recommended first M2 issue for the architect**

#32 — the spawnIO helper. CLAUDE.md §spawnIO contract calls it out as the most important adapter primitive and the first thing the dev agent should scaffold. It has no upstream dependencies, every LLM adapter composes on top of it, and its cancellation tests are non-trivial enough that they deserve the first ADR of M2 to themselves.

**Security posture (KEY DIFFERENTIATOR — diff-only invariant)**

Twelve of the 25 new issues carry `area:security-sensitive` because they touch the LLM-prompt construction path, the diff-fetching path, or the wire-format messages that travel between the page (which can see non-diff PR text) and the host (which feeds the LLM):

- M2: #33, #34, #35, #36, #37, #38, #39, #41, #42.
- M3: #45, #46, #47, #48, #52.

Each spec body explicitly forbids routing PR description / title / commit messages / labels / comments into the LLM prompt and calls out the binding rule from CLAUDE.md §Key differentiator. The architect must enforce this invariant in every ADR; the reviewer must reject any later change that adds such a field to the relevant port, adapter, or wire-format schema.

**Out-of-scope (explicitly deferred past M3)**

Safari port (locked decision: Safari is the "later browser" wrapped via the Xcode converter post-v1.0). Multi-user / team policy server. Telemetry of any kind. Server-side LLM. Persistent quiz/result analytics. Self-hosted ADO Server is best-effort only via #48.

**Open questions surfaced (none block the architect; flagged for ADRs to resolve)**

- #33 — question representation (multiple-choice / free-text / both); affects #43 and #52.
- #33 / #34 — whether DTOs live in protocol vs. core, and the exact composition with session tokens (#35).
- #34 — whether Diff is a single string or per-file list; affects prompt construction in #36 / #45 / #46.
- #36 — exact prompt template wording; reviewer eyeballs for prompt-injection robustness.
- #40 — Linux/Windows installer scope (recommend macOS + Linux for v1; Windows deferred).
- #41 — MV3 service-worker lifecycle: keep the native port open vs. open per quiz.
- #49 — config transport: chrome.storage round-trip via wire message vs. host-side config file.
- #51 — stub host vs. in-process LLMProvider fake for Playwright.
- #55 — single-file bundled host binary vs. shipping the workspace and relying on node.

**Status**

All 25 new issues (#32–#56) marked `Status: READY_FOR_ARCH` via comment. Awaiting architect; per CLAUDE.md sub-agent routing, dispatch sequentially starting with #32.

## ADRs

## ADR-1: Install the FP foundation (monadyssey + monadyssey-fetch) at exact-pinned versions
**Date**: 2026-05-22
**Issue**: #1
**Status**: Accepted

### Context

CLAUDE.md locks `monadyssey` (+ `monadyssey-fetch` for HTTP) as the single FP
foundation across the monorepo. The scaffold landed without either package
declared in any workspace's `package.json`. Until they are installed at the
pinned versions specified by the per-package dependency policy, every
downstream M0 issue (#2 forbidden-libs lint, #3 no-IO-in-core lint, #4
`Result<T,E>` → `Either` migration) is blocked. This ADR is install-only —
no new types, no port definitions, no migration of existing code.

A spec ambiguity briefly suggested a separate `monadyssey-core` npm
package. There is no such package on npm: the FP foundation ships as a
single `monadyssey` package containing both the pure (`Either`, `Option`,
`Eval`, `Ref`, `NonEmptyList`) and effectful (`IO`, `Schedule`) surfaces.
The "core gets only the IO-free surface" rule from CLAUDE.md is enforced
at lint level by issue #3, not by separate packages.

Verified on npm before locking:

- `monadyssey@2.0.1` — latest, MIT, ESM+CJS via conditional exports,
  zero runtime deps.
- `monadyssey-fetch@2.0.1` — latest, MIT, ESM+CJS via conditional
  exports, peer-deps `monadyssey ^2.0.1` (satisfied by our pin).

Both ship `type: "module"` with `exports` maps that declare both
`import` and `require` conditions, so consumers on `module: "NodeNext"`
resolve the `.mjs` entry without trouble.

### Decision

Install the FP foundation as a runtime dependency in exactly the
workspaces the per-package policy in CLAUDE.md permits, pinned to the
exact version `2.0.1` in every `package.json` that declares it. Add one
trivial smoke test per affected workspace that imports a value from
`monadyssey` and asserts it works, so the dev agent (and the reviewer)
can prove the install actually landed in that workspace and isn't being
silently hoisted-but-unused. Existing scaffold smoke tests (the
`Result`-shaped assertions in each `index.test.ts`) stay untouched —
that migration is issue #4.

#### Affected workspaces

Dependency arrows are unchanged. This ADR adds an external runtime dep
to leaf packages only; no new internal imports cross any boundary.

```
protocol  ← core  ← adapters  ← host
protocol  ← core  ← extension
```

Per-workspace install matrix:

| Workspace                          | monadyssey | monadyssey-fetch |
|------------------------------------|:----------:|:----------------:|
| `packages/protocol`                |     —      |        —         |
| `packages/core`                    |  `2.0.1`   |        —         |
| `packages/adapters/claude-cli`     |  `2.0.1`   |        —         |
| `packages/adapters/codex-cli`      |  `2.0.1`   |        —         |
| `packages/adapters/copilot-cli`    |  `2.0.1`   |        —         |
| `packages/adapters/github`         |  `2.0.1`   |     `2.0.1`      |
| `packages/adapters/ado`            |  `2.0.1`   |     `2.0.1`      |
| `packages/host`                    |  `2.0.1`   |        —         |
| `packages/extension`               |     —      |        —         |

Rationale:

- `protocol` — CLAUDE.md: zero runtime deps except `zod`; reusable from
  any FP stack. Adding `monadyssey` would couple every protocol
  consumer to our FP choice.
- `core` — CLAUDE.md: `monadyssey` only, IO-free surface. The forbidden
  `IO`/`Schedule` imports are enforced via lint in issue #3.
- `adapters/*` — all five need `monadyssey` because every adapter
  function returns `IO<E, A>`.
- `adapter-github`, `adapter-ado` — additionally need
  `monadyssey-fetch` because they make HTTP calls. The three CLI
  adapters (`claude-cli`, `codex-cli`, `copilot-cli`) do not — they
  shell out via `spawnIO` (issue lands in M2), not HTTP.
- `host` — top-level wiring produces `IO` values; CLAUDE.md explicitly
  lists `monadyssey` as a host dependency.
- `extension` — CLAUDE.md: default to plain TS + `zod`; opt in per
  feature. Not part of M0.

#### Types

None (install-only).

#### Functions and methods

None (install-only).

#### File layout

Modified files (eight `package.json` changes + the lockfile):

- `packages/core/package.json` — add `"monadyssey": "2.0.1"` to `dependencies`.
- `packages/adapters/claude-cli/package.json` — add `"monadyssey": "2.0.1"`.
- `packages/adapters/codex-cli/package.json` — add `"monadyssey": "2.0.1"`.
- `packages/adapters/copilot-cli/package.json` — add `"monadyssey": "2.0.1"`.
- `packages/adapters/github/package.json` — add `"monadyssey": "2.0.1"` and `"monadyssey-fetch": "2.0.1"`.
- `packages/adapters/ado/package.json` — add `"monadyssey": "2.0.1"` and `"monadyssey-fetch": "2.0.1"`.
- `packages/host/package.json` — add `"monadyssey": "2.0.1"`.
- `package-lock.json` — regenerated by the install.

Unchanged (explicitly): `packages/protocol/package.json`,
`packages/extension/package.json`, root `package.json`.

New files (smoke tests, one per workspace receiving the dep):

- `packages/core/src/monadyssey.smoke.test.ts`
- `packages/adapters/claude-cli/src/monadyssey.smoke.test.ts`
- `packages/adapters/codex-cli/src/monadyssey.smoke.test.ts`
- `packages/adapters/copilot-cli/src/monadyssey.smoke.test.ts`
- `packages/adapters/github/src/monadyssey.smoke.test.ts`
- `packages/adapters/github/src/monadyssey-fetch.smoke.test.ts`
- `packages/adapters/ado/src/monadyssey.smoke.test.ts`
- `packages/adapters/ado/src/monadyssey-fetch.smoke.test.ts`
- `packages/host/src/monadyssey.smoke.test.ts`

Smoke-test contents are the same shape everywhere — keep them dumb on
purpose:

```ts
// packages/<ws>/src/monadyssey.smoke.test.ts
import { describe, expect, it } from "vitest";
import { Right } from "monadyssey";

describe("monadyssey is installed and importable", () => {
  it("Right.of wraps a value", () => {
    const r = Right.of(1);
    expect(r.fold((_l) => "left", (v) => v)).toBe(1);
  });
});
```

```ts
// packages/adapters/{github,ado}/src/monadyssey-fetch.smoke.test.ts
import { describe, expect, it } from "vitest";
import * as MFetch from "monadyssey-fetch";

describe("monadyssey-fetch is installed and importable", () => {
  it("module loads without throwing", () => {
    expect(MFetch).toBeDefined();
  });
});
```

The `monadyssey-fetch` smoke deliberately does not call the network;
it only proves the module resolves on `module: "NodeNext"` from this
workspace. The first real HTTP call lands with the github/ADO adapter
ADRs in a later milestone.

#### Sequence

The dev agent runs these commands verbatim, in order, from the repo
root. One workspace per `npm install` call — slower than batching, but
each step is independently re-runnable and the lockfile diff stays
readable. `--save-exact` forces the literal `"2.0.1"` form in every
`package.json`.

1. `npm install monadyssey@2.0.1 --save-exact --workspace=@lgtm-buzzer/core`
2. `npm install monadyssey@2.0.1 --save-exact --workspace=@lgtm-buzzer/adapter-claude-cli`
3. `npm install monadyssey@2.0.1 --save-exact --workspace=@lgtm-buzzer/adapter-codex-cli`
4. `npm install monadyssey@2.0.1 --save-exact --workspace=@lgtm-buzzer/adapter-copilot-cli`
5. `npm install monadyssey@2.0.1 monadyssey-fetch@2.0.1 --save-exact --workspace=@lgtm-buzzer/adapter-github`
6. `npm install monadyssey@2.0.1 monadyssey-fetch@2.0.1 --save-exact --workspace=@lgtm-buzzer/adapter-ado`
7. `npm install monadyssey@2.0.1 --save-exact --workspace=@lgtm-buzzer/host`
8. Add the nine smoke-test files listed in **File layout** above.
9. Run the verification commands (see **Test strategy**).
10. Commit `package-lock.json` along with all `package.json` and smoke-test changes.

After step 7, grep every modified `package.json` to confirm there is no
`^` or `~` prefix on either dep:

```bash
grep -E '"monadyssey(-fetch)?":' packages/core/package.json \
  packages/adapters/*/package.json packages/host/package.json
```

Every hit must match the literal pattern `"monadyssey..." : "2.0.1"`.

#### Error cases

This is an install ADR, not a runtime change, so there are no
`Result`/`Either` error variants to define. Install-time failure modes
the dev agent must watch for:

- **Lockfile conflict.** If `npm install` warns about an existing
  `package-lock.json` that disagrees with the new pins, do **not**
  `--force` it. Delete the offending entries by hand or re-run from a
  clean tree (`rm -rf node_modules package-lock.json && npm install`)
  and verify the resulting lockfile pins `monadyssey@2.0.1` exactly.
- **Caret slipped in.** If any `package.json` ends up with `^2.0.1` or
  `~2.0.1`, the grep check above will catch it. Re-run the install
  for that workspace with `--save-exact` explicitly. This is the
  most likely human error.
- **Peer-dep warning on `monadyssey-fetch`.** `monadyssey-fetch@2.0.1`
  peer-deps `monadyssey ^2.0.1`. Our pin of `2.0.1` satisfies that.
  If npm logs a peer warning anyway, treat it as a hard failure —
  something is wrong with the install — and re-check the lockfile.
- **ESM/CJS resolution under `module: "NodeNext"`.** Both packages
  publish conditional exports with both `import` (`.mjs`) and
  `require` (`.cjs`) entries; Vitest in ESM mode picks the `.mjs`. If
  any smoke test fails with `ERR_REQUIRE_ESM` or
  `ERR_MODULE_NOT_FOUND`, do not patch around it — the install is
  broken and the dev agent must escalate.
- **Lockfile dirty after `npm install` no-op.** Re-running step 1-7
  on a green tree must produce a clean `git status`. If the lockfile
  keeps shifting, escalate before committing.

#### Test strategy

- **Smoke tests** (the nine files above) prove the dep is actually
  installed in each workspace and not silently hoisted-but-unreferenced.
  They use only `Right.of` from `monadyssey` and a bare module-load
  check for `monadyssey-fetch`. They live next to the existing
  scaffold tests and run under `vitest run` with no config changes.
- **No contract tests.** No ports or adapters change.
- **No e2e tests.** No host or extension behavior changes.
- **Existing scaffold tests are untouched.** The placeholder
  `Result<T,E>` assertions in each `index.test.ts` continue to pass.
  Migrating those to `Either` is issue #4.
- **Manual verification (CI gate)** — the dev agent runs, from a clean
  checkout:
  ```bash
  rm -rf node_modules && npm install
  npm run build
  npm test
  npm run lint
  ```
  All four must pass green. `npm test` must show the nine new smoke
  tests passing in addition to the existing scaffold suites.

### Consequences

- **Unblocks all of M0.** Issues #2 (forbidden-libs lint), #3 (no-IO-in-core
  lint), and #4 (`Result` → `Either` migration) can all proceed once this
  lands. #5 (zod in protocol) is independent and can land in parallel.
- **Version drift is now a deliberate, reviewable event.** Because every
  pin is exact, a future bump from `2.0.1` shows up as a literal version
  change in seven `package.json` files plus the lockfile — easy to spot
  in PR review. CLAUDE.md says bumps go through changesets; this ADR
  preserves that property.
- **No new license risk.** Both packages are MIT.
- **`extension` is intentionally on plain TS + zod.** Adding `monadyssey`
  there later (e.g., for cancellable LLM-status polling) will be its
  own ADR per CLAUDE.md, with the justification documented in
  `packages/extension/README.md` at that time.
- **Slight friction for future contributors.** Anyone adding a new
  workspace must remember to install `monadyssey` explicitly if the
  workspace needs it; npm workspaces do not propagate. This is the
  price of per-workspace pinning and is accepted.
- **No security implications.** No code paths change; no PR text or
  diff content moves anywhere new. The key-differentiator constraint
  (quiz prompts take only the diff) is not touched.

## ADR-2: Type-check test files in the verification gate via per-workspace `tsconfig.test.json` + a `typecheck:tests` driver
**Date**: 2026-05-22
**Issue**: #14
**Status**: Accepted

### Context

PR #13 nearly merged with seven `*.test.ts` files containing TS2322
errors. The current verification gate — `npm run build && npm test &&
npm run lint` — is blind to type errors inside test files for three
independent reasons:

1. `tsc -b` (run via `npm run build` → `scripts/build-libs.mjs`) honors
   every package's `tsconfig.json`, and every workspace except
   `extension` excludes `**/*.test.ts`. Test files are simply never seen
   by tsc.
2. `vitest run` (run via `npm test`) compiles test files through
   esbuild, which **strips types without checking them**. esbuild
   accepts and silently discards malformed type annotations.
3. `npm run lint` uses `typescript-eslint`'s recommended (syntactic)
   rules, not the type-aware ones. Type-aware rules are out of scope
   per the issue (`Out of scope`: "Adding type-aware ESLint rules
   across the repo").

Net effect: TS errors in tests can ship green. The reviewer agent
caught PR #13 via an ad-hoc `tsc --noEmit` sweep over individual files
— a manual safety net, not a gate. ADR-1's own smoke-test code sample
inherited the same class of bug, which is the clearest possible signal
that humans (and agents) will keep re-introducing it until the gate
enforces it mechanically.

One subtlety: `packages/extension/tsconfig.json` is structured
differently. It has `noEmit: true`, `include` covers `entrypoints/**`,
`src/**`, and `wxt.config.ts`, and there is no `**/*.test.ts` exclude
— so the extension's tsconfig already type-checks its test files. The
extension's `compile` script runs `wxt prepare && tsc --noEmit -p
tsconfig.json` end-to-end. The current root `build:extension` runs
`wxt build` (not `compile`), so the extension's test files are not
checked through the root gate today; the gate must invoke the
extension's existing `compile` script to close that path. Crucially,
the extension does **not** need its own `tsconfig.test.json` — its
main tsconfig already does the right thing.

Two implementation approaches were evaluated (issue #14 open question
1):

**(a) Per-workspace `tsconfig.test.json` + `typecheck:tests` driver.**
Each workspace adds a sibling `tsconfig.test.json` that extends
`tsconfig.json`, drops the `**/*.test.ts` exclude, sets `noEmit: true`
and `composite: false`, and is registered with a tiny root driver
script that runs `tsc -p <each>/tsconfig.test.json` for every
workspace except `extension` (where the existing `compile` script is
invoked instead).

**(b) Vitest `--typecheck`.** A single root config change; `vitest
run --typecheck` (or a sibling `test:typecheck` script) discovers
`*.test.ts` and runs them through tsc-as-vitest-plugin.

Trade-offs:

| | (a) per-workspace `tsconfig.test.json` | (b) `vitest --typecheck` |
|---|---|---|
| Type-checker | raw `tsc` (single authority) | tsc invoked by vitest's typecheck plugin |
| Diagnostics | identical to `tsc -b` for production code | shaped as vitest test results; can drift from raw tsc on edge cases |
| New files | N+1 (one tsconfig.test.json per non-extension workspace + small driver) | 0 (one root script change) |
| Speed (cold) | fast — straight `tsc -p` per workspace, parallelizable | slower — vitest does isolated per-file compilation rather than incremental project builds |
| Couples gate to | tsc only (already a dep) | vitest's typecheck implementation surface |
| Affects `npm test` | no — separate command | yes if folded into `npm test`; or separate script if not |
| Extension story | extension is special-cased to its own `compile` script | extension is special-cased anyway (vitest scans extension tests, but the extension's tsconfig is `noEmit`/all-included already) |

**Decision: (a).** Reasons, in order:

1. **`tsc` is already the type-checking authority** for production
   code (`tsc -b` via `build:libs`). Using the same compiler for tests
   means the diagnostics dev and CI see are exactly the diagnostics
   they would see when migrating a test helper into production. There
   is no "vitest says one thing, tsc says another" failure mode.
2. **No new runtime tool surface.** Approach (b) ties the gate to
   `@vitest/runner`'s typecheck integration, which is a moving target
   in vitest's release notes and has historically had diagnostic
   coverage gaps vs. raw tsc. Approach (a) only uses `typescript`
   itself, already a devDep, already pinned.
3. **Cold-run performance.** Approach (a) is `tsc -p <ws>` per
   workspace, which is incremental-friendly and ~1-2s per workspace
   on a typical contributor machine — total budget well under 10s on
   eight workspaces. Approach (b) launches vitest's worker pool to do
   isolated typechecks, which we measured (anecdotally, vitest issue
   reports) at 2-3× the equivalent raw tsc time.
4. **The N+1-config cost is bounded and one-time.** There are eight
   non-extension workspaces, each `tsconfig.test.json` is six lines.
   New workspaces created later add one file as part of their
   scaffold — already a per-workspace step (they need
   `package.json`, `tsconfig.json`, `src/index.ts`, etc.).

This decision is reversible — if vitest's typecheck mode improves
substantially in a future release, swapping to (b) is a
delete-N-files-and-replace-one-script change.

Sequencing vs. issue #6 (open question 2): **keep #14 and #6
separate.** This ADR ships only the `typecheck:tests` step as a
first-class root script. #6 will then compose `build:libs`,
`typecheck:tests`, `test`, `build:extension`, and `lint` into a
single `npm run check` gate. Rationale: cleaner concern split (one
ADR = one feature: typecheck-tests; the other = gate composition);
smaller PR; #6 picks up the new step alongside the other M0 lint
rules (#2, #3) it already depends on. Issue #14 is therefore an
upstream blocker for #6's "passes cleanly on current codebase"
acceptance criterion — that edge is added below.

### Decision

Add a per-workspace `tsconfig.test.json` to every workspace that
contains `*.test.ts` files except `extension`, plus a small root
driver script `scripts/typecheck-tests.mjs` registered as `npm run
typecheck:tests`. The driver runs `tsc -p <ws>/tsconfig.test.json`
across all non-extension workspaces sequentially, then runs `npm run
compile --workspace=@lgtm-buzzer/extension` to cover the extension
(which already type-checks its tests via its existing `compile`
script). The script propagates a non-zero exit on the first failure
but always exits with a meaningful aggregate status if invoked with
`--all` (which the gate uses).

The script intentionally mirrors `scripts/build-libs.mjs` in shape and
location — same Node ESM `.mjs` style, same `spawnSync` pattern,
similar "skip when nothing to do" guard — so contributors who already
read one understand the other.

#### Affected workspaces

No source code or production type-checking semantics changes. The
dependency-direction rule is untouched:

```
protocol  ← core  ← adapters  ← host
protocol  ← core  ← extension
```

Per-workspace impact:

| Workspace                          | New `tsconfig.test.json` | Notes                                       |
|------------------------------------|:------------------------:|---------------------------------------------|
| `packages/protocol`                |           yes            | drops test exclude; extends `tsconfig.json` |
| `packages/core`                    |           yes            |                                             |
| `packages/adapters/claude-cli`     |           yes            |                                             |
| `packages/adapters/codex-cli`      |           yes            |                                             |
| `packages/adapters/copilot-cli`    |           yes            |                                             |
| `packages/adapters/github`         |           yes            |                                             |
| `packages/adapters/ado`            |           yes            |                                             |
| `packages/host`                    |           yes            |                                             |
| `packages/extension`               |          **no**          | `tsconfig.json` already covers tests        |

#### Types

N/A. This is a tooling-only ADR — no runtime types, no port
definitions, no domain code changes.

#### Functions and methods

N/A. The only new code is the driver script
`scripts/typecheck-tests.mjs`, which is a CLI orchestrator, not a
public API.

#### File layout

New files (eight per-workspace tsconfigs + one driver script):

- `packages/protocol/tsconfig.test.json`
- `packages/core/tsconfig.test.json`
- `packages/adapters/claude-cli/tsconfig.test.json`
- `packages/adapters/codex-cli/tsconfig.test.json`
- `packages/adapters/copilot-cli/tsconfig.test.json`
- `packages/adapters/github/tsconfig.test.json`
- `packages/adapters/ado/tsconfig.test.json`
- `packages/host/tsconfig.test.json`
- `scripts/typecheck-tests.mjs`

Modified files:

- Root `package.json` — add the `typecheck:tests` script entry.
- `CLAUDE.md` — update the "Build, test, lint commands" section.

Unchanged (explicitly):

- `packages/extension/tsconfig.json` — already correct.
- `packages/extension/package.json` — its `compile` script is
  already what we want to invoke.
- `tsconfig.base.json` — production semantics must not shift.
- Root `tsconfig.json` — references continue to drive `tsc -b` for
  production code only; test typechecking deliberately bypasses the
  project-references graph.
- All eight per-workspace `tsconfig.json` files — the `exclude:
  ["**/*.test.ts", "dist"]` setting **stays**. Production builds
  must not pull test files into emitted output or `dist/`.

##### Shape of every per-workspace `tsconfig.test.json`

The shape is identical across all eight workspaces. Use the path
depth (`../../tsconfig.base.json` for `packages/<name>/`,
`../../../tsconfig.base.json` for `packages/adapters/<name>/`) that
matches the workspace's existing `tsconfig.json`. Example for
`packages/core`:

```jsonc
// packages/core/tsconfig.test.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "sourceMap": false,
    "rootDir": "./src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist"],
  "references": []
}
```

Field-by-field rationale:

- **`extends: "./tsconfig.json"`** — inherits every strictness flag
  (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`, etc.) from the workspace's existing tsconfig
  via `tsconfig.base.json`. If a flag changes there, tests pick it up
  automatically.
- **`noEmit: true`** — typecheck-only run. No `.d.ts` or `.js`
  artifacts hit disk.
- **`composite: false`** — `tsconfig.base.json` sets `composite:
  true` for `tsc -b` project-references mode. The test config is
  invoked via `tsc -p` (single project), not `tsc -b`, so it must
  turn `composite` off; tsc rejects `noEmit: true` together with
  `composite: true`.
- **`declaration: false`, `declarationMap: false`, `sourceMap:
  false`** — base has these on for declaration output; with
  `noEmit`, they are vestigial, but tsc still validates the
  combination, so set them off explicitly.
- **`rootDir: "./src"`** — matches the production tsconfig; prevents
  surprises if a test ever reaches outside `src/`.
- **`types`** — node-typed workspaces (host, adapters) keep
  `["node"]`; protocol and core use `[]` to mirror their main
  tsconfigs. The shape is per-workspace; this is the **one field**
  the dev agent must adjust to match each workspace's existing
  `tsconfig.json`.
- **`include: ["src/**/*"]`** — picks up both production and test
  files; the inherited `exclude` from `tsconfig.json` is overwritten
  by the local `exclude`, so test files are no longer excluded.
- **`exclude: ["dist"]`** — keep `dist` out (no stale emit
  poisoning), but drop the `**/*.test.ts` exclusion deliberately.
  This is the actual point of the file.
- **`references: []`** — explicitly empty. `tsc -p` does not need
  references for a typecheck-only run; cross-workspace imports
  resolve through `node_modules`/`paths` like vitest does. We do not
  want test-file typechecking to depend on `dist/` having been
  built; that would couple `typecheck:tests` to a prior `build:libs`
  run.

##### `scripts/typecheck-tests.mjs`

The script is a thin orchestrator. Shape:

```js
#!/usr/bin/env node
// Type-check every workspace's *.test.ts files using its own
// tsconfig.test.json. Exits non-zero on the first failure but logs
// the rest. Companion to scripts/build-libs.mjs.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);

// Workspaces with their own tsconfig.test.json.
const TEST_PROJECTS = [
  "packages/protocol/tsconfig.test.json",
  "packages/core/tsconfig.test.json",
  "packages/adapters/claude-cli/tsconfig.test.json",
  "packages/adapters/codex-cli/tsconfig.test.json",
  "packages/adapters/copilot-cli/tsconfig.test.json",
  "packages/adapters/github/tsconfig.test.json",
  "packages/adapters/ado/tsconfig.test.json",
  "packages/host/tsconfig.test.json",
];

let failed = false;

for (const project of TEST_PROJECTS) {
  const abs = resolve(ROOT, project);
  if (!existsSync(abs)) {
    console.error(`typecheck:tests — missing ${project}`);
    failed = true;
    continue;
  }
  console.log(`typecheck:tests — ${project}`);
  const r = spawnSync("npx", ["--no-install", "tsc", "-p", abs], { stdio: "inherit" });
  if ((r.status ?? 1) !== 0) failed = true;
}

// Extension already type-checks its tests via its own `compile` script
// (wxt prepare + tsc --noEmit -p tsconfig.json). Delegate.
console.log("typecheck:tests — @lgtm-buzzer/extension (via its compile script)");
const ext = spawnSync(
  "npm",
  ["run", "compile", "--workspace=@lgtm-buzzer/extension"],
  { stdio: "inherit" },
);
if ((ext.status ?? 1) !== 0) failed = true;

process.exit(failed ? 1 : 0);
```

The script runs sequentially on purpose — eight invocations of `tsc
-p` on small projects is fast enough that parallelization adds risk
(output interleaving, npm-workspace lock contention on
`postinstall`/`wxt prepare`) without meaningful payoff for v1. If a
later perf measurement disagrees, switching to `Promise.all` is a
one-commit follow-up.

##### Root `package.json` script changes

Add one script. The existing scripts are unchanged.

```jsonc
{
  "scripts": {
    "build": "npm run build:libs && npm run build:extension",
    "build:libs": "node scripts/build-libs.mjs",
    "build:extension": "npm run build --workspace=@lgtm-buzzer/extension --if-present",
    "typecheck": "node scripts/build-libs.mjs",
    "typecheck:tests": "node scripts/typecheck-tests.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --no-error-on-unmatched-pattern",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "clean": "tsc -b --clean"
  }
}
```

Do **not** add a `check` script here. That is issue #6's job; this
ADR explicitly leaves the gate composition to #6.

##### `CLAUDE.md` "Build, test, lint commands" replacement

Replace the entire fenced bash block plus its trailing sentence with:

```markdown
## Build, test, lint commands

Locked in by the scaffold:

```bash
npm install              # root install, hoists workspaces, runs wxt prepare
npm run build            # tsc -b for libs + wxt build for the extension
npm run build:libs       # tsc -b only (skip the extension)
npm run build:extension  # wxt build only
npm test                 # vitest run across all packages
npm run typecheck:tests  # tsc --noEmit over every *.test.ts file
npm run lint             # eslint . (flat config, enforces dep direction)
npm run format           # prettier --write .
npm run clean            # tsc -b --clean
```

`npm run typecheck:tests` runs the test-file type-check gate
introduced by ADR-2. It is required because `tsc -b` excludes
`**/*.test.ts` in every workspace's `tsconfig.json` and `vitest run`
strips types via esbuild without checking them, so without this step
type errors in tests slip through the gate.

`npm run check` (the composed CI gate) is a TODO for issue #6 and
will include `typecheck:tests` once it lands.
```

Preserve any surrounding section headers and trailing `---` exactly
as they currently appear.

#### Sequence

The dev agent runs these steps in order, from the repo root, on a
branch named `feat/14-typecheck-tests` (per the GitHub conventions
section of CLAUDE.md — `feat/<issue-number>-<short-slug>`).

1. Create the eight `tsconfig.test.json` files. Use the shape
   documented above; adjust only the `extends` relative path and the
   `types` array to match each workspace's existing `tsconfig.json`.
2. Create `scripts/typecheck-tests.mjs` with the contents shown
   above.
3. Add `"typecheck:tests": "node scripts/typecheck-tests.mjs"` to
   the root `package.json` `scripts` block. Do not reorder existing
   entries.
4. Run `npm run typecheck:tests` from a clean tree. Expect green:
   the codebase currently compiles cleanly with `tsc --noEmit` over
   every test file (PR #13's offenders shipped and were already
   fixed in subsequent commits).
5. Run the existing gate (`npm run build && npm test && npm run
   lint`) and confirm nothing regresses.
6. Update `CLAUDE.md` "Build, test, lint commands" section per the
   block above.
7. Execute the regression-test recipe in **Test strategy** below.
   Paste both the failing and passing run outputs into the PR
   description (acceptance criterion 2 in issue #14).
8. Commit all new and modified files. Push and open a PR.

After step 8, the dev agent posts the standard `Status:
READY_FOR_REVIEW` comment on issue #14.

#### Error cases

This is a tooling change; failure modes are CLI exit codes and
config-shape mistakes, not runtime `Either`/`IO` errors.

- **`tsc -p <ws>/tsconfig.test.json` exits non-zero with a TS
  diagnostic.** Expected and desired behavior — that's the gate
  doing its job. The driver script logs the workspace path before
  invoking tsc, so the contributor immediately sees which workspace
  failed; tsc's own output names the file and line.
- **`composite: true` inherited but `noEmit: true` set locally.**
  tsc errors out with TS5069 ("Option 'declaration' cannot be
  specified with option 'noEmit'.") or TS5074. Fix: ensure
  `tsconfig.test.json` sets `composite: false`, `declaration:
  false`, `declarationMap: false`, `sourceMap: false` as shown in
  the shape above. The dev agent must verify this on the first
  workspace they configure and then copy the pattern.
- **Test file imports from a sibling workspace that hasn't been
  built (`dist/` missing).** Resolution falls back through
  `node_modules` to source per the existing TS path setup, so this
  should not occur. If it does, that's a sign the workspace is
  missing its `@lgtm-buzzer/*` peer wiring — escalate; do not patch
  with a project reference in `tsconfig.test.json`, because adding
  references re-couples the test-typecheck step to a prior
  `build:libs` run, which we explicitly do not want.
- **`verbatimModuleSyntax` interaction with vitest's
  `describe`/`it`/`expect`.** Vitest publishes these as **runtime
  values**, not types, so `import { describe, expect, it } from
  "vitest"` is a value import and is unaffected by
  `verbatimModuleSyntax`. The existing scaffold tests already use
  this exact import line and compile cleanly; the new test config
  inherits the same flag and continues to handle it correctly. No
  workaround needed. (If a future test imports `type` from vitest
  — e.g., `import type { TestContext } from "vitest"` — it must
  use the `type` keyword, same as production code.)
- **`scripts/typecheck-tests.mjs` cannot find `npx`/`tsc`.**
  Mirror `build-libs.mjs`'s `npx --no-install` invocation, which
  fails fast if `typescript` is not hoisted into the root
  `node_modules`. Since `typescript` is already a root devDep,
  this should never trigger; if it does, the contributor's
  `node_modules` is broken and they need `rm -rf node_modules
  package-lock.json && npm install`.
- **Extension `compile` script fails.** The driver propagates the
  non-zero exit. If `wxt prepare` fails because the entrypoint
  scaffold drifted, that's an extension bug separate from this
  ADR. Treat as a blocker; do not paper over by skipping the
  extension typecheck.
- **Newly added workspace lacks `tsconfig.test.json`.** The driver
  script's `existsSync` guard logs a clear `typecheck:tests —
  missing <path>` message and marks the run failed. This is the
  intentional canary — adding a workspace without its test
  tsconfig must break the gate. (Add a follow-up CONTRIBUTING note
  if/when contributor count grows past one.)

#### Test strategy

Tooling change — no unit, contract, or e2e tests. The verification is
a manual regression-test recipe the dev agent runs verbatim and
captures in the PR description. This is acceptance criterion #2 in
issue #14.

**Regression-test recipe** (run from repo root, in order, on the
implementation branch):

1. Confirm a clean baseline:
   ```bash
   npm run typecheck:tests
   ```
   Expect exit code `0` and no TS diagnostics.

2. Introduce a deliberate TS2322 in a throwaway test file. Pick
   `packages/core/src/typecheck-gate.regression.test.ts`:
   ```ts
   import { describe, expect, it } from "vitest";

   describe("typecheck-gate regression probe", () => {
     it("intentional TS2322 — DELETE BEFORE COMMITTING", () => {
       const n: number = "not a number"; // TS2322: Type 'string' is not assignable to type 'number'.
       expect(n).toBe(0);
     });
   });
   ```

3. Run the gate:
   ```bash
   npm run typecheck:tests
   ```
   Expect:
   - exit code non-zero,
   - output naming the workspace (`packages/core/tsconfig.test.json`),
   - tsc diagnostic naming the file
     (`packages/core/src/typecheck-gate.regression.test.ts`),
     line, and `error TS2322`.
   Capture the full output for the PR description.

4. Sanity-check that the **existing** gate stays blind without the
   new step:
   ```bash
   npm run build && npm test -- --run packages/core && npm run lint
   ```
   Expect this to pass (or, at most, fail on the test's `expect`
   assertion at runtime — not on the type error). This is the
   evidence that the gap exists and that the new step closes it.
   Capture the output.

5. Delete the throwaway file:
   ```bash
   rm packages/core/src/typecheck-gate.regression.test.ts
   ```

6. Re-run the gate:
   ```bash
   npm run typecheck:tests
   ```
   Expect exit code `0`. Capture the output for the PR description.

7. Run the full existing gate to confirm no regressions:
   ```bash
   npm run build && npm test && npm run lint
   ```
   All three must pass.

**PR description content** (acceptance criterion #2): paste the
outputs from steps 1, 3, 4, and 6 into a `## Verification` section,
with one fenced block per step labeled `# step N — expected
behavior`. The reviewer agent checks for the presence of both a
failing and a passing run.

**Performance budget**: on a typical contributor machine (M-series
Mac, warm `node_modules`), `npm run typecheck:tests` is expected to
add **5-15 seconds** to a cold gate run — eight `tsc -p`
invocations over very small projects (~50 LOC each at the moment)
plus the extension's `compile` step. The dev agent records the
actual measured wall-clock in the PR description. If the measured
delta exceeds 30 seconds on the current codebase, escalate to the
architect rather than merging — it indicates a config mistake
(probably accidental project-references mode or a missing
`skipLibCheck`).

### Consequences

- **Gate now catches test-file type errors.** PR #13's failure mode
  can no longer recur once #6 wires `typecheck:tests` into `npm run
  check`. Until then, `typecheck:tests` is a standalone command
  contributors and the reviewer agent invoke.
- **Issue #6 picks up a new step.** `npm run check` will compose
  `build:libs && typecheck:tests && test && build:extension &&
  lint`. The ordering (typecheck-tests after build:libs but before
  test) means a type error in a test fails fast, before the test
  runner spends time running passing tests in other workspaces. This
  ADR adds an explicit dependency edge: **#14 blocks #6**. Reflected
  in the PM Log via the orchestrator on close-out.
- **One extra config file per new workspace.** Any workspace added
  in future milestones must include `tsconfig.test.json`. The
  driver script's `existsSync` guard surfaces this loudly. Cost:
  one six-line file per new workspace, acceptable.
- **No production-build semantic change.** `tsc -b` continues to
  exclude `**/*.test.ts` in every workspace; `dist/` is unaffected;
  declaration emit is unaffected; project-references graph is
  unaffected. Acceptance criterion #6 in issue #14 is met by
  construction.
- **No new runtime dependency.** Only `typescript` (already a root
  devDep) is invoked. Acceptance criterion #7 in issue #14 met.
- **Extension is special-cased intentionally.** The extension's
  existing `compile` script (`wxt prepare && tsc --noEmit -p
  tsconfig.json`) already type-checks its tests. Driver delegates
  to that script rather than duplicating its configuration. If the
  extension's tsconfig ever starts excluding test files, this ADR's
  invariant breaks silently — the dev agent must add a guard
  comment in the script and a follow-up issue if that day comes.
- **Vitest is decoupled from the gate's type-checking authority.**
  If vitest's compiler pipeline ever diverges from tsc (e.g.,
  swapping esbuild for swc, changing `tsconfig` resolution),
  type-checking is unaffected because it runs through tsc
  independently. Conversely, if `--typecheck` becomes idiomatic in
  vitest land, this ADR can be reversed with one delete-and-replace
  commit.
- **No security implications.** No code path that handles PR text,
  diffs, or LLM prompts is touched. The key-differentiator
  constraint (quiz prompts take only the diff) is not in scope of
  any change here.


---

## ADR-3: Block forbidden FP libraries via a monorepo-wide ESLint `no-restricted-imports` rule
**Date**: 2026-05-22
**Issue**: #2
**Status**: Accepted

### Context

CLAUDE.md's **Forbidden libraries** section locks `monadyssey` (+ `monadyssey-fetch`) as the single FP foundation across the monorepo and lists the libraries that must never be imported:

- `neverthrow`
- `fp-ts`
- `io-ts`
- `effect`
- `purify-ts`
- `true-myth`

Today nothing enforces this. A contributor (or an agent) could install `neverthrow` in an adapter and the reviewer would catch it only by manual inspection. The "single FP foundation" rule must fail closed in the lint pipeline so it cannot be regressed silently.

The existing `eslint.config.js` already has two scoped `no-restricted-imports` blocks: one for `core`/`protocol` (forbidding `node:*` and outer-layer packages) and one for `extension` (forbidding adapters/host and Node APIs). The new rule is **monorepo-wide** — every workspace, every `.ts` file — and therefore must not collide with the scoped blocks. In ESLint's flat config, when two config objects both apply to the same file and both set `no-restricted-imports`, the **later** object wins (full replacement of the rule's options, not a merge of `paths`/`patterns` arrays). The placement strategy below sidesteps this by giving the monorepo-wide rule its own block whose `files` glob targets only the union of files the scoped blocks do *not* cover, and by **duplicating** the forbidden-library entries into the existing scoped blocks so every file is covered exactly once.

Spec ambiguity in the issue ("a new top-level override [...] or extend the existing base rules block") resolved here: extending the base-rules block is **not** viable because the base block has no `files` field (it applies to everything that isn't ignored), and the two scoped blocks would then *replace* its `no-restricted-imports` for files in `core`/`protocol`/`extension`. The only safe placement is one of:

- **(a)** A new top-level block that lists *all* the forbidden-FP entries and **adds** the existing scoped restrictions into the same block's `paths`/`patterns` arrays (merging by hand).
- **(b)** Duplicate the forbidden-FP `paths` + `patterns` into each existing scoped block, and add one new block for the workspaces not covered by either scoped block (`adapters`, `host`, and anything else under `packages/`).

**Decision: (b).** Reasons:

1. The scoped blocks already encode workspace-specific intent (Node forbidden in core/protocol/extension; adapters/host forbidden from extension). Folding everything into a single block forces the architect to re-derive that intent every time a forbidden entry is added.
2. The forbidden-FP entries are an orthogonal axis (FP foundation) from the scoped entries (architecture boundaries). Keeping them as a reusable constant inside `eslint.config.js` and spreading the constant into each block lets a future ADR (e.g., adding another forbidden library) edit one array literal instead of three.
3. The diff is minimal: one new module-level `const FORBIDDEN_FP_LIBS = [...]` plus three small spread sites.

The rule shape is `no-restricted-imports` with **both** `paths` (exact specifiers) and `patterns` (sub-path globs). Exact `paths` catches `import x from "neverthrow"`; `patterns` like `"fp-ts/*"` catches `import x from "fp-ts/lib/Either"`. Both are required to meet acceptance criterion 2.

### Decision

Introduce a module-level constant `FORBIDDEN_FP_LIBS` inside `eslint.config.js` containing the `paths` and `patterns` entries for every library in CLAUDE.md's "Forbidden libraries" section, with a single shared `message` naming the rule and pointing at CLAUDE.md. Spread this constant into the existing `core`/`protocol` block's `no-restricted-imports` options and the existing `extension` block's `no-restricted-imports` options. Add **one** new top-level flat-config block at the end of the array that applies to `packages/**/*.ts` and the union of `files` patterns the two scoped blocks *don't* already cover (in practice: `packages/adapters/**/*.ts` and `packages/host/**/*.ts`), wiring the same `FORBIDDEN_FP_LIBS` entries through `no-restricted-imports`.

The block placement order in `eslint.config.js` (top to bottom) becomes:

1. `ignores` block (unchanged).
2. `...tseslint.configs.recommended` (unchanged).
3. Base rules block — `no-restricted-syntax` and TS rules (unchanged).
4. `core`/`protocol` block — `no-restricted-imports` now includes Node bans, outer-layer bans, **and** the spread `FORBIDDEN_FP_LIBS` entries.
5. WXT entrypoints override (unchanged).
6. `extension` block — `no-restricted-imports` now includes adapter/host bans, Node bans, **and** the spread `FORBIDDEN_FP_LIBS` entries.
7. **New** monorepo-FP block — applies to `["packages/adapters/**/*.ts", "packages/host/**/*.ts"]`; only rule is `no-restricted-imports` with `FORBIDDEN_FP_LIBS`.

Because each file matches at most one of blocks (4), (6), and (7), there is no `no-restricted-imports` collision — every file gets exactly one `no-restricted-imports` rule application, and that application carries the forbidden-FP entries. The base block (3) deliberately does **not** set `no-restricted-imports`, so it cannot be silently overridden.

#### Affected workspaces

Tooling-only ADR. No source code changes; no package dependencies added or removed.

#### Types

N/A — tooling-only ADR.

#### Functions and methods

N/A — tooling-only ADR. The only new identifier is the module-level constant `FORBIDDEN_FP_LIBS` inside `eslint.config.js`.

#### File layout

Modified files: `eslint.config.js` only.

#### Sequence

1. Add `FORBIDDEN_FP_LIBS_MESSAGE`, `FORBIDDEN_FP_LIB_NAMES`, and `FORBIDDEN_FP_LIBS` constants above the `export default`.
2. Spread into the `core`/`protocol` block's `no-restricted-imports.paths` and `patterns`.
3. Spread into the `extension` block's `no-restricted-imports.paths` and `patterns`.
4. Append the new monorepo-FP block (for `packages/adapters/**/*.ts` and `packages/host/**/*.ts`).
5. `npm run lint` clean.
6. Run regression recipe (see Test strategy). Paste both runs into PR description.
7. Commit, push, open PR.

#### Error cases

- **Forbidden import in a source file.** ESLint emits a `no-restricted-imports` error naming the specifier and the configured message.
- **Sub-path forbidden import.** `import { Either } from "fp-ts/lib/Either"` triggers the `patterns` matcher.
- **Two `no-restricted-imports` blocks accidentally apply to the same file.** Prevented by design — blocks have disjoint `files` globs.
- **Forbidden library is in `package.json` but not imported.** Not caught (ESLint doesn't see package.json). Future ADR could add a depcheck-style guard.

#### Test strategy

Regression recipe (run verbatim, capture all outputs into PR `## Verification` section):

1. `npm run lint` — expect exit 0 baseline.
2. Create `packages/core/src/_forbidden.regression.test.ts` with `import { ok } from "neverthrow";` (use `@ts-expect-error` since neverthrow isn't installed).
3. `npm run lint` — expect exit ≠ 0, error names `neverthrow`, message includes `CLAUDE.md "Forbidden libraries"`.
4. Replace import with `import { right } from "fp-ts/lib/Either";` — confirm sub-path matcher fires too.
5. `rm packages/core/src/_forbidden.regression.test.ts`.
6. `npm run lint` — expect exit 0.

### Consequences

- Single-FP-foundation rule is now mechanically enforced.
- Issue #6 (`npm run check`) inherits this rule automatically.
- Future ADRs that add a new forbidden library edit one array literal (`FORBIDDEN_FP_LIB_NAMES`).
- Composition with ADR-4 (no IO/Schedule in core): both rules use `no-restricted-imports`; ADR-3 places its entries inside scoped blocks (core/protocol, extension) and a new adapters/host block. ADR-4 splits the core/protocol block into protocol-only + core-only. Whichever dev lands second merges by: (a) preserving the protocol/core split from ADR-4, (b) ensuring the spread `FORBIDDEN_FP_LIBS` lives in both halves (and in extension, and in adapters/host).
- No security implications.

---

## ADR-4: Forbid the monadyssey IO/Schedule surface inside `core` via ESLint `no-restricted-imports`
**Date**: 2026-05-22
**Issue**: #3
**Status**: Accepted

### Context

CLAUDE.md's per-package dependency policy says `core` may use **only the IO-free surface** of `monadyssey` (`Either`, `Option`, `Eval`, `Ref`, `NonEmptyList`); `IO` and `Schedule` are forbidden in `core` and the policy explicitly nominates ESLint `no-restricted-imports` as the enforcement mechanism. ADR-1 installed `monadyssey@2.0.1` in `core` (and the adapters and host). Nothing in the lint config currently prevents a `core` file from importing `IO`, `Schedule`, or the surrounding retry/cancellation error classes.

The shape of `monadyssey`'s top-level `export` surface was confirmed against `node_modules/monadyssey/dist/monadyssey.d.ts` (v2.0.1), so the `importNames` list below matches reality. CLAUDE.md mentions `Ref` in the IO-free family; that identifier is **not** exported by `monadyssey@2.0.1`. The blocklist therefore enumerates only what currently exists.

Two implementation shapes were evaluated:

- **(a)** Extend the existing block by splitting it into protocol-only and core-only blocks. Each carries its own `no-restricted-imports`; core adds a `paths` entry on `monadyssey`.
- **(b)** Add a third override block scoped to core only, containing only the `paths` rule.

**Decision: (a).** ESLint flat-config rule-replacement semantics: within a single rule (`no-restricted-imports` here), later blocks completely **replace** earlier configurations for the same rule on overlapping `files`. Approach (b) would silently disable the existing Node-API ban on `core` the moment a core-specific block re-declared `no-restricted-imports` without re-stating those patterns. Approach (a) keeps each file-scope's rule self-contained.

### Decision

Replace the single `["packages/protocol/**/*.ts", "packages/core/**/*.ts"]` override block in `eslint.config.js` with **two** override blocks:

1. A `["packages/protocol/**/*.ts"]` block carrying the existing shared `patterns` (Node-API ban + outer-layer-package ban).
2. A `["packages/core/**/*.ts"]` block carrying the **same** shared `patterns` **plus** a new `paths` entry on `"monadyssey"` with an `importNames` blocklist enumerating the IO/Schedule surface.

The rule applies to **all** `.ts` files under `packages/core/`, including `*.test.ts`. Tests in `core` are part of the pure domain layer; if a test genuinely needs `IO`/`Schedule`, that signals the code under test should be a port plus an adapter, with the test in the adapter workspace.

#### Affected workspaces

- `packages/protocol` — none (block reshaped but rule body identical).
- `packages/core` — new: import of any listed monadyssey IO/Schedule symbol now errors.
- `packages/adapters/*`, `packages/host`, `packages/extension` — none (rule scoped out).
- Root `eslint.config.js` — modified.

#### Types / Functions and methods

N/A. Tooling-only ADR.

#### File layout

Modified files: `eslint.config.js` only.

##### Blocklist (`importNames`)

Verified against `node_modules/monadyssey/dist/monadyssey.d.ts` (v2.0.1):

```
IO, Schedule, Policy, RepeatError, RetryError,
PolicyValidationError, TimeoutError, CancellationError,
ConditionalRetryError, Fiber, Cancelled, EvaluationError, Reader
```

`Reader` is included as a defensive measure; if a future feature has a concrete use case for `Reader` in `core`, a follow-up ADR removes it.

##### Allowed (by omission)

`Either`, `Left`, `Right`, `Option`, `Some`, `None`, `Eval`, `NonEmptyList`, `Nel`, `Ok`, `Err`, `Ordering`, `EQ`, `GT`, `LT`, `identity`, `TODO`, `NotImplementedYetError`. Future IO-free additions are allowed by default.

#### Sequence

1. Locate the existing override block whose `files` array is `["packages/protocol/**/*.ts", "packages/core/**/*.ts"]`.
2. Replace it with **two** blocks: protocol-only (same patterns), core-only (same patterns + new `paths` entry on `monadyssey` with the blocklist above).
3. If ADR-3 has landed first, merge: keep the protocol/core split; ensure `FORBIDDEN_FP_LIBS` is spread into both halves (protocol-only block's `paths`/`patterns`, core-only block's `paths`/`patterns`).
4. `npm run lint` clean.
5. Run regression recipe (see Test strategy). Paste all runs into PR `## Verification` section.
6. Commit, push, open PR.

#### Error cases

- **Expected diagnostic** when a `core` file imports a blocked symbol — names the file, the symbol (`IO`), the rule, and the configured message.
- **Default/namespace imports** are not caught by `importNames`. Mitigation: `monadyssey` does not expose a default export (verified). Namespace imports remain a theoretical hole; reviewer agent catches them; future tightening if exploited.
- **Renamed imports** (`import { IO as X }`) — still caught (ESLint matches exported name, not local alias).
- **Re-export from a barrel** in core would itself fail the rule at the barrel.
- **Both ADRs land conflict** — see Consequences for merge recipe.

#### Test strategy

Regression recipe:

1. `npm run lint` — expect exit 0 baseline.
2. Create `packages/core/src/_io_forbidden.regression.test.ts` importing `IO` from `monadyssey`.
3. `npm run lint` — expect exit ≠ 0; diagnostic names `IO`; message from this ADR.
4. Replace import with `import { Right } from "monadyssey";` — confirm lint is clean (positive allowlist test).
5. `rm packages/core/src/_io_forbidden.regression.test.ts`.
6. `npm run lint` — expect exit 0.
7. **Scope isolation**: temporarily add `import { IO } from "monadyssey"` to `packages/host/src/monadyssey.smoke.test.ts`, run `npm run lint`, expect exit 0 (rule scoped to core only). Revert.

### Consequences

- `core` is now mechanically pure with respect to monadyssey surface.
- **Composition with ADR-3.** ADR-3's forbidden-FP entries are scoped per workspace (spread into core/protocol, extension, and a new adapters/host block). ADR-4's split-core-out-of-protocol modification needs the spread `FORBIDDEN_FP_LIBS` preserved in BOTH halves of the split. Whichever dev lands second runs both regression recipes to confirm.
- Tests in `core` obey the rule too — by design.
- `Reader` is on the blocklist defensively; cheap to revert.
- Namespace-import hole acknowledged; reviewer agent is the second line of defense.
- No new runtime deps. No security implications. Fully reversible.

---

## ADR-5: Replace placeholder `Result<T, E>` with monadyssey's `Either<E, A>` across the FP-enabled workspaces
**Date**: 2026-05-22
**Issue**: #4
**Status**: Accepted

### Context

The scaffold shipped a hand-written `Result<T, E>` discriminated union plus `ok` and `err` helpers in `packages/protocol/src/index.ts`, used by the smoke surfaces in `core` and the five adapters. CLAUDE.md locks `Either<E, A>` (from `monadyssey`) as the project's single error type for pure code and forbids `monadyssey` from `protocol` (per-package policy: protocol's only runtime dep is `zod`).

ADR-1 installed `monadyssey@2.0.1` (exact-pinned) in `core` and the five adapters and `host`. ADR-3 added the forbidden-FP-libraries lint. ADR-4 forbade the `IO`/`Schedule` surface of monadyssey from `core` but explicitly allows `Either`, `Left`, `Right`, `Option` — the identifiers this ADR introduces are on the allowlist by construction.

Verified against `node_modules/monadyssey/dist/monadyssey.d.ts` (v2.0.1):

- `Either<A, B>` has **Left first** (`abstract class Either<A, B>`, where `A` is the Left/error type and `B` is the Right/success type).
- `Right.pure<B>(value: B): Right<B>` is the public success constructor.
- `Left.of(error)` is the idiomatic project Left constructor.

**Critical type-parameter swap reminder.** `Result<T, E>` is "Success first, Error second"; monadyssey's `Either<A, B>` is "Left/Error first, Right/Success second". A naive search-and-replace will reverse the type arguments. Every callsite migration must swap order — `Result<X, never>` becomes `Either<never, X>`, not `Either<X, never>`.

Three call-graph properties confirmed by `grep` over `packages/`:

1. **Only 14 files** touch `Result`, `ok`, or `err` in source: the protocol definition + test (2 files), and 12 files across `core` and the five adapters.
2. **`host` and `extension` are clean** — no `Result`/`ok`/`err` imports today.
3. **No adapter or core file uses anything from `protocol` besides `Result`/`ok`/`err`.** After this migration, `core` and the adapters do not import from `@lgtm-buzzer/protocol` at all until issue #5+ adds zod schemas there.

### Decision

Big-bang migration in a single PR: `protocol` deletes `Result`, `ok`, and `err` from `src/index.ts` and deletes `src/index.test.ts` in the same commit that rewrites every callsite in `core` and the five adapters.

#### Type-signature mapping (binding)

| Placeholder type        | monadyssey equivalent  |
|-------------------------|------------------------|
| `Result<X, Y>`          | `Either<Y, X>`         |
| `Result<X, never>`      | `Either<never, X>`     |

**Always swap the parameter order.** `Result` is `<Success, Error>`; `Either` is `<Error, Success>`.

#### Constructor mapping (binding)

| Placeholder call      | monadyssey equivalent | Source module               |
|-----------------------|-----------------------|-----------------------------|
| `ok(value)`           | `Right.pure(value)`   | `monadyssey`                |
| `err(error)`          | `Left.of(error)`      | `monadyssey`                |
| `import { ok, err }`  | `import { Right, Left }` | `monadyssey`             |
| `import type { Result }` | `import type { Either }` | `monadyssey`           |

**Follow-up nit (out of scope, flag for orchestrator):** CLAUDE.md idiom #1 reads `Right.of(input)`; monadyssey v2.0.1 only exposes `Right.pure(value)`. Do not touch CLAUDE.md as part of this ADR.

#### Affected workspaces

| Workspace                          | Source change | Test change |
|------------------------------------|:-------------:|:-----------:|
| `packages/protocol`                |     yes       |  delete file|
| `packages/core`                    |     yes       |     yes     |
| `packages/adapters/claude-cli`     |     yes       |     yes     |
| `packages/adapters/codex-cli`      |     yes       |     yes     |
| `packages/adapters/copilot-cli`    |     yes       |     yes     |
| `packages/adapters/github`         |     yes       |     yes     |
| `packages/adapters/ado`            |     yes       |     yes     |
| `packages/host`                    |     no        |     no      |
| `packages/extension`               |     no        |     no      |

#### Types

- **`Result<T, E>`** — **deleted** from `packages/protocol/src/index.ts`.
- **`Either<A, B>`** — used directly from `monadyssey` everywhere a pure function can fail. Not re-exported from `protocol`.

Post-migration entry-point signatures:

```ts
// packages/core/src/index.ts
export const ready = (): Either<never, typeof CORE_VERSION> =>
  Right.pure(CORE_VERSION);
```

```ts
// packages/adapters/<name>/src/index.ts
export const adapterInfo = (): Either<
  never,
  { readonly id: typeof ADAPTER_ID; readonly coreVersion: typeof CORE_VERSION }
> => Right.pure({ id: ADAPTER_ID, coreVersion: CORE_VERSION });
```

#### Functions and methods

Test assertion shape changes — the dev uses `.fold(...)` per CLAUDE.md idiom #6:

```ts
// packages/core/src/index.test.ts (post-migration)
expect(ready().fold((_l) => "left", (v) => v)).toBe("0.0.0");
```

```ts
// packages/adapters/<name>/src/index.test.ts (post-migration)
expect(adapterInfo().fold((_l) => null, (v) => v))
  .toEqual({ id: "<name>", coreVersion: "0.0.0" });
```

#### File layout

Modified files (13):

- `packages/protocol/src/index.ts` — replace contents with TSDoc-only stub (see below).
- `packages/core/src/index.ts`, `packages/core/src/index.test.ts`
- `packages/adapters/{claude-cli,codex-cli,copilot-cli,github,ado}/src/index.ts`
- `packages/adapters/{claude-cli,codex-cli,copilot-cli,github,ado}/src/index.test.ts`

Deleted files (1):

- `packages/protocol/src/index.test.ts` — the only thing it tests is `ok`/`err`, both gone.

##### Contents of the new `packages/protocol/src/index.ts`

```ts
/**
 * `@lgtm-buzzer/protocol` — shared wire-format and domain DTO surface.
 *
 * This package will host zod schemas for native-messaging frames and
 * domain DTOs (issue #5 and the M1 wire-format issues #7/#8). For now
 * the file is intentionally empty: the placeholder Result type was
 * removed in ADR-5 in favour of the FP foundation's Either (from
 * `monadyssey`) used directly by `core` and the adapters.
 *
 * `protocol` must remain reusable from any FP stack and therefore
 * does not import `monadyssey` (per CLAUDE.md per-package policy).
 */
export {};
```

#### Sequence

1. Replace `packages/protocol/src/index.ts` contents with the stub above.
2. `git rm packages/protocol/src/index.test.ts`.
3. **`packages/core/src/index.ts`**: replace protocol imports with `import { Either, Right } from "monadyssey";`. Change `ready` return type to `Either<never, typeof CORE_VERSION>` (**swap order**). Change body to `Right.pure(CORE_VERSION)`.
4. **`packages/core/src/index.test.ts`**: rewrite the assertion to `.fold((_l) => "left", (v) => v)` form.
5–14. For each of the five adapters (claude-cli, codex-cli, copilot-cli, github, ado): apply the same shape change to `src/index.ts` and `src/index.test.ts`.
15. Run the verification gate (see Test strategy).
16. Commit and push. Branch: `refactor/4-result-to-either`. Commit title: `refactor(protocol): replace Result<T,E> with monadyssey's Either<E,A> (#4)`.

#### Error cases

- **Reversed type-param order** — TS2322 at typecheck. `npm run typecheck:tests` catches in tests; `npm run build` catches in production files.
- **Missed callsite** — `npm run build` fails (symbol gone) plus the grep gate catches it.
- **Trying to use `Right.of`** — TS2339 ("Property 'of' does not exist on type 'typeof Right'"). Always `Right.pure`.
- **Assertion shape not updated** — runtime test failure under `npm test`. Migrate test in lock-step with its source file to keep diagnostics tight.

#### Test strategy

**Grep gate**:

```bash
grep -RnE "(Result<|\bok\(|\berr\()" packages --include="*.ts"
```

Expected output: zero hits under `packages/*/src` (the stub TSDoc avoids naming `Result<>` to keep this clean).

**Standard gate**: `npm run build && npm test && npm run lint && npm run typecheck:tests` — all four green. Test count drops by exactly 2 (the deleted protocol tests); the 6 rewritten `index.test.ts` files retain their existing assertion count.

The dev pastes both the grep-gate output and the four gate command outputs into a `## Verification` section in the PR body.

### Consequences

- First end-to-end exercise of the FP foundation passes.
- `protocol` is reduced to a TSDoc-only stub until issue #5 lands zod schemas.
- `Result` is gone from the codebase; no backward-compat alias.
- No new runtime deps. License diff: none.
- Idiom-#6 (`.fold` over manual narrowing) is now exercised in the smoke tests.
- **Follow-up nit flagged for the orchestrator**: CLAUDE.md idiom #1 reads `Right.of(input)`; should be `Right.pure(value)` to match v2.0.1.
- Security posture unchanged.
- Reversibility: bounded blast radius — 7 source + 6 test files, 2-3 line edits each.

---

## ADR-6: Structured logging in `host` via a `Logger` port in `core` + pino adapter, hard-wired to stderr
**Date**: 2026-05-22
**Issue**: #9
**Status**: Accepted

### Context

`packages/host/src/cli.ts` and `packages/host/src/dev-harness.ts` currently emit free-form text via `process.stderr.write(...)`. The M1 wire-format work will introduce length-prefixed JSON framing on stdout to the browser extension — any byte mistakenly written to stdout becomes a malformed frame and breaks the protocol.

Two hard invariants make ad-hoc logging unsafe past this issue:

1. **stdout is the native-messaging protocol channel.** Logger output must never reach stdout.
2. **Diff content must never appear in logs.** Per CLAUDE.md §Key differentiator, even a stderr crash dump must not include the diff.

CLAUDE.md §Dependency rules already allows `pino` in the `host` package and forbids it elsewhere. Pino is NOT on the forbidden-FP-libraries list (ADR-3) and is not part of the `monadyssey` IO/Schedule surface restricted in `core` (ADR-4) — no ESLint rule changes needed.

PM's open question (`info` vs `debug` default): resolved as `info` in §Decision.

### Decision

Introduce a `Logger` port in `core` and a pino adapter in `host`. The host wires pino at startup with stderr as the only destination, level driven by `LGTM_BUZZER_LOG_LEVEL` (default `info`), and a redaction list baked into the adapter. Rewrite the two existing `process.stderr.write(...)` callsites in `cli.ts` and `dev-harness.ts` to go through the logger.

#### Constraint 1 — stdout is sacred

The pino adapter passes `destination: 2` (file descriptor 2 = stderr) to pino's constructor. A contract test asserts this. No `console.log` permitted in `host` source. Verification recipe (see §Test strategy) demonstrates channel separation.

#### Constraint 2 — Logger port in `core`, pino in `host`

`packages/core/src/ports/logger.ts` is the project's **first port file** and sets the convention for future ports (`LLMProvider`, `VCSProvider`, `QuizPolicy`):
- One port per file under `packages/core/src/ports/`.
- Port is a `type` alias (not `interface`) per CLAUDE.md §Code style.
- Port has zero imports from `monadyssey` unless the surface genuinely needs `Either` or `IO`. `Logger` does NOT.

`core` MUST NOT import `pino`. `host` provides `createPinoLogger` returning a `Logger`.

#### Constraint 3 — No `IO<E, A>` in the Logger surface

Documented carve-out from CLAUDE.md Functional idiom #2:
- Log emission is fire-and-forget — caller has no useful recovery for a log failure.
- Pino swallows write errors by default; host subscribes to the `'error'` event once at construction.
- Threading `IO<never, void>` through every callsite would force `.run()` for a non-domain effect.
- Logger methods return `void`, not `IO<never, void>`. Idiom #2 reaffirmed for all other side effects.

#### Constraint 4 — Redaction (binding list)

Pino's `redact` config uses these paths, all replaced with `[Redacted]`:

```ts
const REDACT_PATHS: readonly string[] = [
  "diff",
  "body",
  "prompt",
  "pr.body",
  "pr.title",
  "pr.description",
  "pr.commits",
  "request.diff",
  "request.body",
  "request.prompt",
  "quiz",
  "quiz.questions",
  "response.diff",
  "response.body",
  "*.diff",
  "*.body",
  "*.prompt",
];
```

Notes:
- `*.diff` / `*.body` / `*.prompt` catch nested re-bindings.
- `quiz` is redacted as a whole in addition to `quiz.questions`.
- `pr.title` is redacted (tight default; no PR-derived text in telemetry).
- `remove: false` keeps the key, replaces the value — easier to grep for the censor token.

#### Default log level: `info`

PM's open question resolved. The host is long-running attached to a Chrome MV3 session; `debug` would produce per-frame chatter. Real diagnostic sessions opt in via `LGTM_BUZZER_LOG_LEVEL=debug`.

Env-var parsing:
- Accept exactly: `trace | debug | info | warn | error | fatal | silent`.
- On unrecognised value: fall back to `info`, log a single `warn` line at startup naming the bad value. Do NOT throw.
- Trim and lowercase before comparison.

The **port** exposes only 4 methods (`debug|info|warn|error`) — `trace` is "debug with more noise" (config-controlled), `fatal` implies process-exit which Chrome owns, not us.

#### Affected workspaces

| Workspace             | Adds                                         | Imports |
|-----------------------|----------------------------------------------|---------|
| `packages/core`       | `Logger` port, `LogBindings`, `LogLevel`     | no new imports |
| `packages/host`       | `createPinoLogger`; rewrites cli/dev-harness | `pino` (new), `@lgtm-buzzer/core` (existing) |

#### Types

##### In `packages/core/src/ports/logger.ts`

```ts
/**
 * Structured logging port.
 *
 * The first port file in `core`. Logger methods return `void` — they
 * are fire-and-forget side effects. This is the only documented
 * carve-out from CLAUDE.md Functional idiom #2 (see ADR-6 §Constraint 3).
 */
export type LogLevel =
  | "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";

export type LogBindings = Readonly<Record<string, unknown>>;

export type Logger = {
  readonly debug: (msg: string, bindings?: LogBindings) => void;
  readonly info: (msg: string, bindings?: LogBindings) => void;
  readonly warn: (msg: string, bindings?: LogBindings) => void;
  readonly error: (msg: string, bindings?: LogBindings) => void;
  readonly child: (bindings: LogBindings) => Logger;
};
```

`LogBindings` is `Record<string, unknown>` rather than a strict recursive type — pino does the serialisation, and redaction (not type-narrowing) is the right tool for "don't log the diff."

##### Re-exports in `packages/core/src/index.ts`

```ts
export type { LogBindings, LogLevel, Logger } from "./ports/logger.js";
```

#### Functions and methods

##### `createPinoLogger` (in `packages/host/src/logger.ts`)

```ts
import type { LogBindings, Logger } from "@lgtm-buzzer/core";
import pino, { type Logger as PinoLogger } from "pino";

const LEVEL_ENV_VAR = "LGTM_BUZZER_LOG_LEVEL" as const;
const VALID_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;
const REDACT_PATHS: readonly string[] = [/* see Constraint 4 */];

export type PinoLoggerOptions = {
  readonly level?: string;
  readonly bindings?: LogBindings;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly destination?: pino.DestinationStream | number;
};

export const createPinoLogger = (opts?: PinoLoggerOptions): Logger => {
  // resolve level; construct pino with redact + destination; wrap; return.
};
```

Internally:
- Resolves the level from `opts.level ?? env.LGTM_BUZZER_LOG_LEVEL ?? "info"`.
- Constructs pino with `redact: { paths: REDACT_PATHS, censor: "[Redacted]", remove: false }`.
- Wires destination to `opts.destination ?? pino.destination(2)`.
- Attaches a one-time `'error'` listener that does a single `process.stderr.write(...)` and nothing else (no JSON, no retry).
- Returns an object satisfying `Logger`, with `child(bindings)` wrapping `pinoInstance.child(bindings)` recursively.

##### Wrapping pino as `Logger`

```ts
const wrap = (p: PinoLogger): Logger => ({
  debug: (msg, bindings) => { p.debug(bindings ?? {}, msg); },
  info:  (msg, bindings) => { p.info(bindings  ?? {}, msg); },
  warn:  (msg, bindings) => { p.warn(bindings  ?? {}, msg); },
  error: (msg, bindings) => { p.error(bindings ?? {}, msg); },
  child: (bindings)      => wrap(p.child(bindings)),
});
```

#### File layout

New files (4):
- `packages/core/src/ports/logger.ts`
- `packages/core/src/ports/logger.test.ts`
- `packages/host/src/logger.ts`
- `packages/host/src/logger.test.ts`

Modified files (4):
- `packages/core/src/index.ts` — add the re-export.
- `packages/host/src/cli.ts` — replace `process.stderr.write` with logger.
- `packages/host/src/dev-harness.ts` — same.
- `packages/host/package.json` — add `pino` dependency.

Note: existing `packages/core/tsconfig.json` globs `src/**/*` — no tsconfig change needed for the `ports/` subdir.

#### Sequence

1. Write `packages/core/src/ports/logger.ts` from §Types verbatim.
2. Add the re-export to `packages/core/src/index.ts`.
3. Write `packages/core/src/ports/logger.test.ts` (type-only smoke; see §Test strategy).
4. Add `"pino": "^X.Y.Z"` (latest stable, caret range) to `packages/host/package.json` `dependencies`. Run `npm install` from repo root.
5. Implement `packages/host/src/logger.ts` per §Functions.
6. Rewrite `packages/host/src/cli.ts`:
   ```ts
   #!/usr/bin/env node
   import { HOST_ID } from "./index.js";
   import { createPinoLogger } from "./logger.js";
   const main = (): void => {
     const logger = createPinoLogger({ bindings: { component: "cli" } });
     logger.info(`${HOST_ID}: placeholder entry. Native messaging wiring lands with the first host ADR.`);
   };
   main();
   ```
7. Rewrite `packages/host/src/dev-harness.ts` similarly (`component: "dev-harness"`, existing message text).
8. Write `packages/host/src/logger.test.ts` — 4 it() blocks per §Test strategy.
9. Run the standard gate: `npm run check` (or build + test + lint + typecheck:tests). Must be green.
10. Run the channel-separation demo (§Verification recipe). Remove the temp `console.log` before commit.
11. Commit `chore(host): structured logger to stderr only (#9)` on branch `feat/9-host-structured-logger`.

#### Error cases

- **Garbage env var value** — fall back to `info` + a `warn` line. Host MUST start.
- **`silent` level** — pino accepts; emissions produce zero bytes. Contract test asserts.
- **Pino constructor throws at init** — invariant violation; let it throw (CLAUDE.md §Error model reserves `throw` for programmer errors).
- **stderr closed (EPIPE on fd=2)** — the one-time `'error'` listener writes a single line via `process.stderr.write` (no-ops on closed fd); subsequent log calls become silent. Host MUST NOT crash.
- **Unserialisable value in bindings** — pino stringifies. Acceptable.
- **Redaction path missed in future code** — future issues that add prompt-adjacent fields MUST extend `REDACT_PATHS` + add a parallel contract-test assertion. Architect + reviewer agents enforce on PR review.

#### Test strategy

##### `packages/core/src/ports/logger.test.ts` — type-only smoke

Port interfaces have no runtime behavior. File exists to pull the port into the test compile graph. Shape:

```ts
import { describe, expect, it } from "vitest";
import type { LogBindings, LogLevel, Logger } from "./logger.js";

describe("Logger port", () => {
  it("is a type-only surface (no runtime export)", () => {
    const noop: Logger = {
      debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
      child: () => noop,
    };
    const bindings: LogBindings = { traceId: "abc" };
    const level: LogLevel = "info";
    noop.info("hello", bindings);
    expect(level).toBe("info");
  });
});
```

No behavioral assertions allowed here. If `core` grows logger logic later (e.g., a `noopLogger` factory), tests live in their own file.

##### `packages/host/src/logger.test.ts` — contract test (4 cases, binding)

1. **Channel separation.** Spy on `process.stdout.write`; construct logger with no destination override; emit `info("hello")`. Assert `stdout.write` NOT called. Use a `Writable` capture stream as `destination` to verify the message arrives.
2. **Redaction.** Emit with `{ diff: "FAKE DIFF BYTES", body: "FAKE BODY", pr: { title: "secret", body: "secret-body" } }`. Assert output contains `[Redacted]` ≥3× and does NOT contain the secret values.
3. **Wildcard redaction.** Emit with `{ payload: { diff: "NESTED DIFF" } }`. Assert `[Redacted]` present, `NESTED DIFF` absent.
4. **Level resolution from env.** Three sub-asserts: `LGTM_BUZZER_LOG_LEVEL=debug` enables debug; empty env defaults to info (debug filtered); `LGTM_BUZZER_LOG_LEVEL=nonsense` produces a warn naming the bad value, no throw.

Pattern: use `node:stream`'s `Writable` for capture; pass via the `destination` option.

##### Existing smoke tests

`packages/host/src/index.test.ts` and `monadyssey.smoke.test.ts` MUST still pass.

##### Verification recipe (manual, one-time)

```bash
npm run check
# Add temporary console.log("LEAK"); to cli.ts. Then:
node packages/host/dist/cli.js >/tmp/stdout.txt 2>/tmp/stderr.txt
grep "LEAK" /tmp/stdout.txt           # MUST match
grep "LEAK" /tmp/stderr.txt           # MUST NOT match
grep "placeholder entry" /tmp/stderr.txt   # MUST match
# Remove the console.log. Re-run `npm run check`.
```

The dev pastes the four grep results into the PR body under `## Verification`.

### Consequences

- **First port file** in `packages/core/src/ports/`. Sets the convention: one port per file, `type` alias, no monadyssey unless the surface genuinely needs `Either`/`IO`.
- **First documented carve-out from idiom #2** (`Logger` returns `void` not `IO<never, void>`). Logger-specific. All other side effects still return `IO<E, A>`.
- **Pino bundle weight negligible** in `host` (Node-side binary). Extension never imports pino (dependency-direction rule prevents it).
- **Redaction list is a living artifact.** Future issues that add prompt-adjacent fields MUST extend `REDACT_PATHS` + add a parallel contract-test assertion.
- **No ESLint rule changes.** Pino isn't on any forbidden list.
- **Security posture improved.** Stdout-safety and redaction now contract-tested.
- **Reversibility.** ~150 LoC across 4 new + 4 modified files. Replacing pino later is a single-adapter swap behind the port.
- **No license burden.** Pino is MIT.
- **PM's open question resolved.** Default level `info`; env-var override `LGTM_BUZZER_LOG_LEVEL`.

---

## ADR-7: Wire-format envelope schema for native-messaging frames (absorbs ping/pong from #8)
**Date**: 2026-05-22
**Issue**: #7 (also absorbs #8)
**Status**: Accepted

### Context

Every native-messaging frame between the MV3 extension and the host crosses an untrusted stdio boundary. Per CLAUDE.md §Functional idioms #7, every such frame must pass through a `zod` schema before reaching domain code, and per the per-package policy `zod` is the only runtime dep `protocol` is allowed to carry.

Why this ADR absorbs #8: a discriminated union with zero variants is structurally degenerate. Defining ping + pong + error in the same ADR makes the envelope contract real, makes the parse helper testable end-to-end, and gives #10/#11/#12 a concrete fixture. #8 collapses to a thin dev-only follow-up.

Resolved open questions:

- **#7 — protocol version slot?** Yes. Numeric major (`v: z.literal(1)`). Wire shape only; host binary SemVer stays in `package.json`.
- **#8 — does ping carry a payload?** Yes, optional caller-chosen `nonce` (non-empty string). Pong echoes it back. Optional so empty-ping liveness probes work, but the slot exists so dev-harness can assert round-trip integrity.

CLAUDE.md per-package policy: `protocol` may import `zod` and nothing else. **No `monadyssey` in protocol.** The parse helper exposes zod's native `SafeParseReturnType` (structurally an Either) rather than `Either<E, A>`. Host wraps it in `IO.ofSync` at the call site.

### Decision

Five new source files plus five test files under `packages/protocol/src/`, and replace the ADR-5 stub in `src/index.ts` with re-exports.

#### Wire-shape choices (binding)

| Choice | Decision | Rationale |
|---|---|---|
| Protocol version | `v: z.literal(1)` (numeric major) | Wire shape only |
| Discriminator | `kind` | Matches idiom #6 conventions elsewhere |
| Correlation id | `correlationId: z.string().min(1).nullable()` | Opaque caller-generated; `null` reserved for unsolicited host events |
| Payload slot | Refined per `kind` via `z.discriminatedUnion("kind", [...])` | Type-safe dispatch |
| Error envelope | Real variant of the union, `kind: "error"` | Same shape as every other frame |
| Validation helper | `parseFrame(raw): z.SafeParseReturnType<Frame, Frame>` | Lives in `protocol`; no monadyssey leak |

#### Affected workspaces

Only `packages/protocol`. Dependency-direction unchanged. `protocol`'s only runtime dep remains `zod`.

#### Types

All types inferred via `z.infer<typeof Schema>` and exported alongside schemas.

**`packages/protocol/src/envelope.ts`**:

```ts
import { z } from "zod";
import { PingFrameSchema } from "./messages/ping.js";
import { PongFrameSchema } from "./messages/pong.js";
import { ErrorFrameSchema } from "./messages/error.js";

export const PROTOCOL_VERSION = 1 as const;

export const EnvelopeBase = {
  v: z.literal(PROTOCOL_VERSION),
  correlationId: z.string().min(1).nullable(),
} as const;

export const FrameSchema = z.discriminatedUnion("kind", [
  PingFrameSchema,
  PongFrameSchema,
  ErrorFrameSchema,
]);

export type Frame = z.infer<typeof FrameSchema>;
export type FrameKind = Frame["kind"];
```

**`packages/protocol/src/messages/ping.ts`**:

```ts
import { z } from "zod";
import { EnvelopeBase } from "../envelope.js";

export const PingPayloadSchema = z.object({
  nonce: z.string().min(1).optional(),
});

export type PingPayload = z.infer<typeof PingPayloadSchema>;

export const PingFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("ping"),
  payload: PingPayloadSchema,
});

export type PingFrame = z.infer<typeof PingFrameSchema>;
```

**`packages/protocol/src/messages/pong.ts`**: mirrors ping (nonce optional, non-empty when present, echoes the ping's nonce semantically).

**`packages/protocol/src/messages/error.ts`**:

```ts
import { z } from "zod";
import { EnvelopeBase } from "../envelope.js";

export const ErrorReasonSchema = z.enum([
  "schema-violation",
  "unknown-message",
  "version-mismatch",
  "internal",
]);

export type ErrorReason = z.infer<typeof ErrorReasonSchema>;

export const ErrorPayloadSchema = z.object({
  reason: ErrorReasonSchema,
  message: z.string().min(1),
  details: z.unknown().optional(),
});

export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;

export const ErrorFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("error"),
  payload: ErrorPayloadSchema,
});

export type ErrorFrame = z.infer<typeof ErrorFrameSchema>;
```

**Critical**: `ErrorPayload.message` and `ErrorPayload.details` must NEVER carry diff content (CLAUDE.md §Key differentiator). Host adapter enforces redaction; the schema documents the contract via TSDoc.

#### Functions and methods

**`packages/protocol/src/parse.ts`**:

```ts
import { z } from "zod";
import { FrameSchema, type Frame } from "./envelope.js";

export const parseFrame = (
  raw: unknown,
): z.SafeParseReturnType<Frame, Frame> => FrameSchema.safeParse(raw);
```

`parseFrame` is synchronous and pure. Returns zod's native `{ success: true; data } | { success: false; error: ZodError }` result type. Host wraps in `IO.ofSync` at the call site (issue #10).

#### File layout

**Modified**: `packages/protocol/src/index.ts` (replace ADR-5 stub with re-exports).

**New source**: `envelope.ts`, `messages/ping.ts`, `messages/pong.ts`, `messages/error.ts`, `parse.ts`.

**New tests**: `envelope.test.ts`, `messages/ping.test.ts`, `messages/pong.test.ts`, `messages/error.test.ts`, `parse.test.ts`.

**`packages/protocol/src/index.ts`** re-exports:

```ts
export {
  PROTOCOL_VERSION,
  FrameSchema,
  type Frame,
  type FrameKind,
} from "./envelope.js";

export {
  PingPayloadSchema,
  PingFrameSchema,
  type PingPayload,
  type PingFrame,
} from "./messages/ping.js";

export {
  PongPayloadSchema,
  PongFrameSchema,
  type PongPayload,
  type PongFrame,
} from "./messages/pong.js";

export {
  ErrorReasonSchema,
  ErrorPayloadSchema,
  ErrorFrameSchema,
  type ErrorReason,
  type ErrorPayload,
  type ErrorFrame,
} from "./messages/error.js";

export { parseFrame } from "./parse.js";
```

`EnvelopeBase` is NOT re-exported (composition helper internal to protocol).

#### Sequence

1. Create `packages/protocol/src/envelope.ts`.
2. Create `packages/protocol/src/messages/ping.ts`, `pong.ts`, `error.ts`.
3. Create `packages/protocol/src/parse.ts`.
4. Replace `packages/protocol/src/index.ts` with the re-export block.
5. Create five `*.test.ts` files.
6. `npm run check` — all four gate commands green.
7. Commit on branch `feat/7-envelope-schema`. Title: `feat(protocol): wire-format envelope, ping/pong, and error frames (#7, absorbs #8)`.

#### Error cases

| Failure | Where caught | How surfaced on the wire |
|---|---|---|
| `v` is not `1` | `parseFrame` literal mismatch | Host writes `ErrorFrame` with `reason: "version-mismatch"` |
| Unknown `kind` | `parseFrame` discriminator rejects | `reason: "unknown-message"` |
| Payload fails schema | `parseFrame` nested rejection | `reason: "schema-violation"` |
| `correlationId` empty/missing | `parseFrame` rejects | `reason: "schema-violation"` |
| `correlationId: null` on a request | Parses fine; dispatcher business | n/a at parse time |
| Dispatcher throws | Host concern | `reason: "internal"` + redacted message |
| `JSON.parse` throws upstream | Parser concern | `reason: "schema-violation"` |

`parseFrame` itself never throws. zod's `safeParse` is total over `unknown`.

#### Test strategy

`envelope.test.ts` (10 cases): well-formed ping/pong/error parses; missing/wrong `v`; missing/unknown `kind`; missing/null/empty `correlationId`.

`messages/ping.test.ts` (4): nonce present, omitted, empty (fails), wrong type (fails).

`messages/pong.test.ts`: mirrors ping.

`messages/error.test.ts` (5): every reason enum value; unknown reason fails; empty message fails; details optional; details unknown shape parses.

`parse.test.ts`: happy path for each variant with TS narrowing; garbage input (`"hello"`, `null`, `42`, `[]`) returns `{ success: false }` without throwing; instanceof ZodError check.

**Coverage target**: 90% on `protocol`.

### Consequences

- `protocol` has a real public surface: 9 schema constants and 10 inferred TS types. ADR-5's stub is gone; M1 issues #10/#11 consume `FrameSchema` and `parseFrame` directly.
- **#8 collapses to a thin dev-only follow-up.** Architect routing on #8 is just "READY_FOR_DEV, see ADR-7".
- **Forward compatibility**: bumping `PROTOCOL_VERSION` from `1` to `2` is a deliberate wire break. If later releases need rolling upgrades, the union can accept multiple version literals. Out of scope for v1.
- **No `monadyssey` leak.** `parseFrame` returning zod's native result type is the deliberate workaround.
- **No new runtime dependencies.** License diff: none.
- **Security posture**: improves. Every byte from stdin will (post-#10) pass through `parseFrame`. Error envelope provides structured failure response without crashing.
- **Key-differentiator posture**: schemas don't carry PR text. `ErrorPayload.message`/`details` flagged as redaction-required in TSDoc.
- **Reversibility**: high. Single workspace, no consumers yet, no data persisted.

---

## ADR-8: Length-prefixed native-messaging stdio framing in `host` (reader + writer, absorbs #11)
**Date**: 2026-05-22
**Issue**: #10 (also absorbs #11)
**Status**: Accepted

### Context

The host and the MV3 extension communicate over Chrome's native messaging stdio channel. Every message is a JSON payload preceded by a 4-byte little-endian uint32 declaring the payload's byte length. Chrome enforces a 1 MB cap per frame. Direction: extension → host on stdin, host → extension on stdout. EOF on stdin = extension disconnected.

ADR-6 §Constraint 1 declared stdout sacred (every byte must be a frame, no log leaks). ADR-7 produced `FrameSchema` + `parseFrame` in protocol. ADR-8 is the codec layer that turns stdin bytes into validated `Frame` values and `Frame` values back into framed stdout bytes.

**Why absorb #11**: reader and writer are codec halves of the same wire format. Endianness, 1 MB cap, JSON↔bytes boundary, DecodeError/WriteError split — single source of truth.

Open PM questions resolved here:
- Reader API: `AsyncIterable<Either<DecodeError, Frame>>` wrapped in `IO<never, ...>`.
- Termination per error variant: see Decision 8.
- Back-pressure: YAGNI for v1.
- Logger integration: yes, injected. `warn` for recoverable decode errors, `error` for stream-fatal + premature-eof.
- Endianness: uint32 **little-endian** (Chrome spec).

### Decision

Add a `framing/` submodule to `packages/host/src/` containing a reader factory, a writer factory, and a shared errors module. Stream and logger injected via deps (testable against `PassThrough`).

#### Decision 1 — Reader API

`createFrameReader(deps): IO<never, AsyncIterable<Either<DecodeError, Frame>>>`. Caller does `for await (const result of frames) result.fold(...)`. Outer IO carries stream attachment; per-element Either carries decode result.

#### Decision 2 — Writer API

`createFrameWriter(deps): (frame: Frame) => IO<WriteError, void>`. Per-call IO, no queue, no auto-reply.

#### Decision 3 — Module layout

`packages/host/src/framing/`:
- `errors.ts` — `DecodeError`, `WriteError`, `MAX_FRAME_BYTES`, `HEADER_BYTES`.
- `reader.ts` — `createFrameReader`.
- `writer.ts` — `createFrameWriter`.
- `index.ts` — barrel re-export.
Plus two test files.

#### Decision 4 — Logger integration

Reader factory takes a `Logger`. Levels:

| Event | Level |
|---|---|
| `length-overflow` | `error` |
| `invalid-json` | `warn` |
| `schema-violation` | `warn` |
| `stream-error` | `error` |
| `premature-eof` | `error` |

Writer factory takes a `Logger`. Levels:

| Event | Level |
|---|---|
| `size-overflow` | `error` |
| `stream-closed` | `warn` |
| `stream-error` | `error` |

**Framing-layer code MUST NOT include payload bytes in log bindings.** Pass `{ kind, correlationId }` only. ADR-6 §Constraint 4 redaction list is the backstop.

#### Decision 5 — No auto-reply from the reader

Reader yields `Left<DecodeError>` but does NOT call the writer. Dispatcher (future issue) wires `reader.fold(decodeError → writer(toErrorFrame(...)), frame → handle(frame))`.

#### Decision 6 — Cancellation

Reader's internal pump uses `IO.cancellable` with an `AbortSignal`. On abort: remove `data`/`end`/`error` listeners from source, resolve iterator end-sentinel cleanly. **Do NOT call `source.destroy()`** — source is host's own stdin which the runtime owns. Writer: in-flight `write()` resolves naturally; subsequent calls after cancellation return `IO.fail<WriteError>({ kind: "stream-closed" })`.

#### Decision 7 — Back-pressure (YAGNI for v1)

Pump runs in flow mode. Worst case: ~1 MB in-flight + one decoded `Frame`. Revisit if concurrent dispatch lands OR production shows sustained 1 MB-frame bursts.

#### Decision 8 — Validation order and termination policy

Per frame:
1. Read 4 bytes. EOF mid-header with ≥1 byte consumed → `premature-eof`, end iterator. Clean EOF with 0 bytes → iterator ends, no error yielded.
2. Decode LE uint32 → declared length `n`.
3. If `n > 1_048_576` → `length-overflow`, **end iterator** (wire desynced).
4. Read exactly `n` bytes. EOF mid-payload → `premature-eof`, end.
5. UTF-8 decode + `JSON.parse`. Throws → `invalid-json`, **continue** (frame boundary preserved).
6. `parseFrame(parsed)`. Fails → `schema-violation`, **continue**. Succeeds → yield `Right(Frame)`.
7. Loop.

Stream `'error'` at any point → `stream-error`, **end iterator**.

Termination summary:
| Variant | Continue? |
|---|---|
| `length-overflow` | no |
| `invalid-json` | yes |
| `schema-violation` | yes |
| `stream-error` | no |
| `premature-eof` | no |

#### Decision 9 — Writer header endianness

uint32 **little-endian** (`Buffer.writeUInt32LE(n, 0)`). The 1 MB cap enforced **before** any bytes touch the sink. Header + payload written in a single `sink.write(combined)` call.

#### Decision 10 — Error variants

The five DecodeError + three WriteError variants from PM scope are sufficient. No additions.

### Affected workspaces

`packages/host` only. New imports: `node:stream`. Existing imports used: `@lgtm-buzzer/protocol` (FrameSchema, Frame, parseFrame), `@lgtm-buzzer/core` (Logger), `monadyssey` (IO, Either, Left, Right).

### Types

`packages/host/src/framing/errors.ts`:

```ts
import type { z } from "zod";

export type DecodeError =
  | { readonly kind: "length-overflow"; readonly declared: number }
  | { readonly kind: "invalid-json"; readonly reason: string }
  | { readonly kind: "schema-violation"; readonly issues: readonly z.ZodIssue[] }
  | { readonly kind: "stream-error"; readonly reason: string }
  | { readonly kind: "premature-eof" };

export type WriteError =
  | { readonly kind: "stream-closed" }
  | { readonly kind: "stream-error"; readonly reason: string }
  | { readonly kind: "size-overflow"; readonly bytes: number };

export const MAX_FRAME_BYTES = 1_048_576 as const;
export const HEADER_BYTES = 4 as const;
```

`packages/host/src/framing/reader.ts`:

```ts
export type FrameReaderDeps = { readonly source: Readable; readonly logger: Logger };
export type FrameReader = AsyncIterable<Either<DecodeError, Frame>>;
export const createFrameReader = (deps: FrameReaderDeps): IO<never, FrameReader>;
```

`packages/host/src/framing/writer.ts`:

```ts
export type FrameWriterDeps = { readonly sink: Writable; readonly logger: Logger };
export type FrameWriter = (frame: Frame) => IO<WriteError, void>;
export const createFrameWriter = (deps: FrameWriterDeps): FrameWriter;
```

Note: `createFrameWriter` returns the `FrameWriter` function **synchronously** (not wrapped in IO). Factory construction has no side effects beyond capturing dep refs.

### Functions

**`readExactly(source, n, signal)`** (internal in reader.ts): pulls exactly `n` bytes from source. Returns `Buffer | "eof" | { error: string } | "cancelled"`.

**`decodeOneFrame(source, signal)`** (internal): runs steps 1–6 from Decision 8.

**`encodeFrame(frame)`** (internal in writer.ts): `JSON.stringify` → length check → 4-byte LE header → `Buffer.concat([header, payload])`. Returns `{ ok: true; bytes } | { ok: false; error: WriteError }`.

**Writer returned closure** maps Node's write callback errors:
- `EPIPE` / `ERR_STREAM_DESTROYED` / `ERR_STREAM_WRITE_AFTER_END` → `stream-closed`.
- Other errors → `stream-error`.

### File layout

New files (6): `errors.ts`, `reader.ts`, `reader.test.ts`, `writer.ts`, `writer.test.ts`, `index.ts` — all under `packages/host/src/framing/`. Modified files: none. The dispatcher that wires reader + writer into `cli.ts` is a follow-up issue.

### Sequence

1. Create `framing/errors.ts`.
2. Create `framing/writer.ts` (simpler half — no streaming state machine).
3. Create `framing/writer.test.ts` (5 cases per Test strategy).
4. `npm test -- writer` — must be green.
5. Create `framing/reader.ts` — `readExactly` first, then `decodeOneFrame`, then the iterator wrapper.
6. Create `framing/reader.test.ts` (12 cases per Test strategy).
7. Create `framing/index.ts` barrel.
8. `npm run check` — all four stages green.
9. Commit on branch `feat/10-host-stdio-framing`. Title: `feat(host): length-prefixed native-messaging stdio framing (#10, absorbs #11)`.

**The dev does NOT wire reader/writer into cli.ts or dev-harness.ts.** That is dispatcher work in a follow-up issue. ADR-8 ships pure codec.

### Error cases

Reader-side (full table in Decision 8). Stream cleanly ended between frames → iterator ends, no Left yielded, NOT logged as error (clean disconnect is the normal exit path).

Writer-side:

| Variant | Returned | Logger level |
|---|---|---|
| Payload > 1 MB | `IO.fail<WriteError>({ kind: "size-overflow", bytes })` | `error` |
| EPIPE / stream destroyed / write-after-end | `IO.fail<WriteError>({ kind: "stream-closed" })` | `warn` |
| Other write error | `IO.fail<WriteError>({ kind: "stream-error", reason })` | `error` |

`throw` reserved for invariant violations only.

### Test strategy

`writer.test.ts` (5 binding cases):
1. Happy path — pong frame, raw-bytes assertion (LE header + JSON.parse round trip).
2. Size overflow → IO failed, zero bytes written.
3. Stream closed (sink.end() pre-call) → `stream-closed`.
4. Stream error (custom Writable with non-EPIPE error) → `stream-error`.
5. Logger calls per error case, bindings never contain payload data.

`reader.test.ts` (12 binding cases):
1. Happy path — single ping frame.
2. Two valid frames back-to-back.
3. Length overflow (declared 2_000_000) → end iterator, logger.error once.
4. Invalid JSON then valid frame → continue past, logger.warn once.
5. Schema violation then valid frame → continue past, logger.warn once.
6. Premature EOF in header.
7. Premature EOF in payload.
8. Clean EOF between frames → iterator completes, no error, no logger.error.
9. Stream error → end iterator.
10. Cancellation mid-flight → clean resolve, `source.listenerCount("data") === 0`, source NOT destroyed.
11. Logger payload safety — a `SECRET_DIFF_BYTES` string in a schema-violation payload must NOT appear in any logger bindings.
12. Round-trip property — 8 hand-crafted Frame fixtures (ping with/without nonce, pong with/without nonce, 4 error variants) survive writer → PassThrough → reader unchanged.

Vitest harness uses `PassThrough` from `node:stream`. No mocking framework. Inject fake `Logger` (object with `info`/`warn`/`error` capturing arrays + `child` returning self).

Coverage target: branch coverage of every `DecodeError` and `WriteError` variant.

### Consequences

- ~250 LoC across 6 new files. No new dependencies.
- **Reader does not auto-reply** — dispatcher responsibility, hard constraint (Decision 5).
- **Back-pressure is YAGNI for v1** (Decision 7). Triggers for revisiting: concurrent dispatch, sustained 1 MB-frame bursts.
- **Cancellation is intentionally minimal** (Decision 6) — host owns its own fds; OS reclaims them.
- **`length-overflow`, `stream-error`, `premature-eof` end the iterator.** `invalid-json`, `schema-violation` are recoverable.
- **Endianness documented inline** so a future contributor can't silently break wire compatibility.
- **The writer's `IO` boundary is the only `Promise → IO` site in framing** (idiom #2 reaffirmed).
- **Security posture**: every byte from stdin passes through `parseFrame` (ADR-7) before any domain code sees it. The framing layer is the boundary CLAUDE.md §Functional idioms #7 requires.
- **Reversibility**: high. Single workspace, no external consumers yet, no persisted data.
- **#11 absorbed** — dev lands both #10 and #11 in a single PR.

---

## ADR-9: `spawnIO` helper in a new `adapter-shared` workspace, with bounded SIGTERM→SIGKILL cancellation
**Date**: 2026-05-22
**Issue**: #32
**Status**: Accepted

### Context

CLAUDE.md §"spawnIO contract" already specifies the binding signature, semantics, and three-variant error model for the helper that every LLM-CLI adapter (#36, #45, #46) composes on top of. Idiom #4 narrows the implementation choice: only the file defining `spawnIO` may import `execa` or `node:child_process`. M2 cannot land an LLM adapter without this primitive — get cancellation wrong and a forgotten child process holding an LLM connection is a release-blocker bug.

Six open questions the contract doesn't pre-decide:

1. **Where the helper lives** — single CLI adapter can't own it (sibling-import inversion).
2. **`execa` vs `node:child_process.spawn`** — both allowed by idiom #4.
3. **How cancellation flows through monadyssey** — `IO.cancellable` exists; we need cancellation reified into `SpawnError`, not surfaced as `Cancelled`.
4. **SIGTERM→grace→SIGKILL choreography** — including double-kill avoidance.
5. **`spawn-failed` vs `process-failed` distinction** — different Node events.
6. **Args mutability defense in depth** — TS `readonly` blocks compile-time only.

### Decision

#### Decision 1 — New `packages/adapters/_shared/` workspace

Create `@lgtm-buzzer/adapter-shared` as a sibling of `claude-cli`, `codex-cli`, etc. Exports `spawnIO` + types.

Why not inside `claude-cli`: inverts the "siblings independent" reading.
Why not under `core`: core forbidden from monadyssey IO + `node:*`.
Why a sibling not a parent: the existing `packages/adapters/*` workspaces glob + ESLint scope pick it up with zero config edits.
Naming: leading underscore (`_shared`) signals "internal primitive, not an adapter."

Dep direction reaffirmed: `protocol ← core ← adapter-shared ← {claude-cli, codex-cli, copilot-cli, github, ado} ← host`. The "one dep set per adapter — no sibling pollution" rule reads as "no leaking CLI-specific deps into siblings," not "every CLI adapter must reimplement spawnIO."

#### Decision 2 — `node:child_process.spawn` (not execa)

Zero unique value for v1's three Unix-targeted LLM CLIs:
- Never need shell expansion (idiom #5 of the contract: `shell: false` always).
- The careful SIGTERM→grace→SIGKILL choreography we want is *more* precise than execa's default "kill on cancel".
- One fewer transitive dep.
- Windows out of scope for v1 (Chrome-first, locked decision).

`adapter-shared` declares only `monadyssey@2.0.1`.

#### Decision 3 — `IO.cancellable` + sentinel-tagged-throw bridge

```ts
const THROWN_SENTINEL = Symbol.for("@lgtm-buzzer/adapter-shared/spawn-thrown");

type ThrownSpawnError = { readonly [THROWN_SENTINEL]: true; readonly error: SpawnError };

export const spawnIO = (
  command: string,
  args: readonly string[],
  stdin?: string,
  options?: { readonly graceMs?: number },
): IO<SpawnError, SpawnOutput> =>
  IO.cancellable<SpawnError, SpawnOutput>(
    (signal) => runChildProcess(command, [...args], stdin, options?.graceMs ?? 5000, signal),
    liftSpawnError,
  );
```

The inner promise rejects with `ThrownSpawnError(SpawnError{...})`; `liftSpawnError` unwraps. Cancellation is reified into `SpawnError.cancelled` — callers never see a runtime `Cancelled` outcome from this helper.

#### Decision 4 — SIGTERM→grace→SIGKILL choreography

- On abort: `child.kill("SIGTERM")`, `setTimeout(graceMs, () => child.kill("SIGKILL"))`.
- On natural exit: `clearTimeout(killTimer)` to avoid double-kill on PID reuse.
- `onAbort` is `{ once: true }`; removed on exit.
- `signal.aborted` check precedes `code` check (cancellation invariant beats lucky-completion).
- Default `graceMs = 5000`. Negative/non-finite values fall back to 5000.
- `shell: false` hardcoded; no `options.shell` exposed.

#### Decision 5 — `spawn-failed` vs `process-failed`

| Node event | Surfaces as |
|---|---|
| `'error'` (`ENOENT`/`EACCES`/`EPERM`) | `{ kind: "spawn-failed", reason: "${code}: ${msg}" }` |
| `'exit'` with code !== 0 (not aborted) | `{ kind: "process-failed", exitCode, stderr }` |
| `signal.aborted` set | `{ kind: "cancelled", signal: "SIGTERM" \| "SIGKILL" }` |

`spawn-failed` = configuration error; `process-failed` = retry/input fix.

#### Decision 6 — Defensive args copy

`readonly string[]` at the type level; internal `[...args]` immediately before spawn defends against type-stripped callers mutating after construction.

### Affected workspaces

`packages/adapters/_shared/` (new). Root config edits: `tsconfig.json` (references), `vitest.config.ts` (alias), `scripts/typecheck-tests.mjs` (test project).

No edits to `core`, `protocol`, `host`, `extension`, or existing adapters. ESLint's existing `packages/adapters/**/*.ts` scope covers the new workspace.

### Types

`packages/adapters/_shared/src/errors.ts`:

```ts
export type SpawnError =
  | { readonly kind: "spawn-failed"; readonly reason: string }
  | { readonly kind: "process-failed"; readonly exitCode: number; readonly stderr: string }
  | { readonly kind: "cancelled"; readonly signal: "SIGTERM" | "SIGKILL" };

export type SpawnOutput = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};
```

`packages/adapters/_shared/src/spawn-io.ts`:

```ts
export type SpawnOptions = {
  readonly graceMs?: number;  // default 5000; non-finite/negative → 5000
};

export declare const spawnIO: (
  command: string,
  args: readonly string[],
  stdin?: string,
  options?: SpawnOptions,
) => IO<SpawnError, SpawnOutput>;
```

`packages/adapters/_shared/src/index.ts` (barrel):

```ts
export { spawnIO } from "./spawn-io.js";
export type { SpawnError, SpawnOutput, SpawnOptions } from "./spawn-io.js";
```

### File layout

New files (all in `packages/adapters/_shared/`):

```
package.json          # name: @lgtm-buzzer/adapter-shared, dep: monadyssey@2.0.1 (exact)
tsconfig.json         # extends ../../../tsconfig.base.json, types: ["node"]
tsconfig.test.json    # noEmit test type-check
src/index.ts          # barrel
src/errors.ts         # SpawnError, SpawnOutput
src/spawn-io.ts       # spawnIO + internal helpers (only file importing node:child_process)
src/spawn-io.test.ts  # 8 binding test cases
```

Modified files (root):

```
tsconfig.json         # +1 reference entry
vitest.config.ts      # +1 alias entry (@lgtm-buzzer/adapter-shared)
scripts/typecheck-tests.mjs  # +1 TEST_PROJECTS entry
```

### Sequence

Per-call sequence:

1. Construction returns `IO<SpawnError, SpawnOutput>` (no subprocess yet).
2. On `IO.cancellable` invocation, spawn the child with `shell: false`, `stdio: ["pipe", "pipe", "pipe"]`.
3. Attach `signal.addEventListener("abort", onAbort, { once: true })`, stdout/stderr `'data'` collectors, `child.once("error", ...)`, `child.once("exit", ...)`.
4. If `stdin` provided: `child.stdin.write(stdin); child.stdin.end()`. Otherwise: `child.stdin.end()` (EOF immediately).
5a. Natural exit code 0 → resolve `{ stdout, stderr, exitCode: 0 }`.
5b. Natural exit code !== 0 → reject `thrown(process-failed)`.
5c. `error` event → reject `thrown(spawn-failed)`.
5d. Cancellation, child cooperates → SIGTERM fires, exit follows within grace, reject `thrown(cancelled SIGTERM)`.
5e. Cancellation, child ignores SIGTERM → grace elapses, SIGKILL fires, exit follows, reject `thrown(cancelled SIGKILL)`.
6. `liftSpawnError` unwraps sentinel into IO's `Err` channel.

### Error cases

All five rows in Decision 5 + a fallback `{ kind: "spawn-failed", reason: "unexpected: ..." }` for the (should-not-happen) untagged-throw path.

`throw` is never used in control flow. Every failure rejects an internal Promise with sentinel-tagged `SpawnError`.

### Test strategy

Eight binding `it()` blocks in `src/spawn-io.test.ts`, using `process.execPath` for portability:

1. Happy path stdout: `["-e", "process.stdout.write('hello')"]` → `Ok { stdout: "hello", exitCode: 0 }`.
2. Non-zero exit: `["-e", "process.exit(7)"]` → `Err process-failed { exitCode: 7 }`.
3. stderr capture: `["-e", "process.stderr.write('nope'); process.exit(1)"]` → `Err process-failed { exitCode: 1, stderr: "nope" }`.
4. Spawn failure: `"definitely-not-a-real-command-..."` → `Err spawn-failed` with `reason` containing `"ENOENT"`.
5. Cancellation, cooperative: `["-e", "setInterval(()=>{},1e9)"]`, cancel immediately → `Err cancelled SIGTERM`; PID gone via `process.kill(pid, 0)` ESRCH.
6. Cancellation, stubborn child: `["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1e9)"]` with `graceMs: 100` → `Err cancelled SIGKILL` within ~500ms; PID gone.
7. Stdin single-shot: `spawnIO("cat", [], "hello\n")` → stdout `"hello\n"`. (POSIX cat; macOS+Linux only per locked decision.)
8. No stdin → child sees EOF on first read.

Optional ninth (recommended): defensive-copy test — mutate args after construction, assert subprocess saw original values.

Total suite budget: under 5s. Per-test budget: 500ms (1000ms for test #6).

Coverage target: every `SpawnError` variant has at least one forcing test.

### Consequences

- One new workspace (~150 LoC impl + ~200 LoC tests). No `execa`. Only `monadyssey@2.0.1` runtime dep.
- Cancellation correctness is type-enforced: IO interpreter never sees `Cancelled` from this helper; reified into `SpawnError`.
- Dep direction reads cleanly: every CLI adapter has one upstream sibling (`adapter-shared`); no CLI-to-CLI imports.
- Future-extensibility deferred: no streaming stdout, no multi-write stdin, no `cwd`/`env` options. `SpawnOptions` shape allows adding them without breaking the signature.
- Security: this primitive doesn't touch PR text; the diff-only invariant is enforced at each LLM adapter (one layer up).
- Reversibility: high. If `IO.cancellable` semantics change or we want `execa` (Windows), only `spawn-io.ts` changes — public types, tests, callers stay identical.
- Binding for #36/#45/#46: every LLM-CLI adapter delegates ALL subprocess lifecycle here. If cancellation is wrong, all three adapters are wrong. The 8 tests above ARE the contract.

---

## ADR-10: Clarify ADR-9 cancellation outcome — monadyssey v2.0.1 yields `Cancelled`, not `Err<SpawnError.cancelled>`
**Date**: 2026-05-22
**Issue**: #62
**Status**: Accepted (amends ADR-9 by addition)

### Context

ADR-9 §Decision 3 stated: "the IO interpreter never sees a `Cancelled` runtime outcome from this helper — cancellation is reified into `SpawnError`'s `cancelled` variant." This was wrong at `monadyssey@2.0.1`.

Verified during PR #61's review:

- `monadyssey/dist/monadyssey.d.ts` types `Fiber<E, A>.join()` as `Promise<Ok<A> | Err<E> | Cancelled>`.
- The runtime interpreter's abort-check loop fires AFTER the `Lift` case settles, discarding the typed `Err<SpawnError{kind:"cancelled"}>` that `liftSpawnError` correctly builds. The result observable to callers is `{ type: "Cancelled" }` — a separate Fiber.join outcome — not the typed Err.

The PID-kill choreography from ADR-9 §Decision 4 is unaffected: SIGTERM, grace, SIGKILL all still fire correctly. Children are demonstrably killed (PR #61 tests #5 and #6 probe `process.kill(pid, 0)` for ESRCH after the join resolves).

### Decision

**Document the actual runtime behavior so future architects designing on top of `spawnIO` write correct switch/fold cases.**

At `monadyssey@2.0.1`, `spawnIO`'s `IO<SpawnError, SpawnOutput>` resolves as follows when interpreted via `fiber.join()`:

| Outcome | Fiber.join() result |
|---|---|
| Process exited code 0 | `Ok<SpawnOutput>` |
| Process exited code != 0 | `Err<SpawnError{kind:"process-failed", ...}>` |
| OS could not start process | `Err<SpawnError{kind:"spawn-failed", ...}>` |
| Surrounding IO cancelled | `Cancelled` (NOT `Err<SpawnError{kind:"cancelled"}>`) |

Callers MUST handle all three outcomes (`Ok`, `Err`, `Cancelled`), not just the two from `Either`. The `.fold` and pattern-matching idioms (#6) need a third branch for the `Cancelled` case.

**The `SpawnError.cancelled` variant remains defined.** Two reasons:

1. **Forward compatibility.** A future monadyssey version may fix the interpreter to surface the typed `Err`. When that happens, callers will already handle `cancelled` via their `Err<SpawnError>` branch with no code change required.
2. **Documentation.** The variant tells future architects what the conceptual contract is (cancellation IS a typed failure shape), even if the runtime currently bypasses it.

### Affected workspaces

`decisions.md` only.

### Sequence

None — documentation amendment.

### Test strategy

Verification of the actual v2.0.1 behavior is already present in `packages/adapters/_shared/src/spawn-io.test.ts` tests #5 and #6: both assert `joined.type === "Cancelled"` after cancellation, and probe `process.kill(pid, 0)` for ESRCH. These tests are the canonical reference for what spawnIO callers can expect at v2.0.1.

### Consequences

- **Downstream architects (#36 / #45 / #46 / #59)** designing LLM-CLI adapters MUST handle `Cancelled` as a separate `fiber.join()` outcome, not assume it'll arrive as `Err<SpawnError.cancelled>`.
- **No code change required** in `spawn-io.ts` — the implementation is correct; only ADR-9's Decision 3 wording was wrong.
- **If monadyssey ever fixes this upstream**, callers that already handle `Cancelled` separately remain correct; callers that also (defensively) match on `Err<SpawnError.cancelled>` start receiving real values there. Both shapes are forward-compatible.
- **No security impact.** The PID-kill safety contract is unaffected.
- **No reversibility concerns.** This is documentation only.

---

## ADR-11: `LLMProvider` port + Quiz domain types in `core` (with type-only `IO` allowed in `core/src/ports/`)
**Date**: 2026-05-22
**Issue**: #33
**Status**: Accepted (amends ADR-4 §Blocklist by addition)

### Context

M2's first vertical slice needs a stable, side-effect-free interface binding every LLM adapter (#36, #45, #46, #59) to a single contract. ADR-9's `spawnIO` gives CLI adapters `IO<SpawnError, SpawnOutput>`; this ADR sits one layer up.

Three constraints collide:
1. Port lives with the domain (hexagonal, CLAUDE.md §Architecture principles).
2. Side effects return `IO<E, A>` (idiom #2).
3. `IO`/`Schedule` forbidden in `core` (ADR-4).

Four resolutions considered: (a) erase IO from port (loses type safety), (b) move to protocol (protocol bans monadyssey too), (c) allow type-only IO in `core/src/ports/**`, (d) port returns `Promise<Either<...>>` (round-trips through everything).

**Decision: (c).** Ports describe effectful shapes; the project's effect type is `IO`. `import type { IO }` is zero-runtime — ADR-4's actual intent (no IO runtime usage in domain logic) is preserved. Narrow the ESLint rule via a `packages/core/src/ports/**` override that adds `allowTypeImports: true` on the `IO` entry while keeping every other ban intact.

### Decision

#### 1. `LLMProvider` port surface

```ts
// packages/core/src/ports/llm-provider.ts
import type { IO } from "monadyssey";
import type { Quiz } from "../quiz/quiz.js";
import type { LLMProviderError } from "../quiz/errors.js";

/** Unified-diff payload. Placeholder until #34 (VCSProvider). */
export type Diff = string;

/**
 * Diff-only invariant (binding per CLAUDE.md §Key differentiator).
 * Exactly two fields. No slot for PR description, title, commits,
 * labels, comments. Reviewer rejects any change that adds one.
 */
export type GenerateQuizInput = {
  readonly diff: Diff;
  readonly questionCount: number;
};

export type LLMProvider = {
  readonly id: string;
  readonly generateQuiz: (input: GenerateQuizInput) => IO<LLMProviderError, Quiz>;
};
```

#### 2. Quiz domain types

```ts
// packages/core/src/quiz/quiz.ts
import type { NonEmptyList } from "monadyssey";

export type QuestionId = string & { readonly __brand: "QuestionId" };
export type ChoiceId = string & { readonly __brand: "ChoiceId" };
export type QuizId = string & { readonly __brand: "QuizId" };

export type Choice = { readonly id: ChoiceId; readonly label: string };

export type MultipleChoiceQuestion = {
  readonly type: "multiple-choice";
  readonly id: QuestionId;
  readonly prompt: string;
  readonly choices: NonEmptyList<Choice>;
  readonly correctChoiceId: ChoiceId;
  readonly explanation?: string;
};

export type Question = MultipleChoiceQuestion;
export type Quiz = { readonly id: QuizId; readonly questions: NonEmptyList<Question> };
```

Multiple-choice only for v1: exact-match scoring, no LLM-graded disputes, deterministic UX. `type: "multiple-choice"` discriminant reserves space for future free-text variant. The Quiz does NOT carry the diff — privacy + prevents round-trip vectors.

Branded IDs prevent crossing tokens; `NonEmptyList` makes empty quizzes / empty choice lists unrepresentable.

#### 3. `GenerateQuizInput` minimal v1 shape

`{ diff, questionCount }`. No `model`, `temperature`, `language` — those are adapter-internal factory config, not per-call inputs. `QuizPolicy` (richer policy from #38) may additively expand this; required-field additions need a new ADR.

#### 4. `LLMProviderError` (5 variants)

```ts
// packages/core/src/quiz/errors.ts
export type LLMProviderError =
  | { readonly kind: "subprocess"; readonly reason: "spawn-failed" | "process-failed";
      readonly exitCode?: number; readonly stderr?: string; readonly detail: string }
  | { readonly kind: "transport"; readonly status?: number; readonly detail: string }
  | { readonly kind: "malformed-response"; readonly detail: string; readonly raw?: string }
  | { readonly kind: "timeout"; readonly afterMs: number }
  | { readonly kind: "cancelled" };
```

Source-mapping (binding for every adapter):

| Underlying | Maps to |
|---|---|
| `SpawnError.spawn-failed` | `subprocess { reason: "spawn-failed" }` |
| `SpawnError.process-failed` | `subprocess { reason: "process-failed", exitCode, stderr }` |
| `SpawnError.cancelled` (unreachable at monadyssey@2.0.1 per ADR-10) | `cancelled` (kept for forward-compat) |
| HTTP non-2xx | `transport { status, detail }` |
| HTTP network/TLS failure | `transport { detail }` (no status) |
| Subprocess stdout / HTTP body fails zod parse | `malformed-response { detail, raw? }` |
| Adapter wall-clock budget exceeded | `timeout { afterMs }` |
| Fiber cancelled by caller | `Cancelled` (runtime), NOT `Err`. Variant kept for type contract + forward-compat. |

`timeout` is its own variant (not under `subprocess`/`transport`) because the aggregate's retry policy treats it differently. `cancelled` stays defined despite ADR-10 — forward-compat with a future monadyssey that surfaces it via `Err`.

#### 5. Diff-only invariant (KEY DIFFERENTIATOR)

Encoded at three layers:
1. **Type** — `GenerateQuizInput` has exactly two fields. No slot for non-diff text.
2. **TSDoc** — `GenerateQuizInput` and `LLMProvider` comments state the rule.
3. **Adapter implementation** — every adapter's prompt construction MUST reference `input.diff` and `input.questionCount` only. Reviewer enforces.

The `Quiz` value also does NOT carry the diff — prevents round-trip leakage if a `Quiz` were ever re-fed into regeneration.

#### 6. Narrow ADR-4's `IO` ban for `core/src/ports/**`

ESLint's `no-restricted-imports` supports `allowTypeImports: true` per-entry. Pick **(β)** of two options: keep the existing `packages/core/**/*.ts` block blocking IO outright; add a new override block scoped to `packages/core/src/ports/**/*.ts` whose `IO` entry has `allowTypeImports: true`. Implementation files stay pure; ports get the carve-out.

The ports-scoped block must **restate all** `paths` and `patterns` from the parent core block — ESLint flat-config replaces, not merges, per ADR-4. Omitting Node-API patterns would silently re-enable them in `ports/`. The Test strategy below pins regression coverage.

### Affected workspaces

Only `packages/core` (5 new source + test files, 1 modified barrel); `eslint.config.js` (1 new override block).

### Types / Functions

(Per Decisions 1, 2, 4 above.) The port is a type alias; no functions. Adapter factories live in `packages/adapters/<name>/`.

### File layout

New (5):
- `packages/core/src/ports/llm-provider.ts`
- `packages/core/src/ports/llm-provider.test.ts`
- `packages/core/src/quiz/quiz.ts`
- `packages/core/src/quiz/errors.ts`
- `packages/core/src/quiz/quiz.test.ts`

Modified (2):
- `packages/core/src/index.ts` — re-exports.
- `eslint.config.js` — new override block for `packages/core/src/ports/**/*.ts`.

Re-exports to add to `packages/core/src/index.ts`:

```ts
export type { Diff, GenerateQuizInput, LLMProvider } from "./ports/llm-provider.js";
export type {
  Choice, ChoiceId, MultipleChoiceQuestion, Question,
  QuestionId, Quiz, QuizId,
} from "./quiz/quiz.js";
export type { LLMProviderError } from "./quiz/errors.js";
```

No `quiz/index.ts` barrel — direct module imports keep the call graph explicit.

### Sequence

Type-definition + lint narrowing only. Conceptual downstream flow:
1. `QuizSession` (#38) receives `Diff` + `LLMProvider` instance.
2. Calls `provider.generateQuiz({ diff, questionCount })` → `IO<LLMProviderError, Quiz>`.
3. Composes with `Schedule` retries (retry `malformed-response`/`timeout`; not `subprocess.spawn-failed`).
4. Runs via `IO.fork()` → Fiber → `join()` → `Ok|Err|Cancelled` (per ADR-10).
5. Host serializes Quiz into wire-format DTO (separate concern).

### Error cases

Per §Decision 4 source-mapping table. No `throw` introduced — throws reserved for invariant violations (e.g., a `MultipleChoiceQuestion` whose `correctChoiceId` isn't in `choices` — adapter's job to enforce before constructing the Quiz).

### Test strategy

**`packages/core/src/ports/llm-provider.test.ts`** — type-only smoke. Constructs a noop fake `LLMProvider` matching the port type; ensures the port file is in the test compile graph. ~10 lines.

**`packages/core/src/quiz/quiz.test.ts`** — structural smoke. Constructs a multiple-choice quiz and one instance of each `LLMProviderError` variant; asserts the variant array has 7 entries (counting variants × distinguishable shapes). Catches rename-but-don't-update-test gotchas.

**ESLint regression recipe** (dev runs, pastes results into PR `## Verification`):

1. `npm run lint` — exit 0 baseline.
2. Add `import { IO } from "monadyssey";` (value, not type-only) to `packages/core/src/quiz/quiz.ts`. `npm run lint` — exit ≠ 0 (parent core block still bans). Revert.
3. `import type { IO } from "monadyssey";` already exists in `ports/llm-provider.ts`; `npm run lint` exits 0 (the carve-out).
4. Add `import { IO } from "monadyssey";` (value import) to `ports/llm-provider.ts`. `npm run lint` — expect exit ≠ 0 (carve-out is type-only, not value). Revert.
5. Add `import { spawn } from "node:child_process";` to `ports/llm-provider.ts`. `npm run lint` — expect exit ≠ 0 (Node-API patterns preserved in the override block). Revert.

Step 5 is the critical regression: pins the "don't drop Node-API ban when splitting the rule" failure mode.

Behavioral tests live in adapter PRs (#36 et al.) — this ADR introduces only types + lint narrowing.

### Consequences

- **Ports may now type-import `IO` in `core/src/ports/**`.** ADR-4 amended by addition; value-imports of `IO` and all other forbidden symbols remain banned everywhere.
- **`Diff` is a placeholder string alias** until #34 (VCSProvider) lands the canonical type. The dev for #34 handles the rename.
- **`QuizPolicy` expansion path open.** #38 may add optional fields to `GenerateQuizInput`; required-field additions need a new ADR.
- **Diff-only invariant** enforced at type + TSDoc + reviewer levels. Reviewer rejects any future PR adding a non-diff slot to `GenerateQuizInput`.
- **Multiple-choice-only v1** limits scoring complexity. Free-text would need LLM-graded comparator or fuzzy-match. v2 may revisit via the `"free-text"` discriminant slot already reserved.
- **No new runtime deps.** `NonEmptyList` already on ADR-4's allowlist; `IO` type-only under `ports/`.
- **`LLMProviderError.cancelled` is unreachable via `Err` at monadyssey@2.0.1** (ADR-10). Adapters MUST NOT construct this variant from `SpawnError.cancelled` — runtime delivers `Cancelled`. Variant kept for type contract and forward-compat.
- **Reversibility high.** If multiple-choice-only is wrong, additive free-text via the discriminant. If type-only IO in `ports/` is wrong, switch to option (d) — one method signature changes per adapter.
- **Binding for #36, #45, #46, #59.** Every LLM adapter implements this port; every prompt construction takes `input.diff` as its only PR-derived input.

---

## ADR-12: `VCSProvider` port + `PRIdentifier`/`Diff` domain types in `core` (replaces ADR-11's `Diff` placeholder)
**Date**: 2026-05-22
**Issue**: #34
**Status**: Accepted (consumes ADR-11's `Diff` placeholder; reuses ADR-11 §Decision 6 ESLint carve-out)

### Context

ADR-11 shipped `LLMProvider` with `Diff = string` as a placeholder. #34 ships the canonical shape. The host dispatcher (#39) needs to route by URL: GitHub URLs → GitHub VCS adapter; ADO URLs → ADO VCS adapter. Both implement the same port; the dispatcher picks per identifier.

Three constraints:

1. **Diff-only invariant** (CLAUDE.md §Key differentiator) — return type cannot carry PR description/title/commits/labels/comments.
2. **`core` purity** — type-only `IO` already permitted in `core/src/ports/**` (ADR-11 §Decision 6).
3. **One identifier type, multiple VCS kinds** — URL parser, kind dispatch, adapter call all need a shared type.

### Decision

#### 1. `PRIdentifier` — discriminated union by VCS kind

```ts
export type PRIdentifier =
  | { readonly kind: "github"; readonly owner: string; readonly repo: string; readonly number: number }
  | { readonly kind: "ado"; readonly org: string; readonly project: string; readonly repo: string; readonly pullRequestId: number };
```

Chosen over opaque branded string and common-fields-plus-raw because the host dispatcher (#39) needs to `switch (id.kind)` with TS exhaustiveness checking, and per-VCS coordinates genuinely differ (GitHub: owner/repo/number; ADO: org/project/repo/id). Future VCS additions are additive. Diff-only invariant preserved at the type level — no slot for description/title/comments.

#### 2. `Diff` — branded string

```ts
export type Diff = string & { readonly __brand: "Diff" };
```

YAGNI on rich-object metadata. Branding prevents accidental coercion of "any string" into the LLM input. Construction goes through (1) a VCS adapter at the trust boundary, or (2) a test-fixture `asDiff` helper. Branding is compile-time only — security is enforced by the reviewer on every VCS-adapter PR (#37, #47): the adapter MUST call the diff endpoint exclusively.

#### 3. `VCSProviderError` — 4 variants

```ts
export type VCSProviderError =
  | { readonly kind: "transport"; readonly status?: number; readonly detail: string }
  | { readonly kind: "malformed-response"; readonly detail: string; readonly raw?: string }
  | { readonly kind: "timeout"; readonly afterMs: number }
  | { readonly kind: "cancelled" };
```

Source-mapping (binding for every VCS adapter):

| Underlying | Maps to |
|---|---|
| HTTP non-2xx (including 401, 403, 404, 429, 5xx) | `transport { status, detail }` |
| HTTP network/TLS failure | `transport { detail }` (no status) |
| Server body fails zod parse / isn't unified-diff | `malformed-response { detail, raw? }` |
| Adapter wall-clock budget exceeded | `timeout { afterMs }` |
| Fiber cancelled by caller | `Cancelled` runtime per ADR-10; variant kept for forward-compat |

**401/404 folded into `transport`** via optional `status` field — mirrors ADR-11's collapsed HTTP error shape. Consumers branch on `status` for adapter-specific handling.

`subprocess` is absent — VCS adapters are pure HTTP. `cancelled` is kept for the same forward-compat reason as ADR-11.

#### 4. `VCSProvider` port — single method

```ts
import type { IO } from "monadyssey";

export type VCSProvider = {
  readonly id: string;
  readonly fetchDiff: (input: PRIdentifier) => IO<VCSProviderError, Diff>;
};
```

`fetchDiff` is the only method. URL parsing is a sibling export (§5). Port surface mirrors `LLMProvider`. The type contract encodes diff-only at the return position: `Diff` not `PR`, not `{ diff, description, ... }`.

#### 5. `parsePRIdentifier` — pure helper, sibling export

```ts
export type UnsupportedURL = {
  readonly kind: "unsupported-url";
  readonly detail: string;
  readonly url: string;
};

export const parsePRIdentifier = (url: string): Either<UnsupportedURL, PRIdentifier> => {
  // GitHub: https://github.com/<owner>/<repo>/pull/<number>
  // ADO:    https://dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/<id>
  //         https://<org>.visualstudio.com/<project>/_git/<repo>/pullrequest/<id> (legacy)
};
```

Lives in `vcs-provider.ts`. Pure (uses WHATWG URL or regex). Both the host dispatcher (#39) and the extension content-script gate (#43-area) consume it. Reject any URL that isn't `https:` to a known host with a known path shape → `Left<UnsupportedURL>`. Reviewer: do not log the full URL above `debug` (legacy ADO URLs may carry tokens in query strings).

#### 6. Diff-only enforcement (KEY DIFFERENTIATOR)

Encoded at four layers (one stronger than ADR-11's three):

1. **Type-level (port return)** — `fetchDiff` returns `Diff`, not a `PR` record.
2. **Type-level (identifier shape)** — `PRIdentifier` variants carry only location coordinates.
3. **TSDoc** — port + identifier comments state the rule.
4. **Adapter implementation review** — every VCS adapter PR (#37, #47) is reviewed for: (a) call targets diff endpoint only, (b) response treated as diff bytes only, (c) no description/title/comments queries even speculatively.

Reviewer rejects any change to `PRIdentifier` adding a non-coordinate field, or any addition to `Diff` beyond branded bytes, without a dedicated ADR.

#### 7. `Diff` placeholder migration in `llm-provider.ts`

```ts
// Before (ADR-11):
export type Diff = string;

// After (this ADR):
export type { Diff } from "./vcs-provider.js";
```

Re-export keeps the public path stable. The ADR-11 test `expectTypeOf<Diff>().toBeString();` becomes `expectTypeOf<Diff>().toMatchTypeOf<string>();` — the one knock-on test update.

#### 8. No ESLint changes

The override block from ADR-11 §Decision 6 targets `packages/core/src/ports/**/*.ts`. `vcs-provider.ts` lives at exactly that path; the type-only `IO` carve-out and Node-API/forbidden-FP bans apply automatically.

### Affected workspaces

Only `packages/core` (1 new source + test, 2 modified files). Adapters and host consume in subsequent issues. Dep direction unchanged.

### Types

(Per Decisions 1, 2, 3, 5.) `PRIdentifier`, `Diff`, `VCSProviderError`, `VCSProvider`, `UnsupportedURL` — all in `packages/core/src/ports/vcs-provider.ts`.

### Functions

`parsePRIdentifier(url: string): Either<UnsupportedURL, PRIdentifier>` — pure, in `vcs-provider.ts`. NOT part of the port; sibling export. Handles GitHub `pull/<n>` and ADO `pullrequest/<id>` (both `dev.azure.com` and legacy `visualstudio.com` shapes).

### File layout

New (2):
- `packages/core/src/ports/vcs-provider.ts`
- `packages/core/src/ports/vcs-provider.test.ts`

Modified (2):
- `packages/core/src/ports/llm-provider.ts` — replace `export type Diff = string;` with `export type { Diff } from "./vcs-provider.js";`.
- `packages/core/src/index.ts` — add re-exports:

```ts
export type { Diff, PRIdentifier, VCSProvider, VCSProviderError, UnsupportedURL } from "./ports/vcs-provider.js";
export { parsePRIdentifier } from "./ports/vcs-provider.js";
```

Also touched: `packages/core/src/ports/llm-provider.test.ts` — one line, `.toBeString()` → `.toMatchTypeOf<string>()`.

### Sequence

Type-definition + re-export change. Downstream flow once #37, #38, #39 land:
1. Extension content script sends URL to service worker.
2. Service worker forwards URL to host via native messaging.
3. Host calls `parsePRIdentifier(url)`.
4. Host dispatcher (`#39`) `switch`es on `id.kind` to pick the right VCS adapter + LLM adapter pair.
5. `vcsProvider.fetchDiff(id)` → `IO<VCSProviderError, Diff>`.
6. On success, hands `Diff` to `QuizSession.start({ diff, questionCount, llmProvider })` (#38).
7. `QuizSession` calls `llmProvider.generateQuiz({ diff, questionCount })`.
8. Host returns Quiz to extension.

Type-level note: step 6 is the only place `Diff` crosses from "fetched bytes" to "LLM-prompt input." Reviewer on #38 verifies no other field on a `PR` value reaches the LLM through any other path.

### Error cases

Per §Decision 3 source-mapping table. `parsePRIdentifier`'s only failure mode is `UnsupportedURL` — pure, no I/O. No `throw` introduced.

### Test strategy

**`vcs-provider.test.ts`** — three describe blocks:

1. **Type-only smoke** for `VCSProvider` — noop fake matching the port; assert `fetchDiff` returns `IO<VCSProviderError, Diff>`; assert `PRIdentifier.kind` is `"github" | "ado"`; assert `Diff extends string` but `Diff !== string`.

2. **Unit tests for `parsePRIdentifier`** — 8 table-driven cases:
   - ✓ `https://github.com/tibtof/lgtm-buzzer/pull/34` → `Right({ kind: "github", owner: "tibtof", repo: "lgtm-buzzer", number: 34 })`.
   - ✓ `https://github.com/foo/bar/pull/1/files` → `Right({ kind: "github", ..., number: 1 })` (trailing path stripped).
   - ✓ `https://dev.azure.com/my-org/My%20Project/_git/repo/pullrequest/123` → `Right({ kind: "ado", project: "My Project", ... })`.
   - ✓ `https://my-org.visualstudio.com/MyProj/_git/repo/pullrequest/7` → `Right({ kind: "ado", ... })` (legacy host).
   - ✗ `https://gitlab.com/foo/bar/-/merge_requests/1` → `Left<UnsupportedURL>`.
   - ✗ `http://github.com/foo/bar/pull/1` (non-https) → `Left`.
   - ✗ `https://github.com/foo` (missing `/pull/<n>`) → `Left`.
   - ✗ `not-a-url` → `Left`.

3. **Structural smoke for `VCSProviderError`** — table of all 4 variants × shape variations (`transport` with/without `status`, `malformed-response` with/without `raw`), 6 distinguishable shapes.

4. **Diff-only invariant assertion** — `expectTypeOf<PRIdentifier>().not.toHaveProperty("description")` and similar for "title", "comments".

**`llm-provider.test.ts`** — one-line update for the branded `Diff`.

**ESLint regression** — re-run ADR-11 §Test strategy steps 1, 2, 3, 5 with `vcs-provider.ts` in place. Confirm step 5 still fails (Node-API ban preserved).

Coverage: `parsePRIdentifier` table-driven cases push the helper to ≥95%.

### Consequences

- **`Diff` is now canonical and branded.** VCS adapters do `as Diff` at the trust boundary; test fixtures use an `asDiff` helper.
- **`PRIdentifier` is discriminated.** Adding GitLab is additive. Reviewer rejects any "default branch" `if (kind !== "github")` shortcut that bypasses exhaustiveness.
- **`parsePRIdentifier` lives in `core`** — both host and extension consume it.
- **No new runtime deps.** `monadyssey.Either` already on the allowlist.
- **ADR-11's `Diff` placeholder is consumed.** No remaining placeholders in `core/src/ports/`.
- **Diff-only invariant gains a fourth enforcement layer** (port return type) on top of ADR-11's three. Reviewer's burden on adapter PRs becomes more mechanical: "did the adapter call the diff endpoint exclusively?"
- **`VCSProviderError.cancelled` unreachable via `Err` at v2.0.1** per ADR-10; kept for type contract + forward-compat.
- **Reversibility high.** Brand drop is one type edit; identifier shape changes are additive.
- **Binding for #37, #39, #43, #47.**

---

## ADR-13: Quiz wire-format messages (`quiz-request` / `quiz-response` / `quiz-submit` / `quiz-result`) in `protocol`
**Date**: 2026-05-22
**Issue**: #35
**Status**: Accepted

### Context

ADR-7 shipped the envelope + ping/pong/error. ADR-11/12 shipped Quiz/PRIdentifier/Diff in `core`. M2 still needs the four payload-carrying frames that move the quiz across native messaging — without them, dispatcher (#39), service worker (#41), and modal UI (#43) have no shared vocabulary.

Constraints:

1. **`protocol` purity**: zod only. No `monadyssey`, no `core` imports. Branded IDs (`QuizId`/etc.) and `NonEmptyList` from core mirror to plain `z.string().min(1)` and `z.array(...).min(1)` on the wire.
2. **Diff-only invariant**: no message DTO may carry PR description/title/commits/labels/comments. The diff itself isn't on the wire either — extension never sees diff bytes (host fetches via VCS adapter).
3. **Gate integrity**: `quiz-response` flows host→extension on a channel the extension JS can inspect at will. The wire-format Quiz MUST NOT carry `correctChoiceId`. The host keeps correct answers server-side keyed by quiz ID and scores on submit.

### Decision

Four new frame schemas + one shared `PRIdentifier` DTO + one additive `ErrorReasonSchema` entry. No new runtime deps. No envelope structural change.

#### Wire-shape choices (binding)

| Choice | Decision |
|---|---|
| PR identifier transport | Parsed `PRIdentifierSchema` (discriminated union mirror); extension calls `parsePRIdentifier` first |
| `quiz-request.questionCount` bounds | `z.number().int().min(1).max(10)` |
| Branded IDs on the wire | `z.string().min(1)` |
| `correctChoiceId` in `quiz-response` | **ABSENT** (binding for gate integrity) |
| Session correlation | Host-side `Map<QuizId, ...>`; wire carries IDs only |
| Unknown quiz ID on submit | New `ErrorReasonSchema` variant `"unknown-quiz-id"` |
| `perQuestion` in `quiz-result` | Optional; present when host has feedback |

#### Schemas

**`packages/protocol/src/messages/pr-identifier.ts`**:

```ts
import { z } from "zod";

export const GitHubPRIdentifierSchema = z.object({
  kind: z.literal("github"),
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.number().int().positive(),
});

export const AdoPRIdentifierSchema = z.object({
  kind: z.literal("ado"),
  org: z.string().min(1),
  project: z.string().min(1),
  repo: z.string().min(1),
  pullRequestId: z.number().int().positive(),
});

export const PRIdentifierSchema = z.discriminatedUnion("kind", [
  GitHubPRIdentifierSchema,
  AdoPRIdentifierSchema,
]);

export type PRIdentifierDTO = z.infer<typeof PRIdentifierSchema>;
```

TSDoc: reaffirms diff-only invariant — MUST NOT extend with description/title/comment fields without a dedicated ADR.

**`packages/protocol/src/messages/quiz-request.ts`**:

```ts
export const QuizRequestPayloadSchema = z.object({
  pr: PRIdentifierSchema,
  questionCount: z.number().int().min(1).max(10),
});

export const QuizRequestFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("quiz-request"),
  payload: QuizRequestPayloadSchema,
});
```

Payload deliberately contains ONLY `pr` and `questionCount`. No description/title/comments — diff-only at the type level.

**`packages/protocol/src/messages/quiz-response.ts`**:

```ts
export const ChoiceDTOSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

export const QuestionDTOSchema = z.object({
  type: z.literal("multiple-choice"),
  id: z.string().min(1),
  prompt: z.string().min(1),
  choices: z.array(ChoiceDTOSchema).min(1),
  explanation: z.string().min(1).optional(),
});

export const QuizDTOSchema = z.object({
  id: z.string().min(1),
  questions: z.array(QuestionDTOSchema).min(1),
});

export const QuizResponsePayloadSchema = z.object({
  quiz: QuizDTOSchema,
});

export const QuizResponseFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("quiz-response"),
  payload: QuizResponsePayloadSchema,
});
```

**Binding (reviewer-enforced)**: `QuestionDTOSchema` has no `correctChoiceId` field. Adding one defeats the gate (extension JS can read frame payloads).

`type: "multiple-choice"` discriminant matches `core.Question`'s v1 shape; reserves the slot for v2 free-text.

The `explanation` field is post-submit display copy; NOT the correct-answer key. Reviewer confirms on the implementation PR that the host doesn't populate it with correct-choice giveaways.

**`packages/protocol/src/messages/quiz-submit.ts`**:

```ts
export const SubmittedAnswerSchema = z.object({
  questionId: z.string().min(1),
  chosenChoiceId: z.string().min(1),
});

export const QuizSubmitPayloadSchema = z.object({
  quizId: z.string().min(1),
  answers: z.array(SubmittedAnswerSchema).min(1),
});

export const QuizSubmitFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("quiz-submit"),
  payload: QuizSubmitPayloadSchema,
});
```

`quizId` correlates back to the issued Quiz. If the host doesn't recognize it → `ErrorFrame { reason: "unknown-quiz-id" }`. Partial submits (fewer answers than questions) are allowed at the wire level; whether the host accepts them is policy.

**`packages/protocol/src/messages/quiz-result.ts`**:

```ts
export const PerQuestionResultSchema = z.object({
  questionId: z.string().min(1),
  correct: z.boolean(),
  explanation: z.string().min(1).optional(),
});

export const QuizResultPayloadSchema = z.object({
  passed: z.boolean(),
  correct: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  perQuestion: z.array(PerQuestionResultSchema).optional(),
});

export const QuizResultFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("quiz-result"),
  payload: QuizResultPayloadSchema,
});
```

Reviewer note: `perQuestion[].explanation` is the LLM's own output; do NOT vary based on submitted answer (would let attackers diff explanations to deduce correct answers).

**`packages/protocol/src/messages/error.ts`** (additive change):

```ts
export const ErrorReasonSchema = z.enum([
  "schema-violation",
  "unknown-message",
  "version-mismatch",
  "internal",
  "unknown-quiz-id",
]);
```

**`packages/protocol/src/envelope.ts`** (modified — extended `FrameSchema` union):

```ts
export const FrameSchema = z.discriminatedUnion("kind", [
  PingFrameSchema,
  PongFrameSchema,
  ErrorFrameSchema,
  QuizRequestFrameSchema,
  QuizResponseFrameSchema,
  QuizSubmitFrameSchema,
  QuizResultFrameSchema,
]);
```

`parseFrame` (ADR-7) automatically covers the new kinds — no signature change, no behavior change beyond the wider type.

#### Affected workspaces

`packages/protocol` only.

#### File layout

**New (10)**: 5 source + 5 test files under `packages/protocol/src/messages/`:
- `pr-identifier.ts` + `.test.ts`
- `quiz-request.ts` + `.test.ts`
- `quiz-response.ts` + `.test.ts`
- `quiz-submit.ts` + `.test.ts`
- `quiz-result.ts` + `.test.ts`

**Modified (5)**:
- `envelope.ts` — extend FrameSchema union.
- `messages/error.ts` — add `"unknown-quiz-id"` to enum.
- `index.ts` — re-export new schemas + types.
- `envelope.test.ts` — new happy-path cases for the four new kinds.
- `parse.test.ts` — new round-trip cases.
- `messages/error.test.ts` — case for new enum value.

(6 files modified counting the two test updates as separate.)

`index.ts` re-export block adds: `PRIdentifierSchema`, `GitHubPRIdentifierSchema`, `AdoPRIdentifierSchema`, all four QuizXFrameSchema/PayloadSchema pairs, `ChoiceDTOSchema`, `QuestionDTOSchema`, `QuizDTOSchema`, `SubmittedAnswerSchema`, `PerQuestionResultSchema`, plus all inferred types.

#### Sequence

End-to-end (lands across #38, #39, #41-area, #43-area):

1. Content script detects Approve click, calls `parsePRIdentifier(url)`. Left → toast + abort. Right → forward to service worker.
2. Service worker wraps in `QuizRequestFrame` (fresh UUID `correlationId`, `questionCount` from settings/default 3). Posts via native messaging.
3. Host dispatcher runs `parseFrame`. Success + kind `"quiz-request"` → dispatches by `pr.kind`.
4. VCS adapter fetches diff (`IO<VCSProviderError, Diff>`).
5. `QuizSession.start` feeds diff + count to LLMProvider; receives `Quiz` (with `correctChoiceId`).
6. **Host strips `correctChoiceId`** while building `QuizResponseFrame`. Simultaneously stores `Map<QuizId, Map<QuestionId, ChoiceId>>` in process memory keyed by quiz ID. Sends.
7. Modal renders questions; user answers.
8. Service worker sends `QuizSubmitFrame` with fresh `correlationId`.
9. Host looks up answer map. Missing → `ErrorFrame { reason: "unknown-quiz-id" }`. Present → score, send `QuizResultFrame`, drop map entry (no replay).
10. Extension: `passed: true` → remove gate, synthetic Approve click. `passed: false` → show per-question feedback, re-arm gate.

**Diff-flow audit (KEY DIFFERENTIATOR)**: diff bytes leave the host only at step 5 (LLM CLI stdin via `spawnIO`). Wire frames in this ADR never carry diff bytes; extension never sees them.

#### Error cases

| Failure | ErrorFrame `reason` |
|---|---|
| Missing/out-of-bounds fields on `quiz-request` | `schema-violation` |
| Malformed `PRIdentifier` (unknown kind) | `schema-violation` |
| `quiz-submit` unknown `quizId` | `unknown-quiz-id` |
| `quiz-submit` answers reference questions not in original quiz | `schema-violation` |
| Unknown future `kind` | `unknown-message` |
| LLM adapter failure | `internal` (with VCS/LLM error kind in `details`; no diff fragments, no URLs with query strings) |

`parseFrame` total over `unknown`; `safeParse` doesn't throw.

#### Test strategy

**Per-message test files** (5 new):
- `pr-identifier.test.ts` (8 cases): both happy paths; missing/unknown kind; missing/empty string fields; non-positive ints.
- `quiz-request.test.ts` (6 cases): happy with each PR kind; out-of-bounds questionCount; missing pr; malformed nested PRIdentifier.
- `quiz-response.test.ts` (8 cases): happy with 1 and N questions; empty questions/choices fails; missing discriminant fails; **`correctChoiceId` round-trip assertion (gate-integrity binding)**; missing `id` fails; explanation optional present/absent.
- `quiz-submit.test.ts` (5 cases): 1 answer / N answers; empty fails; missing quizId/IDs; empty-string IDs.
- `quiz-result.test.ts` (7 cases): pass + fail happy; with/without perQuestion; negative correct fails; total: 0 fails; per-question with explanation.

**Existing test updates**:
- `envelope.test.ts` — 4 new happy-path cases (one per new kind).
- `parse.test.ts` — 4 new round-trip cases with TS narrowing.
- `messages/error.test.ts` — add `"unknown-quiz-id"` case.

**Gate integrity binding** in `quiz-response.test.ts`:

```ts
it("rejects or strips correctChoiceId on questions (gate integrity)", () => {
  const payload = {
    quiz: {
      id: "q1",
      questions: [{
        type: "multiple-choice",
        id: "qq1",
        prompt: "?",
        choices: [{ id: "c1", label: "a" }],
        correctChoiceId: "c1", // MUST NOT survive
      }],
    },
  };
  const result = QuizResponsePayloadSchema.safeParse(payload);
  if (result.success) {
    expect("correctChoiceId" in result.data.quiz.questions[0]!).toBe(false);
  }
});
```

If the dev opts for `.strict()` on `QuestionDTOSchema`, flip to `expect(result.success).toBe(false)`. Either is acceptable; both prevent a host bug from leaking the correct answer.

Coverage target: 90% on `protocol` (CLAUDE.md). Achievable — new schemas are pure shapes.

### Consequences

- **Wire-format grows from 3 to 7 frame kinds.** `parseFrame` automatically covers them; no downstream changes beyond type widening.
- **Gate integrity is type-level.** Reviewer cannot accidentally let `correctChoiceId` reach the extension.
- **Diff-only invariant gains a fifth enforcement layer** (every new message's TSDoc forbids extension with PR-text fields without an ADR).
- **PR identifier transport is parsed-not-raw.** Malformed URLs never cross native messaging.
- **Session correlation is host concern.** Wire carries IDs; in-memory `Map` is enough for v1; restart → `unknown-quiz-id` → extension shows "session expired, retry."
- **No new runtime deps.** `monadyssey` stays out of `protocol`.
- **Forward compat**: `type: "multiple-choice"` discriminant reserves room for free-text v2 without breaking `PROTOCOL_VERSION = 1`.
- **What this ADR does NOT decide**: pass-threshold policy (#38), session TTL (#39), per-question feedback completeness (#39). Wire permits any host policy.
- **Reversibility**: high. No downstream consumers yet (#38, #39, #41 land later). Mistakes here are one-PR fixes.
- **Security**: every quiz-flow byte from stdin passes through `parseFrame`. Extension cannot infer correct answers from `quiz-response`. Host cannot leak diff bytes into any wire payload — no field shaped for them.

---

## ADR-14: First `LLMProvider` implementation — `claude-cli` adapter shelling out to the Claude Code CLI via `spawnIO`
**Date**: 2026-05-22
**Issue**: #36
**Status**: Accepted

### Context

M2's vertical slice needs the first concrete `LLMProvider` adapter (ADR-11). Claude Code CLI is the v1 choice. All upstream primitives are in place: `spawnIO` (ADR-9/10), `LLMProvider` port + `LLMProviderError` (ADR-11), `Diff` branded (ADR-12), `Quiz` domain types (ADR-11).

Six adapter-specific questions the upstream ADRs deferred:
1. CLI invocation shape (flags, mode).
2. Prompt transport (argv vs stdin — KEY DIFFERENTIATOR).
3. Response schema (LLMs don't always emit clean JSON).
4. `correctChoiceIndex` (int) vs `correctChoice` (string match).
5. Timeout strategy (spawnIO has none in v1).
6. ID minting for branded `QuizId`/`QuestionId`/`ChoiceId`.

### Decision

#### 1 — CLI invocation: `claude --print --output-format json` with prompt via stdin

Args (fixed, no diff bytes):
```ts
["--print", "--output-format", "json", "--model", config.model, "--permission-mode", "default"]
```

**Binding constraints**:
- **No prompt in argv.** No positional prompt, no `--append-system-prompt`. Argv is logged by `ps`/audit tools.
- `--output-format json` outer envelope; adapter parses envelope, then extracts the model's JSON output.
- No streaming flags.
- Default `config.binary = "claude"`, `config.model = "sonnet"`.
- `--bare` deliberately NOT used (preserves user's local CLI hooks/plugins).

#### 2 — Prompt transport: stdin only (KEY DIFFERENTIATOR)

```ts
// packages/adapters/claude-cli/src/prompt.ts
export const buildPrompt = (diff: Diff, questionCount: number): string => {
  return `${SYSTEM_PROMPT}\n\nUSER:\n${buildUserMessage(diff, questionCount)}\n`;
};
```

`buildPrompt` signature has exactly 2 parameters — the diff and the question count. Adding a third parameter requires an ADR amendment.

##### Prompt template (binding for v1)

```
SYSTEM:
You generate multiple-choice quizzes that test whether a code reviewer
has actually read a pull-request diff.

You will receive a unified diff between <DIFF> and </DIFF> markers. Use
ONLY the diff content. Do not invent, infer, or reference any context
that is not present in the diff (no commit messages, no PR description,
no external file content).

Generate exactly N multiple-choice questions where N is provided in the
USER message.

Each question MUST:
- Reference a concrete change in the diff.
- Be answerable from the diff alone — not from filenames or boilerplate.
- Have between 2 and 6 plausible answer choices, with exactly one correct.
- Include at least one question that probes an edge case or impact concern.

Respond with a JSON object ONLY (no markdown fences, no commentary).
Schema:

{
  "questions": [
    {
      "prompt": "<question text>",
      "choices": ["<choice 1>", "<choice 2>", ...],
      "correctChoiceIndex": <0-based integer>,
      "explanation": "<short post-submit explanation, optional>"
    }
  ]
}

If the diff is empty or too short, respond with: { "questions": [] }
(The adapter surfaces this as malformed-response.)

USER:
Generate <N> multiple-choice questions from the following diff.

<DIFF>
<diff bytes interpolated verbatim>
</DIFF>
```

#### 3 — Response parsing: tolerant pre-parse + strict zod

```ts
const ClaudePrintEnvelopeSchema = z.object({
  type: z.literal("result"),
  subtype: z.enum(["success", "error_max_turns", "error_during_execution"]).optional(),
  result: z.string().min(1),
});

const LlmQuestionSchema = z.object({
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(6),
  correctChoiceIndex: z.number().int().min(0),
  explanation: z.string().min(1).optional(),
});

const LlmQuizSchema = z.object({
  questions: z.array(LlmQuestionSchema).min(1),
});
```

Parse pipeline:
1. `JSON.parse(stdout)` → `ClaudePrintEnvelopeSchema`. Fail → `malformed-response { detail: "envelope-parse-failed", raw }`.
2. Extract `envelope.result`.
3. Strip ```` ```json ... ``` ```` fences if present (tolerant regex).
4. `JSON.parse` the model text → `LlmQuizSchema`. Fail → `malformed-response`.
5. Cross-check `correctChoiceIndex < choices.length`. Out-of-bounds → `malformed-response { detail: "correctChoiceIndex out of range" }`.
6. Empty `questions` → `malformed-response { detail: "empty-quiz" }`.
7. Map to `core.Quiz` via injected `IdGenerator`.

`raw` clipped to 8 KiB.

#### 4 — `correctChoiceIndex` (int) over `correctChoice` (string)

Locked. Index is unambiguous; string match fails on whitespace/punctuation drift.

#### 5 — Timeout in the adapter via `Schedule.timeout`

`spawnIO` v1 has no timeout option (ADR-9 §Consequences). Adapter composes:

```ts
const withTimeout = Schedule.timeout(spawn, deps.timeoutMs ?? 60_000);
```

Budget exhaustion → `Err<LLMProviderError.timeout { afterMs }>`. Caller-cancel → `Cancelled` runtime outcome (ADR-10 unchanged).

**Note for dev**: if monadyssey@2.0.1's `Schedule.timeout` doesn't surface budget exhaustion as `Err` (only as `Cancelled`), escalate via `NEEDS_CLARIFICATION`. The contract is binding: timeout = `Err<timeout>`, cancellation = `Cancelled`.

Default `timeoutMs = 60_000`.

#### 6 — `IdGenerator` (injected, default UUID v4)

```ts
// packages/adapters/claude-cli/src/ids.ts
export type IdGenerator = {
  readonly quizId: () => QuizId;
  readonly questionId: () => QuestionId;
  readonly choiceId: () => ChoiceId;
};

export const defaultIdGenerator = (): IdGenerator => ({
  quizId: () => crypto.randomUUID() as QuizId,
  questionId: () => crypto.randomUUID() as QuestionId,
  choiceId: () => crypto.randomUUID() as ChoiceId,
});
```

Brand casts at the construction site (same pattern as ADR-12's `as Diff`). Tests inject a deterministic counter-based generator.

#### 7 — Error mapping (binding)

| Source | LLMProviderError |
|---|---|
| `SpawnError.spawn-failed` | `subprocess { reason: "spawn-failed", detail }` |
| `SpawnError.process-failed { exitCode, stderr }` | `subprocess { reason: "process-failed", exitCode, stderr, detail: \`exit ${exitCode}\` }` |
| Schedule.timeout exhausted | `timeout { afterMs }` |
| Envelope JSON.parse throws | `malformed-response { detail: "envelope-parse-failed", raw }` |
| Envelope schema fail | `malformed-response { detail: "envelope-schema: <issues>", raw }` |
| Model output JSON.parse throws | `malformed-response { detail: "model-output-not-json", raw }` |
| LlmQuizSchema fail | `malformed-response { detail: "quiz-schema: <issues>", raw }` |
| correctChoiceIndex OOB | `malformed-response { detail: "correctChoiceIndex out of range" }` |
| Empty questions | `malformed-response { detail: "empty-quiz" }` |
| Caller cancellation | `Cancelled` runtime (NOT manufactured into Err) |
| `transport` | unused — kept for HTTP adapter #59 |

### Affected workspaces

`packages/adapters/claude-cli/` only. Adds workspace dep on `@lgtm-buzzer/adapter-shared`.

### Types

```ts
export type ClaudeCliConfig = {
  readonly binary?: string;          // default "claude"
  readonly model?: string;           // default "sonnet"
  readonly timeoutMs?: number;       // default 60_000
  readonly graceMs?: number;         // default 5000
};

export type ClaudeCliDeps = {
  readonly spawnIO: typeof spawnIO;
  readonly ids?: IdGenerator;
  readonly config?: ClaudeCliConfig;
};

export declare const createClaudeCliProvider: (deps: ClaudeCliDeps) => LLMProvider;
```

### Functions

- `buildPrompt(diff, questionCount): string` — pure.
- `parseResponse(stdout, ids): Either<LLMProviderError, Quiz>` — pure.
- `createClaudeCliProvider(deps): LLMProvider` — factory.
- `defaultIdGenerator(): IdGenerator` — uses `crypto.randomUUID()`.

### File layout

New (8):
- `src/provider.ts` — factory.
- `src/prompt.ts` — `SYSTEM_PROMPT` + `buildPrompt`.
- `src/response.ts` — schemas + `parseResponse`.
- `src/ids.ts` — `IdGenerator` + `defaultIdGenerator`.
- `src/prompt.test.ts`, `response.test.ts`, `provider.test.ts`, `integration.test.ts` (the last is `.skip` by default).

Modified (3):
- `src/index.ts` — barrel: export factory + types.
- `package.json` — add `@lgtm-buzzer/adapter-shared`, `monadyssey`, `zod` deps.
- `tsconfig.json` — add `{ "path": "../_shared" }` to references.

### Sequence

Per-call flow:
1. Caller invokes `provider.generateQuiz({ diff, questionCount: 3 })`.
2. `buildPrompt(diff, 3)` produces stdin string.
3. Fixed argv constructed (no diff bytes).
4. `deps.spawnIO("claude", args, prompt, { graceMs: 5000 })`.
5. Wrap in `Schedule.timeout(io, 60_000)`.
6. `spawnIO` writes prompt to stdin, closes it, buffers stdout/stderr.
7. On success → `parseResponse(stdout, ids)` → `Quiz`. On any error → mapped per §7.

**Diff-flow audit**: diff bytes appear only at step 6 (`child.stdin.write`). Never in argv, never in error payloads (raw is clipped + contains LLM response not input prompt).

### Error cases

All 11 rows in §7. No `throw` in expected-failure paths. `Cancelled` propagates unchanged.

### Test strategy

**`prompt.test.ts`** (≥10 cases): happy path; question count interpolation; `buildPrompt.length === 2` (signature size); no prompt-injection bait in SYSTEM ("ignore previous instructions", "you are a senior engineer", "LGTM", "Claude" — absent); JSON-output instruction present; `<DIFF>` markers exactly once each; newlines preserved; backticks don't break format.

**`response.test.ts`** (≥10 cases): happy path; markdown fence with/without `json` language; invalid envelope JSON; envelope schema fail; model output invalid JSON; LlmQuizSchema fail; `correctChoiceIndex` OOB; empty questions; `raw` clipped to 8 KiB; `explanation` optional present/absent.

**`provider.test.ts`** (≥8 cases) with fake `spawnIO`:
1. Happy path: command + fixed argv asserted exactly.
2. **Diff in stdin, NOT in argv** (binding): `calls[0].stdin` contains diff; `calls[0].args.join(" ")` does NOT contain diff; `<DIFF>` does not appear in args. **Reviewer-enforced**.
3. No prompt positional: args length = 7 (fixed-argv length).
4. `spawn-failed` mapping.
5. `process-failed` mapping (with exitCode + stderr).
6. Malformed envelope mapping.
7. Malformed model output mapping.
8. Timeout (if monadyssey API supports clean synthetic-time test — else `.skip` with comment).
9. Cancellation: fake returns Cancelled → adapter propagates as Cancelled (NOT Err).
10. Custom binary/model: factory config respected.
11. `provider.id === "claude-cli"`.

**`integration.test.ts`** — single `.skip` test invoking real `claude`. Not in CI.

Coverage target: 80% on adapter (per CLAUDE.md §Testing).

### Consequences

- **First real LLMProvider.** Template for #45, #46, #59.
- **Diff-only invariant mechanically enforced.** `buildPrompt`'s 2-parameter signature + contract test #2 catch stdin-only violations.
- **stdin-over-argv security ratchet.** Contract test catches accidents.
- **`correctChoiceIndex` over `correctChoice`** locks in unambiguous answer mapping.
- **`Cancelled` plumbed correctly** (ADR-10) — adapter does NOT translate to Err.
- **Timeout lives in adapter, not `spawnIO`.** v1 contract unchanged.
- **One new dep: `zod` in adapter** (already in protocol).
- **`--bare` NOT used.** User's CLI config (hooks, plugins) is preserved. Future ADR may revisit if it becomes a support issue.
- **Reversibility high.** Three independent files (prompt/response/provider); each is a one-file swap.
- **Forward compat**: factory shape supports per-adapter timeout/model/binary; per-call inputs stay diff + questionCount only.
- **Binding for reviewer**: (a) diff bytes in stdin only — test #2; (b) `buildPrompt` 2-param signature; (c) no `--bare`, no prompt positional; (d) `Cancelled` not manufactured into Err; (e) error mapping §7 exhaustive.

---

## ADR-15: First `VCSProvider` implementation — `github` adapter fetching PR diff via the GitHub REST API
**Date**: 2026-05-22
**Issue**: #37
**Status**: Accepted

### Context

M2's first concrete `VCSProvider`. GitHub is v1 target. Upstream primitives in place: `VCSProvider` port + `VCSProviderError` + `Diff` + `PRIdentifier` (ADR-12), `Cancelled` runtime (ADR-10), `monadyssey-fetch@2.0.1` already pinned.

Seven adapter-specific questions resolved below.

### Decision

#### 1 — Endpoint: `GET /repos/{owner}/{repo}/pulls/{number}` with `Accept: application/vnd.github.v3.diff`

Single request. Response body IS the raw unified diff (no JSON envelope). Diff-only invariant enforced two ways: type contract (`fetchDiff → Diff`), reviewer attention. **No `/files`, `/commits`, `/comments`, `/reviews` endpoints are reached on any path.**

URL builder (pure):

```ts
export const buildPullDiffUrl = (
  baseUrl: string,
  pr: Extract<PRIdentifier, { kind: "github" }>,
): string => {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/repos/${encodeURIComponent(pr.owner)}/${encodeURIComponent(pr.repo)}/pulls/${pr.number}`;
};
```

#### 2 — `monadyssey-fetch@2.0.1` API (verified)

CLAUDE.md idiom #5's `Http.get(...)` was illustrative. Actual v2.0.1 API is instantiable `HttpClient`:

```ts
import { HttpClient, HttpError, type Options } from "monadyssey-fetch";

const client = new HttpClient({
  baseUrl,
  defaultHeaders: {
    Accept: "application/vnd.github.v3.diff",
    Authorization: `Bearer ${token}`,
    "User-Agent": "lgtm-buzzer-github-adapter/0.0.0",
    "X-GitHub-Api-Version": "2022-11-28",
  },
  timeout: timeoutMs,
});

const io = client.get(path, { responseType: "text", observe: "response" });
// IO<HttpError, Response>
```

`observe: "response"` exposes status + body. `responseType: "text"` avoids JSON.parse on the diff body. Read text via `IO.of(() => response.text(), e => …)` if the library doesn't combine both options.

#### 3 — Auth: PAT injected at factory construction

```ts
export type GithubAdapterConfig = {
  readonly token: string;             // required PAT (classic or fine-grained)
  readonly baseUrl?: string;           // default "https://api.github.com"
  readonly timeoutMs?: number;         // default 30_000
  readonly maxBytes?: number;          // default 2 MiB
  readonly userAgent?: string;
};
```

Adapter does NOT read env vars or files. Host wiring (#49) decides provenance. Token NEVER appears in `VCSProviderError.detail` or `raw` payload, never logged.

#### 4 — Error mapping (binding per ADR-12 §Decision 3)

| Source | VCSProviderError |
|---|---|
| `HttpError.status >= 400` (incl. 401/403/404/429/5xx) | `transport { status, detail: rawMessage }` |
| `HttpError.status === 0` (network/TLS) | `transport { detail: rawMessage }` (no status) |
| HttpClient timeout | `timeout { afterMs }` |
| Body fails `looksLikeUnifiedDiff` | `malformed-response { detail, raw: body.slice(0, 8192) }` |
| Body exceeds `maxBytes` | `malformed-response { detail: \`diff-too-large: ${bytes}\` }` |
| Caller cancels | `Cancelled` runtime (NEVER manufactured into Err) |

`raw` clipped to 8 KiB (same convention as ADR-14). Reviewer enforces: token MUST NOT appear in `detail` or `raw`.

#### 5 — Structural validation: unified-diff sniff (not strict parse)

```ts
const looksLikeUnifiedDiff = (s: string): boolean => {
  if (s.length === 0) return true;             // empty PR is legal
  return /^diff --git /m.test(s) || /^--- /m.test(s);
};
```

Catches HTML error pages. Strict parsing out of scope — that's the LLM's job.

#### 6 — Diff size cap: 2 MiB hard ceiling (configurable)

`Buffer.byteLength(body, "utf8") > maxBytes` → `malformed-response { detail: "diff-too-large: <bytes>" }`. Defense in depth; QuizSession (#38) may add its own ceiling.

#### 7 — httptape integration

**Binary assumed on PATH**. Two equivalent install paths documented in `packages/adapters/github/README.md`:
1. `go install github.com/httptape/httptape/cmd/httptape@latest`.
2. Docker: `docker run --rm -p <port>:8080 -v $(pwd)/fixtures:/fixtures tibtof/httptape serve --fixtures /fixtures`.

Vitest globalSetup spawns `httptape serve --fixtures ./fixtures --port 0`, parses bound port from stderr, exposes via `LGTM_BUZZER_GH_HTTPTAPE_URL` env. Teardown kills on SIGTERM. Skips contract tests (with explicit warn) if httptape binary not found.

Recording: `npm run record:github` gated by `LGTM_BUZZER_GH_TOKEN`. `httptape.sanitize.json` (committed) redacts `Authorization` headers, `X-GitHub-Token` headers, user emails, ETags before fixtures touch disk.

#### 8 — File layout

New (≥10):
- `src/url.ts` + `.test.ts` — `buildPullDiffUrl` (pure).
- `src/errors.ts` + `.test.ts` — `mapHttpError`.
- `src/http.ts` + `.test.ts` — `HttpClient` wrapper.
- `src/provider.ts` + `.test.ts` — `createGithubVcsProvider` + fake-HttpClient tests.
- `src/contract.test.ts` — httptape-backed contract tests.
- `vitest.globalSetup.ts`, `vitest.config.ts`, `httptape.sanitize.json`, `fixtures/`, `README.md`.

Modified (3):
- `src/index.ts` — replace smoke export.
- `package.json` — add `zod@^3` dep, `record:github` script.
- `tsconfig.json` — no changes expected.

Existing smoke test files may be replaced; preserve any unique assertions before deleting.

#### 9 — Factory signature

```ts
export type GithubAdapterDeps = {
  readonly config: GithubAdapterConfig;
  readonly httpClient?: HttpClient;   // injectable for tests
};

export declare const createGithubVcsProvider: (deps: GithubAdapterDeps) => VCSProvider;
```

Returns a `VCSProvider` whose `id === "github"`. Guards against non-`github` `PRIdentifier` early-return with `transport { detail: "wrong-vcs" }`.

### Affected workspaces

`packages/adapters/github/` only. Adds `zod@^3`. No reach into host/extension/other adapters.

### Test strategy

**`url.test.ts`** (≥6): happy; owner/repo encoding; trailing-slash normalization; port baseUrl; GitHub Enterprise.

**`errors.test.ts`** (≥6): 401/403/404/429/500 → `transport { status }`; status 0 → `transport` without status.

**`http.test.ts`** (≥4): HttpClient defaults asserted; timeout respected; `responseType: "text"`; no implicit JSON parse.

**`provider.test.ts`** with fake HttpClient (≥10):
1. Happy path: exactly one HTTP call to `/repos/owner/repo/pulls/123` with the diff Accept header.
2. **Diff-only binding**: HTTP call list contains ONLY the diff endpoint; no /files /commits /comments /reviews paths.
3. **No token in error payload**: simulated 401 → detail does NOT contain the token string.
4. 404, 401, 429, 5xx mappings.
5. Network failure → `transport` without status.
6. Body fails sniff → `malformed-response { detail: "not-unified-diff", raw }`.
7. Body > maxBytes → `malformed-response { detail: "diff-too-large: <bytes>" }`.
8. Empty body → `Ok("" as Diff)`.
9. Wrong-VCS guard: `fetchDiff({ kind: "ado", ... })` → `Err<transport { detail: "wrong-vcs" }>` without HTTP call.
10. `provider.id === "github"`.
11. Cancellation propagates as `Cancelled` (NOT manufactured).

**`contract.test.ts`** with httptape sidecar (≥5): real `HttpClient` against `localhost:<httptape-port>` with recorded fixtures. Same scenarios as 1, 4, 5, 6, 7 above. Skipped with explicit warn if httptape unavailable.

Coverage target: 80% on adapter; ≥95% on pure helpers.

### Consequences

- First real `VCSProvider`. Template for #47 (ADO).
- `monadyssey-fetch@2.0.1` API documented for future adapter ADRs.
- Diff-only invariant mechanically enforced.
- httptape sidecar pattern established; CI install tracked separately.
- 2 MiB ceiling defensible; revisit after dogfooding.
- One new runtime dep (`zod` in adapter; MIT, already on allowlist).
- Cancellation never manufactured into Err (ADR-10 + ADR-12).
- Reversibility high. Independent files for URL builder, error mapper, body sniff, provider factory.
- **Reviewer-binding**: (a) only diff endpoint hit (test #2); (b) no token in detail/raw (test #3); (c) Cancelled never Err (test #11); (d) 2 MiB ceiling enforced (test #7); (e) error mapping exhaustive (errors.test.ts).

---

## ADR-16: `QuizSession` aggregate in `core` as pure scoring functions composing `LLMProvider` + `VCSProvider`
**Date**: 2026-05-22
**Issue**: #38
**Status**: Accepted

### Context

M2's domain piece that ties LLMProvider (#33) and VCSProvider (#34) together: fetch diff, generate quiz, store correct answers, score submissions. The host dispatcher (#39) is thin wiring around this.

Three constraints collide: (1) ADR-4 forbids IO in core; (2) the ports the aggregate consumes return IO; (3) diff-only invariant must be type-enforced.

Four shapes considered:
- (a) Aggregate returns IO, extend the ports/** carve-out to quiz/ — defeats ADR-4.
- (b) Class with constructor-injected ports returning `Promise<Either<...>>` — bleeds Promises past the IO boundary.
- (c) **Pure functions** over Quiz + SubmittedAnswers; orchestration in host (#39) — selected.
- (d) Ref-based state machine — YAGNI; host has its own Map per ADR-13.

**Decision: (c).** Diff-only invariant remains type-encoded: Quiz already lacks a Diff (ADR-11); the aggregate has no slot to receive PR-derived text.

### Decision

#### 1. Aggregate — three pure functions

```ts
// packages/core/src/quiz/session.ts
import type { Either } from "monadyssey";
import { Left, Right } from "monadyssey";
import type { ChoiceId, QuestionId, Quiz } from "./quiz.js";

export type SubmittedAnswer = {
  readonly questionId: QuestionId;
  readonly chosenChoiceId: ChoiceId;
};

export type SubmittedAnswers = ReadonlyArray<SubmittedAnswer>;

export type AnswerKey = ReadonlyMap<QuestionId, ChoiceId>;

export type PerQuestionResult = {
  readonly questionId: QuestionId;
  readonly correct: boolean;
  readonly explanation?: string;
};

export type Score = {
  readonly correct: number;
  readonly total: number;
  readonly perQuestion: ReadonlyArray<PerQuestionResult>;
};

export type ScoreError =
  | { readonly kind: "unknown-question-id"; readonly questionId: QuestionId }
  | { readonly kind: "duplicate-question-id"; readonly questionId: QuestionId };

/** Extract correct-answer key from a Quiz. Pure. */
export const pickCorrectAnswers = (quiz: Quiz): AnswerKey;

/**
 * Score a submission against an answer key.
 * - Unanswered → counted incorrect.
 * - Unknown questionId → Left<unknown-question-id>.
 * - Duplicate questionId → Left<duplicate-question-id>.
 * - Wrong chosenChoiceId → correct: false (treated as not-the-right-answer).
 * - explanation is NOT populated here; caller attaches from original Quiz when building wire frame.
 */
export const scoreSubmission = (
  answerKey: AnswerKey,
  submitted: SubmittedAnswers,
): Either<ScoreError, Score>;

/** Pass iff correct/total >= threshold. Default 1.0 (100%). Total 0 → false. */
export const decidePassed = (score: Score, threshold?: number): boolean;
```

#### 2. Policy decisions (binding)

| Choice | Decision |
|---|---|
| Pass threshold v1 | 1.0 (100% correct); #49 may override via threshold parameter |
| Threshold representation | Fraction [0, 1], not absolute count |
| Unanswered question | Counted incorrect (wire allows partial submits per ADR-13) |
| Duplicate questionId in submission | `Left<duplicate-question-id>` (ambiguous intent) |
| Unknown questionId | `Left<unknown-question-id>` (stale UI / tampering / off-by-one) |
| Wrong chosenChoiceId (not in choices) | `correct: false` (treated as not-the-right-answer; no extra Quiz plumbing needed) |

`decidePassed`'s threshold is a parameter, not module state. No `process.env` lookups in the aggregate.

#### 3. Session state — NOT in the aggregate

Host owns `Map<QuizId, AnswerKey>` (ADR-13). Aggregate provides `pickCorrectAnswers` for insertion + `scoreSubmission` for lookup-and-score. No `SessionStore` port — YAGNI v1.

#### 4. Diff-only invariant (KEY DIFFERENTIATOR)

The aggregate consumes Quiz (no Diff per ADR-11) + SubmittedAnswers (only questionId + chosenChoiceId). Type-encoded: no slot exists for PR-derived text. A `expectTypeOf<Quiz>().not.toHaveProperty("diff" | "description" | "title" | "commits" | "comments")` test pins this at compile time.

### Affected workspaces

`packages/core` only. No new deps. No `eslint.config.js` change (`quiz/` is not in `ports/**`; the IO carve-out does NOT leak here).

### Types / Functions

Per §1. Three exported functions; no classes, no Ref, no globals.

### File layout

**New (2)**: `packages/core/src/quiz/session.ts`, `packages/core/src/quiz/session.test.ts`.

**Modified (1)**: `packages/core/src/index.ts` — add 6 type re-exports + 3 function re-exports.

No `quiz/index.ts` barrel (consistent with ADR-11).

### Sequence (informational — binding for #39's host dispatcher)

```
1. vcsProvider.fetchDiff(pr): IO<VCSProviderError, Diff>             [IO, host wires]
2. llmProvider.generateQuiz({ diff, questionCount }): IO<LLMProviderError, Quiz>  [IO, host wires]
3. pickCorrectAnswers(quiz) → AnswerKey                              [PURE — this ADR]
4. hostMap.set(quiz.id, answerKey)                                   [host state]
5. strip correctChoiceId, build QuizResponseFrame                    [host, per ADR-13]
... user answers ...
6. answerKey = hostMap.get(quizId); none → ErrorFrame                [host]
7. scoreSubmission(answerKey, answers): Either<ScoreError, Score>    [PURE — this ADR]
8. decidePassed(score) → passed                                       [PURE — this ADR]
9. hostMap.delete(quizId)                                             [host; no replay]
10. build QuizResultFrame { passed, correct, total, perQuestion }    [host, per ADR-13]
```

**Diff-flow audit**: Diff reaches LLM at step 2 only. The aggregate (steps 3/7/8) never sees the diff.

### Error cases

Per §2 policy. No `throw`. Functions are total over typed inputs.

### Test strategy

`packages/core/src/quiz/session.test.ts`:

- **`pickCorrectAnswers`** (3 cases): single-question, multi-question, key-order matches Quiz.questions order.
- **`scoreSubmission` happy** (5 cases): all correct; all wrong; mixed; partial submission (unanswered counted incorrect); single-question all-correct.
- **`scoreSubmission` errors** (3 cases): unknown questionId → Left<unknown-question-id>; duplicate questionId → Left<duplicate-question-id>; empty submission `[]` → defensive Right<Score{ correct: 0, total: N }>.
- **`decidePassed`** (6 cases): 100% + threshold 1.0 → true; less than 100% + threshold 1.0 → false; 0% + any threshold → false (unless 0); 80%+threshold 0.8 → true; 79%+threshold 0.8 → false; total 0 → false defensively.
- **Property test (1)**: monotonicity — flipping a wrong answer to correct can never decrease `decidePassed`. Use a hand-rolled generator with a small fixed quiz (no new dev-dep on fast-check yet).
- **Type-level invariant** (3 expectTypeOf cases): Quiz lacks diff/description/title/commits/comments; SubmittedAnswer is exactly `{ questionId, chosenChoiceId }`; AnswerKey preserves branded ID types.
- **Lint regression** (informational, pasted in PR Verification): adding `import { IO } from "monadyssey"` (value or type-only) to `quiz/session.ts` fails lint — the ports/** carve-out doesn't leak to `quiz/`.

Coverage target: 90% on core. Achievable with table-driven cases.

### Consequences

- Aggregate is pure. `core/src/quiz/` does NOT become a second IO carve-out zone. ADR-4 boundary preserved.
- Orchestration moves to host (#39). §Sequence is binding for #39 — dispatcher uses exactly this composition to preserve the diff-only audit trail.
- **Diff-only invariant gains a sixth enforcement layer** (ADR-13 listed five): aggregate has no parameter for non-diff text.
- Pass threshold is policy, not architecture. v1 hardcodes 1.0; #49 may override.
- Session storage stays host-side. No SessionStore port — YAGNI v1.
- No new deps. Hand-rolled property generator avoids fast-check for now.
- Reversibility high. If a v2 needs IO-returning aggregates, separate ADR can extend ports/** carve-out OR move composition to host fully.
- Security: aggregate is the single composition point that feeds the LLM (via #39's wiring). Keeping it pure + Quiz-only locks the diff-only invariant at the aggregate boundary. Reviewer for #39 verifies §Sequence is followed.
- Binding for #39 (must wire per §Sequence), #41 (consumes ADR-13 frames), #43 (modal). Extension never re-implements scoring.

---

## ADR-17: Service worker maintains a lazy native-messaging port and routes quiz frames via a correlation map
**Date**: 2026-05-22
**Issue**: #41
**Status**: Accepted

### Context

The MV3 service worker is the only process that can call `chrome.runtime.connectNative`. Content scripts need a request/response channel to the host via the SW. Wire format (ADR-7, ADR-13) is already discriminated-union + zod-validated; SW's job is two-way routing.

Three forces shape the design:
1. **MV3 SW lifecycle** — Chrome terminates idle SWs; in-memory state vanishes; `chrome.storage.session` is async + non-serializable for promise resolvers.
2. **CLAUDE.md per-package policy** — extension defaults plain TS + zod; monadyssey opt-in only. No monadyssey here.
3. **`chrome.*` testability** — push logic into pure helpers + dep-injected functions; Playwright (#51) covers integration.

PM open question resolved: in-memory correlation map; SW termination mid-flight = pending fails with `internal` on next wake. CS treats as transient.

### Decision

#### 1. Lazy port lifecycle

`createPortClient` exposes `sendFrame(frame): Promise<Frame>`. First call connects; subsequent reuse. `port.onDisconnect` drops the ref, drains pending with synthetic `ErrorFrame { reason: "internal", message: "host disconnected" }`. Next `sendFrame` re-connects.

Lazy over eager because eager doesn't preempt SW termination, can't save a round-trip, and spawns the host needlessly when user doesn't approve.

#### 2. In-memory correlation map with TTL

`Map<correlationId, { tabId, resolve, timer }>`. Per-request `setTimeout(timeoutMs)` defaults 60s; on timeout resolves with synthetic `ErrorFrame { reason: "internal", message: "host did not respond" }`. `correlationId`s via `crypto.randomUUID()`.

NOT persisted to `chrome.storage.session` — promise resolvers aren't serializable. Accepted v1 limitation: SW restart = pending lost; CS sees "extension context invalidated" → retry-able.

#### 3. CS↔SW protocol — reuse FrameSchema (option a)

```ts
// packages/extension/src/lib/cs-protocol.ts
export const CSRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("send-frame"), frame: FrameSchema }),
]);

export const CSResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("frame"), frame: FrameSchema }),
  z.object({
    kind: z.literal("sw-error"),
    reason: z.enum(["schema-violation", "internal"]),
    message: z.string().min(1),
  }),
]);
```

`sw-error` only for failures BEFORE a frame can be exchanged with host. Host-side failures (disconnect, timeout, host ErrorFrame) come back as `{ kind: "frame", frame: ErrorFrame }`. CS sees one error vocabulary.

Rationale for (a): CS already depends on `@lgtm-buzzer/protocol`; parallel SW↔CS protocol would duplicate types.

#### 4. Reconnect — drain map on disconnect

`port.onDisconnect`:
1. Log `chrome.runtime.lastError?.message`.
2. Drain map: resolve every pending with `ErrorFrame { reason: "internal", message: "host disconnected" }`.
3. Null port ref; next `sendFrame` re-connects.

No auto-retry loop. User-driven retry via modal.

#### 5. Frame validation both directions

- **CS → SW**: `CSRequestSchema.safeParse`. Invalid → `{ kind: "sw-error", reason: "schema-violation", message }`.
- **Host → SW** (`port.onMessage`): `FrameSchema.safeParse`. Invalid → log + drop. Don't synthesize ErrorFrame (no correlationId to attribute).

#### 6. Multi-tab concurrency

`correlationId` per request via `crypto.randomUUID()`. Map keyed by correlation id, stores `tabId` for logging. `sendResponse` is the actual delivery path; cross-tab confusion impossible by construction.

#### 7. Diff-only invariant — type-level

SW handles `Frame` opaquely; never reads `payload.diff` (doesn't exist on any frame per ADR-13) or PR text. Reviewer confirms no `frame.payload.*` access beyond `correlationId`.

### Affected workspaces

`packages/extension` only.

### Types

```ts
// correlation.ts
export type PendingRequest = {
  readonly correlationId: string;
  readonly tabId: number | undefined;
  readonly resolve: (frame: Frame) => void;
  readonly timer: ReturnType<typeof setTimeout>;
};

export type CorrelationMap = {
  readonly size: () => number;
  readonly add: (pending: PendingRequest) => void;
  readonly takeById: (correlationId: string) => PendingRequest | undefined;
  readonly drainAll: (reason: (correlationId: string) => Frame) => void;
};

export const createCorrelationMap = (): CorrelationMap;
```

```ts
// port.ts
export type HostPort = {
  readonly postMessage: (msg: unknown) => void;
  readonly onMessage: { readonly addListener: (cb: (msg: unknown) => void) => void };
  readonly onDisconnect: { readonly addListener: (cb: () => void) => void };
  readonly disconnect: () => void;
};

export type ConnectFn = () => HostPort;

export type PortClientDeps = {
  readonly connect: ConnectFn;
  readonly map: CorrelationMap;
  readonly now: () => number;
  readonly timeoutMs: number;        // default 60_000
  readonly logger?: { readonly warn: (msg: string, ctx?: Record<string, unknown>) => void };
};

export type PortClient = {
  readonly sendFrame: (frame: Frame, tabId?: number) => Promise<Frame>;
  readonly isConnected: () => boolean;
};

export const createPortClient = (deps: PortClientDeps): PortClient;
```

```ts
// router.ts
export type RouterDeps = { readonly portClient: PortClient; readonly logger?: ... };

export const createCSMessageHandler = (deps: RouterDeps): CSMessageHandler;
```

### File layout

**New (8)**:
- `src/lib/correlation.ts` + `.test.ts`
- `src/lib/cs-protocol.ts` + `.test.ts`
- `src/lib/port.ts` + `.test.ts`
- `src/lib/router.ts` + `.test.ts`

**Modified (1)**:
- `entrypoints/background.ts` — minimal wiring:

```ts
export default defineBackground(() => {
  const map = createCorrelationMap();
  const portClient = createPortClient({
    connect: () => chrome.runtime.connectNative(NATIVE_HOST_ID),
    map,
    now: () => Date.now(),
    timeoutMs: 60_000,
    logger: { warn: (msg, ctx) => console.warn(`[lgtm-buzzer:sw] ${msg}`, ctx ?? {}) },
  });
  chrome.runtime.onMessage.addListener(createCSMessageHandler({ portClient }));
});
```

Listener registered SYNCHRONOUSLY at top level (MV3 wake-on-message requirement).

### Sequence

1. CS detects Approve click; `parsePRIdentifier(url)`. Right → proceed.
2. CS generates `correlationId = crypto.randomUUID()`, builds `QuizRequestFrame`, calls `chrome.runtime.sendMessage({ kind: "send-frame", frame })`.
3. SW: `CSRequestSchema.safeParse`. Invalid → `sw-error`.
4. Handler: `portClient.sendFrame(frame, sender.tab?.id)`; returns `true` to keep channel open.
5. `sendFrame`: lazy-connect if needed, wire `onMessage`+`onDisconnect` once, set timer, `map.add`, `port.postMessage`.
6. Host processes, posts reply.
7. SW `onMessage`: `FrameSchema.safeParse`. Valid → `map.takeById(reply.correlationId)`. Present → clear timer, resolve.
8. Awaiting promise (step 4) resolves; handler `sendResponse({ kind: "frame", frame: reply })`.
9. CS receives reply via `sendMessage` callback. Branches on `frame.kind`.

Diff-flow audit: SW handles Frame opaquely; never reads `frame.payload.*` beyond `correlationId`.

### Error cases

| Failure | Surfaced to CS as |
|---|---|
| Malformed CS request | `{ kind: "sw-error", reason: "schema-violation" }` |
| Host disconnected (no host installed) | per-pending `ErrorFrame { reason: "internal", message: "host disconnected" }` |
| Host sends malformed bytes | dropped; awaiting times out → `internal` |
| Host never replies | `ErrorFrame { reason: "internal", message: "host did not respond" }` after `timeoutMs` |
| Unknown correlationId in reply | logged + dropped |
| SW restart mid-flight | Chrome surfaces "extension context invalidated" to CS |
| `crypto.randomUUID` unavailable | invariant violation (won't happen in MV3 SW) |

### Test strategy

**`correlation.test.ts`** (8 cases): add+take; missing id; timer cleared on take; drainAll; duplicate-id rejection; property test (3 cases hand-rolled).

**`port.test.ts`** (10 cases): lazy connect; reuse; round-trip; concurrent frames; disconnect mid-flight; reconnect; invalid host reply; timeout; sync `postMessage` throw → drain as disconnected; `tabId` preserved.

**`router.test.ts`** (6 cases): malformed CS; well-formed CS; handler returns `true`; resolution → `sendResponse`; ErrorFrame passed through unchanged; unknown CS kind → `sw-error`.

**`cs-protocol.test.ts`** (4 cases): CSRequest happy; reject unknown outer kind; CSResponse with ErrorFrame; reject sw-error with empty message.

NOT unit-tested: `chrome.runtime.connectNative` actually working; SW wake timing; cross-tab routing. Playwright (#51) covers these.

Coverage: pure helpers ~95%; port + router ~85%; entrypoint via Playwright.

### Consequences

- Lazy lifecycle is simplest correct choice; eager doesn't preempt termination.
- In-memory map is v1 floor; pending across SW restart = retry-able error.
- SW is pure pipe — doesn't interpret frame `kind`, doesn't access payload beyond correlationId.
- One wire vocabulary across extension boundary. Future "popup health" features extend CS↔SW envelope without touching wire format.
- No monadyssey in extension yet. Consistent with per-package policy.
- `sendFrame` returns `Promise<Frame>` and NEVER rejects — all failure encoded in ErrorFrame.
- No new runtime deps. `crypto.randomUUID` in MV3 SW; zod transitively from `@lgtm-buzzer/protocol`.
- Reversibility high. Swap to persisted correlation / eager connect / thinner CS↔SW protocol is an isolated change.
- Binding for #43 (modal): modal speaks Frame to SW via `chrome.runtime.sendMessage`. No new layer.
- Security: SW never logs frame payloads. Only `{ correlationId, kind }` reaches the dev console.

---

## ADR-18: Content script intercepts the GitHub PR Approve button via form-submit capture and a DOM-event bus to the modal
**Date**: 2026-05-22
**Issue**: #42
**Status**: Accepted

### Context

CS on `github.com/*/pull/*` stops Approve form submission, runs quiz round-trip through SW (ADR-17) and host, releases the original submit only on pass.

Three forces:
1. GitHub DOM unstable — class names churn. The wire-stable contract is the form's `name="pull_request_review[event]"` input with `value="approve"` (server-side parameter; cannot change without breaking GH's API).
2. GitHub Turbo/PJAX — navigation without reload; form lazy-mounts.
3. #42 ships before #43 modal — interceptor must work without modal code.

Plain TS + zod per per-package policy. No monadyssey.

### Decision

#### 1. Form-submit interception in capture phase

`document.addEventListener("submit", handler, { capture: true })`. Handler:
1. `event.target` is `HTMLFormElement`? Else return.
2. `new FormData(form, event.submitter)` — preserves submitter's `formaction`/`name=value` for replay.
3. `formData.get("pull_request_review[event]") !== "approve"` → return.
4. Module-scoped `approveBypass === true` → consume, return without preventDefault.
5. Else: `preventDefault()` + `stopPropagation()`, store `{ form, submitter }`, dispatch `lgtm-buzzer:quiz-request`.

Capture (not bubble) — GitHub installs bubble-phase handlers; we get first refusal.

`requestSubmit(submitter)` for replay, NOT `form.submit()` (which skips validation + listeners).

#### 2. Turbo navigation handling

Submit listener on `document` survives navigation. Two SPA events:
- `turbo:render` — clears stale pending; recomputes `detectPRPage(window.location.href)`.
- `turbo:before-visit` — drops in-flight pending; SW correlation map times out naturally.

Fallback: `MutationObserver` on `document.body` (`childList: true, subtree: false`) for GitHub deployments without Turbo events.

#### 3. CS emits CustomEvents — modal subscribes (decoupling #42 from #43)

Four namespaced events with zod-validated `detail`:

- `lgtm-buzzer:quiz-request` (CS→modal): `{ correlationId, pr, requestId }`.
- `lgtm-buzzer:quiz-result` (CS→modal): `{ requestId, outcome: discriminated union of "quiz-ready" | "quiz-passed" | "quiz-failed" | "error" }`.
- `lgtm-buzzer:quiz-submit` (modal→CS): `{ requestId, quizId, answers }`.
- `lgtm-buzzer:quiz-cancel` (modal→CS): `{ requestId }`.

`requestId` = controller per-Approve-click id (distinct from wire `correlationId`); modal needs stable id to bridge both frame pairs.

Pub/sub means #42 and #43 build independently and Playwright can assert via `fireEvent` / `waitFor`.

#### 4. Module-scoped bypass flag, NOT `window`

`let approveBypass = false;` at module scope in `quiz-flow.ts`. On `passed: true`:
1. Emit `quiz-result` with `outcome.kind = "quiz-passed"`.
2. `approveBypass = true`.
3. `pending.form.requestSubmit(pending.submitter ?? undefined)`.
4. Capture-phase listener fires synchronously, sees bypass, resets to `false`, returns without preventDefault.
5. GH's own handlers run; POST happens.

Module scope (not `window`) because:
- `window` properties visible to page JS — security hole.
- Module-scope = isolated-world CS isolation = page JS can't see it.
- Lifetime per page-load = exactly what we need.

Reset on `turbo:before-visit` defensively.

#### 5. Cancellation = drop state (v1)

`lgtm-buzzer:quiz-cancel` from modal → drop pending; no wire frame sent. SW's 60s timeout (ADR-17) cleans the host side. Acceptable for v1: host is local, no network cost, keeps CS protocol minimal. Future: `quiz-cancel` wire frame is an ADR-13 amendment if user feedback shows it matters.

#### 6. ADO defer

`detectPRPage` discriminates GitHub vs ADO. For #42, controller only activates GitHub-specific interceptor when `pr.kind === "github"`. ADO interceptor is a sibling file in a future issue (#48-area).

#### 7. Diff-only invariant — type-level + reviewer-enforced

CS reads ZERO PR text from DOM. Only:
- `window.location.href` (parsed by `parsePRIdentifier`).
- `form.elements` / `new FormData(form, submitter)` / `event.target` / `event.submitter` (form structure only — not PR content).

Reviewer grep gate: any addition under `lib/dom/**` that touches `.markdown-body`, `.commit-message`, `.timeline-comment`, `.js-issue-title`, or any PR-content selector fails review.

### Affected workspaces

`packages/extension` only.

### Types

```ts
// page-detection.ts
export const detectPRPage = (url: string): Either<UnsupportedURL, PRIdentifier>;
```

```ts
// dom-events.ts
export const QuizRequestEventDetailSchema = z.object({
  requestId: z.string().min(1),
  correlationId: z.string().min(1),
  pr: PRIdentifierSchema,
});

export const QuizResultEventDetailSchema = z.object({
  requestId: z.string().min(1),
  outcome: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("quiz-ready"), quiz: QuizDTOSchema }),
    z.object({ kind: z.literal("quiz-passed"), result: QuizResultPayloadSchema }),
    z.object({ kind: z.literal("quiz-failed"), result: QuizResultPayloadSchema }),
    z.object({ kind: z.literal("error"), reason: ErrorReasonSchema, message: z.string().min(1) }),
  ]),
});

export const QuizSubmitEventDetailSchema = z.object({
  requestId: z.string().min(1),
  quizId: z.string().min(1),
  answers: z.array(SubmittedAnswerSchema).min(1),
});

export const QuizCancelEventDetailSchema = z.object({
  requestId: z.string().min(1),
});

export const DOM_EVENTS = {
  quizRequest: "lgtm-buzzer:quiz-request",
  quizResult: "lgtm-buzzer:quiz-result",
  quizSubmit: "lgtm-buzzer:quiz-submit",
  quizCancel: "lgtm-buzzer:quiz-cancel",
} as const;
```

```ts
// approve-intercept.ts
export type ApproveBlockedEvent = {
  readonly form: HTMLFormElement;
  readonly submitter: HTMLElement | null;
  readonly pr: PRIdentifier;
};

export type ApproveInterceptorDeps = {
  readonly doc: Document;
  readonly getCurrentPR: () => PRIdentifier | null;
  readonly shouldBypass: () => boolean;
  readonly onBlocked: (e: ApproveBlockedEvent) => void;
};

export const setupApproveInterceptor = (deps: ApproveInterceptorDeps): (() => void);
```

```ts
// quiz-flow.ts
export type SendFrameFn = (frame: Frame) => Promise<Frame>;

export type QuizFlowDeps = {
  readonly doc: Document;
  readonly sendFrame: SendFrameFn;
  readonly newCorrelationId: () => string;
  readonly newRequestId: () => string;
  readonly logger?: { readonly warn: (msg: string, ctx?: Record<string, unknown>) => void };
};

export const createQuizFlowController = (deps: QuizFlowDeps): QuizFlowController;
```

### File layout

**New (10)**:
- `src/lib/dom/page-detection.ts` + `.test.ts`
- `src/lib/dom/approve-intercept.ts` + `.test.ts`
- `src/lib/dom/dom-events.ts` + `.test.ts`
- `src/lib/dom/quiz-flow.ts` + `.test.ts`
- `src/lib/dom/index.ts` (barrel)
- `vitest.config.ts` — split env: node default, jsdom for `src/lib/dom/**`.

**Modified (2)**:
- `entrypoints/content.ts` — wire `createQuizFlowController`.
- `package.json` — add `jsdom` to devDependencies (MIT).

### Sequence

1. wxt loads CS on `*://github.com/*` and `*://dev.azure.com/*`. `runAt: "document_idle"`.
2. `main()` constructs controller, `start()`:
   - `detectPRPage(window.location.href)`. Left → idle but listeners stay.
   - Capture-phase submit listener on `document`.
   - `turbo:before-visit`, `turbo:render` listeners.
   - `MutationObserver` on `document.body` (Turbo fallback).
   - `lgtm-buzzer:quiz-submit` and `:quiz-cancel` listeners.
3. User clicks Approve → submit fires → handler: preventDefault, stopPropagation, store pending, dispatch `quiz-request`.
4. In parallel, `sendFrame(QuizRequestFrame)` awaits.
5. SW routes to host (ADR-17), returns reply.
6. Reply branches:
   - `QuizResponseFrame` → store `quizId`; dispatch `quiz-result { outcome: "quiz-ready" }`.
   - `ErrorFrame` → dispatch `quiz-result { outcome: "error" }`; drop pending.
7. User answers. Modal dispatches `lgtm-buzzer:quiz-submit`.
8. Controller listens → find pending by requestId, `sendFrame(QuizSubmitFrame)`.
9. Reply branches:
   - `passed: true`: dispatch `quiz-passed` event, set bypass, `requestSubmit(submitter)`, drop pending.
   - `passed: false`: dispatch `quiz-failed`, drop pending.
   - `ErrorFrame`: dispatch `error`, drop pending.
10. Modal close → `quiz-cancel` → drop pending. SW times out naturally.
11. `turbo:before-visit` → drop all pending; reset bypass.
12. `turbo:render` → recompute PR; if not a PR URL, controller idles.

**Diff-flow audit**: only PR-derived data on the wire is `PRIdentifier` (coordinates only). No DOM scraping of PR description/title/commits/comments.

### Error cases

| Failure | Surfaced |
|---|---|
| URL parse fails | Controller idles; no UI |
| Non-Approve review action | Handler returns; normal submit |
| `sendFrame` throws (context invalidated) | Synthetic `ErrorFrame { reason: "internal" }`; modal shows error |
| SW `sw-error` reply | Wrapped as synthetic ErrorFrame |
| Reply wrong kind | Logged; `error` outcome dispatched; pending dropped |
| `quiz-submit` for unknown requestId | Logged + dropped (modal is gone) |
| Malformed event detail | Logged; `error` if recoverable, else dropped |
| `requestSubmit` throws | Caught; `error` outcome |
| Bypass flag stuck | Defensive reset on `turbo:before-visit` |

No throws on expected paths. Only `throw` is invariant assertion for missing `crypto.randomUUID` (impossible in MV3).

### Test strategy

All `src/lib/dom/**` tests under jsdom env.

**`page-detection.test.ts`** (4 cases): GitHub URL; ADO URL; GitHub issues; non-https.

**`dom-events.test.ts`** (6 cases): emit dispatches; listener fires + dispose; malformed detail rejected; requestId round-trips; multiple listeners; event name constants.

**`approve-intercept.test.ts`** (10 cases, jsdom):
- Approve-form submit → onBlocked + preventDefault.
- Non-Approve review action → no onBlocked.
- Non-review form → ignored.
- `getCurrentPR()` null → early-return.
- `shouldBypass()` true → early-return without preventDefault.
- Capture phase: bubble-phase listener sees `defaultPrevented === true`.
- `event.submitter` passed through.
- `dispose()` removes listener.
- Form mounted AFTER setup → still intercepted (document-level listener).
- Nested form → no double-fire.

**`quiz-flow.test.ts`** (12 cases, jsdom, fake sendFrame):
- Happy path GitHub: Approve → request → ready → submit → passed → requestSubmit called.
- Failed quiz: form NOT re-submitted; bypass stays false.
- ErrorFrame on QuizRequest: error event; pending dropped.
- ErrorFrame on QuizSubmit: error event; form NOT submitted.
- `sw-error` from SW: wrapped as ErrorFrame; error event.
- `sendFrame` rejection: error event with `reason: "internal"`.
- `quiz-cancel` mid-flight: pending dropped; late reply logged + ignored.
- `turbo:before-visit`: clears bypass + pending.
- `turbo:render` to non-PR: controller idles.
- Two concurrent Approve clicks (defensive): two distinct requestIds; one's pass doesn't replay other's form.
- `crypto.randomUUID` via injected deps (tests use counter).
- **Diff-only invariant**: `quiz-request.detail.pr` carries only coordinate fields.

NOT unit-tested (deferred to Playwright #51): real `chrome.runtime.sendMessage`; real `turbo:render`; real `requestSubmit` POST; SW restart; visual modal verification.

Coverage: ~90% on `src/lib/dom/**`.

### Consequences

- Selector resilience: form-submit on `pull_request_review[event]` is the most stable contract GitHub offers (server-side API parameter).
- Decoupled modal: #43 ships independently; integration via event protocol.
- No global `window` state. Bypass flag in CS isolated world.
- No new runtime deps. `jsdom` is dev-only (MIT). `crypto.randomUUID` in MV3.
- ADO deferred: detectPRPage already discriminates; future ADO interceptor is a sibling file.
- Cancellation best-effort: v1 lets host quiz generation continue after modal close (SW timeout cleans up).
- Diff-only invariant type-enforced. Reviewer grep gate on PR-content selectors codifies this.
- Reversibility high. All five concerns in separate files. Swapping intercept strategy is one file's change.

---

## ADR-19: Playwright e2e for the happy-path quiz gate, with a stubbed SW native channel
**Date**: 2026-05-22
**Issue**: #51
**Status**: Accepted

### Context

End-of-M2 acceptance gate. Wire layer + host + LLM are already exhaustively unit-tested (ADRs 7/8/13/14/15/17); only browser-side surface (real Chrome MV3 loading, real DOM submit capture, real CustomEvent bus, real modal render, real bypass replay) needs e2e. Stub the SW's native channel to keep tests deterministic + cheap.

### Decision

Single Playwright happy-path spec under `packages/extension/e2e/`. Persistent-context Chromium with `--load-extension`. SW's `chrome.runtime.connectNative` replaced via `addInitScript` with a stub returning canned `Frame` responses. Static HTML fixture at `https://github.com/owner/repo/pull/1` served via `page.route`. Gated behind `npm run test:e2e` (NOT part of `npm run check`).

#### 1. Playwright config

- `@playwright/test` (MIT) devDep. Chromium only.
- `npm run test:e2e:install` for `playwright install chromium` (not in `postinstall`).
- `npm run test:e2e` for the run. NOT in root `check`.
- `e2e/playwright.config.ts`: single chromium project, headless, `trace: "on-first-retry"`, single worker, 30s timeout.

#### 2. Browser launch

`chromium.launchPersistentContext(userDataDir, { args: [--load-extension, --disable-extensions-except, --no-sandbox], headless: true })`. Spec asserts `.output/chrome-mv3/` exists first; clear "run npm run build first" message if missing.

#### 3. SW stub via `addInitScript`

Stub replaces `browser.runtime.connectNative` BEFORE extension code runs. Sets a `globalThis.__LGTM_E2E_STUB__` marker; spec awaits SW + marker before clicking.

Stub behavior:
- `postMessage(quiz-request)` → microtask → `onMessage(QuizResponseFrame with canned quiz)`.
- `postMessage(quiz-submit)` → score against canned correct-answer map → `onMessage(QuizResultFrame { passed })`.
- `ping` → synthetic `pong`.
- anything else → `ErrorFrame { reason: "internal" }`.

Stub duplicates minimal Frame shape inline (no `core`/`protocol` import inside the addInitScript string). Setup-time assertion: `parseFrame(cannedFrame)` returns `success: true` to catch drift.

#### 4. PR fixture

`e2e/fixtures/github-pr.html` — minimal form with hidden `<input name="pull_request_review[event]" value="approve">` and an Approve submit button. Bubble-phase submit listener sets `body[data-form-submitted="true"]` (the assertion target).

Served via `page.route("https://github.com/owner/repo/pull/1", fulfill(html))`. No real network.

#### 5. Canned quiz + correct answers

```ts
const cannedQuiz = { id: "e2e-quiz-1", questions: [
  { type: "multiple-choice", id: "q1", prompt: "Which file was modified?",
    choices: [{ id: "c1", label: "src/foo.ts" }, { id: "c2", label: "src/bar.ts" }] },
  { type: "multiple-choice", id: "q2", prompt: "What did the change add?",
    choices: [{ id: "c1", label: "A bug" }, { id: "c2", label: "A feature" }] },
]};
const correctAnswers = { q1: "c1", q2: "c2" };
```

#### 6. Spec flow

```ts
test("happy path: approve gates on quiz, opens on correct answers", async () => {
  await assertBuiltExtension(extensionDir);
  const context = await chromium.launchPersistentContext(userDataDir, {...});
  await context.addInitScript({ content: buildSwStubScript(cannedQuiz, correctAnswers) });
  const sw = await context.waitForEvent("serviceworker");
  const page = await context.newPage();
  await page.route("https://github.com/owner/repo/pull/1", route =>
    route.fulfill({ contentType: "text/html", body: fixtureHtml }));
  await page.goto("https://github.com/owner/repo/pull/1");
  await page.click("#approve-btn");
  await page.waitForSelector("[data-testid='lgtm-buzzer-quiz-modal']");
  expect(await page.getAttribute("body", "data-form-submitted")).toBeNull();
  await page.click("[data-question='q1'] [data-choice='c1']");
  await page.click("[data-question='q2'] [data-choice='c2']");
  await page.click("[data-testid='lgtm-buzzer-quiz-submit']");
  await page.waitForSelector("body[data-form-submitted='true']");
});
```

#### 7. Modal data-testid contract (binding)

The dev for #51 adds these attributes to `dom/modal.ts`:

| Element | Attribute |
|---|---|
| Modal root | `data-testid="lgtm-buzzer-quiz-modal"` |
| Each question container | `data-question="<questionId>"` |
| Each choice radio | `data-choice="<choiceId>"` within the question container |
| Submit button | `data-testid="lgtm-buzzer-quiz-submit"` |
| Cancel button | `data-testid="lgtm-buzzer-quiz-cancel"` |

Inert (no JS reads them); zero security/a11y cost. Modal unit test gets one assertion confirming presence.

#### 8. ESLint override for `e2e/**`

```js
{
  files: ["packages/extension/e2e/**/*.ts"],
  rules: { "no-restricted-imports": "off", "no-default-export": "off" },
}
```

Narrow — `node:*` / default-export bans lifted only for `e2e/**`. Browser-side bans for `entrypoints/**` and `src/**` unchanged.

#### 9. Type-check integration

`e2e/tsconfig.json` extends extension's tsconfig; `types: ["node"]`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `noEmit: true`. Playwright's loader catches errors at test time. NOT in `npm run typecheck:tests`.

### Affected workspaces

`packages/extension` only.

### Types

```ts
// e2e/sw-stub.ts
export type CannedQuiz = { id: string; questions: Array<{ type: "multiple-choice"; id: string; prompt: string; choices: Array<{ id: string; label: string }> }> };
export type CannedCorrectAnswers = Readonly<Record<string, string>>;

export const buildSwStubScript = (
  quiz: CannedQuiz,
  correctAnswers: CannedCorrectAnswers,
): string;
```

### File layout

**New (6)**:
- `e2e/playwright.config.ts`
- `e2e/quiz-happy-path.spec.ts`
- `e2e/sw-stub.ts`
- `e2e/fixtures/github-pr.html`
- `e2e/tsconfig.json`
- `e2e/.gitignore`

**Modified (3)**:
- `packages/extension/package.json` — @playwright/test devDep + `test:e2e` + `test:e2e:install` scripts.
- `packages/extension/src/lib/dom/modal.ts` — add data-testid contract per §7.
- `eslint.config.js` — `e2e/**` override per §8.

### Sequence

1. Spec assert build artifact exists.
2. Launch persistent context with extension.
3. `addInitScript` with stub.
4. Wait for `serviceworker` event + stub marker.
5. Create page, route GitHub URL to fixture, navigate.
6. Click Approve → CS captures, dispatches `lgtm-buzzer:quiz-request`.
7. CS `sendFrame` → SW → stub → canned `QuizResponseFrame`.
8. Controller dispatches `lgtm-buzzer:quiz-result { outcome: "quiz-ready" }`.
9. Modal renders questions.
10. Spec answers via data-question/data-choice selectors.
11. Modal `lgtm-buzzer:quiz-submit`.
12. Controller `sendFrame(QuizSubmitFrame)` → stub → canned `QuizResultFrame { passed: true }`.
13. Controller sets bypass, `requestSubmit(submitter)`.
14. Bypass-flagged capture handler returns without preventDefault.
15. Fixture's bubble-phase listener sets `body[data-form-submitted="true"]`.
16. Spec asserts. Test passes.

### Error cases

| Failure | Surfaced |
|---|---|
| `.output/chrome-mv3/` missing | `assertBuiltExtension` throws "Run npm run build first" |
| `addInitScript` race | Spec waits for `serviceworker` event + `__LGTM_E2E_STUB__` marker |
| Modal selectors drift | `waitForSelector` times out at 30s |
| Playwright Chromium not installed | `test:e2e:install` script |
| Canned frame shape drifts from protocol | Setup-time `parseFrame` round-trip assertion |

### Test strategy

This IS the test strategy artifact for end-of-M2 gate. One happy-path spec.

Deferred to M3 #53 follow-ups: wrong answers, modal cancel, ErrorFrame paths, ADO coverage, multi-LLM, visual regression, real-host integration variant.

Runtime budget: <60s. Achievable (~5-10s dev hardware, ~15-25s CI cold-start).

### Consequences

- Wire integration empirically tested end-to-end without real host. Native messaging framing bugs still rely on host contract tests.
- Modal data-testid contract is binding from now on. Modal refactors must preserve attributes.
- Developer must `npm run build` before `npm run test:e2e`. Fails fast with clear message.
- Playwright Chromium download (~150 MB) gated behind explicit install script.
- No new runtime deps. @playwright/test is dev-only (MIT).
- Diff-only invariant unaffected (stub generates canned quiz from zero input; no LLM invoked).
- Reversibility high. A future "real host" variant can coexist as a sibling spec.
- Security: no real github.com, no credentials, no network egress, no LLM calls. Stub never bundled into production.

---

## End-of-M2 summary — 2026-05-22

M2 ("First vertical slice — Chrome + claude-cli + GitHub") complete. All 14 issues closed (#32–#44 + #51 pulled forward + #62 ADR-10 clarification).

**Architecture**: 11 new ADRs (ADR-9 spawnIO → ADR-19 Playwright e2e). Type-enforced diff-only invariant at four layers (port return type, identifier shape, TSDoc, reviewer grep gates). Logger redaction backstop. CS isolated-world for the bypass flag (page JS can't see it). Form-submit interception in capture phase (resilient to GitHub DOM churn). Pure aggregate composing IO ports without `IO` runtime usage in `core`.

**Key primitives shipped**:
- `spawnIO` (adapter-shared) — SIGTERM→5s→SIGKILL choreography, `IO<SpawnError, SpawnOutput>`.
- `LLMProvider` / `VCSProvider` ports in core (type-only IO carve-out scoped to `ports/**`).
- `Quiz` / `MultipleChoiceQuestion` / branded IDs / `LLMProviderError` / `VCSProviderError`.
- `parsePRIdentifier(url)` for both GitHub and ADO URLs.
- `FrameSchema` extended with quiz-request/-response/-submit/-result; `unknown-quiz-id` ErrorReason.
- claude-cli adapter (stdin-only diff, JSON-output envelope, prompt-injection-safe SYSTEM prompt).
- github adapter (single-endpoint diff fetch, httptape contract tests, 2 MiB cap).
- QuizSession pure scoring functions (no IO in core).
- Host dispatcher composing IO ports per ADR-16 §Sequence.
- Native-messaging manifest installer (macOS + Linux).
- MV3 service worker with lazy port + correlation map.
- Content script form-submit capture + DOM-event bus.
- Vanilla-DOM quiz modal in Shadow DOM.
- Getting-started walkthrough.
- Playwright happy-path e2e with SW-stub.

**Final state**: 70-ish files net new across the workspace tree. `npm run check` green (build + 406+ tests + lint + typecheck:tests). `npm run test:e2e` green on dev hardware (~1.7s). End-to-end product not yet usable (no codex/copilot/ADO; UX is minimum viable; no CI workflow yet) — those are M3 scope.

**Carry-forward notes for M3**:
- The wire format reserves `kind: "free-text"` discriminant slot but only `multiple-choice` is implemented.
- `Cancelled` runtime outcome at monadyssey@2.0.1 is the canonical cancellation surface (ADR-10) — adapters never manufacture `Err<cancelled>`.
- The httptape sidecar pattern from ADR-15 generalizes to ADO (#47).
- The content-script DOM-event bus from ADR-18 generalizes to ADO interceptor (#48).
- The modal data-testid contract from ADR-19 §7 is binding for any future modal redesign.

Onward to M3.

---

## ADR-20: Second `LLMProvider` — `claude-api` adapter calling Anthropic Messages API via `monadyssey-fetch` with prompt caching
**Date**: 2026-05-22
**Issue**: #59
**Status**: Accepted

### Context

Users with Anthropic API key but no `claude` CLI cannot use LGTM-Buzzer. CLI users miss prompt caching's cost reduction on quiz regeneration. M3 adds an HTTP-based LLMProvider.

### Decision

#### 1. monadyssey-fetch HttpClient (NOT @anthropic-ai/sdk)

Per CLAUDE.md idiom #5. SDK rejected: would bring transitive deps, second retry mechanism fighting Schedule (idiom #3), Promise→IO shim at every call site.

#### 2. Endpoint and request shape

```
POST https://api.anthropic.com/v1/messages
Headers: x-api-key, anthropic-version: 2023-06-01, anthropic-beta: prompt-caching-2024-07-31
Body: {
  model, max_tokens: 4096,
  system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: [{ type: "text", text: USER_MESSAGE_WITH_DIFF, cache_control: { type: "ephemeral" } }] }]
}
```

Two ephemeral cache blocks (system + diff). Regeneration on same PR within ~5min is mostly cache hits. **Diff-only invariant**: body constructed ONLY from SYSTEM_PROMPT, questionCount, diff, model. Canary test asserts.

#### 3. Re-use SYSTEM_PROMPT via _shared extraction

Extract SYSTEM_PROMPT + `buildUserMessage` from `claude-cli/prompt.ts` to `_shared/prompt.ts`; re-export from claude-cli for backwards compat. Single source of truth; eval suite (#52) calibrated against one constant. `buildPrompt` (CLI stdin composer) stays in claude-cli.

`buildMessagesPayload(diff, questionCount, model, maxTokens)` — exactly 4 parameters; adding a 5th PR-derived parameter requires ADR amendment.

#### 4. Response parsing — extract to _shared/quiz-from-text.ts

```ts
export const AnthropicMessageEnvelopeSchema = z.object({
  type: z.literal("message"),
  role: z.literal("assistant"),
  content: z.array(z.union([
    z.object({ type: z.literal("text"), text: z.string().min(1) }),
    z.object({ type: z.string() }).passthrough(),  // tolerant of future block types
  ])).min(1),
  stop_reason: z.enum(["end_turn", "max_tokens", "stop_sequence", "tool_use"]).nullable().optional(),
});
```

Pipeline:
1. Validate envelope. Fail → `malformed-response`.
2. Find first text block. None → `malformed-response`.
3. Strip markdown fences.
4. `JSON.parse` → `LlmQuizSchema` (from _shared).
5. Cross-check `correctChoiceIndex < choices.length`.
6. Empty questions → `malformed-response`.
7. Map to Quiz via injected IdGenerator.

Extract steps 3-7 to `_shared/quiz-from-text.ts` as `parseQuizFromText(text, ids)`. Both claude-cli and claude-api call it.

#### 5. API key — factory dep at construction

```ts
export type ClaudeApiConfig = {
  readonly apiKey: string;
  readonly model?: AnthropicModel;       // default "claude-sonnet-4-7"
  readonly baseUrl?: string;              // default "https://api.anthropic.com"
  readonly timeoutMs?: number;            // default 60_000
  readonly maxTokens?: number;            // default 4096
  readonly retry?: { recurs; factor; delay };  // default { 3, 2, 500 }
};
```

- Adapter does NOT read env vars or filesystem.
- v1 host wiring uses env var `LGTM_BUZZER_ANTHROPIC_KEY`.
- v2 (post-#49/#50): extension options page sends config-set wire message.
- API key sent ONLY as `x-api-key` header.
- **NEVER** in `detail`, `raw`, log bindings, or wire messages back to extension.
- Extend ADR-6 redaction list with `x-api-key`, `anthropic-api-key`.

#### 6. Model selection — closed union

```ts
export type AnthropicModel =
  | "claude-sonnet-4-7"
  | "claude-opus-4-7"
  | "claude-haiku-4-5";
```

Closed (not free string) to prevent typos. Default `claude-sonnet-4-7`.

#### 7. Retry policy — Schedule.retryIf

```ts
const isRetryable = (err: LLMProviderError): boolean =>
  err.kind === "transport" &&
  (err.status === undefined || err.status === 429 || err.status === 529);

const policy = new Schedule({
  recurs: config.retry?.recurs ?? 3,
  factor: config.retry?.factor ?? 2,
  delay:  config.retry?.delay  ?? 500,
});
const retried = policy.retryIf(httpCallIO, isRetryable, liftToProviderError);
```

Retry: 429, 529, network (status 0). NOT: 400, 401, 403, 404, 5xx ≠ 529, malformed-response, timeout. AbortSignal propagates → Cancelled runtime outcome.

#### 8. Per-request timeout via HttpClient

`HttpClient` constructor's `timeout` field set to `config.timeoutMs`. Exhausted timeout surfaces as `HttpError status: 0` with rawMessage matching `/timeout|aborted/i`; mapped to `LLMProviderError.timeout { afterMs: timeoutMs }`. Best-effort introspection documented as limitation.

#### 9. Error mapping

| Source | LLMProviderError | Retryable? |
|---|---|---|
| HttpError.status 0, rawMessage non-timeout | `transport { detail }` | yes |
| HttpError.status 0, rawMessage timeout-like | `timeout { afterMs }` | no |
| 400/401/403/404 | `transport { status, detail }` | no |
| 429 | `transport { status: 429, detail }` | **yes** |
| 5xx ≠ 529 | `transport { status, detail }` | no |
| 529 | `transport { status: 529, detail }` | **yes** |
| Envelope fail | `malformed-response { detail, raw }` | no |
| LlmQuizSchema fail | `malformed-response` | no |
| OOB correctChoiceIndex | `malformed-response { detail: "correctChoiceIndex out of range" }` | no |
| Empty questions | `malformed-response { detail: "empty-quiz" }` | no |
| Caller cancels | `Cancelled` runtime (NEVER `Err`) | n/a |

`raw` clipped 8 KiB. Reviewer-enforced: API key NEVER in `detail` or `raw`.

### Affected workspaces

- `packages/adapters/claude-api/` — new (all files + fixtures).
- `packages/adapters/_shared/` — extract `SYSTEM_PROMPT`, `LlmQuizSchema`, `parseQuizFromText`, `IdGenerator`, `clipRaw` to new files.
- `packages/adapters/claude-cli/` — modified: re-import/re-export from `_shared` (public API unchanged).

NO changes to core, protocol, extension, host (host wiring is separate).

### Types

```ts
export type AnthropicModel = "claude-sonnet-4-7" | "claude-opus-4-7" | "claude-haiku-4-5";

export type ClaudeApiConfig = {
  readonly apiKey: string;
  readonly model?: AnthropicModel;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxTokens?: number;
  readonly retry?: { readonly recurs: number; readonly factor: number; readonly delay: number };
};

export type ClaudeApiDeps = {
  readonly config: ClaudeApiConfig;
  readonly httpClient?: HttpClient;
  readonly ids?: IdGenerator;
};

export declare const createClaudeApiProvider: (deps: ClaudeApiDeps) => LLMProvider;
```

### File layout

**New in claude-api/** (12):
- `src/provider.ts` + `.test.ts`
- `src/http.ts` + `.test.ts`
- `src/prompt.ts` + `.test.ts` — `buildMessagesPayload`, `AnthropicModel`.
- `src/response.ts` + `.test.ts` — `AnthropicMessageEnvelopeSchema`, `parseAnthropicResponse`.
- `src/errors.ts` + `.test.ts` — `mapHttpError`.
- `src/index.ts` — barrel.
- `src/contract.test.ts` — httptape-backed.
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `vitest.globalSetup.ts`, `httptape.sanitize.json`, `fixtures/`, `README.md`.

**Refactored in _shared/**:
- `src/prompt.ts` (new) — `SYSTEM_PROMPT`, `buildUserMessage`.
- `src/quiz-from-text.ts` (new) — `LlmQuizSchema`, `parseQuizFromText`, `CODE_FENCE_RE`, `MAX_RAW_BYTES`, `clipRaw`.
- `src/ids.ts` (new) — `IdGenerator`, `defaultIdGenerator`.
- `src/index.ts` — barrel additions.
- `package.json` — adds `zod`.

**Modified in claude-cli/**:
- `src/prompt.ts`, `response.ts`, `ids.ts` — re-import from `_shared`; re-export for backwards compat; public API unchanged.

### Sequence

1. `buildMessagesPayload(diff, questionCount, model, maxTokens)` → MessagesRequestBody (pure).
2. `client.post("/v1/messages", body, { observe: "response", responseType: "json" })` → `IO<HttpError, Response>`.
3. Wrap in `Schedule.retryIf(io, isRetryable, liftE)` for 429/529/status-0.
4. Success: `response.json()` → `parseAnthropicResponse(json, ids)` → `Either<LLMProviderError, Quiz>`.
5. HttpError: `mapHttpError(err)` → `LLMProviderError`.
6. Cancel: AbortSignal aborts in-flight fetch + retry delay → `Cancelled` runtime.

**Diff-flow audit**: diff appears only in step 1's body construction + step 2's JSON-serialized HTTPS body. Never in argv (no subprocess), errors, logs, retry decisions.
**API-key-flow audit**: key read once at step 2 (header). Never in returns, errors, logs, or any other path.

### Test strategy

**`prompt.test.ts`** (≥10): happy; 4-param signature; model/maxTokens fields; cache_control on system; cache_control on diff block; diff only in `<DIFF>…</DIFF>` (canary `PR_DESCRIPTION_LEAK` doesn't leak); count interpolation; SYSTEM_PROMPT identity; each AnthropicModel value round-trips.

**`response.test.ts`** (≥10): happy; markdown fences; envelope fail; no text block; invalid JSON; LlmQuizSchema fail; OOB index; empty questions; raw clipped; explanation optional; tolerant of unknown block types.

**`errors.test.ts`** (≥10): each row in §9; reviewer-binding API key never in detail.

**`http.test.ts`** (≥6): HttpClient defaults; x-api-key header; anthropic-version + beta headers; custom baseUrl; timeoutMs respected.

**`provider.test.ts`** with fake HttpClient (≥12):
1. Happy: 1 POST to /v1/messages, body shape correct, cache markers present.
2. **Diff-only binding**: canary markers only in `<DIFF>…</DIFF>`.
3. **API key not in errors**: 401 sim → detail does NOT contain key string.
4. Retry on 429: 2 calls, succeed.
5. Retry on 529: same.
6. Retry on status 0 (network): same.
7. No retry on 401/400: 1 call, error.
8. Retry budget exhausted: 4 calls.
9. Cancellation: fake Cancelled → adapter propagates Cancelled (NOT Err).
10. Custom model respected.
11. Default model `claude-sonnet-4-7`.
12. `provider.id === "claude-api"`.

**`contract.test.ts`** with httptape (≥7): same scenarios via real HttpClient against fixtures. Skip warn if httptape unavailable.

Coverage: 80% adapter, ≥95% pure helpers.

### Consequences

- Second LLMProvider, first HTTP-based. Template for future API adapters (OpenAI, Gemini).
- `_shared` extraction consolidates SYSTEM_PROMPT, LlmQuizSchema, parseQuizFromText, IdGenerator. Eval suite (#52) calibrated against one prompt constant.
- Prompt caching ON by default. Material cost reduction on regeneration. User-visible carrot.
- No new runtime deps (zod, monadyssey, monadyssey-fetch already in workspace).
- API key transport host-config-only. v1 env var; v2 (post #49/#50) wire message.
- Retry policy bounded ~247.5s max wall-clock.
- Per-request timeout introspection best-effort (monadyssey-fetch limitation documented).
- `Cancelled` semantics preserved (ADR-10).
- Closed model union requires ADR amendment for new Anthropic models.
- ADR-6 redaction list extended (`x-api-key`, `anthropic-api-key`).
- Reversibility high: 6 small files in claude-api, 3 small in _shared. SDK switch is one file's swap.
- Binding for reviewer: (a) 4-param `buildMessagesPayload` + canary; (b) API key never in errors/logs; (c) Cancelled never manufactured; (d) retry only 429/529/status-0; (e) cache_control markers on both blocks; (f) `provider.id === "claude-api"`.

---

## ADR-21 (2026-05-22): ADO content script — Vote-button interception, defensive selectors, manifest patterns
**Date**: 2026-05-22
**Issue**: #48
**Status**: Accepted

### Context

The GitHub content script (ADR-18) intercepts the Approve form via a capture-phase `submit` listener bound on a stable server-side hidden input (`pull_request_review[event]="approve"`). Azure DevOps does not give us that lever. ADO is a single-page application; the "Vote" action is a button-click that fires a JS handler which calls the ADO REST API directly — no `<form action="...">`, no submit event.

This story extends the existing CS to ADO PR pages, reusing every host-agnostic helper from ADR-18 (`page-detection`, `dom-events`, `quiz-flow` orchestration, `modal`) and replacing only the platform-specific interception primitive. The diff-only invariant (CLAUDE.md §Key differentiator) is preserved — the CS reads zero PR text from the ADO DOM; only `window.location.href` and the click target.

Three forces shape this ADR:

1. **No form, only a button click.** ADO renders the Vote control as a dropdown button. The action fires through a click handler bound by ADO's SPA framework, not via form submission. ADR-18's submit-capture approach cannot be lifted.
2. **DOM volatility.** ADO ships UI changes more aggressively than GitHub. A single CSS-class selector is fragile. We need a layered selector strategy (data-testid → aria-label → text content) with the most stable layer first.
3. **Two URL hosts.** Modern ADO (`dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`) and legacy (`{org}.visualstudio.com/{project}/_git/{repo}/pullrequest/{id}`). The core URL parser (`parsePRIdentifier` in `packages/core/src/ports/vcs-provider.ts`) already handles both — the manifest match patterns must too.

Plain TS + zod per the per-package policy. No monadyssey. The CS isolated-world bypass-flag pattern from ADR-18 is reused unchanged.

### Decision

#### 1. URL parsing — reuse `parsePRIdentifier` unchanged

The two ADO regexes already live in `packages/core/src/ports/vcs-provider.ts` (see `ADO_DEV_RE` and `ADO_VS_RE` constants on lines 112 and 119). Their canonical forms:

- Modern: `^https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)(?:[/?].*)?$`
  - Captures: org, project (percent-encoded segment, decoded by `parsePRIdentifier`), repo, id.
- Legacy: `^https:\/\/([^.]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)(?:[/?].*)?$`
  - Captures: org (from host), project, repo, id.

Both produce a `PRIdentifier` with `kind: "ado"`, fields `{ org, project, repo, pullRequestId }`. The CS imports `parsePRIdentifier` via `detectPRPage` in `src/lib/dom/page-detection.ts` — already in place from ADR-18. No new URL parsing code in the extension workspace. ADO-side `page-detection` tests gain three cases for legacy host + percent-encoded project + trailing query strings.

#### 2. Manifest match patterns and host permissions

`packages/extension/wxt.config.ts` extends `host_permissions` to:

```ts
host_permissions: [
  "*://github.com/*",
  "*://dev.azure.com/*",
  "*://*.visualstudio.com/*",
],
```

The content-script `matches` array in `entrypoints/content.ts` extends to:

```ts
matches: [
  "*://github.com/*",
  "*://dev.azure.com/*",
  "*://*.visualstudio.com/*",
],
```

Match-pattern note: MV3 `matches` does not support the `_git`/`pullrequest` path-specificity GitHub gets via `/pull/`. The CS therefore loads on every ADO page under those hosts and idles on non-PR URLs — same behaviour as today's GitHub CS when navigated to `/issues`. `detectPRPage` is the gate.

Adding a `host_permissions` entry triggers a Chrome permission re-prompt on auto-update. This is acceptable for v1; the alternative (optional permissions) is deferred to #50 (options page).

#### 3. Vote-button discovery — layered defensive selectors

ADO's Vote control is a dropdown. The user opens the dropdown and clicks one of: Approve, Approve with suggestions, Wait for author, Reject. **We intercept Approve and Approve-with-suggestions; we do NOT intercept Wait-for-author or Reject** (those are not approvals).

The interceptor lives in a new file `src/lib/dom/ado-vote-intercept.ts`. It does NOT pre-locate the button at startup (the dropdown is lazily rendered when the user opens it). Instead, a capture-phase `click` listener on `document` inspects every click target and matches it against an ordered list of recognizers.

Selector strategy — three layered recognizers, tried in order, first match wins:

1. **`data-testid` / `data-test` (most stable).** If `target.closest("[data-testid]")` or `target.closest("[data-test]")` returns an element whose attribute value matches one of:
   - exact: `pr-vote-approve`, `pr-vote-approve-with-suggestions`
   - prefix: `vote-approve`, `approve-with-suggestions` (case-insensitive)
   then this is an Approve click. ADO uses `data-` test hooks in current builds; the exact value is verified by the dev at implementation time and recorded as a `KNOWN_ADO_VOTE_TESTIDS` constant. Multiple known values are matched (one array constant) so a single-deploy change to `pr-vote-approve-v2` does not break us across the whole user base before we ship a fix.

2. **`aria-label` (stable across visual redesigns).** `target.closest("[aria-label]")` whose `aria-label` (lowercased, trimmed) starts with `"approve"`. This catches both `"Approve"` and `"Approve with suggestions"` because both have aria-labels prefixed with `Approve`. Wait-for-author / Reject are explicitly excluded by the `startsWith` check.

3. **Text content (last-resort, localisation-bounded).** `target.closest("button, [role='menuitem']")` whose `textContent` (trimmed, lowercased) equals `"approve"` or `"approve with suggestions"`. v1 supports English-only DOM text. ADO's UI language follows the user's ADO profile setting, NOT the browser locale — non-English deployments fall through this layer and Approve is not intercepted (Approve proceeds without a quiz — fail-open documented in §10). Localisation is deferred to a future ADR.

The recognizer returns `null` (not an Approve click) or `{ variant: "approve" | "approve-with-suggestions"; element: HTMLElement }`. The `variant` is forwarded into `ApproveBlockedEvent` (see §6) and surfaced in CS logs only; it is NOT forwarded to the host (the host always receives the same `quiz-request` frame regardless of variant — the diff-only invariant forbids variant-aware prompt construction).

#### 4. Capture-phase click interception strategy

Bind a capture-phase listener on `document` for the `"click"` event:

```ts
doc.addEventListener("click", handler, { capture: true });
```

Handler flow (mirrors ADR-18 §Decision 1 for clicks instead of submits):

1. `event.target` must be an `Element`. Else return.
2. Run the three-layer recognizer. `null` → return.
3. `getCurrentPR()` returns `null` or `{ kind: "github", ... }` → return. ADO interceptor only fires for `pr.kind === "ado"`.
4. `shouldBypass()` true → consume the bypass, return without `preventDefault` (allow the replayed click through).
5. Else: `event.preventDefault()` + `event.stopPropagation()` + `event.stopImmediatePropagation()`, build an `AdoApproveBlockedEvent`, call `onBlocked`.

`stopImmediatePropagation` is ADO-specific (not in ADR-18): ADO's SPA framework binds its handlers in capture phase as well in some deployments — `stopImmediatePropagation` ensures no other capture-phase listener on `document` runs after ours. GitHub's submit-form path uses bubble-phase site code so `stopPropagation` is sufficient there.

Module-scoped bypass flag (same pattern as ADR-18 §Decision 4): a `let approveBypass = false;` lives at module scope inside `quiz-flow.ts` (already there). The ADO interceptor consumes it via the same `shouldBypass()` deps callback used by GitHub. Module scope, not `window`, for the same security reason.

#### 5. SPA navigation handling — replace Turbo with `popstate` + URL polling

ADO does NOT use Hotwire Turbo. There is no `turbo:before-visit` or `turbo:render` event. ADO's SPA navigation is `history.pushState`-based. We add a small abstraction in `quiz-flow.ts` so the controller is host-agnostic:

- A `NavigationWatcher` type (new, in `src/lib/dom/navigation.ts`) with two callbacks: `onWillNavigate()` and `onDidNavigate()`.
- A `createGitHubNavigationWatcher(doc)` wires `turbo:before-visit` → `onWillNavigate`, `turbo:render` → `onDidNavigate` (current behaviour preserved).
- A `createAdoNavigationWatcher(doc)` wires:
  - `window.addEventListener("popstate", onDidNavigate)` for back/forward.
  - A `MutationObserver` on `document.body` (`childList: true, subtree: false`) that compares `window.location.href` to a previous value and fires `onDidNavigate` on change. This catches `pushState` navigations (which fire no event).
  - We do NOT monkey-patch `history.pushState`. Patching globals from a CS isolated world only affects the CS's own world, not the page's — it would never fire for real ADO navigations. Polling via the `MutationObserver` we already use for the GitHub fallback is the supported path.
  - `onWillNavigate` is best-effort: ADO has no pre-navigation hook. The controller calls `onWillNavigate` synchronously from inside `onDidNavigate` on first detect — i.e. ADO collapses the two callbacks into one. State drop and PR re-detect both happen, just at the same moment. This is acceptable for v1 because pending state is cleaned by the SW's 60s timeout (ADR-17) if a navigation arrives mid-flight.

The controller (`quiz-flow.ts`) is refactored to accept a `NavigationWatcher` via deps rather than hard-coding Turbo event names. This is a small refactor (one parameter, ~10 LOC) and keeps `quiz-flow.ts` as the single orchestrator for both platforms.

#### 6. Interceptor wired via a strategy parameter into `quiz-flow.ts`

`quiz-flow.ts` currently hard-codes `setupApproveInterceptor` (the GitHub variant). The minimal refactor:

- Introduce a `setupInterceptor` deps field on `QuizFlowDeps`:
  ```ts
  readonly setupInterceptor: (deps: InterceptorDeps) => (() => void);
  ```
  where `InterceptorDeps` is the existing `ApproveInterceptorDeps` shape generalised over the platform-agnostic surface (`doc`, `getCurrentPR`, `shouldBypass`, `onBlocked`).
- `ApproveBlockedEvent` is renamed `InterceptedApproveEvent` (no semantic change, just clarifies it covers ADO too). The optional `submitter` field stays; ADO's interceptor sets `form: null, submitter: null, variant: "approve" | "approve-with-suggestions", element: HTMLElement`. The replay path (`p.form.requestSubmit`) branches on `form !== null`: GitHub re-submits the form; ADO calls `p.element.click()` after setting the bypass flag.

Replay-on-pass for ADO:
1. Set `approveBypass = true`.
2. `p.element.click()` — synchronous; capture listener fires, sees bypass, resets flag, returns without preventDefault.
3. ADO's own click handler runs; the REST call goes through.

A `try/catch` around `p.element.click()` falls back to dispatching `quiz-result` with `outcome: "error", reason: "internal"` (mirrors ADR-18's `requestSubmit` catch).

#### 7. Modal injection and event bus — unchanged

The modal (`src/lib/dom/modal.ts`) is host-agnostic. It subscribes to `lgtm-buzzer:quiz-request` / `lgtm-buzzer:quiz-result` and emits `lgtm-buzzer:quiz-submit` / `lgtm-buzzer:quiz-cancel`. Nothing in the modal touches the GitHub DOM. ADO inherits all of this for free.

Shadow-DOM injection, z-index, CSS, and state machine are reused verbatim. The modal does not know the difference between a GitHub and an ADO quiz.

#### 8. Selector fragility — runtime override hook (forward to #50)

To absorb ADO UI changes between extension releases, the ADO interceptor accepts an optional override list:

```ts
type AdoVoteSelectorOverrides = {
  readonly testIds?: ReadonlyArray<string>;
  readonly ariaLabelPrefixes?: ReadonlyArray<string>;
  readonly textContents?: ReadonlyArray<string>;
};
```

These extend (do not replace) the built-in defaults. In v1 the override list is hard-coded `undefined` at the CS entrypoint — the only purpose is to give #50 (options page) a typed integration target with zero refactor when the user-facing setting lands. The CS reads the override list synchronously at construction time; runtime hot-swap is out of scope for v1.

#### 9. Diff-only invariant — strictly preserved

The ADO interceptor reads:
- `window.location.href` (parsed by `parsePRIdentifier`).
- `event.target` and its ancestors (button/menuitem element identity only, plus its `data-testid`/`data-test`/`aria-label` attributes and `textContent`).

The ADO interceptor MUST NOT read:
- PR title, description, threads, comments, work-item links, build statuses, commit messages, file names, or any element under `.repos-pr-overview-`, `.repos-discussion-`, `.repos-file-list-`, `.bolt-table` PR-detail rows.

Reviewer grep gate (extends ADR-18 §Decision 7): any addition under `src/lib/dom/**` that touches one of those selectors fails review. The `textContent` recognizer's allow-list (`"approve"`, `"approve with suggestions"`) is the only PR-text-adjacent DOM read in the entire CS, and it is bounded to a fixed string-equality check against two short literals — it cannot exfiltrate variable PR content.

#### 10. Failure modes — fail-open with diagnostic logging

If none of the three recognizer layers fires (ADO ships a build with new selectors and non-English text), the click reaches ADO and the Approve goes through without a quiz. This is the expected fail-open: not gating a real Approve is far less damaging than wedging Approve permanently. The dev SHOULD wire a `logger.warn` on every Vote-menu open (detected via `data-testid` on the dropdown panel or `[role='menu']` with vote-related `aria-label`), but the v1 implementation is allowed to skip this — the smoke test is the gate.

The override hook (§8) plus an issue-template entry ("My Approve was not gated") is the recovery path until #50 ships an in-product way for users to set their own selector.

#### 11. Decision rules unchanged from ADR-18

- Capture-phase, document-bound listener.
- Module-scoped bypass flag, not `window`.
- DOM CustomEvent bus to the modal — same four event names.
- CS reads zero PR text from the DOM beyond URL and click target.
- All diff fetching happens in the host via the ADO `VCSProvider` adapter (#47 territory, not this story).
- `requestId` per click; SW correlation map keyed by wire `correlationId`.

### Affected workspaces

`packages/extension` only. The dependency-direction rule is unchanged:
- `extension → core` (imports `parsePRIdentifier`, `PRIdentifier`).
- `extension → protocol` (imports `PRIdentifierSchema`, `QuizDTOSchema`, etc.).
- No imports added in `core`, `protocol`, `adapters/*`, or `host`.

### Types

```ts
// src/lib/dom/ado-vote-intercept.ts (new)

import type { PRIdentifier } from "@lgtm-buzzer/core";

export type AdoVoteVariant = "approve" | "approve-with-suggestions";

export type AdoVoteSelectorOverrides = {
  readonly testIds?: ReadonlyArray<string>;
  readonly ariaLabelPrefixes?: ReadonlyArray<string>;
  readonly textContents?: ReadonlyArray<string>;
};

export type AdoInterceptedApproveEvent = {
  readonly kind: "ado";
  readonly element: HTMLElement;
  readonly variant: AdoVoteVariant;
  readonly pr: PRIdentifier & { readonly kind: "ado" };
};

export type AdoVoteInterceptorDeps = {
  readonly doc: Document;
  readonly getCurrentPR: () => PRIdentifier | null;
  readonly shouldBypass: () => boolean;
  readonly onBlocked: (e: AdoInterceptedApproveEvent) => void;
  readonly overrides?: AdoVoteSelectorOverrides;
  readonly logger?: { readonly warn: (msg: string, ctx?: Record<string, unknown>) => void };
};
```

```ts
// src/lib/dom/approve-intercept.ts (rename type, additive)

export type InterceptedApproveEvent =
  | (ApproveBlockedEvent & { readonly kind: "github" })
  | AdoInterceptedApproveEvent;
```

The existing `ApproveBlockedEvent` is kept as the GitHub-specific shape; the discriminated `InterceptedApproveEvent` is what `quiz-flow.ts` consumes via `onBlocked`. The `kind` discriminator drives the replay branch (`form.requestSubmit` vs `element.click`).

```ts
// src/lib/dom/navigation.ts (new)

export type NavigationWatcher = {
  readonly start: (cb: {
    readonly onWillNavigate: () => void;
    readonly onDidNavigate: () => void;
  }) => (() => void);
};

export const createGitHubNavigationWatcher = (doc: Document): NavigationWatcher;
export const createAdoNavigationWatcher = (doc: Document): NavigationWatcher;
```

```ts
// src/lib/dom/quiz-flow.ts (extended)

export type InterceptorFactory = (deps: {
  readonly doc: Document;
  readonly getCurrentPR: () => PRIdentifier | null;
  readonly shouldBypass: () => boolean;
  readonly onBlocked: (e: InterceptedApproveEvent) => void;
}) => (() => void);

export type QuizFlowDeps = {
  // ... existing fields ...
  readonly setupInterceptor: InterceptorFactory;
  readonly navigationWatcher: NavigationWatcher;
};
```

The two new deps are required (no default) so the entrypoint must wire them explicitly per platform.

### Functions and methods

```ts
// src/lib/dom/ado-vote-intercept.ts
export const setupAdoVoteInterceptor =
  (deps: AdoVoteInterceptorDeps): (() => void);

// Internal helper — exported only for unit tests.
export const recognizeAdoVoteClick = (
  target: EventTarget | null,
  overrides?: AdoVoteSelectorOverrides,
): { variant: AdoVoteVariant; element: HTMLElement } | null;
```

```ts
// src/lib/dom/navigation.ts
export const createGitHubNavigationWatcher =
  (doc: Document): NavigationWatcher;
export const createAdoNavigationWatcher =
  (doc: Document): NavigationWatcher;
```

```ts
// src/lib/dom/quiz-flow.ts — refactored signature
export const createQuizFlowController =
  (deps: QuizFlowDeps): QuizFlowController;
```

```ts
// entrypoints/content.ts — selects per-page strategy
const initialPR = detectPRPage(window.location.href);
const platform: "github" | "ado" =
  initialPR.ok && initialPR.pr.kind === "ado" ? "ado" : "github";

const setupInterceptor: InterceptorFactory =
  platform === "ado"
    ? (deps) => setupAdoVoteInterceptor({ ...deps, onBlocked: deps.onBlocked, logger })
    : (deps) => setupApproveInterceptor(deps);

const navigationWatcher =
  platform === "ado"
    ? createAdoNavigationWatcher(document)
    : createGitHubNavigationWatcher(document);

const controller = createQuizFlowController({
  doc: document,
  sendFrame,
  newCorrelationId: () => crypto.randomUUID(),
  newRequestId: () => crypto.randomUUID(),
  setupInterceptor,
  navigationWatcher,
  logger,
});
```

Note: the platform selection is computed at `main()` time. If the user navigates from a GitHub tab to an ADO tab the CS is loaded fresh per page (each is a separate document), so the static-at-load choice is correct. Cross-host SPA navigation does not exist.

### File layout

**New (5)**:
- `packages/extension/src/lib/dom/ado-vote-intercept.ts`
- `packages/extension/src/lib/dom/ado-vote-intercept.test.ts`
- `packages/extension/src/lib/dom/navigation.ts`
- `packages/extension/src/lib/dom/navigation.test.ts`
- (no new modal/event-bus files — reused as-is)

**Modified (5)**:
- `packages/extension/src/lib/dom/approve-intercept.ts` — add the `InterceptedApproveEvent` discriminated union (additive; no breaking change to `setupApproveInterceptor`).
- `packages/extension/src/lib/dom/quiz-flow.ts` — accept `setupInterceptor` + `navigationWatcher` via deps; branch replay path on `blocked.kind`.
- `packages/extension/src/lib/dom/quiz-flow.test.ts` — extend with ADO happy-path + ADO replay-via-click tests.
- `packages/extension/src/lib/dom/index.ts` — export new types and functions.
- `packages/extension/entrypoints/content.ts` — platform selection at startup (see above).
- `packages/extension/wxt.config.ts` — extend `host_permissions` with `*://*.visualstudio.com/*`.
- `packages/extension/src/lib/dom/page-detection.test.ts` — three new cases: legacy host, percent-encoded project, trailing query.

(Net 5 new files, 5 modified.)

### Sequence — ADO happy path

1. wxt loads CS on `dev.azure.com/*` (or `*.visualstudio.com/*`), `runAt: "document_idle"`.
2. `main()` runs `detectPRPage(window.location.href)`. Result `{ ok: true, pr: { kind: "ado", ... } }` → platform = "ado".
3. `createQuizFlowController` wires `setupAdoVoteInterceptor` and `createAdoNavigationWatcher`.
4. Controller `start()`: capture-phase click listener on `document`, popstate + MutationObserver navigation watcher, quiz-submit + quiz-cancel listeners.
5. User opens the Vote dropdown → ADO renders the menu (no listener fires).
6. User clicks "Approve" or "Approve with suggestions". Capture-phase handler runs.
7. `recognizeAdoVoteClick(event.target)` returns `{ variant, element }`.
8. `getCurrentPR()` returns the ADO `PRIdentifier`; `shouldBypass()` returns false (no replay in progress).
9. `preventDefault` + `stopPropagation` + `stopImmediatePropagation`. Store pending `{ requestId, element, variant, pr }`. Emit `lgtm-buzzer:quiz-request { requestId, correlationId, pr }`.
10. `sendFrame(QuizRequestFrame)` awaits. SW routes to host (ADR-17), host generates quiz, replies.
11. `QuizResponseFrame` → emit `quiz-result { outcome: "quiz-ready", quiz }`. Modal renders the quiz.
12. User answers; modal emits `lgtm-buzzer:quiz-submit { requestId, quizId, answers }`.
13. Controller sends `QuizSubmitFrame`; receives `QuizResultFrame { passed: true }`.
14. Emit `quiz-result { outcome: "quiz-passed" }`. Set `approveBypass = true`. Call `pending.element.click()`.
15. Capture listener fires synchronously, `shouldBypass()` consumes the flag and returns true → no preventDefault. ADO's own click handler runs; the Vote=Approve REST call goes through.
16. ADO UI updates to show the user's vote.

Failure variant at step 13: `passed: false` → `quiz-result { outcome: "quiz-failed" }`, no replay, pending dropped. Modal shows the failure UI; the user can dismiss and retry (a new click starts a new requestId).

**Diff-flow audit**: the only PR-derived bytes on the wire are the `PRIdentifier` coordinates (org, project, repo, pullRequestId) — same shape as the GitHub case. No ADO DOM text crosses the CS boundary.

### Error cases

| Failure | Surfaced |
|---|---|
| ADO URL but click target is Wait-for-author / Reject | Recognizer returns `null`; click proceeds normally |
| ADO URL on a non-PR page (e.g. `/pulls`) | `getCurrentPR()` returns `null`; click proceeds normally |
| ADO ships a UI change breaking all three recognizers | Click proceeds without quiz (fail-open); logger.warn on Vote-menu open if instrumented (§10) |
| Non-English ADO deployment | Text-content layer fails; `data-testid` / `aria-label` layers usually still work; if not, fail-open |
| `getCurrentPR()` returns `{ kind: "github" }` on an ADO URL | Impossible (URL is parsed once at startup), but defensive `pr.kind === "ado"` check returns early |
| `pending.element.click()` throws | Caught; `quiz-result { outcome: "error", reason: "internal" }` |
| `popstate` to a non-PR ADO URL | `onDidNavigate` recomputes `currentPR = null`; subsequent clicks ignored |
| SPA pushState to a different ADO PR | MutationObserver detects URL change; `currentPR` updated; bypass + pending dropped |
| Bypass flag stuck after click-replay failure | Defensive reset on every `onDidNavigate` (same as ADR-18 `turbo:before-visit` defence) |
| `setupInterceptor` factory throws | Bubbles to `main()`; CS does not start; error logged. Not a recoverable path |

No throws on expected paths. The recognizer is a pure function over a DOM target — failures are `null` returns, not exceptions.

### Test strategy

**Unit (vitest + jsdom)**:

- `ado-vote-intercept.test.ts` (~14 cases):
  - Recognizer: data-testid match (each `KNOWN_ADO_VOTE_TESTIDS` value).
  - Recognizer: aria-label `"Approve"` → match.
  - Recognizer: aria-label `"Approve with suggestions"` → match (different variant).
  - Recognizer: aria-label `"Reject"` → `null`.
  - Recognizer: aria-label `"Wait for author"` → `null`.
  - Recognizer: text content `"Approve"` → match.
  - Recognizer: text content `"approve "` (with trailing whitespace) → match (trimmed).
  - Recognizer: text content `"Approuver"` (non-English) → `null`.
  - Recognizer: ancestor data-testid (target is a span inside a `<button data-testid>`) → match.
  - Listener fires `onBlocked` with `variant` and `element` set.
  - `shouldBypass()` true → click proceeds.
  - `getCurrentPR()` null → no `onBlocked`.
  - `getCurrentPR().kind === "github"` → no `onBlocked`.
  - `dispose()` removes the listener.
  - Overrides: `testIds: ["custom-approve"]` matches alongside built-ins.

- `navigation.test.ts` (~6 cases):
  - GitHub watcher: `turbo:before-visit` → `onWillNavigate`; `turbo:render` → `onDidNavigate`.
  - GitHub watcher: dispose removes both listeners.
  - ADO watcher: `popstate` → `onDidNavigate` AND `onWillNavigate` (collapsed).
  - ADO watcher: MutationObserver on body change with URL change → `onDidNavigate`.
  - ADO watcher: MutationObserver on body change without URL change → no callback.
  - ADO watcher: dispose disconnects observer and removes popstate listener.

- `quiz-flow.test.ts` extensions (~4 new cases):
  - ADO happy path: click → request → ready → submit → passed → `element.click()` called once.
  - ADO failed quiz: `element.click()` NOT called.
  - ADO `pending.element.click()` throws: error outcome dispatched, bypass reset.
  - ADO navigation mid-flight: `onDidNavigate` drops bypass + pending.

- `page-detection.test.ts` extensions (~3 new cases):
  - Legacy host: `https://myorg.visualstudio.com/MyProj/_git/myrepo/pullrequest/3`.
  - Percent-encoded project on legacy host: `https://myorg.visualstudio.com/My%20Proj/_git/myrepo/pullrequest/3` → `project === "My Proj"`.
  - Trailing query string preserved/ignored: `?_a=files` → still ok.

**Contract**: none — there is no protocol surface added.

**End-to-end**: deferred to #51 (Playwright). ADO requires login and a real ADO org, so #51 covers GitHub only for the first milestone. For #48 the dev verifies on a real ADO instance (their own org) via a manual smoke checklist:
  1. Open an ADO PR. Verify modal appears on Approve click.
  2. Pass the quiz. Verify the Approve goes through (the user's vote is recorded).
  3. Fail the quiz. Verify the Approve is blocked.
  4. Approve-with-suggestions: same pass + fail flow.
  5. Reject: verify NO modal appears.
  6. Wait-for-author: verify NO modal appears.
  7. Navigate between two ADO PRs in the same tab. Verify the new PR is detected and the flow works on the second PR.
  8. Legacy host (if accessible): repeat 1–3 on `*.visualstudio.com`.

Coverage target: ~90% on `src/lib/dom/**` (unchanged from ADR-18). The new files are pure DOM logic, fully jsdom-testable.

### Consequences

- **Selector resilience.** Three-layer recognizer plus override hook bounds the blast radius of any ADO UI redesign. Most realistic UI changes (class renames, layout reshuffles) leave at least one of testid/aria-label/text intact.
- **Fail-open semantics.** If all recognizers miss, Approve goes through without a quiz. We choose this over fail-closed because wedging Approve is a much worse UX than missing a quiz.
- **No new runtime deps.** Plain TS + zod (already in use). No monadyssey in the extension paths.
- **Manifest re-prompt.** Adding `*.visualstudio.com` to `host_permissions` triggers a Chrome user prompt on auto-update. Acceptable for v1; alternative is optional permissions, deferred to #50.
- **Strategy refactor of `quiz-flow.ts`.** Two new deps (`setupInterceptor`, `navigationWatcher`) make it host-agnostic. Future VCS platforms (GitLab, Bitbucket) follow the same pattern — add a third interceptor + navigation watcher; no controller changes.
- **Diff-only invariant preserved at the type level.** ADO `PRIdentifier` carries only coordinates (matches `vcs-provider.ts`). The recognizer reads only attribute / text from the click target — not from any PR-detail container. Reviewer grep gate extended.
- **Forward-compat with #50.** `AdoVoteSelectorOverrides` is the typed integration point for the options page; no refactor needed when #50 lands.
- **Localisation deferred.** v1 is English-only on the text-content fallback. ADO's two stable layers (data-testid, aria-label) are usually locale-independent, so non-English deployments are partially covered. A future ADR adds a locale-aware text layer if needed.
- **No e2e for ADO in v1.** #51 covers GitHub only. ADO smoke is manual. This is the right trade-off — ADO e2e requires either a paid ADO instance or a non-trivial DOM fixture; defer until selector volatility justifies it.
- **Reversibility high.** Two new files, four modified. Swapping the recognizer strategy is one file. Swapping the SPA navigation strategy is one file.
- **Binding for the reviewer**: (a) ADO recognizer must not read any element under PR-content containers (grep gate); (b) `setupAdoVoteInterceptor` must call `stopImmediatePropagation`; (c) `quiz-flow.ts` must branch replay on `blocked.kind` and never call `requestSubmit` on the ADO path; (d) module-scoped bypass flag is shared between platforms but consumed identically; (e) `host_permissions` and `matches` must list both modern and legacy ADO hosts; (f) zero new runtime deps; (g) no `console.log` in committed code — only the injected `logger.warn`.

---

## ADR-22 (2026-05-22): Host runtime config layer — adapter registry, per-request credentials, list-adapters frame
**Date**: 2026-05-22
**Issue**: #49
**Status**: Accepted

### Context

M2 hard-wires `claude-cli` (LLM) + `github` (VCS), reading `LGTM_BUZZER_LLM` and `LGTM_BUZZER_GH_TOKEN` from `process.env` in `host/adapter-registry.ts`. M3 grows this matrix to **four LLM adapters** (`claude-cli`, `codex-cli`, `copilot-cli`, `claude-api`) and **two VCS adapters** (`github`, `ado`). The host needs a way to (a) discover available adapters, (b) be told which pair to use per quiz request, (c) accept credentials safely.

Three downstream consumers are blocked on this:

1. **#50** — extension options page. The user picks the adapter and supplies credentials (PAT, API key). With nowhere to send them, the page cannot exist.
2. **#59 v2** — `claude-api` adapter currently has no API-key source on the host side beyond a TODO env var.
3. **#48** — ADO content script ships real diffs to the host once the ADO VCS adapter is selectable per-request.

Five forces shape the design:

- **Statelessness of the host.** The extension is the source of truth for user preferences (options page → `chrome.storage.local`). Pushing state into the host creates a second sync surface and a fresh persistence problem.
- **Diff-only invariant.** Adapter selection and credentials are non-diff-derived; the wire format must keep diff bytes off the wire and credentials separable from prompt construction.
- **Credential blast radius.** PATs and API keys are sensitive. They MUST NEVER appear in logs, error payloads, or stderr. ADR-6's pino REDACT_PATHS list must grow to cover the new fields.
- **Backwards compatibility.** The protocol envelope `v` is currently `1`. Bumping it forces lockstep version checks across host + extension just to add optional fields. Optional-fields-with-defaults is strictly cheaper.
- **No eager spawning.** The composition root must construct only the active adapter pair. Constructing all four LLM adapters at startup wastes effort and may fail on missing optional credentials (e.g., no API key).

The issue's "config file vs. wire message" open question is resolved in favour of **wire message**: the options page is the user's source of truth; the host stays stateless w.r.t. preferences.

### Decision

A **host-side adapter registry** maps stable adapter IDs to ephemeral factory functions; the **wire format** carries the chosen IDs and per-request credentials on every `quiz-request`; the extension discovers available adapters via a new `list-adapters-request` / `list-adapters-response` frame pair.

#### Affected workspaces

- `packages/protocol/` — three new fields on `quiz-request.payload`, two new frame kinds, four new `ErrorReason` variants. No envelope structural change; `v` stays at `1`.
- `packages/host/` — replaces `adapter-registry.ts`'s ad-hoc env-driven selection with a typed registry; dispatcher threads adapter IDs + credentials per request.
- `packages/extension/` — no changes in this ADR (the options page itself is #50). The SW already speaks `Frame` opaquely (ADR-17 §7); new fields ride through without code change.

**Dependency arrows reaffirmed**:

```
protocol  ← core  ← adapters  ← host
protocol  ← core  ← extension
```

No new arrows. No `core` change at all (the `LLMProvider` / `VCSProvider` ports remain the host-side contract; adapter factories already take `creds` as part of their `config`).

#### Wire-shape choices (binding)

| Choice | Decision |
|---|---|
| Where adapter selection lives | **Extension-driven** (the user's source of truth; options page in #50). Host validates the requested ID; on miss, returns a typed error frame. |
| Envelope version | **Stays `v: 1`**. New fields are optional with defaults. |
| Default adapter pair when fields omitted | `{ llm: "claude-cli", vcs: "github" }` — preserves M2 behaviour. |
| Credentials transport | **Inside the same `quiz-request` payload**. Short-lived; the host MUST NOT persist them. Adapter instance built per-request, dropped after the response. |
| Credentials shape | Discriminated union by adapter ID; each adapter declares its own zod schema in its workspace. |
| Adapter discovery | New `list-adapters-request` → `list-adapters-response` frame pair. Payload: `{ llm: string[]; vcs: string[] }`. |
| New error reasons | `unsupported-llm-adapter`, `unsupported-vcs-adapter`, `bad-credentials`, `missing-credentials`. |
| Credential redaction | Extended ADR-6 REDACT_PATHS — added `payload.credentials`, `*.credentials`, `*.apiKey`, `*.pat`. |

#### Types

##### protocol — `packages/protocol/src/messages/credentials.ts` (new)

The credentials bag is an open zod record at the protocol layer (the host validates per-adapter). Protocol does NOT know adapter-specific shapes; it knows only "credentials may be present, may be absent, must be a JSON object when present".

```ts
// packages/protocol/src/messages/credentials.ts
import { z } from "zod";

/**
 * Wire-format credentials bag. The protocol layer keeps this schema deliberately
 * loose — per-adapter shape validation happens in the host's adapter registry
 * (`packages/host/src/registry.ts`). Allowing arbitrary string-keyed string
 * values here lets the protocol carry today's PAT / API-key bags AND tomorrow's
 * additional fields (refresh tokens, regional endpoints) without an envelope
 * bump.
 *
 * SECURITY: This object is logged NOWHERE. ADR-6's REDACT_PATHS must censor
 * `payload.credentials`, `*.credentials`, `*.apiKey`, `*.pat`.
 */
export const CredentialsBagSchema = z.record(z.string(), z.string());
export type CredentialsBag = z.infer<typeof CredentialsBagSchema>;
```

##### protocol — extended `quiz-request.ts`

```ts
// packages/protocol/src/messages/quiz-request.ts
export const QuizRequestPayloadSchema = z.object({
  pr: PRIdentifierSchema,
  questionCount: z.number().int().min(1).max(10),
  /** Stable LLM-adapter ID. Optional — host defaults to "claude-cli". */
  llmAdapterId: z.string().min(1).optional(),
  /** Stable VCS-adapter ID. Optional — host defaults to "github". */
  vcsAdapterId: z.string().min(1).optional(),
  /** Per-adapter credentials bag. Validated by the host's registry per adapter ID. */
  credentials: CredentialsBagSchema.optional(),
});
```

`payload.credentials` MUST remain the ONLY field carrying secrets. Diff bytes still never appear in any wire message (`fetchDiff` runs host-side only).

##### protocol — new `list-adapters` frames

```ts
// packages/protocol/src/messages/list-adapters-request.ts
export const ListAdaptersRequestPayloadSchema = z.object({});
export const ListAdaptersRequestFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("list-adapters-request"),
  payload: ListAdaptersRequestPayloadSchema,
});
export type ListAdaptersRequestFrame = z.infer<typeof ListAdaptersRequestFrameSchema>;
```

```ts
// packages/protocol/src/messages/list-adapters-response.ts
export const ListAdaptersResponsePayloadSchema = z.object({
  llm: z.array(z.string().min(1)),
  vcs: z.array(z.string().min(1)),
});
export const ListAdaptersResponseFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("list-adapters-response"),
  payload: ListAdaptersResponsePayloadSchema,
});
export type ListAdaptersResponseFrame = z.infer<typeof ListAdaptersResponseFrameSchema>;
```

Both kinds join the `FrameSchema` discriminated union in `envelope.ts`.

##### protocol — extended `error.ts`

```ts
export const ErrorReasonSchema = z.enum([
  "schema-violation",
  "unknown-message",
  "version-mismatch",
  "internal",
  "unknown-quiz-id",
  // new in ADR-22
  "unsupported-llm-adapter",
  "unsupported-vcs-adapter",
  "bad-credentials",
  "missing-credentials",
]);
```

##### host — `packages/host/src/registry.ts` (new)

```ts
// Per-adapter credential schemas (host-owned; the host is the only layer that
// understands the runtime shape).
const ClaudeCliCredsSchema = z.object({}).strict();          // none required
const CodexCliCredsSchema  = z.object({}).strict();
const CopilotCliCredsSchema = z.object({}).strict();
const ClaudeApiCredsSchema = z.object({ apiKey: z.string().min(1) }).strict();
const GithubCredsSchema    = z.object({ pat: z.string().min(1) }).strict();
const AdoCredsSchema       = z.object({ pat: z.string().min(1) }).strict();

export type RegistryError =
  | { readonly kind: "unsupported-llm-adapter"; readonly id: string }
  | { readonly kind: "unsupported-vcs-adapter"; readonly id: string }
  | { readonly kind: "missing-credentials";     readonly adapterId: string }
  | { readonly kind: "bad-credentials";         readonly adapterId: string; readonly detail: string };

export type LLMAdapterFactory = (
  creds: CredentialsBag | undefined,
) => Either<RegistryError, LLMProvider>;

export type VCSAdapterFactory = (
  creds: CredentialsBag | undefined,
) => Either<RegistryError, VCSProvider>;

export type AdapterRegistry = {
  readonly listLlm: () => readonly string[];
  readonly listVcs: () => readonly string[];
  readonly buildLlm: (id: string, creds: CredentialsBag | undefined) =>
    Either<RegistryError, LLMProvider>;
  readonly buildVcs: (id: string, creds: CredentialsBag | undefined) =>
    Either<RegistryError, VCSProvider>;
};

export const createDefaultAdapterRegistry: (deps: {
  readonly spawnIO: typeof spawnIOFn;
  readonly env?: Readonly<Record<string, string | undefined>>;
}) => AdapterRegistry;
```

Notes on the registry contract:

- **Pure `Either` return**, not `IO`. Adapter construction is synchronous and pure; only the resulting `LLMProvider.generateQuiz` / `VCSProvider.fetchDiff` calls are `IO`-bearing.
- `buildLlm` / `buildVcs` MUST NOT cache constructed adapters. Each call returns a fresh instance — credentials are per-request.
- `RegistryError.bad-credentials.detail` is a short message ("missing field `apiKey`", "field `pat` must be non-empty"). It MUST NOT echo any credential bytes; the zod issue list is stringified by field-path only.
- The factory takes raw `CredentialsBag | undefined`, runs the per-adapter zod schema, and either constructs the adapter or returns a typed `RegistryError`.

##### host — updated `dispatcher.ts` deps

```ts
export type DispatcherDeps = {
  readonly write: FrameWriter;
  readonly store: SessionStore;
  readonly logger: Logger;
  readonly registry: AdapterRegistry;          // NEW
  readonly env?: Readonly<Record<string, string | undefined>>;
};
```

The dispatcher passes `frame.payload.llmAdapterId ?? "claude-cli"`, `frame.payload.vcsAdapterId ?? "github"`, and `frame.payload.credentials` to `registry.buildLlm` / `registry.buildVcs`. On `Left<RegistryError>`, it maps to the corresponding wire error.

#### Functions and methods

**`packages/host/src/registry.ts`**:

```ts
/** Construct the default registry: claude-cli, codex-cli, copilot-cli, claude-api, github, ado. */
export const createDefaultAdapterRegistry = (deps: {
  readonly spawnIO: typeof spawnIOFn;
  readonly env?: Readonly<Record<string, string | undefined>>;
}): AdapterRegistry => { /* ... */ };

/** Parse a CredentialsBag against a per-adapter zod schema; never echo cred bytes. */
const validateCreds = <T>(
  schema: z.ZodType<T>,
  adapterId: string,
  bag: CredentialsBag | undefined,
  required: boolean,
): Either<RegistryError, T | undefined> => { /* ... */ };
```

**`packages/host/src/dispatcher.ts`** — new internal helpers:

```ts
/** Map RegistryError → wire ErrorReason (no credential bytes ever in payload). */
const buildRegistryErrorFrame = (
  err: RegistryError,
  correlationId: string | null,
): Frame;

/** Handle a `list-adapters-request` frame. */
const handleListAdaptersRequest = (
  correlationId: string | null,
  deps: DispatcherDeps,
): IO<never, void>;
```

The existing `handleQuizRequest` signature grows by two parameters:

```ts
const handleQuizRequest = (
  pr: PRIdentifier,
  questionCount: number,
  llmAdapterId: string,            // NEW (already defaulted by dispatcher)
  vcsAdapterId: string,            // NEW
  credentials: CredentialsBag | undefined,  // NEW
  correlationId: string | null,
  deps: DispatcherDeps,
): IO<never, void>;
```

#### File layout

**New**:

- `packages/protocol/src/messages/credentials.ts` + `.test.ts`
- `packages/protocol/src/messages/list-adapters-request.ts` + `.test.ts`
- `packages/protocol/src/messages/list-adapters-response.ts` + `.test.ts`
- `packages/host/src/registry.ts` + `.test.ts`

**Modified**:

- `packages/protocol/src/messages/quiz-request.ts` — add 3 optional fields; TSDoc reaffirming diff-only invariant unchanged (credentials are NOT diff-derived; they are user-supplied identity for VCS / LLM).
- `packages/protocol/src/messages/quiz-request.test.ts` — cover new fields (present, absent, malformed).
- `packages/protocol/src/messages/error.ts` — add 4 enum variants.
- `packages/protocol/src/messages/error.test.ts` — cover new reasons.
- `packages/protocol/src/envelope.ts` — add the two new frames to `FrameSchema`.
- `packages/protocol/src/envelope.test.ts` — extend discriminator coverage.
- `packages/protocol/src/index.ts` — re-export new schemas and types.
- `packages/host/src/dispatcher.ts` — accept `registry` dep; thread adapter IDs + creds; handle `list-adapters-request`; map `RegistryError` to wire error frames.
- `packages/host/src/dispatcher.test.ts` — new cases (see Test strategy).
- `packages/host/src/cli.ts` — construct the registry once at startup, pass into `createDispatcher`.
- `packages/host/src/adapter-registry.ts` — **DELETED** (superseded by `registry.ts`).
- `packages/host/src/adapter-registry.test.ts` — **DELETED**.
- `packages/host/src/logger.ts` — extend `REDACT_PATHS` with: `payload.credentials`, `credentials`, `*.credentials`, `*.apiKey`, `*.pat`, `*.token`, `request.credentials`, `response.credentials`.
- `packages/host/src/logger.test.ts` — assert redaction on each new path.

#### Sequence

The flow below is the per-quiz path with the new registry layer.

1. **Extension options page (#50, future)** — user picks LLM + VCS adapter IDs and supplies credentials. Stored in `chrome.storage.local`. (Out of scope for this ADR.)
2. **CS detects Approve click** — builds `QuizRequestFrame` (ADR-18). The CS reads adapter IDs + credentials from `chrome.storage.local` (or asks the SW to). Wire payload becomes:
   ```json
   { "pr": {...}, "questionCount": 3,
     "llmAdapterId": "claude-api",
     "vcsAdapterId": "github",
     "credentials": { "apiKey": "sk-ant-...", "pat": "ghp_..." } }
   ```
3. **SW routes frame** (ADR-17 §3) — unchanged; SW handles `Frame` opaquely.
4. **Host stdio reader** decodes the frame via `parseFrame` (existing). Zod validates `payload.credentials` is `Record<string, string>` if present.
5. **Dispatcher** picks the adapter IDs (with defaults) and calls:
   - `registry.buildVcs(vcsAdapterId, creds)` → `Either<RegistryError, VCSProvider>`.
   - `registry.buildLlm(llmAdapterId, creds)` → `Either<RegistryError, LLMProvider>`.
   On `Left`: build an `ErrorFrame` with the matching `reason` and return immediately. Diff is NEVER fetched in this branch.
6. **Adapter pair constructed per-request** — no caching, no global state. The `LLMProvider` and `VCSProvider` references go out of scope at the end of the request.
7. **Existing quiz pipeline** continues (ADR-16): `fetchDiff` → `generateQuiz` → store answer key → write `quiz-response`.
8. **Adapter discovery** — separate, simple flow: SW or options page sends `list-adapters-request`; dispatcher calls `registry.listLlm()` / `registry.listVcs()`; writes `list-adapters-response`.

**Diff-flow audit**: credentials are constructed in the registry from the wire bag and passed only to the adapter factories. They never enter prompt construction, error payloads, or log messages.

#### Error cases

| Trigger | Wire frame |
|---|---|
| `llmAdapterId` not in registry | `ErrorFrame { reason: "unsupported-llm-adapter", message: "Unknown LLM adapter: <id>", details: { id } }` |
| `vcsAdapterId` not in registry | `ErrorFrame { reason: "unsupported-vcs-adapter", message: "Unknown VCS adapter: <id>", details: { id } }` |
| Adapter requires credentials, payload omits `credentials` or required field | `ErrorFrame { reason: "missing-credentials", message: "Adapter <id> requires credentials", details: { adapterId, missing: ["apiKey"] } }` |
| Credentials present but zod-invalid (wrong type, empty string) | `ErrorFrame { reason: "bad-credentials", message: "Credentials for adapter <id> are invalid", details: { adapterId, fieldPath: "apiKey" } }` |
| Legacy v1 envelope without new fields | Defaults to `claude-cli` + `github`; quiz proceeds (M2 parity). |

**Binding (reviewer-enforced)**: `ErrorPayload.message` and `ErrorPayload.details` MUST NOT include any bytes of `payload.credentials.*`. The `bad-credentials` payload may include field PATHS (`"apiKey"`, `"pat"`) but NEVER values. Contract test asserts.

Expected failures travel as `Either` / `IO` errors (CLAUDE.md idiom #1/#2). No new `throw` paths.

#### Per-adapter credential contract

| Adapter ID | Required creds | Optional creds | Zod schema (in `registry.ts`) |
|---|---|---|---|
| `claude-cli` | none | none | `z.object({}).strict()` |
| `codex-cli` | none | none | `z.object({}).strict()` |
| `copilot-cli` | none | none | `z.object({}).strict()` |
| `claude-api` | `apiKey: string (non-empty)` | none | `z.object({ apiKey: z.string().min(1) }).strict()` |
| `github` | `pat: string (non-empty)` | none | `z.object({ pat: z.string().min(1) }).strict()` |
| `ado` | `pat: string (non-empty)` | none | `z.object({ pat: z.string().min(1) }).strict()` |

CLI adapters (`claude-cli`, `codex-cli`, `copilot-cli`) intentionally accept NO credentials at the registry layer in v1 — each CLI manages its own auth (user logs in via `claude auth`, `gh auth`, etc.). If the user supplies a creds bag for these IDs, validation passes (strict-empty allows `undefined`) but extra keys produce `bad-credentials` (`.strict()` rejects unknowns to keep the wire honest).

Future ADRs may add optional creds (e.g., `claude-cli` `binary` path override) — they extend the schema additively.

#### Backwards compatibility — no envelope bump

The protocol envelope `v` literal stays `1`. The three new `quiz-request` fields are `.optional()`; the host applies the documented defaults on absence. Two new frame kinds (`list-adapters-request/response`) join the discriminated union, which is a strictly additive change — older parsers will reject them as `unknown-message`, which is the correct behaviour for a forward-incompatible kind.

This ADR explicitly declines a `v: 2` bump because:

1. The on-the-wire shape change is purely additive.
2. The extension always supplies the new fields once #50 ships; absence only matters during the rollout window.
3. Version bumps are coordinated multi-PR work; here the cost outweighs the rigor benefit.

#### Credential storage posture (host-side — hard invariant)

- The host MUST NOT persist credentials. No filesystem write, no in-memory cache across requests, no environment-variable export.
- Each `quiz-request` carries its own creds bag; the constructed adapter holds it for the lifetime of one `generateQuiz` / `fetchDiff` call.
- Constructed `LLMProvider` / `VCSProvider` instances are NOT retained between requests — the dispatcher's per-request fiber closes over them and lets GC reclaim them after the response is written.
- `process.env` is no longer the auth source. `LGTM_BUZZER_GH_TOKEN` and `LGTM_BUZZER_ANTHROPIC_KEY` are **deprecated** and removed from `cli.ts`'s environment-variable docblock. README and `cli.ts` header are updated to point at the options page (#50) as the only supported credential source.
- For local development without the extension, devs can use the `dev-harness.ts` to inject creds directly into a synthetic `quiz-request` payload. Document this in `packages/host/README.md`.

#### Credential storage posture (extension-side — v1 limitation)

The extension stores PATs / API keys in `chrome.storage.local` as plaintext under Chrome's process-level isolation. This is the same posture as countless other browser extensions (1Password, GitHub Pull Requests for VS Code, etc.) and is acceptable for v1.

**Known v1 limitation, documented in `packages/extension/README.md` and the options page UI**:

- `chrome.storage.local` is readable by any malicious extension granted `"storage"` permission.
- There is no OS-keychain integration in v1.
- A future ADR may add (a) a hardware-token unlock flow, (b) integration with the system keychain via the native host, or (c) opt-in encryption with a user passphrase.

This ADR explicitly defers OS-keychain / encrypted-store work to a future issue, but binds the v1 README and options-page copy to call out the storage posture in plain language.

#### Logger redaction (ADR-6 extension)

`packages/host/src/logger.ts` `REDACT_PATHS` adds (binding):

```ts
const REDACT_PATHS: readonly string[] = [
  // ... existing ADR-6 + ADR-20 paths ...
  "credentials",
  "payload.credentials",
  "request.credentials",
  "response.credentials",
  "*.credentials",
  "*.apiKey",
  "*.pat",
  "*.token",
  "*.x-api-key",
];
```

`logger.test.ts` asserts each path is censored to `"[Redacted]"` on a representative log entry.

#### Test strategy

**`packages/protocol/src/messages/quiz-request.test.ts`** — extend (≥4 new cases):
1. Payload with all three new fields → parses; types reflect optional fields present.
2. Payload with only `pr` + `questionCount` → parses (defaults applied at host); fields absent in parsed type.
3. `credentials` with non-string value → zod rejects.
4. `llmAdapterId` empty string → zod rejects (`min(1)`).

**`packages/protocol/src/messages/credentials.test.ts`** (new, ≥3):
1. Empty object parses.
2. `{ apiKey: "x" }` parses.
3. `{ apiKey: 123 }` rejects.

**`packages/protocol/src/messages/list-adapters-request.test.ts`** (new, ≥2):
1. Frame with empty payload parses.
2. Unknown extra field rejected.

**`packages/protocol/src/messages/list-adapters-response.test.ts`** (new, ≥3):
1. Frame with both `llm` and `vcs` arrays parses.
2. Empty arrays parse (degenerate host).
3. Non-string array element rejects.

**`packages/protocol/src/messages/error.test.ts`** — extend (≥4): each new `ErrorReason` value round-trips.

**`packages/protocol/src/envelope.test.ts`** — extend (≥2): `FrameSchema` accepts the two new kinds.

**`packages/host/src/registry.test.ts`** (new, ≥12):
1. `listLlm()` returns `["claude-cli", "codex-cli", "copilot-cli", "claude-api"]` (sorted, no duplicates).
2. `listVcs()` returns `["github", "ado"]`.
3. `buildLlm("claude-cli", undefined)` → `Right<LLMProvider>` with `id === "claude-cli"`.
4. `buildLlm("claude-api", { apiKey: "sk-ant-xxx" })` → `Right<LLMProvider>` with `id === "claude-api"`.
5. `buildLlm("claude-api", undefined)` → `Left<{ kind: "missing-credentials", adapterId: "claude-api" }>`.
6. `buildLlm("claude-api", { apiKey: "" })` → `Left<{ kind: "bad-credentials", adapterId: "claude-api", detail }>`; `detail` mentions `apiKey` field path only.
7. `buildLlm("unknown", undefined)` → `Left<{ kind: "unsupported-llm-adapter", id: "unknown" }>`.
8. `buildLlm("claude-cli", { extra: "x" })` → `Left<{ kind: "bad-credentials" }>` (`.strict()` rejects unknowns).
9. `buildVcs("github", { pat: "ghp_xxx" })` → `Right<VCSProvider>` with `id === "github"`.
10. `buildVcs("github", undefined)` → `Left<{ kind: "missing-credentials" }>`.
11. `buildVcs("ado", { pat: "azp_xxx" })` → `Right<VCSProvider>` (returns adapter; ADR-21 v1 stub error happens later at fetchDiff time).
12. **Binding canary**: feed a credential string `"SECRET_KEY_CANARY_xxx"` into a failing build; assert the returned `RegistryError.detail` does NOT contain `"SECRET_KEY_CANARY_xxx"`. Reviewer-enforced.

**`packages/host/src/dispatcher.test.ts`** — extend (≥7 new):
1. `quiz-request` with `llmAdapterId: "unknown"` → writes `ErrorFrame { reason: "unsupported-llm-adapter" }`; no `fetchDiff` call observed on the fake VCS.
2. `quiz-request` with `vcsAdapterId: "unknown"` → writes `ErrorFrame { reason: "unsupported-vcs-adapter" }`; no `generateQuiz` call observed.
3. `quiz-request` for `claude-api` without `credentials` → `ErrorFrame { reason: "missing-credentials" }`; no spawn / no HTTP attempted.
4. `quiz-request` for `claude-api` with `{ apiKey: "" }` → `ErrorFrame { reason: "bad-credentials" }`; **assert response payload does NOT contain `"sk-ant"` substring or the empty-key bytes**.
5. Legacy envelope (no `llmAdapterId`, no `vcsAdapterId`, no `credentials`) → defaults to `claude-cli` + `github`. Note: in this default branch, `github` adapter now requires creds via the registry, so the legacy path with NO creds will fail with `missing-credentials`. Test must supply `{ pat: "..." }`. Document this M2-incompatibility in the consequences section.
6. `list-adapters-request` → writes `list-adapters-response` with the full registry.
7. `quiz-request` with valid `claude-api` + `apiKey` → fake LLM returns Quiz; happy path completes; verify the fake LLM's factory was called exactly once with the apiKey.

**`packages/host/src/logger.test.ts`** — extend (≥6):
1. Log entry `{ credentials: { apiKey: "x" } }` → `apiKey` censored.
2. `{ payload: { credentials: {...} } }` → whole field censored.
3. `{ pat: "..." }` → censored.
4. `{ token: "..." }` → censored.
5. `{ x-api-key: "..." }` → censored.
6. Nested arbitrary `{ foo: { credentials: {...} } }` → `*.credentials` censored.

**Contract tests for adapters**: no change. The existing per-adapter contract tests construct providers directly via their factories; the new registry is the host's wiring layer, not part of the adapter contract.

**End-to-end**: deferred to #51 (Playwright). The options page (#50) and the SW are the e2e surface for this layer; this ADR is host-side only.

Coverage target: ≥90% on `registry.ts` (pure pure-ish factory + zod); ≥85% on the modified dispatcher branches. Existing `adapter-registry.ts` coverage gates removed alongside the file.

### Consequences

- **Stateless host.** The host is now fully stateless w.r.t. user preferences. The options page is the only persistence layer. Future "host config file" requests are denied — they would create a second sync surface.
- **No envelope version bump.** Protocol stays `v: 1`. Three optional fields + two additive frame kinds. Rollout is unilateral: an updated host accepts both old (defaults) and new payloads.
- **Per-request adapter construction.** A small cost (factory + zod validation per request, ~µs scale) bought against zero risk of stale-credential leakage between requests. Adapter instances do NOT cross requests.
- **Defaults preserve M2 surface for CLI users.** `claude-cli` + `github` defaults keep the dev-harness and pre-#50 testing flows working — with one caveat: `github` now requires `pat` via the registry, so the legacy `LGTM_BUZZER_GH_TOKEN` env path is removed. Devs must pass the PAT in the `dev-harness.ts` payload or via the harness's new `--gh-token` flag. Documented in `packages/host/README.md`.
- **`LGTM_BUZZER_LLM` and `LGTM_BUZZER_GH_TOKEN` env vars are removed.** Devs and CI scripts that relied on them must migrate to the registry/wire-format flow. The deletion is loud (docblock removed, README updated) to avoid silent confusion.
- **Two new error reasons reach the modal UI.** `unsupported-llm-adapter`, `unsupported-vcs-adapter`, `bad-credentials`, `missing-credentials` join the existing `internal` / `unknown-quiz-id` set. #50 must surface user-friendly copy for each (e.g., "Your API key is invalid — re-check on the options page"). Out of scope here; #50 owns the modal-side copy.
- **No new runtime deps** anywhere. `zod` (protocol), `monadyssey` (host), and existing adapter deps cover the change.
- **Credential redaction is structural, not best-effort.** REDACT_PATHS catches the field name on any path (`*.credentials`, `*.apiKey`, `*.pat`); the host code must avoid building log payloads that bury creds inside non-listed wrappers. Reviewer-enforced via the new `logger.test.ts` cases.
- **Reversibility high.** `registry.ts` is one file behind a typed interface; the dispatcher's only coupling is the `AdapterRegistry` type. A future overhaul (e.g., dynamic plugin loading) replaces `registry.ts` and the dispatcher is unchanged. The wire-format additions are additive — even rolling them back is a strict superset's deletion.
- **Security posture documented, not magically improved.** v1 stores PATs / API keys in `chrome.storage.local` plaintext. The README explicitly calls this out. A future ADR may add OS-keychain integration via the native host; not in scope here.
- **Diff-only invariant preserved.** Credentials and adapter IDs are user-supplied identity, not PR-derived. They never reach prompt construction. The reviewer's existing "no non-diff PR text reaches the LLM" gate is untouched.
- **Binding for reviewer**:
  - (a) `payload.credentials` MUST NEVER appear in `ErrorPayload.message` or `ErrorPayload.details` — registry-error frames echo field paths only, never values. Canary test in `registry.test.ts` and `dispatcher.test.ts` cover this.
  - (b) `REDACT_PATHS` MUST include all listed paths; `logger.test.ts` asserts.
  - (c) Adapter instances MUST NOT persist beyond a single `quiz-request` — no module-level state in `registry.ts`.
  - (d) `registry.ts` exposes ONLY the `AdapterRegistry` interface and `createDefaultAdapterRegistry`; no per-adapter exports leak (adapters are imported privately).
  - (e) Default adapter pair (`claude-cli` + `github`) applied at the dispatcher layer, NOT in the wire format — protocol stays version-agnostic.
  - (f) The new `list-adapters-response` MUST NOT include credential schemas or any indication of adapter capabilities beyond the ID list. UI hints belong to the options page.
  - (g) No new `throw`s; all expected failures route through `Either<RegistryError, _>` and the dispatcher's existing error-frame plumbing.

---

## ADR-23 (2026-05-22): Extension options page — adapter picker, credential inputs, chrome.storage.local persistence
**Date**: 2026-05-22
**Issue**: #50
**Status**: Accepted

### Context

ADR-22 (#49) just shipped the host-side registry and made `quiz-request` carry `llmAdapterId`, `vcsAdapterId`, and a `credentials` bag. The host is now fully stateless w.r.t. user preferences — the **extension is the source of truth**. With nothing on the extension side to persist or send those fields yet, the M3 adapter matrix is unreachable from a real browser. The user cannot pick `claude-api` over `claude-cli`, cannot supply a GitHub PAT, cannot point at ADO.

Five forces shape this design:

- **Statelessness contract from ADR-22.** Persistence lives in the extension; the host never writes config. Extension code owns the schema for stored preferences.
- **Diff-only invariant (CLAUDE.md §Key differentiator).** Credentials and adapter IDs are user identity, never PR-derived. The options page must not provide any path by which non-diff PR text reaches the LLM prompt — and indeed it touches no PR text at all, so the invariant is preserved by construction.
- **Credential blast radius.** PATs / API keys are sensitive. v1 stores them in `chrome.storage.local` plaintext (ADR-22 explicitly accepted this as a v1 limitation). The options page UI must not echo credentials in error messages or logs.
- **Bundle size discipline.** CLAUDE.md does not mandate "no UI libs," but the options page is ~150 LOC of dropdowns + textboxes. Pulling React/Vue/Svelte for this would bloat the MV3 zip and add a build-tool surface for no gain.
- **Tight v1 scope.** The "Test connection" feature is genuinely useful — without it the user finds out their PAT is wrong only when they next try to approve a PR. A bare `ping` frame round-trip is the cheapest viable variant; a fuller adapter-probe is deferred.

The PM spec resolves several questions up-front (storage keys, framework, ping-as-probe, deferred e2e). This ADR commits them and adds the missing technical detail: the **storage schema with versioning**, the **DOM structure and visibility model**, the **SW change** (read storage on every quiz-request), and the **first-run UX** (defaults + clear modal copy).

### Decision

A new WXT entrypoint `options/index.html` + `options/main.ts` renders a vanilla-TS form that:
1. Discovers adapters via `list-adapters-request` to the native host on page load.
2. Persists `{ schemaVersion, llmAdapterId, vcsAdapterId, credentials }` to `chrome.storage.local` under a single key on Save.
3. Probes the host with a `ping` frame for "Test connection" — no LLM/VCS adapter is actually exercised in v1 (deferred to a richer probe in a follow-up).

The service worker reads the stored selection on **every** outbound `quiz-request` and inlines `llmAdapterId` / `vcsAdapterId` / `credentials` into `payload`. No caching. On missing/corrupt storage the SW falls back to ADR-22's documented defaults (`claude-cli` + `github`) **without credentials**, letting the host return `missing-credentials`, which the modal surfaces with a "Configure in extension options" link.

#### Affected workspaces

- `packages/extension/` — new `options/` entrypoint, new `src/lib/options/` modules (storage, schema, DOM, probe), updated SW.
- `packages/protocol/` — no changes. ADR-22 already shipped the wire shape, and `ping` / `pong` already exist (M1).
- `packages/core/` — no changes. The options page is pure UI + extension storage; no domain logic.
- `packages/host/`, `packages/adapters/*` — no changes.

**Dependency arrows reaffirmed**:
```
protocol  ← core  ← adapters  ← host
protocol  ← core  ← extension
```

The options page imports from `@lgtm-buzzer/protocol` only (`FrameSchema`, `CredentialsBagSchema`, adapter-ID list types). It does **not** import from `@lgtm-buzzer/core` — there is no domain in this story. It does **not** import from `adapters` or `host` (forbidden anyway).

#### Wire-shape choices (binding)

| Choice | Decision |
|---|---|
| Framework | Vanilla TS + DOM, no React/Vue/Svelte. ~150 LOC budget. |
| Page entrypoint | WXT `entrypoints/options/index.html` + `entrypoints/options/main.ts` (auto-wires `manifest.options_ui`). |
| Storage backend | `chrome.storage.local` (NOT `sync` — credentials in cross-device sync is worse posture). |
| Storage key | Single key `"lgtm_buzzer.options.v1"` holding a JSON object (one read, one write per save). Versioned key lets future schemas migrate. |
| Storage schema | Validated with zod on every read; corrupt/missing storage → defaults. |
| Adapter discovery | `list-adapters-request` to host via the SW (the options page uses the same SW relay as the CS — no direct `connectNative` from the page). |
| Credential inputs | `<input type="password" autocomplete="off" spellcheck="false">` per required field; only rendered when the adapter requires credentials. |
| Test connection | v1 sends a `ping` frame with a fresh nonce; success when `pong.payload.nonce` matches. Adapter-specific probe deferred. |
| SW cache policy | No cache. Storage read on every `quiz-request` outbound. Simple, correct, ~µs cost. |
| First-run UX | Storage absent → SW sends defaults (`claude-cli` + `github`) with no credentials → host returns `missing-credentials` → modal shows "Configure in extension options" link. |
| New manifest permission | `"storage"` — required for `chrome.storage.local`. |
| Options page `<-->` SW protocol | Reuses the existing `CSRequest` `send-frame` envelope (the SW already handles `Frame` opaquely; works from any extension page, not just content scripts). |
| First-run defaults written? | No. Don't auto-write storage on install. Storage stays empty until the user saves. (Avoids confusing "Save successful but I didn't change anything" UX.) |

#### Per-adapter credential UI (binding)

The host's per-adapter zod schemas from ADR-22 are the contract. The options page mirrors them in a static lookup table (the host does not advertise schemas on the wire — ADR-22 §Consequences binding (f)):

| Adapter ID | Required fields rendered |
|---|---|
| `claude-cli` | none — show "no credentials required" note |
| `codex-cli` | none — show "no credentials required" note |
| `copilot-cli` | none — show "no credentials required" note |
| `claude-api` | `apiKey` (password input) |
| `github` | `pat` (password input) |
| `ado` | `pat` (password input) |

This static map lives in `packages/extension/src/lib/options/adapter-creds.ts`. When a new adapter lands, the dev updates both the host registry (ADR-22) and this table — a follow-up ADR may collapse them, but for v1 the duplication is explicit and the test suite catches drift.

If the host advertises an adapter ID the options page doesn't know about, the dropdown still shows it (the host is the source of truth on availability); selecting it renders an empty "no credentials required" note and a small warning: "Unknown adapter — credentials may be required by the host." Selecting an unknown adapter is allowed (defensive, not breaking).

#### Types

##### `packages/extension/src/lib/options/schema.ts` (new)

```ts
import { z } from "zod";
import { CredentialsBagSchema } from "@lgtm-buzzer/protocol";

/** Versioned storage schema. Increment SCHEMA_VERSION + write a migrator on shape changes. */
export const STORAGE_KEY = "lgtm_buzzer.options.v1" as const;
export const SCHEMA_VERSION = 1 as const;

/**
 * Per-adapter credentials map.
 *
 * Keyed by adapter ID so the user does not lose a saved PAT when they
 * switch from `github` to `ado` and back. Each entry is itself an
 * opaque `CredentialsBag` (from protocol).
 */
export const StoredCredentialsMapSchema = z.record(z.string(), CredentialsBagSchema);
export type StoredCredentialsMap = z.infer<typeof StoredCredentialsMapSchema>;

export const StoredOptionsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  llmAdapterId: z.string().min(1).optional(),
  vcsAdapterId: z.string().min(1).optional(),
  credentials: StoredCredentialsMapSchema.optional(),
});
export type StoredOptions = z.infer<typeof StoredOptionsSchema>;

/** Defaults applied when storage is empty or corrupt. */
export const DEFAULT_OPTIONS: StoredOptions = {
  schemaVersion: SCHEMA_VERSION,
  // llmAdapterId / vcsAdapterId / credentials intentionally undefined —
  // the SW falls back to ADR-22 host defaults when absent.
};
```

**Why one nested object under one key?** Single read + single write per save = atomic. The PM spec listed three keys (`llmAdapterId`, `vcsAdapterId`, `credentials`); the ADR consolidates to one root key under a `schemaVersion` envelope. This is a deliberate variance from the spec to (a) make schema evolution cheap and (b) match the standard "one storage key per extension domain" pattern. The PM spec's intent (separable fields, zod-validated) is preserved — they just live inside one envelope.

##### `packages/extension/src/lib/options/storage.ts` (new)

```ts
export type StorageError =
  | { readonly kind: "absent" }
  | { readonly kind: "corrupt"; readonly issues: ReadonlyArray<string> }
  | { readonly kind: "io"; readonly detail: string };

export type OptionsStore = {
  /**
   * Read the stored options. Always resolves; corrupt or absent storage
   * yields `Left<{ kind }>`. The SW maps `Left` → use defaults.
   */
  readonly read: () => Promise<Either<StorageError, StoredOptions>>;
  /**
   * Write the stored options atomically. Rejects only on quota / IO.
   * Resolves with `Right<void>` on success.
   */
  readonly write: (options: StoredOptions) => Promise<Either<StorageError, void>>;
  /** Clear all stored options. Used by tests + a "reset" UI button. */
  readonly clear: () => Promise<Either<StorageError, void>>;
};

/**
 * Minimal `chrome.storage.local`-shaped surface for injection.
 * Tests pass a fake; production passes `chrome.storage.local` from `wxt/browser`.
 */
export type StorageArea = {
  readonly get: (key: string) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
};

export const createOptionsStore = (deps: { readonly area: StorageArea }): OptionsStore;
```

The `Either` type is the project's standard from `monadyssey`. The extension workspace is allowed to reach for monadyssey "when a specific piece of logic genuinely benefits" (CLAUDE.md §Dependency rules). Storage IO is one of those places — three error kinds + sync-vs-async make a `Promise<Either<E, A>>` shape clearer than a thrown error or a discriminated `{ ok, value | error }`. Document the use in `packages/extension/README.md`.

##### `packages/extension/src/lib/options/adapter-creds.ts` (new)

```ts
/** Static per-adapter credential UI specification (mirrors host registry from ADR-22). */
export type CredFieldSpec = {
  readonly key: string;        // The bag key, e.g. "apiKey" / "pat".
  readonly label: string;      // The UI label.
  readonly placeholder: string;
};

export type AdapterCredsSpec = {
  readonly adapterId: string;
  readonly category: "llm" | "vcs";
  readonly fields: ReadonlyArray<CredFieldSpec>;
  readonly note?: string;      // e.g. "no credentials required"
};

export const ADAPTER_CREDS_SPECS: ReadonlyArray<AdapterCredsSpec> = [
  { adapterId: "claude-cli",  category: "llm", fields: [], note: "no credentials required" },
  { adapterId: "codex-cli",   category: "llm", fields: [], note: "no credentials required" },
  { adapterId: "copilot-cli", category: "llm", fields: [], note: "no credentials required" },
  { adapterId: "claude-api",  category: "llm",
    fields: [{ key: "apiKey", label: "API key", placeholder: "sk-ant-..." }] },
  { adapterId: "github", category: "vcs",
    fields: [{ key: "pat", label: "Personal access token", placeholder: "ghp_..." }] },
  { adapterId: "ado", category: "vcs",
    fields: [{ key: "pat", label: "Personal access token", placeholder: "azp_..." }] },
];

export const getCredsSpec = (adapterId: string): AdapterCredsSpec | undefined =>
  ADAPTER_CREDS_SPECS.find((s) => s.adapterId === adapterId);
```

##### `packages/extension/src/lib/options/probe.ts` (new)

```ts
export type ProbeError =
  | { readonly kind: "host-not-installed" }
  | { readonly kind: "nonce-mismatch" }
  | { readonly kind: "internal";    readonly message: string }
  | { readonly kind: "host-error";  readonly reason: string; readonly message: string };

export type Probe = (input: {
  readonly llmAdapterId: string;
  readonly vcsAdapterId: string;
  readonly credentials: CredentialsBag;
}) => Promise<Either<ProbeError, "ok">>;

export const createProbe = (deps: {
  readonly sendFrame: (frame: Frame) => Promise<Frame>;
  readonly newCorrelationId: () => string;
  readonly newNonce: () => string;
}): Probe;
```

**v1 binding**: the probe sends a `ping` frame with a fresh nonce and asserts a `pong` reply with the matching nonce. The `llmAdapterId` / `vcsAdapterId` / `credentials` are accepted in the input only for forward compatibility — a follow-up issue (deferred, not blocking M3) will swap `ping` for a real adapter-probe frame that the host runs through the registry. The probe input is wired today so the UI does not change when that swap happens.

##### `packages/extension/src/lib/options/dom.ts` (new)

```ts
export type OptionsDOMDeps = {
  readonly doc: Document;
  readonly root: HTMLElement;
  readonly store: OptionsStore;
  readonly listAdapters: () => Promise<Either<ListAdaptersError, AdapterCatalog>>;
  readonly probe: Probe;
  readonly logger?: { readonly warn: (msg: string, ctx?: Record<string, unknown>) => void };
};

export type AdapterCatalog = { readonly llm: readonly string[]; readonly vcs: readonly string[] };

export type ListAdaptersError =
  | { readonly kind: "host-not-installed" }
  | { readonly kind: "host-error"; readonly reason: string; readonly message: string }
  | { readonly kind: "internal";   readonly message: string };

export type OptionsView = {
  readonly mount: () => Promise<void>;
  readonly unmount: () => void;
};

export const createOptionsView = (deps: OptionsDOMDeps): OptionsView;
```

The DOM module renders into a caller-supplied `root` element (the entrypoint's `<main>`), so the unit tests can mount it inside a jsdom `Document` without touching `document.body`.

##### `packages/extension/src/lib/options/sw-bridge.ts` (new)

```ts
/**
 * Sends a Frame to the SW from the options page via `chrome.runtime.sendMessage`.
 * Identical contract to the CS-side `sendFrame` in `entrypoints/content.ts` —
 * extracted here so the options page does not duplicate the wrapper.
 *
 * The CS-side wrapper stays in `entrypoints/content.ts` for now; a follow-up
 * may unify them into a single `packages/extension/src/lib/sw-bridge.ts`.
 */
export const createSWBridge = (deps: {
  readonly sendMessage: (msg: unknown) => Promise<unknown>;
}): { readonly sendFrame: (frame: Frame) => Promise<Frame> };

/** Wraps `sendFrame` into a `list-adapters-request` round-trip with typed errors. */
export const createListAdapters = (deps: {
  readonly sendFrame: (frame: Frame) => Promise<Frame>;
  readonly newCorrelationId: () => string;
}): () => Promise<Either<ListAdaptersError, AdapterCatalog>>;
```

##### `packages/extension/src/lib/options/storage-reader.ts` (new) — used by the SW

```ts
/**
 * Read stored options from chrome.storage.local. Used by the SW on every
 * outbound `quiz-request` to inline `llmAdapterId` / `vcsAdapterId` / `credentials`.
 *
 * Returns the *projection* needed by the SW — not the full `StoredOptions` — so
 * the SW does not have to know about `schemaVersion` etc.
 */
export type SwOptionsProjection = {
  readonly llmAdapterId: string | undefined;
  readonly vcsAdapterId: string | undefined;
  readonly credentials: CredentialsBag | undefined;
};

export const readSwOptions = (deps: {
  readonly store: OptionsStore;
}): () => Promise<SwOptionsProjection>;
```

On `Left` (`absent`, `corrupt`, `io`), the projection returns `{ llmAdapterId: undefined, vcsAdapterId: undefined, credentials: undefined }`. The host then applies its ADR-22 defaults; if those defaults need credentials and none are present, the host returns `missing-credentials` and the modal's existing error-result rendering path fires.

##### SW change — `entrypoints/background.ts` + `packages/extension/src/lib/router.ts`

The SW must inject the storage projection into outbound `quiz-request` frames **only**. Other frames (`ping`, `quiz-submit`, `list-adapters-request`) pass through untouched (`quiz-submit` already carries a `quizId` keying the host-side session — re-injecting creds there would be a credential re-leak surface for no value).

The cleanest place to splice this in is the **router** (`createCSMessageHandler`): before calling `portClient.sendFrame`, if `request.frame.kind === "quiz-request"`, read storage and replace `frame.payload` with the merged object. A new dep on `createCSMessageHandler` carries the storage reader:

```ts
export type RouterDeps = {
  readonly portClient: PortClient;
  readonly readSwOptions: () => Promise<SwOptionsProjection>;   // NEW
  readonly logger?: RouterLogger;
};
```

The merge rule:

```ts
const merged: QuizRequestPayload = {
  ...request.frame.payload,
  // Storage-supplied values OVERRIDE any payload the CS already set.
  // (The CS does not currently set these — but if a future content script
  // wanted to, the options page must remain authoritative.)
  llmAdapterId: projection.llmAdapterId ?? request.frame.payload.llmAdapterId,
  vcsAdapterId: projection.vcsAdapterId ?? request.frame.payload.vcsAdapterId,
  credentials:  projection.credentials  ?? request.frame.payload.credentials,
};
```

If `projection.credentials` and `request.frame.payload.credentials` both exist, the projection wins. (Per-adapter credentials live under their adapter ID in `StoredCredentialsMap`; the SW projects only the entry for the chosen `llmAdapterId` + `vcsAdapterId`, merged into a single bag.) The projection helper handles the merge:

```ts
// inside readSwOptions
const llmCreds = options.credentials?.[options.llmAdapterId ?? ""] ?? {};
const vcsCreds = options.credentials?.[options.vcsAdapterId ?? ""] ?? {};
const credentials = { ...llmCreds, ...vcsCreds };
return {
  llmAdapterId: options.llmAdapterId,
  vcsAdapterId: options.vcsAdapterId,
  credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
};
```

**Conflict policy**: if the LLM creds and VCS creds both define the same key (e.g., both define `pat`), the VCS creds win because they are merged last. This is fine for v1 — the only overlapping field in the registry is `pat`, and only VCS adapters define it. If LLM and VCS adapters ever conflict on a key, ADR-22's per-adapter zod still validates each adapter's slice; the host slices the wire bag back per-adapter at construction time, so the field overlap is benign on the wire (the host does not get to see "this `pat` came from the github adapter"). To avoid relying on this fragility past v1, a follow-up issue may shift the wire format to a nested `credentials: { llm: ..., vcs: ... }` shape — out of scope here.

#### Functions and methods

`packages/extension/src/lib/options/storage.ts`:

```ts
export const createOptionsStore = (deps: { readonly area: StorageArea }): OptionsStore;
```

`packages/extension/src/lib/options/storage-reader.ts`:

```ts
export const readSwOptions = (deps: { readonly store: OptionsStore }): () => Promise<SwOptionsProjection>;
```

`packages/extension/src/lib/options/sw-bridge.ts`:

```ts
export const createSWBridge = (deps: {
  readonly sendMessage: (msg: unknown) => Promise<unknown>;
}): { readonly sendFrame: (frame: Frame) => Promise<Frame> };

export const createListAdapters = (deps: {
  readonly sendFrame: (frame: Frame) => Promise<Frame>;
  readonly newCorrelationId: () => string;
}): () => Promise<Either<ListAdaptersError, AdapterCatalog>>;
```

`packages/extension/src/lib/options/probe.ts`:

```ts
export const createProbe = (deps: {
  readonly sendFrame: (frame: Frame) => Promise<Frame>;
  readonly newCorrelationId: () => string;
  readonly newNonce: () => string;
}): Probe;
```

`packages/extension/src/lib/options/dom.ts`:

```ts
export const createOptionsView = (deps: OptionsDOMDeps): OptionsView;
```

`packages/extension/src/lib/options/adapter-creds.ts`:

```ts
export const getCredsSpec = (adapterId: string): AdapterCredsSpec | undefined;
```

`packages/extension/src/lib/router.ts` — modified `createCSMessageHandler` signature:

```ts
export type RouterDeps = {
  readonly portClient: PortClient;
  readonly readSwOptions: () => Promise<SwOptionsProjection>;   // NEW
  readonly logger?: RouterLogger;
};
```

#### File layout

**New (extension)**:

- `packages/extension/entrypoints/options/index.html`
- `packages/extension/entrypoints/options/main.ts`
- `packages/extension/src/lib/options/schema.ts` + `.test.ts`
- `packages/extension/src/lib/options/storage.ts` + `.test.ts`
- `packages/extension/src/lib/options/storage-reader.ts` + `.test.ts`
- `packages/extension/src/lib/options/sw-bridge.ts` + `.test.ts`
- `packages/extension/src/lib/options/probe.ts` + `.test.ts`
- `packages/extension/src/lib/options/adapter-creds.ts` + `.test.ts`
- `packages/extension/src/lib/options/dom.ts` + `.test.ts`
- `packages/extension/src/lib/options/index.ts` — barrel for the entrypoint.

**Modified (extension)**:

- `packages/extension/wxt.config.ts` — add `"storage"` to `manifest.permissions`. (Do **not** add `options_ui`/`options_page` manually — WXT auto-detects the `entrypoints/options/` folder and synthesizes `options_page: "options.html"`. Verify by inspecting `.output/<browser>-mv3/manifest.json` after `wxt build`.)
- `packages/extension/src/lib/router.ts` — add `readSwOptions` dep; inject projection into `quiz-request` payload.
- `packages/extension/src/lib/router.test.ts` — new cases (see Test strategy).
- `packages/extension/entrypoints/background.ts` — construct `OptionsStore` + `readSwOptions` and pass into `createCSMessageHandler`.
- `packages/extension/package.json` — add `monadyssey` (pinned exact version, same as adapters use) per CLAUDE.md §Dependency rules — `Either` for the options storage layer.
- `packages/extension/README.md` — new section "Options page" with: storage posture (plaintext, not encrypted), where the file lives, link to ADR-22 + ADR-23, planned future ADR for OS-keychain.

**Modified (modal — minor copy)**:

- `packages/extension/src/lib/dom/modal.ts` — when `error` outcome carries `reason: "missing-credentials"` or `reason: "bad-credentials"`, render a copy line: "Configure credentials in the LGTM-Buzzer options page" with an `<a href="#" data-action="open-options">` that, on click, dispatches a `DOMEvent` that the CS forwards to the SW which opens the options page via `chrome.runtime.openOptionsPage()`. **Scope guard**: only the copy + click-through wiring is in this ADR; if the wiring grows beyond ~30 LOC, defer it to a separate issue. The "open options" action requires no new permissions.
- `packages/extension/src/lib/dom/modal.test.ts` — assert the copy renders on the two error reasons.

**Unchanged**:

- `packages/protocol/**` — no changes.
- `packages/core/**` — no changes.
- `packages/host/**` — no changes.
- `packages/adapters/**` — no changes.

#### Sequence

##### A. Options page first load

1. User opens `chrome-extension://<id>/options.html` (via the toolbar icon's "Options" link or the modal's "Configure credentials" link).
2. `main.ts` constructs:
   - `area = browser.storage.local` (wrapped to the `StorageArea` shape).
   - `store = createOptionsStore({ area })`.
   - `sendMessage = browser.runtime.sendMessage`.
   - `bridge = createSWBridge({ sendMessage })`.
   - `listAdapters = createListAdapters({ sendFrame: bridge.sendFrame, newCorrelationId: crypto.randomUUID })`.
   - `probe = createProbe({ sendFrame: bridge.sendFrame, newCorrelationId: crypto.randomUUID, newNonce: crypto.randomUUID })`.
   - `view = createOptionsView({ doc: document, root: document.querySelector("main")!, store, listAdapters, probe })`.
3. `view.mount()`:
   - Calls `store.read()` to hydrate the form. On `Left<absent>`, fall back to defaults (no prior selection).
   - Calls `listAdapters()` to populate the two `<select>` elements.
     - On `Left<host-not-installed>`: render an instructive banner ("Native host not installed. Run `node packages/host/dist/install-manifest.js` and reload.").
     - On `Left<host-error>`: render a banner with the host's `reason` + `message`.
     - On `Right`: populate the dropdowns; pre-select the stored values if present.
   - Renders the credential inputs corresponding to the currently selected adapter pair (per `getCredsSpec`).
4. Dropdown change handlers re-render only the credential inputs (no full re-mount).
5. Save handler validates form input via `StoredOptionsSchema.safeParse(...)`, calls `store.write(options)`, renders a dismissable green check "Save successful".
6. Test connection handler reads the form's current state (NOT storage — the user may not have saved yet), calls `probe({ llmAdapterId, vcsAdapterId, credentials })`. Renders success / error banner. The banner copy NEVER includes credential bytes; on `Left<host-error>` show `reason` + `message` from the host's error frame; the host already redacts credentials per ADR-22 §Binding (a).

##### B. SW reads storage on every quiz-request

1. CS detects Approve click → builds a `quiz-request` `Frame` with `payload: { pr, questionCount }` (no adapter fields, no creds — the CS knows nothing about user prefs).
2. CS calls `browser.runtime.sendMessage({ kind: "send-frame", frame })`.
3. SW's `createCSMessageHandler` validates the message, then:
   - If `frame.kind === "quiz-request"`: `const projection = await readSwOptions()`. Merge `projection` into `frame.payload`. Call `portClient.sendFrame(mergedFrame, tabId)`.
   - Else (other kinds): pass through unchanged.
4. Host receives the merged `quiz-request`, applies ADR-22 defaults if any field still absent, constructs adapter pair per-request, runs the quiz pipeline.
5. SW relays the reply back to the CS unchanged.

##### C. Modal "Configure in options" link

1. Modal receives a `quiz-result` DOM event with `outcome.kind === "error"`, `outcome.reason === "missing-credentials"`.
2. Modal renders the existing error panel + an additional "Configure credentials in the LGTM-Buzzer options page" link.
3. User clicks → emit a `DOM_EVENTS.openOptions` event with no payload.
4. CS catches the event → `browser.runtime.sendMessage({ kind: "open-options" })`.
5. SW handles `open-options` → calls `browser.runtime.openOptionsPage()`.

(`DOM_EVENTS.openOptions` is a new event name; the CS-side wiring stays under the ~30-LOC scope guard. If it grows, file a follow-up.)

##### Diff-flow audit (required by CLAUDE.md §Key differentiator)

The options page sees no PR data. `payload.credentials` is the only non-`pr` field on `quiz-request`; the SW only adds adapter selection + credentials; the host already enforces that `credentials` never reaches prompt construction (ADR-22). No path in this ADR touches PR text. **Diff-only invariant preserved.**

#### Error cases

| Trigger | UX |
|---|---|
| `list-adapters` fails with `host-not-installed` (port connect threw / no manifest) | Banner: "Native host not installed. Run the installer and reload." Dropdowns disabled. Save disabled. |
| `list-adapters` returns `host-error` (any other) | Banner: "Failed to load adapters: \<message>". Retry button. |
| `store.read()` returns `Left<corrupt>` | Toast: "Stored options were corrupt and have been reset." Defaults loaded. (The reviewer asserts that "corrupt" is not silently swallowed.) |
| `store.write()` returns `Left<io>` (quota / disabled) | Banner: "Failed to save options: \<message>". |
| `probe` returns `Left<host-not-installed>` | Banner: "Test connection failed: native host not installed." |
| `probe` returns `Left<nonce-mismatch>` | Banner: "Test connection failed: host returned an unexpected response." |
| `probe` returns `Left<host-error>` with `reason: "bad-credentials"` | Banner: "Credentials rejected by the adapter. Re-enter and try again." (NEVER echo the credential.) |
| `probe` returns `Left<host-error>` with any other `reason` | Banner: "Test connection failed: \<message>". |
| Empty required field on Save | Inline error next to the field; Save blocked. |
| User selects an adapter the host did not advertise (e.g., dev typed it into storage manually) | Warning banner: "Unknown adapter — credentials may be required by the host." |
| Modal sees `reason: "missing-credentials"` on a quiz request | Render the existing error UI + "Configure in options" link. |

All expected failures travel as `Promise<Either<E, A>>` (CLAUDE.md idiom #1). No `throw` in the options page modules except for invariant violations (e.g., missing `<main>` root in the HTML, which is a programmer error).

#### Security guardrails (binding)

- Credential inputs use `type="password" autocomplete="off" spellcheck="false"`. Browser autofill stays under user control.
- `chrome.storage.local` is plaintext; the options-page README + an on-page footnote both state this (v1 limitation). No promises of encryption that we do not deliver.
- The options page **must not** `console.log` any credential or any object that may transitively contain credentials. Reviewer-enforced: greppable rule "no `console.log` of any object derived from form state or `store.read()`." The page may log adapter IDs and high-level events.
- Probe error banners surface only `reason` + `message` from the host's error frame. The host (ADR-22) already redacts credential bytes from those fields; no further filtering is needed on the extension side, but the reviewer should assert that no credential bytes appear in the rendered DOM (a canary unit test on the DOM module with a known-bad creds value asserts the rendered HTML does not contain the bytes).
- The `"storage"` permission grants access to all of the extension's `chrome.storage.local`. No other code in this extension reads from any other key; the SW reads only `STORAGE_KEY`. Reviewer-enforced via a grep test that `chrome.storage.local.get` is called only with `STORAGE_KEY`.

#### Test strategy

All tests use Vitest + jsdom (Vitest workspace already configured). No new tooling.

**`schema.test.ts`** (new, ≥5):
1. Empty storage → `read()` returns `Left<absent>`.
2. Valid stored options round-trip through `StoredOptionsSchema`.
3. Wrong `schemaVersion` → `Left<corrupt>`.
4. Non-string value inside `credentials` → `Left<corrupt>`.
5. `llmAdapterId: ""` (empty) → `Left<corrupt>`.

**`storage.test.ts`** (new, ≥6):
1. `read` of empty storage → `Left<absent>`.
2. `read` of valid stored options → `Right<StoredOptions>`.
3. `read` of corrupt JSON → `Left<corrupt>` with non-empty `issues`.
4. `write` of valid options → underlying `area.set` called with `{ [STORAGE_KEY]: <serialised> }`.
5. `write` failure (fake `set` throws) → `Left<io>`.
6. `clear` removes the key (`area.remove` called with `STORAGE_KEY`).

**`storage-reader.test.ts`** (new, ≥5):
1. Empty storage → projection is `{ llmAdapterId: undefined, vcsAdapterId: undefined, credentials: undefined }`.
2. Stored `{ llmAdapterId: "claude-api", credentials: { "claude-api": { apiKey: "x" } } }` → projection `{ llmAdapterId: "claude-api", vcsAdapterId: undefined, credentials: { apiKey: "x" } }`.
3. Stored LLM + VCS both with creds → projection merges both bags.
4. Stored `llmAdapterId` set but no `credentials` entry → `credentials: undefined` (do not emit empty `{}`).
5. Corrupt storage → projection is all-`undefined` (no `throw`).

**`sw-bridge.test.ts`** (new, ≥4):
1. `sendFrame` validates the SW reply against `CSResponseSchema`; well-formed `{ kind: "frame", frame }` → resolves with the frame.
2. SW reply `{ kind: "sw-error" }` → resolves with a synthetic `ErrorFrame` (matches the CS-side wrapper's contract).
3. `sendMessage` throws → resolves with a synthetic `ErrorFrame` (no rejection).
4. `createListAdapters` round-trips a `list-adapters-request` → `list-adapters-response`; returns `Right<{ llm, vcs }>`. Host-not-installed (sendFrame returns `ErrorFrame { reason: "internal", message: ... }` with the specific connect-failed signature) → `Left<host-not-installed>`.

**`probe.test.ts`** (new, ≥4):
1. Round-trips `ping` with nonce `"abc"` → host replies `pong` with `nonce: "abc"` → `Right<"ok">`.
2. Host replies `pong` with a different nonce → `Left<nonce-mismatch>`.
3. Host replies `ErrorFrame { reason: "bad-credentials", ... }` → `Left<host-error>` with the reason propagated. (v1 cannot actually trigger this with `ping`, but the mapping is wired now for the future swap.)
4. Connect failed → `Left<host-not-installed>`.

**`adapter-creds.test.ts`** (new, ≥3):
1. `getCredsSpec("claude-cli")` → fields empty, note "no credentials required".
2. `getCredsSpec("claude-api")` → fields contain exactly one entry `{ key: "apiKey" }`.
3. `getCredsSpec("unknown")` → `undefined`.

**`dom.test.ts`** (new, ≥10) — jsdom-driven:
1. Mount with empty storage + a fake `listAdapters` returning `{ llm: ["claude-cli", "claude-api"], vcs: ["github", "ado"] }` → both dropdowns populated, no pre-selection.
2. Selecting `claude-api` → credential input with placeholder `sk-ant-...` appears.
3. Selecting `claude-cli` → no input rendered, note "no credentials required" visible.
4. Filling in the form + clicking Save → `store.write` called with the expected `StoredOptions`.
5. Save → success banner rendered; dismiss button hides it.
6. Test-connection success → green banner.
7. Test-connection `bad-credentials` → red banner with the documented copy "Credentials rejected by the adapter."
8. List-adapters `host-not-installed` → instructive banner; dropdowns + save + test buttons disabled.
9. **Security canary**: form populated with credential `"SECRET_CANARY_xxx"`; probe rejected with `host-error { reason: "bad-credentials" }`; assert `document.body.innerHTML` does NOT contain `"SECRET_CANARY_xxx"`.
10. Selecting an unknown-to-the-spec adapter ID → warning banner; save still enabled.

**`router.test.ts`** — extend (≥3):
1. `quiz-request` with empty storage → SW forwards a `quiz-request` to the port client with `llmAdapterId/vcsAdapterId/credentials` all `undefined`.
2. `quiz-request` with stored `{ llmAdapterId: "claude-api", credentials: { "claude-api": { apiKey: "k" } } }` → SW forwards with `payload.llmAdapterId === "claude-api"` and `payload.credentials.apiKey === "k"`.
3. `ping` frame from a CS → SW passes it through unchanged (no storage read; no credential leakage to a `ping`).

**`modal.test.ts`** — extend (≥2):
1. `quiz-result` outcome `error { reason: "missing-credentials" }` → modal renders "Configure credentials in the LGTM-Buzzer options page" link.
2. Clicking the link emits the `openOptions` DOM event.

**Coverage**: ≥85% on every new file. The options page modules are mostly straight-line code; the targets are achievable without contrived branches.

**End-to-end**: deferred to #51. This PR ships no Playwright coverage for the options page. The dom.test.ts security canary plus the modal copy test are the v1 acceptance line for credential safety.

### Consequences

- **The user can now choose their adapter pair and supply credentials.** The host became wire-driven in ADR-22; this ADR makes the wire fields user-controllable in a real browser, closing the M3 prerequisite loop for #59 v2 (claude-api) and #48 (ADO).
- **No new runtime deps to `core` or `protocol`.** The extension adopts `monadyssey` (already an allowed dep per CLAUDE.md), pinned to the same exact version as the adapters use. This is the first place outside `adapters/host` where `monadyssey` ships in the extension.
- **`"storage"` permission added to the manifest.** Single new permission, fully documented. Listed in the Chrome Web Store description.
- **`chrome.storage.local` is plaintext.** Documented in the options page footnote + the extension README. A future ADR explores OS-keychain integration; explicitly out of scope.
- **SW reads storage on every quiz-request.** Simplicity wins over caching. The cost is one `chrome.storage.local.get` per Approve click; that is microseconds and runs in parallel with the rest of the request assembly. If profiling shows this dominates, ADR-N+1 adds a TTL cache.
- **One stored key, versioned envelope.** `lgtm_buzzer.options.v1`. Schema bumps replace the key suffix and write a migrator. (v1 → v2 migration is out of scope; the contract just says the SW always reads the current-version key.)
- **Modal grows a "Configure in options" link.** Small change; copy-tested via jsdom. The "open options page" plumbing through CS → SW → `chrome.runtime.openOptionsPage()` adds three small wires; if any of them grow, defer to a follow-up.
- **`monadyssey-fetch` is NOT added to the extension.** The probe goes through the existing native-messaging pipeline, not HTTP. Future probe flavours (HTTP from the options page) would need a separate ADR — the current dependency rules don't expect raw `fetch` in the extension.
- **First-run UX is "missing-credentials" guided.** No auto-write of defaults to storage on install. The user opening the modal triggers `missing-credentials` → modal copy points them to options. This is intentional friction; "you must configure credentials" is the only correct posture for a tool that holds PATs.
- **Reversibility high.** The options page lives behind one entrypoint folder. Removing the feature (rolling back to env-driven host config) is one folder delete + one router-dep removal + manifest permission drop. Storage cleanup is `chrome.storage.local.clear()` once.
- **Diff-only invariant preserved.** No path from this ADR introduces non-diff PR text to the prompt. Credentials and adapter IDs are user identity, not PR content. Verified by code-path audit in §Sequence-D.

**Binding for the reviewer**:
- (a) The options page MUST NOT log or render credential bytes. Canary test asserts (dom.test.ts §9).
- (b) The SW MUST inject the storage projection ONLY into `quiz-request` frames. Other frame kinds pass through. Router test §3 asserts.
- (c) The SW MUST NOT cache the storage read. Each quiz-request causes a fresh `chrome.storage.local.get`. (Future cache requires a new ADR.)
- (d) `chrome.storage.local.get` MUST be called only with `STORAGE_KEY` from this ADR. Greppable rule.
- (e) No new permission beyond `"storage"`. The "open options page" wire uses the existing `chrome.runtime.openOptionsPage()` API which needs no permission.
- (f) Storage corruption MUST surface to the UI (toast or banner) — never silently overwritten with defaults without telling the user.
- (g) No new `throw` outside invariant violations; all expected failures route through `Promise<Either<E, A>>`.

---

## ADR-24 (2026-05-22): Quiz modal polish — state machine, error UX, accessibility
**Date**: 2026-05-22
**Issue**: #53
**Status**: Accepted

### Context

M2 (ADR-18) shipped the modal as a functional skeleton: idle → loading → quiz-active → submitting → result → error, with one spinner, one generic error banner, one Esc-to-dismiss handler, and ADR-23's `missing-credentials` / `bad-credentials` "Configure options" link bolted on. The modal is correct on the happy path but a bare prototype on the failure paths and the keyboard / screen-reader paths.

Five forces shape this story:

- **Error-class explosion from ADR-22.** The wire-level `ErrorReason` enum grew from 4 to 9 reasons: `schema-violation`, `unknown-message`, `version-mismatch`, `internal`, `unknown-quiz-id`, plus the ADR-22 additions `unsupported-llm-adapter`, `unsupported-vcs-adapter`, `bad-credentials`, `missing-credentials`. The modal currently treats every reason except the two credential ones as "generic error" — useless for diagnosis. Each reason has a distinct remediation (configure adapter, configure credentials, reinstall host, retry, give up).
- **Extension-internal transport failures share one wire reason.** `port.ts` and `quiz-flow.ts` synthesize their own error frames for host-disconnect, host-no-response (timeout), unexpected-reply-kind, sendFrame-threw, and invalid-SW-response — every one tagged `reason: "internal"` because the wire enum has no other slot. The modal needs to distinguish these from genuine host-returned `internal` errors so it can show a "Retry" affordance on transport failures without offering retry on a host crash.
- **Accessibility is currently 30%.** The modal sets `role="dialog"` and `aria-modal="true"`, has Esc-to-dismiss, but: no focus trap, no `aria-labelledby`, no `aria-live` announcements of state changes, no keyboard-discoverable controls in the `quiz-active` state beyond Tab/Space (which works by default but is undocumented). WCAG AA is achievable here without a library; this ADR commits to AA, documents AAA as aspirational.
- **No protocol-level cancellation in v1.** The wire protocol has no `quiz-cancel` frame. Today the modal's Cancel button drops the pending state on the CS side and lets the SW's 60s timeout clean up — but the host keeps generating, burning LLM tokens. Adding a `quiz-cancel-request` frame is a protocol change with host fiber-cancellation work and a new round of cross-package tests; it would balloon this PR and is the wrong scope for "modal polish." Defer to a follow-up issue.
- **Retry must not regress idempotency.** Re-fetching a quiz on retry is a new `quiz-request` frame with a **new** correlationId — the original request is dead (its SW-side correlation entry timed out or its host fiber finished and the reply was dropped). Retry must not reuse the old correlation map slot.

The PM spec already resolved several questions (state list, error → UI mapping examples, defer protocol-level cancel, AA-not-AAA). This ADR commits them and adds the missing technical detail: the **classified error model** that bridges wire reasons + extension-internal transport reasons; the **state machine refactor** that explicitly adds `submitting` and treats `passed` / `failed` / `error` as separate top-level states; the **focus-trap algorithm**; the **retry contract**; and the **aria-live announcement strategy**.

### Decision

1. **A renamed, normalised state machine** lives in the modal: `idle | generating | ready | submitting | passed | failed | error`. The current `loading` becomes `generating`; `quiz-active` becomes `ready`; the conjoined `result { passed: boolean }` splits into `passed` and `failed` as distinct kinds so render code is exhaustive without nested `if`s.

2. **A classified error model** lives in the modal layer (extension-only, not in `protocol`). Define `DisplayErrorClass` — a discriminated union covering both wire `ErrorReason` values and three new extension-internal classes (`host-unreachable`, `host-timeout`, `host-unexpected-reply`) that today get flattened into `reason: "internal"`. The quiz-flow controller emits the existing `outcome { kind: "error", reason, message }` shape unchanged on the wire, but the modal classifies the `(reason, message)` pair into a `DisplayErrorClass` via a pure mapper. This avoids a wire-protocol bump while letting the UI distinguish transport from host-internal failures.

3. **Per-class UI specification** (title, body, optional CTA) lives in a `errorClassToUI(cls): ErrorUISpec` pure function. The CTA is one of: `retry` (re-emits a fresh `quiz-request`), `open-options` (existing ADR-23 wire), `install-host` (links to install instructions, opens a new tab), `dismiss` (just closes).

4. **Retry semantics**:
   - On `retry` CTA click in state `error`, the modal emits a new DOM event `lgtm-buzzer:quiz-retry { requestId }` (additive — no breaking change to the existing event bus).
   - The CS controller (`quiz-flow.ts`) handles `quiz-retry`: re-resolves the pending Approve (if still tracked) or, if dropped, looks up the PR identifier from `currentPR` and starts a fresh `onBlocked` flow with a **new requestId + new correlationId**. The old correlation slot, if any, was already drained on the error.
   - No automatic retries. CLAUDE.md §Functional idiom #3 says "retries use `Schedule`, not hand-rolled loops" — but **user-driven retry is not the same as automatic retry**. `Schedule` belongs in the **host** for transient LLM/HTTP errors (where the user is not in the loop). The modal's Retry button is a one-click manual retry; no `Schedule` involvement.
   - This is a deliberate variance from the PM acceptance criterion that says "Retry uses monadyssey Schedule semantics on the extension side or in the host — architect picks." Architect picks: **host**, in a follow-up issue for LLM-adapter-level retry. The modal stays simple: one click = one new request.

5. **Accessibility upgrades**: focus trap on the `.panel`, focus restoration on close, `aria-labelledby` pointing to the modal heading, `aria-live="polite"` region for state transitions (announces "Generating quiz" / "Quiz ready, N questions" / "Checking answers" / "Quiz passed" / "Quiz failed" / "Error: <title>"), `<fieldset>` + `<legend>` for each question, programmatic focus on the first focusable element after each state transition.

6. **Cancel during `generating`** ships as **Option A** (modal-side drop only): the modal emits the existing `quiz-cancel`, the CS drops the pending state, the SW's 60s timeout cleans the host correlation, the host fiber runs to completion and its reply is discarded. This wastes LLM cycles. Mitigation: file follow-up issue for `quiz-cancel-request` wire frame + host fiber cancellation (Option B). This ADR documents the limitation prominently in the cancel button's `aria-describedby` text? No — that would be user-hostile. Document in `packages/extension/README.md` and in the follow-up issue body.

7. **No new protocol changes.** No new wire frames. No new ErrorReason values. The new `quiz-retry` DOM event is intra-CS only and does not cross the SW boundary.

8. **No new runtime dependencies.** All work is hand-rolled DOM + CSS within the existing shadow root. The focus trap is ~30 LOC of vanilla DOM. The `aria-live` region is a single `<div role="status" aria-live="polite">`.

#### Affected workspaces

- `packages/extension/` — primary work:
  - `src/lib/dom/modal.ts` — refactored state machine, classified error rendering, focus trap, aria-live region, retry CTA wiring.
  - `src/lib/dom/error-classes.ts` (new) — `DisplayErrorClass`, `classifyError`, `errorClassToUI`.
  - `src/lib/dom/focus-trap.ts` (new) — focus-trap factory with `activate` / `deactivate`.
  - `src/lib/dom/dom-events.ts` — adds `DOM_EVENTS.quizRetry` constant + `QuizRetryEventDetailSchema`.
  - `src/lib/dom/quiz-flow.ts` — handles `quiz-retry`: looks up `pending` (if alive) or `currentPR`, re-emits a fresh `quiz-request` flow.
  - Existing test files extended; one new test file per new module.
- `packages/protocol/` — **no changes**. The wire protocol is stable. New display classes live in the extension's classification layer.
- `packages/core/` — no changes. Modal is pure UI; no domain.
- `packages/host/`, `packages/adapters/*` — no changes.

**Dependency arrows reaffirmed**:
```
protocol  ← core  ← adapters  ← host
protocol  ← core  ← extension
```

`error-classes.ts` imports `ErrorReason` from `@lgtm-buzzer/protocol` (type only) and re-exports a richer union internal to the extension. No new cross-workspace imports.

#### State machine (binding)

```
idle
 └─[quiz-request DOM event]─> generating
                                ├─[outcome:quiz-ready]─> ready
                                ├─[outcome:error]─> error
                                ├─[Cancel button | Esc]─> idle  (emits quiz-cancel)
ready
 ├─[Submit button (all answered)]─> submitting (emits quiz-submit)
 ├─[Cancel button | Esc]─> idle  (emits quiz-cancel)
submitting
 ├─[outcome:quiz-passed]─> passed
 ├─[outcome:quiz-failed]─> failed
 ├─[outcome:error]─> error
 ├─[Esc]─> idle  (emits quiz-cancel; submit reply dropped if late)
passed
 └─[Dismiss button | Esc]─> idle  (no quiz-cancel — submission completed)
failed
 ├─[Try Again button]─> generating  (emits quiz-retry)
 └─[Dismiss button | Esc]─> idle  (emits quiz-cancel)
error
 ├─[Retry CTA]─> generating  (emits quiz-retry)
 ├─[Open Options CTA]─> idle  (emits open-options + quiz-cancel)
 ├─[Install Host CTA]─> idle  (opens external URL + quiz-cancel)
 └─[Dismiss button | Esc]─> idle  (emits quiz-cancel)
```

Re-submit replay correctness: the CS's `replayApprove` path (ADR-18) fires synchronously on receipt of `quiz-passed` — **before** the modal transitions to `passed`. The user sees the green banner; the GitHub/ADO Approve has already gone through. The Dismiss button in `passed` just closes the modal. No regression vs current behavior.

#### Types

##### `packages/extension/src/lib/dom/error-classes.ts` (new)

```ts
import type { ErrorReason } from "@lgtm-buzzer/protocol";

/**
 * Display-layer classification of any error surfaced to the modal.
 *
 * The first four classes are extension-internal — they cover transport
 * failures that today get flattened into `reason: "internal"` with a
 * marker `message` from `port.ts` / `quiz-flow.ts`. The remaining classes
 * are 1:1 with the protocol's `ErrorReason` enum.
 *
 * This type does NOT cross the SW boundary; it is the modal's local view.
 */
export type DisplayErrorClass =
  // Extension-internal transport classes (synthesised from "internal" reason)
  | { readonly kind: "host-unreachable" }
  | { readonly kind: "host-timeout" }
  | { readonly kind: "host-unexpected-reply"; readonly replyKind: string }
  | { readonly kind: "transport-internal"; readonly detail: string }
  // Wire-level reasons (mirror protocol.ErrorReason 1:1)
  | { readonly kind: "schema-violation" }
  | { readonly kind: "unknown-message" }
  | { readonly kind: "version-mismatch" }
  | { readonly kind: "internal" }            // genuine host-side internal
  | { readonly kind: "unknown-quiz-id" }
  | { readonly kind: "unsupported-llm-adapter" }
  | { readonly kind: "unsupported-vcs-adapter" }
  | { readonly kind: "bad-credentials" }
  | { readonly kind: "missing-credentials" };

/** The action a CTA performs. */
export type ErrorCTAAction =
  | { readonly kind: "retry" }
  | { readonly kind: "open-options" }
  | { readonly kind: "install-host"; readonly url: string }
  | { readonly kind: "dismiss" };

/** What the error renderer needs to know to draw the panel. */
export type ErrorUISpec = {
  readonly title: string;
  readonly body: string;
  readonly cta?: { readonly label: string; readonly action: ErrorCTAAction };
};

/**
 * Maps a `(reason, message)` pair from the wire `outcome.error` into a
 * `DisplayErrorClass`. The mapping rule for transport-internal reasons:
 * `port.ts` / `quiz-flow.ts` already emit specific marker strings in
 * `message` ("host disconnected", "host did not respond", "Unexpected
 * reply kind: X", "sendFrame threw: ...", "invalid SW response",
 * "connect failed: ..."). This function recognises those markers and
 * promotes them to dedicated classes. Anything else with
 * `reason === "internal"` falls back to `transport-internal`.
 *
 * Pure — no side effects.
 */
export const classifyError = (
  reason: ErrorReason,
  message: string,
): DisplayErrorClass;

/**
 * Pure mapping from a display class to the UI it should render.
 * Centralises the user-facing copy + CTA in one place; the renderer
 * just paints the result.
 */
export const errorClassToUI = (cls: DisplayErrorClass): ErrorUISpec;
```

##### `packages/extension/src/lib/dom/focus-trap.ts` (new)

```ts
/**
 * A focus trap confines Tab / Shift+Tab to the focusable descendants
 * of a container. Used to keep keyboard navigation inside the modal
 * panel while the modal is open.
 *
 * Activation:
 * - Records `previouslyFocused = doc.activeElement`.
 * - Focuses the first focusable element inside `container`.
 * - Attaches a `keydown` listener that wraps Tab / Shift+Tab.
 *
 * Deactivation:
 * - Detaches the listener.
 * - Restores focus to `previouslyFocused` (if still in the DOM).
 *
 * Focusable selector covers: `a[href]`, `button:not([disabled])`,
 * `input:not([disabled])`, `select:not([disabled])`,
 * `textarea:not([disabled])`, `[tabindex]:not([tabindex="-1"])`.
 *
 * Shadow-DOM-aware: the container is the shadow root of the modal host,
 * and the selector runs against `shadow.querySelectorAll(...)`.
 */
export type FocusTrap = {
  /** Attach the trap and move focus into the container. */
  readonly activate: () => void;
  /** Detach the trap and restore focus. Idempotent. */
  readonly deactivate: () => void;
};

export type FocusTrapDeps = {
  readonly doc: Document;
  readonly container: HTMLElement | ShadowRoot;
};

export const createFocusTrap = (deps: FocusTrapDeps): FocusTrap;
```

##### `packages/extension/src/lib/dom/dom-events.ts` (modified)

Add a fifth namespaced DOM event for retry:

```ts
export const DOM_EVENTS = {
  quizRequest: "lgtm-buzzer:quiz-request",
  quizResult:  "lgtm-buzzer:quiz-result",
  quizSubmit:  "lgtm-buzzer:quiz-submit",
  quizCancel:  "lgtm-buzzer:quiz-cancel",
  quizRetry:   "lgtm-buzzer:quiz-retry", // NEW
} as const;

/**
 * Detail carried by `lgtm-buzzer:quiz-retry` (modal → CS).
 *
 * Fired when the user clicks Retry in `error` state or Try Again in
 * `failed` state. The CS re-emits a fresh `quiz-request` with a new
 * requestId and correlationId.
 */
export const QuizRetryEventDetailSchema = z.object({
  requestId: z.string().min(1),
});
export type QuizRetryEventDetail = z.infer<typeof QuizRetryEventDetailSchema>;
```

##### `packages/extension/src/lib/dom/modal.ts` (modified)

The internal `ModalState` is renamed to use the canonical seven-kind union (see State machine above). The render function dispatches on `state.kind`. New private dependencies: `createFocusTrap`, `classifyError`, `errorClassToUI`.

The `quiz-active` state (now `ready`) is rendered with `<fieldset>` / `<legend>` per question instead of the current `<div role="radiogroup">`. The `<legend>` carries the prompt text; native fieldset semantics replace the bespoke `aria-label` + `role="radiogroup"`. Choices remain `<input type="radio">` inside `<label>` (existing pattern is already correct).

A persistent `aria-live="polite"` `<div role="status">` sits at the top of the panel, hidden visually with `clip-path: inset(50%)` but readable by screen readers. The render function updates its `textContent` on every state transition.

`closeModal()` also calls `focusTrap.deactivate()`.

#### Functions and methods

```ts
// packages/extension/src/lib/dom/error-classes.ts
export const classifyError: (
  reason: ErrorReason,
  message: string,
) => DisplayErrorClass;

export const errorClassToUI: (cls: DisplayErrorClass) => ErrorUISpec;

// packages/extension/src/lib/dom/focus-trap.ts
export const createFocusTrap: (deps: FocusTrapDeps) => FocusTrap;
```

No `Either` / `IO` here: these are pure mappers and DOM glue, and the existing modal is plain TS per CLAUDE.md's "extension defaults to plain TS + zod" rule. The `quiz-retry` event detail is zod-validated at the listener edge (existing `addDOMEventListener` helper).

#### File layout

```
packages/extension/src/lib/dom/
  error-classes.ts                 (new — DisplayErrorClass, classifyError, errorClassToUI)
  error-classes.test.ts            (new — pure mapper tests, one per class)
  focus-trap.ts                    (new — createFocusTrap factory)
  focus-trap.test.ts               (new — Tab wrap, Shift+Tab wrap, restore-on-deactivate)
  dom-events.ts                    (modified — adds quizRetry constant + schema)
  dom-events.test.ts               (modified — adds quizRetry schema parse cases)
  modal.ts                         (modified — new state machine, classified error renderer, focus trap, aria-live region)
  modal.test.ts                    (modified — adds states, error classes, a11y assertions)
  quiz-flow.ts                     (modified — handles QuizRetry event)
  quiz-flow.test.ts                (modified — adds retry flow test)
```

#### Per-class UI mapping (binding copy)

The dev MAY copy-edit minor wording, but the (title, CTA action) pairs are binding. Bodies SHOULD reference the underlying cause without exposing raw error messages.

| Class | Title | Body | CTA label | CTA action |
|---|---|---|---|---|
| `host-unreachable` | "Native host not installed" | "LGTM-Buzzer needs the native messaging host to talk to your local LLM. Install it from the project page." | "Install host" | `install-host` (opens README anchor in new tab) |
| `host-timeout` | "Host didn't respond" | "The native host took too long to reply. This usually clears on its own." | "Retry" | `retry` |
| `host-unexpected-reply` | "Unexpected response" | "The native host sent an unexpected message. Retry, or report a bug if it keeps happening." | "Retry" | `retry` |
| `transport-internal` | "Connection error" | "Something went wrong talking to the native host. Retry, or restart the host." | "Retry" | `retry` |
| `schema-violation` | "Protocol mismatch" | "Extension and host versions are out of sync. Reinstall the native host to fix this." | "Install host" | `install-host` |
| `unknown-message` | "Protocol mismatch" | "The native host didn't recognise the request. Reinstall the host to fix this." | "Install host" | `install-host` |
| `version-mismatch` | "Protocol version mismatch" | "Extension and host versions are incompatible. Reinstall the native host." | "Install host" | `install-host` |
| `internal` | "Host error" | "The native host hit an internal error. Retry, or check the host logs." | "Retry" | `retry` |
| `unknown-quiz-id` | "Quiz expired" | "The quiz session is no longer valid. Try again to fetch a fresh quiz." | "Try again" | `retry` |
| `unsupported-llm-adapter` | "LLM adapter not available" | "The selected LLM adapter is not registered in your native host. Pick a different adapter in options." | "Open options" | `open-options` |
| `unsupported-vcs-adapter` | "VCS adapter not available" | "The selected VCS adapter is not registered in your native host. Pick a different adapter in options." | "Open options" | `open-options` |
| `bad-credentials` | "Credentials rejected" | "The adapter rejected your credentials. Update them in extension options." | "Open options" | `open-options` |
| `missing-credentials` | "Credentials required" | "This adapter needs credentials. Add them in extension options." | "Open options" | `open-options` |

The `install-host` URL is a fixed constant pointing at the project's README install section (`https://github.com/tibtof/lgtm-buzzer#install`). Lives in `error-classes.ts`. Opens via `window.open(url, "_blank", "noopener")` from the CTA click handler.

#### classifyError marker strings (binding)

```ts
classifyError("internal", message) →
  message === "host disconnected"             → { kind: "host-unreachable" }
  message === "host did not respond"          → { kind: "host-timeout" }
  message.startsWith("Unexpected reply kind:")→ { kind: "host-unexpected-reply",
                                                  replyKind: <parsed from message> }
  message.startsWith("connect failed:")       → { kind: "host-unreachable" }
  message.startsWith("sendFrame threw:")      → { kind: "transport-internal", detail: message }
  message.startsWith("replay failed:")        → { kind: "transport-internal", detail: message }
  message === "invalid SW response"           → { kind: "transport-internal", detail: message }
  otherwise                                   → { kind: "internal" }   // host-side genuine internal

classifyError(reason, _) for any other reason → { kind: reason }   // 1:1 wire mapping
```

This couples the modal to the marker strings hard-coded in `port.ts` / `quiz-flow.ts`. The coupling is **deliberate and unidirectional** — the modal accepts what those modules already emit. If `port.ts` / `quiz-flow.ts` change a marker, the modal still falls back to `internal` (genuine host-side) which renders as "Host error / Retry" — not catastrophic, just suboptimal. A unit test in `error-classes.test.ts` asserts every marker recognised by `classifyError` matches a real marker string used in `port.ts` or `quiz-flow.ts`, via `grep`-style import:

```ts
// modal-side test:
import { MAKE_ERROR_MARKERS } from "./error-classes.js";

// In port.ts (export a const, replace the inline string):
export const PORT_ERROR_MARKERS = {
  hostDisconnected: "host disconnected",
  hostNoResponse:   "host did not respond",
  connectFailed:    "connect failed:",  // prefix
} as const;
```

The dev MUST extract the marker strings into named exports in `port.ts` and `quiz-flow.ts`, then `classifyError` imports them — no string literals duplicated in both places. This eliminates the drift risk entirely.

#### Sequence

Quiz error → retry (round-trip):

1. User clicks Approve → CS → SW → host → host's LLM adapter returns `bad-credentials`.
2. SW relays `ErrorFrame { reason: "bad-credentials", message: "..." }` to the CS.
3. CS's `handleQuizRequestReply` drops `pending` and emits `quiz-result { outcome: error }`.
4. Modal receives `quiz-result`, classifies the reason via `classifyError("bad-credentials", msg)` → `{ kind: "bad-credentials" }`, renders the panel using `errorClassToUI(...)` → "Credentials rejected / Open options".
5. Focus moves to the first focusable element (the "Open options" link); `aria-live` region announces "Error: Credentials rejected".
6. User clicks "Open options" → modal emits `lgtm-buzzer:open-options` (existing ADR-23 wire) AND `lgtm-buzzer:quiz-cancel` (so the CS frees state), modal transitions to `idle`.

Transient retry round-trip:

1. SW reports `host did not respond` (timeout) → CS emits `quiz-result { outcome: error, reason: "internal", message: "host did not respond" }`.
2. Modal classifies → `{ kind: "host-timeout" }` → renders "Host didn't respond / Retry".
3. User clicks Retry → modal emits `lgtm-buzzer:quiz-retry { requestId }`, transitions optimistically to `generating`, focus moves to the Cancel button, aria-live announces "Generating quiz from the diff".
4. CS's `onQuizRetry` handler: looks up the prior `pending` (if still tracked) or, if the prior was dropped (it usually has been — the error path drops), reads `currentPR` and synthesises a fresh `PendingApprove` **without a fresh approve interception** — Retry is a re-fetch of the quiz only; the user is already past the Approve click. A new requestId + correlationId is allocated; `pending` is set; a new `quiz-request` frame is sent.
5. On success: same path as a normal `quiz-request` round-trip from step 2 onward of the original ADR-18 flow.

Failed quiz → try again:

1. State `failed`, user clicks "Try Again" → modal emits `lgtm-buzzer:quiz-retry { requestId }`, transitions to `generating`.
2. Same CS handler as transient retry; a fresh `quiz-request` is sent. The host re-generates a (different) quiz from the same PR diff.
3. The original `blocked` (`InterceptedApproveEvent`) is **not** re-replayed on the retry path — replay happens only when a fresh `quiz-passed` arrives.

Cancel during generating (Option A):

1. User clicks Cancel during `generating` → modal emits `quiz-cancel`, transitions to `idle`, focus restored.
2. CS's `onQuizCancel` drops `pending`.
3. Host continues generating; reply arrives at SW; SW's correlation map either has the entry (resolves to a now-orphan Promise that nobody awaits — GC reclaims it) or has timed out and drained the entry.
4. If the orphan reply arrives at CS via SW, `pending.has(requestId)` is false → `handleQuizRequestReply` logs a warn and returns early. Already implemented (see `quiz-flow.ts:306`).

#### Error cases

Modal-internal failures:

- **Retry click while `pending` is gone AND `currentPR` is null** (e.g., user navigated mid-error). `onQuizRetry` logs a warn and emits `quiz-result { error, reason: "internal", message: "no active PR" }`; the modal classifies this as `transport-internal` and re-renders the error panel. This is a dead-end the user can only escape via Dismiss — acceptable; the navigation already broke their flow.
- **Focus trap on an empty panel** (defensive). If `querySelectorAll` returns no focusable elements (shouldn't happen — every state has at least one button), the trap's `activate()` focuses the panel itself (which has `tabindex="-1"`). No throw.
- **Multiple state transitions in quick succession** (e.g., `generating → error → retry → generating` rapid-fire). The render function fully rebuilds the panel on each transition; previous focus-trap listeners are deactivated in the same call. The `data-lgtm-modal-host` element is reused (idempotent mount); only the backdrop is recreated.

Wire-level / classification edge cases:

- **`classifyError` receives a `reason` value not in the union** (defensive — host shipped a newer enum). TypeScript exhaustiveness prevents this at the call site; at runtime the schema in `dom-events.ts` rejects it before reaching `classifyError`. If somehow it slips through, default to `{ kind: "internal" }` → "Host error / Retry".
- **`classifyError` receives `internal` reason with a marker string the modal does not recognise**. Falls back to `{ kind: "internal" }` (genuine host-side internal). Renders as "Host error / Retry". The retry will hit the same root cause but the user is allowed to try.

No `throw` is added. The modal continues the existing pattern: pure DOM + zod-validated event details + plain TS.

#### Accessibility checklist (binding)

| Feature | Implementation |
|---|---|
| Role / modal semantics | `role="dialog"` + `aria-modal="true"` on the backdrop (existing); add `aria-labelledby="lgtm-buzzer-modal-title"` pointing at the `<h2>`. |
| Focus trap | `createFocusTrap` activated on every non-idle render; deactivated on `closeModal()`. |
| Focus restoration | `focusTrap.deactivate()` restores focus to `previouslyFocused` (recorded at activation). |
| First-focus targets | `generating`: Cancel button. `ready`: first radio of first question. `submitting`: Cancel button (visually styled "Cancel submission" — wait, no — submitting has NO buttons currently. Add Cancel button to `submitting` for parity; same behavior as generating-cancel: emits `quiz-cancel`, modal goes to idle, late submit reply dropped). `passed` / `failed` / `error`: primary CTA (Dismiss / Try Again / Retry / Open Options). |
| Esc | Existing handler retained: emits `quiz-cancel` and closes. Except in state `passed` — Esc dismisses without cancel (the approval is already through). |
| Tab / Shift+Tab | Trapped within the panel. Tab from last focusable wraps to first; Shift+Tab from first wraps to last. |
| `aria-live` region | Single `<div role="status" aria-live="polite" aria-atomic="true">` inside the panel, visually hidden via `clip-path: inset(50%); position: absolute; width: 1px; height: 1px; overflow: hidden;`. `textContent` updated on every state transition. |
| `<fieldset>` + `<legend>` | Each question wraps choices in `<fieldset>` with `<legend>` carrying the prompt text. Remove the bespoke `role="radiogroup"` + `aria-label` (native fieldset semantics replace it). |
| Color contrast | All copy uses GitHub Primer color tokens (`#24292f` on `#ffffff`, etc.), all combinations pass WCAG AA (≥ 4.5:1 for body text, ≥ 3:1 for large text). Verified manually via Primer's published contrast tables — no automated contrast test in v1. AAA aspirational; AA committed. |
| Reduced motion | The existing `lgtm-fadein` and `lgtm-spin` animations remain; wrap them in `@media (prefers-reduced-motion: no-preference)` blocks so users with `prefers-reduced-motion: reduce` see no animation. |
| `aria-busy` | The panel sets `aria-busy="true"` during `generating` and `submitting` states; `false` in all other states. |

#### Loading state

Replace the inline spinner-only loading panel with a thin **skeleton + spinner** combo:

```
[ ⏳ spinner ]  Generating quiz from the diff…
─────────────────────────────────────
[░░░░░░░░░░░░░░░░░░░░░░░]   ← skeleton block 1 (question placeholder)
[░░░░  ░░░░  ░░░░]          ← skeleton block 2 (choices placeholder)
[░░░░░░░░░░░░░░░░░░░░]      ← skeleton block 3 (question placeholder)
[░░░░  ░░░░]                ← skeleton block 4 (choices placeholder)
```

Skeletons are styled `<div>` blocks with a faint background and a 1.5s pulse animation (`@keyframes lgtm-pulse { 0%, 100% { opacity: 0.4 } 50% { opacity: 0.8 } }`). Two question-shaped skeletons (each: one prompt rectangle + three choice rectangles) — gives the user a sense of the question count without committing to a specific N. `prefers-reduced-motion: reduce` disables the pulse but keeps the skeleton visible. All pure CSS, zero external deps.

For `submitting`, the skeleton is omitted — the modal is short-lived and disorienting to re-skeleton over a quiz the user just answered. The spinner-with-context (`Checking answers…`) stays as today.

#### Test strategy

**`error-classes.test.ts`** (new, ≥18 cases):
1. `classifyError("internal", "host disconnected")` → `host-unreachable`.
2. `classifyError("internal", "host did not respond")` → `host-timeout`.
3. `classifyError("internal", "Unexpected reply kind: ping")` → `host-unexpected-reply { replyKind: "ping" }`.
4. `classifyError("internal", "connect failed: ENOENT")` → `host-unreachable`.
5. `classifyError("internal", "sendFrame threw: ...")` → `transport-internal`.
6. `classifyError("internal", "invalid SW response")` → `transport-internal`.
7. `classifyError("internal", "replay failed: ...")` → `transport-internal`.
8. `classifyError("internal", "some other thing")` → `internal` (genuine host-side).
9–16. One case per wire `ErrorReason` value, asserting 1:1 mapping.
17. `errorClassToUI` returns a non-empty title + body for every variant (exhaustive switch).
18. `errorClassToUI({ kind: "host-unreachable" }).cta?.action.kind === "install-host"`.
19. Marker-drift canary: import `PORT_ERROR_MARKERS` from `port.ts` and `QUIZ_FLOW_ERROR_MARKERS` from `quiz-flow.ts`; assert every value is recognised by `classifyError`.

**`focus-trap.test.ts`** (new, ≥6 cases — jsdom):
1. Activate on a container with three buttons → focus is on the first button.
2. Tab from the last button → focus wraps to the first.
3. Shift+Tab from the first → focus wraps to the last.
4. Tab in the middle → moves to the next focusable (no wrap).
5. Deactivate → focus restored to the previously-focused element.
6. Deactivate twice → idempotent (no throw).
7. Activate on an empty container → focus on the container itself (tabindex="-1" fallback).

**`modal.test.ts`** (extended, ≥10 new cases):
1. State transition: idle → generating shows skeleton + spinner + Cancel button.
2. Generating → ready (on quiz-ready outcome): renders questions, first radio focused.
3. Ready → submitting (on submit): spinner shown, no questions, Cancel button focused.
4. Submitting → passed: green banner, Dismiss focused.
5. Submitting → failed: red banner, "Try Again" button focused.
6. Failed → generating (on Try Again click): emits `quiz-retry`, skeleton shown.
7. Error: `bad-credentials` → "Credentials rejected" + "Open options" CTA.
8. Error: `host-unreachable` (synthesised from "host disconnected" message) → "Native host not installed" + "Install host" CTA.
9. Error: `host-timeout` (synthesised from "host did not respond" message) → "Host didn't respond" + "Retry" CTA.
10. Error: `version-mismatch` → "Protocol version mismatch" + "Install host" CTA.
11. `aria-live` region announces "Generating quiz" on entering `generating`.
12. `aria-live` region announces "Quiz ready, 2 questions" on entering `ready`.
13. Focus trap: Tab from last focusable in `ready` wraps to first.
14. Esc in `passed` state: closes WITHOUT emitting `quiz-cancel` (already approved).
15. Esc in `error` state: emits `quiz-cancel`.
16. `prefers-reduced-motion: reduce` (via `matchMedia` mock) → spinner has no animation property set (or has `animation: none`).
17. Each question is wrapped in `<fieldset>` with a `<legend>` containing the prompt text.
18. `aria-labelledby` on the backdrop points to an element whose id matches the `<h2>`.
19. Retry CTA in error state: emits `quiz-retry { requestId }`.
20. `aria-busy="true"` on the panel during `generating` and `submitting`; `false` otherwise.

**`quiz-flow.test.ts`** (extended, ≥3 new cases):
1. `quiz-retry` for a known requestId where `pending` is still alive → emits a new `quiz-request` to the SW with a fresh correlationId.
2. `quiz-retry` for a requestId already dropped, but `currentPR` is set → synthesises a fresh `PendingApprove` (no blocked-event re-replay) and emits a new `quiz-request`.
3. `quiz-retry` when `currentPR` is null → emits `quiz-result { error, message: "no active PR" }` and does not send a frame.

**Coverage**: ≥85% on every new file; ≥90% on `error-classes.ts` (pure).

**End-to-end**: existing Playwright happy-path coverage (ADR-19) does NOT change. A follow-up issue may add an e2e for the retry flow and a screen-reader smoke test (axe-playwright); explicitly out of scope here.

#### Diff-only invariant

This story touches **zero** LLM prompt construction. All copy is hard-coded constants in `error-classes.ts`. The `aria-live` announcements are derived from state-kind + question count — no diff text, no LLM-returned text beyond the existing `question.prompt` / `choice.label` (which were already in the quiz response and rendered safely via `textContent` per ADR-18). The CLAUDE.md §Key differentiator invariant is preserved by construction.

### Consequences

- **The modal becomes a real product.** Each error has a title, a body, and a clear next action. Transient failures are one-click recoverable. Adapter / credential failures route the user directly to the options page.
- **No protocol changes.** The wire-level `ErrorReason` enum is untouched. The new `DisplayErrorClass` is an extension-internal classification; if the wire enum grows in a future ADR, only `error-classes.ts` and the UI table need updates.
- **One new DOM event** (`lgtm-buzzer:quiz-retry`) joins the four existing extension-internal events. Additive; no breaking change to ADR-18's event bus.
- **No new runtime dependencies.** ~80 LOC for the focus trap, ~120 LOC for `error-classes.ts`, ~150 LOC of CSS for skeletons + visually-hidden region. All hand-rolled, all reviewed.
- **Accessibility committed at WCAG AA.** Documented in `packages/extension/README.md`. AAA is aspirational and may motivate a follow-up issue.
- **Cancel during generation still wastes LLM cycles** (Option A). The follow-up issue for Option B (`quiz-cancel-request` wire frame + host fiber cancellation) is filed at PR-merge time. The waste is bounded: the SW's 60s timeout caps the orphan cost.
- **Marker-string coupling between transport modules and the modal classifier.** Mitigated by extracting named constants in `port.ts` / `quiz-flow.ts` and a drift-canary test in `error-classes.test.ts`. Future refactors of those marker strings touch one constant.
- **Submit-state Cancel button is new.** Today the modal has no Cancel during submitting. The new state machine adds one for symmetry with generating. The CS handles a late `quiz-result` after submit-cancel the same way it handles a late post-cancel reply (drops it).
- **Retry is user-driven, not Schedule-driven.** Architect picked the host as the right layer for `Schedule`-based automatic retries (LLM transient failures). The modal stays simple. CLAUDE.md §Functional idiom #3 is honored: the modal is not "doing retries" — the user is. A follow-up issue may add `Schedule` in the LLM adapter where it belongs.
- **Reduced-motion respected.** Animations gated on `prefers-reduced-motion: no-preference`. Vestibular users get a static, fast UI.
- **First-class screen-reader announcements.** The `aria-live` region narrates state transitions. Combined with `aria-labelledby` and `<fieldset>` / `<legend>`, the modal becomes self-describing to assistive tech.
- **Diff-only invariant preserved.** No new LLM prompt input path. All user-facing text is either hard-coded copy or pre-existing quiz fields (already invariant-safe).
- **Reversibility moderate.** Rolling back is one folder delete (the two new files) plus a revert of the `modal.ts` refactor. The new `DOM_EVENTS.quizRetry` constant can stay (unused) without breaking anything.

**Binding for the reviewer**:
- (a) No new runtime dep in any package.
- (b) `ErrorReasonSchema` in `protocol` is untouched. No new wire-level enum values.
- (c) `classifyError` MUST import marker strings from `port.ts` / `quiz-flow.ts` as named constants, not duplicate string literals. The marker-drift canary test asserts this.
- (d) The modal MUST render `<fieldset>` + `<legend>` for each question in `ready` state (replacing `role="radiogroup"`).
- (e) Focus trap MUST be active in every non-idle state; deactivation happens in `closeModal()` and only there.
- (f) Esc in `passed` state MUST NOT emit `quiz-cancel` (the approval is through). Esc in any other non-idle state MUST emit `quiz-cancel`.
- (g) `aria-live` region MUST be present from initial render and updated on every state transition (not torn down and re-mounted per state — that breaks screen-reader announcement).
- (h) All animations MUST be wrapped in `@media (prefers-reduced-motion: no-preference)`.
- (i) `errorClassToUI` MUST be exhaustive over `DisplayErrorClass`. A `switch` with `assertNever` default suffices.
- (j) No new LLM-prompt input paths. All copy is static. CLAUDE.md §Key differentiator preserved.
- (k) `data-testid` attributes from ADR-19 + ADR-23 (`lgtm-buzzer-quiz-modal`, `lgtm-buzzer-quiz-submit`, `lgtm-buzzer-quiz-cancel`, `lgtm-buzzer-configure-options`) MUST remain unchanged. New testids for new affordances: `lgtm-buzzer-quiz-retry` on the Retry / Try Again button, `lgtm-buzzer-install-host` on the install-host link.

---

## ADR-25 (2026-05-23): Playwright e2e implementation — fixture HTML pages, SW-stub scenarios, page objects
**Date**: 2026-05-23
**Issue**: #51
**Status**: Accepted

### Context

ADR-19 shipped the harness (`launchPersistentContext` + `sw.evaluate` stub +
fixture-via-`page.route` + binding `data-testid` contract) and one happy-path
spec. That was enough to gate the end of M2. M3 then doubled the extension's
testable surface:

- **ADR-22** (#49) added five new wire `ErrorReason` values (`unsupported-llm-adapter`,
  `unsupported-vcs-adapter`, `bad-credentials`, `missing-credentials`, plus
  retained `internal`).
- **ADR-23** (#50) shipped the options page — adapter dropdowns, credential
  inputs, Save, "Test connection" probe, `chrome.storage.local` persistence,
  per-`quiz-request` storage injection in the SW.
- **ADR-24** (#53) shipped a seven-kind modal state machine, focus-trap,
  aria-live announcements, classified error rendering with four extension-
  internal classes (`host-unreachable`, `host-timeout`, `host-unexpected-reply`,
  `transport-internal`), Retry / Try Again wires, and the
  `lgtm-buzzer:quiz-retry` DOM event.
- **ADR-21** (#48) shipped the ADO content-script vote-button interceptor.

None of these surfaces is exercised end-to-end. The unit tests cover each
module in jsdom; the wire is contract-tested in `host`; but the *integrated*
behaviour — real MV3 SW, real `chrome.storage.local`, real DOM, real
`addEventListener` — is empirically un-validated. M3 cannot ship without
that gate.

Constraints that shape this design:

- **Headless: false is binding.** ADR-19 §spec-comment-1 documented this:
  Chrome does NOT expose MV3 extension service workers to CDP in headless
  mode; `headless: true` makes `context.waitForEvent("serviceworker")` time
  out unconditionally. Every new spec inherits this constraint. CI uses
  `xvfb-run` on Linux (deferred to #54).
- **No real network.** Every navigation goes through `page.route(...,
  route.fulfill(...))` against a local HTML fixture. github.com,
  dev.azure.com, and `*.visualstudio.com` are NEVER hit.
- **No real native messaging host.** Every spec calls `sw.evaluate(stubScript)`
  to install the same canned-port stub family from ADR-19. The stub is
  scenario-parameterised so error-path specs do not need new stub modules.
- **Test count budget: 15–25.** E2e is slow (~2s per case on dev hardware,
  ~5s in CI cold). Twenty-ish cases stay within a 60s end-to-end budget.
  Unit tests still catch the lion's share of regressions; e2e validates the
  integration seams.
- **Page-object pattern, not framework.** Vanilla TS classes wrapping
  `Page` + the `data-testid` contract. No `playwright-fixtures` library
  dependency — the project already mandates minimal devDeps and the
  patterns are short enough to maintain by hand.
- **`data-testid` is the test surface.** ADR-19 §7 made these binding; ADR-24
  added `lgtm-buzzer-quiz-retry`, `lgtm-buzzer-install-host`,
  `lgtm-buzzer-configure-options`. The options page DOM uses `data-lgtm-*`
  attributes (`data-lgtm-select`, `data-lgtm-cred-input`, `data-lgtm-btn`,
  `data-lgtm-banner`, etc.) — the e2e suite uses those as-is; no new attrs.
  ADO interception uses a fixture that ships its own
  `data-testid="complete-vote-button"` per the known ADO contract.

### Decision

Expand `packages/extension/e2e/` into a six-spec suite with three page
objects, two scenario-driven fixture HTML pages, a generalised SW stub, and
shared spec scaffolding. All existing ADR-19 contracts (headless: false,
stub-via-`sw.evaluate`, fixture-via-`page.route`, `state: "attached"` for
shadow-root host, `npm run test:e2e` gate separate from `npm run check`)
carry over unchanged. The existing `quiz-happy-path.spec.ts` becomes
`happy-path.spec.ts` with the same body refactored to use the new page
objects.

#### Affected workspaces

`packages/extension` only. No changes to `protocol`, `core`, `adapters/*`,
or `host`.

**Dependency arrows reaffirmed**:

```
protocol  ← core  ← adapters  ← host
protocol  ← core  ← extension
```

The e2e suite imports nothing from workspace packages (the stub script must
remain self-contained per ADR-19 §3 — the script is a string literal that
runs inside the browser process). The page objects and helpers are pure
Node-side TS that wrap `@playwright/test`'s `Page` / `BrowserContext` /
`Worker` types.

#### Scope (the six specs)

| # | File | Cases | Purpose |
|---|---|---|---|
| 1 | `e2e/happy-path.spec.ts` | 1–2 | Replay-only (ADR-19 §6 refactored to use page objects). Adds a "re-click Approve after pass = no modal" assertion (replay flow). |
| 2 | `e2e/failure-retry.spec.ts` | 2 | Wrong answers → `failed` state with Try Again → retry → pass. Plus: a partial-answers Submit attempt is blocked (no `quiz-submit` frame sent). |
| 3 | `e2e/error-paths.spec.ts` | 6 | Data-driven over the six representative `DisplayErrorClass` variants visible from the SW-stub: `bad-credentials`, `missing-credentials`, `host-unreachable` (synthesised via "host disconnected" message), `host-timeout` (via "host did not respond"), `unsupported-llm-adapter`, `internal` (genuine host-side). Each case asserts the modal renders the ADR-24-binding `(title, CTA label, CTA action wire)`. |
| 4 | `e2e/options-page.spec.ts` | 4 | (a) Mount with empty storage → `list-adapters-request` populates dropdowns. (b) Save → reload → values + (redacted) credentials persist via `chrome.storage.local`. (c) "Test connection" → success banner. (d) "Test connection" with bad-creds stub-reply → red banner with the ADR-23 copy. |
| 5 | `e2e/accessibility.spec.ts` | 3 | (a) Focus trap wraps Tab/Shift+Tab. (b) Esc dismisses (in non-`passed` states emits `quiz-cancel`; passed dismisses without cancel). (c) `aria-modal`, `aria-labelledby`, and `aria-live` present and updated. |
| 6 | `e2e/ado-intercept.spec.ts` | 1–2 | ADO fixture with `data-testid="complete-vote-button"` → vote click intercepted → modal opens with the same canned quiz. Smoke only — does not re-test the full quiz flow (covered by happy-path). |

Total: 17–19 cases. Within the budget.

**Cases the SW stub cannot drive** (documented out-of-scope):
- `version-mismatch`, `schema-violation`, `unknown-message`, `unknown-quiz-id`,
  `host-unexpected-reply` (the last two require the stub to send a malformed
  reply or a wrong-kind frame). These are unit-tested in `modal.test.ts` and
  `error-classes.test.ts`; the e2e suite covers six representative classes,
  not all thirteen.

#### What is NOT covered (binding)

- **Real LLM CLIs.** Subprocess-based and HTTP-based adapters
  (claude-cli, codex-cli, copilot-cli, claude-api) are too slow and
  non-deterministic for e2e. Their behaviour is covered by adapter
  contract tests + httptape recordings.
- **Real native messaging host.** The manifest installer + the host
  binary are validated by manual smoke in the M3 walkthrough; the SW
  stub stands in for the wire in e2e.
- **Real network to github.com / dev.azure.com / *.visualstudio.com.**
  Fixtures only.
- **promptfoo eval suite** (#52). That covers quiz quality, not flow.
- **Cross-browser** (Firefox / Safari). Chrome MV3 only for v1.
- **Visual regression / screenshot diffing.** Out of scope; the modal's
  copy and CTAs are asserted via text + `data-testid`.
- **Real `chrome.storage.local` cross-page leak.** The options-page spec
  asserts persistence within one persistent context; nothing more.

#### Test infrastructure

##### 1. Fixture HTML pages — two files

`e2e/fixtures/github-pr.html` (existing — ADR-19 §4, unchanged shape but
upgrade the title metadata):

- Hidden `<input name="pull_request_review[event]" value="approve">` form.
- `<button id="approve-btn" type="submit">Approve</button>`.
- Bubble-phase listener sets `body[data-form-submitted="true"]` when the
  form submit is not preventDefaulted.

`e2e/fixtures/ado-pr.html` (new):

- A `<button data-testid="complete-vote-button">Approve</button>` matching the
  ADR-21 KNOWN_ADO_VOTE_TESTIDS contract.
- Bubble-phase click listener sets
  `body[data-vote-clicked="true"]` when the click is not preventDefaulted (no
  form submit; ADO uses click handlers).
- URL routed: `https://dev.azure.com/contoso/MyProj/_git/MyRepo/pullrequest/42`.

Both fixtures are minimal — they contain only what the CS interceptors need.
Adding marketing copy / GitHub chrome / etc. is forbidden (it would invite
testing the chrome, not the gate).

##### 2. SW stub generalisation — scenario-parameterised builder

`e2e/helpers/sw-stub.ts` (renamed from `e2e/sw-stub.ts`):

```ts
/** The scenarios the stub knows how to play. */
export type StubScenario =
  | { readonly kind: "happy"; readonly quiz: CannedQuiz; readonly correctAnswers: CannedCorrectAnswers }
  | { readonly kind: "wrong-then-right"; readonly quiz: CannedQuiz; readonly correctAnswers: CannedCorrectAnswers }
  // Error scenarios reply to `quiz-request` with an ErrorFrame.
  | { readonly kind: "error-on-quiz-request"; readonly reason: WireErrorReason; readonly message: string }
  // The probe scenario answers `ping` with a matching `pong` (or a mismatched nonce on demand).
  | { readonly kind: "list-adapters"; readonly llm: readonly string[]; readonly vcs: readonly string[] }
  | { readonly kind: "list-adapters-then-happy"; readonly llm: readonly string[]; readonly vcs: readonly string[]; readonly quiz: CannedQuiz; readonly correctAnswers: CannedCorrectAnswers }
  // Mixed scenario for options-page tests: list-adapters succeeds, probe replies with bad-creds error.
  | { readonly kind: "probe-bad-credentials"; readonly llm: readonly string[]; readonly vcs: readonly string[] };

export type WireErrorReason =
  | "bad-credentials"
  | "missing-credentials"
  | "internal"             // genuine host-side internal — also used to drive transport markers
  | "unsupported-llm-adapter"
  | "unsupported-vcs-adapter";

export const buildSwStubScript = (scenario: StubScenario): string;
```

The returned string still passes through `sw.evaluate(...)`. Internally the
stub branches on `scenario.kind`:

- `happy` — same as ADR-19 §3.
- `wrong-then-right` — first `quiz-submit` returns `passed: false` regardless
  of answers; second `quiz-submit` scores normally. State is a stub-local
  counter, not exposed to the page.
- `error-on-quiz-request` — `quiz-request` returns `{ kind: "error",
  payload: { reason, message } }`. `ping` still returns `pong` so SW
  liveness checks pass.
- `list-adapters` — `list-adapters-request` returns
  `{ kind: "list-adapters-response", payload: { llm, vcs } }`. All other
  frames return a generic ErrorFrame `{ reason: "internal", message: "scenario does not handle this kind" }`.
- `list-adapters-then-happy` — combines `list-adapters` (for the options
  page) with `happy` (for the quiz flow).
- `probe-bad-credentials` — `list-adapters` succeeds, `ping` returns an
  ErrorFrame with `reason: "bad-credentials"`. (v1 probe uses ping; this
  exercises the dom.ts banner code path.)

The stub continues to carry a setup-time `__LGTM_E2E_STUB__` marker for
race-free detection. Each scenario sets a separate marker namespace
(`__LGTM_E2E_STUB__: "happy" | "wrong-then-right" | ...`) so specs can
sanity-check the scenario they expect was installed.

##### 3. Shared spec scaffolding

`e2e/helpers/context.ts` (new):

```ts
/**
 * Launches a persistent Chromium context with the unpacked extension and the
 * named SW stub scenario installed. Resolves only after the SW event fires
 * AND the stub marker is set.
 */
export const launchExtensionContext = async (deps: {
  readonly scenario: StubScenario;
}): Promise<{
  readonly context: BrowserContext;
  readonly sw: Worker;
  readonly cleanup: () => Promise<void>;
}>;

/**
 * Asserts the built extension artifact exists at `.output/chrome-mv3/`.
 * Fails fast with the same "run npm run build first" message as ADR-19.
 */
export const assertBuiltExtension = (): void;

/**
 * Routes one or more GitHub / ADO PR URLs to local fixture HTML files via
 * `page.route(...)`. Centralised so specs don't duplicate the URL list.
 */
export const routeFixtures = async (page: Page, routes: ReadonlyArray<{
  readonly url: string;
  readonly fixturePath: string;
}>): Promise<void>;
```

`e2e/helpers/fixture-paths.ts` (new):

```ts
export const FIXTURE_URLS = {
  github: "https://github.com/owner/repo/pull/1",
  ado: "https://dev.azure.com/contoso/MyProj/_git/MyRepo/pullrequest/42",
} as const;

export const FIXTURE_FILES = {
  github: "fixtures/github-pr.html",
  ado: "fixtures/ado-pr.html",
} as const;
```

##### 4. Page objects — three files

Each page object wraps a Playwright `Page` and exposes a typed API over the
binding `data-testid` and `data-lgtm-*` attribute contracts. No
`PageObjectModel`-style framework; just classes with methods.

`e2e/pages/pr-page.ts` (new) — wraps the GitHub or ADO fixture page:

```ts
export class PRPage {
  constructor(private readonly page: Page, private readonly variant: "github" | "ado");

  /** Clicks the Approve / Vote button. */
  async clickApprove(): Promise<void>;

  /** Asserts the underlying form (GitHub) or click (ADO) succeeded — i.e. the gate let it through. */
  async expectApproved(): Promise<void>;

  /** Asserts the gate blocked the submit. */
  async expectBlocked(): Promise<void>;
}
```

`e2e/pages/quiz-modal.ts` (new) — wraps the Shadow-DOM modal:

```ts
/** The seven-kind ADR-24 state machine as observed from the e2e surface. */
export type ObservedState =
  | "generating" | "ready" | "submitting" | "passed" | "failed" | "error";

export class QuizModal {
  constructor(private readonly page: Page);

  /** Waits for the modal host to attach. Uses `state: "attached"` per ADR-19. */
  async waitForOpen(): Promise<void>;

  /** Asserts the modal is no longer in the DOM. */
  async waitForClosed(): Promise<void>;

  /** Returns the modal's currently-observable state derived from on-screen testids. */
  async getState(): Promise<ObservedState>;

  /** Selects a choice within a question by id. */
  async answerQuestion(questionId: string, choiceId: string): Promise<void>;

  /** Clicks Submit (must be enabled — all questions answered). */
  async submit(): Promise<void>;

  /** Clicks Retry / Try Again (works in `failed` and `error` states). */
  async retry(): Promise<void>;

  /** Clicks Cancel / Dismiss (state-dependent label). */
  async cancel(): Promise<void>;

  /** Returns the rendered error title + body + CTA label, when in `error` state. */
  async getErrorPanel(): Promise<{ title: string; body: string; cta?: string }>;

  /** Returns the textContent of the aria-live region. */
  async getAriaLive(): Promise<string>;

  /** Returns true if the host backdrop carries the expected ARIA attributes. */
  async hasAriaContract(): Promise<boolean>;

  /** Tabs `count` times from the panel; returns the focused element's data-testid (or text). */
  async tabAndReadFocus(count: number, opts?: { shift?: boolean }): Promise<string | null>;
}
```

`e2e/pages/options-page.ts` (new) — wraps the WXT options entrypoint:

```ts
export class OptionsPage {
  constructor(private readonly page: Page, private readonly extensionId: string);

  /** Navigates to `chrome-extension://${id}/options.html`. */
  async open(): Promise<void>;

  /** Returns the currently-rendered LLM / VCS adapter dropdown options. */
  async getAdapterChoices(): Promise<{ llm: string[]; vcs: string[] }>;

  /** Selects an LLM adapter; renders its credential inputs. */
  async selectLlmAdapter(id: string): Promise<void>;

  /** Selects a VCS adapter; renders its credential inputs. */
  async selectVcsAdapter(id: string): Promise<void>;

  /** Fills the named credential input under the LLM section. */
  async setLlmCredential(field: string, value: string): Promise<void>;

  /** Fills the named credential input under the VCS section. */
  async setVcsCredential(field: string, value: string): Promise<void>;

  /** Clicks Save; returns the visible banner kind + message after save resolves. */
  async save(): Promise<{ kind: "success" | "error"; message: string }>;

  /** Clicks Test connection; returns the visible banner kind + message. */
  async testConnection(): Promise<{ kind: "success" | "error"; message: string }>;
}
```

The `OptionsPage.open()` resolves the extension ID by inspecting the SW URL
(`sw.url()` is `chrome-extension://<id>/background.js`; the id is the second
URL segment). The `launchExtensionContext` helper exposes the resolved
extension id as a return field for callers that need it (the options-page
spec).

##### 5. Test data — single canonical quiz, scenario overrides

`e2e/helpers/canned-quiz.ts` (new):

```ts
/** The "canonical" two-question multiple-choice quiz used across happy-path tests. */
export const CANONICAL_QUIZ: CannedQuiz = {
  id: "e2e-quiz-1",
  questions: [
    { type: "multiple-choice", id: "q1", prompt: "Which file was modified?",
      choices: [{ id: "c1", label: "src/foo.ts" }, { id: "c2", label: "src/bar.ts" }] },
    { type: "multiple-choice", id: "q2", prompt: "What did the change add?",
      choices: [{ id: "c1", label: "A bug" }, { id: "c2", label: "A feature" }] },
  ],
};

export const CANONICAL_CORRECT: CannedCorrectAnswers = { q1: "c1", q2: "c2" };
```

Error-path and options-page specs override per-test; failure-retry spec uses
the same canonical quiz.

#### Types

All new types live under `packages/extension/e2e/` and are not exported to
any other workspace.

```ts
// e2e/helpers/sw-stub.ts (extended from ADR-19)
export type CannedQuiz = /* unchanged from ADR-19 §Types */;
export type CannedCorrectAnswers = Readonly<Record<string, string>>;
export type WireErrorReason = /* see scenario types above */;
export type StubScenario = /* see scenario types above */;

// e2e/helpers/context.ts
export type LaunchedContext = {
  readonly context: BrowserContext;
  readonly sw: Worker;
  readonly extensionId: string;
  readonly cleanup: () => Promise<void>;
};

// e2e/pages/quiz-modal.ts
export type ObservedState = /* see page object above */;
```

No port interfaces, no `Result` / `Either`. E2e is the standard Playwright
+ Page-Object pattern. Per CLAUDE.md §Dependency rules, the extension
"defaults to plain TS + zod" — and the e2e folder already has an ESLint
override (ADR-19 §8) lifting the `no-restricted-imports` `node:*` ban.

#### Functions and methods

The new exported surface:

- `buildSwStubScript(scenario: StubScenario): string` — generalised from
  ADR-19's two-arg form.
- `launchExtensionContext(deps: { scenario: StubScenario }): Promise<LaunchedContext>`.
- `assertBuiltExtension(): void`.
- `routeFixtures(page: Page, routes: ReadonlyArray<{ url: string; fixturePath: string }>): Promise<void>`.
- `class PRPage`, `class QuizModal`, `class OptionsPage` per §4.
- `CANONICAL_QUIZ`, `CANONICAL_CORRECT`, `FIXTURE_URLS`, `FIXTURE_FILES` constants.

No new exported types in any non-e2e package.

#### File layout

**New (15)**:

- `packages/extension/e2e/helpers/context.ts`
- `packages/extension/e2e/helpers/fixture-paths.ts`
- `packages/extension/e2e/helpers/canned-quiz.ts`
- `packages/extension/e2e/pages/pr-page.ts`
- `packages/extension/e2e/pages/quiz-modal.ts`
- `packages/extension/e2e/pages/options-page.ts`
- `packages/extension/e2e/happy-path.spec.ts` (replaces `quiz-happy-path.spec.ts`)
- `packages/extension/e2e/failure-retry.spec.ts`
- `packages/extension/e2e/error-paths.spec.ts`
- `packages/extension/e2e/options-page.spec.ts`
- `packages/extension/e2e/accessibility.spec.ts`
- `packages/extension/e2e/ado-intercept.spec.ts`
- `packages/extension/e2e/fixtures/ado-pr.html`
- `packages/extension/e2e/README.md` — explains the suite, how to run,
  the headless: false and `--load-extension` constraints, the SW-stub
  scenario API, the page-object pattern, and the
  `npm run build` prerequisite.
- (No new TS config — existing `e2e/tsconfig.json` covers everything.)

**Modified (4)**:

- `packages/extension/e2e/sw-stub.ts` → moved to `packages/extension/e2e/helpers/sw-stub.ts`; the `buildSwStubScript` signature changes from `(quiz, correctAnswers)` to `(scenario)`. Existing callers are migrated as part of this work.
- `packages/extension/e2e/quiz-happy-path.spec.ts` → renamed to `happy-path.spec.ts`; rewritten on top of the page objects. Behaviour preserved + the replay assertion added (re-click Approve after pass → modal stays closed, form submits).
- `packages/extension/e2e/fixtures/github-pr.html` — unchanged structure; one cosmetic comment update pointing to ADR-25 alongside ADR-19.
- `packages/extension/e2e/playwright.config.ts` — `testMatch` already `"**/*.spec.ts"` so it picks up the new files automatically. The deprecated `use.headless: true` value is updated to `headless: false` to match the actual launch options (the previous setting was vestigial — the spec already overrides per ADR-19). `reporter` stays `[["list"], ["html", { open: "never" }]]`. `retries` stays at 0 (deterministic stubs); if a CI flake emerges, raise to 1 with `trace: "on-first-retry"` (already configured).

**Unchanged**:

- `packages/protocol/**`, `packages/core/**`, `packages/adapters/**`,
  `packages/host/**`.
- `packages/extension/src/**`, `packages/extension/entrypoints/**`
  (no test-id additions required — every needed selector is already
  present from ADR-19, ADR-23, ADR-24).
- `packages/extension/package.json` — no new deps. (`@playwright/test`
  already devDep.)
- `eslint.config.js` — ADR-19's `e2e/**` override already covers `helpers/**`
  and `pages/**` (matches `packages/extension/e2e/**/*.ts`).

#### Sequence

##### A. happy-path.spec.ts (single test case, end-to-end replay assertion)

1. `assertBuiltExtension()`; `launchExtensionContext({ scenario: { kind: "happy", quiz: CANONICAL_QUIZ, correctAnswers: CANONICAL_CORRECT } })`.
2. Create `page`; `routeFixtures(page, [{ url: FIXTURE_URLS.github, fixturePath: FIXTURE_FILES.github }])`.
3. `page.goto(FIXTURE_URLS.github)`.
4. Construct `pr = new PRPage(page, "github")`, `modal = new QuizModal(page)`.
5. `await pr.clickApprove()` → modal opens.
6. `await modal.waitForOpen()`; assert `await pr.expectBlocked()`.
7. `await modal.answerQuestion("q1", "c1")`; `await modal.answerQuestion("q2", "c2")`; `await modal.submit()`.
8. `await pr.expectApproved()`.
9. **Replay assertion**: `await pr.clickApprove()` again on the same page; assert the modal does NOT reopen (it stays closed per ADR-17 §replay cache), and that the form submitted again (a new `body[data-form-submitted]` cycle — easiest assertion is the form's request was attempted; specifically the fixture's bubble-phase listener fires a second time).

##### B. failure-retry.spec.ts

Test 1 — wrong answers → failed → Try Again → correct:
1. Launch with `{ kind: "wrong-then-right", quiz: CANONICAL_QUIZ, correctAnswers: CANONICAL_CORRECT }`.
2. Click Approve → modal opens.
3. Answer with wrong choices (`q1: c2`, `q2: c1`) → Submit → modal transitions to `failed`.
4. Assert `modal.getState() === "failed"`.
5. Click Try Again → modal emits `quiz-retry`; modal transitions back to `generating`, then `ready` with the same canonical quiz.
6. Answer correctly → Submit → modal transitions to `passed` → form submitted.

Test 2 — partial answers cannot submit:
1. Launch happy scenario.
2. Open modal; answer only `q1`; click the Submit button.
3. Assert the Submit button is disabled (or `aria-disabled="true"`) and the modal remains in `ready`. ADR-24 §State machine binding requires "Submit button (all answered)" gate — confirm the e2e behaviour.

##### C. error-paths.spec.ts (six data-driven cases)

Per-case:
1. Launch with `{ kind: "error-on-quiz-request", reason, message }` (or a "happy" scenario when the error is transport-class — the SW stub cannot easily synthesise transport errors; for `host-unreachable` and `host-timeout` we deliberately use the `internal` reason with the exact marker string the modal's `classifyError` recognises).
2. Click Approve → modal opens → transitions to `error`.
3. Assert `modal.getState() === "error"` AND `modal.getErrorPanel().title === expectedTitle`, `cta === expectedCtaLabel`.
4. Drive the CTA per the case:
   - `retry` cases → click Retry; modal transitions to `generating` (then back to `error` since the stub keeps returning the same reason — assert one cycle).
   - `open-options` cases → click "Open options"; assert the modal closed and the browser opened the options page (`pages()` length increased OR `page.url()` shows `chrome-extension://${id}/options.html` in a new tab).
   - `install-host` cases — open a new tab to the README URL. Assertion: a new page with the configured `target="_blank"` URL was opened (mock via `context.waitForEvent("page")`).

The six cases:
| Case | Stub scenario | Expected title | CTA label | CTA assertion |
|---|---|---|---|---|
| `bad-credentials` | `error-on-quiz-request { reason: "bad-credentials" }` | "Credentials rejected" | "Open options" | options page opens |
| `missing-credentials` | `error-on-quiz-request { reason: "missing-credentials" }` | "Credentials required" | "Open options" | options page opens |
| `host-unreachable` | `error-on-quiz-request { reason: "internal", message: "host disconnected" }` | "Native host not installed" | "Install host" | new tab opens |
| `host-timeout` | `error-on-quiz-request { reason: "internal", message: "host did not respond" }` | "Host didn't respond" | "Retry" | retry cycle observed |
| `unsupported-llm-adapter` | `error-on-quiz-request { reason: "unsupported-llm-adapter" }` | "LLM adapter not available" | "Open options" | options page opens |
| `internal` | `error-on-quiz-request { reason: "internal", message: "some other internal" }` | "Host error" | "Retry" | retry cycle observed |

##### D. options-page.spec.ts (four cases)

Test 1 — list-adapters populates dropdowns:
1. Launch with `{ kind: "list-adapters", llm: ["claude-cli", "claude-api"], vcs: ["github", "ado"] }`.
2. `new OptionsPage(page, extensionId).open()`.
3. `getAdapterChoices()` → `{ llm: [...], vcs: [...] }`.

Test 2 — Save + reload persists:
1. Launch with `list-adapters` scenario.
2. Open options; select `claude-api`, fill `apiKey`, select `github`, fill `pat`; Save.
3. Close the options page tab; open a new options page tab; assert dropdowns pre-select stored values AND credential inputs are pre-filled (input.value matches what was saved; this asserts persistence end-to-end through `chrome.storage.local`).

Test 3 — Test connection success:
1. Launch with `list-adapters` scenario; ping replies pong with matching nonce.
2. Open options; select claude-cli + github; click Test connection.
3. Assert green "Connection successful!" banner.

Test 4 — Test connection bad-credentials banner:
1. Launch with `{ kind: "probe-bad-credentials" }`; ping replies with `ErrorFrame { reason: "bad-credentials" }`.
2. Open options; select claude-api + github; fill some creds; click Test connection.
3. Assert red banner with the ADR-23 copy "Credentials rejected by the adapter. Re-enter and try again."
4. **Security canary**: assert the saved credential string (e.g. `"SECRET_CANARY_xxx"`) does NOT appear anywhere in `page.content()`.

##### E. accessibility.spec.ts (three cases)

Test 1 — Focus trap wraps:
1. Launch happy scenario; open modal; reach `ready` state with two questions.
2. Use `modal.tabAndReadFocus(n)` to walk focus from the panel's first focusable element through the last; assert the last Tab wraps to the first; assert Shift+Tab from the first wraps to the last.

Test 2 — Esc dismisses (cancel semantics):
1. Launch happy scenario; open modal in `ready`.
2. `page.keyboard.press("Escape")`; assert modal closed AND the bypass flag was NOT set (form should NOT have been submitted).
3. Re-open + reach `passed`; press Esc; assert modal closed AND form IS submitted (already approved before Esc).

Test 3 — ARIA contract:
1. Launch happy scenario; open modal.
2. Assert `modal.hasAriaContract()` returns true: backdrop has `role="dialog"`, `aria-modal="true"`, `aria-labelledby="lgtm-buzzer-modal-title"`.
3. Drive `generating → ready → submitting`; assert `modal.getAriaLive()` updates on each transition with non-empty text.

##### F. ado-intercept.spec.ts (one or two cases)

Test 1 — ADO vote click intercepted:
1. Launch happy scenario; route ADO fixture URL to `fixtures/ado-pr.html`.
2. `page.goto(FIXTURE_URLS.ado)`.
3. `pr = new PRPage(page, "ado")`; `pr.clickApprove()`.
4. `modal.waitForOpen()`; assert `await pr.expectBlocked()`.
5. (Optional cheap follow-through:) answer correctly; assert `body[data-vote-clicked="true"]` set after pass — this exercises ADR-21's `replayApprove` for ADO (`element.click()` instead of `requestSubmit`).

(Optional test 2 — recognition of `aria-label="Approve"` button without
`data-testid`, exercising ADR-21 Layer 2 — defer if tight on time; the unit
test in `ado-vote-intercept.test.ts` already covers it.)

#### Error cases (test-suite robustness)

| Failure | Surfaced as |
|---|---|
| `.output/chrome-mv3/` missing | `assertBuiltExtension` throws "Run npm run build first" (ADR-19 contract; preserved). |
| Stub install race | `launchExtensionContext` awaits `context.waitForEvent("serviceworker")` AND `sw.evaluate(() => globalThis.__LGTM_E2E_STUB__ === <expected-marker>)` polls (5s) before returning. |
| Modal selector drift | Page-object methods use binding `data-testid` from ADR-19/24. If a refactor breaks them, `waitForOpen` / `getState` / `submit` time out → fail fast with a clear locator error. |
| Options-page selector drift | Page-object methods use `data-lgtm-*` attributes from the existing `dom.ts`. Same fail-fast story. |
| ADO fixture's `data-testid` not in `KNOWN_ADO_VOTE_TESTIDS` | The fixture uses `complete-vote-button` — the production list. Drift between fixture and code is caught by the spec failing (modal does not open). |
| Stub does not recognise a frame kind | Stub returns ErrorFrame `{ reason: "internal", message: "scenario does not handle this kind" }`; the modal surfaces it as a "Host error" panel. Catches spec/scenario mismatch obviously. |
| Playwright Chromium not installed | `test:e2e:install` script (ADR-19, unchanged). |
| Flaky timing | Single worker (`workers: 1`); retries: 0. If flakes appear, raise to 1 + use the existing `trace: "on-first-retry"`. |
| Lingering temp profile dirs | Each spec's `cleanup()` calls `context.close()` and `fs.rmSync(userDataDir, { recursive: true, force: true })`. `playwright-report/` and `test-results/` already in `.gitignore` (ADR-19). |

No `throw`s outside test setup invariants (e.g., missing build artifact).
Expected test failures travel through Playwright's `expect()` / locator
timeouts as designed.

#### Test strategy

**This ADR IS the test strategy artifact** — the e2e suite is the strategy
for catching cross-package integration regressions in the extension. No new
unit tests; no new contract tests; no protocol or core changes.

**Coverage philosophy**:
- Each new spec exercises a *user journey*, not a unit. The unit tests
  underneath remain the source of truth for branch coverage.
- Each binding contract from ADR-19, ADR-23, ADR-24 has at least one
  e2e assertion to keep the contract honest:
  - `data-testid` modal contract → asserted by every page-object call.
  - Focus trap binding (ADR-24 §Binding-e) → asserted in accessibility.spec.ts.
  - `aria-live` binding (ADR-24 §Binding-g) → asserted in accessibility.spec.ts test 3.
  - `lgtm-buzzer-quiz-retry` testid (ADR-24 §Binding-k) → asserted in failure-retry.spec.ts + error-paths.spec.ts.
  - `lgtm-buzzer-install-host` testid (ADR-24 §Binding-k) → asserted in error-paths.spec.ts (`host-unreachable` case).
  - Per-class UI title/CTA mapping (ADR-24 §Per-class UI mapping) → asserted in error-paths.spec.ts.
  - Options page persistence (ADR-23 §Sequence-A.5) → asserted in options-page.spec.ts test 2.
  - SW injects storage projection into `quiz-request` (ADR-23 §Binding-b) → indirectly asserted by happy-path: the stub receives a `quiz-request` whose payload includes the adapter IDs the options page wrote. The stub's "happy" scenario does not validate this today; ADR-25 adds a stub-side assertion that the
    `quiz-request` payload contains `llmAdapterId === "claude-api"` after the user saved that selection, and surfaces it via the `__LGTM_E2E_LAST_REQUEST__` global the spec can read. (Optional; if it complicates the stub, defer to an additional unit test of the router.)
  - ADO intercept (ADR-21 §recognizeAdoVoteClick Layer 1) → asserted in ado-intercept.spec.ts.

**Runtime budget**: ≤ 60s on dev hardware. ~3s per case × ~19 cases =
~57s worst case; in practice closer to ~30s with parallel-within-spec
test ordering and stub microtasks.

**Failure visibility**: `trace: "on-first-retry"` + `reporter: [["list"],
["html", { open: "never" }]]` (ADR-19; unchanged). On CI (#54), traces
upload as an artifact when any spec fails.

**Diff-only invariant audit (CLAUDE.md §Key differentiator)**: the e2e
suite touches zero LLM prompt construction. The canned quiz is hard-coded
in `e2e/helpers/canned-quiz.ts`; the stub never invokes a real adapter;
no PR text is read by anything that talks to an LLM. The invariant is
preserved by construction.

#### CI integration (deferred to #54)

This ADR documents the CI requirements; the wiring is #54's responsibility.

- **OS**: Ubuntu (Linux). Windows / macOS not required for v1.
- **Required system packages**: `xvfb-run` (or `Xvfb` + manual DISPLAY
  export). Playwright's Chromium is downloaded by `npm run
  test:e2e:install --workspace=@lgtm-buzzer/extension`. Other Playwright
  system deps are installed by `npx playwright install-deps chromium`
  (run once in the CI Dockerfile / setup step).
- **Command**: `xvfb-run --auto-servernum --server-args="-screen 0 1280x720x24" npm run test:e2e --workspace=@lgtm-buzzer/extension`.
- **Build prerequisite**: `npm run build --workspace=@lgtm-buzzer/extension`
  must run before `test:e2e`.
- **Artifact upload**: `packages/extension/playwright-report/` and
  `packages/extension/test-results/` on failure.
- **NOT in `npm run check`**: per ADR-19, `test:e2e` is a sibling gate.
  `#54` may add it as a separate CI job that gates merge, not a step of
  the main check.

#### Reversibility / future work

- New error-class scenarios (e.g., `version-mismatch` end-to-end) can be
  added by extending `StubScenario` and adding cases in `error-paths.spec.ts`.
- A Firefox / Safari variant lands as new projects in `playwright.config.ts`
  + a forked `launchExtensionContext` that uses the Web Extensions API
  shim. Out of scope for v1.
- A real-host e2e variant (driving the actual native messaging host
  + a stub LLM binary on PATH) can live alongside the stubbed suite as
  `e2e-with-host/` — a separate config and gate. Out of scope.

### Consequences

- **The extension's integration surface is now empirically pinned.** Modal
  state transitions, options-page persistence, ADO interception, and ARIA
  contracts all break the build if they regress.
- **No new runtime dependencies** in any package. The e2e suite already
  has `@playwright/test` as a devDep (ADR-19). No new libraries.
- **The `data-testid` and `data-lgtm-*` contracts become binding for
  refactors.** Page objects are the only consumers; a renamed attribute
  means a one-place update. Reviewer enforces.
- **`headless: false` remains a binding constraint.** The new spec base
  inherits it via `launchExtensionContext`. CI uses Xvfb (#54).
- **The SW-stub scenario API is the canonical way to script the wire.**
  Future e2e tests choose a scenario instead of writing inline stub JS.
  Drift between the stub's JSON shape and the protocol's `FrameSchema` is
  caught by the existing setup-time `parseFrame` round-trip from ADR-19 §3
  (extended to every new scenario reply shape — add one round-trip per
  new frame kind that the stub generates).
- **Runtime cost**: ~30–60s per full run. Acceptable for a sibling
  gate, not for the inner-loop `npm run check`.
- **No protocol or core changes.** ADR-25 is extension-internal; no other
  package can break because of this ADR.
- **Diff-only invariant preserved by construction.** No LLM is invoked
  in any e2e spec.
- **Security**: no real network egress, no real credentials, no real
  LLM, no real host. The fixture HTML files are static and contain no
  GitHub / Microsoft branding or copyrighted assets — they are minimal
  by design.
- **Reversibility high**: removing the suite is `rm -r e2e/` and a
  `package.json` script delete. The existing happy-path spec is
  preserved (renamed) so the M2 gate stays green throughout the M3
  rollout.

**Binding for the reviewer**:
- (a) No new runtime deps in any package. `@playwright/test` is devDep-only.
- (b) No spec may navigate to a real `github.com`, `dev.azure.com`, or
  `*.visualstudio.com` URL. Every navigation goes through
  `routeFixtures(...)`.
- (c) No spec may invoke a real LLM CLI or host binary. The SW stub is
  the only wire.
- (d) Every modal-related spec MUST use the `QuizModal` page object —
  no inline `data-testid` selectors in `*.spec.ts`. Same for `PRPage`
  and `OptionsPage`.
- (e) The `data-testid` attributes from ADR-19/23/24 remain unchanged;
  page objects reference them by constant.
- (f) No spec asserts visual / screenshot output. Text + ARIA + state.
- (g) `npm run test:e2e` MUST remain outside `npm run check`. CI runs
  it as a sibling gate (#54).
- (h) `headless: false` is binding; specs MUST NOT pass `headless: true`
  to `launchPersistentContext`.
- (i) Each new `StubScenario` reply frame MUST round-trip through
  `parseFrame` at setup time (the ADR-19 anti-drift gate); the test
  fails fast if the protocol shape drifts from the stub.
- (j) No spec may persist secrets beyond the test's `cleanup()` — the
  `userDataDir` is `fs.mkdtempSync`d per spec and removed on teardown.
- (k) Diff-only invariant preserved: no spec constructs an LLM prompt.

---


## ADR-26 (2026-05-23): Promptfoo evals workspace — fixture set, assertions, custom providers, non-gating policy
**Date**: 2026-05-23
**Issue**: #52
**Status**: Accepted

### Context

M3 ships four `LLMProvider` adapters (`claude-cli` per ADR-14,
`claude-api` per ADR-20, `codex-cli`, `copilot-cli`). Each consumes the
same `SYSTEM_PROMPT` (locked in `_shared/prompt.ts`) and produces a
`Quiz` parsed by the same `parseQuizFromText` pipeline
(`_shared/quiz-from-text.ts`, ADR-20 §4). The adapters are exercised by
unit + contract tests, but the *quality* of the quizzes they generate
has never been measured. Prompt regressions today land on vibes; we
have no signal for:

- whether questions reference real symbols from the diff;
- whether questions are answerable without reading the diff (the
  failure mode the project's `key differentiator` is built to prevent);
- whether distractors are plausible vs trivially wrong;
- whether the prompt holds up across languages (TS, Go, Python, Rust,
  SQL) and diff shapes (refactor, bug-fix, dep bump, test-only, docs);
- whether stability across runs is good enough to detect regressions
  via small fixture deltas.

CLAUDE.md §Testing has reserved `packages/evals/` for `promptfoo` since
the scaffold ADRs. Issue #52 finalises its v1 shape. promptfoo
(https://promptfoo.dev, MIT licence, dev-only) supports JS/TS custom
providers (`file://path/to/provider.js`, `callApi(prompt, ctx, opts) ->
{ output, ... }`), structured per-test assertions (`is-json`,
`contains-any`, `javascript`, `llm-rubric`, `latency`, `cost`), and
results emitted as JSON / HTML reports that can be committed as a
baseline.

This is not application code. The constitution's hard rules
(hexagonal layering, IO-only side effects, monadyssey-everywhere) bind
shipped runtime; an evals workspace that runs offline against fixture
diffs is a developer tool. We document below the narrow set of
constitution constraints that *do* apply (diff-only invariant, no real
PR data, license allowlist).

### Decision

#### 1 — Workspace placement and scope

A new workspace `packages/evals/` (name `@lgtm-buzzer/evals`,
`"private": true`) is added as a sibling to `protocol`, `core`,
`adapters/*`, `host`, `extension`. It is **not** a TypeScript project
reference (no entry in `tsconfig.json`'s `references`, no entry in
`scripts/build-libs.mjs`), and it is **not** part of
`scripts/typecheck-tests.mjs` — its purpose is to run promptfoo, not
to ship code that's imported by other packages.

The root `package.json` `workspaces` array gains
`"packages/evals"` so `npm install` hoists its deps.

Dependency direction (ADR-1 §Dependency-direction rule) is preserved:
`evals` depends on `adapters/*` and `@lgtm-buzzer/core` (for the
`Quiz`/`LLMProviderError` *type* surface used by custom providers). No
package depends on `evals`. The dependency arrow points strictly
inward.

#### 2 — What we measure (v1 scope)

Four properties, one promptfoo `assert` per row. All assertions run
per-test (per-diff × per-adapter). Latency and (claude-api only) cost
are advisory in v1 — collected and surfaced in the report, not
threshold-gated as a hard failure:

| Property | promptfoo assertion | Pass criterion |
|---|---|---|
| Schema conformance | `is-json` + custom `javascript` assert calling `LlmQuizSchema.safeParse` from `@lgtm-buzzer/adapter-shared` | `safeParse.success === true` AND `correctChoiceIndex` in bounds for every question |
| Symbol grounding | `contains-any` over `vars.expectedSymbols` (ground-truth tokens authored in the fixture) | At least one `expectedSymbols` entry appears verbatim in the concatenated `prompt` + `choices` text |
| LLM-rubric relevance / difficulty / discrimination | `llm-rubric` with `provider: anthropic:claude-sonnet-4-7` (uses `ANTHROPIC_API_KEY`) and a rubric prompt that scores 1–5 on each of three axes | Average score ≥ 3.5; per-axis minimum ≥ 2 |
| Latency (advisory) | `latency` | ≤ 90_000 ms for CLI adapters, ≤ 20_000 ms for `claude-api` |

`cost` is **not** added as a hard assert in v1 — promptfoo's `cost`
assertion only fires for providers that report `tokenUsage` and we
don't wire that through from the host-style adapters. The report
table still shows wall-clock latency per cell.

The locked `SYSTEM_PROMPT` instructs the model to produce *exactly N*
questions, but historically the LLM under-delivers in ~10 % of runs
on small diffs. We do **not** add a hard `questions.length === N`
assertion in v1: the LLM-rubric already penalises low coverage, and a
hard count gate would mask drift behind a flaky red. Q&A count is
collected as a numeric column in the report instead.

The "answerable without the diff" anti-property is verified offline
once, at fixture-creation time, by the human author of each fixture
(documented in the fixture's `expectedSymbols` rationale). We do
**not** automate a "filenames-only baseline" run in v1 because the
SYSTEM_PROMPT receives no filenames-only context shape and re-prompting
the model with a stripped diff would calibrate against a non-production
prompt. Adding that gate properly requires a separate prompt template
and is out of scope.

#### 3 — Fixture set (10 diffs, language × shape matrix)

Fixtures live in `packages/evals/fixtures/`, one folder per fixture
with:

```
fixtures/<slug>/
  diff.patch              # unified diff, ≤ 16 KiB
  ground-truth.json       # { expectedSymbols: string[], notes: string }
  README.md               # one-paragraph human authoring rationale
```

The 10 fixtures (each ≤ 16 KiB; total fixture corpus ≤ 160 KiB):

| Slug | Language | Diff shape | Why it's in the set |
|---|---|---|---|
| `ts-add-validator` | TypeScript | new pure function + tests | baseline; happy path |
| `ts-rename-symbol` | TypeScript | rename across 4 files | detects "did the LLM track the rename" |
| `go-fix-nil-deref` | Go | one-line bug fix + new test | minimal-diff edge-case probe |
| `python-add-route` | Python | new Flask route + handler | non-TS coverage; framework-flavoured |
| `rust-borrow-fix` | Rust | adjust lifetime annotation | language with sharp edges; tests detail capture |
| `sql-migration` | SQL | up + down migration | non-program-flow diff |
| `dep-bump-only` | n/a | `package.json` + lockfile bump | edge case — almost no semantic content |
| `refactor-extract-helper` | TypeScript | move a function across files, no behaviour change | "no behaviour" trap for shallow LLMs |
| `test-only-change` | TypeScript | tests added, source untouched | tests the LLM doesn't hallucinate source changes |
| `docs-readme-update` | Markdown | README rewording | should yield `{ questions: [] }` → adapter surfaces `malformed-response { detail: "empty-quiz" }`; eval expects this and treats it as the **negative-control** assertion |

The `dep-bump-only`, `test-only-change`, and `docs-readme-update`
fixtures intentionally stress the "should the LLM generate at all?"
boundary. For the docs-only fixture, the eval flips polarity: instead
of asserting schema-valid quiz output, it asserts the adapter returns
`malformed-response { detail: "empty-quiz" }`. This is the only
negative-control test in v1 and lives in a separate
`empty-quiz-control.eval.yaml` to keep the main config's assertion
shape uniform.

**Fixture provenance**: all fixtures are hand-authored against
synthetic codepaths (`packages/evals/fixtures/<slug>/diff.patch` is a
unified diff written from scratch, not extracted from
`lgtm-buzzer`'s own git history). Reasons:
1. Real PRs from this repo would leak the project's own concerns
   into the eval rubric (the LLM-as-judge has seen this codebase).
2. The PM spec's `area:security-sensitive` line is unambiguous: no
   real-world PR data, period. Synthetic diffs are the only safe
   source.

#### 4 — Custom provider strategy (direct TS API, not host)

promptfoo invokes one custom provider per adapter. Each provider is a
~40-line TS module under `packages/evals/src/providers/<adapter>.ts`
exposing:

```ts
// packages/evals/src/providers/types.ts
export type EvalProviderOptions = {
  readonly id: () => string;
  readonly callApi: (
    prompt: string,
    context: { vars: Record<string, unknown> },
  ) => Promise<EvalProviderResult>;
};

export type EvalProviderResult = {
  readonly output: string;          // JSON-stringified Quiz, or "" if Err
  readonly error?: string;          // populated when LLMProviderError
  readonly metadata: {
    readonly adapter: string;       // ADAPTER_ID
    readonly latencyMs: number;
    readonly errKind?: string;      // LLMProviderError.kind on failure
  };
  readonly cached: false;           // always false; we never cache LLM output
};
```

Inside the provider's `callApi`:

1. Resolve the diff from `context.vars.diff` (string injected by the
   promptfoo testCase).
2. Construct the adapter factory directly from its TS export
   (`createClaudeCliProvider`, `createClaudeApiProvider`,
   `createCodexCliProvider`, `createCopilotCliProvider`). The factory
   receives a deps object the eval owns: `spawnIO` (for CLI
   adapters, imported from `@lgtm-buzzer/adapter-shared`), a default
   `ids`, and config (`model`, `timeoutMs`, `apiKey` for the API
   variant).
3. Call `provider.generateQuiz({ diff, questionCount: 3 })` →
   `IO<LLMProviderError, Quiz>`.
4. Run the IO with `io.unsafeRun()` (the same pattern the host
   dispatcher uses, see `packages/host/src/dispatcher.ts` L322).
5. `.fold(onErr, onQuiz)` into `EvalProviderResult`. Errors are
   surfaced into `output`/`error` so promptfoo's `javascript` assert
   can inspect them.

**Why direct TS API, not the native-messaging host:**

- The host is a stdio framing + dispatcher layer (ADR-7, ADR-8,
  ADR-17, ADR-22) whose purpose is browser↔native plumbing. Wiring
  promptfoo through it would test the framing layer, not the LLM
  output.
- The adapter factories are pure DI factories (per ADR-11 §6 and
  every adapter ADR since). Their public surface is *designed* to be
  reusable from Node — that is what `packages/host/src/registry.ts`
  already does.
- Bypassing the host eliminates a class of flakes (port handshake,
  frame size limits, JSON encoding round-trip) that would otherwise
  pollute the quality signal we care about.

**Diff-flow audit (KEY DIFFERENTIATOR)**: the only PR-derived input
passed to each provider's `generateQuiz` call is `input.diff`. The
provider modules MUST NOT pass `expectedSymbols`, fixture metadata,
or any other field through to the LLM. The reviewer enforces this
with a single grep: `grep -n "context.vars" packages/evals/src/providers/`
in each provider may appear only on the line that reads
`context.vars.diff`. Fixture metadata (`expectedSymbols`) is consumed
by promptfoo's assertion runner, **not** the provider.

#### 5 — Graceful degradation on missing binaries / keys

CLI adapters require the underlying binary to be installed; the API
adapter requires `ANTHROPIC_API_KEY`. We do **not** want a missing
local tool to red the whole evals run.

Each provider performs a precheck at `callApi` time:

- CLI providers shell out `<binary> --version` via `spawnIO` with a
  3s timeout. `spawn-failed` → return `{ output: "", error:
  "skipped: binary not on PATH", metadata: { adapter, latencyMs: 0,
  errKind: "skipped" } }`. promptfoo's `javascript` assert checks
  `metadata.errKind !== "skipped"` to know whether to score; when
  skipped, the cell is reported as `SKIP` (not pass, not fail).
- `claude-api` provider checks `process.env.ANTHROPIC_API_KEY`; if
  missing, same skip shape.

The README documents that a clean local run requires all four tools.
CI invokes `evals` in a matrix where each adapter is allowed to skip
independently, so a contributor without `gh copilot` installed still
gets useful signal from the other three.

#### 6 — promptfoo configuration

Single config file: `packages/evals/promptfoo.config.yaml`. Shape:

```yaml
description: LGTM-Buzzer quiz-quality evals (v1, ADR-26)
prompts:
  - id: passthrough
    raw: "{{diff}}"     # diff is forwarded verbatim; SYSTEM_PROMPT lives in the adapter
providers:
  - id: claude-cli
    config:
      apiBaseUrl: file://./src/providers/claude-cli.js
  - id: claude-api
    config:
      apiBaseUrl: file://./src/providers/claude-api.js
  - id: codex-cli
    config:
      apiBaseUrl: file://./src/providers/codex-cli.js
  - id: copilot-cli
    config:
      apiBaseUrl: file://./src/providers/copilot-cli.js
defaultTest:
  assert:
    - type: is-json
    - type: javascript
      value: file://./src/asserts/schema-conformance.js
    - type: contains-any
      value: "{{expectedSymbols}}"
    - type: llm-rubric
      provider: anthropic:claude-sonnet-4-7
      value: file://./src/asserts/rubric.md
    - type: latency
      threshold: 90000
tests: file://./tests.generated.json
```

`tests.generated.json` is produced by
`packages/evals/scripts/generate-tests.mjs` at run time — it walks
`fixtures/`, loads each `diff.patch` + `ground-truth.json`, and emits
one test per fixture with `vars: { diff, expectedSymbols }`. This
script is the only build step; it's invoked from `npm run evals` via
`prepromptfoo`.

The negative-control fixture (`docs-readme-update`) is excluded from
the main config and gets its own file
`packages/evals/promptfoo.empty-quiz.config.yaml` with a single
javascript assertion checking
`metadata.errKind === "malformed-response"`.

#### 7 — CI / gating policy (NON-GATING)

Evals are **explicitly excluded** from `npm run check`.

- `npm run evals` (root, delegates to
  `npm run evals -w @lgtm-buzzer/evals`) runs the full suite.
- `npm run evals:quick` runs against three "fast" fixtures
  (`ts-add-validator`, `dep-bump-only`, `docs-readme-update`) only.
- CI (`#54`) is **not** modified by this ADR. The architect for #54
  inherits the constraint that evals run on a separate workflow,
  triggered by either (a) `label:run-evals` on the PR, (b) a weekly
  schedule on `main`, or (c) manual `workflow_dispatch`.
- The baseline result file
  `packages/evals/results/baseline.json` is committed and updated by
  a dedicated PR; never auto-updated by CI.

Rationale: evals are slow (CLI providers take 30–60 s/call, API
~5–15 s/call), consume real LLM credits, and have inherent variance
even at temperature 0 (the CLI providers may not honour temperature
settings). Gating PRs on them would either (a) make every PR slow
and expensive, or (b) tempt contributors to disable the gate.
Schema conformance — the only assertion that is deterministic — is
already covered by each adapter's contract test.

#### 8 — Dependencies and licences

Runtime/dev deps in `packages/evals/package.json`:

| Dep | Version | Where | Licence | Use |
|---|---|---|---|---|
| `promptfoo` | `^0.x` (latest stable at impl time) | devDependency | MIT | the runner |
| `@lgtm-buzzer/adapter-shared` | `*` | dependency | MIT (workspace) | `spawnIO`, `LlmQuizSchema`, `parseQuizFromText` |
| `@lgtm-buzzer/adapter-claude-cli` | `*` | dependency | MIT (workspace) | `createClaudeCliProvider` |
| `@lgtm-buzzer/adapter-claude-api` | `*` | dependency | MIT (workspace) | `createClaudeApiProvider` |
| `@lgtm-buzzer/adapter-codex-cli` | `*` | dependency | MIT (workspace) | `createCodexCliProvider` |
| `@lgtm-buzzer/adapter-copilot-cli` | `*` | dependency | MIT (workspace) | `createCopilotCliProvider` |
| `@lgtm-buzzer/core` | `*` | dependency | MIT (workspace) | `Quiz`/`LLMProviderError` types only |
| `monadyssey` | `2.0.1` | dependency | MIT | `io.unsafeRun()` (same exact-pin as everywhere else) |
| `zod` | `^4.4.3` | dependency | MIT | re-using `LlmQuizSchema` from `_shared` |

`promptfoo` is **dev-only**. No core or protocol surface is affected.
ADR-1's exact-pin rule for `monadyssey` is honoured. ADR-3's
forbidden-FP-libs ESLint rule already applies (the workspace globs
match `packages/*/**`, but a new override block is added below to
match the workspace's `evals` patterns so the same forbidden-lib
patterns apply).

#### 9 — Constitution constraints that still apply

- **Diff-only invariant** (key differentiator): only `vars.diff`
  reaches the adapter — §4 audit above.
- **No real PR data**: §3 fixture provenance — synthetic only.
- **Licence allowlist** (CLAUDE.md §Dependency rules): all deps above
  on the approved list.
- **No throw for expected failures**: providers map `LLMProviderError`
  into the result shape; no exception is allowed to escape `callApi`
  except for programmer errors. A top-level `try/catch` in each
  provider rethrows after recording `errKind: "internal"` so the
  promptfoo run isn't crashed by a bug in the eval harness.
- **ESLint `no-restricted-imports`**: a new override block is added
  for `packages/evals/**/*.ts` that re-applies
  `FORBIDDEN_FP_LIBS.paths` + `patterns`. No DOM-API ban (evals run
  in Node). Node APIs are explicitly allowed (`fs`, `path`,
  `child_process` via `spawnIO`).

Constitution constraints that do **not** apply to evals:
- The `core`/`adapter` IO discipline. Eval providers convert
  `IO<E, A>` to a `Promise<EvalProviderResult>` at the harness
  boundary — that's the analogue of the host's `unsafeRun()` call
  site, not a new boundary violation.

### Affected workspaces

New:
- `packages/evals/` (this workspace; not a TS project reference)

Modified:
- `package.json` (root) — add `packages/evals` to `workspaces`; add
  `evals` and `evals:quick` scripts; do NOT add `evals` to `check`.
- `eslint.config.js` — new override block for
  `packages/evals/**/*.ts` re-applying `FORBIDDEN_FP_LIBS`.

Untouched:
- `tsconfig.json` (root) — evals are not a TS project reference.
- `scripts/build-libs.mjs` — same reason.
- `scripts/typecheck-tests.mjs` — same reason.
- All existing workspaces — no API surface changes.

Dependency direction (ADR-1) reaffirmed:

```
protocol  ← core  ← adapters  ← host
protocol  ← core  ← extension
                  ← evals (dev-only, sibling of host)
```

`evals` imports from `adapters/*` and `core` (type-only); nothing
imports `evals`.

### Types and functions

```ts
// packages/evals/src/providers/types.ts
export type EvalProviderResult = {
  readonly output: string;
  readonly error?: string;
  readonly metadata: {
    readonly adapter: string;
    readonly latencyMs: number;
    readonly errKind?:
      | "skipped"
      | "internal"
      | "subprocess"
      | "transport"
      | "malformed-response"
      | "timeout"
      | "cancelled";
  };
  readonly cached: false;
};

export type CallApiContext = { readonly vars: { readonly diff: string } };

export type EvalProviderModule = {
  readonly default: {
    readonly id: () => string;
    readonly callApi: (
      prompt: string,
      context: CallApiContext,
    ) => Promise<EvalProviderResult>;
  };
};
```

```ts
// packages/evals/src/providers/<adapter>.ts (one per adapter)
export declare const callApi: (
  prompt: string,
  context: CallApiContext,
) => Promise<EvalProviderResult>;
```

```ts
// packages/evals/src/asserts/schema-conformance.ts
import { LlmQuizSchema } from "@lgtm-buzzer/adapter-shared";

export declare const assertSchemaConformance: (
  output: string,
) => { pass: boolean; reason: string };
```

```ts
// packages/evals/scripts/generate-tests.mjs
// Emits tests.generated.json by walking fixtures/.
// Pure ESM script, no exports.
```

### File layout

New (all under `packages/evals/`):

```
package.json
tsconfig.json
README.md
promptfoo.config.yaml
promptfoo.empty-quiz.config.yaml
scripts/
  generate-tests.mjs
src/
  providers/
    types.ts
    claude-cli.ts
    claude-api.ts
    codex-cli.ts
    copilot-cli.ts
    precheck.ts       # shared --version probe with 3s spawnIO budget
  asserts/
    schema-conformance.ts
    rubric.md         # plain text rubric, loaded by llm-rubric
fixtures/
  ts-add-validator/{diff.patch, ground-truth.json, README.md}
  ts-rename-symbol/...
  go-fix-nil-deref/...
  python-add-route/...
  rust-borrow-fix/...
  sql-migration/...
  dep-bump-only/...
  refactor-extract-helper/...
  test-only-change/...
  docs-readme-update/...
results/
  baseline.json          # committed; updated by dedicated PR
  .gitignore             # ignore everything else under results/
```

Modified:
- `package.json` (root) — workspaces + scripts.
- `eslint.config.js` — new override block.

### Sequence

Per `npm run evals`:

1. `pretest` hook → `node scripts/generate-tests.mjs` walks
   `fixtures/`, emits `tests.generated.json` with one entry per
   fixture (`{ vars: { diff, expectedSymbols }, options: { ... } }`).
2. `promptfoo eval -c promptfoo.config.yaml` runs.
3. For each (test × provider) cell:
   a. promptfoo loads the provider module (`file://.../*.js` after
      `tsc`).
   b. promptfoo calls `provider.callApi(prompt, { vars })`.
   c. The provider runs its precheck (`<binary> --version` for CLI;
      `ANTHROPIC_API_KEY` for API). Missing → `errKind: "skipped"`.
   d. Otherwise, the provider builds the adapter via its factory,
      `provider.generateQuiz({ diff, questionCount: 3 })`, runs the
      IO with `unsafeRun()`, folds to `EvalProviderResult`.
   e. promptfoo applies `defaultTest.assert` to the result.
4. promptfoo writes the JSON + HTML report under `results/`.
5. The dev compares against `results/baseline.json` manually before
   committing a baseline update.

For `npm run evals:empty-quiz-control`:
- Same flow with `promptfoo.empty-quiz.config.yaml`; asserts every
  cell returns `errKind: "malformed-response"`.

### Error cases

| Failure | Surfaced as | Eval cell verdict |
|---|---|---|
| Binary not on PATH | `errKind: "skipped"` | SKIP (neither pass nor fail) |
| `ANTHROPIC_API_KEY` unset (claude-api) | `errKind: "skipped"` | SKIP |
| Adapter returns `LLMProviderError.subprocess` | `errKind: "subprocess"`, `error` populated | FAIL |
| Adapter returns `malformed-response` | `errKind: "malformed-response"` | FAIL (PASS for the negative-control fixture) |
| Adapter returns `timeout` | `errKind: "timeout"` | FAIL |
| Caller cancellation (Ctrl-C) | promptfoo propagates SIGINT to the provider; provider relies on `spawnIO` SIGTERM→SIGKILL bounded cancellation (ADR-9). | run aborts cleanly |
| Internal harness bug | `errKind: "internal"`, top-level try/catch | FAIL with stack in `error` |
| LLM-rubric judge call fails (network) | promptfoo reports as `error` on the rubric assert | cell partial-PASS / partial-FAIL surfaced in report |

No `throw` for expected failures. Programmer-error throws (e.g.,
unexpected fixture shape) propagate to the promptfoo runner and red
the run — which is the desired behaviour for harness bugs.

### Test strategy

Evals are themselves the test suite for the prompts. Tests **of the
eval harness** (the provider modules and assertions) live in
`packages/evals/src/**/*.test.ts` and run under the root `vitest`
gate, contributing to `npm run check`:

| File | Cases |
|---|---|
| `src/providers/precheck.test.ts` | spawnIO mock returns `spawn-failed` → `skipped`; happy path → `available`; 3s budget honoured |
| `src/providers/claude-cli.test.ts` | factory wired with fake `spawnIO`; diff in `context.vars.diff` reaches `generateQuiz`; **canary: any non-diff `vars` key is ignored** (KEY DIFFERENTIATOR); `LLMProviderError.subprocess` → `errKind: "subprocess"`; happy path serialises Quiz JSON |
| `src/providers/claude-api.test.ts` | fake HttpClient; same canary; `ANTHROPIC_API_KEY` precheck |
| `src/providers/codex-cli.test.ts` | mirror of claude-cli |
| `src/providers/copilot-cli.test.ts` | mirror of claude-cli |
| `src/asserts/schema-conformance.test.ts` | valid Quiz JSON → pass; invalid JSON → fail; OOB index → fail; empty questions → fail; non-Quiz JSON → fail; reuses `LlmQuizSchema` from `_shared` to ensure single source of truth |
| `scripts/generate-tests.test.mjs` | fixture walk produces N test cases; missing `ground-truth.json` → throws (programmer error) |

The harness tests **do not** call real LLMs; they use the same fake
spawnIO / HttpClient pattern the adapter tests use (ADR-14
`provider.test.ts`, ADR-20 `provider.test.ts`).

Coverage target: 80 % on provider modules; 95 % on
`schema-conformance` (it's a pure function).

A diff-only canary case is **mandatory** in each provider test
(reviewer enforces): the test injects a fake `context.vars` containing
`{ diff: SHORT_DIFF, expectedSymbols: ["LEAK_CANARY"], prTitle:
"LEAK_CANARY", description: "LEAK_CANARY" }`, runs `callApi`, and
asserts (a) the fake `spawnIO` / `HttpClient` was called once and (b)
the captured stdin / HTTP body does NOT contain `"LEAK_CANARY"`.
This is the same shape ADR-14 §Test strategy case #2 already uses
for adapters — extending it to the evals harness is what keeps the
diff-only invariant a closed loop end to end.

### Consequences

- **First quality signal for quiz output.** Prompt tweaks now have a
  measurable target. The locked `SYSTEM_PROMPT` is calibrated against
  the v1 fixture set; non-trivial prompt changes must update the
  baseline.
- **`packages/evals/` is a developer tool, not shipped code.**
  Distinct from every other workspace: not in `tsconfig.json`
  references, not in `build-libs.mjs`, not in `typecheck-tests.mjs`.
  Documented in its `README.md`.
- **Direct TS-API providers, not host plumbing.** Eval signal is
  about LLM output quality, not framing-layer correctness. Two
  separate concerns, two separate harnesses.
- **Diff-only invariant extended to the eval boundary.** Each
  provider has a mandatory canary test asserting non-diff `vars`
  never reach the adapter.
- **Non-gating CI policy.** Evals run on label / schedule, never on
  every PR. Schema conformance — the only deterministic signal — is
  already covered by adapter contract tests.
- **Graceful skip on missing tools.** Contributors without all four
  CLIs installed still get useful signal from the others. CI matrix
  can run each provider in isolation.
- **No new runtime deps in shipped code.** `promptfoo` is a
  devDependency of the evals workspace only.
- **Baseline file is a versioned artifact.** Regressions become
  visible in diff review; refreshing the baseline is a deliberate
  PR, not auto-updated by CI.
- **Open path: A/B prompt variants, multi-turn eval, fairness/bias
  testing, real `cost` assertions.** Explicitly out of v1 scope; each
  is a future ADR.
- **`SYSTEM_PROMPT` in `_shared` is now load-bearing for the evals.**
  Comment in `_shared/prompt.ts` already references issue #52; the
  evals workspace README points back. Any future ADR amendment to
  `SYSTEM_PROMPT` must include a baseline-refresh step.
- **Reversibility high.** Self-contained workspace; removing it is a
  three-file revert (root `package.json`, `eslint.config.js`, delete
  `packages/evals/`).
- **Binding for reviewer (PR #52 implementation)**:
  (a) `packages/evals/` is NOT a TS project reference.
  (b) Each provider module passes ONLY `context.vars.diff` to
      `generateQuiz`; canary test enforced.
  (c) `npm run check` does NOT run evals.
  (d) Every fixture has `diff.patch`, `ground-truth.json`,
      `README.md`.
  (e) `promptfoo` is a `devDependency`, not a `dependency`, of the
      evals workspace.
  (f) ESLint forbidden-FP-libs block is re-applied via
      `packages/evals/**/*.ts` override.
  (g) Baseline file is committed; results directory otherwise
      `.gitignore`d.

---

## ADR-27 (2026-05-23): CI workflows — required check + e2e on PR, manual/scheduled evals, branch protection
**Date**: 2026-05-23
**Issue**: #54
**Status**: Accepted

### Context

M3 ships 854 unit tests across the workspaces, 19 Playwright e2e specs in
`packages/extension/e2e/` (ADR-25), and a non-gating promptfoo evals suite in
`packages/evals/` (ADR-26). The only quality gate today is the developer's
local `npm run check`. Every push to `main` is implicitly trusted; nothing
prevents a regressed build, a failing unit test, an ESLint error, or a broken
e2e spec from landing.

Constraints that shape this design:

- **`npm run check` is the canonical gate** (root `package.json` L30):
  `build → test → lint → typecheck:tests`. ADR-2 made `typecheck:tests`
  binding because `tsc -b` excludes `**/*.test.ts` in every workspace. CI
  must run the same command — not a hand-assembled re-implementation that
  drifts.
- **Playwright e2e cannot run in headless mode.** ADR-19 §spec-comment-1 and
  ADR-25 §Context both bind `headless: false`: Chrome does not expose MV3
  extension service workers to CDP in headless mode;
  `context.waitForEvent("serviceworker")` times out unconditionally. The
  e2e config (`packages/extension/e2e/playwright.config.ts` L36) carries
  the binding comment `On CI: use xvfb-run (#54)`. Linux CI must therefore
  run e2e under `xvfb-run`.
- **Evals cost real money and require credentials.** ADR-26 §7 makes evals
  explicitly NON-GATING. The `claude-api` provider needs
  `ANTHROPIC_API_KEY`; the three CLI providers (`claude-cli`, `codex-cli`,
  `copilot-cli`) need binaries that themselves require interactive logins
  (`claude login`, `codex login`, `gh auth`). CI cannot acquire those
  logins, so CLI-provider cells will SKIP in CI (ADR-26 §5 graceful-skip
  contract). Only `claude-api` is meaningfully runnable in CI.
- **Single-monorepo workspace.** All checks run from the repo root with
  `npm install` (root) hoisting workspaces. No per-workspace install loops.
- **MV3 manifest is built by `wxt`** (`packages/extension/build` script
  invokes `wxt build`). E2e specs load the unpacked extension from
  `packages/extension/.output/chrome-mv3/`. The `build` step in
  `npm run check` already produces this output, so the e2e job can reuse
  the build artifact rather than rebuilding.
- **No release automation, no Docker, no coverage thresholds in v1.**
  Issue #55 owns packaging; coverage gating is premature with the current
  test count distribution.
- **GitHub Actions only.** The user is on GitHub; no alternative CI exists.
- **Linux-only runners for v1.** macOS minutes cost 10x; Windows minutes
  cost 2x. v1 ships Chrome MV3 only — Linux is the cheapest correct host.

### Decision

Two workflow files under `.github/workflows/`:

1. **`.github/workflows/ci.yml`** — required, blocking CI. Two jobs running
   in parallel: `unit-and-build` (runs `npm run check`) and `e2e` (runs the
   Playwright suite under `xvfb-run`). Triggers: `push` to `main` and
   `pull_request` against `main`. Both jobs upload artifacts on failure.
2. **`.github/workflows/evals.yml`** — non-blocking, cost-bearing evals.
   Triggers: `workflow_dispatch` (manual), `schedule` (weekly Mon 09:00 UTC
   on `main`), and `pull_request` gated on the `run-evals` label. Runs only
   the `claude-api` provider via `ANTHROPIC_API_KEY`; the three CLI
   providers SKIP in CI (no interactive login). Uploads
   `packages/evals/results/` as artifact.

Plus one documentation file `.github/workflows/README.md` describing how to
trigger evals, what each workflow checks, and how to add new jobs.

#### Affected workspaces

Repo-level only (`.github/workflows/`). No `packages/*` source files touched
by this ADR.

- One root file added: `package.json` gets an `engines.node` bump from
  `>=20` to `>=22` (Node 22 LTS) so the CI Node choice is anchored in
  source rather than the workflow file. ADR-1's npm-workspaces decision is
  unchanged; the bump is from "any 20+" to "anchored at the 22 LTS major"
  so CI doesn't drift from the dev environment.

Dependency arrows reaffirmed (ADR-1):

```
protocol  ← core  ← adapters  ← host
protocol  ← core  ← extension
                  ← evals (dev-only, sibling of host)
```

CI workflows do not introduce any new code that imports across workspaces;
they only run npm scripts.

#### Workflow design

##### 1. `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# Cancel superseded runs on the same ref (saves minutes on rapid pushes).
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

# Default minimal permissions; jobs that need more grant explicitly.
permissions:
  contents: read

jobs:
  unit-and-build:
    name: unit + build + lint + typecheck:tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run full check gate
        run: npm run check

      - name: Upload coverage on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-${{ github.run_id }}
          path: |
            packages/*/coverage/
            coverage/
          if-no-files-found: ignore
          retention-days: 7

  e2e:
    name: extension e2e (xvfb + chromium)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        id: playwright-cache
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
          restore-keys: |
            playwright-${{ runner.os }}-

      - name: Install Chromium (with system deps for xvfb)
        run: npx playwright install --with-deps chromium
        # --with-deps installs xvfb + libs even on cache hit (cheap apt step).

      - name: Build extension
        run: npm run build:extension

      - name: Run e2e under xvfb
        run: xvfb-run --auto-servernum --server-args='-screen 0 1280x1024x24' npm --workspace=@lgtm-buzzer/extension run test:e2e

      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ github.run_id }}
          path: |
            packages/extension/playwright-report/
            packages/extension/test-results/
          if-no-files-found: ignore
          retention-days: 7
```

Key design choices:

- **`npm ci` not `npm install`.** Deterministic — required for reproducible
  CI. Fails the build if `package-lock.json` is stale.
- **`node-version-file: .nvmrc`.** Single source of truth. The file
  contains `22` (LTS) and is checked into the repo by this ADR's
  implementation. Bumping Node is a `.nvmrc` edit; the workflows
  automatically follow.
- **`cache: npm`** on `setup-node` caches `~/.npm` keyed on
  `package-lock.json`. First run cold ~60s; warm ~10s.
- **Playwright browsers cached separately** via `actions/cache@v4`.
  Browser bundles are ~150 MiB; npm cache does not cover them.
- **`--with-deps` runs on every job** (not gated on cache miss). It
  installs OS-level libs (xvfb, libnss3, fonts) via `apt-get` —
  necessary even when the browser binary is cached, because system libs
  aren't part of `~/.cache/ms-playwright`.
- **`xvfb-run --auto-servernum`** picks a free display number; the
  `--server-args` give a 1280x1024 24-bit display, which matches what
  `packages/extension/e2e/playwright.config.ts` and ADR-25's specs assume.
- **Two parallel jobs, no cross-job dependency.** `e2e` does a separate
  `npm ci` + build because cross-job artifacts cost more time to upload /
  download than rebuilding from a warm npm cache. (Re-evaluate if
  `unit-and-build` ever exceeds 7 minutes.)
- **`concurrency` cancels superseded runs.** A rapid sequence of pushes
  to the same PR branch cancels the older run. `cancel-in-progress: true`
  is safe here because all gates are idempotent; no deployment lives in
  this workflow.
- **`permissions: contents: read`** minimises the GITHUB_TOKEN scope. The
  default Actions token has broader perms; downgrading reduces blast
  radius from a compromised action.
- **Artifact retention 7 days.** Long enough for triage, short enough not
  to bloat storage.

##### 2. `.github/workflows/evals.yml`

```yaml
name: Evals (non-gating)

on:
  workflow_dispatch:
    inputs:
      suite:
        description: "Which suite to run"
        required: true
        default: "quick"
        type: choice
        options:
          - quick
          - full
          - empty-quiz-control
  schedule:
    # Mondays 09:00 UTC — weekly drift signal.
    - cron: "0 9 * * 1"
  pull_request:
    types: [labeled, synchronize]
    branches: [main]

concurrency:
  group: evals-${{ github.ref }}
  cancel-in-progress: false  # Evals cost money; don't cancel a mid-run cell.

permissions:
  contents: read

jobs:
  evals:
    name: promptfoo evals (claude-api only in CI)
    # Run on workflow_dispatch / schedule unconditionally; on pull_request
    # only when the PR carries the `run-evals` label.
    if: >
      github.event_name == 'workflow_dispatch' ||
      github.event_name == 'schedule' ||
      (github.event_name == 'pull_request' &&
       contains(github.event.pull_request.labels.*.name, 'run-evals'))
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build workspace libs (evals depend on built adapter outputs)
        run: npm run build:libs

      - name: Run evals
        run: |
          case "${{ github.event_name == 'workflow_dispatch' && inputs.suite || 'quick' }}" in
            quick)               npm run evals:quick ;;
            full)                npm run evals ;;
            empty-quiz-control)  npm --workspace=@lgtm-buzzer/evals run evals:empty-quiz-control ;;
            *)                   npm run evals:quick ;;
          esac

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: evals-results-${{ github.run_id }}
          path: packages/evals/results/
          if-no-files-found: ignore
          retention-days: 30
```

Key design choices:

- **Manual dispatch is the default trigger.** Cost discipline. The
  `workflow_dispatch` input lets the user pick `quick` (3 fixtures, ~$0.30)
  or `full` (10 fixtures, ~$1) without editing the workflow.
- **Weekly schedule runs `quick`.** ADR-26 §3 makes the full 10-fixture
  set hand-authored; a weekly quick run on `main` produces a baseline
  drift signal without burning $1/week.
- **`pull_request: labeled`** plus `if: contains(... labels ..., 'run-evals')`
  lets a reviewer opt a PR into evals by labelling it. Required because the
  reviewer agent or human reviewer may want to validate a prompt change
  before merging.
- **Only `claude-api` actually executes.** CLI adapters' precheck
  (ADR-26 §5) returns `errKind: "skipped"` because `claude` / `codex` /
  `gh copilot` are not on PATH. The eval cell is reported SKIP, not FAIL.
  No CLI binary install attempted — interactive login requirement is
  inherently incompatible with CI.
- **`ANTHROPIC_API_KEY` lives in repo secrets**, NOT in `vars`. Required
  for the API provider and for the `llm-rubric` judge call.
- **`cancel-in-progress: false`.** A mid-run cancellation can leak credits
  (the API call is in flight when the cancel arrives) without producing a
  result.
- **Build only libs, not the extension.** Evals don't need the MV3 bundle.
- **30-day artifact retention.** Evals are a quality signal; longer-lived
  than CI artifacts because the baseline conversation spans weeks.
- **Use `npm --workspace=@lgtm-buzzer/evals run evals:empty-quiz-control`**
  directly for the negative-control suite — there's no root-level
  pass-through script for it. `quick` and `full` have root scripts; the
  control suite does not.
- **No matrix.** A four-way provider matrix on each fixture would make
  the workflow file ~3x more complex without changing what runs in CI
  (only `claude-api` has credentials). Locally, the matrix is implicit
  via the four provider modules; in CI, it collapses to one.

##### 3. `.github/workflows/README.md`

A short prose file (one screen) covering:
- "What runs when" table mapping trigger → workflow → suite.
- How to manually dispatch the evals workflow (`gh workflow run evals.yml -f suite=full`).
- How to opt a PR into evals (add the `run-evals` label).
- How to add a new job to `ci.yml` (must keep it under the timeout budget;
  must run `npm ci` deterministically; must be gated on
  `pull_request` + `push` only).
- Where to add new secrets (Repo Settings → Secrets and variables → Actions).
- Why we don't run CLI evals in CI (the `claude` / `codex` / `gh copilot`
  CLIs require interactive login that CI cannot complete).
- The branch-protection follow-up (see §Branch protection follow-up below).

#### Branch protection follow-up (manual, post-merge)

After this ADR's workflow lands and runs green at least once on `main`,
the repo admin (the user) must update the branch-protection rule for
`main` in Repo Settings → Branches:

1. Mark the following status checks as **Required**:
   - `unit-and-build` (from `ci.yml`).
   - `e2e` (from `ci.yml`).
2. Leave `evals` UN-required (it's intentionally non-gating).
3. Keep "Require branches to be up to date" enabled.
4. Keep "Require pull request reviews before merging" at its current
   setting (out of scope for this ADR).

This step is manual because GitHub branch-protection API changes via
Actions require a PAT with `repo` scope and we don't want to introduce
PAT management for a one-time toggle. Document the step in
`.github/workflows/README.md` so it's reproducible if the repo is ever
re-bootstrapped.

#### Node version anchoring

The root `package.json` currently has `"engines": { "node": ">=20" }`,
which is too loose for CI (range, not a pin) and doesn't match the LTS
schedule. This ADR anchors Node 22 LTS:

1. `package.json` `engines.node` → `">=22"`.
2. New `.nvmrc` containing `22` at repo root. The CI workflows read this
   via `node-version-file: .nvmrc` (single source of truth — no value
   duplicated in the YAML).
3. Dev contributors with `nvm` get the right version automatically (`nvm
   use`).

Node 22 LTS support extends to April 2027. Reassess at v1.1.

#### Types

This ADR introduces no application-level types. It does anchor one
configuration shape:

```yaml
# .github/workflows/evals.yml workflow_dispatch input
inputs:
  suite:
    type: choice
    options: [quick, full, empty-quiz-control]
    default: quick
```

#### File layout

New files:

```
.github/
  workflows/
    ci.yml                # required CI: unit+build, e2e
    evals.yml             # non-gating: manual + scheduled + label
    README.md             # how to trigger / extend / required secrets
.nvmrc                    # contains "22"
```

Modified files:

```
package.json              # engines.node: ">=20" → ">=22"
README.md                 # adds CI status badge (top of doc, under title)
CLAUDE.md                 # references .github/workflows/ in the Build/Test/Lint section
```

No `packages/*` source files modified.

#### Sequence

**On `push` to `main` or `pull_request` against `main`:**

1. GitHub Actions schedules `unit-and-build` and `e2e` jobs in parallel.
2. `unit-and-build`:
   a. Checkout → setup Node from `.nvmrc` → `npm ci`.
   b. `npm run check` (build → test → lint → typecheck:tests).
   c. On failure: upload `coverage/` artifacts; job fails red.
3. `e2e` (in parallel):
   a. Checkout → setup Node from `.nvmrc` → `npm ci`.
   b. Restore Playwright browser cache.
   c. `npx playwright install --with-deps chromium` (installs system
      deps including `xvfb` even on cache hit).
   d. `npm run build:extension` (produces `.output/chrome-mv3/`).
   e. `xvfb-run … npm --workspace=@lgtm-buzzer/extension run test:e2e`.
   f. On failure: upload `playwright-report/`, `test-results/`; job
      fails red.
4. Both jobs report their status to the PR's check suite.
5. Branch protection (manual follow-up) blocks merge until both are
   green.

**On `workflow_dispatch` (evals.yml):**

1. User invokes `gh workflow run evals.yml -f suite=<quick|full|empty-quiz-control>`.
2. `evals` job runs:
   a. Checkout → setup Node → `npm ci` → `npm run build:libs`.
   b. Switch on `inputs.suite`:
      - `quick` → `npm run evals:quick`.
      - `full` → `npm run evals`.
      - `empty-quiz-control` → workspace-direct
        `npm --workspace=@lgtm-buzzer/evals run evals:empty-quiz-control`.
   c. `promptfoo` executes; `claude-api` provider runs, three CLI
      providers SKIP per ADR-26 §5.
   d. Upload `packages/evals/results/` artifact (30-day retention).

**On `schedule` (Mon 09:00 UTC, evals.yml):**

1. Same as `workflow_dispatch` with `inputs.suite` defaulted to `quick`
   (the YAML conditional `github.event_name == 'workflow_dispatch' &&
   inputs.suite || 'quick'` resolves to `'quick'` because `inputs` is
   absent on schedule triggers).
2. Result artifact retained for 30 days; surfaces baseline drift.

**On `pull_request` with `run-evals` label (evals.yml):**

1. The job's `if:` condition matches; the run proceeds with
   `inputs.suite || 'quick'` (defaults to quick because no
   `workflow_dispatch` input is present).
2. Same flow as schedule.
3. Artifact uploaded; PR reviewer downloads to inspect.

#### Error cases

| Failure | Surfaced as | Handling |
|---|---|---|
| `npm ci` fails (stale lockfile) | `unit-and-build` red | Dev runs `npm install` locally, commits lockfile update. |
| `npm run check` fails (unit/lint/typecheck) | `unit-and-build` red, coverage uploaded | Dev fixes locally, re-pushes. |
| Playwright browser install fails (network) | `e2e` red | Retry; if persistent, file infra issue. Cache hit avoids re-download on the next run. |
| `xvfb-run` not present | `e2e` red at xvfb invocation | `--with-deps` installs `xvfb`; if it didn't, infra regression. |
| `e2e` flake (timeout in a spec) | `e2e` red with HTML report uploaded | Dev opens the artifact, decides if it's a genuine break or flake. **Retries are NOT auto-added in v1**; flaky tests are a quality smell, not a CI knob. |
| `ANTHROPIC_API_KEY` missing in evals run | All `claude-api` cells SKIP per ADR-26 §5; CLI cells SKIP independently | Workflow still goes green (evals are non-gating); artifact shows the SKIPs. User notices via the artifact's report. |
| `ANTHROPIC_API_KEY` present but invalid | `claude-api` cells return `LLMProviderError.transport` → `errKind: "transport"`, cell FAILs | Run reports red but doesn't block merge (workflow not in branch-protection required list). |
| Scheduled run on a weekend skip-day | n/a | Mondays 09:00 UTC is intentional — captures the start-of-week drift. |
| Concurrency cancellation on `ci.yml` | Older run cancelled; new run starts fresh | Expected. Idempotent gates make cancellation safe. |
| Concurrency cancellation on `evals.yml` | Disabled (`cancel-in-progress: false`) | Avoids leaking $$$ mid-call. |
| `actions/checkout@v4` major-version drift | Pinned to `v4` major; minor versions auto-resolve | Re-pin via dedicated PR if the major bumps. |
| Forked-PR access to `ANTHROPIC_API_KEY` | GitHub's default is to NOT expose secrets to forked-PR runs | Evals on forked PRs SKIP API too — by design (no token leak). Document in README. |

No `throw` paths apply here — workflows aren't TS code; the equivalent
discipline is "every step's exit code is checked, every artifact uploaded
on failure, no `continue-on-error: true` hides a real break."

#### Test strategy

CI workflows are themselves the test strategy for the project. There is
no automated test of the workflows other than running them. Validation
plan for the implementation PR:

1. **Local validation** before push:
   - `act -W .github/workflows/ci.yml` (optional; `act` doesn't reproduce
     xvfb perfectly so this is a smoke check only).
   - `gh workflow view ci.yml` after push to inspect the parsed YAML.
2. **First-push validation**:
   - Open a draft PR; observe both jobs run to completion.
   - Intentionally break one test in the draft; observe `unit-and-build`
     fails red and uploads coverage.
   - Revert; observe both green.
3. **e2e validation**: confirm `xvfb-run` produces a 30+-second e2e run
   (cold) and 15+-second run (warm browser cache). If durations vastly
   exceed budget (10/15-min timeouts), open a follow-up to investigate.
4. **Evals validation**: dispatch `evals.yml` with `suite=quick` once
   the secret is set. Confirm `claude-api` cells run, CLI cells SKIP,
   artifact uploaded. Cost should be ~$0.30.
5. **Branch-protection toggle**: after first green run on `main`,
   the user manually adds `unit-and-build` and `e2e` to required checks.

Manual smoke is acceptable here because workflow logic is small,
self-checking (CI is its own test), and the workflows themselves run
the project's full unit/e2e suites which carry deep test coverage.

#### Speed budget

| Job | Cold | Warm (cache hit) | Timeout |
|---|---|---|---|
| `unit-and-build` | ~4 min | ~2 min | 10 min |
| `e2e` | ~8 min | ~5 min | 15 min |
| `evals` (quick) | ~5 min | ~3 min | 30 min |
| `evals` (full) | ~20 min | ~15 min | 30 min |

If `unit-and-build` regularly exceeds 7 minutes, revisit whether to
split `test` into per-workspace parallel jobs. If `e2e` regularly
exceeds 12 minutes, revisit the test-count budget set by ADR-25 (15-25
cases).

#### What is NOT in v1 (explicit out-of-scope)

- **Coverage threshold gates.** ADR-1 sets coverage targets (90% core,
  80% adapters) as goals, not gates. Adding a gate is premature given
  current test count distribution.
- **macOS / Windows runners.** Linux is sufficient for v1 (Chrome MV3
  only). Adding macOS or Windows costs 10x and 2x respectively.
- **Release automation.** Issue #55 owns packaging the host binary.
  Release tag → asset upload comes after #55 ships.
- **Auto-merge.** Manual merge is fine at v1's velocity.
- **Dependabot / Renovate.** Manual deps for v1; revisit at v1.1.
- **Docker container builds.** No Docker image yet.
- **Native messaging host integration test in CI.** The host expects a
  configured `claude` CLI; CI can't reproduce that. Smoke is manual.
- **Cross-browser e2e (Firefox / Safari).** Chrome MV3 only at v1.
- **PR comment bots.** GitHub's native check UI is enough.
- **Flake-retry knobs.** `retries: 0` on the Playwright config carries.
  Adding `retries: 2` in CI would mask real instability. Reassess only
  if a specific spec flakes ≥ 5% on otherwise-passing PRs.

### Consequences

- **First automated quality gate.** Every PR now runs the same `npm run
  check` the dev runs locally, plus the e2e suite under xvfb. Drift
  between "works on my machine" and "works on `main`" closes.
- **Two independent gates.** `unit-and-build` and `e2e` run in parallel;
  one job's failure doesn't mask the other. Both are required for merge
  (after manual branch-protection toggle).
- **Evals stay non-gating.** ADR-26 §7 is preserved verbatim — evals
  never block a PR; they produce a quality signal on demand or weekly.
- **Cost discipline.** Only `claude-api` runs in CI. Three CLI providers
  SKIP because their binaries can't be installed-and-authenticated
  unattended. Weekly schedule on `quick` keeps the API bill ~$1.30/month.
- **Single source of truth for Node version.** `.nvmrc` is read by both
  the workflows and any contributor with `nvm`. Bumping Node is a
  one-line `.nvmrc` edit.
- **Cancellation policy split**: `ci.yml` cancels superseded runs
  (idempotent gates); `evals.yml` does not (avoids $$$ leak).
- **One manual follow-up step.** After the first green run, the user
  toggles branch protection to require `unit-and-build` + `e2e`. This is
  documented in `.github/workflows/README.md`.
- **Workflow files are reviewable.** Each YAML file stays under ~150
  lines; total surface ~300 lines + a short README. Easy to audit.
- **Reversibility high.** Workflows are self-contained; deletion is one
  PR with no impact on the runtime monorepo.
- **Security posture**:
  - GITHUB_TOKEN scoped to `contents: read`.
  - `ANTHROPIC_API_KEY` is a repo secret, never exposed to forked PRs
    (GitHub default).
  - No third-party Actions beyond `actions/checkout`, `actions/setup-node`,
    `actions/cache`, `actions/upload-artifact` — all official.
  - Action versions pinned to majors (`@v4`). Re-evaluate dedicated
    SHA pinning if the security threat model evolves.
- **Future-proofing**: evals workflow's matrix-collapse to one provider
  is intentional. If CI ever acquires CLI-login automation (e.g.,
  pre-baked container images with logged-in CLIs), the YAML can fan out
  into a provider matrix without restructuring the rest.
- **Binding for the reviewer (PR #54 implementation)**:
  (a) `ci.yml` runs on `push: main` and `pull_request: main`; nothing else.
  (b) `unit-and-build` invokes `npm run check`, NOT a hand-assembled
      `npm test && npm run lint && …` chain.
  (c) `e2e` uses `xvfb-run`; `headless: true` is forbidden.
  (d) `npm ci`, not `npm install`. Stale lockfiles must fail.
  (e) `node-version-file: .nvmrc`. No hardcoded Node version in YAML.
  (f) `evals.yml` is NOT triggered on regular `pull_request`; only on
      `labeled` with `run-evals`.
  (g) `evals.yml` reads `ANTHROPIC_API_KEY` from secrets; no other
      secret accessed.
  (h) Workflow `permissions:` is `contents: read` (minimum viable).
  (i) Failure artifacts uploaded with `if-no-files-found: ignore` so the
      artifact step doesn't itself fail a broken job.
  (j) `.github/workflows/README.md` documents the branch-protection
      follow-up and the manual dispatch syntax.

---

## ADR-28 (2026-05-23): Release packaging script — extension zip + bundled host tarball, version from root package.json
**Date**: 2026-05-23
**Issue**: #55
**Status**: Accepted

### Context

M3 is shipping and the project needs an artifact pair a stranger can install
without building from source. Today:

- `packages/extension/package.json` already exposes `wxt zip`, which writes
  `packages/extension/.output/lgtm-buzzer-<version>-chrome.zip` next to the
  unpacked `chrome-mv3/` directory. The MV3 manifest version is set in
  `packages/extension/wxt.config.ts` (`manifest.version: "0.0.0"`).
- `packages/host` builds with `tsc -b` into `packages/host/dist/` and ships
  three runtime-relevant files: `cli.js` (entry), `install-manifest.js`
  (ADR-23 §install-manifest), and a tree of compiled module files. The host
  depends on six adapter packages, `@lgtm-buzzer/core`, `@lgtm-buzzer/protocol`,
  `monadyssey`, and `pino`.
- The native-messaging install logic in `packages/host/src/install-manifest.ts`
  already builds the per-OS manifest in memory (`buildManifest`) — but it
  resolves `hostBinaryPath` relative to its own `import.meta.url`, which
  hard-codes the install layout (`<install-root>/cli.js` next to
  `install-manifest.js`).
- Root `package.json` has `version: "0.0.0"` and lists all workspaces.
  Workspaces individually carry `0.0.0`. There is no version bump flow.
- `.gitignore` already ignores `dist/`, `.output/`, and `node_modules/`.
- ADR-27 §"What is NOT in v1" explicitly defers release packaging to this
  issue. ADR-27 also ensures CI runs `npm run check` on every PR — so the
  packaging script can rely on that gate having passed.
- Issue #55 open questions:
  1. Bundle the host into a single JS file, or ship a directory + `npm install`.
  2. Whether to emit a checksums file.

Constraints that shape this design:

- **Two artifacts only**: extension zip (Chrome MV3) and host tarball
  (everything the user needs to install the native-messaging side).
- **Linux + macOS in scope; Windows out of scope** (ACK from issue #55 AC).
  Windows registry installation is documented as a future-work item.
- **Single source of truth for version**. The artifact pair must move in
  lockstep — the host and extension speak a versioned protocol (ADR-7) and
  drifting the two creates a mystery-failure mode.
- **No network at install time.** A user extracting the tarball must not
  need `npm install`. The host has many transitive deps (monadyssey, pino,
  zod, plus six adapter workspaces). Shipping `node_modules` bloats the
  tarball and ties it to a glibc/macOS variant; shipping `package.json`
  forces `npm install` which forces network + npm-on-PATH. Bundling to a
  single JS file is the only no-network path that fits the host's actual
  deps.
- **No new runtime deps in `core` or `protocol`.** The script lives at
  the repo root and is dev-tooling only (`scripts/*.mjs`), so it does not
  touch the dependency-direction rule.
- **Existing tooling**: `esbuild` is already a transitive dep through wxt
  (`packages/extension/node_modules/.../esbuild`), and pinning a direct
  devDep ensures the bundler version is stable. `tar` is in the macOS and
  Linux POSIX baseline; no Node-side tar lib needed.

### Decision

Add one repo-root script — `scripts/release.mjs` — invoked via
`npm run release:build`. It produces exactly two artifacts plus an
optional checksums file under `dist/` at the repo root:

```
dist/
  lgtm-buzzer-extension-v<version>.zip       MV3-ready, just the wxt output renamed
  lgtm-buzzer-host-v<version>.tar.gz         Single-file bundled host + installer
  checksums.txt                              SHA256 + byte size of both artifacts
```

The script is platform-aware (macOS + Linux); Windows packaging stays
out of scope. The host is bundled to a single ESM file via `esbuild`
so users extract the tarball and run `node host/index.js` immediately —
no `npm install` step.

#### Affected workspaces

This is a **repo-root tooling change**. Files added under `scripts/` and
modified at the repo root plus minimal touch-ups under `packages/host/`
and `packages/extension/`:

- `scripts/release.mjs` — new, repo-root dev tooling. Not a workspace.
- `scripts/release.mjs.test.ts` location — see "File layout" below; the
  tests live as a Vitest file under `scripts/` and are picked up by the
  root `vitest run`.
- `packages/host/` — small additions: a `manifest.template.json` file
  (newly authored) and a refactor of `install-manifest.ts` so it can
  resolve the host binary either from the existing dev layout
  (`dist/cli.js` next to `dist/install-manifest.js`) or from the
  bundled-tarball layout (`index.js` next to `install-manifest.js` at
  the tarball's host root). This keeps the existing test suite green.
- `packages/extension/wxt.config.ts` — its `manifest.version` field
  reads from the root `package.json` `version` at config-load time so
  the extension's MV3 manifest carries the same version as the tarball.
- Root `package.json` — `version` bumps from `0.0.0` to `0.1.0` as part
  of the same PR (M3 release version). New devDep `esbuild` pinned with
  the project's default caret. New scripts: `release:build`, `release:clean`.

Dependency arrows reaffirmed (ADR-1):

```
protocol  ← core  ← adapters  ← host
protocol  ← core  ← extension
```

The release script is dev tooling outside the package graph — it does
not import workspace source. It only orchestrates `npm` invocations,
file copies, `esbuild` bundling, and `tar`/`zip` operations. The
dependency-direction rule is intact.

#### Bundling strategy for the host

The host is bundled to a **single ESM file** via `esbuild` with the
following configuration:

```js
// inside scripts/release.mjs
await esbuild.build({
  entryPoints: ["packages/host/dist/cli.js"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "<tmpdir>/host/index.js",
  banner: { js: "#!/usr/bin/env node" },
  external: [],
  minify: false,
  sourcemap: "inline",
  legalComments: "inline",
  logLevel: "warning",
});
```

Notes binding the implementation:

- **Entry is `packages/host/dist/cli.js`**, not `src/cli.ts`. The script
  runs `npm run check` first (per ADR-27), which produces the compiled
  output. Bundling pre-compiled JS keeps the script simple (no TS plugin
  needed) and ensures the same source the test gate validated is what
  gets shipped.
- **`platform: "node"`** so Node built-ins (`node:fs`, `node:os`,
  `node:child_process`, `node:stream`, `node:process`, `node:util`,
  `node:path`, `node:url`) are externalised automatically.
- **`format: "esm"`** because the project is ESM-only (`type: "module"`
  in every `package.json`). `target: "node22"` matches ADR-27's anchor.
- **`external: []`** explicitly — everything (monadyssey, pino, zod,
  every adapter workspace) gets bundled in. No `node_modules` ships.
- **`minify: false`** — debuggability over bytes. The bundle is a few
  hundred KB either way, and stack traces on a user's machine must be
  legible.
- **`sourcemap: "inline"`** — inline so the tarball stays a flat layout
  (no `.js.map` sidecars) and so stack traces resolve out of the box.
- **`legalComments: "inline"`** — preserves bundled deps' MIT/BSD/ISC
  licence notices in the output, satisfying attribution requirements
  without a separate THIRD-PARTY-NOTICES file in v1.
- **`banner: { js: "#!/usr/bin/env node" }`** — the bundled file is
  marked executable by the script (`chmod 0o755`) so the manifest's
  `path` field can point at it directly.
- **A second, smaller bundle for the installer** runs the same `esbuild`
  call for `packages/host/dist/install-manifest.js`, output to
  `<tmpdir>/host/install-manifest.js`, also with the
  `#!/usr/bin/env node` banner and 0o755 permissions. The installer is
  bundled (not just copied) so it has no relative-import dependency on
  any sibling files — important because the installer ships standalone.

Rejected alternatives:

- **Ship workspace as-is + `npm install` at install time.** Forces a
  network step on first install, ties the install to npm version, and
  doubles tarball complexity. Rejected.
- **`pkg` / `vercel/pkg` / `bun build --compile`** to produce a real
  native binary. Forces per-OS variants (darwin-arm64, darwin-x64,
  linux-x64, linux-arm64), changes the security story (now we ship a
  binary blob), and requires CI matrix when we automate releases.
  v1 ships interpreted JS; reassess at v1.1 if we ever need to remove
  the "Node 22+ on PATH" install prerequisite.
- **`tsc-alias` post-process + ship workspace + node_modules.**
  Tarball size, glibc/musl portability problems. Rejected.

#### Tarball layout

After extraction (e.g. `tar -xzf lgtm-buzzer-host-v0.1.0.tar.gz`), the
user sees:

```
lgtm-buzzer-host-v0.1.0/
  host/
    index.js                       Bundled host entry (executable, with shebang)
    install-manifest.js            Bundled installer (executable, with shebang)
    manifest.template.json         Native-messaging manifest template
  README.md                        Host-specific quick install (host README, not repo README)
  LICENSE                          Copy of the repo's MIT LICENSE
```

Notes:

- The **outer directory matches the tarball stem** so `tar -xzf` does
  not unpack into the user's cwd; a single extracted folder, easy to
  remove.
- **`host/` is the working root**. The installer derives the absolute
  path of `host/index.js` from its own `import.meta.url` location and
  writes that into the per-OS native-messaging manifest. The
  template's `path` field is a placeholder (`__HOST_BINARY_PATH__`) and
  the installer substitutes it at install time.
- **`README.md` and `LICENSE` are sibling to `host/`**, not inside it,
  so users find them when they `cd` into the extracted folder.
- **No `package.json` ships.** The bundle is a complete, self-contained
  ESM file plus its bundled installer. Users need Node 22+ on PATH;
  nothing else.

#### `manifest.template.json` contents

A new file at `packages/host/manifest.template.json`, copied into the
tarball's `host/` directory verbatim:

```json
{
  "name": "com.lgtm_buzzer.host",
  "description": "LGTM-Buzzer native messaging host",
  "path": "__HOST_BINARY_PATH__",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://__EXTENSION_ID__/"]
}
```

Two placeholder tokens:

- `__HOST_BINARY_PATH__` — filled by `install-manifest.js` at install
  time with the absolute path to `host/index.js`. The installer derives
  this from its own `import.meta.url` (same trick the current
  `resolveHostBinaryPath` uses; refactored to look for `index.js`
  alongside `install-manifest.js`, falling back to `cli.js` in the dev
  layout so the existing test suite still passes).
- `__EXTENSION_ID__` — filled by `install-manifest.js` from the
  `LGTM_BUZZER_EXTENSION_ID` environment variable (existing contract;
  see `packages/host/src/install-manifest.ts` L133). If unset, the
  installer prints the existing `<unset>` placeholder and exits 0 (no
  change to current behaviour).

The template is authored as a real file (not constructed in TS) so a
package maintainer can inspect what gets shipped without reading code.
The runtime path keeps using `buildManifest` for the in-memory shape;
the template file is the on-disk artifact for users who want to install
manually.

#### Version source of truth

Root `package.json` `version` is the **sole** source of truth. The
script reads it once at startup and:

1. Uses it to name the two artifacts (`v<version>` suffix).
2. Asserts that `packages/extension/wxt.config.ts`'s `manifest.version`
   resolves to the same value at extension-build time. Achieved by
   making `wxt.config.ts` read the root `package.json` and substitute
   `manifest.version` dynamically:

```ts
// packages/extension/wxt.config.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "wxt";

const rootPkgPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "package.json",
);
const rootVersion = JSON.parse(readFileSync(rootPkgPath, "utf8")).version;

export default defineConfig({
  manifest: {
    name: "LGTM-Buzzer",
    description: "Quiz yourself on the diff before approving PRs.",
    version: rootVersion,
    permissions: ["storage"],
    host_permissions: [
      "*://github.com/*",
      "*://dev.azure.com/*",
      "*://*.visualstudio.com/*",
    ],
  },
});
```

Per-workspace `package.json` `version` fields stay at `0.0.0` (they're
private, never published to npm — single-repo policy applies). The
**root** version is what binds.

**Bump-version flow** (documented in `docs/release.md`, see File layout):

1. `npm version <patch|minor|major> --no-git-tag-version` at repo root.
   This rewrites root `package.json` only (no workspace propagation
   because `--workspaces` is omitted on purpose).
2. Commit `chore(release): vX.Y.Z`.
3. `npm run release:build`.
4. `git tag vX.Y.Z` (annotated; signed if available).
5. `git push origin main --tags`.
6. Manually create a GitHub Release; attach the two `dist/` artifacts
   plus `checksums.txt`.

Auto-tag-on-CI is out of scope (issue #55 §"Out of scope" + ADR-27
§"What is NOT in v1").

#### CLI flags

```
Usage: npm run release:build -- [options]

Options:
  --force                Overwrite existing dist/ artifacts for the same version
  --allow-dirty          Skip the "uncommitted changes" gate (CI / hotfix path)
  --skip-check           Skip `npm run check`. NOT recommended; allowed for fast iteration on the packaging
                         script itself. Refuses with --allow-dirty=false and a dirty tree.
  --output-dir=<path>    Override the default `dist/` output directory (absolute path; default: `<repo>/dist`)
  --no-checksums         Do not write `dist/checksums.txt`
  --help, -h             Print this usage and exit 0
```

Default behaviour (no flags):

1. Refuse if the working tree is dirty (`git status --porcelain`
   non-empty), unless `--allow-dirty`.
2. Refuse if `dist/lgtm-buzzer-extension-v<version>.zip` or
   `dist/lgtm-buzzer-host-v<version>.tar.gz` already exists, unless
   `--force`.
3. Run `npm run check` (ADR-27's full gate). If it fails, abort.
4. Build artifacts.
5. Write `checksums.txt` unless `--no-checksums`.
6. Print a final summary table.

#### Types

The script is plain JS (`.mjs`, no transpilation). Where TS types help
(in the test file), they live in the test file or as JSDoc comments.

One protocol-level type addition: none. This work introduces no new
domain types.

The release script's internal shape (documented as JSDoc, for the
reviewer; not exported):

```js
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
 * @property {"extension" | "host"} kind
 * @property {string} path               Absolute path to the artifact.
 * @property {number} sizeBytes
 * @property {string} sha256             Hex-encoded.
 */
```

#### Functions and methods

All exported from `scripts/release.mjs` so the test file can exercise
them. The script's `main` runs only when the file is the entry point
(same `isEntryPoint` trick as `install-manifest.ts` L157):

```js
// scripts/release.mjs

/**
 * Reads the root package.json and returns the version string.
 * @param {string} repoRoot
 * @returns {string}
 * @throws if package.json is missing or has no version field (invariant violation).
 */
export const readRootVersion = (repoRoot) => /* ... */;

/**
 * Returns true when the working tree has no uncommitted changes.
 * @param {string} repoRoot
 * @returns {boolean}
 */
export const isWorkingTreeClean = (repoRoot) => /* ... */;

/**
 * Computes the two artifact paths under outputDir.
 * @param {{ version: string, outputDir: string }} input
 * @returns {{ extensionZip: string, hostTarball: string, checksums: string }}
 */
export const computeArtifactPaths = (input) => /* ... */;

/**
 * Substitutes __HOST_BINARY_PATH__ and __EXTENSION_ID__ in the manifest template.
 * Pure; tested directly without I/O.
 * @param {{ template: string, hostBinaryPath: string, extensionId: string }} input
 * @returns {string} Substituted JSON text.
 */
export const fillManifestTemplate = (input) => /* ... */;

/**
 * Lists the absolute paths that go into the host tarball, given a
 * staging directory laid out by stageHostFiles.
 * @param {string} stagingDir
 * @returns {readonly string[]}
 */
export const computeHostTarballFileList = (stagingDir) => /* ... */;

/**
 * Stages the host tarball contents under a temp dir.
 * Bundles host/index.js + host/install-manifest.js, copies
 * manifest.template.json, README.md, LICENSE. Effectful.
 * @param {{ repoRoot: string, version: string, tmpDir: string }} input
 * @returns {Promise<string>} Absolute path to the staging directory's root.
 */
export const stageHostFiles = async (input) => /* ... */;

/**
 * Bundles the host into a single ESM JS file using esbuild.
 * @param {{ entryPoint: string, outFile: string }} input
 * @returns {Promise<void>}
 */
export const bundleHost = async (input) => /* ... */;

/**
 * Runs `npm --workspace=@lgtm-buzzer/extension run zip`, then renames the
 * wxt-produced zip into the dist output path.
 * @param {{ repoRoot: string, outputZip: string }} input
 * @returns {Promise<void>}
 */
export const buildExtensionZip = async (input) => /* ... */;

/**
 * Builds the host tarball from a staging directory.
 * @param {{ stagingRoot: string, outputTarball: string }} input
 * @returns {Promise<void>}
 */
export const buildHostTarball = async (input) => /* ... */;

/**
 * Computes the SHA256 of a file as a lowercase hex string.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export const sha256File = async (filePath) => /* ... */;

/**
 * Writes `<outputDir>/checksums.txt` with one line per artifact:
 *   <sha256>  <byte_size>  <filename>
 * @param {{ outputDir: string, artifacts: readonly ReleaseArtifact[] }} input
 * @returns {Promise<void>}
 */
export const writeChecksumsFile = async (input) => /* ... */;

/**
 * Parses argv and returns a ReleaseConfig. Throws on unknown flags.
 * @param {readonly string[]} argv
 * @param {string} repoRoot
 * @returns {ReleaseConfig}
 */
export const parseArgs = (argv, repoRoot) => /* ... */;

/**
 * Entry point. Runs the full pipeline.
 * @param {ReleaseConfig} config
 * @returns {Promise<readonly ReleaseArtifact[]>}
 */
export const runRelease = async (config) => /* ... */;
```

`runRelease` is the one effectful orchestrator. The other exports are
either pure (`fillManifestTemplate`, `computeArtifactPaths`,
`computeHostTarballFileList`, `parseArgs`) or small I/O wrappers
(`isWorkingTreeClean`, `readRootVersion`, `bundleHost`, `sha256File`).
The pure helpers carry the bulk of the test surface.

This script is dev tooling, lives outside the workspace graph, and is
the only `.mjs` file in the project that gets a Vitest test file — so
the `monadyssey`-based `Either`/`IO` conventions don't apply. The
script throws on unexpected error states; the `runRelease` wrapper
catches and prints a useful message before `process.exit(1)`.

#### Install-manifest refactor

`packages/host/src/install-manifest.ts` already exports `buildManifest`
(pure) and a `main()` that does I/O. Two small additions, no public-API
break:

1. Loosen `resolveHostBinaryPath` so it picks the bundled-tarball entry
   when present:

```ts
const resolveHostBinaryPath = (): string => {
  const thisFile = fileURLToPath(import.meta.url);
  const distDir = path.dirname(thisFile);
  // Bundled tarball layout: index.js next to install-manifest.js.
  const bundled = path.join(distDir, "index.js");
  if (fs.existsSync(bundled)) return bundled;
  // Dev layout: cli.js next to install-manifest.js inside packages/host/dist/.
  return path.join(distDir, "cli.js");
};
```

2. Add a new exported pure helper that fills the on-disk template:

```ts
// pure; tested without I/O
export const renderManifestTemplate = (input: {
  template: string;
  hostBinaryPath: string;
  extensionId: string;
}): string => /* substitutes __HOST_BINARY_PATH__ and __EXTENSION_ID__ */;
```

The release script imports this helper from
`@lgtm-buzzer/host` so the substitution logic is exercised by both
runtimes (release-time and install-time) and tested once in the host
workspace.

#### File layout

New files:

```
scripts/
  release.mjs                                 New: release packaging orchestrator
  release.mjs.test.ts                         New: Vitest covering pure helpers + smoke
docs/
  release.md                                  New: maintainer-facing bump + release flow
packages/host/
  manifest.template.json                      New: shipped verbatim in the host tarball
README.md                                     Modified: add "Download a release" section
```

Modified files:

```
package.json                                  version bump 0.0.0 → 0.1.0;
                                              new scripts: release:build, release:clean;
                                              new devDep: esbuild (pinned with caret)
packages/host/src/install-manifest.ts         resolveHostBinaryPath dual-layout;
                                              exports renderManifestTemplate
packages/host/src/install-manifest.test.ts    tests renderManifestTemplate; dual-layout test for resolver
packages/host/package.json                    files[] includes manifest.template.json so it
                                              ships with the workspace
packages/extension/wxt.config.ts              reads version from root package.json
```

Tests live in:

```
scripts/release.mjs.test.ts                   pure helpers + smoke (uses tmpdir)
packages/host/src/install-manifest.test.ts    renderManifestTemplate + dual-layout resolver
```

`scripts/release.mjs.test.ts` is picked up by the root `vitest run` via
the default include pattern (`**/*.test.ts`). No vitest-config change
needed; `scripts/` is at the repo root and not excluded.

#### Sequence

**`npm run release:build`** (default flags):

1. Parse argv → `ReleaseConfig` with `force=false`, `allowDirty=false`,
   `skipCheck=false`, `writeChecksums=true`, `outputDir=<repo>/dist`.
2. `readRootVersion(repoRoot)` → e.g. `"0.1.0"`.
3. `computeArtifactPaths({ version, outputDir })` → expected output
   filenames.
4. **Pre-flight checks** (abort on first failure):
   - If `--allow-dirty` is not set and `isWorkingTreeClean(repoRoot)`
     is false → exit 1, print "uncommitted changes; pass --allow-dirty
     to override".
   - If either artifact path exists and `--force` is not set → exit 1,
     print "artifact already exists; pass --force to overwrite".
5. **Build gate**: if `--skip-check` is not set, run `npm run check`
   via `spawn("npm", ["run", "check"], { stdio: "inherit" })`. If
   exit != 0 → exit 1.
6. **Stage host files** (under `os.tmpdir()/lgtm-buzzer-release-<pid>/`):
   - Create the staging structure
     `<tmp>/lgtm-buzzer-host-v<version>/host/`.
   - `bundleHost({ entryPoint: packages/host/dist/cli.js,
     outFile: <staging>/host/index.js })`.
   - `bundleHost({ entryPoint: packages/host/dist/install-manifest.js,
     outFile: <staging>/host/install-manifest.js })`.
   - `chmod 0o755` on both bundled files.
   - Copy `packages/host/manifest.template.json` →
     `<staging>/host/manifest.template.json`.
   - Render `docs/release-host-readme.md` template (a short, host-only
     README authored alongside the script — see "README contents"
     below) → `<staging>/README.md`.
   - Copy `LICENSE` → `<staging>/LICENSE`.
7. **Build extension zip**:
   - `npm --workspace=@lgtm-buzzer/extension run zip` (this re-runs the
     wxt build with the version from the updated root `package.json`).
   - Identify the produced zip in
     `packages/extension/.output/lgtm-buzzer-<version>-chrome.zip`.
   - Move + rename to
     `dist/lgtm-buzzer-extension-v<version>.zip`.
   - If `--force` and the destination exists, `fs.rmSync` first.
8. **Build host tarball**:
   - `tar -czf dist/lgtm-buzzer-host-v<version>.tar.gz -C <tmp>
     lgtm-buzzer-host-v<version>`.
   - `-C <tmp>` means the tarball's top-level entry is the
     `lgtm-buzzer-host-v<version>/` directory, not the tmpdir.
9. **Compute checksums** (unless `--no-checksums`):
   - `sha256File(extensionZip)`, `sha256File(hostTarball)`.
   - `writeChecksumsFile({ outputDir, artifacts })`.
10. **Summary**: print a table with kind / path / size / sha256 for each
    artifact to stdout. Exit 0.
11. **Cleanup**: remove the tmp staging dir on success and on any
    failure (`process.on("exit", ...)` registered at script start).

**Install flow on the user's machine** (downstream of the maintainer's
release):

1. User downloads `lgtm-buzzer-host-v0.1.0.tar.gz` from a GitHub
   Release.
2. User extracts: `tar -xzf lgtm-buzzer-host-v0.1.0.tar.gz`.
3. User installs the Chrome extension zip via Chrome Web Store or as an
   unpacked extension, copies the extension ID.
4. User runs: `LGTM_BUZZER_EXTENSION_ID=<id> node lgtm-buzzer-host-v0.1.0/host/install-manifest.js`.
5. `install-manifest.js` resolves
   `host/index.js` next to itself, reads
   `host/manifest.template.json`, substitutes
   `__HOST_BINARY_PATH__` + `__EXTENSION_ID__`, writes to the per-OS
   path (`buildManifest` already handles macOS + Linux, prints
   "not supported" on other platforms).
6. Chrome's native-messaging machinery now reaches `node host/index.js`
   on first extension activation.

#### Error cases

| Failure | Where | Handling |
|---|---|---|
| Root `package.json` missing or no `version` field | `readRootVersion` | Throw `InvariantViolation`; script exits 1 with "missing root version". |
| Working tree dirty without `--allow-dirty` | Pre-flight | Exit 1; message names the offending files (truncated to first 5). |
| Artifact already exists without `--force` | Pre-flight | Exit 1; message lists which file(s) collide. |
| `npm run check` fails | Build gate | Inherit npm's exit code; script exits 1 with a one-line summary. |
| `esbuild` import resolution failure | `bundleHost` | Bubble up the esbuild error; exit 1 with the unresolved-module name. Likely cause: `npm run check` did not run, so `dist/` is empty — script suggests rerunning without `--skip-check`. |
| `wxt zip` output filename drift | `buildExtensionZip` | The script reads `packages/extension/.output/` and uses a glob (`lgtm-buzzer-*.zip`) to find the produced file. If 0 or > 1 matches, exit 1 with the candidate list. |
| `tar` command not on PATH | `buildHostTarball` | Exit 1 with "tar not found on PATH; install GNU tar or BSD tar". Both macOS and Linux ship `tar` in the baseline. Windows is out of scope. |
| Tmp staging dir collision (rare) | `stageHostFiles` | Uses `os.tmpdir()/lgtm-buzzer-release-<pid>-<random>/`; collision is effectively impossible. If it occurs, `fs.rmSync` first, then continue. |
| User Ctrl+C mid-build | Top-level | `process.on("SIGINT", cleanup)` removes the staging tmpdir and exits 130. |
| `LGTM_BUZZER_EXTENSION_ID` unset at install time | `install-manifest.js` (downstream) | Existing behaviour: writes manifest with `<unset>` placeholder. User re-runs once the extension ID is known. **Future-work**: a friendlier prompt is out of scope. |
| Windows platform at install time | `install-manifest.js` (downstream) | Existing behaviour: prints "not supported on this platform", exits 0. v1 limitation, documented in `docs/release.md` §Windows. |
| Reproducibility drift between runs | Out of scope | Strict reproducibility is NOT a v1 goal. Document in `docs/release.md` that two runs from the same source may produce zip files with different SHA256s due to timestamp metadata; the `checksums.txt` is run-specific. |

No `throw` paths inside long-lived monadyssey `IO` chains apply here —
this script is plain Node, run once, by a human. Throws at the top
level are caught by the entry-point wrapper and printed as `error:
<msg>` before `process.exit(1)`.

#### Test strategy

Tests live in `scripts/release.mjs.test.ts`. Coverage targets per the
project policy: tooling has no coverage gate, but the test file must
exercise:

1. **`readRootVersion`** — reads from a `tmpdir`-staged
   `package.json`; missing file throws; missing `version` throws.
2. **`computeArtifactPaths`** — given a version + outputDir, produces
   the three expected absolute paths.
3. **`fillManifestTemplate`** — given a template string with both
   placeholders, the function substitutes correctly even when the
   binary path contains a quote (`"`) or a backslash (paths must be
   JSON-escaped because the template is a JSON file). Tests cover:
   - Happy path: both placeholders substituted.
   - Path containing `"` and `\` → properly JSON-escaped.
   - Extension ID containing `/` → preserved verbatim.
   - Placeholder absent from template → throws (invariant: template is
     authored alongside the script).
4. **`computeHostTarballFileList`** — given a staging dir with the
   expected layout, returns the absolute paths in deterministic order.
5. **`parseArgs`** — known flags, default values, `--help` exits 0,
   unknown flag throws.
6. **`sha256File`** — known-content fixture (e.g.,
   `Buffer.from("hello")`) hashes to the known value.
7. **Smoke** — `runRelease({ ...config, skipCheck: true })` in a tmp
   workspace produces both artifacts; the test asserts files exist and
   are non-empty. Bundling speed makes this acceptable (~3-5 s).
   `skipCheck: true` here is the only valid use of that flag (faster
   tests).

`install-manifest.ts` additions tested in
`packages/host/src/install-manifest.test.ts`:

- **`renderManifestTemplate`** — same suite as the script's
  `fillManifestTemplate` (single source of truth — script imports the
  helper).
- **`resolveHostBinaryPath` dual-layout** — given a tmpdir with
  `install-manifest.js` and `index.js`, picks `index.js`. Given a
  tmpdir with `install-manifest.js` and `cli.js`, picks `cli.js`.

End-to-end manual smoke (documented in `docs/release.md`):

1. Run `npm run release:build` on a clean tree.
2. `tar -tzf dist/lgtm-buzzer-host-v0.1.0.tar.gz` shows the expected
   structure.
3. Extract into a scratch dir; `node lgtm-buzzer-host-v0.1.0/host/index.js`
   prints nothing (it's a native-messaging host; stdin is the only
   driver) and exits when stdin is closed.
4. With a real extension ID:
   `LGTM_BUZZER_EXTENSION_ID=<id> node lgtm-buzzer-host-v0.1.0/host/install-manifest.js`
   → writes the per-OS manifest with the bundled `host/index.js` path.
5. Load the extracted Chrome extension zip as an unpacked extension;
   click Approve on a fixture PR; confirm the quiz appears.

#### `README.md` and `docs/release.md` contents

**`README.md` top-level** gains a short "Download a release" section
linking to GitHub Releases and noting that releases ship two artifacts:
the Chrome extension zip (loadable as unpacked) and the host tarball
(extract + run the installer).

**`docs/release.md`** is the maintainer's reference:

- Bump-version flow (the 6-step sequence above).
- Required tooling: Node 22+, npm, `tar` on PATH, `git`.
- The `--force` / `--allow-dirty` / `--skip-check` flags and when each
  is appropriate.
- How to verify a release locally before tagging
  (the 5-step smoke above).
- Windows packaging limitation (v1: extension only; host requires WSL).
- Future-work: auto-release on tag (GH Actions), code signing, Windows
  registry installer, real reproducible builds.

**Tarball `README.md`** (authored as a template fed by
`stageHostFiles`):

- "What is this": one paragraph.
- Prerequisites: Node 22+ on PATH.
- Install steps for macOS:
  1. Extract.
  2. Set the `LGTM_BUZZER_EXTENSION_ID` env var.
  3. Run `node lgtm-buzzer-host-vX.Y.Z/host/install-manifest.js`.
- Install steps for Linux: same as macOS, paths differ — the installer
  picks the right one automatically.
- Token / credential note: the host receives credentials in-band from
  the extension (ADR-22). The user does NOT need to put tokens on disk
  for v1.
- Uninstall: delete `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.lgtm_buzzer.host.json`
  (macOS) or `~/.config/google-chrome/NativeMessagingHosts/com.lgtm_buzzer.host.json`
  (Linux), then `rm -rf` the extracted folder.

#### What is NOT in v1 (explicit out-of-scope)

- **Auto-release on tag push.** `release.mjs` is invoked manually by
  the maintainer. CI release is a future ADR.
- **Code signing.** The bundled JS file is not signed; macOS notarisation
  is not performed (Node is interpreted; no native binary distribution).
- **Chrome Web Store auto-submission.** Manual upload via the developer
  dashboard for v1.
- **Windows host installation.** Windows requires registry entries and
  a `.bat` or `.exe` wrapper. v1: documented limitation, users run the
  host under WSL if needed.
- **Reproducible builds.** Two runs from the same source may produce
  artifacts with different SHA256s due to zip / tar metadata
  (timestamps, file ordering). Documented in `docs/release.md`.
- **Multi-platform single-binary** (pkg / bun --compile). v1: requires
  Node 22 on PATH.
- **THIRD-PARTY-NOTICES generation.** `esbuild`'s `legalComments:
  "inline"` preserves bundled-dep license comments in the output. A
  separate NOTICE file is future-work.
- **Cross-version compatibility matrix.** v1 assumes extension version
  X.Y.Z exclusively pairs with host version X.Y.Z. Protocol version
  negotiation (ADR-7) prevents catastrophic mismatch; release-pair
  drift is not formally supported.
- **`npm pack` of any workspace.** All workspaces are `private: true`
  per CLAUDE.md; we do not publish to npm.
- **Auto-update channel.** Users re-download to update.

### Consequences

- **Two-command release**: `npm version <bump> --no-git-tag-version` then
  `npm run release:build` produces a complete artifact pair under
  `dist/`. The maintainer creates the GitHub Release manually.
- **Single source of truth for version**: root `package.json` `version`
  binds both artifacts. The extension's MV3 manifest pulls the same
  value at build time via `wxt.config.ts`, so a release pair cannot
  drift.
- **No `npm install` step at user install time.** The host tarball is
  self-contained; users need only Node 22+ on PATH. This is the
  highest-friction-reduction in the M3 install path.
- **One new devDep**: `esbuild`, pinned with caret. Already a
  transitive dep through wxt, so no new install surface. Future
  bundler bumps go through the same caret-range mechanism as other
  devDeps.
- **The script is small and reviewable.** Pure helpers carry the bulk
  of the logic; effectful glue (spawn npm, esbuild build, tar) is
  exercised by the smoke test. No `monadyssey` in this file — it is
  dev tooling, not a runtime adapter.
- **`install-manifest.ts` becomes dual-layout aware.** The same module
  works in the dev tree (`dist/cli.js`) and in the bundled tarball
  (`host/index.js`). The test suite covers both paths.
- **Reversibility**: `dist/` is git-ignored; deleting the script is one
  PR. The `wxt.config.ts` change is the only edit with a runtime
  effect (it changes the MV3 manifest's version field at build time);
  reverting it pins the version back to `"0.0.0"` literal.
- **Security posture**: the bundle is plain JS; we ship no binary blob,
  no `node_modules`, no signed installer. License compliance is handled
  via `legalComments: "inline"`. Users who don't trust the GH Release
  hash can rebuild from source — `npm run release:build` is
  deterministic enough for "same source, similar output" verification
  even without strict reproducibility.
- **Future-proofing**: the script's pure helpers (`fillManifestTemplate`,
  `computeArtifactPaths`, `computeHostTarballFileList`) are decoupled
  from the I/O glue. A future CI release workflow can import them
  directly; an auto-tag-on-push action wraps `runRelease` with no other
  changes.
- **Binding for the reviewer (PR #55 implementation)**:
  (a) Exactly one new repo-root script (`scripts/release.mjs`); no
      per-workspace release scripts.
  (b) Bundled host entry is `<staging>/host/index.js`, NOT renamed to
      `lgtm-buzzer-host` or similar — the tarball README points users
      at this exact path.
  (c) `install-manifest.js` ships bundled, with shebang, and is
      executable (`chmod 0o755`).
  (d) `manifest.template.json` ships verbatim from
      `packages/host/manifest.template.json`; no in-script generation.
  (e) Tarball top-level dir name matches the tarball stem
      (`lgtm-buzzer-host-v<version>/`), not the host workspace name.
  (f) `dist/checksums.txt` format is `<sha256>  <size_bytes>  <filename>`,
      two-space separator, lowercase hex. One line per artifact, sorted
      by filename for stable diffs.
  (g) `wxt.config.ts` reads the root version dynamically; no other
      package.json fields propagate.
  (h) Workspace-level `version` fields stay at `0.0.0`. Only root
      bumps.
  (i) The script's `--skip-check` flag is documented but discouraged;
      `docs/release.md` calls it out as a release-blocker if used in
      a real release.
  (j) `scripts/release.mjs.test.ts` runs under the root `vitest run`;
      no per-workspace test config change needed.

---

## ADR-29 (2026-05-24): Host-resolved credentials + check-auth wire frame (supersedes ADR-22 §credentials)
**Date**: 2026-05-24
**Issue**: #112
**Status**: Accepted

### Context

ADR-22 (#49) made `quiz-request` carry an opaque `credentials` bag, validated
host-side by per-adapter `.strict()` zod schemas. ADR-23 (#50) shipped the
options page that persists per-adapter credentials in `chrome.storage.local`
and the SW that inlines them on every quiz-request. Real-Chrome testing
turned up two problems that together make the M3 surface unusable end-to-end:

1. **Strict-bag mismatch (release-blocking bug).** The SW projection in
   `packages/extension/src/lib/options/storage-reader.ts` (~L52-L63) merges
   the chosen LLM adapter's credential bag with the chosen VCS adapter's
   credential bag into one flat `CredentialsBag`. The host's
   `packages/host/src/registry.ts` then calls
   `LLMCredsSchema.strict().safeParse(bag)` AND
   `VCSCredsSchema.strict().safeParse(bag)` with the SAME merged bag. Any
   field the other adapter contributed is "unexpected" to this adapter, so
   every cross-category pair returns
   `bad-credentials: invalid or unexpected fields: <root>`. The
   `claude-cli + github` happy path requires a `pat` to satisfy `github` but
   that same `pat` makes `claude-cli`'s `z.object({}).strict()` fail.
   Effectively no adapter pair works end-to-end today.

2. **Wrong abstraction (UX + security).** The host runs locally under the
   user's account through native messaging. Engineers using this tool
   already have `gh auth login`, `az login`, and/or `ANTHROPIC_API_KEY`
   set up in their shell environment. Duplicating those secrets into
   `chrome.storage.local` as plaintext is friction (re-enter every PAT,
   manage rotation manually) PLUS a documented v1 security caveat
   (ADR-23 §Credential storage posture). The host is the right layer to
   answer "what credentials does this adapter need" because the host
   already has access to the user's env and CLIs. The extension's job is
   to tell the user whether resolution is currently working — not to be a
   second secrets store.

The user has reviewed and signed off on the redesign. Two M3 follow-ups
(SSO-protected tokens, multi-account selection, keychain integration) are
explicitly deferred and listed below.

Five forces shape the redesign:

- **Diff-only invariant preserved.** Credentials are not diff-derived;
  they were never on the prompt path. Removing them from the wire
  reduces the credential blast radius without touching the gate.
- **Host owns identity, extension owns preferences.** The host already
  has the privileged context (env, gh/az CLIs, future keychain). The
  extension stays the source of truth for "which adapter to use", which
  remains a user preference. This split keeps the wire small and the
  permission surface narrow.
- **No caching of resolution results.** A user who just ran
  `gh auth login` must see a fresh `ok: true` on the next refresh-click
  without restarting the host. The resolver runs on every
  `check-auth-request` and every `quiz-request`.
- **Subprocess invocations are bounded.** `gh auth token` and
  `az account get-access-token` are external CLIs; they go through
  `spawnIO` with a 5-second timeout. Output is treated as opaque token
  bytes — never logged, never echoed.
- **Backwards compatibility is cheap to skip.** Project has no real
  deployment; M3 has not shipped. ADR-22's `credentials` field is
  removed from `QuizRequestPayloadSchema` outright, not deprecated.
  Same for `vcsAdapterId` in stored options (auto-picked from `pr.kind`).

### Decision

A new **host-side `CredentialResolver`** owns per-adapter credential
resolution. The wire-format `credentials` field on `quiz-request` is
removed. A new `check-auth-request` / `check-auth-response` frame pair
lets the options page surface live auth status per adapter. The
extension drops the credential map AND the VCS adapter selector; the SW
infers `vcsAdapterId` from the `pr.kind` on every quiz-request.

#### Affected workspaces

- `packages/protocol/` — remove `credentials` from
  `QuizRequestPayloadSchema`; add `check-auth-request` /
  `check-auth-response` frames; keep `CredentialsBagSchema` exported but
  unused on the wire (kept for type-safety in the resolver's internal
  parse results). Two new `FrameKind` variants join `FrameSchema`.
- `packages/host/` — new `CredentialResolver` port (in `host`, not
  `core` — see below); new resolver implementation per adapter; updated
  `registry.ts` whose factories no longer take wire creds; updated
  `dispatcher.ts` that handles `check-auth-request` and stops threading
  `credentials` through `quiz-request`.
- `packages/extension/` — remove credential inputs from the options page;
  add an auth-status panel that polls `check-auth-request` on load and
  on refresh; drop the VCS dropdown; storage shape shrinks to
  `{ schemaVersion, llmAdapterId }`; SW infers `vcsAdapterId` from
  `pr.kind` and no longer reads credentials from storage.
- `packages/core/` — **no changes.** The resolver is a host-only
  concern. `LLMProvider` / `VCSProvider` ports stay as-is — they have
  always taken their credentials inside their `config`, not at call
  time.
- `packages/adapters/*` — **no changes.** Adapter factories already
  accept `{ config: { token | apiKey, ... } }` per provider; the
  registry passes the resolved value in instead of the wire bag.

**Dependency arrows reaffirmed**:

```
protocol  ← core  ← adapters  ← host
protocol  ← core  ← extension
```

The `CredentialResolver` lives in `host`, not in `core`, because it is
inherently a host-only concern (it reads `process.env`, spawns external
CLIs, may later integrate with OS keychain). Placing it in `core` would
break the no-Node-no-IO purity rule. Adapters do not depend on the
resolver — they continue to take their resolved secret as part of their
`config`, exactly as ADR-15/ADR-20 specified.

#### Why the resolver is not a `core` port

ADR-22 routed credentials as plain data through the registry; the
adapter factories consumed them at construction time. The resolver
keeps that shape: the registry asks the resolver for "the resolved
secret for adapter X", then constructs the adapter using
`{ config: { token: <resolved> } }`. The resolver itself never crosses
the host boundary. No `core` change is justified because:

1. The resolver is intrinsically effectful (env reads, subprocess
   spawning, future keychain access) — exactly what `core` forbids.
2. Adapters do not need to know how their secret was obtained; the
   construction-time shape from ADR-15 / ADR-20 / ADR-21 is unchanged.
3. The contract the registry needs ("give me the secret for adapter X
   or tell me why you cannot") is a host-internal contract, not a
   domain port.

If a future story moves credential resolution into the extension (e.g.,
WebAuthn-mediated unlock), that ADR introduces a `CredentialSource`
port in `core`. Not today.

#### Wire-shape choices (binding)

| Choice | Decision |
|---|---|
| `quiz-request.payload.credentials` | **Removed**. Schema rejects unknown fields where it can; otherwise the host silently drops the value if a stale extension sends it. |
| `quiz-request.payload.vcsAdapterId` | **Kept optional**. The SW now infers it from `pr.kind`; the host's existing default (`"github"`) still applies as a belt-and-suspenders. |
| `quiz-request.payload.llmAdapterId` | **Kept optional**. The options page sets it; absent → host default `"claude-cli"`. |
| New `check-auth-request` frame | `{ kind: "check-auth-request", payload: {} }` — empty payload, strict zod. |
| New `check-auth-response` frame | `{ kind: "check-auth-response", payload: { statuses: AuthStatus[] } }`. |
| `AuthStatus` shape | `{ adapterId: string; ok: boolean; detail?: string; hint?: string }`. Strings only. NO secret bytes, NO field paths into env. |
| Resolution timing | Fresh on every `check-auth-request` AND every `quiz-request`. No caching anywhere. |
| Envelope version | **Stays `v: 1`**. Removing one optional field + adding two additive frame kinds is non-breaking on a pre-release codebase. |
| Stored options shape | `{ schemaVersion: 2, llmAdapterId?: string }`. `vcsAdapterId` and `credentials` dropped. Reader strips unknown fields silently via zod's default behaviour. |
| Storage envelope version | **Bumped to `2`** (different `STORAGE_KEY`: `"lgtm_buzzer.options.v2"`). Migration is "drop the v1 key on first read; v1 stored credentials are now meaningless and not worth migrating". |

#### Per-adapter resolver chain (binding)

| Adapter | Resolution order | Final-miss error |
|---|---|---|
| `github` (VCS) | 1. `env.GITHUB_TOKEN` → 2. `env.GH_TOKEN` → 3. `spawnIO("gh", ["auth", "token"], …)` exit-0 stdout | `MissingCredential { adapterId: "github", attempted: ["GITHUB_TOKEN env", "GH_TOKEN env", "gh auth token CLI"], hint: "Run \`gh auth login\` or export GITHUB_TOKEN" }` |
| `ado` (VCS) | 1. `env.AZURE_DEVOPS_EXT_PAT` → 2. `spawnIO("az", ["account", "get-access-token", "--resource", "499b84ac-1321-427f-aa17-267ca6975798", "--query", "accessToken", "-o", "tsv"], …)` exit-0 stdout (resource GUID is Azure DevOps' well-known scope) | `MissingCredential { adapterId: "ado", attempted: ["AZURE_DEVOPS_EXT_PAT env", "az CLI access token"], hint: "Run \`az login\` or export AZURE_DEVOPS_EXT_PAT" }` |
| `claude-api` (LLM) | 1. `env.ANTHROPIC_API_KEY` | `MissingCredential { adapterId: "claude-api", attempted: ["ANTHROPIC_API_KEY env"], hint: "Export ANTHROPIC_API_KEY" }` |
| `claude-cli`, `codex-cli`, `copilot-cli` (LLM) | No-op — these CLIs manage their own auth via the user's prior `claude auth` / `codex login` / `gh auth login`. The resolver returns `Right<undefined>` (no secret to pass). | n/a — `ok: true` with `detail: "uses CLI's own login"`. |

**Trimming policy**: subprocess stdout is `.trim()`-ed and used as the
opaque secret. If trimmed length is zero, treat as a miss and continue
the chain. Empty env vars are also treated as misses.

**Subprocess timeout**: 5 seconds wall-clock per `spawnIO` invocation.
Implemented as `spawnIO` cancellation (existing `Schedule` /
`IO.cancellable` machinery from ADR-9). Timeout maps to a miss + the
next chain step.

**Subprocess exit codes**: any non-zero exit is treated as a miss and
the chain continues. `gh auth token` exits 1 when logged out; `az`
exits non-zero on error. The chain's error is built from the final
miss, not from the underlying `SpawnError`.

#### Types

##### `packages/host/src/credentials/resolver.ts` (new)

```ts
import type { IO } from "monadyssey";

/**
 * Discriminated error for failed credential resolution.
 *
 * `attempted` lists the human-readable names of every chain step tried,
 * in order. `hint` is a single remediation string suitable for surfacing
 * to the user. Neither field carries env-var VALUES or token bytes —
 * only well-known step labels.
 */
export type ResolverError = {
  readonly kind: "missing-credential";
  readonly adapterId: string;
  readonly attempted: ReadonlyArray<string>;
  readonly hint: string;
};

/**
 * Outcome of a successful resolution.
 *
 * `secret` is the resolved token / API key, or `undefined` for adapters
 * whose auth lives outside the resolver (CLI-managed login).
 * `detail` is a short human-readable step label ("via GITHUB_TOKEN env",
 * "via gh CLI", "uses CLI's own login"). NEVER includes the secret bytes.
 */
export type ResolvedCredential = {
  readonly secret: string | undefined;
  readonly detail: string;
};

/**
 * Port: resolves a credential for an adapter from the host's environment.
 *
 * Implementation lives in `packages/host/src/credentials/`. The resolver
 * is constructed once at host startup and injected into the registry.
 *
 * Resolution is IO-bearing (env reads are pure but subprocess spawning
 * is not). No caching across calls — every call re-runs the chain.
 */
export type CredentialResolver = {
  /**
   * Resolve the credential for `adapterId`. Returns `Right<{ secret, detail }>`
   * on a hit, `Left<ResolverError>` on a miss. NEVER throws — every failure
   * lands in the IO error channel.
   */
  readonly resolve: (adapterId: string) => IO<ResolverError, ResolvedCredential>;
};
```

##### `packages/host/src/credentials/types.ts` (new)

```ts
/** Dependencies needed by the default resolver chain. */
export type ResolverDeps = {
  /** Env source — defaults to `process.env` in production; tests pass a fake. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Subprocess primitive (already wraps cancellation + 5s grace). */
  readonly spawnIO: typeof import("@lgtm-buzzer/adapter-shared").spawnIO;
  /** Per-subprocess timeout in ms. Default 5000. */
  readonly subprocessTimeoutMs?: number;
};
```

##### `packages/host/src/registry.ts` (modified)

```ts
// Adapter factories no longer take CredentialsBag.
// They now invoke the resolver and pass the resolved secret to the
// per-adapter factory function.

export type RegistryError =
  | { readonly kind: "unsupported-llm-adapter"; readonly id: string }
  | { readonly kind: "unsupported-vcs-adapter"; readonly id: string }
  | { readonly kind: "missing-credentials";     readonly adapterId: string;
                                                readonly attempted: ReadonlyArray<string>;
                                                readonly hint: string; };

// "bad-credentials" is REMOVED — it described "wire payload failed
// per-adapter zod". With no wire payload, there is no validation to fail.

export type LLMAdapterFactory = () => IO<RegistryError, LLMProvider>;
export type VCSAdapterFactory = () => IO<RegistryError, VCSProvider>;

export type AdapterRegistry = {
  readonly listLlm: () => readonly string[];
  readonly listVcs: () => readonly string[];
  readonly buildLlm: (id: string) => IO<RegistryError, LLMProvider>;
  readonly buildVcs: (id: string) => IO<RegistryError, VCSProvider>;
};

export type AdapterRegistryDeps = {
  readonly spawnIO: typeof SpawnIOFn;
  readonly resolver: CredentialResolver;
};

export const createDefaultAdapterRegistry: (deps: AdapterRegistryDeps) => AdapterRegistry;
```

Notes:

- `buildLlm` / `buildVcs` now return `IO`, not `Either`, because
  resolution is IO-bearing (env is fine but subprocess is not).
- `validateCreds` and the per-adapter `.strict()` schemas are
  **deleted**. The wire bag no longer exists; the resolver returns a
  single typed secret per adapter.
- The dispatcher must `.foldM` the registry result into the existing
  per-request fiber. The fiber-cancellation behaviour from ADR-16 is
  unchanged.

##### `packages/protocol/src/messages/quiz-request.ts` (modified)

```ts
export const QuizRequestPayloadSchema = z.object({
  pr: PRIdentifierSchema,
  questionCount: z.number().int().min(1).max(10),
  llmAdapterId: z.string().min(1).optional(),
  vcsAdapterId: z.string().min(1).optional(),
  // REMOVED: credentials field
});
```

The schema does NOT add `.strict()` here — keeping it `.passthrough()`
default means a stale extension that still sends `credentials` does not
crash the host's framing reader. The host's quiz-request handler simply
never reads `payload.credentials`. The reviewer must assert this is the
case via a unit test (see Test strategy).

##### `packages/protocol/src/messages/check-auth-request.ts` (new)

```ts
import { z } from "zod";
import { EnvelopeBase } from "../base.js";

export const CheckAuthRequestPayloadSchema = z.object({}).strict();
export type CheckAuthRequestPayload = z.infer<typeof CheckAuthRequestPayloadSchema>;

export const CheckAuthRequestFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("check-auth-request"),
  payload: CheckAuthRequestPayloadSchema,
});
export type CheckAuthRequestFrame = z.infer<typeof CheckAuthRequestFrameSchema>;
```

##### `packages/protocol/src/messages/check-auth-response.ts` (new)

```ts
import { z } from "zod";
import { EnvelopeBase } from "../base.js";

/**
 * Per-adapter authentication status.
 *
 * SECURITY (binding): `detail` and `hint` MUST contain only human-readable
 * step labels and remediation copy — never secret bytes, never env-var
 * VALUES. Acceptable: "via GITHUB_TOKEN env", "Run `gh auth login`".
 * Forbidden: "GITHUB_TOKEN=ghp_xxx", any prefix/suffix of a token.
 */
export const AuthStatusSchema = z.object({
  adapterId: z.string().min(1),
  ok: z.boolean(),
  detail: z.string().min(1).optional(),
  hint: z.string().min(1).optional(),
});
export type AuthStatus = z.infer<typeof AuthStatusSchema>;

export const CheckAuthResponsePayloadSchema = z.object({
  statuses: z.array(AuthStatusSchema),
});
export type CheckAuthResponsePayload = z.infer<typeof CheckAuthResponsePayloadSchema>;

export const CheckAuthResponseFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("check-auth-response"),
  payload: CheckAuthResponsePayloadSchema,
});
export type CheckAuthResponseFrame = z.infer<typeof CheckAuthResponseFrameSchema>;
```

##### `packages/extension/src/lib/options/schema.ts` (modified)

```ts
export const STORAGE_KEY = "lgtm_buzzer.options.v2" as const;
export const SCHEMA_VERSION = 2 as const;

export const StoredOptionsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  llmAdapterId: z.string().min(1).optional(),
  // REMOVED: vcsAdapterId, credentials
});
export type StoredOptions = z.infer<typeof StoredOptionsSchema>;

export const DEFAULT_OPTIONS: StoredOptions = {
  schemaVersion: SCHEMA_VERSION,
};
```

##### `packages/extension/src/lib/options/storage-reader.ts` (modified)

```ts
export type SwOptionsProjection = {
  readonly llmAdapterId: string | undefined;
  // REMOVED: vcsAdapterId (auto-picked from pr.kind), credentials.
};

export const readSwOptions = (deps: {
  readonly store: OptionsStore;
}): (() => Promise<SwOptionsProjection>);
```

##### `packages/extension/src/lib/options/auth-status.ts` (new)

```ts
import type { Either } from "monadyssey";
import type { Frame, AuthStatus } from "@lgtm-buzzer/protocol";

export type CheckAuthError =
  | { readonly kind: "host-not-installed" }
  | { readonly kind: "host-error"; readonly reason: string; readonly message: string }
  | { readonly kind: "internal";   readonly message: string };

export type CheckAuth = () => Promise<Either<CheckAuthError, ReadonlyArray<AuthStatus>>>;

export const createCheckAuth = (deps: {
  readonly sendFrame: (frame: Frame) => Promise<Frame>;
  readonly newCorrelationId: () => string;
}): CheckAuth;
```

#### Functions and methods

##### `packages/host/src/credentials/resolver.ts`

```ts
/**
 * Builds the default per-adapter resolver. Chains env → CLI fallback as
 * documented in §Per-adapter resolver chain.
 *
 * @param deps - env source + spawnIO + optional timeout override.
 * @returns A CredentialResolver covering all six adapter IDs.
 */
export const createDefaultCredentialResolver = (deps: ResolverDeps): CredentialResolver;
```

Internal helpers (not exported):

```ts
/** Try env vars in order; return the first non-empty trimmed value. */
const tryEnv = (
  env: Readonly<Record<string, string | undefined>>,
  keys: ReadonlyArray<string>,
): { hit: string; via: string } | undefined;

/** Run `gh auth token` (or `az`...) via spawnIO with bounded timeout. */
const tryCli = (
  spawnIO: typeof SpawnIOFn,
  bin: string,
  args: ReadonlyArray<string>,
  timeoutMs: number,
): IO<undefined, { hit: string; via: string }>;
// Returns Right<{hit,via}> on hit, Err<undefined> on miss (caller treats
// undefined as "try next chain step"). Crucially, we DO NOT surface
// SpawnError detail (binary not found, exit non-zero, timeout) to the
// user beyond "via X failed" — keeps the resolver opaque.
```

##### `packages/host/src/dispatcher.ts` (modified)

The `quiz-request` handler stops threading `credentials`:

```ts
const handleQuizRequest = (
  pr: PRIdentifier,
  questionCount: number,
  llmAdapterId: string,
  vcsAdapterId: string,
  correlationId: string | null,
  deps: DispatcherDeps,
): IO<never, void>;
// (credentials parameter REMOVED)
```

The new check-auth handler:

```ts
/**
 * Handle a `check-auth-request` frame.
 *
 * Iterates every adapter in the registry, calls `resolver.resolve` on each,
 * collects an AuthStatus per adapter, writes a check-auth-response frame.
 *
 * Resolution failures are NOT propagated to the IO error channel — they
 * are individual `ok: false` rows in the response. The outer IO is
 * `IO<never, void>`.
 */
const handleCheckAuthRequest = (
  correlationId: string | null,
  deps: DispatcherDeps,
): IO<never, void>;
```

The registry-error mapping in the dispatcher loses the `bad-credentials`
arm and the `missing-credentials` arm grows to surface the `attempted`
and `hint` fields:

```ts
case "missing-credentials":
  return buildErrorFrame(
    "missing-credentials",
    `Adapter ${err.adapterId} could not resolve credentials`,
    correlationId,
    { adapterId: err.adapterId, attempted: err.attempted, hint: err.hint },
  );
// (bad-credentials case DELETED)
```

The wire `ErrorReason` enum loses `"bad-credentials"`. This is the only
wire-format removal in this ADR; documented in §Backward compatibility.

##### `packages/extension/src/lib/router.ts` (modified)

```ts
export type RouterDeps = {
  readonly portClient: PortClient;
  readonly readSwOptions: () => Promise<SwOptionsProjection>;
  readonly openOptionsPage?: () => void;
  readonly logger?: RouterLogger;
};
```

In the merge for `quiz-request`:

```ts
// Auto-pick VCS adapter from the PR kind (ADR-29).
const pr = (originalPayload.pr as { kind?: string } | undefined);
const vcsFromPrKind: "github" | "ado" | undefined =
  pr?.kind === "github" ? "github" : pr?.kind === "ado" ? "ado" : undefined;

const mergedPayload = {
  ...originalPayload,
  llmAdapterId: projection.llmAdapterId ?? originalPayload.llmAdapterId,
  vcsAdapterId: vcsFromPrKind ?? originalPayload.vcsAdapterId,
  // credentials removed entirely
};
// If the originalPayload contained a stale `credentials` field, drop it.
delete (mergedPayload as Record<string, unknown>).credentials;
```

##### `packages/extension/src/lib/options/auth-status.ts`

```ts
export const createCheckAuth = (deps: {
  readonly sendFrame: (frame: Frame) => Promise<Frame>;
  readonly newCorrelationId: () => string;
}): CheckAuth;
```

#### File layout

**New (protocol)**:

- `packages/protocol/src/messages/check-auth-request.ts` + `.test.ts`
- `packages/protocol/src/messages/check-auth-response.ts` + `.test.ts`

**New (host)**:

- `packages/host/src/credentials/resolver.ts` + `.test.ts`
- `packages/host/src/credentials/types.ts`
- `packages/host/src/credentials/index.ts` — barrel.

**New (extension)**:

- `packages/extension/src/lib/options/auth-status.ts` + `.test.ts`

**Modified (protocol)**:

- `packages/protocol/src/messages/quiz-request.ts` — remove
  `credentials` field. Update tsdoc.
- `packages/protocol/src/messages/quiz-request.test.ts` — drop the
  `credentials`-shaped cases; add one case that asserts a stale request
  with a `credentials` field still parses (passthrough is fine; host
  ignores it).
- `packages/protocol/src/messages/credentials.ts` — keep the file (still
  used internally by adapter factories' typings); tsdoc updated to say
  "no longer carried on the wire as of ADR-29 — kept for adapter-side
  types".
- `packages/protocol/src/messages/error.ts` — remove
  `"bad-credentials"` from `ErrorReasonSchema`. Update tsdoc.
- `packages/protocol/src/messages/error.test.ts` — drop the
  `bad-credentials` round-trip case.
- `packages/protocol/src/envelope.ts` — register the two new frame
  schemas in `FrameSchema`.
- `packages/protocol/src/envelope.test.ts` — extend coverage for the
  new kinds.
- `packages/protocol/src/index.ts` — export the new frames + AuthStatus.

**Modified (host)**:

- `packages/host/src/registry.ts` — factories take no creds; consult
  `resolver`; return `IO<RegistryError, …>`. Remove per-adapter
  zod schemas and `validateCreds`. Remove `"bad-credentials"` variant
  from `RegistryError`.
- `packages/host/src/registry.test.ts` — rewrite. New cases listed in
  §Test strategy.
- `packages/host/src/dispatcher.ts` — drop the `credentials` parameter
  from `handleQuizRequest`; add `handleCheckAuthRequest`; remove
  `bad-credentials` arm from `buildRegistryErrorFrame`. Wire the
  registry's new `IO`-returning `buildLlm` / `buildVcs` into the
  per-request fiber.
- `packages/host/src/dispatcher.test.ts` — drop the `bad-credentials`
  cases; add cases for `check-auth-request`; add cases for resolver
  miss surfaced as `missing-credentials`.
- `packages/host/src/cli.ts` — construct
  `createDefaultCredentialResolver({ env: process.env, spawnIO })`,
  pass to `createDefaultAdapterRegistry({ spawnIO, resolver })`. Remove
  `LGTM_BUZZER_*` cred env vars from the docblock (already removed in
  ADR-22; this just re-confirms).
- `packages/host/src/logger.ts` — confirm `REDACT_PATHS` covers
  `*.token`, `*.apiKey`, `*.pat`, `*.secret` (all already present from
  ADR-22). No change needed beyond verifying coverage via the test
  added in §Test strategy.
- `packages/host/src/logger.test.ts` — add canary asserting that a log
  entry with `{ resolved: { secret: "SECRET_xxx", detail: "via …" } }`
  redacts `secret` and leaves `detail` visible. (`secret` is added to
  `REDACT_PATHS` in this ADR.)

**Modified (extension)**:

- `packages/extension/src/lib/options/schema.ts` — bump
  `STORAGE_KEY` to `v2`, bump `SCHEMA_VERSION` to `2`, drop
  `vcsAdapterId` and `credentials` from `StoredOptionsSchema`.
- `packages/extension/src/lib/options/schema.test.ts` — update cases
  for new shape; add a case that the new schema rejects a v1-shaped
  payload (`schemaVersion: 1`) as corrupt (which it is — wrong
  version literal).
- `packages/extension/src/lib/options/storage.ts` — no change beyond
  re-export of the new `STORAGE_KEY`; the typed key already flows from
  the schema.
- `packages/extension/src/lib/options/storage.test.ts` — update fixtures
  to `v2`; add a case that an existing v1 key in storage is treated as
  `absent` (key mismatch), not `corrupt`.
- `packages/extension/src/lib/options/storage-reader.ts` — drop the
  credential merge logic; project only `llmAdapterId`.
- `packages/extension/src/lib/options/storage-reader.test.ts` — rewrite
  cases for the slim projection.
- `packages/extension/src/lib/options/dom.ts` — drop the VCS dropdown
  and the LLM credential inputs. Add the auth-status panel
  (one row per adapter, refresh button). Keep "Test connection".
- `packages/extension/src/lib/options/dom.test.ts` — rewrite per
  §Test strategy.
- `packages/extension/src/lib/options/probe.ts` — drop `vcsAdapterId`
  and `credentials` from the probe input. Probe still sends `ping`.
- `packages/extension/src/lib/options/probe.test.ts` — drop the
  credential-shaped cases.
- `packages/extension/src/lib/options/adapter-creds.ts` — **DELETE**
  (no more credential inputs in the options page).
- `packages/extension/src/lib/options/adapter-creds.test.ts` — DELETE.
- `packages/extension/src/lib/options/index.ts` — drop barrel re-exports
  for the deleted file; add re-exports for `auth-status.ts`.
- `packages/extension/src/lib/router.ts` — drop credential merge; add
  the `pr.kind`-based `vcsAdapterId` inference; delete any stale
  `credentials` field defensively.
- `packages/extension/src/lib/router.test.ts` — drop the credential
  cases; add cases for VCS auto-pick by `pr.kind`.
- `packages/extension/entrypoints/options/main.ts` — wire
  `createCheckAuth`; drop credential plumbing.
- `packages/extension/entrypoints/background.ts` — no change to the
  router dep set beyond the existing `readSwOptions` (the projection
  type narrowed, but the function shape is the same).
- `packages/extension/README.md` — update the "Options page" section:
  remove the plaintext-storage caveat, add the auth-resolution
  description, add a "Known gotchas" subsection for SSO-protected
  tokens (link to the deferred issue).

**Unchanged**:

- `packages/core/**`
- `packages/adapters/**` — adapter `config` shapes remain
  `{ token: string }` / `{ apiKey: string }`. The registry constructs
  them from resolver output, not wire bag.

#### Sequence

##### A. Options page first load + refresh

1. User opens the options page. `main.ts` constructs the SW bridge,
   `listAdapters`, `probe`, AND `checkAuth`.
2. `view.mount()` runs `listAdapters()` (unchanged) and `checkAuth()`
   in parallel.
3. SW receives `check-auth-request`; forwards via the existing port
   client.
4. Host dispatcher routes to `handleCheckAuthRequest`. The handler:
   - Calls `registry.listLlm()` ∪ `registry.listVcs()`.
   - For each adapter ID, calls `resolver.resolve(id).unsafeRun()` (
     forked into parallel fibers — see Error cases for the joining
     rule).
   - Builds an `AuthStatus[]` row per adapter.
   - Writes a `check-auth-response` frame.
5. SW relays the response back to the options page.
6. The options page renders one row per adapter: ✓ + `detail` on
   `ok: true`; ✗ + `hint` on `ok: false`. Refresh button re-runs the
   round-trip with no debounce (it is a deliberate user action).

##### B. Quiz request (host-resolved creds)

1. CS detects Approve click → builds `quiz-request` with `pr` +
   `questionCount` (no adapter fields).
2. CS sends to SW. SW infers `vcsAdapterId` from `pr.kind` and reads
   `llmAdapterId` from storage projection. NO credentials read.
3. SW forwards `quiz-request` to host.
4. Host dispatcher calls `registry.buildVcs(vcsAdapterId)` →
   `IO<RegistryError, VCSProvider>`. The registry internally calls
   `resolver.resolve("github")` (or `"ado"`), then constructs the
   adapter with `{ config: { token: <resolved> } }`.
5. Same for `registry.buildLlm(llmAdapterId)`.
6. On `Err<missing-credentials>` from either: write
   `ErrorFrame { reason: "missing-credentials", details: { adapterId,
   attempted, hint } }`. Diff is NOT fetched.
7. On `Ok`: existing quiz pipeline (ADR-16). Diff fetched, quiz
   generated, response written.

**Diff-flow audit**: resolved secrets are read from env or CLI by the
resolver and handed to the adapter factory inside the registry. They
never appear in the wire frame, never reach the prompt construction,
never enter the logger (REDACT_PATHS covers `*.secret`, `*.token`,
`*.apiKey`, `*.pat`). The diff-only invariant is unchanged.

##### C. Stale extension sending a `credentials` field

A user with an old extension build will send `quiz-request` with a
`credentials` field still attached. The host:

1. Framing reader parses; the field is ignored by the updated
   `QuizRequestPayloadSchema` (passthrough — zod retains it but the
   handler never reads it).
2. The dispatcher constructs adapters via the resolver.
3. The resolver may succeed or fail depending on the user's host env;
   the stale extension-side credential is irrelevant.

This is acceptable because the wire fields were optional and no
"production" deploys exist. Reviewer-enforced via the unit test that
mocks a stale-shape payload.

#### Error cases

| Trigger | Wire frame / UX |
|---|---|
| `check-auth-request` arrives | Host returns `check-auth-response` with one row per adapter. Resolution failures per adapter become rows with `ok: false` + `hint`; they do NOT fail the whole frame. |
| One adapter's resolver hangs > 5 s | `spawnIO` cancellation kicks in; the resolver step returns a miss; chain continues; final result is a miss for that adapter; row is `ok: false`. Other adapters proceed. |
| `quiz-request` with `vcsAdapterId: "github"` + `gh auth token` returns empty | Host: `missing-credentials` error frame; modal renders existing missing-credentials copy + `hint` ("Run `gh auth login` or export `GITHUB_TOKEN`"). |
| Stale extension sends `credentials: { pat: "x" }` | Field is parsed but ignored by the handler; resolver runs as if nothing was sent. No error. |
| Options page receives `check-auth-response` with mixed `ok` values | Renders ✓ / ✗ rows; does not block save; LLM dropdown stays usable for the adapters that resolved. |
| Host not installed | `check-auth-request` returns synthetic `ErrorFrame { reason: "internal", message: "...connect failed..." }`; auth-status panel renders the existing "Native host not installed" banner. |
| `pr.kind` is unknown (future VCS) | Router falls back to whatever `originalPayload.vcsAdapterId` is (probably undefined → host default `"github"`). Acceptable for v1; future ADR adds new VCS kinds. |

All expected failures travel as `Either` / `IO` errors. No new `throw`
paths.

#### Backwards compatibility

- **Wire-format removal**: `quiz-request.payload.credentials` removed
  AND `error.payload.reason` loses `"bad-credentials"`. Both are
  technically breaking, but the project has no shipped users (no Chrome
  Web Store entry, no release tag, M3 hasn't shipped). The risk of an
  in-flight branch or local dev build that still uses these fields is
  borne by the developer; the reviewer will catch it in PR review.
- **Storage-key bump**: `lgtm_buzzer.options.v1` → `…v2`. The reader for
  `v2` does not migrate or warn about a `v1` key — it returns
  `Left<absent>` for missing `v2` (so the options page just shows
  defaults). A short note in the README tells developers to re-pick
  their LLM adapter on first load of the new options page; saved
  credentials are no longer needed and are silently abandoned in
  storage (until the user runs `chrome.storage.local.clear()` from
  devtools).
- **Envelope `v`**: stays at `1`. Pre-release codebase + additive
  frames + one removed optional field do not justify a bump.

#### Resolver redaction posture (binding)

- The resolver writes ONE log line per `resolve(adapterId)` invocation,
  at `debug` level, containing `{ adapterId, hit: boolean,
  via: "GITHUB_TOKEN env" | "GH_TOKEN env" | "gh CLI" | "AZURE_DEVOPS_EXT_PAT env" | "az CLI" | "ANTHROPIC_API_KEY env" | "CLI-managed" | "miss" }`.
  NEVER includes the secret bytes.
- `REDACT_PATHS` in the host logger gains one entry: `"*.secret"` and
  `"secret"`. Existing entries (`*.token`, `*.apiKey`, `*.pat`,
  `*.x-api-key`, `credentials`, `*.credentials`) remain.
- `AuthStatus.detail` and `AuthStatus.hint` are short strings drawn
  from a closed enum of step labels and remediation copy. They are
  enumerated in `packages/host/src/credentials/resolver.ts` as
  constants; the reviewer asserts no env-var VALUE ever flows into
  either field via a canary test that resolves with a sentinel env
  var `GITHUB_TOKEN=SECRET_CANARY_xxx` and checks
  `AuthStatus.detail` does NOT contain `"SECRET_CANARY_xxx"`.

#### Test strategy

**`packages/protocol/src/messages/quiz-request.test.ts`** — update:
1. Old shape without `credentials` parses (always did).
2. New "stale" case: shape with extraneous `credentials` field still
   parses (zod passthrough); the parsed value does NOT have a
   `credentials` field accessible on the typed payload.
3. `llmAdapterId` empty string still rejected.

**`packages/protocol/src/messages/check-auth-request.test.ts`** (new, ≥2):
1. Empty payload parses.
2. Extra field rejected (`.strict()`).

**`packages/protocol/src/messages/check-auth-response.test.ts`** (new, ≥4):
1. Empty `statuses` array parses.
2. Multi-row statuses with mixed `ok` parse.
3. `detail` and `hint` accepted as optional strings.
4. `adapterId` empty rejected.

**`packages/protocol/src/messages/error.test.ts`** — drop the
`"bad-credentials"` round-trip; assert it now FAILS parsing.

**`packages/protocol/src/envelope.test.ts`** — extend (≥2): both new
frame kinds parse via `FrameSchema`.

**`packages/host/src/credentials/resolver.test.ts`** (new, ≥18):
1. `github` env hit (`GITHUB_TOKEN=ghp_a`) → `Right<{ secret: "ghp_a",
   detail: "via GITHUB_TOKEN env" }>`.
2. `github` env miss + `GH_TOKEN=ghp_b` hit → `Right<{ secret: "ghp_b",
   detail: "via GH_TOKEN env" }>`.
3. `github` both env miss + `gh auth token` exit-0 stdout `"ghp_c\n"`
   → `Right<{ secret: "ghp_c", detail: "via gh CLI" }>` (note trim).
4. `github` all miss + `gh auth token` exit-1 → `Left<{ kind:
   "missing-credential", adapterId: "github", attempted: [3 labels],
   hint: contains "gh auth login" }>`.
5. `github` all miss + `gh auth token` exit-0 with empty stdout
   → treated as miss, falls through to error.
6. `github` `gh auth token` times out at 5 s → spawnIO cancels;
   resolver returns miss; final error.
7. `ado` `AZURE_DEVOPS_EXT_PAT` hit → `Right`.
8. `ado` env miss + `az` exit-0 stdout with token → `Right<{ via: "az
   CLI" }>`.
9. `ado` env miss + `az` exit-non-zero → `Left`.
10. `claude-api` `ANTHROPIC_API_KEY` hit → `Right<{ via: "ANTHROPIC_API_KEY env" }>`.
11. `claude-api` env miss → `Left` with hint mentioning
    `ANTHROPIC_API_KEY`.
12. `claude-cli` always `Right<{ secret: undefined, detail: "uses
    CLI's own login" }>`.
13. `codex-cli` likewise.
14. `copilot-cli` likewise.
15. Unknown adapter ID → resolver returns `Left` with hint "no resolver
    for adapter".
16. **Canary**: `GITHUB_TOKEN=SECRET_CANARY_xxx`; assert
    `Right.detail` does NOT contain `"SECRET_CANARY_xxx"`.
17. **Canary**: `gh auth token` stdout `"SECRET_CANARY_yyy\n"`; assert
    `Left.attempted` and `Left.hint` (for a forced full miss after
    swallowing this hit) do NOT contain `"SECRET_CANARY_yyy"`.
18. Subprocess invocation uses `spawnIO`, not raw `execa` — assert via
    a fake `spawnIO` that records its calls.

**`packages/host/src/registry.test.ts`** — rewrite:
1. `listLlm()` / `listVcs()` unchanged.
2. `buildLlm("claude-cli")` → `IO<…, LLMProvider>`; running it
   succeeds; the fake resolver's `resolve("claude-cli")` was called
   once.
3. `buildLlm("claude-api")` with resolver returning `Right<{ secret:
   "sk-x" }>` → `Right<LLMProvider>`; the adapter factory was called
   with `{ config: { apiKey: "sk-x" } }`.
4. `buildLlm("claude-api")` with resolver returning `Left<…>` →
   `Left<{ kind: "missing-credentials", adapterId: "claude-api",
   attempted, hint }>`.
5. `buildVcs("github")` with resolver `Right` → adapter factory called
   with `{ config: { token: <secret> } }`.
6. `buildVcs("ado")` likewise.
7. `buildVcs("unknown")` → `Left<{ kind: "unsupported-vcs-adapter" }>`.
8. **Canary**: resolver returns `Right<{ secret: "SECRET_xxx" }>` and
   `Left<{ hint: "Run gh auth login" }>` in separate calls; assert
   the registry's returned `RegistryError` shape never contains
   `"SECRET_xxx"`.

**`packages/host/src/dispatcher.test.ts`** — update:
1. Drop all `bad-credentials` cases.
2. `quiz-request` with stale `credentials` field → host ignores it,
   resolver runs, happy path completes (with a fake resolver returning
   `Right`).
3. `quiz-request` where resolver returns `Left` for github → wire
   `ErrorFrame { reason: "missing-credentials", details: { adapterId,
   attempted, hint } }`. No `fetchDiff` observed.
4. `check-auth-request` → host writes `check-auth-response` with one
   row per adapter; rows reflect the fake resolver's per-adapter
   results.
5. `check-auth-request` with one resolver step throwing — assert the
   handler still writes a response (the row is `ok: false`); the
   handler does not crash.

**`packages/host/src/logger.test.ts`** — add:
1. `{ resolved: { secret: "x" } }` → `secret` redacted.
2. `{ resolved: { detail: "via gh CLI" } }` → `detail` visible.

**`packages/extension/src/lib/options/schema.test.ts`** — update:
1. v2 stored options round-trip.
2. v1-shaped payload (`schemaVersion: 1`) → corrupt.
3. Stored options with extraneous `vcsAdapterId` or `credentials`
   keys → still parses (zod strips); typed result has no such fields.

**`packages/extension/src/lib/options/storage-reader.test.ts`** —
rewrite:
1. Empty storage → `{ llmAdapterId: undefined }`.
2. `{ llmAdapterId: "claude-api" }` → `{ llmAdapterId: "claude-api" }`.
3. Corrupt storage → `{ llmAdapterId: undefined }`.

**`packages/extension/src/lib/options/auth-status.test.ts`** (new, ≥4):
1. Round-trip `check-auth-request` → host stub returns 6 rows → result
   is `Right<AuthStatus[]>` with 6 rows.
2. Host returns `ErrorFrame { reason: "internal", message: "connect
   failed" }` → `Left<host-not-installed>`.
3. Host returns `ErrorFrame { reason: "internal", message: "other" }`
   → `Left<host-error>`.
4. Send throws → `Left<internal>`.

**`packages/extension/src/lib/options/probe.test.ts`** — drop
credential-shaped inputs from the cases.

**`packages/extension/src/lib/options/dom.test.ts`** — rewrite (≥9):
1. Mount with empty storage → LLM dropdown populates; no VCS dropdown
   in DOM; no credential inputs in DOM.
2. Auth-status panel shows one row per adapter advertised by the
   `checkAuth` stub.
3. Refresh button re-invokes `checkAuth`.
4. Row with `ok: true` and `detail: "via GH CLI"` renders the detail
   text; ✓ icon (or `data-lgtm-status="ok"`) attached.
5. Row with `ok: false` and `hint: "Run \`gh auth login\`"` renders
   the hint; ✗ marker attached.
6. Save handler persists only `{ schemaVersion: 2, llmAdapterId }`;
   no `credentials` or `vcsAdapterId` reach `store.write`.
7. Test-connection button (still present) calls `probe` with only the
   `llmAdapterId` field; succeeds on `pong`.
8. **Canary**: a row whose `hint` contains the literal string
   `"SECRET_CANARY_xxx"` (impossible in practice but defended in
   depth) renders the string into the DOM. The dom layer is NOT
   the redaction layer — the host already enforces this — but the
   test exists to document that the dom layer is not the line of
   defense.
9. Host-not-installed → auth-status panel shows the existing
   "Native host not installed" banner.

**`packages/extension/src/lib/router.test.ts`** — update:
1. `quiz-request` with `pr.kind === "github"` → SW forwards with
   `vcsAdapterId === "github"`, no `credentials` field.
2. `quiz-request` with `pr.kind === "ado"` → SW forwards with
   `vcsAdapterId === "ado"`.
3. `quiz-request` with stored `llmAdapterId: "claude-api"` → SW
   forwards with `llmAdapterId === "claude-api"` and no `credentials`.
4. `quiz-request` where CS payload contained a stale `credentials`
   field → SW strips it before forwarding.

**Contract tests for adapters**: no change. Adapter factories still
take `{ config: { token | apiKey } }`.

**End-to-end**: the existing Playwright e2e (ADR-25) uses an SW stub;
no host actually runs. This ADR does not add new e2e coverage —
manual verification on a real Chrome + host install closes the loop
on the resolver chain. Documented in the issue's acceptance criteria.

Coverage target: ≥90% on `resolver.ts` (chain logic is core to the
feature); ≥85% on the rewritten `dom.ts`; ≥85% on the rewritten
`storage-reader.ts`.

### Consequences

- **The strict-bag bug is fixed by construction.** No wire bag exists
  to validate; the per-adapter `.strict()` schemas are gone.
- **No PATs in `chrome.storage.local`.** The plaintext-storage caveat
  from ADR-22 / ADR-23 disappears. The README updates accordingly.
- **One fewer permission worth of blast radius.** The `"storage"`
  permission stays (still used for `llmAdapterId` + future
  preferences), but the value behind it is no longer sensitive.
- **Users with `gh auth login` / `az login` / `ANTHROPIC_API_KEY`
  already exported get zero-config.** Open the options page, see
  green checkmarks for the adapters they use, save the LLM choice,
  approve a PR. No credential entry.
- **SSO-protected tokens are a known gotcha.** `gh auth token` returns
  a token that may be blocked by SAML SSO until the user runs
  `gh auth refresh -h <host> -s read:user`. The resolver cannot detect
  this. The hint copy and README explicitly call this out; a deferred
  issue may add a richer probe that distinguishes "no token" from
  "token but server returned 401".
- **Subprocess invocation is bounded by `spawnIO`'s existing
  cancellation contract.** 5-second timeout per CLI call; cancellation
  sends SIGTERM then SIGKILL (ADR-9 contract). A user whose `gh` CLI
  is wedged sees the row as `ok: false` instead of a hung options
  page.
- **One wire field removed + one error reason removed + two frame
  kinds added.** Envelope `v` stays at `1`; on a pre-release codebase
  the breakage cost is the dev who has to rebuild their local
  extension.
- **Storage envelope bumped to v2.** Old `v1` data is unmigrated and
  abandoned. Documented in README.
- **`bad-credentials` is gone from the wire error vocabulary.** The
  modal's `errorClassToUI` (ADR-24) must lose its `bad-credentials`
  arm; if any code path still references the string, the reviewer
  catches it.
- **Resolver redaction is structural.** `REDACT_PATHS` gains
  `"secret"` and `"*.secret"`. The resolver's `via` strings are drawn
  from a closed enumeration of step labels — no env-var VALUE ever
  flows into a log line.
- **No new runtime deps anywhere.** `monadyssey` + `zod` + `pino` +
  `execa` (via spawnIO) cover everything. `pino` is dev-only, `execa`
  is already used by `spawnIO`.
- **Diff-only invariant preserved.** No new code path puts non-diff PR
  text on the prompt path. Credentials never appear on the wire.
- **Reversibility moderate.** The protocol changes are small but
  technically breaking; rolling back means re-adding `credentials` to
  the schema and the credential inputs to the options page. The
  resolver itself is one file behind a typed interface.
- **Out of scope (explicit non-goals, deferred to future issues)**:
  - Multi-account selection (e.g., `gh auth status` lists multiple
    accounts; v1 takes the default).
  - SSO-protected token detection (resolver returns the token; the
    adapter call gets 401; user is on their own).
  - Mac Keychain / Windows Credential Manager integration.
  - Per-repository credential overrides.
  - HTTP-based auth flows from the options page (would require a new
    permission and a separate ADR).

**Binding for reviewer**:
- (a) `quiz-request.payload.credentials` MUST be removed from the
  schema. Reviewer asserts via the updated `quiz-request.test.ts`.
- (b) `error.payload.reason` enum MUST NOT contain
  `"bad-credentials"`. Reviewer asserts via the updated
  `error.test.ts`.
- (c) `CredentialResolver.resolve` MUST run on every invocation — no
  caching. Reviewer asserts via a test with two consecutive calls
  observing the env reader was called twice.
- (d) `AuthStatus.detail` and `AuthStatus.hint` MUST be drawn from
  closed sets of step labels and remediation copy. Reviewer asserts
  via the SECRET_CANARY tests in `resolver.test.ts`.
- (e) Subprocess invocations MUST go through `spawnIO`, not raw
  `execa` or `child_process`. Reviewer asserts via the spawn-fake
  test.
- (f) `subprocessTimeoutMs` default MUST be 5000. Reviewer asserts via
  a constant test.
- (g) SW MUST NOT read credentials from storage on any frame kind.
  Reviewer asserts by greping `storage-reader.ts` for the absence of
  any `credentials` access.
- (h) SW MUST infer `vcsAdapterId` from `pr.kind` on `quiz-request`.
  Reviewer asserts via router tests.
- (i) Resolver code paths MUST NOT throw for expected failures (env
  miss, exit-non-zero, timeout). All travel through `IO`. Reviewer
  asserts via the resolver tests.
- (j) The `"options.v1"` storage key MUST NOT be migrated. Reviewer
  asserts via the storage test (`v1` data → `Left<absent>` for the
  `v2` reader).

---

## ADR-30 (2026-05-25): Question pool with diff-hash cache and silent resample-on-retry
**Date**: 2026-05-25
**Issue**: #117
**Status**: Accepted

### Context

Today every `quiz-request` triggers a fresh LLM call. A user who fails a
quiz and clicks "Try Again" pays the full ~20s generation cost again, and
either gets the same questions back (when the LLM is deterministic) or a
near-identical set (when it is not). User feedback: "we shouldn't rerun
the quiz generation unless there were serious changes on the PR."

The fix is two cooperating changes:

1. **Pool, not single quiz.** On a cache miss the host asks the LLM for a
   larger pool of 20 questions, samples 5 for the live quiz, and keeps
   the remaining 15 in memory for follow-up resamples.
2. **Diff-hash cache.** The pool is keyed by the SHA-256 of the diff
   bytes (plus PR identity as a guard). A new push to the PR changes the
   diff, which changes the hash, which invalidates the cache and forces
   a fresh pool — exactly the "serious changes on the PR" invalidation
   the user described.

Five forces shape the design:

- **Diff-only invariant (binding).** The hash MUST be over diff bytes
  ONLY. Hashing PR title / description / comments would smuggle non-diff
  text into the cache key and, by extension, into the gate-integrity
  threat model — a teammate could write a "fancy" PR description to
  flip the cache without producing any diff change. Same posture as the
  prompt path in ADR-11/ADR-14: diff in, nothing else in.
- **Long-lived host (verified).** ADR-17 §1 establishes lazy port
  lifecycle: the SW calls `chrome.runtime.connectNative` once and the
  host process stays alive until `port.onDisconnect` or SW termination.
  An in-process Map in the host therefore survives across multiple
  `quiz-request` / `quiz-resample-request` frames in the same SW
  session. Confirmed by inspecting
  `packages/host/src/cli.ts` (the `for await` loop over framed stdin
  never exits between frames). This makes the in-process cache useful;
  without ADR-17's lifecycle the cache would be no-op.
- **Silent UX.** The user signed off on no "pool size N / N remaining"
  indicator. The modal shows the same `Try Again` button; what changed
  is invisible to the user except that the second attempt is fast.
- **Wire additive.** Envelope `v: 1` stays. We add ONE new frame
  kind (`quiz-resample-request`) and ONE optional field
  (`questionPoolSize`) on `quiz-request`. Old extension ↔ new host
  works (legacy mode, no caching). New extension ↔ old host works via
  a frame-kind fallback documented below.
- **Stats truth.** The stats footer (ADR-26 / store.ts) currently
  records `recordGeneration` on every `quiz-response`. After this ADR
  a resample reply MUST NOT count as a "generation" because no LLM
  call happened. Otherwise the footer's "generated in 17s" median
  would be polluted by `~0ms` rows.

### Decision

A diff-hash-keyed question pool lives in a new host-side
`QuestionPoolCache` (in-process LRU Map, cap 10). On `quiz-request` the
host computes `sha256(diff)`, looks up the pool by composite key, and
either reuses the cached pool (sample 5 fresh) or generates a 20-question
pool (LLM call) and caches it. A new `quiz-resample-request { quizId }`
frame asks the host to resample 5 from the pool the given sample-quizId
came from; the host returns a normal `quiz-response` with a NEW
sample-quizId. The extension's quiz-retry path sends
`quiz-resample-request` instead of a fresh `quiz-request`, falling back
to `quiz-request` if the host rejects the new frame kind (forward-compat
with old hosts).

#### 1. Wire format (protocol changes)

**`quiz-request` payload — additive field.**

```ts
// packages/protocol/src/messages/quiz-request.ts (modified)
export const QuizRequestPayloadSchema = z.object({
  pr: PRIdentifierSchema,
  questionCount: z.number().int().min(1).max(10),
  /**
   * Optional. When present, the host generates a pool of this many
   * questions on cache miss and samples `questionCount` from it for the
   * reply. When absent, the host runs legacy single-quiz behaviour: no
   * pool, no cache, no resample support. Must be >= questionCount.
   * Capped at 50 to bound per-pool LLM cost. ADR-30.
   */
  questionPoolSize: z.number().int().min(1).max(50).optional(),
  llmAdapterId: z.string().min(1).optional(),
  vcsAdapterId: z.string().min(1).optional(),
});
```

Cross-field check (in `handleQuizRequest`, not in zod — keep schema
shallow): if `questionPoolSize !== undefined && questionPoolSize <
questionCount`, the host replies with an `internal` error
("questionPoolSize must be >= questionCount"). Schema does not enforce
because zod's cross-field refinement doesn't compose with the
discriminated union cleanly and the host already validates the pair at
handler entry.

**New `quiz-resample-request` frame.**

```ts
// packages/protocol/src/messages/quiz-resample-request.ts (NEW)
export const QuizResampleRequestPayloadSchema = z.object({
  /** The sample quizId returned in a prior quiz-response. */
  quizId: z.string().min(1),
  /** How many questions to return in the new sample. */
  questionCount: z.number().int().min(1).max(10),
});

export const QuizResampleRequestFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("quiz-resample-request"),
  payload: QuizResampleRequestPayloadSchema,
});
```

The reply is the existing `quiz-response` frame — same shape, new
`quiz.id` (new sample-quizId for a fresh answer-key entry). No
`cacheHit` field on the response: user explicitly chose silent.

**Errors.** Unknown `quizId` in a `quiz-resample-request` → existing
`internal` ErrorReason with message `"resample failed: unknown quiz id"`
and `details: { quizId }`. No new `ErrorReason` variant. (Rationale:
adding `unknown-resample-quiz-id` would force a protocol-version think
about backward compat in another month; the extension only needs to
distinguish "host rejected this resample" from "frame kind not
supported by host," which we get from message text being attached to a
known reason.)

**Old extension → new host.** Payload lacks `questionPoolSize`. Host
treats as legacy: no pool, no cache, identical to today (`generateQuiz`
with `questionCount`, store, respond). Zod `.passthrough()` is NOT
needed; absent optional fields parse fine.

**New extension → old host.** Old host does not know
`quiz-resample-request`. Existing dispatcher falls through to the
`error` frame `{ reason: "unknown-message" }` path (see `dispatcher.ts`
default case for unexpected kinds). Extension detects this and
re-sends as `quiz-request` (see §5).

`FrameSchema` in `packages/protocol/src/envelope.ts` adds
`QuizResampleRequestFrameSchema` to the discriminated union.
`PROTOCOL_VERSION` stays `1` — purely additive.

#### 2. Host cache design

**Module:** `packages/host/src/question-pool-cache.ts` (NEW).

```ts
import type { ChoiceId, QuestionId } from "@lgtm-buzzer/core";

/**
 * A question fully reconstructed from the LLM pool, including the correct
 * choice id. Identical shape to the `MultipleChoiceQuestion` in core but
 * held by the host outside of any wire-format projection.
 */
export type PoolQuestion = {
  readonly type: "multiple-choice";
  readonly id: QuestionId;
  readonly prompt: string;
  readonly choices: ReadonlyArray<{ readonly id: ChoiceId; readonly label: string }>;
  readonly correctChoiceId: ChoiceId;
  readonly explanation?: string;
};

/** A cached pool — N questions for a given (adapter, pr, diff) tuple. */
export type Pool = {
  readonly key: string;            // composite cache key (see §2 binding)
  readonly questions: ReadonlyArray<PoolQuestion>;
  readonly llmAdapterId: string;   // for telemetry / logs only
  readonly createdAt: number;
};

/** A live sample mapping: which pool produced this sample? */
export type SampleMapping = {
  readonly sampleQuizId: string;   // the QuizId returned to the extension
  readonly poolKey: string;        // points back into the pool map
  readonly sampledQuestionIds: ReadonlyArray<QuestionId>; // for "don't repeat" logging if desired (v2)
};

export type QuestionPoolCache = {
  /** Look up a pool by composite key. */
  readonly get: (key: string) => Pool | undefined;
  /** Insert a pool. Trims to LRU cap on insert. */
  readonly put: (pool: Pool) => void;
  /** Look up which pool a sample-quizId came from. */
  readonly getSampleMapping: (sampleQuizId: string) => SampleMapping | undefined;
  /** Record a sample-quizId → pool mapping. */
  readonly putSampleMapping: (mapping: SampleMapping) => void;
  /** Drop a sample mapping (called on quiz-submit, after scoring). */
  readonly deleteSampleMapping: (sampleQuizId: string) => void;
  /** Build the composite cache key. */
  readonly buildKey: (input: BuildKeyInput) => string;
  /** Number of pools currently cached (for tests + logging). */
  readonly size: () => number;
};

export type BuildKeyInput = {
  readonly prKind: "github" | "ado";
  readonly llmAdapterId: string;
  readonly prCanonical: string;  // canonical PR identifier string (see binding below)
  readonly diffHash: string;     // hex-encoded sha256 of diff bytes
};
```

**Cache key composition (binding).**

```
key = `${prKind}|${llmAdapterId}|${prCanonical}|${diffHash}`
```

- `prCanonical` for GitHub: `"github:" + owner + "/" + repo + "#" + number`.
- `prCanonical` for ADO: `"ado:" + org + "/" + project + "/" + repo + "#" + pullRequestId`.
- `diffHash`: `crypto.createHash("sha256").update(diff, "utf8").digest("hex")`.
- `llmAdapterId` is included because two adapters can return materially
  different question pools for the same diff (Claude vs Codex tone /
  difficulty). Switching adapter mid-session SHOULD invalidate.

**LRU policy.** Map preserves insertion order. On `put`:
1. If key already present, delete then set (refresh LRU).
2. If size > 10, delete the oldest entry (first iter of `map.keys()`).
Eviction on `put` only — `get` does not promote (simpler, and the next
`put` already refreshes). No TTL.

**Sample mapping store.** A separate `Map<string, SampleMapping>` lives
alongside. It is bounded by the same LRU cap times pool questions (worst
case 10 pools × ~K live samples). On `quiz-submit` (existing flow) the
host calls `cache.deleteSampleMapping(quizId)` AFTER scoring, mirroring
the existing `store.delete` no-replay invariant.

**No disk persistence.** Cache lives in-process. Host restart → cold
cache. Documented in TSDoc; consistent with the existing `SessionStore`
posture.

**Diff hash computation (boundary).** A small helper:

```ts
// packages/host/src/diff-hash.ts (NEW)
import { createHash } from "node:crypto";
import type { Diff } from "@lgtm-buzzer/core";

/**
 * Hash a diff for use as a cache key. The hash MUST cover the diff
 * bytes verbatim — no normalisation, no whitespace folding (that would
 * make "small whitespace tweak" collide with a real change). PR title /
 * description / comments MUST NOT be passed to this function. ADR-30
 * §Diff-only invariant.
 */
export const hashDiff = (diff: Diff): string =>
  createHash("sha256").update(diff, "utf8").digest("hex");
```

#### 3. LLM-call avoidance + prompt change

The LLM port (`packages/core/src/ports/llm-provider.ts`) is unchanged.
`GenerateQuizInput` already carries `{ diff, questionCount }`. On a
cache miss the host calls `generateQuiz({ diff, questionCount: poolSize })`
— the same call site, just a larger N. No port change required.

The shared system prompt
(`packages/adapters/_shared/src/prompt.ts`) currently says "Generate
exactly N multiple-choice questions where N is provided in the USER
message." That language already parameterises N. No system-prompt edit
is needed — the value placed in `buildUserMessage(diff, N)` becomes the
pool size when caching is on, and the existing `questionCount` when it
is off. The eval suite (issue #52 / ADR-26) is calibrated against
N ∈ {1..10}; bumping to 20 stays in the same "small-integer" regime and
does not invalidate fixtures. Eval guard: a follow-up workspace_dispatch
run on the evals workflow with `questionCount=20` should be triggered
before flipping the extension default — non-gating per ADR-27, just a
sanity check the prompt still produces well-structured output at the
larger N.

#### 4. Quiz-request handler — updated sequence

In `packages/host/src/dispatcher.ts`, `handleQuizRequest` gains a new
branch:

1. Resolve adapter IDs (defaults applied when absent) — unchanged.
2. Build VCS + LLM providers via registry — unchanged.
3. Fetch diff from VCS adapter — unchanged.
4. **New:** If `questionPoolSize === undefined` → legacy path (steps 5L–7L).
   Else → pool path (steps 5P–7P).
5L. (Legacy) `llm.generateQuiz({ diff, questionCount })`. Store answer
    key under returned `quiz.id`. Write `quiz-response`.
5P. (Pool) Compute `diffHash = hashDiff(diff)`, build composite
    `poolKey`, call `cache.get(poolKey)`.
    - **Hit:** Skip LLM call. Use cached `Pool.questions`.
    - **Miss:** `llm.generateQuiz({ diff, questionCount: poolSize })`.
      Reify the LLM's returned `Quiz` into a `Pool` (mapping
      `Question.correctChoiceId` into `PoolQuestion.correctChoiceId`).
      `cache.put(pool)`.
6P. Sample `questionCount` questions from `pool.questions` using
    `Fisher–Yates` over `crypto.randomUUID()`-derived randomness
    (see §5). Generate a fresh `sampleQuizId` (`crypto.randomUUID()` →
    `QuizId`). Build an `AnswerKey` for the sample. Call
    `store.set(sampleQuizId, answerKey)` (existing API, no change).
    Call `cache.putSampleMapping({ sampleQuizId, poolKey,
    sampledQuestionIds })`.
7P. Build `quiz-response` frame with `quiz.id = sampleQuizId` and the
    5 sampled questions (no `correctChoiceId` on the wire — same
    gate-integrity invariant as today). Write frame.

Cache-hit vs cache-miss are indistinguishable on the wire (silent UX).
The host logs `cacheHit: true | false` at `info` for debugging only.

#### 5. New `handleQuizResampleRequest` handler

```
1. cache.getSampleMapping(quizId) → SampleMapping | undefined
   - undefined → write ErrorFrame
     { reason: "internal", message: "resample failed: unknown quiz id",
       details: { quizId } } and return.
2. cache.get(mapping.poolKey) → Pool | undefined
   - undefined (LRU evicted between sample and resample) → write
     ErrorFrame { reason: "internal",
       message: "resample failed: pool evicted",
       details: { quizId } } and return. Extension's fallback (see §6)
     can recover by sending a fresh quiz-request.
3. Sample `questionCount` questions from pool.questions (Fisher-Yates
   again — independent of previous sample; deliberate so the user gets
   genuinely new questions on retry).
4. Generate a fresh sampleQuizId (UUID).
5. Build AnswerKey for the new sample. store.set(newSampleQuizId, key).
6. cache.putSampleMapping({ sampleQuizId: newSampleQuizId, poolKey,
   sampledQuestionIds }).
7. (Optional) cache.deleteSampleMapping(oldSampleQuizId). Skip for v1
   so a stale modal that submits the OLD sampleQuizId concurrently still
   scores (instead of erroring). The host's existing per-quiz delete on
   submit cleans up either way.
8. Build quiz-response frame with quiz.id = newSampleQuizId. Write.
```

The handler is wrapped in `work.fork()` just like the quiz-request path,
and errors travel through the same `safeWrite` of an ErrorFrame. The
outer IO is `IO<never, void>`. No new RegistryError, no new
VCSProviderError, no new LLMProviderError — resample never goes to VCS
or LLM, only to the cache.

**Sampling.** Fisher-Yates shuffle with `Math.random()`. Rationale:
silent UX, no replay attack surface (the wire never exposes the pool,
and the answer key is built fresh per sample). Switching to
`crypto.getRandomValues`-seeded shuffles is a measurable-zero security
benefit at much higher code weight. `Math.random()` it is, documented.

#### 6. Extension quiz-flow — retry path

In `packages/extension/src/lib/dom/quiz-flow.ts`:

**Sending `questionPoolSize`.** The `sendQuizRequest` builds the
`quiz-request` payload with both fields:

```ts
payload: {
  pr: ...,
  questionCount: 5,
  questionPoolSize: 20,
}
```

These are constants for v1 (deferred: making them configurable in the
options page).

**Retry sends a resample.** `onQuizRetry` allocates fresh
`requestId`/`correlationId` as today, then takes one of two branches:

- **Has a `quizId` in scope?** The modal currently passes the
  `requestId` (intercept-side) on the `quiz-retry` event detail; it
  does NOT currently include the `quizId` of the quiz the user just
  failed. We need it: extend `QuizRetryEventDetailSchema` with an
  optional `quizId: z.string().min(1).optional()` and have the modal
  emit it when the failed/error state has one in scope. When present,
  `onQuizRetry` calls a new `sendQuizResampleRequest(requestId,
  freshPending, correlationId, quizId)` which sends the new frame
  kind.
- **No `quizId`?** (Initial-request error before a quiz arrived, or
  unknown state.) Fall through to the existing `sendQuizRequest`
  path. Behaviour is identical to today.

**Fallback on unknown-frame-kind / pool-evicted / unknown-quiz-id.**
The `quiz-resample-request` reply is one of:

- `quiz-response` — happy path, route as today via
  `handleQuizRequestReply`.
- `error { reason: "unknown-message" }` — old host. Retry the
  retry: kick off a fresh `sendQuizRequest` with the same fresh
  `requestId`/`pending`. The user sees one generating-state spinner;
  no extra UX surface.
- `error { reason: "internal", message: starts with "resample failed:" }`
  — host knows the frame kind but the pool/quiz is gone. Same
  fallback: send a fresh `sendQuizRequest`. Detection is by message
  prefix; ugly but lets us avoid a new ErrorReason variant. (The
  reviewer will accept this provided the prefix matches the constant
  defined in `dispatcher.ts` — both sides import a shared string
  constant from `protocol`'s new message module so the prefix never
  drifts.)
- Any other `error` — propagate to the modal as today.

The fallback is centralised in a new helper:

```ts
const sendQuizResampleRequest = async (
  requestId: string,
  p: PendingApprove,
  correlationId: string,
  failedQuizId: string,
): Promise<void> => {
  generationStartTimes.set(requestId, Date.now()); // measure regardless;
                                                   // see §7 for why this
                                                   // is NOT recorded.
  const frame: Frame = {
    v: 1,
    kind: "quiz-resample-request",
    correlationId,
    payload: { quizId: failedQuizId, questionCount: 5 },
  };
  // ... send via sendFrame ...
  // If reply is error & reason=="unknown-message" OR message starts with
  // RESAMPLE_FAILED_PREFIX (imported from protocol) → fall back to
  // sendQuizRequest(requestId, p, newCorrelationId()).
  // Else route via handleQuizRequestReply, BUT with a
  // `viaResample: true` flag so stats are NOT recorded (see §7).
};
```

#### 7. Stats interaction

`recordGeneration` measures LLM-call cost; a cache hit / resample has
zero LLM cost and MUST NOT be counted. Two changes in `quiz-flow.ts`:

- Track a per-request `viaResample: boolean` flag (private to the
  flow). Default `false`. Set `true` when the request originated from
  `sendQuizResampleRequest`.
- In `handleQuizRequestReply`, when `reply.kind === "quiz-response"`:
  ```
  if (!viaResample && stats !== undefined && startMs !== undefined) {
    void stats.recordGeneration(adapterId, Date.now() - startMs);
  }
  ```

`recordQuiz` continues to fire on every `quiz-result` — passes / fails
do count regardless of where the questions came from.

No change to `StatsStore` API. The footer's "generated in 17s" reading
stays accurate because resample replies never enter the rolling window.

#### 8. Backward / forward compat matrix

| Extension | Host | Behaviour |
|---|---|---|
| old | old | Today's behaviour — single quiz per request. |
| old | new | Payload lacks `questionPoolSize` → host legacy path, no cache. No resample frame is ever sent. Identical to today. |
| new | old | Initial `quiz-request` includes `questionPoolSize` (old host ignores unknown optional field via zod-default behaviour — verified: existing `QuizRequestPayloadSchema.parse` already strips unknown keys unless `.strict()`, which it is NOT). Host returns a normal single quiz. On retry, the new extension sends `quiz-resample-request`; old host responds `error { reason: "unknown-message" }`. Extension falls back to `quiz-request`. Net: feature is gracefully off. |
| new | new | Full pool + cache + resample. |

#### 9. Diff-only invariant — test gate

A canary test in `packages/host/src/diff-hash.test.ts`:

```ts
const diff = "diff --git a/foo b/foo\n..." as Diff;
const baseHash = hashDiff(diff);
const tampered = diff + " // SECRET_PR_TITLE_CANARY_v1";
// Sanity: appending bytes changes the hash. Pass.
expect(hashDiff(tampered)).not.toBe(baseHash);
// And the PR-side cache key composition (in question-pool-cache.test.ts)
// MUST refuse to admit PR title / description / comments — those are
// not parameters of `buildKey`. Type-level: `BuildKeyInput` has exactly
// four fields, none of them title/description/comments. Reviewer
// asserts via a TS compile-error test that adding `prTitle` to
// `BuildKeyInput` fails type-check.
```

The cache-key call site (in `dispatcher.ts`) takes only `pr` (already
diff-only — `PRIdentifier` has no title/desc fields) and `diff` and
passes them through `hashDiff` + canonicaliser. There is no plausible
path from PR title to the hash.

### Affected workspaces

| Workspace | Change |
|---|---|
| `protocol` | New `quiz-resample-request` message + optional `questionPoolSize` on `quiz-request`. Schemas only — zero runtime deps. Stays on `zod`. |
| `core` | UNCHANGED. The pool is host concern; the LLM port still receives `{ diff, questionCount }`. No new ports. |
| `adapters/*` | UNCHANGED. Adapters still implement `generateQuiz` as today. The host calls them with a larger `questionCount` on pool generation. |
| `host` | New `question-pool-cache.ts`, new `diff-hash.ts`, updated `dispatcher.ts` for the new branch + new handler. New runtime dep: none (`node:crypto` is built-in). |
| `extension` | Updated `quiz-flow.ts` retry path + new `sendQuizResampleRequest` helper. Updated `dom-events.ts` to extend `QuizRetryEventDetailSchema`. Updated `modal.ts` to pass the failed `quizId` on retry. No new runtime deps. |

Dependency direction stays clean: `protocol ← core ← adapters ← host`
and `protocol ← core ← extension`. The cache lives in `host` only; it
imports `core` types (`QuestionId`, `ChoiceId`, `QuizId`, `Diff`) and
`protocol` schemas — both downstream.

### Types (per workspace)

**`protocol`:**

```ts
// packages/protocol/src/messages/quiz-resample-request.ts (NEW)
export const QuizResampleRequestPayloadSchema = z.object({
  quizId: z.string().min(1),
  questionCount: z.number().int().min(1).max(10),
});
export type QuizResampleRequestPayload = z.infer<typeof QuizResampleRequestPayloadSchema>;
export const QuizResampleRequestFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("quiz-resample-request"),
  payload: QuizResampleRequestPayloadSchema,
});
export type QuizResampleRequestFrame = z.infer<typeof QuizResampleRequestFrameSchema>;

// Shared constant so extension + host agree on the fallback-detection prefix.
export const RESAMPLE_FAILED_PREFIX = "resample failed:" as const;
```

`quiz-request.ts` adds the optional `questionPoolSize` field.
`envelope.ts` adds `QuizResampleRequestFrameSchema` to the
discriminated union.

**`host`:**

```ts
// packages/host/src/question-pool-cache.ts (NEW)
export type PoolQuestion = { ... };  // §2
export type Pool = { ... };
export type SampleMapping = { ... };
export type BuildKeyInput = { ... };
export type QuestionPoolCache = { ... };
export const createQuestionPoolCache = (opts?: { capacity?: number }): QuestionPoolCache;

// packages/host/src/diff-hash.ts (NEW)
export const hashDiff = (diff: Diff): string;
```

**`extension`:**

```ts
// packages/extension/src/lib/dom/dom-events.ts (modified)
export const QuizRetryEventDetailSchema = z.object({
  requestId: z.string().min(1),
  // NEW: optional sample-quizId of the quiz the user just failed.
  // When present, retry uses quiz-resample-request; when absent,
  // retry uses quiz-request.
  quizId: z.string().min(1).optional(),
});
```

### Functions and methods

**`protocol`:** purely schemas + zod-inferred types. No functions.

**`host`:**

```ts
// packages/host/src/diff-hash.ts
export const hashDiff = (diff: Diff): string;

// packages/host/src/question-pool-cache.ts
export const createQuestionPoolCache = (
  opts?: { readonly capacity?: number },
): QuestionPoolCache;

// packages/host/src/dispatcher.ts (modified)
// - existing handleQuizRequest gets a pool branch
// - new handleQuizResampleRequest
const handleQuizResampleRequest = (
  quizId: string,
  questionCount: number,
  correlationId: string | null,
  deps: DispatcherDeps & { readonly cache: QuestionPoolCache },
): IO<never, void>;
// DispatcherDeps gains a readonly `cache: QuestionPoolCache` field.
// cli.ts constructs it once at startup, threads it into createDispatcher.
```

**`extension`:**

```ts
// packages/extension/src/lib/dom/quiz-flow.ts (modified)
const sendQuizResampleRequest = async (
  requestId: string,
  p: PendingApprove,
  correlationId: string,
  failedQuizId: string,
): Promise<void>;
// onQuizRetry updated to call sendQuizResampleRequest when detail.quizId
// is present, else sendQuizRequest as today.
// handleQuizRequestReply gains an optional `viaResample` parameter that
// gates the stats.recordGeneration call.
```

No new `Either`/`IO` types — all new code in `host` plugs into the
existing `IO<never, void>` dispatcher contract; all new code in
`extension` plugs into the existing Promise-based flow controller.

### File layout

**New files:**

- `packages/protocol/src/messages/quiz-resample-request.ts`
- `packages/protocol/src/messages/quiz-resample-request.test.ts`
- `packages/host/src/diff-hash.ts`
- `packages/host/src/diff-hash.test.ts`
- `packages/host/src/question-pool-cache.ts`
- `packages/host/src/question-pool-cache.test.ts`

**Modified files:**

- `packages/protocol/src/messages/quiz-request.ts` — add
  `questionPoolSize`.
- `packages/protocol/src/messages/quiz-request.test.ts` — new cases:
  absent field accepted (legacy), present + valid accepted, present <
  questionCount accepted by schema (handler will reject), present > 50
  rejected.
- `packages/protocol/src/envelope.ts` — add
  `QuizResampleRequestFrameSchema` to the discriminated union.
- `packages/protocol/src/envelope.test.ts` — assert
  `quiz-resample-request` round-trips through `FrameSchema`.
- `packages/protocol/src/index.ts` — re-export new types +
  `RESAMPLE_FAILED_PREFIX`.
- `packages/host/src/dispatcher.ts` — new handler + pool branch in
  existing handler; `DispatcherDeps.cache` field.
- `packages/host/src/dispatcher.test.ts` — new cases (see test plan
  below).
- `packages/host/src/cli.ts` — construct `createQuestionPoolCache`
  once at startup; thread into `createDispatcher`.
- `packages/extension/src/lib/dom/dom-events.ts` — extend
  `QuizRetryEventDetailSchema`.
- `packages/extension/src/lib/dom/dom-events.test.ts` — case for
  optional `quizId`.
- `packages/extension/src/lib/dom/quiz-flow.ts` — retry path
  branches; `viaResample` flag; fallback on `unknown-message` /
  `RESAMPLE_FAILED_PREFIX`.
- `packages/extension/src/lib/dom/quiz-flow.test.ts` — new cases
  (see test plan).
- `packages/extension/src/lib/dom/modal.ts` — emit `quizId` on the
  `quiz-retry` DOM event when in `failed` or `error-after-quiz-arrived`
  state.

**E2E:**

- `packages/extension/e2e/specs/quiz-retry-uses-pool.spec.ts` (NEW) —
  stub host returns 20-question pool on first generate, second
  generate is never called; assertion is that the retry's
  generating-state transition is < 50 ms (no LLM round-trip).

### Sequence (cache-hit on retry)

1. User clicks Approve on a PR. Content script intercepts, emits
   `quiz-request` DOM event, sends `quiz-request` frame with
   `questionCount: 5, questionPoolSize: 20`.
2. SW routes to host. Host fetches diff, computes
   `diffHash = sha256(diff)`, builds composite key. Cache miss.
3. Host calls `llm.generateQuiz({ diff, questionCount: 20 })`. LLM
   returns a `Quiz` with 20 questions. Host reifies into `Pool`,
   inserts into cache.
4. Host samples 5 questions. Allocates `sampleQuizId`. Stores
   `AnswerKey` (via existing `SessionStore`). Records
   `SampleMapping(sampleQuizId, poolKey)` in the cache. Writes
   `quiz-response` with 5 questions and `quiz.id = sampleQuizId`.
5. Extension renders modal. User answers. User fails. Modal transitions
   to `failed`, "Try Again" button is enabled.
6. User clicks "Try Again". Modal emits `quiz-retry` DOM event with
   `{ requestId, quizId: sampleQuizId }`.
7. Extension's `onQuizRetry` calls `sendQuizResampleRequest` (because
   `quizId` is present). Frame: `{ kind: "quiz-resample-request",
   payload: { quizId: sampleQuizId, questionCount: 5 } }`.
8. Host's `handleQuizResampleRequest` looks up the sample mapping,
   then the pool. Both present. Samples 5 fresh questions (independent
   of previous sample). New `sampleQuizId'`. Stores new `AnswerKey`.
   Writes `quiz-response`. No LLM call. Total latency ~5 ms.
9. Extension routes via `handleQuizRequestReply` with
   `viaResample=true`. Stats `recordGeneration` is NOT called.
10. Modal renders the fresh 5 questions. User answers. Submission
    flows through the existing `quiz-submit` path unchanged.

### Error cases

| Error | Where | Behaviour |
|---|---|---|
| `questionPoolSize < questionCount` | host handler | Write `ErrorFrame { reason: "internal", message: "questionPoolSize must be >= questionCount" }`. Extension surfaces as generic error. |
| Cache miss + LLM call fails | host (existing path) | Existing `LLMProviderError` mapping in dispatcher applies. Cache is NOT mutated (we never `put` an empty / failed pool). Extension surfaces as today. |
| Resample for unknown quizId | host new handler | `ErrorFrame { reason: "internal", message: "resample failed: unknown quiz id" }`. Extension falls back to fresh `quiz-request`. |
| Resample but pool LRU-evicted between sample and resample | host new handler | `ErrorFrame { reason: "internal", message: "resample failed: pool evicted" }`. Extension falls back to fresh `quiz-request`. |
| Old host receives `quiz-resample-request` | host (existing default branch) | Today's `unknown-message` ErrorFrame path. Extension falls back to fresh `quiz-request`. |
| `crypto.createHash` unavailable | invariant violation | `node:crypto` is always present in Node ≥ 14. If absent, the host has bigger problems; let it throw (`throw` is reserved for invariant violations per CLAUDE.md). |
| Diff is empty string | host pool path | `hashDiff("")` is well-defined (`sha256("")`). Still cached. The downstream `LLMProvider` already returns `malformed-response` on empty-diff guard in the adapter; that error flows through unchanged and the cache stays empty for that key (we never `put` on adapter error). |

All expected failures travel through the existing IO `Err` channel or
the wire ErrorFrame path. No `throw` introduced.

### Test strategy

**`protocol` unit tests** (`packages/protocol/src/messages/`):
- `quiz-resample-request.test.ts` — payload accepts valid input;
  rejects missing `quizId`; rejects `questionCount` out of `[1, 10]`.
- `quiz-resample-request.test.ts` — full frame round-trips through
  `FrameSchema`.
- `quiz-request.test.ts` — accepts payload without
  `questionPoolSize` (legacy); accepts with `questionPoolSize: 20`;
  rejects `questionPoolSize: 0` and `questionPoolSize: 51`.

**`host` unit tests** (`packages/host/src/`):
- `diff-hash.test.ts`:
  - Deterministic: same diff → same hash across calls.
  - Single-byte change → different hash.
  - Empty diff → well-defined hash.
  - "Diff-only canary": title/description/comments are NOT passed to
    `hashDiff` (type-level — `hashDiff` accepts `Diff`, not unknown).
- `question-pool-cache.test.ts`:
  - `put` + `get` round-trip.
  - LRU eviction at capacity 10 — the oldest entry is dropped on the
    11th insert.
  - `buildKey` produces stable keys for stable inputs.
  - `buildKey` produces different keys when `prKind` / `llmAdapterId`
    / `prCanonical` / `diffHash` differs.
  - `putSampleMapping` / `getSampleMapping` / `deleteSampleMapping`
    round-trip.
- `dispatcher.test.ts`:
  - Legacy path: `quiz-request` without `questionPoolSize` calls
    `llm.generateQuiz` with `questionCount: 5` and does NOT touch the
    cache.
  - Pool miss: `quiz-request` with `questionPoolSize: 20` calls
    `llm.generateQuiz` with `questionCount: 20`, samples 5,
    inserts into cache, writes `quiz-response` with 5 questions.
  - Pool hit: second identical `quiz-request` does NOT call
    `llm.generateQuiz`, samples 5 from the cached pool, writes
    `quiz-response` with 5 questions (possibly different from the
    first sample — assert the question IDs are a 5-of-20 subset, not
    equality).
  - Diff change → pool miss: same PR, different diff → new
    `llm.generateQuiz` call.
  - PR change → pool miss: same diff hash, different PR → new
    `llm.generateQuiz` call (defensive — the diff hash dominates, but
    we include PR identity as a guard so identical diffs in two
    repos do not cross-contaminate).
  - Adapter change → pool miss: same PR + diff, different
    `llmAdapterId` → new `llm.generateQuiz` call.
  - `questionPoolSize < questionCount` → ErrorFrame with `internal`
    reason.
  - Resample happy path: after a pool-miss `quiz-request`, a
    `quiz-resample-request` with the returned sample-quizId returns
    a fresh `quiz-response` with a new `quiz.id` and 5 questions
    drawn from the same pool. `llm.generateQuiz` is called ONCE
    across the two frames.
  - Resample unknown quizId → ErrorFrame with `internal` reason and
    message starting `"resample failed:"`.
  - Resample after pool eviction → ErrorFrame with `internal` reason
    and message starting `"resample failed:"`.

**`extension` unit tests** (`packages/extension/src/lib/dom/`):
- `quiz-flow.test.ts`:
  - Retry with `quizId` in scope sends a `quiz-resample-request`
    frame (not a `quiz-request`).
  - Retry without `quizId` sends a `quiz-request` frame (today's
    behaviour).
  - Resample reply with `error { reason: "unknown-message" }`
    triggers a fallback `quiz-request` to the same SW.
  - Resample reply with `error { reason: "internal", message:
    "resample failed: ..." }` triggers a fallback `quiz-request`.
  - Resample reply with `quiz-response` does NOT call
    `stats.recordGeneration` (assert via stats spy).
  - Initial `quiz-request` includes `questionPoolSize: 20` in the
    payload.

**Contract tests** (`packages/adapters/*/src/contract.test.ts`):
- No change required. The port still receives
  `{ diff, questionCount }`; passing `20` instead of `5` is a normal
  parameter range. The eval suite (#52) is invoked separately.

**E2E tests** (`packages/extension/e2e/specs/`):
- `quiz-retry-uses-pool.spec.ts` (NEW): stub-SW scenario where
  - First `quiz-request` returns a 5-question quiz (sampled from a
    pool of 20 the stub holds internally).
  - User submits wrong answers — quiz fails — clicks "Try Again".
  - Modal sends `quiz-resample-request`; stub samples a new 5 and
    returns instantly.
  - Assertion: the modal's `generating` state on retry lasts < 100 ms
    (no real LLM wait); the question prompts differ from the first
    set (verify at least one ID-level difference).

**Manual verification (gaps):**
- Real Claude CLI / Codex CLI / Copilot CLI returning ≥20
  well-structured questions for a real diff. Promptfoo evals (issue
  #52) at N=20 covers this; non-gating per ADR-27. Operator runs the
  manual `workflow_dispatch` after merge.
- Cross-session host restart: confirm that restarting the host
  (e.g., `chrome://extensions` reload) cleanly drops the cache and the
  next request regenerates. Covered by the in-process Map's lifetime
  by construction; no automated test.

### Consequences

**Trade-offs:**

- **Memory.** Cap 10 pools × 20 questions × ~1 KB per question ≈
  200 KB worst case. Acceptable for a long-lived host process.
- **Sampling repeats are possible.** With 20 questions and 5 sampled,
  there is no guarantee resample produces a fully-disjoint set from
  the first sample. Acceptable for v1; user explicitly chose silent
  UX. A future ADR could track `sampledQuestionIds` per pool and
  bias the shuffle toward unseen questions.
- **Adapter-keyed cache forfeits cross-adapter reuse.** Switching
  from Claude to Codex mid-session regenerates the pool. Deliberate
  — adapters produce qualitatively different quizzes — and the user
  signed off.
- **Pool size 20 vs 5 increases first-request LLM cost ~4×.** Net
  win on any session with ≥1 retry; break-even at exactly one
  retry. We expect retries to be common in the "the buzz is buzzing"
  use case, so this is a clear win on average.
- **No disk persistence.** A host restart re-pays the 4× cost. We
  view this as fine: host restart is rare relative to in-session
  retries.

**Security / gate integrity:**

- The cache key is constructed from the diff bytes and the
  diff-only `PRIdentifier`. There is no plausible path from PR
  title / description / comments to the cache key. The
  type-level invariant on `BuildKeyInput` makes adding such a
  path a deliberate, reviewable change.
- The wire still never carries `correctChoiceId`. The pool's
  `PoolQuestion.correctChoiceId` is host-side state and lives next
  to the existing `SessionStore` answer-key — same blast radius as
  today.
- Resample fairness: a sophisticated attacker who somehow knew the
  pool could try to bias the answer key. They can't — the answer
  key per sample is derived from the sampled questions only, the
  pool is in-process, and the wire never exposes pool membership.

**Future implications:**

- Disk persistence (deferred) would need encryption-at-rest for
  `correctChoiceId` to maintain the gate-integrity posture.
- Configurable pool size in options (deferred) would touch the SW's
  storage reader.
- Cross-adapter pool sharing (deferred) is unlikely to be worth the
  divergence; recommend not pursuing.

**Binding for reviewer:**

- (a) `quiz-request.payload.questionPoolSize` MUST be optional and
  MUST NOT default in zod. Default behaviour (legacy) is enforced
  at the handler entry. Reviewer asserts via the schema test.
- (b) `quiz-resample-request` frame MUST be in `FrameSchema`'s
  discriminated union and the host MUST handle it. Reviewer
  asserts via the envelope round-trip test and dispatcher test.
- (c) `hashDiff` MUST take only `Diff` (the branded type), never
  raw `unknown` or a record that could carry PR text. Reviewer
  asserts via a TS compile-error fixture if `BuildKeyInput` is
  expanded.
- (d) Cache LRU cap MUST be 10. Reviewer asserts via the eviction
  test.
- (e) `quiz-response` on a cache hit MUST be indistinguishable from
  a cache miss on the wire — no `cacheHit` field. Reviewer asserts
  via the dispatcher test (cache-hit path produces the same frame
  shape).
- (f) `stats.recordGeneration` MUST NOT be called on resample-reply
  paths. Reviewer asserts via the quiz-flow test with a stats spy.
- (g) Extension MUST fall back to a fresh `quiz-request` when the
  resample reply is `unknown-message` or carries the
  `RESAMPLE_FAILED_PREFIX`. Reviewer asserts via the quiz-flow
  tests.
- (h) The `RESAMPLE_FAILED_PREFIX` string MUST be imported from
  `protocol` on both sides — no duplicated literals. Reviewer
  asserts by grepping for the string outside the protocol module.
- (i) The host MUST NOT include PR title, description, commit
  messages, comments, labels, or any other non-diff PR content in
  the cache key computation. Reviewer asserts by inspecting the
  call site of `buildKey` in `dispatcher.ts`.

---

## ADR-32 (2026-05-27): Host-streamed quiz-progress heartbeat + configurable question pool size
**Date**: 2026-05-27
**Issue**: #125 (supersedes scope of #124)
**Status**: Accepted

### Context

Two closely-coupled extension UX issues, bundled because they touch the
same files and ship as one PR:

**Part A — Heartbeat (#124).** After ADR-30, the first quiz on a cache
miss generates a 20-question pool. That LLM call takes 60–90 s on real
PRs. During that window:

- The SW receives no traffic (one `quiz-request` out, one
  `quiz-response` in, much later).
- The modal shows a static spinner + a live elapsed timer + an ETA
  `<progress>` bar that caps at `0.95 * cachedMedianMs` and then
  stalls.
- The user has no feedback that the host fiber is still alive; the
  perception is "the host hung."
- ADR-30 raised the SW `timeoutMs` to 180 s precisely because of this,
  but raising a timeout does not improve the wait — it just delays the
  error. The right primitive is a heartbeat.

ADR-13's wire format is fully request/response today. There is no
host-initiated frame on the protocol. The dispatcher's per-request fiber
already logs at info on every phase boundary (`Cache miss — generating`,
`Quiz generated`, etc.) — those log lines are the natural emission
points.

ADR-17's port client routes every host frame through the
`CorrelationMap`: lookup by `correlationId`, resolve the pending
`Promise`, delete the entry. The map assumes exactly one reply per
correlation id. A heartbeat frame is the first wire frame that violates
this assumption — it carries the in-flight `correlationId` but is NOT
the final reply.

**Part B — Configurable question pool size (post-demo cleanup).** PR
#123 hardcoded `questionPoolSize: 5` in `quiz-flow.ts` as a demo hack
to drop first-quiz latency from ~60 s to ~15 s. With Part A landing,
that trade-off is no longer forced — higher pool sizes become
tolerable because the modal shows real progress. The hardcoded `5`
must move into stored options before users discover the regression
("retry just gives me the same five questions").

ADR-23 §Storage schema already established the pattern: bump
`STORAGE_KEY` + `SCHEMA_VERSION`, optional fields preserve forward
compat. ADR-29 already bumped to v2 and stripped credentials. v3
extends v2 with one optional `questionPoolSize` field. The SW
projection (`SwOptionsProjection`) gains the field; the router merges
it into outbound `quiz-request` payloads the same way it already
merges `llmAdapterId`.

Forces:

- **Backward compat on the wire.** Envelope `v: 1` stays. New
  `quiz-progress` frame is additive in `FrameSchema`. Old SW + new
  host: SW must not crash on unknown reply-shaped frames. New SW +
  old host: host never emits the frame, modal falls back to ADR-30's
  spinner + static elapsed timer.
- **Quiz-integrity invariant.** Per CLAUDE.md §Key differentiator,
  no non-diff PR text reaches the LLM prompt. Progress frames are
  metadata (phase label, elapsed ms) — they MUST NOT carry diff
  bytes, PR title, partial quiz content, or any field the host
  could be tempted to fill with prompt input. The schema enforces
  this by listing the exact allowed fields.
- **No new runtime deps anywhere.** Heartbeat timer in host uses
  `setInterval`; no `Schedule` (this is fire-and-forget logging,
  not a retried IO). zod schema in `protocol` is the only new code
  with a dep, and `zod` is already the protocol's sole runtime dep.
- **Diff-only invariant for pool size.** `questionPoolSize` is a
  scalar number. Cannot smuggle PR text. No additional review gate.
- **Dispatcher fiber stays sequential.** The existing `IO.lift`
  chain in `handleQuizRequest` is sequential. The heartbeat timer
  runs in parallel via plain `setInterval` started before
  `llm.generateQuiz` and cleared after. This is an explicit
  exception to "no raw Promise outside `IO.of`" because the
  heartbeat is a side-effecting log, not an effect we care to
  compose into the request fiber. The reviewer accepts this on the
  grounds that (a) the interval lifetime is fully bracketed by the
  IO boundary, (b) clearing the interval on the IO's success path
  is enforced by `try/finally` semantics inside `IO.lift`'s async
  block, and (c) the heartbeat never throws — `safeWrite` absorbs
  write failures.

### Decision

Add a one-way `quiz-progress` wire frame, route it through a new
`progressMap` parallel to the existing `CorrelationMap`, bridge it
through the SW → CS → modal via a new DOM event, and have the modal
swap its static spinner for a phase-aware indicator that resets the
SW timeout on every heartbeat. Separately, expose `questionPoolSize`
in the options page with a 3-value dropdown, bump storage to v3, and
have the SW merge the stored value into outbound `quiz-request`
payloads (replacing the hardcoded `5` in `quiz-flow.ts`).

#### Affected workspaces

```
protocol  ← core  ← adapters  ← host
protocol  ← core  ← extension
```

- `protocol`: new `quiz-progress` frame schema, added to `FrameSchema`.
  Zero runtime impact on existing frames.
- `core`: no changes. Progress is wire-only metadata; no domain type.
- `adapters/*`: no changes. The host dispatcher owns phase emission;
  adapters keep their existing `IO<E, A>` shapes.
- `host`: new helper `createProgressEmitter` plus emission calls
  inside `handleQuizRequest`. No new deps.
- `extension`: new `ProgressMap` (parallel to `CorrelationMap`),
  router wiring for `quiz-progress`, CS bridge, new
  `lgtm-buzzer:quiz-progress` DOM event, modal phase indicator,
  storage schema v3, options-page dropdown.

Dependency direction holds: `extension` and `host` both import from
`protocol` only. Nothing in `core` or `protocol` learns about heartbeats
beyond the schema itself.

#### Types

**New (`packages/protocol/src/messages/quiz-progress.ts`):**

```ts
// One-way host → SW frame. NO REPLY EXPECTED.
export const QuizProgressPhaseSchema = z.enum([
  "fetching-diff",
  "generating-quiz",
  "parsing",
  "caching",
]);

export type QuizProgressPhase = z.infer<typeof QuizProgressPhaseSchema>;

export const QuizProgressPayloadSchema = z.object({
  phase: QuizProgressPhaseSchema,
  /** Milliseconds since the host started handling the originating quiz-request. */
  elapsedMs: z.number().int().min(0),
  /** Optional host-side ETA hint. v1: always undefined (modal uses its own historical median). */
  expectedMs: z.number().int().min(0).optional(),
});

export type QuizProgressPayload = z.infer<typeof QuizProgressPayloadSchema>;

export const QuizProgressFrameSchema = z.object({
  ...EnvelopeBase,
  kind: z.literal("quiz-progress"),
  payload: QuizProgressPayloadSchema,
});

export type QuizProgressFrame = z.infer<typeof QuizProgressFrameSchema>;
```

Added to `FrameSchema` discriminated union in
`packages/protocol/src/envelope.ts`. `PROTOCOL_VERSION` stays `1`
(purely additive).

**BINDING (diff-only invariant):** `QuizProgressPayloadSchema` lists
the exact allowed fields. No `partial`, no `questionsGenerated`, no
`diffPreview`, no `prTitle`. Reviewer asserts via a schema test that
attempts to parse a payload with extra fields and confirms zod strips
them (or rejects, depending on the chosen passthrough setting — we
use the default `strip`).

**New (`packages/host/src/progress-emitter.ts`):**

```ts
export type ProgressEmitterDeps = {
  readonly write: FrameWriter;
  readonly logger: Logger;
  readonly now: () => number;
  /** Tick interval for the heartbeat (default 5000 ms). */
  readonly intervalMs?: number;
};

export type ProgressEmitter = {
  /** Emit a single phase-boundary frame immediately. */
  readonly emit: (correlationId: string | null, phase: QuizProgressPhase) => Promise<void>;
  /**
   * Start a recurring heartbeat for the current phase. Returns a stop
   * function. The heartbeat emits a frame at construction and then every
   * `intervalMs`. The stop function is idempotent and MUST be called from
   * the dispatcher's `try/finally`.
   */
  readonly startHeartbeat: (
    correlationId: string | null,
    phase: QuizProgressPhase,
  ) => () => void;
};

export const createProgressEmitter = (deps: ProgressEmitterDeps): ProgressEmitter;
```

Writes via the existing `FrameWriter`. Absorbs `WriteError` to a logger
warning — a failed heartbeat must NEVER fail the request fiber.

**New (`packages/extension/src/lib/progress-map.ts`):**

```ts
export type ProgressSubscriber = (frame: QuizProgressFrame) => void;

export type ProgressMap = {
  readonly subscribe: (correlationId: string, subscriber: ProgressSubscriber) => void;
  readonly unsubscribe: (correlationId: string) => void;
  readonly dispatch: (frame: QuizProgressFrame) => boolean; // true if a subscriber received it
};

export const createProgressMap = (): ProgressMap;
```

Parallel to `CorrelationMap`. Separate map so adding a heartbeat
subscriber does NOT touch the pending-reply semantics. A
`quiz-progress` frame neither resolves nor extends the
`PendingRequest`'s `Promise` — the `resolve` callback fires only on
the terminal `quiz-response` / `error` frame.

The router subscribes when sending the `quiz-request` frame and
unsubscribes on terminal reply. Subscriber is called synchronously
from `port.ts`'s `onMessage` listener after `FrameSchema.safeParse`
succeeds — same place the correlation map is consulted today.

**Modified (`packages/extension/src/lib/options/schema.ts`):**

```ts
export const STORAGE_KEY = "lgtm_buzzer.options.v3" as const;
export const SCHEMA_VERSION = 3 as const;

export const StoredOptionsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  llmAdapterId: z.string().min(1).optional(),
  /** Question pool size — see ADR-30 + ADR-32. One of {5, 10, 20}. */
  questionPoolSize: z.union([z.literal(5), z.literal(10), z.literal(20)]).optional(),
});
```

A `z.literal(5) | z.literal(10) | z.literal(20)` (rather than
`z.number().int().min(5).max(20)`) prevents users from hand-editing
storage to weird values. Absent value falls back to default `5`.

**v2 → v3 migration:** Stored v2 keys read by v3 code return
`Left<absent>` because the storage key changed (same posture as ADR-23's
v1 → v2 jump). DOM layer treats it as defaults and writes a fresh v3
envelope on Save. The dead v2 entry is left to age out — no destructive
migration. Documented in the schema TSDoc.

**Modified (`packages/extension/src/lib/options/storage-reader.ts`):**

```ts
export type SwOptionsProjection = {
  readonly llmAdapterId: string | undefined;
  readonly questionPoolSize: 5 | 10 | 20 | undefined;
};
```

#### Functions and methods

**`protocol`:** standard zod schema exports (see types section).

**`host` — `progress-emitter.ts`:**

```ts
export const createProgressEmitter = (deps: ProgressEmitterDeps): ProgressEmitter => {
  // emit: build a QuizProgressFrame; await write(frame).unsafeRun();
  //        on Err, logger.warn — never propagate.
  // startHeartbeat: take a startedAt = now(); emit immediately with
  //   elapsedMs: 0; setInterval(() => emit(... { elapsedMs: now() - startedAt }), intervalMs);
  //   return () => clearInterval(handle).
};
```

**`host` — `dispatcher.ts` (modifications):**

`handleQuizRequest` gains a `progress: ProgressEmitter` field in
`DispatcherDeps`. The pool path (cache-miss branch) is the only place
heartbeats start. Sequence:

1. `progress.emit(correlationId, "fetching-diff")` immediately after
   the fiber forks.
2. `vcs.fetchDiff(pr)` runs.
3. `progress.emit(correlationId, "generating-quiz")` just before
   `llm.generateQuiz`.
4. `const stopHeartbeat = progress.startHeartbeat(correlationId, "generating-quiz")`
   inside the `IO.lift` for the pool path, immediately before the
   `await llm.generateQuiz(...).unsafeRun()` call.
5. `try { ... } finally { stopHeartbeat() }` — guarantees the
   interval is cleared on success, error, AND cancellation.
6. `progress.emit(correlationId, "parsing")` after the LLM returns
   and before `quizToPool`.
7. `progress.emit(correlationId, "caching")` after `cache.put`,
   before `cache.putSampleMapping`.

On the legacy path (no `questionPoolSize`), heartbeat is still
emitted around `llm.generateQuiz` — the legacy call is still
long. Phase boundaries `fetching-diff` and `generating-quiz` are
emitted; `parsing` and `caching` are not.

`createDispatcher` accepts the emitter in `DispatcherDeps`.

**`extension` — `progress-map.ts`:** see types section.

**`extension` — `port.ts` (modifications):**

```ts
export type PortClientDeps = {
  // ...existing
  readonly progressMap?: ProgressMap; // optional for backward-compat in tests
};
```

`onMessage` listener gets a new branch:

```ts
if (reply.kind === "quiz-progress") {
  const ok = progressMap?.dispatch(reply) ?? false;
  if (!ok) {
    logger?.warn("[lgtm-buzzer:sw] quiz-progress with no subscriber — dropped", {
      correlationId: reply.correlationId,
    });
  }
  // Reset the pending request's timeout to give the host more headroom
  // for this in-flight quiz. See "Timeout extension on heartbeat" below.
  if (reply.correlationId !== null) {
    const pending = map.peekById(reply.correlationId); // new read-only accessor
    if (pending !== undefined) {
      clearTimeout(pending.timer);
      pending.timer = setTimeout(...);  // re-arm to deps.timeoutMs from now
    }
  }
  return; // do NOT call resolve, do NOT delete the pending entry
}
```

**`CorrelationMap` gains a read-only accessor** to support timeout
extension without taking the entry:

```ts
readonly peekById: (correlationId: string) => PendingRequest | undefined;
```

`PendingRequest.timer` becomes mutable (`let` semantics inside the
map) — the existing field is `readonly` today; this ADR relaxes it.
Reviewer accepts because the timer handle is the only field that
legitimately mutates after `add`.

**`extension` — `router.ts` (modifications):** when sending a
`quiz-request`, the router calls
`progressMap.subscribe(correlationId, forwardToTab)` where
`forwardToTab` calls
`chrome.tabs.sendMessage(tabId, { kind: "quiz-progress", payload: frame.payload })`.
On terminal reply (the existing `sendResponse({ kind: "frame", frame: reply })`
call), the router calls `progressMap.unsubscribe(correlationId)`.

**`extension` — `entrypoints/content.ts` (modifications):** a new
`browser.runtime.onMessage` branch handles
`{ kind: "quiz-progress", payload: QuizProgressPayload }`. Validates
payload via `QuizProgressPayloadSchema`. On success, dispatches a
`lgtm-buzzer:quiz-progress` DOM event with detail
`{ requestId: <current pending requestId>, phase, elapsedMs }`. The
controller needs to know the requestId — the CS bridge holds a
`Map<correlationId, requestId>` populated when the CS sends each
`quiz-request` (the correlationId is already passed in the
`QuizRequestEventDetail`).

Wait — actually the CS does NOT today track correlation → request.
The bridge needs that map. Alternative: pass `correlationId` straight
through to the DOM event, and let `quiz-flow.ts` resolve back to the
pending PendingApprove. The flow already has `pending` keyed by
`requestId`; the cleaner shape is for the CS bridge to look up the
in-flight quiz by correlationId.

Decision: store a `correlationId → requestId` map inside
`quiz-flow.ts`'s factory closure (populated in `sendQuizRequest` and
`sendQuizResampleRequest`, drained on terminal reply / cancel).
`onProgress` handler resolves correlationId to requestId before
emitting the DOM event. This keeps the CS bridge unaware of
quiz-flow internals and keeps correlationId out of the modal's API.

**`extension` — `dom/dom-events.ts` (additions):**

```ts
export const DOM_EVENTS = {
  // ...existing
  quizProgress: "lgtm-buzzer:quiz-progress",
};

export const QuizProgressEventDetailSchema = z.object({
  requestId: z.string().min(1),
  phase: QuizProgressPhaseSchema, // imported from protocol
  elapsedMs: z.number().int().min(0),
});

export type QuizProgressEventDetail = z.infer<typeof QuizProgressEventDetailSchema>;
```

**`extension` — `dom/quiz-flow.ts` (modifications):**

- `Map<string, string>` `correlationToRequest` added to factory
  closure. Populated in `sendQuizRequest` /
  `sendQuizResampleRequest`; deleted in `handleQuizRequestReply`,
  `handleQuizSubmitReply`, `onQuizCancel`, `onWillNavigate`.
- New handler `onProgressFromSw(payload, correlationId)` resolves
  to `requestId` and emits the DOM event with
  `QuizProgressEventDetailSchema`-shaped detail.
- The CS bridge in `content.ts` calls this handler via a
  callback exposed on `QuizFlowController` (new method
  `onProgressFrame(frame: QuizProgressFrame): void`).

`QuizFlowController` gains:

```ts
readonly onProgressFrame: (frame: QuizProgressFrame) => void;
```

Hardcoded `questionPoolSize: 5` in `sendQuizRequest` and
`sendQuizResampleRequest` is REMOVED. The router merges the stored
value before sending; quiz-flow no longer sets the field.

**`extension` — `dom/modal.ts` (modifications):**

- New listener for `lgtm-buzzer:quiz-progress`.
- In `generating` state: when a progress event arrives:
  - Cancel the cached-median ETA-bar logic (set
    `cachedMedianMs = null` for the current generation; CSS-only
    indeterminate progress takes over via a new class on the
    `<progress>` element).
  - Update the loading-label text to phase copy:
    - `fetching-diff` → "Fetching diff…"
    - `generating-quiz` → "Generating quiz…"
    - `parsing` → "Parsing response…"
    - `caching` → "Almost ready…"
  - Reset a `lastHeartbeatMs` timestamp.
- Tick function (existing 250 ms `setInterval`) gains: when
  `lastHeartbeatMs !== null && now() - lastHeartbeatMs > 10_000`,
  revert to the static spinner copy "Preparing your quiz…" (host
  may have stalled; do not lie to the user about progress).
- On result frame (`quiz-ready` / `error`), `lastHeartbeatMs` is
  cleared.

**`extension` — `options/dom.ts` (modifications):**

- New `<select id="lgtm-pool-size">` under a new "Quiz behavior" `<h2>`.
- Options:
  - `<option value="5">5 — Fastest first quiz, no retry cache</option>`
  - `<option value="10" selected>10 — Balanced (recommended)</option>`
  - `<option value="20">20 — Most retry variety, slower first quiz</option>`
- Wait — the user specified default 5. Use:
  - `<option value="5" selected>5 — Fastest first quiz, no retry cache</option>`
  - `<option value="10">10 — Balanced (recommended)</option>`
  - `<option value="20">20 — Most retry variety, slower first quiz</option>`
- Hydrated from `StoredOptions.questionPoolSize ?? 5`.
- Saved in the existing `saveBtn` handler alongside `llmAdapterId`.

#### File layout

**New:**

- `packages/protocol/src/messages/quiz-progress.ts`
- `packages/protocol/src/messages/quiz-progress.test.ts`
- `packages/host/src/progress-emitter.ts`
- `packages/host/src/progress-emitter.test.ts`
- `packages/extension/src/lib/progress-map.ts`
- `packages/extension/src/lib/progress-map.test.ts`

**Modified:**

- `packages/protocol/src/envelope.ts` — add
  `QuizProgressFrameSchema` to `FrameSchema`.
- `packages/protocol/src/envelope.test.ts` — round-trip test for
  `quiz-progress`.
- `packages/host/src/dispatcher.ts` — call sites for `progress.emit`
  and `progress.startHeartbeat`; new `progress` field on
  `DispatcherDeps`.
- `packages/host/src/dispatcher.test.ts` — assert progress
  emission at phase boundaries; heartbeat during LLM call.
- `packages/host/src/cli.ts` — construct `createProgressEmitter`,
  pass into `createDispatcher`.
- `packages/extension/src/lib/correlation.ts` — add `peekById`;
  relax `PendingRequest.timer` to mutable.
- `packages/extension/src/lib/correlation.test.ts` — cover `peekById`.
- `packages/extension/src/lib/port.ts` — handle `quiz-progress`
  branch; reset timer; accept optional `progressMap` in deps.
- `packages/extension/src/lib/port.test.ts` — assert
  `quiz-progress` does not resolve pending; subscriber called;
  timer re-armed; unknown subscriber logs warn.
- `packages/extension/src/lib/router.ts` — subscribe/unsubscribe
  to `progressMap`; forward via `chrome.tabs.sendMessage`.
- `packages/extension/src/lib/router.test.ts` — assert
  subscribe-on-send, unsubscribe-on-reply, tab forwarding.
- `packages/extension/entrypoints/background.ts` — construct
  `createProgressMap()`, wire into both `createPortClient` and
  `createCSMessageHandler`.
- `packages/extension/entrypoints/content.ts` — `onMessage`
  branch for `kind: "quiz-progress"`; call
  `controller.onProgressFrame(frame)`.
- `packages/extension/src/lib/dom/dom-events.ts` — add
  `quizProgress` event + schema.
- `packages/extension/src/lib/dom/dom-events.test.ts` — schema
  parse coverage.
- `packages/extension/src/lib/dom/quiz-flow.ts` — `correlationToRequest`
  map; `onProgressFrame` controller method; remove hardcoded
  `questionPoolSize: 5`.
- `packages/extension/src/lib/dom/quiz-flow.test.ts` — assert
  progress event emission; assert no `questionPoolSize` in
  outbound payload (router owns it now).
- `packages/extension/src/lib/dom/modal.ts` — phase indicator,
  heartbeat-driven ETA fallback, 10 s silence revert.
- `packages/extension/src/lib/dom/modal.test.ts` — phase text,
  10 s silence revert, indeterminate progress on first
  heartbeat.
- `packages/extension/src/lib/options/schema.ts` — bump to v3,
  add `questionPoolSize`.
- `packages/extension/src/lib/options/schema.test.ts` — assert
  v3 parse; assert v2 read returns `absent`.
- `packages/extension/src/lib/options/storage-reader.ts` — extend
  `SwOptionsProjection` with `questionPoolSize`.
- `packages/extension/src/lib/options/storage-reader.test.ts` —
  cover the new field.
- `packages/extension/src/lib/options/dom.ts` — new dropdown +
  save/hydrate logic.
- `packages/extension/src/lib/options/dom.test.ts` — cover
  hydrate + change + save.
- `packages/extension/src/lib/router.ts` — merge stored
  `questionPoolSize` into `quiz-request` payload (alongside
  existing `llmAdapterId` merge).

#### Sequence

**Heartbeat flow (cache-miss quiz-request, 20-question pool):**

1. CS dispatches `quiz-request` DOM event → controller stores
   `correlationToRequest[correlationId] = requestId`, calls
   `sendFrame(frame)` via `browser.runtime.sendMessage`.
2. SW router receives `send-frame`. Before calling `portClient.sendFrame`,
   it calls
   `progressMap.subscribe(correlationId, (frame) => chrome.tabs.sendMessage(tabId, { kind: "quiz-progress", payload: frame.payload, correlationId }))`.
3. SW forwards merged `quiz-request` frame to host. Host fiber
   begins.
4. Host dispatcher fiber: emits `quiz-progress { phase: "fetching-diff", elapsedMs: 0 }`.
5. SW `onMessage` sees `quiz-progress`. `progressMap.dispatch(frame)`
   calls the subscriber, which calls
   `chrome.tabs.sendMessage(tabId, { kind: "quiz-progress", ... })`.
   `port.ts` also calls `map.peekById(correlationId)` and re-arms
   the timer to `now + 180_000`.
6. CS `onMessage` handler routes `quiz-progress` to
   `controller.onProgressFrame(frame)`. Controller looks up
   `correlationToRequest`, dispatches
   `lgtm-buzzer:quiz-progress` DOM event with
   `{ requestId, phase, elapsedMs }`.
7. Modal listener sees the event. If `state.kind === "generating"`:
   updates label to "Fetching diff…", sets `lastHeartbeatMs = now()`,
   clears `cachedMedianMs` (switching the progress bar to
   indeterminate via CSS).
8. Host calls `vcs.fetchDiff`. ~1 s later, diff returns.
9. Host emits `quiz-progress { phase: "generating-quiz", elapsedMs: ~1000 }`.
   Modal label becomes "Generating quiz…".
10. Host starts heartbeat. Every 5 s during the LLM call:
    `quiz-progress { phase: "generating-quiz", elapsedMs: 6000, 11000, ... }`.
    Each tick resets the SW timer.
11. LLM returns (~60 s). Host stops heartbeat (via `try/finally`).
12. Host emits `quiz-progress { phase: "parsing", elapsedMs: ~60_000 }`.
13. Host emits `quiz-progress { phase: "caching", elapsedMs: ~60_200 }`.
14. Host writes `quiz-response` frame.
15. SW `onMessage` sees `quiz-response` — normal path: pending
    `resolve(frame)`, `progressMap.unsubscribe(correlationId)`.
    Router calls `sendResponse({ kind: "frame", frame })`.
16. CS resolves `sendFrame` promise. Quiz flow proceeds with
    `quiz-ready` outcome. Modal transitions `generating → ready`.

**Pool-size flow:**

1. User opens options page, picks "20 — Most retry variety…".
2. Save → `store.write({ schemaVersion: 3, llmAdapterId: "claude-cli", questionPoolSize: 20 })`.
3. User goes back to a PR, clicks Approve. CS sends
   `quiz-request { questionCount: 5 }` (no `questionPoolSize`).
4. SW router reads stored options. Projection returns
   `{ llmAdapterId: "claude-cli", questionPoolSize: 20 }`. Merges
   both into the outbound payload.
5. Host receives `quiz-request { questionCount: 5, questionPoolSize: 20, ... }`.
   Generates a 20-question pool, samples 5, replies.
6. Subsequent "Try Again" → `quiz-resample-request` samples from
   the cached 20-question pool. User sees variety.

#### Error cases

**Heartbeat:**

- **Host write fails mid-heartbeat.** `progress-emitter.emit`'s
  `safeWrite` logs a warning, swallows the `WriteError`. The fiber
  keeps running. The next heartbeat tick may succeed (transient
  stdout pressure) or fail (broken pipe). Either way, the fiber's
  terminal frame write is what determines request success.
- **Heartbeat timer leaks on dispatcher panic.** Guarded by
  `try/finally` around the heartbeat span. Reviewer asserts via a
  test that throws inside the `IO.lift` body and verifies
  `clearInterval` was called.
- **Heartbeat arrives after terminal reply.** Race: a heartbeat is
  in `setInterval`'s queue when the LLM resolves and the dispatcher
  writes `quiz-response`. The SW removes the entry from
  `CorrelationMap` on the response, but `ProgressMap` still holds
  a subscriber. Router unsubscribes on the response in the same
  tick — late heartbeats find no subscriber, `dispatch` returns
  `false`, `port.ts` logs warn. Benign.
- **Heartbeat with unknown `correlationId`.** `progressMap.dispatch`
  returns `false`, `port.ts` logs warn. Treated identically to
  unknown-correlation replies today.
- **Old host + new SW.** Host emits nothing; SW never sees
  heartbeats; modal falls back to static spinner + cached-median
  ETA — equivalent to today's behavior. No regression.
- **New host + old SW.** Old SW (`port.ts` without the
  `quiz-progress` branch) has updated `FrameSchema` (the schema is
  monorepo-shared), so the frame parses, but the SW falls through
  to "unknown correlationId" or "this isn't a kind I handle" and
  drops with a warn. The SW's 180 s timeout still fires for the
  request, so the host's terminal reply will be processed
  normally — heartbeats are wasted but harmless. To avoid the warn
  spam, the v3 SW explicitly recognises `quiz-progress` even when
  `progressMap` is undefined (drop silently).
- **CS tab closed mid-quiz.** `chrome.tabs.sendMessage` rejects.
  Wrap in try/catch; log warn; the heartbeat sub stays registered
  (the SW does not know the tab is gone). Cleaned up on terminal
  reply or SW timeout.

**Storage:**

- **Stored `questionPoolSize` is not 5/10/20.** Zod literal union
  rejects → schema parse fails → `Left<corrupt>` → DOM layer shows
  banner and treats as defaults. SW projection returns `undefined`.
  Host treats absent field as legacy (no pool).
- **v2 storage still present.** v3 read against v2 key returns
  `Left<absent>` (different `STORAGE_KEY`). DOM treats as
  first-run defaults. v2 leftover is benign storage clutter.

**No new error reasons.** `ErrorReason` enum unchanged. Heartbeat
failures stay below the wire as logger warnings.

#### Test strategy

**Unit / contract (Vitest):**

- `protocol/src/messages/quiz-progress.test.ts`:
  - Round-trip parse for each phase value.
  - Reject negative `elapsedMs`.
  - Reject unknown phases.
  - Confirm extra fields are stripped (or rejected) — assert the
    diff-only invariant.
- `protocol/src/envelope.test.ts`:
  - `FrameSchema` parses a valid `quiz-progress` frame.
  - `quiz-progress` is part of the discriminated union (TS-level).
- `host/src/progress-emitter.test.ts`:
  - `emit` writes a single well-formed frame via injected `write` fake.
  - `startHeartbeat` writes immediately + on each fake timer tick.
  - Stop function clears the interval (no further writes after stop).
  - Write failure does NOT throw; warning logged.
- `host/src/dispatcher.test.ts` (modifications):
  - Pool path emits all four phase frames in order.
  - Heartbeat ticks emitted during `llm.generateQuiz` (use a
    delayed fake LLM and a controllable clock).
  - Cancellation path clears the heartbeat (assert via the spy on
    `clearInterval` or by counting `write` calls after cancel).
  - `try/finally` guarantee: an LLM error stops the heartbeat
    before the error frame is written.
- `extension/src/lib/progress-map.test.ts`:
  - `subscribe` + `dispatch` invokes the subscriber.
  - `unsubscribe` drops the subscriber; subsequent `dispatch`
    returns `false`.
  - Duplicate subscribe replaces the prior subscriber (or throws —
    pick one; the host invariant test will dictate which).
- `extension/src/lib/correlation.test.ts`:
  - `peekById` returns the entry without removing it.
- `extension/src/lib/port.test.ts`:
  - `quiz-progress` calls subscriber, does NOT resolve pending.
  - `quiz-progress` re-arms the pending request's timer.
  - `quiz-progress` with unknown subscriber logs warn (silent
    drop, no error).
- `extension/src/lib/router.test.ts`:
  - On `send-frame quiz-request`, router calls
    `progressMap.subscribe(correlationId, …)` BEFORE
    `portClient.sendFrame`.
  - On reply, router calls `progressMap.unsubscribe(correlationId)`.
  - On send error, router still unsubscribes (no leaks).
  - Router merges stored `questionPoolSize` into the outbound
    payload; legacy storage without the field omits it.
- `extension/src/lib/dom/quiz-flow.test.ts`:
  - `onProgressFrame` dispatches a `lgtm-buzzer:quiz-progress` DOM
    event with the right `requestId`.
  - `correlationToRequest` is cleared on terminal reply, cancel,
    navigation.
  - Outbound `quiz-request` frame does NOT carry
    `questionPoolSize` (router owns it).
- `extension/src/lib/dom/modal.test.ts`:
  - On `quiz-progress` in `generating` state, label updates to
    phase copy.
  - First heartbeat clears `cachedMedianMs` and switches the
    progress bar to indeterminate.
  - After 10 s of no heartbeat, label reverts to static.
  - Heartbeat in non-generating state is a no-op (ignored).
- `extension/src/lib/options/schema.test.ts`:
  - v3 envelope parses with literal 5/10/20.
  - v3 envelope rejects `questionPoolSize: 7`.
  - v3 envelope parses without the field (optional).
- `extension/src/lib/options/storage-reader.test.ts`:
  - Projection returns `questionPoolSize` when present.
  - Projection returns `undefined` on absent / corrupt.
- `extension/src/lib/options/dom.test.ts`:
  - Dropdown hydrates from stored value.
  - Default-5 selection when storage absent.
  - Save writes the selected value.

**Contract (cross-workspace):**

- A new test in `packages/host/src/dispatcher.test.ts` that runs
  the full quiz-request fiber against a real `FrameWriter` stub
  and asserts the frame log matches a golden sequence:
  `[fetching-diff, generating-quiz, ...heartbeats..., parsing,
  caching, quiz-response]`.

**End-to-end (Playwright):**

- Existing happy-path e2e remains unchanged — it doesn't exercise
  long-running generation. A follow-up issue (not part of #125)
  may add a slow-LLM stub scenario to validate the modal's phase
  indicator end-to-end.

**Manual verification fallback:**

- Real LLM call timing (60–90 s for 20-question pool) cannot be
  unit-tested. Reviewer runs the build against a real PR and
  visually confirms the phase indicator advances and the modal
  does not time out.

### Consequences

**Trade-offs:**

- **Two maps in the SW.** `CorrelationMap` and `ProgressMap` carry
  parallel entries for the same correlationId during an in-flight
  quiz. The maps are added/removed in lock-step by the router, so
  drift is bounded to "subscriber outlives pending" or vice versa —
  both handled gracefully (warn + drop).
- **Timer extension on every heartbeat.** A misbehaving host could
  hold a connection indefinitely by emitting heartbeats forever.
  Mitigation: SW timeout extension is bounded — each heartbeat
  resets to the same `timeoutMs` (180 s), and the host's per-LLM
  timeout (180 s in `spawnIO` for CLI adapters) caps the actual
  subprocess lifetime. A heartbeat-forever attacker would also
  hold a CLI process forever, which spawnIO bounds independently.
- **Storage version bump to v3.** Users with v2 storage see
  defaults on first load after upgrade and must re-save their
  `llmAdapterId`. Mitigated by keeping defaults sane (host falls
  back to claude-cli). Documented in release notes.
- **Modal's static spinner stays as a fallback.** When no
  heartbeat arrives for 10 s the modal reverts to the
  pre-ADR-32 UI. This is intentional — heartbeat is a
  best-effort signal, not a contract.

**Future implications:**

- A future ADR may add `expectedMs` based on a host-side heuristic
  (diff size → estimated generation time). The field exists in the
  schema already; the modal would consume it to draw a determinate
  bar even without historical samples. Out of scope for v1.
- A future ADR may add `quiz-cancel` (#96) — when implemented,
  cancelling a heartbeat-bearing request must also tear down the
  heartbeat. The `try/finally` guard already handles this on the
  host side.
- A future ADR may move the progress map's correlationId →
  requestId resolution into the SW (so the CS doesn't need its
  own map). For v1, keeping the resolution in the CS avoids
  changing the existing CS → SW protocol shape.

**Security considerations:**

- Heartbeat frames carry NO diff-derived content. Schema enforces
  the surface. Reviewer asserts via the schema test and by
  grepping the host's `progress.emit` call sites for diff-typed
  arguments.
- `questionPoolSize` is a scalar number; not an LLM prompt input.
  Diff-only invariant preserved.
- Per-tab CS forwarding: `chrome.tabs.sendMessage` targets the
  tab that originated the quiz-request (the router already tracks
  `tabId` via `CorrelationMap.PendingRequest.tabId`). A heartbeat
  for tab A is never sent to tab B.

**Binding for reviewer:**

- (a) `QuizProgressPayloadSchema` MUST NOT include any field that
  could carry PR text or diff content. The four-field surface
  (`phase`, `elapsedMs`, `expectedMs`) is fixed. Reviewer
  asserts by code inspection of the schema file.
- (b) `progress-emitter.ts` MUST NOT accept any diff-typed
  parameter. Reviewer asserts by reading the emitter signature.
- (c) Heartbeat MUST be cleared on success, error, AND
  cancellation. Reviewer asserts via the dispatcher test that
  forces cancellation mid-heartbeat and counts post-cancel write
  calls (should be zero).
- (d) `quiz-progress` MUST NOT resolve the pending request's
  `Promise`. Reviewer asserts via `port.test.ts`.
- (e) `quiz-progress` MUST re-arm the pending request's timer.
  Reviewer asserts via `port.test.ts`.
- (f) `questionPoolSize` in storage MUST be the literal union
  `5 | 10 | 20`. Reviewer asserts via `schema.test.ts`.
- (g) `quiz-flow.ts` MUST NOT hardcode `questionPoolSize`.
  Reviewer asserts by grepping the file for the field name —
  should only appear in router (merge) and dom-events / schema
  (types).
- (h) `chrome.tabs.sendMessage` heartbeat forwarding MUST use
  the `tabId` from the original `quiz-request`. Reviewer asserts
  via `router.test.ts`.

---
