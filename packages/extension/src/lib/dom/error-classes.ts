/**
 * Display-layer error classification for the quiz modal.
 *
 * Maps the wire-level `ErrorReason` union (from `@lgtm-buzzer/protocol`) plus
 * extension-internal transport-failure markers (emitted by `port.ts` and
 * `quiz-flow.ts`) into `DisplayErrorClass` variants the modal can render with
 * actionable UI copy.
 *
 * The marker strings are imported directly from `port.ts` and `quiz-flow.ts`
 * to avoid string-literal drift (ADR-24 binding constraint (c)).
 *
 * FOLLOW-UP: Option B host-side fiber cancellation for quiz-cancel-request frame
 * is deferred to a separate issue. See packages/extension/README.md for details.
 */

import type { ErrorReason } from "@lgtm-buzzer/protocol";
import { PORT_ERROR_MARKERS } from "../port.js";
import { QUIZ_FLOW_ERROR_MARKERS } from "./quiz-flow.js";

// Re-export markers so the drift-canary test can import them from one place.
export { PORT_ERROR_MARKERS } from "../port.js";
export { QUIZ_FLOW_ERROR_MARKERS } from "./quiz-flow.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Display-layer classification of any error surfaced to the modal.
 *
 * The first four classes are extension-internal — they cover transport
 * failures that today get flattened into `reason: "internal"` with a
 * marker `message` from `port.ts` / `quiz-flow.ts`. The remaining classes
 * are 1:1 with the protocol's `ErrorReason` enum.
 *
 * This type does NOT cross the SW boundary; it is the modal's local view.
 */
export type DisplayErrorClass =
  // Extension-internal transport classes (synthesised from "internal" reason)
  | { readonly kind: "host-unreachable" }
  | { readonly kind: "host-timeout" }
  | { readonly kind: "host-unexpected-reply"; readonly replyKind: string }
  | { readonly kind: "transport-internal"; readonly detail: string }
  // Wire-level reasons (mirror protocol.ErrorReason 1:1)
  | { readonly kind: "schema-violation" }
  | { readonly kind: "unknown-message" }
  | { readonly kind: "version-mismatch" }
  | { readonly kind: "internal" } // genuine host-side internal
  | { readonly kind: "unknown-quiz-id" }
  | { readonly kind: "unsupported-llm-adapter" }
  | { readonly kind: "unsupported-vcs-adapter" }
  | { readonly kind: "missing-credentials" }
  // ADR-33: emitted when a quiz-request fiber was cancelled by the user (Esc).
  | { readonly kind: "cancelled" };

/** The action a CTA button performs. */
export type ErrorCTAAction =
  | { readonly kind: "retry" }
  | { readonly kind: "open-options" }
  | { readonly kind: "install-host"; readonly url: string }
  | { readonly kind: "dismiss" };

