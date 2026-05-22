/**
 * ADO vote-button interception — capture-phase click listener with a
 * three-tier defensive selector strategy.
 *
 * ## Selector strategy (tried in order, first match wins)
 *
 * 1. **`data-testid` / `data-test` (most stable).**
 *    `target.closest("[data-testid]")` or `target.closest("[data-test]")` whose
 *    attribute value matches one of the `KNOWN_ADO_VOTE_TESTIDS` entries, or any
 *    overrides provided via `AdoVoteSelectorOverrides.testIds`. ADO uses `data-*`
 *    test hooks; these survive most visual redesigns.
 *
 * 2. **`aria-label` (stable across visual redesigns).**
 *    `target.closest("[aria-label]")` whose `aria-label` (lowercased, trimmed)
 *    starts with `"approve"`. Catches both `"Approve"` and `"Approve with
 *    suggestions"`. Wait-for-author / Reject are excluded by the prefix check.
 *
 * 3. **Text content (last-resort, English-only in v1).**
 *    `target.closest("button, [role='menuitem']")` whose `textContent` (trimmed,
 *    lowercased) equals `"approve"` or `"approve with suggestions"`. ADO's UI
 *    language follows the user's ADO profile, NOT the browser locale — non-English
 *    deployments fall through this layer and Approve proceeds without a quiz
 *    (fail-open, documented in ADR-21 §10).
 *
 * ## Diff-only invariant
 *
 * This file reads ONLY:
 * - `window.location.href` (via `getCurrentPR()` callback).
 * - The click target and its ancestors' `data-testid`, `data-test`, `aria-label`
 *   attributes, and `textContent`.
 *
 * It MUST NOT read any element under PR-content containers
 * (`.repos-pr-overview-*`, `.repos-discussion-*`, `.repos-file-list-*`,
 * `.bolt-table`, or any other PR-detail container). Reviewer grep gate enforces
 * this (ADR-21 §9).
 *
 * ## Bypass flag
 *
 * The module-scoped `approveBypass` flag lives in `quiz-flow.ts` and is consumed
 * here via the `shouldBypass()` deps callback. Module scope, not `window`, for
 * the same security reason as ADR-18 §Decision 4.
 */

import type { PRIdentifier } from "@lgtm-buzzer/core";

/**
 * The two variants of the ADO Approve vote action.
 *
 * `"approve"` — straight Approve.
 * `"approve-with-suggestions"` — Approve with suggestions (also an approval).
 *
 * The variant is forwarded into `AdoInterceptedApproveEvent` for logging only.
 * It is NOT forwarded to the host (the host always receives the same quiz-request
 * regardless of variant — diff-only invariant).
 */
export type AdoVoteVariant = "approve" | "approve-with-suggestions";

/**
 * Optional overrides that extend (not replace) the built-in selector defaults.
 *
 * In v1 the override list is hard-coded `undefined` at the CS entrypoint. This
 * type is the typed integration target for the #50 options page — no refactor
 * needed when user-facing selector settings land.
 */
export type AdoVoteSelectorOverrides = {
  /** Additional `data-testid` / `data-test` values to recognise as Approve. */
  readonly testIds?: ReadonlyArray<string>;
  /** Additional aria-label prefix strings (lowercased) to recognise as Approve. */
  readonly ariaLabelPrefixes?: ReadonlyArray<string>;
  /** Additional exact textContent strings (lowercased, trimmed) to recognise as Approve. */
  readonly textContents?: ReadonlyArray<string>;
};

/**
 * The payload passed to `onBlocked` when an ADO Approve click is intercepted.
 *
 * Mirrors the GitHub `ApproveBlockedEvent` shape but uses `element` + `variant`
 * instead of `form` + `submitter` because ADO has no form submit — the replay
 * path calls `element.click()`.
 */
export type AdoInterceptedApproveEvent = {
  /** Discriminator that drives the replay branch in `quiz-flow.ts`. */
  readonly kind: "ado";
  /** The Approve button element. Replayed via `element.click()` on quiz pass. */
  readonly element: HTMLElement;
  /** Which variant of Approve was clicked. */
  readonly variant: AdoVoteVariant;
  /** The parsed ADO PR identifier derived from `window.location.href`. */
  readonly pr: PRIdentifier & { readonly kind: "ado" };
};

/**
 * Dependencies for `setupAdoVoteInterceptor`.
 *
 * All DOM-touching fields are injected so that tests can supply a jsdom
 * document without a real browser.
 */
export type AdoVoteInterceptorDeps = {
  /** The document to attach the capture-phase click listener to. */
  readonly doc: Document;
  /**
   * Returns the current `PRIdentifier` (from the latest `detectPRPage` call),
   * or `null` if the current page is not a PR page.
   */
  readonly getCurrentPR: () => PRIdentifier | null;
  /**
   * Returns `true` when the bypass flag is set, indicating the interceptor
   * should allow the current click through without calling `preventDefault`.
   * The consumer (quiz-flow) resets the flag inside this callback.
   */
  readonly shouldBypass: () => boolean;
  /**
   * Invoked when an Approve click is intercepted. The controller uses this
   * to initiate the quiz round-trip and store the pending click.
   */
  readonly onBlocked: (e: AdoInterceptedApproveEvent) => void;
  /** Optional selector overrides (see `AdoVoteSelectorOverrides`). */
  readonly overrides?: AdoVoteSelectorOverrides;
  /** Optional structured logger for diagnostic warnings (fail-open path). */
  readonly logger?: { readonly warn: (msg: string, ctx?: Record<string, unknown>) => void };
};

