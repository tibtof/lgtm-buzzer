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
