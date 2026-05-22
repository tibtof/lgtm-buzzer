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

