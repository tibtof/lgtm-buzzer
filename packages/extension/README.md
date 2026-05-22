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
