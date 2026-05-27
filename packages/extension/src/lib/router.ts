import { CSRequestSchema, type CSResponse } from "./cs-protocol.js";
import type { PortClient } from "./port.js";
import type { ProgressMap } from "./progress-map.js";
import type { SwOptionsProjection } from "./options/storage-reader.js";
import type { Frame } from "@lgtm-buzzer/protocol";
import type { QuizProgressFrame } from "@lgtm-buzzer/protocol";

/**
 * Logger interface required by `RouterDeps`.
 */
export type RouterLogger = {
  readonly warn: (msg: string, ctx?: Record<string, unknown>) => void;
};

/** Dependencies for `createCSMessageHandler`. */
export type RouterDeps = {
  readonly portClient: PortClient;
  /**
   * Reads the stored options projection for the SW.
   *
   * Called on every outbound `quiz-request` frame to merge `llmAdapterId`
   * and `questionPoolSize` into the payload. As of ADR-29, `vcsAdapterId`
   * is inferred from `pr.kind` and `credentials` are resolved host-side —
   * neither is read from storage. Injected so tests can supply a stub without
   * touching `chrome.storage`.
   */
  readonly readSwOptions: () => Promise<SwOptionsProjection>;
  /** Called when the CS sends an `open-options` message. */
  readonly openOptionsPage?: () => void;
  readonly logger?: RouterLogger;
  /**
   * Optional progress-frame registry (ADR-32).
   *
   * When provided, the router subscribes a forwarding callback before sending
   * each `quiz-request` frame and unsubscribes on the terminal reply. This
   * routes heartbeat frames from the host → SW → CS via
   * `chrome.tabs.sendMessage`.
   */
  readonly progressMap?: ProgressMap;
  /**
   * Sends a one-way message to a content-script tab (ADR-32 heartbeat forwarding).
   *
   * Injected so the router does not reference the global `chrome` directly,
   * keeping this file unit-testable without `@types/chrome`.
   * In production this is `(tabId, msg) => browser.tabs.sendMessage(tabId, msg)`.
   */
  readonly sendTabMessage?: (tabId: number, msg: unknown) => Promise<unknown>;
};

/**
 * The signature expected by `chrome.runtime.onMessage.addListener`.
 *
 * Returning `true` keeps the message channel open for an async
 * `sendResponse` call. Returning `false` or `undefined` closes it
 * synchronously.
 */
export type CSMessageHandler = (
  message: unknown,
  sender: { tab?: { id?: number | undefined } | undefined },
  sendResponse: (response: CSResponse) => void,
) => boolean | undefined;

/**
 * Creates the `chrome.runtime.onMessage` listener that validates incoming
 * CS requests and routes them through the port client.
 *
 * Changes in ADR-23:
 * - On `quiz-request` frames, reads chrome.storage.local (via `readSwOptions`)
 *   and merges `llmAdapterId` into the outgoing payload. Fresh read on every
 *   request — no caching.
 *
 * Changes in ADR-29:
 * - `vcsAdapterId` is now inferred from `pr.kind` (`"github"` → `"github"`,
 *   `"ado"` → `"ado"`). Storage is no longer read for VCS adapter selection.
 * - `credentials` are REMOVED from the outgoing frame entirely. If a stale
 *   content script sends a `credentials` field, it is defensively stripped
 *   before forwarding to the host.
 * - On `open-options` messages, calls `openOptionsPage()` to open the options
 *   page without any frame exchange with the host.
 *
 * @remarks
 * - Returns `true` from every well-formed request so Chrome keeps the
 *   message channel open until the async `sendResponse` is called.
 * - Schema violations are returned synchronously as `sw-error`.
 * - Host failures are encoded as `{ kind: "frame", frame: ErrorFrame }`.
 *
 * @param deps - Injected dependencies (portClient, readSwOptions, optional logger).
 * @returns The handler function to pass to `chrome.runtime.onMessage.addListener`.
 */
