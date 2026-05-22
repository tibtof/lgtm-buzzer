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