/**
 * Known ADO `data-testid` / `data-test` values that identify an Approve vote
 * button at the time of writing.
 *
 * Keep this list accurate by verifying against a real ADO instance. Add new
 * values here before they supersede old ones in production so the extension
 * stays gated across ADO UI rollouts.
 *
 * If none of these match (ADO ships a new test-id), the aria-label and
 * textContent layers still cover most cases. The dev SHOULD update this
 * constant after smoke-testing against a live ADO org.
 */
export const KNOWN_ADO_VOTE_TESTIDS: ReadonlyArray<string> = [
  "complete-vote-button",
];

/**
 * Recognises whether the click target (or one of its ancestors) is an ADO
 * Approve vote button.
 *
 * Returns `{ variant, element }` on a match, or `null` if the target is not
 * an Approve button (e.g. Reject, Wait-for-author, or unrelated click).
 *
 * Exported for unit tests only — production code uses `setupAdoVoteInterceptor`.
 *
 * @param target - The `event.target` from a click event.
 * @param overrides - Optional selector overrides.
 */
export const recognizeAdoVoteClick = (
  target: EventTarget | null,
  overrides?: AdoVoteSelectorOverrides,
): { variant: AdoVoteVariant; element: HTMLElement } | null => {
  if (!(target instanceof Element)) return null;

  // -----------------------------------------------------------------------
  // Layer 1: data-testid / data-test (most stable)
  // -----------------------------------------------------------------------
  const allTestIds = [
    ...KNOWN_ADO_VOTE_TESTIDS,
    ...(overrides?.testIds ?? []),
  ];

  for (const attr of ["data-testid", "data-test"] as const) {
    const el = target.closest(`[${attr}]`);
    if (el instanceof HTMLElement) {
      const val = (el.getAttribute(attr) ?? "").toLowerCase().trim();
      for (const testId of allTestIds) {
        if (val === testId.toLowerCase()) {
          // Determine variant from the testid value.
          const variant: AdoVoteVariant =
            val.includes("suggestion") ? "approve-with-suggestions" : "approve";
          return { variant, element: el };
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Layer 2: aria-label (stable across visual redesigns)
  // -----------------------------------------------------------------------
  const allAriaLabelPrefixes = [
    "approve",
    ...(overrides?.ariaLabelPrefixes ?? []),
  ];

  const ariaEl = target.closest("[aria-label]");
  if (ariaEl instanceof HTMLElement) {
    const ariaLabel = (ariaEl.getAttribute("aria-label") ?? "").toLowerCase().trim();
    for (const prefix of allAriaLabelPrefixes) {
      if (ariaLabel.startsWith(prefix.toLowerCase())) {
        const variant: AdoVoteVariant =
          ariaLabel.includes("suggestion") ? "approve-with-suggestions" : "approve";
        return { variant, element: ariaEl };
      }
    }
  }

  // -----------------------------------------------------------------------
  // Layer 3: textContent (last-resort, English-only v1)
  // -----------------------------------------------------------------------
  const defaultTextContents: ReadonlyArray<string> = [
    "approve",
    "approve with suggestions",
  ];
  const allTextContents = [
    ...defaultTextContents,
    ...(overrides?.textContents ?? []),
  ];

  const textEl = target.closest("button, [role='menuitem']");
  if (textEl instanceof HTMLElement) {
    const text = (textEl.textContent ?? "").toLowerCase().trim();
    for (const tc of allTextContents) {
      if (text === tc.toLowerCase()) {
        const variant: AdoVoteVariant =
          tc.toLowerCase().includes("suggestion") ? "approve-with-suggestions" : "approve";
        return { variant, element: textEl };
      }
    }
  }

  return null;
};

/**
 * Attaches a capture-phase `click` listener to `deps.doc` that intercepts
 * ADO PR Approve vote button clicks.
 *
 * Intercept logic (per ADR-21 §4):
 * 1. `event.target` must be an `Element`.
 * 2. `recognizeAdoVoteClick(target)` must return a non-null match.
 * 3. `getCurrentPR()` must return a non-null `PRIdentifier` with `kind === "ado"`.
 * 4. `shouldBypass()` true → allow through (bypass flag set after quiz pass).
 * 5. Else: `preventDefault()` + `stopPropagation()` + `stopImmediatePropagation()`,
 *    call `onBlocked`.
 *
 * `stopImmediatePropagation` is ADO-specific: ADO's SPA framework binds its
 * handlers in capture phase as well in some deployments, so we must prevent any
 * other capture-phase listener from running after ours (ADR-21 §4).
 *
 * @param deps - Injected dependencies.
 * @returns A dispose function that removes the listener from `deps.doc`.
 */
export const setupAdoVoteInterceptor = (deps: AdoVoteInterceptorDeps): (() => void) => {
  const { doc, getCurrentPR, shouldBypass, onBlocked, overrides, logger } = deps;

  const handler = (event: Event): void => {
    // 1. Target must be an Element.
    if (!(event.target instanceof Element)) return;

    // 2. Recognise the Approve button via three-tier strategy.
    const match = recognizeAdoVoteClick(event.target, overrides);
    if (match === null) return;

    // 3. Require a current ADO PR context.
    const pr = getCurrentPR();
    if (pr === null) return;
    if (pr.kind !== "ado") return;

    // 4. If bypass flag is set let the click proceed (replay after quiz pass).
    if (shouldBypass()) return;

    // 5. Block the click and hand off to the quiz flow controller.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    void logger;

    onBlocked({
      kind: "ado",
      element: match.element,
      variant: match.variant,
      pr,
    });
  };

  doc.addEventListener("click", handler, { capture: true });

  return () => {
    doc.removeEventListener("click", handler, { capture: true });
  };
};
