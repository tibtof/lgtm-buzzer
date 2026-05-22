# Fixture: ts-rename-symbol

A rename-only change: `gateReview` → `assessReview` and `checkApproval` →
`evaluateApproval` across four files (domain module, helper, host dispatcher,
dispatcher test). No behaviour change; purely mechanical rename.

This fixture detects whether the LLM can track a cross-file rename and ask
about the scope of the change. A shallow quiz might only mention the new name
without noting how many call sites changed.
