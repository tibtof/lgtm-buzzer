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

