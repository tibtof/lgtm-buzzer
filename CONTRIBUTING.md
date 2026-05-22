# Contributing to LGTM-Buzzer

The canonical contributor doc is [`CLAUDE.md`](./CLAUDE.md). Read it before
opening a PR — it covers the architecture, dependency rules, FP idioms, code
style, and the agent pipeline that governs all changes.

## Short orientation

**Bug reports and feature requests**: open a GitHub issue. The PM agent will
triage, write a structured spec, and move the issue to `READY_FOR_ARCH`. The
architect agent writes an ADR to `decisions.md`. The dev agent implements. The
reviewer agent gates the PR before human review.

**Architecture decisions**: all significant design choices live in
`decisions.md` as numbered ADRs. Do not relitigate locked decisions (see the
table in `CLAUDE.md`). New deps in `core` or `protocol` require an ADR.

**Branch naming**: `feat/<issue-number>-<short-slug>` or
`fix/<issue-number>-<short-slug>`.

**Commit style**: conventional commits — `feat(scope):`, `fix(scope):`,
`chore(scope):`, `docs(scope):`, etc. Scope is the workspace name when it
makes the diff clearer (`core`, `adapters/github`, `extension`, `host`).

**Gate**: all PRs must pass `npm run check` (build + test + lint +
typecheck:tests) before review. No exceptions.

**Dependency direction** (hard rule):

```
protocol  <- core  <- adapters  <- host
protocol  <- core  <- extension
```

`core` must never import from `adapters`, `host`, or `extension`. `protocol`
must never import from any other workspace. ESLint enforces this on every push.

## License

By contributing you agree that your changes are licensed under MIT, the same
license as the rest of the project.
