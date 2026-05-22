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
