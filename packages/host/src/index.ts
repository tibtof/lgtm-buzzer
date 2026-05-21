/**
 * Native messaging host entry point package.
 *
 * Real wiring (stdio framing, message dispatch, adapter selection)
 * arrives with the first host ADR. This identifier exists so the
 * package has something to export while the scaffold settles.
 */
export const HOST_ID = "@lgtm-buzzer/host" as const;
