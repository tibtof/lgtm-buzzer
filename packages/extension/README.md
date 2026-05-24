# @lgtm-buzzer/extension

MV3 browser extension that gates the PR approve button behind a quiz (LGTM-Buzzer).

## Options page

The options page (`entrypoints/options/`) lets the user select their LLM adapter and view the per-adapter authentication status resolved by the host.

### Storage posture (ADR-29)

`chrome.storage.local` stores **only** the LLM adapter ID preference under the key `lgtm_buzzer.options.v2`. There are no credentials in extension storage — zero.

- The old v1 key (`lgtm_buzzer.options.v1`) is silently abandoned on upgrade. To remove it from DevTools: `chrome.storage.local.remove("lgtm_buzzer.options.v1")`.
- The VCS adapter is no longer a stored preference; it is auto-selected from `pr.kind` at quiz-request time by the SW router.
- Credentials are resolved host-side by `CredentialResolver` (see `packages/host/src/credentials/`). The extension never reads, stores, or transmits credential values.

The storage schema is validated with zod on every read. Corrupt storage yields a user-visible warning and falls back to defaults.

### Authentication status panel

The options page shows a per-adapter auth status panel populated by a `check-auth-request` / `check-auth-response` round-trip to the host. Each row shows whether the host could resolve credentials for that adapter, with a human-readable `detail` (success) or `hint` (failure). The panel has a Refresh button.

Before installing the extension, make sure `gh auth login` succeeds on the host machine if you intend to use the GitHub VCS adapter.

### Files

- `entrypoints/options/index.html` — options page HTML shell
- `entrypoints/options/main.ts` — entry point; constructs dependencies and mounts the view
- `src/lib/options/` — storage schema (v2), store, SW projection, SW bridge, probe, auth-status, DOM view

### monadyssey usage

The options storage layer (`src/lib/options/storage.ts`) uses `Either<StorageError, T>` from `monadyssey` for typed failure paths (absent / corrupt / io). This is the first use of `monadyssey` in the extension workspace; it is scoped to the options storage boundary and documented here per CLAUDE.md §Dependency rules.

### References

- [ADR-22](../../decisions.md#adr-22) — host-side adapter registry and wire format
- [ADR-23](../../decisions.md#adr-23) — this options page
- [ADR-29](../../decisions.md#adr-29) — host-resolved credentials + check-auth wire frame

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
