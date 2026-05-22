import type { Readable } from "node:stream";
import { IO, Left, Right } from "monadyssey";
import type { Either } from "monadyssey";
import { parseFrame } from "@lgtm-buzzer/protocol";
import type { Frame } from "@lgtm-buzzer/protocol";
import type { Logger } from "@lgtm-buzzer/core";
import { HEADER_BYTES, MAX_FRAME_BYTES } from "./errors.js";
import type { DecodeError } from "./errors.js";

/** Dependencies injected into {@link createFrameReader}. */
export type FrameReaderDeps = {
  readonly source: Readable;
  readonly logger: Logger;
};

/**
 * An async iterable that yields `Either<DecodeError, Frame>` for each
 * length-prefixed native-messaging frame read from the source stream.
 *
 * - `Right<Frame>` — successfully decoded frame.
 * - `Left<DecodeError>` — decode failure; the iterator may continue or end
 *   depending on the variant (see ADR-8 §Decision 8).
 *
 * The iterator completes without error on clean EOF between frames.
 */
export type FrameReader = AsyncIterable<Either<DecodeError, Frame>>;

// ---------------------------------------------------------------------------
// Internal: raw-byte extraction from a Readable in paused mode
// ---------------------------------------------------------------------------

/**
 * Reads exactly `n` bytes from `source`, respecting cancellation via `signal`.
 *
 * Returns:
 * - `Buffer` — exactly `n` bytes were read successfully.
 * - `"eof"` — clean EOF was encountered (0 bytes consumed when waiting for the
 *   first byte, or `partialOnEof` is false and EOF occurred mid-read).
 * - `{ partial: number }` — EOF mid-read with `partial` bytes already consumed
 *   (used to distinguish premature-eof from clean-eof on header reads).
 * - `{ error: string }` — the stream emitted an `'error'` event.
 * - `"cancelled"` — the AbortSignal fired before the read completed.
 *
 * @internal
 */
export const readExactly = (
  source: Readable,
  n: number,
  signal: AbortSignal,
): Promise<Buffer | "eof" | { partial: number } | { error: string } | "cancelled"> => {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve("cancelled");
      return;
    }

    const chunks: Buffer[] = [];
    let collected = 0;

    const cleanup = (): void => {
      source.removeListener("readable", onReadable);
      source.removeListener("end", onEnd);
      source.removeListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };

    const tryRead = (): void => {
      while (collected < n) {
        // source.read(want) returns exactly `want` bytes if that many are
        // buffered, otherwise returns null.
        const want = n - collected;
        const chunk = source.read(want) as Buffer | null;
        if (chunk === null) break;
        chunks.push(chunk);
        collected += chunk.byteLength;
      }
      if (collected >= n) {
        cleanup();
        resolve(Buffer.concat(chunks));
      }
    };

    const onReadable = (): void => { tryRead(); };

    const onEnd = (): void => {
      cleanup();
      if (collected === 0) {
        resolve("eof");
      } else {
        resolve({ partial: collected });
      }
    };

    const onError = (err: Error): void => {
      cleanup();
      resolve({ error: String(err) });
    };

    const onAbort = (): void => {
      cleanup();
      resolve("cancelled");
    };

    source.on("readable", onReadable);
    source.once("end", onEnd);
    source.once("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });

    // Attempt an immediate read in case data is already buffered
    tryRead();
  });
};

// ---------------------------------------------------------------------------
// Internal: decode one frame from the source
// ---------------------------------------------------------------------------

/**
 * Runs Decision 8 steps 1–6 for a single frame:
 * 1. Read 4-byte header.
 * 2. Decode LE uint32 → declared length `n`.
 * 3. If `n > MAX_FRAME_BYTES` → `length-overflow`.
 * 4. Read exactly `n` bytes.
 * 5. UTF-8 decode + JSON.parse.
 * 6. `parseFrame(parsed)`.
 *
 * Returns:
 * - `Either<DecodeError, Frame>` — decode result.
 * - `"clean-eof"` — clean EOF before any header bytes were consumed.
 * - `"end-iterator"` — fatal error; caller must stop iterating.
 * - `"cancelled"` — AbortSignal fired.
 *
 * @internal
 */
type DecodeOneResult =
  | { tag: "frame"; value: Either<DecodeError, Frame> }
  | { tag: "clean-eof" }
  | { tag: "end-iterator" }
  | { tag: "cancelled" };

