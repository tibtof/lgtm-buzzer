#!/usr/bin/env node
/**
 * Native messaging host entry point.
 *
 * Reads length-prefixed JSON frames from stdin, dispatches them via the
 * frame dispatcher, and writes responses back to stdout. On clean EOF the
 * process exits with code 0. On stream-level errors the process exits with
 * code 1.
 *
 * Dispatch table:
 *   ping                   → pong (echoes nonce + correlationId)
 *   error                  → warn + ignore (extension should not send error frames)
 *   list-adapters-request  → list-adapters-response (returns registered adapter IDs)
 *   check-auth-request     → check-auth-response (per-adapter credential resolution status)
 *   quiz-request           → fetch diff, generate quiz, send quiz-response
 *   quiz-submit            → score submission, send quiz-result
 *   decode failure         → write ErrorFrame with reason "schema-violation"
 *
 * Adapter selection (ADR-22 / ADR-29):
 *   Adapter IDs are supplied per-request in the quiz-request payload by the
 *   extension. Credentials are resolved host-side by the CredentialResolver —
 *   the extension no longer stores or sends credentials.
 *
 *   Resolution chain (ADR-29 §Per-adapter resolver chain):
 *     github:     GITHUB_TOKEN env → GH_TOKEN env → gh auth token CLI
 *     ado:        AZURE_DEVOPS_EXT_PAT env → az account get-access-token CLI
 *     claude-api: ANTHROPIC_API_KEY env
 *     claude-cli / codex-cli / copilot-cli: CLI-managed (no host action needed)
 *
 *   Defaults (when fields are absent, preserving M2 behaviour):
 *     llmAdapterId → "claude-cli"
 *     vcsAdapterId → "github"
 *
 * Optional environment variables:
 *   LGTM_BUZZER_LOG_LEVEL  pino log level: trace|debug|info|warn|error|fatal|silent (default: info).
 */
import process from "node:process";

import { PROTOCOL_VERSION } from "@lgtm-buzzer/protocol";
import type { Frame } from "@lgtm-buzzer/protocol";
import { spawnIO } from "@lgtm-buzzer/adapter-shared";

import { createPinoLogger } from "./logger.js";
import { createFrameReader } from "./framing/reader.js";
import { createFrameWriter } from "./framing/writer.js";
import type { DecodeError } from "./framing/errors.js";
import { createSessionStore } from "./session-store.js";
import { createDispatcher } from "./dispatcher.js";
import { createDefaultAdapterRegistry } from "./registry.js";
import { createDefaultCredentialResolver } from "./credentials/index.js";
import { createQuestionPoolCache } from "./question-pool-cache.js";
import { createProgressEmitter } from "./progress-emitter.js";

// ---------------------------------------------------------------------------
// Decode-error helper
// ---------------------------------------------------------------------------

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
  const store = createSessionStore();

  // Construct the credential resolver once at startup (ADR-29).
  // Each resolve() call is fresh — no caching. The resolver reads process.env
  // at call time (not at construction time) so env changes after startup are
  // picked up. Subprocess invocations are bounded to 5s each via spawnIO.
  const resolver = createDefaultCredentialResolver({
    env: process.env,
    spawnIO,
  });

  // Construct the adapter registry once at startup (ADR-22 / ADR-29).
  // Adapter instances are built per-request inside the registry; the registry
  // itself holds no mutable state.
  const registry = createDefaultAdapterRegistry({ spawnIO, resolver });

  // Construct the question pool cache once at startup (ADR-30).
  // Cap 10 pools in-process. Cold start on host restart is acceptable.
  const cache = createQuestionPoolCache({ capacity: 10 });

  // ADR-32: progress emitter fires quiz-progress heartbeat frames during generation.
  const progress = createProgressEmitter({
    write,
    logger,
    now: () => Date.now(),
  });

  const { dispatch } = createDispatcher({
    write,
    store,
    logger,
    registry,
    cache,
    progress,
  });

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
        const dispatchResult = await dispatch(frame).unsafeRun();
        if (dispatchResult.type === "Err") {
          // dispatch returns IO<never, void> so this branch is unreachable,
          // but we guard it defensively.
          logger.error("Unexpected dispatch error — this is a bug", {
            kind: "internal",
          });
          streamFailed = true;
        }
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
