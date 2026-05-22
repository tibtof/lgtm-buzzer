import { CSRequestSchema, type CSResponse } from "./cs-protocol.js";
import type { PortClient } from "./port.js";
import type { SwOptionsProjection } from "./options/storage-reader.js";
import type { Frame } from "@lgtm-buzzer/protocol";

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
   * Called on every outbound `quiz-request` frame to merge `llmAdapterId`,
   * `vcsAdapterId`, and `credentials` into the payload. Injected so tests can
   * supply a stub without touching `chrome.storage`.
   */
  readonly readSwOptions: () => Promise<SwOptionsProjection>;
  /** Called when the CS sends an `open-options` message. */
  readonly openOptionsPage?: () => void;
  readonly logger?: RouterLogger;
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
 *   and merges `llmAdapterId`, `vcsAdapterId`, and `credentials` into the
 *   outgoing payload. Fresh read on every request — no caching.
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
  const { portClient, readSwOptions, openOptionsPage, logger } = deps;

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
          pr: unknown;
          questionCount: unknown;
          llmAdapterId?: string;
          vcsAdapterId?: string;
          credentials?: unknown;
        };

        const mergedPayload = {
          ...originalPayload,
          llmAdapterId:
            projection.llmAdapterId ?? originalPayload.llmAdapterId,
          vcsAdapterId:
            projection.vcsAdapterId ?? originalPayload.vcsAdapterId,
          credentials:
            projection.credentials ?? originalPayload.credentials,
        };

        // Cast is safe: we're only filling optional fields on a quiz-request
        // payload; the host validates the wire format on receipt.
        const mergedFrame = {
          ...frame,
          payload: mergedPayload,
        } as unknown as Frame;

        const reply = await portClient.sendFrame(mergedFrame, tabId);
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
