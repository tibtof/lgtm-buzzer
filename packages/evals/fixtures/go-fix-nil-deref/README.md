# Fixture: go-fix-nil-deref

A minimal Go bug fix: adds a nil-pointer guard before returning a `*User` value
from `GetByID`. The guard returns the `ErrUserNotFound` sentinel. The error
message string is also updated from `"user not found"` to
`"store: user not found"` to follow Go error-prefix conventions. Two tests are
added.

This is a minimal-diff edge-case probe. The quiz should reference the specific
function (`GetByID`), the guard condition, the sentinel error, and the message
change.
