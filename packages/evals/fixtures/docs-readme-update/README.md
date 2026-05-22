# Fixture: docs-readme-update (NEGATIVE CONTROL)

A pure README reword: title, description, section heading, and licence
paragraph are all rephrased. No code changed.

This is the negative-control fixture. Per the `SYSTEM_PROMPT`, the LLM should
respond with `{ "questions": [] }` for diffs with insufficient semantic content.
The `parseQuizFromText` pipeline surfaces this as
`malformed-response { detail: "empty-quiz" }`.

The eval for this fixture is in `promptfoo.empty-quiz.config.yaml` (not the
main config) and asserts `errKind === "malformed-response"` instead of a valid
quiz. A pass on this fixture means the adapter correctly declines to generate
a quiz from a docs-only diff.
