#!/usr/bin/env node
/**
 * Native messaging host entry point.
 *
 * Reads length-prefixed JSON frames from stdin, dispatches them, and writes
 * responses back to stdout. On clean EOF the process exits with code 0. On
 * stream-level errors the process exits with code 1.
 *
 * Dispatch table (this issue):
 *   ping  → pong (echoes nonce + correlationId)
 *   error → warn + ignore (extension should not send error frames)
 *   decode failure → write ErrorFrame with reason "schema-violation"
 */
import process from "node:process";

import { PROTOCOL_VERSION } from "@lgtm-buzzer/protocol";
import type { Frame } from "@lgtm-buzzer/protocol";

import { createPinoLogger } from "./logger.js";
import { createFrameReader } from "./framing/reader.js";
import { createFrameWriter } from "./framing/writer.js";
import type { DecodeError } from "./framing/errors.js";

// ---------------------------------------------------------------------------
// Dispatch helpers
// ---------------------------------------------------------------------------

/**
 * Builds a pong frame that echoes the ping's nonce and correlationId.
 *
 * @param correlationId - The correlationId from the incoming ping frame.
 * @param nonce - The optional nonce from the ping payload.
 * @returns A well-formed pong `Frame`.
 */
const buildPong = (
  correlationId: string | null,
  nonce: string | undefined,
): Frame => ({
  v: PROTOCOL_VERSION,
  kind: "pong",
  correlationId,
  payload: nonce !== undefined ? { nonce } : {},
});

/**
 * Builds an error frame for a decode failure.
 *
 * @param decodeError - The decode error that caused the frame to be rejected.
 * @returns An error `Frame` with reason "schema-violation".
 */
const buildDecodeErrorFrame = (decodeError: DecodeError): Frame => ({
  v: PROTOCOL_VERSION,
  kind: "error",
  correlationId: null,
  payload: {
    reason: "schema-violation",
    message: `Frame decode failed: ${decodeError.kind}`,
  },
});

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  const logger = createPinoLogger({ bindings: { component: "cli" } });

  const readerIO = createFrameReader({ source: process.stdin, logger });
  const readerResult = await readerIO.unsafeRun();
  if (readerResult.type !== "Ok") {
    // IO<never, FrameReader> can never fail — this branch is unreachable at runtime.
    logger.error("Unexpected error creating frame reader — this is a bug", {
      kind: "internal",
    });
    process.exit(1);
  }

  const frames = readerResult.value;
  const write = createFrameWriter({ sink: process.stdout, logger });

  let streamFailed = false;

  for await (const result of frames) {
    await result.fold(
      // Left: decode failure — reply with an error frame
      async (decodeError) => {
        const errorFrame = buildDecodeErrorFrame(decodeError);
        const writeResult = await write(errorFrame).unsafeRun();
        if (writeResult.type === "Err") {
          logger.error("Failed to write decode-error reply frame", {
            kind: writeResult.error.kind,
          });
          streamFailed = true;
        }
      },
      // Right: well-formed frame — dispatch by kind
      async (frame) => {
        logger.info("Dispatching frame", {
          kind: frame.kind,
          correlationId: frame.correlationId,
        });

        if (frame.kind === "ping") {
          const pong = buildPong(frame.correlationId, frame.payload.nonce);
          const writeResult = await write(pong).unsafeRun();
          if (writeResult.type === "Err") {
            logger.error("Failed to write pong frame", {
              kind: writeResult.error.kind,
            });
            streamFailed = true;
          }
          return;
        }

        if (frame.kind === "error") {
          // Extension should not send error frames to the host, but the schema
          // allows it. Log at warn and ignore per issue #12 scope.
          logger.warn("Received error frame from extension — ignoring", {
            kind: frame.kind,
            correlationId: frame.correlationId,
          });
          return;
        }

        // Exhaustive guard: future frame kinds are ignored with a warn.
        logger.warn("Received unhandled frame kind — ignoring", {
          kind: (frame as Frame).kind,
          correlationId: (frame as Frame).correlationId,
        });
      },
    );

    // Stop the loop early if a write to stdout failed.
    if (streamFailed) break;
  }

  // The reader iterator ends either on clean EOF (exit 0) or on a fatal
  // decode error such as stream-error or premature-eof. The reader itself
  // logs those at `error` level; we check if a stream fault was flagged.
  if (streamFailed) {
    process.exit(1);
  }
};

main().catch((err: unknown) => {
  // Invariant violation: unexpected throw from the main loop.
  process.stderr.write(`cli.ts unhandled error: ${String(err)}\n`);
  process.exit(1);
});
