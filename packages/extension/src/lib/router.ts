import { CSRequestSchema, type CSResponse } from "./cs-protocol.js";
import type { PortClient } from "./port.js";

/**
 * Logger interface required by `RouterDeps`.
 */
export type RouterLogger = {
  readonly warn: (msg: string, ctx?: Record<string, unknown>) => void;
};

/** Dependencies for `createCSMessageHandler`. */
export type RouterDeps = {
  readonly portClient: PortClient;
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
 * @remarks
 * - Returns `true` from every well-formed request so Chrome keeps the
 *   message channel open until the async `sendResponse` is called.
 * - Schema violations are returned synchronously as `sw-error`.
 * - Host failures are encoded as `{ kind: "frame", frame: ErrorFrame }`.
 *
 * @param deps - Injected dependencies (portClient + optional logger).
 * @returns The handler function to pass to `chrome.runtime.onMessage.addListener`.
 */
export const createCSMessageHandler = (deps: RouterDeps): CSMessageHandler => {
  const { portClient, logger } = deps;

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

    void portClient.sendFrame(request.frame, tabId).then((reply) => {
      sendResponse({ kind: "frame", frame: reply });
    });

    // Return true so Chrome keeps the channel open for the async sendResponse.
    return true;
  };
};
