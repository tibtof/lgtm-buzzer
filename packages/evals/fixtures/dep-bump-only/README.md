# Fixture: dep-bump-only

A pure dependency version bump: `zod` from `^3.22.4` to `^4.0.0` in
`package.json` and corresponding `package-lock.json` lockfile update.

This is an edge case: almost no semantic content in the diff. The quiz should
still reference the specific library and version numbers, and at least one
question should note that this is a major-version bump (v3 → v4) which may
introduce breaking changes. A quiz that fails to mention any of these specifics
would score poorly on the Relevance axis.
