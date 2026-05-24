import { type Either, Left, Right } from "monadyssey";
import type { Frame } from "@lgtm-buzzer/protocol";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Discriminated errors returned by a `Probe` call.
 */
export type ProbeError =
  | { readonly kind: "host-not-installed" }
  | { readonly kind: "nonce-mismatch" }
  | { readonly kind: "internal"; readonly message: string }
  | { readonly kind: "host-error"; readonly reason: string; readonly message: string };

/**
 * Function that pings the host to verify the connection is working.
 *
 * v1: sends a `ping` frame with a fresh nonce and asserts the `pong` echoes
 * it back. As of ADR-29, the `credentials` input is REMOVED — credentials
 * are resolved host-side. Only the LLM adapter ID is kept for forward
 * compatibility (a future probe may exercise the full adapter pipeline).
 */
export type Probe = (input: {
  readonly llmAdapterId: string;
}) => Promise<Either<ProbeError, "ok">>;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a `Probe` that sends a `ping` frame and verifies the nonce echo.
 *
 * @param deps - Injected `sendFrame`, `newCorrelationId`, and `newNonce`.
 */
export const createProbe = (deps: {
  readonly sendFrame: (frame: Frame) => Promise<Frame>;
  readonly newCorrelationId: () => string;
  readonly newNonce: () => string;
}): Probe => {
  const { sendFrame, newCorrelationId, newNonce } = deps;

  return async (): Promise<Either<ProbeError, "ok">> => {
    const correlationId = newCorrelationId();
    const nonce = newNonce();

    const pingFrame: Frame = {
      v: 1,
      kind: "ping",
      correlationId,
      payload: { nonce },
    };

    let reply: Frame;
    try {
      reply = await sendFrame(pingFrame);
    } catch (err) {
      return Left.pure<ProbeError>({ kind: "internal", message: String(err) });
    }

    // Check for host-not-installed (connect failed error).
    if (reply.kind === "error") {
      const payload = reply.payload as { reason?: string; message?: string };
      const message = String(payload.message ?? "host error");

      if (
        typeof payload.message === "string" &&
        payload.message.includes("connect failed")
      ) {
        return Left.pure<ProbeError>({ kind: "host-not-installed" });
      }

      return Left.pure<ProbeError>({
        kind: "host-error",
        reason: String(payload.reason ?? "internal"),
        message,
      });
    }

    if (reply.kind !== "pong") {
      return Left.pure<ProbeError>({
        kind: "internal",
        message: `expected pong, got ${reply.kind}`,
      });
    }

    // Verify the nonce echoed back.
    const pongPayload = reply.payload as { nonce?: unknown };
    if (pongPayload.nonce !== nonce) {
      return Left.pure<ProbeError>({ kind: "nonce-mismatch" });
    }

    return Right.pure("ok" as const);
  };
};
