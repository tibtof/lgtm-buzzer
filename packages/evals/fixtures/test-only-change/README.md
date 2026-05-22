# Fixture: test-only-change

Adds five new test cases to `csv-parser.test.ts` covering edge cases of the
existing `parseCsv` function: CRLF line endings, trailing newline, empty input,
quoted fields with embedded commas, and header-only files. No source file is
modified.

This fixture tests whether the LLM hallucinates source changes when only tests
were added. A quality quiz should reference the specific edge cases (CRLF,
quoted commas, etc.) and note that the source function itself was not changed.
