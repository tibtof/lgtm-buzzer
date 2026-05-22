import { type Either, Left, Right } from "monadyssey";
import { z } from "zod";
import {
  type Frame,
  ListAdaptersResponsePayloadSchema,
} from "@lgtm-buzzer/protocol";
import { CSResponseSchema } from "../cs-protocol.js";
import type { ListAdaptersError, AdapterCatalog } from "./dom.js";

// ---------------------------------------------------------------------------
// SW bridge
// ---------------------------------------------------------------------------

/**
 * Creates a `sendFrame` function that routes `Frame` objects through
 * `chrome.runtime.sendMessage` to the service worker and back.
 *
 * Mirrors the CS-side wrapper in `entrypoints/content.ts`. Extracted here so
 * the options page does not duplicate the code.
 *
 * @param deps - Injected `sendMessage` (inject `browser.runtime.sendMessage` in prod).
 */
export const createSWBridge = (deps: {
  readonly sendMessage: (msg: unknown) => Promise<unknown>;
}): { readonly sendFrame: (frame: Frame) => Promise<Frame> } => {
  const { sendMessage } = deps;

  const sendFrame = async (frame: Frame): Promise<Frame> => {
    const syntheticError = (message: string): Frame => ({
      v: 1,
      kind: "error",
      correlationId: frame.correlationId,
      payload: { reason: "internal", message },
    });

    let rawResponse: unknown;
    try {
      rawResponse = await sendMessage({ kind: "send-frame", frame });
    } catch (err) {
      return syntheticError(`sendMessage failed: ${String(err)}`);
    }

    const parsed = CSResponseSchema.safeParse(rawResponse);
    if (!parsed.success) {
      return syntheticError("invalid SW response shape");
    }

    const response = parsed.data;
    if (response.kind === "sw-error") {
      return syntheticError(`sw-error [${response.reason}]: ${response.message}`);
    }

    return response.frame;
  };

  return { sendFrame };
};

// ---------------------------------------------------------------------------
// list-adapters round-trip
// ---------------------------------------------------------------------------

/** Schema for validating the list-adapters-response payload returned by the host. */
const ListAdaptersResponseSchema = z.object({
  kind: z.literal("list-adapters-response"),
  payload: ListAdaptersResponsePayloadSchema,
});

/**
 * Creates a function that sends a `list-adapters-request` through the SW
 * and returns the adapter catalog.
 *
 * On `Left<host-not-installed>`: the host's native messaging port could not
 * be connected (the error frame message contains the connect-failed signature).
 *
 * @param deps - Injected `sendFrame` and correlation ID factory.
 */
export const createListAdapters = (deps: {
  readonly sendFrame: (frame: Frame) => Promise<Frame>;
  readonly newCorrelationId: () => string;
}): (() => Promise<Either<ListAdaptersError, AdapterCatalog>>) => {
  const { sendFrame, newCorrelationId } = deps;

  return async (): Promise<Either<ListAdaptersError, AdapterCatalog>> => {
    const correlationId = newCorrelationId();
    const request: Frame = {
      v: 1,
      kind: "list-adapters-request",
      correlationId,
      payload: {},
    };

    let reply: Frame;
    try {
      reply = await sendFrame(request);
    } catch (err) {
      return Left.pure<ListAdaptersError>({
        kind: "internal",
        message: String(err),
      });
    }

    if (reply.kind === "error") {
      const payload = reply.payload as { reason?: string; message?: string };
      const message = String(payload.message ?? "host error");

      // Detect connect-failed errors (host not installed).
      if (
        typeof payload.message === "string" &&
        payload.message.includes("connect failed")
      ) {
        return Left.pure<ListAdaptersError>({ kind: "host-not-installed" });
      }

      return Left.pure<ListAdaptersError>({
        kind: "host-error",
        reason: String(payload.reason ?? "internal"),
        message,
      });
    }

    const parsed = ListAdaptersResponseSchema.safeParse(reply);
    if (!parsed.success) {
      return Left.pure<ListAdaptersError>({
        kind: "internal",
        message: "unexpected response from host",
      });
    }

    return Right.pure<AdapterCatalog>({
      llm: parsed.data.payload.llm,
      vcs: parsed.data.payload.vcs,
    });
  };
};
