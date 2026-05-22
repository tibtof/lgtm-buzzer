# LGTM-Buzzer e2e Suite

End-to-end tests for the browser extension. Runs against the real unpacked MV3
extension loaded into headless-false Chromium. The native messaging host is
replaced by a scenario-parameterised SW stub; no real LLM, host binary, or
network egress is involved.

## Quick start

```bash
# 1. Build the extension (required before every e2e run).
npm run build --workspace=@lgtm-buzzer/extension

# 2. Install Playwright's Chromium (once per machine / CI container).
npm run test:e2e:install --workspace=@lgtm-buzzer/extension

# 3. Run the suite.
npm run test:e2e --workspace=@lgtm-buzzer/extension
```

## Why `headless: false`

Chrome does **not** expose MV3 extension service workers to the Chrome DevTools
Protocol in headless mode. `context.waitForEvent("serviceworker")` times out
unconditionally with `headless: true` or `headless: "new"`. Every spec therefore
uses `headless: false`. On Linux CI, wrap the command with `xvfb-run`:

```bash
xvfb-run --auto-servernum --server-args="-screen 0 1280x720x24" \
  npm run test:e2e --workspace=@lgtm-buzzer/extension
```

CI wiring is tracked in issue #54.

## `--load-extension` constraint

Playwright's `launchPersistentContext` is the only way to load an unpacked MV3
extension. The `launchExtensionContext` helper in `helpers/context.ts` handles
this transparently; specs call `launchExtensionContext({ scenario })` and receive
a `{ context, sw, extensionId, cleanup }` object.

## SW-stub scenario API

The SW stub replaces `chrome.runtime.connectNative` inside the service worker
context. Six scenarios are supported (defined in `helpers/sw-stub.ts`):

| Kind | What it does |
|---|---|
| `happy` | quiz-request → quiz-response; quiz-submit → scored result |
| `wrong-then-right` | First submit always fails; second is scored |
| `error-on-quiz-request` | quiz-request → ErrorFrame with the given reason |
| `list-adapters` | list-adapters-request → list; other frames → error |
| `list-adapters-then-happy` | list-adapters + full quiz flow |
| `probe-bad-credentials` | list-adapters → ok; ping → bad-credentials error |

Choose a scenario by passing it to `launchExtensionContext`:

```ts
const { context, sw, extensionId, cleanup } = await launchExtensionContext({
  scenario: { kind: "happy", quiz: CANONICAL_QUIZ, correctAnswers: CANONICAL_CORRECT },
});
```

## Page-object pattern

All specs access the extension DOM through page objects. Never use raw
`data-testid` selectors in `*.spec.ts` files.

| Page object | File | Purpose |
|---|---|---|
| `PRPage` | `pages/pr-page.ts` | GitHub and ADO PR fixture pages |
| `QuizModal` | `pages/quiz-modal.ts` | Shadow-DOM quiz modal |
| `OptionsPage` | `pages/options-page.ts` | WXT options page |

## Fixtures

- `fixtures/github-pr.html` — Minimal GitHub PR approve form (ADR-19 §4).
- `fixtures/ado-pr.html` — Minimal ADO vote button (ADR-21 §KNOWN_ADO_VOTE_TESTIDS).

Fixtures are served via `page.route(url, route.fulfill(...))`. No real network
calls to `github.com` or `dev.azure.com` are made.

## `npm run build` prerequisite

`assertBuiltExtension()` (called by `launchExtensionContext`) fails fast with a
clear message if `.output/chrome-mv3/` is missing. Always build before running
the suite.

## Spec inventory

| File | Cases | Purpose |
|---|---|---|
| `happy-path.spec.ts` | 1 | Full quiz gate + replay assertion |
| `failure-retry.spec.ts` | 2 | Wrong answers → failed → retry → pass; partial submit disabled |
| `error-paths.spec.ts` | 6 | Data-driven error classes (title, CTA) |
| `options-page.spec.ts` | 4 | Adapter listing, persistence, probe success, probe bad-creds |
| `accessibility.spec.ts` | 3 | Focus trap, Esc dismiss, ARIA contract |
| `ado-intercept.spec.ts` | 2 | ADO vote intercept + replay |

Total: 18 cases.
