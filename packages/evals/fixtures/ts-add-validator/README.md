# Fixture: ts-add-validator

Adds a new `validateEmail` pure function to a TypeScript project. The function
returns an `Either<EmailValidationError, string>` and applies three validation
rules: empty check, length check against `MAX_EMAIL_LENGTH` (254), and regex
format check. On success it normalises the email to lowercase.

This is the baseline happy-path fixture: a clean, self-contained addition with
tests. A quality quiz must reference the specific error kinds (`empty`,
`too-long`, `format`), the 254-char limit, and the lowercase normalisation step.