export const createCSMessageHandler = (deps: RouterDeps): CSMessageHandler => {
  const { portClient, readSwOptions, openOptionsPage, logger, progressMap, sendTabMessage } = deps;

  return (
    message: unknown,
    sender: { tab?: { id?: number | undefined } | undefined },
    sendResponse: (response: CSResponse) => void,
  ): boolean | undefined => {
    const parsed = CSRequestSchema.safeParse(message);

    if (!parsed.success) {
      const msg = parsed.error.issues
        .map((i) => i.message)
        .join("; ");
      logger?.warn("[lgtm-buzzer:sw] schema-violation from CS", {
        issues: parsed.error.issues,
      });
      sendResponse({
        kind: "sw-error",
        reason: "schema-violation",
        message: msg || "invalid CS request",
      });
      return undefined;
    }

    const request = parsed.data;
    const tabId = sender.tab?.id;

    // Handle open-options — no frame exchange with host.
    if (request.kind === "open-options") {
      openOptionsPage?.();
      sendResponse({ kind: "sw-error", reason: "internal", message: "ok" });
      return undefined;
    }

    // From here, request.kind === "send-frame".
    const { frame } = request;

    // Merge storage projection into quiz-request frames only.
    if (frame.kind === "quiz-request") {
      void (async () => {
        const projection = await readSwOptions();

        const originalPayload = frame.payload as {
          pr: { kind?: string } | unknown;
          questionCount: unknown;
          llmAdapterId?: string;
          vcsAdapterId?: string;
          credentials?: unknown;
          questionPoolSize?: number;
        };

        // ADR-29: auto-pick VCS adapter from the PR kind.
        const prKind =
          originalPayload.pr !== null &&
          typeof originalPayload.pr === "object" &&
          "kind" in (originalPayload.pr as object)
            ? (originalPayload.pr as { kind: unknown }).kind
            : undefined;

        const vcsFromPrKind: "github" | "ado" | undefined =
          prKind === "github" ? "github" : prKind === "ado" ? "ado" : undefined;

        const mergedPayload: Record<string, unknown> = {
          ...originalPayload,
          llmAdapterId:
            projection.llmAdapterId ?? originalPayload.llmAdapterId,
          vcsAdapterId: vcsFromPrKind ?? originalPayload.vcsAdapterId,
        };

        // ADR-32: merge questionPoolSize from storage into the payload.
        // quiz-flow.ts no longer hardcodes a pool size; the router is the
        // single place responsible for injecting the stored preference.
        if (projection.questionPoolSize !== undefined) {
          mergedPayload["questionPoolSize"] = projection.questionPoolSize;
        }

        // ADR-29: strip credentials field entirely (stale CS may still send it).
        delete mergedPayload["credentials"];

        // Cast is safe: we're only filling optional fields on a quiz-request
        // payload; the host validates the wire format on receipt.
        const mergedFrame = {
          ...frame,
          payload: mergedPayload,
        } as unknown as Frame;

        // ADR-32: subscribe to progress frames before sending; unsubscribe on
        // terminal reply. This routes heartbeat frames to the originating tab.
        const correlationId = mergedFrame.correlationId;
        if (progressMap !== undefined && correlationId !== null) {
          progressMap.subscribe(correlationId, (progressFrame: QuizProgressFrame) => {
            if (tabId !== undefined && sendTabMessage !== undefined) {
              // Forward heartbeat to the originating tab's content script.
              // Wrap in try/catch: the tab may have been closed.
              try {
                void sendTabMessage(tabId, {
                  kind: "quiz-progress",
                  payload: progressFrame.payload,
                  correlationId: progressFrame.correlationId,
                });
              } catch {
                logger?.warn(
                  "[lgtm-buzzer:sw] sendTabMessage failed for heartbeat — tab may be closed",
                  { tabId },
                );
              }
            }
          });
        }

        const reply = await portClient.sendFrame(mergedFrame, tabId);

        // Unsubscribe progress after terminal reply.
        if (progressMap !== undefined && correlationId !== null) {
          progressMap.unsubscribe(correlationId);
        }

        sendResponse({ kind: "frame", frame: reply });
      })();

      return true;
    }

    void portClient.sendFrame(frame, tabId).then((reply) => {
      sendResponse({ kind: "frame", frame: reply });
    });

    // Return true so Chrome keeps the channel open for the async sendResponse.
    return true;
  };
};
