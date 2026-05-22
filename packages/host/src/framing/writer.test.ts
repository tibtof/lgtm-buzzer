import { PassThrough, Writable } from "node:stream";
import type { IO, Ok, Err } from "monadyssey";
import { describe, expect, it } from "vitest";
import type { Logger, LogBindings } from "@lgtm-buzzer/core";
import type { Frame } from "@lgtm-buzzer/protocol";
import { HEADER_BYTES, MAX_FRAME_BYTES } from "./errors.js";
import { createFrameWriter, encodeFrame } from "./writer.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type LogEntry = { readonly level: "debug" | "info" | "warn" | "error"; readonly msg: string; readonly bindings?: LogBindings };

const pushEntry = (entries: LogEntry[], level: LogEntry["level"], msg: string, bindings?: LogBindings): void => {
  if (bindings !== undefined) {
    entries.push({ level, msg, bindings });
  } else {
    entries.push({ level, msg });
  }
};

const makeLogger = (): { logger: Logger; entries: LogEntry[] } => {
  const entries: LogEntry[] = [];
  const logger: Logger = {
    debug: (msg, bindings) => { pushEntry(entries, "debug", msg, bindings); },
    info:  (msg, bindings) => { pushEntry(entries, "info",  msg, bindings); },
    warn:  (msg, bindings) => { pushEntry(entries, "warn",  msg, bindings); },
    error: (msg, bindings) => { pushEntry(entries, "error", msg, bindings); },
    child: () => logger,
  };
  return { logger, entries };
};

/** A valid ping frame used across multiple test cases. */
const PING_FRAME: Frame = {
  v: 1,
  kind: "ping",
  correlationId: "test-corr-1",
  payload: { nonce: "abc123" },
};

/** Run an IO to completion and return its Ok or Err result. */
const run = async <E, A>(io: IO<E, A>): Promise<Ok<A> | Err<E>> => {
  return io.unsafeRun();
};

/** Read all data already buffered in a PassThrough without ending it. */
const readBuffered = (pt: PassThrough): Buffer => {
  const chunks: Buffer[] = [];
  let chunk: Buffer | null;
  while ((chunk = pt.read() as Buffer | null) !== null) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

// ---------------------------------------------------------------------------
// 1. Happy path — pong frame, raw-bytes assertion
// ---------------------------------------------------------------------------

describe("createFrameWriter", () => {
  it("1. happy path — encodes pong frame with correct LE header and round-trip JSON", async () => {
    const { logger } = makeLogger();
    const sink = new PassThrough({ objectMode: false });
    const write = createFrameWriter({ sink, logger });

    const pongFrame: Frame = {
      v: 1,
      kind: "pong",
      correlationId: "corr-99",
      payload: { nonce: "xyz" },
    };

    const result = await run(write(pongFrame));
    expect(result.type).toBe("Ok");

    // Read what was buffered in the PassThrough — no need to end the stream
    const allBytes = readBuffered(sink);

    // First 4 bytes must be the LE uint32 of the payload length
    const declaredLen = allBytes.readUInt32LE(0);
    const payloadBytes = allBytes.subarray(HEADER_BYTES, HEADER_BYTES + declaredLen);
    const decoded: unknown = JSON.parse(payloadBytes.toString("utf8"));
    expect(decoded).toEqual(pongFrame);
  });

  // ---------------------------------------------------------------------------
  // 2. Size overflow — IO fails, zero bytes written
  // ---------------------------------------------------------------------------

  it("2. size-overflow — IO fails when serialised payload exceeds 1 MiB", async () => {
    const { logger, entries } = makeLogger();
    const sink = new PassThrough();
    const write = createFrameWriter({ sink, logger });

    // Build a frame whose JSON serialisation is > MAX_FRAME_BYTES.
    const oversizedPayload = "x".repeat(MAX_FRAME_BYTES + 1);
    const bigFrame: Frame = {
      v: 1,
      kind: "error",
      correlationId: "big-1",
      payload: {
        reason: "internal",
        message: oversizedPayload,
      },
    };

    // Verify the encode helper detects the overflow
    const encoded = encodeFrame(bigFrame);
    expect(encoded.ok).toBe(false);
    if (!encoded.ok) {
      expect(encoded.error.kind).toBe("size-overflow");
    }

    const result = await run(write(bigFrame));
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("size-overflow");
    }

    // Nothing written to the sink
    const buffered = sink.read() as Buffer | null;
    expect(buffered).toBeNull();

    // Logger must have emitted an error — no payload bytes in bindings
    const errorEntries = entries.filter((e) => e.level === "error");
    expect(errorEntries.length).toBeGreaterThanOrEqual(1);
    const binding = errorEntries[0]?.bindings ?? {};
    expect(JSON.stringify(binding)).not.toContain(oversizedPayload);
  });

  // ---------------------------------------------------------------------------
  // 3. Stream closed before write — stream-closed error
  // ---------------------------------------------------------------------------

  it("3. stream-closed — returns stream-closed when sink is already ended", async () => {
    const { logger } = makeLogger();
    const sink = new PassThrough();
    // End the stream before attempting to write
    await new Promise<void>((r) => { sink.end(r); });

    const write = createFrameWriter({ sink, logger });
    const result = await run(write(PING_FRAME));
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("stream-closed");
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Stream error (non-EPIPE) — stream-error
  // ---------------------------------------------------------------------------

  it("4. stream-error — returns stream-error for unexpected write failures", async () => {
    const { logger, entries } = makeLogger();

    // A Writable that rejects every write with a non-EPIPE error.
    // autoDestroy: false prevents the stream from emitting 'error' twice.
    const sink = new Writable({
      autoDestroy: false,
      write(_chunk: unknown, _enc: unknown, cb: (err?: Error) => void) {
        cb(new Error("DISK_FULL"));
      },
    });

    const write = createFrameWriter({ sink, logger });
    const result = await run(write(PING_FRAME));
    expect(result.type).toBe("Err");
    if (result.type === "Err") {
      expect(result.error.kind).toBe("stream-error");
      if (result.error.kind === "stream-error") {
        expect(result.error.reason).toContain("DISK_FULL");
      }
    }

    // Logger must have emitted an error
    const errorEntries = entries.filter((e) => e.level === "error");
    expect(errorEntries.length).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // 5. Logger payload safety — bindings never contain payload data
  // ---------------------------------------------------------------------------

  it("5. logger payload safety — error log bindings never include payload bytes", async () => {
    const { logger, entries } = makeLogger();

    const sink = new Writable({
      autoDestroy: false,
      write(_chunk: unknown, _enc: unknown, cb: (err?: Error) => void) {
        const err = new Error("STREAM_WRITE_ERROR");
        (err as NodeJS.ErrnoException).code = "ERR_STREAM_DESTROYED";
        cb(err);
      },
    });

    const secretNonce = "SUPER_SECRET_NONCE_VALUE";
    const frame: Frame = {
      v: 1,
      kind: "ping",
      correlationId: "sec-1",
      payload: { nonce: secretNonce },
    };

    await run(createFrameWriter({ sink, logger })(frame));

    // Check every log entry — payload data must never appear in bindings
    for (const entry of entries) {
      const bindingsJson = JSON.stringify(entry.bindings ?? {});
      expect(bindingsJson).not.toContain(secretNonce);
    }
  });
});
