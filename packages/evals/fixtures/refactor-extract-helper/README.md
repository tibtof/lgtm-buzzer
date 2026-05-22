# Fixture: refactor-extract-helper

Extracts a date-formatting inline block from `report-generator.ts` into a new
`formatDate` function in `src/format/format-date.ts`. The behaviour is
unchanged: the function formats a `Date` as `YYYY-MM-DD` in local time.
`generateReport` now calls `formatDate(report.createdAt)` instead of the
inline three-line implementation.

This is the "no behaviour change" trap for shallow LLMs. A quality quiz must
assert that the output format is unchanged, probe the rationale (reuse), and
possibly ask what would break if a caller passed a UTC date (implicit time-zone
sensitivity).
