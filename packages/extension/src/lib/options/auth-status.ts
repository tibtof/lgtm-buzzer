import { type Either, Left, Right } from "monadyssey";
import type { Frame, AuthStatus } from "@lgtm-buzzer/protocol";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Discriminated errors returned by a `CheckAuth` call.
 */
export type CheckAuthError =
  | { readonly kind: "host-not-installed" }
  | { readonly kind: "host-error"; readonly reason: string; readonly message: string }
  | { readonly kind: "internal"; readonly message: string };

/**
 * Function that sends a `check-auth-request` to the host and returns the
 * per-adapter auth status array.
 *
 * On `Left<host-not-installed>`: the host's native messaging port could not
 * be connected (the error frame message contains "connect failed").
 * On `Left<host-error>`: the host returned an error frame for another reason.
 * On `Left<internal>`: an unexpected exception was thrown.
 */
export type CheckAuth = () => Promise<Either<CheckAuthError, ReadonlyArray<AuthStatus>>>;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a `CheckAuth` function that sends a `check-auth-request` frame
 * through the SW and returns the per-adapter status array.
 *
 * @param deps - Injected `sendFrame` and correlation ID factory.
 */
export const createCheckAuth = (deps: {
  readonly sendFrame: (frame: Frame) => Promise<Frame>;
  readonly newCorrelationId: () => string;
}): CheckAuth => {
  const { sendFrame, newCorrelationId } = deps;

  return async (): Promise<Either<CheckAuthError, ReadonlyArray<AuthStatus>>> => {
    const correlationId = newCorrelationId();
    const requestFrame: Frame = {
      v: 1,
      kind: "check-auth-request",
      correlationId,
      payload: {},
    };

    let reply: Frame;
    try {
      reply = await sendFrame(requestFrame);
    } catch (err) {
      return Left.pure<CheckAuthError>({ kind: "internal", message: String(err) });
    }

    if (reply.kind === "error") {
      const payload = reply.payload as { reason?: string; message?: string };
      const message = String(payload.message ?? "host error");

      // Detect connect-failed errors (host not installed).
      if (
        typeof payload.message === "string" &&
        payload.message.includes("connect failed")
      ) {
        return Left.pure<CheckAuthError>({ kind: "host-not-installed" });
      }

      return Left.pure<CheckAuthError>({
        kind: "host-error",
        reason: String(payload.reason ?? "internal"),
        message,
      });
    }

    if (reply.kind !== "check-auth-response") {
      return Left.pure<CheckAuthError>({
        kind: "internal",
        message: `expected check-auth-response, got ${reply.kind}`,
      });
    }

    return Right.pure<ReadonlyArray<AuthStatus>>(reply.payload.statuses);
  };
};
