# @lgtm-buzzer/extension

MV3 browser extension that gates the PR approve button behind a quiz (LGTM-Buzzer).

## Options page

The options page (`entrypoints/options/`) lets the user select their LLM and VCS adapter pair and supply any required credentials (e.g., GitHub PAT, Anthropic API key).

### Storage posture

Credentials are stored in **plaintext** in `chrome.storage.local` under the key `lgtm_buzzer.options.v1`. This is a v1 limitation; a future ADR will explore OS-keychain integration for secure credential storage.

The storage schema is validated with zod on every read. Corrupt storage yields a user-visible warning and falls back to defaults.

### Files

- `entrypoints/options/index.html` — options page HTML shell
- `entrypoints/options/main.ts` — entry point; constructs dependencies and mounts the view
- `src/lib/options/` — storage schema, store, SW projection, SW bridge, probe, adapter-creds spec, DOM view

### monadyssey usage

The options storage layer (`src/lib/options/storage.ts`) uses `Either<StorageError, T>` from `monadyssey` for typed failure paths (absent / corrupt / io). This is the first use of `monadyssey` in the extension workspace; it is scoped to the options storage boundary and documented here per CLAUDE.md §Dependency rules.

### References

- [ADR-22](../../decisions.md#adr-22) — host-side adapter registry and wire format
- [ADR-23](../../decisions.md#adr-23) — this options page

### Planned future ADR

OS-keychain integration (e.g., macOS Keychain, SecretService on Linux) for encrypted credential storage. The `StorageArea` port in `storage.ts` is the injection point — swapping the backend requires no changes to the domain logic.

## Quiz modal (ADR-24)

### Accessibility commitments (WCAG AA)

The quiz modal (`src/lib/dom/modal.ts`) meets WCAG 2.1 Level AA:

- `role="dialog"` + `aria-modal="true"` on the backdrop.
- `aria-labelledby` pointing to the modal `<h2>` heading.
- Focus trap (`src/lib/dom/focus-trap.ts`): Tab / Shift+Tab confined to modal panel; focus restored on close.
- `aria-live="polite"` region announces every state transition to screen readers.
- `<fieldset>` + `<legend>` per question (replaces bespoke `role="radiogroup"`).
- `aria-busy="true"` on the panel during `generating` and `submitting` states.
- Esc closes in all non-idle states; in `passed` state Esc dismisses without
  emitting `quiz-cancel` (the approval is already through).
- Animations (`lgtm-fadein`, `lgtm-spin`, skeleton pulse) are wrapped in
  `@media (prefers-reduced-motion: no-preference)`.

WCAG AAA is aspirational and may motivate a follow-up issue.

### Cancel during generation (Option A limitation)

When the user clicks Cancel while the modal is in `generating` state, the modal
emits `quiz-cancel` and drops local pending state. The native host continues
generating and the eventual reply is discarded by the CS. This wastes LLM cycles.

**Follow-up**: Issue #96 tracks Option B — adding a `quiz-cancel-request` wire
frame so the host can abort the in-flight fiber and stop billing LLM tokens.

### Error UX

Each wire-level `ErrorReason` and each extension-internal transport failure maps
to a `DisplayErrorClass` in `src/lib/dom/error-classes.ts`, which in turn maps
to a (title, body, CTA) `ErrorUISpec`. CTAs are:

- `retry` — emits `quiz-retry`; CS re-fetches the quiz.
- `open-options` — opens the options page so the user can fix credentials.
- `install-host` — opens the project README install section in a new tab.
- `dismiss` — closes the modal.
