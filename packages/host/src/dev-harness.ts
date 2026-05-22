#!/usr/bin/env node
/**
 * Dev harness for `@lgtm-buzzer/host`.
 *
 * Spawns `packages/host/dist/cli.js` as a child process, sends a ping frame
 * over its stdin using the real length-prefixed framing, reads the pong frame
 * back from its stdout, and asserts the round-trip integrity.
 *
 * This file IS the integration test for issue #12. No separate unit tests are
 * added for the dispatcher — the harness exercises the real stdio path
 * including the process boundary (mirroring how Chrome actually invokes the
 * host).
 *
 * Exit codes:
 *   0 — ping/pong round trip succeeded and child exited cleanly.
 *   1 — assertion failed or child exited with a non-zero code.
 */
import process from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";

import { PROTOCOL_VERSION } from "@lgtm-buzzer/protocol";
import type { Frame } from "@lgtm-buzzer/protocol";

import { createPinoLogger } from "./logger.js";
import { createFrameWriter } from "./framing/writer.js";
import { createFrameReader } from "./framing/reader.js";

// ---------------------------------------------------------------------------
// Resolve the path to the compiled CLI entry
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CLI_PATH = resolve(__dirname, "../dist/cli.js");

// ---------------------------------------------------------------------------
// Harness constants
// ---------------------------------------------------------------------------

const CORRELATION_ID = "harness-ping-1" as const;
const NONCE = "harness-nonce-42" as const;

const PING_FRAME: Frame = {
  v: PROTOCOL_VERSION,
  kind: "ping",
  correlationId: CORRELATION_ID,
  payload: { nonce: NONCE },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  const logger = createPinoLogger({ bindings: { component: "dev-harness" } });

  logger.info("Spawning host CLI", { cliPath: CLI_PATH });

  // Spawn the host. Its stdin/stdout are piped; stderr is inherited so pino
  // log lines from the child flow through to our own stderr for visibility.
  const child = spawn(process.execPath, [CLI_PATH], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  if (child.stdin === null || child.stdout === null) {
    logger.error("Child process stdio pipes are null — cannot proceed", { kind: "internal" });
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Set up the framing writer (to child stdin) and reader (from child stdout)
  // ---------------------------------------------------------------------------

  // The writer targets the child's stdin.
  const write = createFrameWriter({ sink: child.stdin, logger });

  // The reader reads from child's stdout. We use a PassThrough to satisfy the
  // Readable type expected by createFrameReader. child.stdout IS a Readable,
  // but its type in Node is `stream.Readable`. We pipe it through a PassThrough
  // so we have a fresh paused Readable the reader can take ownership of.
  const stdoutPassThrough = new PassThrough();
  child.stdout.pipe(stdoutPassThrough);

  const readerIO = createFrameReader({ source: stdoutPassThrough, logger });
  const readerResult = await readerIO.unsafeRun();
  if (readerResult.type !== "Ok") {
    logger.error("Failed to create frame reader from child stdout — this is a bug", {
      kind: "internal",
    });
    process.exit(1);
  }
  const frames = readerResult.value;

  // ---------------------------------------------------------------------------
  // Send the ping frame
  // ---------------------------------------------------------------------------

  logger.info("Sending ping frame", {
    correlationId: CORRELATION_ID,
    nonce: NONCE,
  });

  const writeResult = await write(PING_FRAME).unsafeRun();
  if (writeResult.type === "Err") {
    logger.error("Failed to write ping frame to child stdin", {
      kind: writeResult.error.kind,
    });
    child.kill();
    process.exit(1);
  }

  // Signal EOF on the child's stdin so the host's main loop exits cleanly
  // after handling the ping.
  child.stdin.end();

  // ---------------------------------------------------------------------------
  // Read the pong frame
  // ---------------------------------------------------------------------------

  let assertionPassed = false;

  for await (const result of frames) {
    const passed = result.fold(
      (decodeError) => {
        logger.error("Received a decode error instead of pong frame", {
          kind: decodeError.kind,
        });
        return false;
      },
      (frame) => {
        if (frame.kind !== "pong") {
          logger.error("Expected pong frame but received a different kind", {
            kind: frame.kind,
            correlationId: frame.correlationId,
          });
          return false;
        }

        // Assert correlationId matches
        if (frame.correlationId !== CORRELATION_ID) {
          logger.error("pong correlationId mismatch", {
            expected: CORRELATION_ID,
            received: frame.correlationId,
          });
          return false;
        }

        // Assert nonce matches
        if (frame.payload.nonce !== NONCE) {
          logger.error("pong nonce mismatch", {
            expected: NONCE,
            received: frame.payload.nonce,
          });
          return false;
        }

        logger.info("ping/pong round trip succeeded", {
          correlationId: frame.correlationId,
          nonce: frame.payload.nonce,
        });
        return true;
      },
    );

    if (passed) {
      assertionPassed = true;
      break;
    } else {
      // A decode error or wrong frame — fail fast.
      child.kill();
      process.exit(1);
    }
  }

  if (!assertionPassed) {
    logger.error("No pong frame received — round trip failed");
    child.kill();
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Wait for the child to exit cleanly
  // ---------------------------------------------------------------------------

  const childExitCode = await new Promise<number>((resolve) => {
    child.once("exit", (code) => {
      resolve(code ?? 1);
    });
  });

  if (childExitCode !== 0) {
    logger.error("Child process exited with non-zero code", { exitCode: childExitCode });
    process.exit(1);
  }

  logger.info("Dev harness completed successfully — host exited cleanly", {
    exitCode: childExitCode,
  });
};

main().catch((err: unknown) => {
  process.stderr.write(`dev-harness.ts unhandled error: ${String(err)}\n`);
  process.exit(1);
});
