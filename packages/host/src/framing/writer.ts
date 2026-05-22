import type { Writable } from "node:stream";
import { IO } from "monadyssey";
import type { Frame } from "@lgtm-buzzer/protocol";
import type { Logger } from "@lgtm-buzzer/core";
import { HEADER_BYTES, MAX_FRAME_BYTES } from "./errors.js";
import type { WriteError } from "./errors.js";

/** Dependencies injected into {@link createFrameWriter}. */
export type FrameWriterDeps = {
  readonly sink: Writable;
  readonly logger: Logger;
};

/**
 * A function that encodes a {@link Frame} into a length-prefixed native-messaging
 * frame and writes it to the injected sink.
 *
 * Returns `IO<WriteError, void>` — every failure is surfaced in the error
 * channel; the IO never throws.
 */
export type FrameWriter = (frame: Frame) => IO<WriteError, void>;

/**
 * Encodes a frame into a single combined Buffer: 4-byte LE uint32 header + JSON payload.
 * Returns `{ ok: true; bytes: Buffer }` on success,
 * `{ ok: false; error: WriteError }` when the serialised payload exceeds `MAX_FRAME_BYTES`.
 *
 * @internal
 */
export const encodeFrame = (
  frame: Frame,
): { ok: true; bytes: Buffer } | { ok: false; error: WriteError } => {
  const json = JSON.stringify(frame);
  const payload = Buffer.from(json, "utf8");
  const n = payload.byteLength;

  if (n > MAX_FRAME_BYTES) {
    return { ok: false, error: { kind: "size-overflow", bytes: n } };
  }

  const header = Buffer.allocUnsafe(HEADER_BYTES);
  header.writeUInt32LE(n, 0);
  return { ok: true, bytes: Buffer.concat([header, payload]) };
};

/** Map a Node.js stream write error to a typed `WriteError`. @internal */
const classifyWriteError = (err: Error): WriteError => {
  const code = (err as NodeJS.ErrnoException).code ?? "";
  const isClosedError =
    code === "EPIPE" ||
    code === "ERR_STREAM_DESTROYED" ||
    code === "ERR_STREAM_WRITE_AFTER_END";

  return isClosedError
    ? { kind: "stream-closed" }
    : { kind: "stream-error", reason: String(err) };
};

/**
 * Creates a {@link FrameWriter} that encodes `Frame` values and writes them to
 * `deps.sink` using Chrome's length-prefixed native-messaging wire format
 * (4-byte LE uint32 header + UTF-8 JSON payload).
 *
 * The factory is synchronous — no side effects occur until the returned
 * `FrameWriter` is called. Per ADR-8 §Decision 9, the header is always
 * little-endian. Per ADR-8 §Decision 4, log bindings never include payload bytes.
 *
 * @param deps - Sink stream and logger.
 * @returns A `FrameWriter` function.
 */
export const createFrameWriter = (deps: FrameWriterDeps): FrameWriter => {
  const { sink, logger } = deps;

  return (frame: Frame): IO<WriteError, void> => {
    const encoded = encodeFrame(frame);

    if (!encoded.ok) {
      const err = encoded.error as Extract<WriteError, { kind: "size-overflow" }>;
      logger.error("Frame payload exceeds 1 MiB limit — refusing to write", {
        kind: err.kind,
        bytes: err.bytes,
      });
      return IO.fail<WriteError>(err);
    }

    const { bytes } = encoded;

    return IO.cancellable<WriteError, void>((signal) => {
      return new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject({ kind: "stream-closed" } satisfies WriteError);
          return;
        }

        let settled = false;

        const settle = (writeError: WriteError | null): void => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", onAbort);
          if (writeError == null) {
            resolve();
          } else {
            reject(writeError);
          }
        };

        const onAbort = (): void => {
          settle({ kind: "stream-closed" });
        };
        signal.addEventListener("abort", onAbort, { once: true });

        // Node's Writable emits 'error' both via the event system AND calls
        // the write callback with the same error. We attach a one-time 'error'
        // listener to absorb the event emission; the write callback does the
        // actual error handling. Without this listener the error becomes an
        // unhandled exception.
        // Absorb the stream 'error' event emitted AFTER the write callback fires.
        // Node emits 'error' asynchronously after calling the write callback
        // with a non-null error; without this listener it becomes an uncaught exception.
        // The write callback below handles the error via settle(); this handler is intentionally a no-op.
        const noopErrorHandler: (...args: unknown[]) => void = () => { /* absorbed */ };
        sink.once("error", noopErrorHandler);

        sink.write(bytes, (err) => {
          // Do NOT remove the 'error' listener here. Node emits the 'error'
          // event AFTER calling this write callback, so the once-listener must
          // still be present to absorb it. It auto-removes after firing once.

          if (err == null) {
            settle(null);
            return;
          }

          const writeError = classifyWriteError(err);

          if (writeError.kind === "stream-closed") {
            logger.warn("Sink stream closed while writing frame", {
              kind: writeError.kind,
            });
          } else if (writeError.kind === "stream-error") {
            logger.error("Unexpected error writing frame to sink", {
              kind: writeError.kind,
              reason: writeError.reason,
            });
          }

          settle(writeError);
        });
      });
    }, (e: unknown): WriteError => {
      // If reject was called with a typed WriteError, pass it through.
      if (
        e != null &&
        typeof e === "object" &&
        "kind" in e &&
        typeof (e as { kind: unknown }).kind === "string"
      ) {
        return e as WriteError;
      }
      return { kind: "stream-error", reason: String(e) };
    });
  };
};