/** What the error renderer needs to know to draw the error panel. */
export type ErrorUISpec = {
  readonly title: string;
  readonly body: string;
  readonly cta?: { readonly label: string; readonly action: ErrorCTAAction };
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Install anchor for the install-host CTA. */
export const INSTALL_HOST_URL = "https://github.com/tibtof/lgtm-buzzer#install";

// ---------------------------------------------------------------------------
// classifyError
// ---------------------------------------------------------------------------

/**
 * Maps a `(reason, message)` pair from the wire `outcome.error` into a
 * `DisplayErrorClass`.
 *
 * For transport-internal reasons: `port.ts` / `quiz-flow.ts` emit specific
 * marker strings in `message`. This function recognises those markers (via the
 * named constants from those modules) and promotes them to dedicated classes.
 * Anything else with `reason === "internal"` falls back to `{ kind: "internal" }`
 * (genuine host-side internal).
 *
 * For all other reasons the mapping is 1:1 with the protocol's `ErrorReason`.
 *
 * Pure — no side effects.
 *
 * @param reason - Wire-level error reason from the protocol.
 * @param message - Human-readable message from the error payload.
 * @returns The display classification.
 */
export const classifyError = (
  reason: ErrorReason,
  message: string,
): DisplayErrorClass => {
  if (reason !== "internal") {
    // 1:1 mapping for all non-internal reasons.
    return { kind: reason };
  }

  // Extension-internal transport markers — matched via named constants to
  // prevent drift (ADR-24 binding constraint (c)).

  if (
    message === PORT_ERROR_MARKERS.hostDisconnected ||
    message.startsWith(PORT_ERROR_MARKERS.connectFailed)
  ) {
    return { kind: "host-unreachable" };
  }

  if (message === PORT_ERROR_MARKERS.hostNoResponse) {
    return { kind: "host-timeout" };
  }

  if (message.startsWith(QUIZ_FLOW_ERROR_MARKERS.unexpectedReplyKindPrefix)) {
    const replyKind = message
      .slice(QUIZ_FLOW_ERROR_MARKERS.unexpectedReplyKindPrefix.length)
      .trim();
    return { kind: "host-unexpected-reply", replyKind };
  }

  if (
    message.startsWith(QUIZ_FLOW_ERROR_MARKERS.sendFrameThrewPrefix) ||
    message.startsWith(QUIZ_FLOW_ERROR_MARKERS.replayFailedPrefix) ||
    message === QUIZ_FLOW_ERROR_MARKERS.invalidSwResponse
  ) {
    return { kind: "transport-internal", detail: message };
  }

  // Genuine host-side internal error (unrecognised marker).
  return { kind: "internal" };
};

// ---------------------------------------------------------------------------
// errorClassToUI
// ---------------------------------------------------------------------------

/**
 * Pure mapping from a `DisplayErrorClass` to the UI spec (title, body, CTA).
 *
 * Centralises the user-facing copy and CTA logic. The renderer just paints
 * the result. The switch is exhaustive — TypeScript will catch missing cases.
 *
 * @param cls - The display classification.
 * @returns A `ErrorUISpec` with title, body, and optional CTA.
 */
export const errorClassToUI = (cls: DisplayErrorClass): ErrorUISpec => {
  switch (cls.kind) {
    case "host-unreachable":
      return {
        title: "Native host not installed",
        body: "LGTM-Buzzer needs the native messaging host to talk to your local LLM. Install it from the project page.",
        cta: {
          label: "Install host",
          action: { kind: "install-host", url: INSTALL_HOST_URL },
        },
      };

    case "host-timeout":
      return {
        title: "Host didn't respond",
        body: "The native host took too long to reply. This usually clears on its own.",
        cta: { label: "Retry", action: { kind: "retry" } },
      };

    case "host-unexpected-reply":
      return {
        title: "Unexpected response",
        body: "The native host sent an unexpected message. Retry, or report a bug if it keeps happening.",
        cta: { label: "Retry", action: { kind: "retry" } },
      };

    case "transport-internal":
      return {
        title: "Connection error",
        body: "Something went wrong talking to the native host. Retry, or restart the host.",
        cta: { label: "Retry", action: { kind: "retry" } },
      };

    case "schema-violation":
      return {
        title: "Protocol mismatch",
        body: "Extension and host versions are out of sync. Reinstall the native host to fix this.",
        cta: {
          label: "Install host",
          action: { kind: "install-host", url: INSTALL_HOST_URL },
        },
      };

    case "unknown-message":
      return {
        title: "Protocol mismatch",
        body: "The native host didn't recognise the request. Reinstall the host to fix this.",
        cta: {
          label: "Install host",
          action: { kind: "install-host", url: INSTALL_HOST_URL },
        },
      };

    case "version-mismatch":
      return {
        title: "Protocol version mismatch",
        body: "Extension and host versions are incompatible. Reinstall the native host.",
        cta: {
          label: "Install host",
          action: { kind: "install-host", url: INSTALL_HOST_URL },
        },
      };

    case "internal":
      return {
        title: "Host error",
        body: "The native host hit an internal error. Retry, or check the host logs.",
        cta: { label: "Retry", action: { kind: "retry" } },
      };

    case "unknown-quiz-id":
      return {
        title: "Quiz expired",
        body: "The quiz session is no longer valid. Try again to fetch a fresh quiz.",
        cta: { label: "Try again", action: { kind: "retry" } },
      };

    case "unsupported-llm-adapter":
      return {
        title: "LLM adapter not available",
        body: "The selected LLM adapter is not registered in your native host. Pick a different adapter in options.",
        cta: { label: "Open options", action: { kind: "open-options" } },
      };

    case "unsupported-vcs-adapter":
      return {
        title: "VCS adapter not available",
        body: "The selected VCS adapter is not registered in your native host. Pick a different adapter in options.",
        cta: { label: "Open options", action: { kind: "open-options" } },
      };

    case "missing-credentials":
      return {
        title: "Credentials required",
        body: "This adapter needs credentials. Add them in extension options.",
        cta: { label: "Open options", action: { kind: "open-options" } },
      };

    case "cancelled":
      // ADR-33: quiz was cancelled by the user (Esc). The modal is already
      // closed when this error arrives, so this copy is rarely shown.
      return {
        title: "Quiz cancelled",
        body: "The quiz generation was cancelled.",
        cta: { label: "Try again", action: { kind: "retry" } },
      };
  }
};