export const decodeOneFrame = async (
  source: Readable,
  signal: AbortSignal,
  logger: Logger,
): Promise<DecodeOneResult> => {
  // Step 1: read 4-byte header
  const headerResult = await readExactly(source, HEADER_BYTES, signal);

  if (headerResult === "cancelled") return { tag: "cancelled" };
  if (headerResult === "eof") return { tag: "clean-eof" };
  if ("partial" in headerResult) {
    logger.error("Premature EOF in native-messaging frame header", { kind: "premature-eof" });
    return {
      tag: "end-iterator",
    };
  }
  if ("error" in headerResult) {
    logger.error("Stream error reading native-messaging frame header", {
      kind: "stream-error",
      reason: headerResult.error,
    });
    return { tag: "end-iterator" };
  }

  // Step 2: decode LE uint32
  const declared = headerResult.readUInt32LE(0);

  // Step 3: overflow guard — wire desynced, end iterator (ADR-8 §Decision 8)
  if (declared > MAX_FRAME_BYTES) {
    logger.error("Native-messaging frame length exceeds 1 MiB limit — wire desynced", {
      kind: "length-overflow",
      declared,
    });
    return { tag: "end-iterator" };
  }

  // Step 4: read payload
  const payloadResult = await readExactly(source, declared, signal);

  if (payloadResult === "cancelled") return { tag: "cancelled" };
  if (payloadResult === "eof" || "partial" in payloadResult) {
    logger.error("Premature EOF in native-messaging frame payload", { kind: "premature-eof" });
    return { tag: "end-iterator" };
  }
  if ("error" in payloadResult) {
    logger.error("Stream error reading native-messaging frame payload", {
      kind: "stream-error",
      reason: payloadResult.error,
    });
    return { tag: "end-iterator" };
  }

  // Step 5: UTF-8 decode + JSON.parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadResult.toString("utf8"));
  } catch (e: unknown) {
    const reason = String(e);
    logger.warn("Invalid JSON in native-messaging frame — skipping", {
      kind: "invalid-json",
    });
    const decodeErr: DecodeError = { kind: "invalid-json", reason };
    return {
      tag: "frame",
      value: Left.pure(decodeErr) as Either<DecodeError, Frame>,
    };
  }

  // Step 6: schema validation via parseFrame (ADR-7)
  const parseResult = parseFrame(parsed);
  if (!parseResult.success) {
    // ADR-8 §Decision 4: log kind + correlationId only — never payload bytes
    logger.warn("Native-messaging frame failed schema validation — skipping", {
      kind: "schema-violation",
    });
    const decodeErr: DecodeError = {
      kind: "schema-violation",
      issues: parseResult.error.issues,
    };
    return {
      tag: "frame",
      value: Left.pure(decodeErr) as Either<DecodeError, Frame>,
    };
  }

  return { tag: "frame", value: Right.pure(parseResult.data) as Either<DecodeError, Frame> };
};

// ---------------------------------------------------------------------------
// Public: createFrameReader
// ---------------------------------------------------------------------------

/**
 * Creates a `FrameReader` — an async iterable over validated
 * native-messaging frames read from `deps.source`.
 *
 * The outer `IO<never, FrameReader>` captures the stream-attachment effect;
 * the per-element `Either<DecodeError, Frame>` carries decode results.
 *
 * Per ADR-8 §Decision 6, the source stream is **never** destroyed — the host
 * runtime owns its own file descriptors.
 *
 * @param deps - Source readable stream and logger.
 * @returns `IO<never, FrameReader>` — run it to obtain the async iterable.
 */
export const createFrameReader = (deps: FrameReaderDeps): IO<never, FrameReader> => {
  return IO.cancellable<never, FrameReader>((signal) => {
    const { source, logger } = deps;

    const iterable: FrameReader = {
      [Symbol.asyncIterator](): AsyncIterator<Either<DecodeError, Frame>> {
        let done = false;

        return {
          async next(): Promise<IteratorResult<Either<DecodeError, Frame>>> {
            if (done || signal.aborted) {
              return { done: true, value: undefined };
            }

            const result = await decodeOneFrame(source, signal, logger);

            switch (result.tag) {
              case "clean-eof":
              case "cancelled":
              case "end-iterator":
                // Fatal errors were already logged inside decodeOneFrame.
                // Per ADR-8 §Decision 8, these variants end the iterator.
                done = true;
                return { done: true, value: undefined };

              case "frame":
                return { done: false, value: result.value };
            }
          },
        };
      },
    };

    return iterable;
  });
};
