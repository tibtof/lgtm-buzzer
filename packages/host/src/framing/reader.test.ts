import { PassThrough } from "node:stream";
import type { Either } from "monadyssey";
import { describe, expect, it } from "vitest";
import type { Logger, LogBindings } from "@lgtm-buzzer/core";
import type { Frame } from "@lgtm-buzzer/protocol";
import { createFrameWriter } from "./writer.js";
import { createFrameReader } from "./reader.js";
import type { DecodeError } from "./errors.js";

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

/**
 * Encodes a Frame into a length-prefixed buffer (4-byte LE header + JSON payload)
 * to push directly into a PassThrough source.
 */
const encodeToBuffer = (frame: Frame): Buffer => {
  const json = JSON.stringify(frame);
  const payload = Buffer.from(json, "utf8");
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(payload.byteLength, 0);
  return Buffer.concat([header, payload]);
};

/**
 * Collects all items from a FrameReader into an array, then resolves.
 */
const collectFrames = async (
  source: PassThrough,
  logger: Logger,
): Promise<Array<Either<DecodeError, Frame>>> => {
  const readerIO = createFrameReader({ source, logger });
  const result = await readerIO.unsafeRun();
  if (result.type !== "Ok") throw new Error("createFrameReader IO failed unexpectedly");

  const items: Array<Either<DecodeError, Frame>> = [];
  for await (const item of result.value) {
    items.push(item);
  }
  return items;
};

/** Writes raw bytes to source then signals EOF. */
const feedAndEnd = (source: PassThrough, ...buffers: Buffer[]): void => {
  for (const buf of buffers) {
    source.push(buf);
  }
  source.push(null); // EOF
};


// Sample frames
const PING: Frame = { v: 1, kind: "ping", correlationId: "c1", payload: { nonce: "n1" } };
const PONG: Frame = { v: 1, kind: "pong", correlationId: "c2", payload: { nonce: "n2" } };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createFrameReader", () => {
  // -------------------------------------------------------------------------
  // 1. Happy path — single ping frame
  // -------------------------------------------------------------------------

  it("1. happy path — single ping frame decoded correctly", async () => {
    const { logger } = makeLogger();
    const source = new PassThrough();
    feedAndEnd(source, encodeToBuffer(PING));

    const items = await collectFrames(source, logger);
    expect(items).toHaveLength(1);
    expect(items[0]?.fold(() => null, (f) => f)).toEqual(PING);
  });

  // -------------------------------------------------------------------------
  // 2. Two valid frames back-to-back
  // -------------------------------------------------------------------------

  it("2. two valid frames back-to-back — both decoded, iterator completes", async () => {
    const { logger } = makeLogger();
    const source = new PassThrough();
    feedAndEnd(source, encodeToBuffer(PING), encodeToBuffer(PONG));

    const items = await collectFrames(source, logger);
    expect(items).toHaveLength(2);
    expect(items[0]?.fold(() => null, (f) => f)).toEqual(PING);
    expect(items[1]?.fold(() => null, (f) => f)).toEqual(PONG);
  });

  // -------------------------------------------------------------------------
  // 3. Length overflow (declared 2_000_000) → end iterator, logger.error once
  // -------------------------------------------------------------------------

  it("3. length-overflow — ends iterator immediately, logs error exactly once", async () => {
    const { logger, entries } = makeLogger();
    const source = new PassThrough();

    // Push a 4-byte LE header with declared length = 2_000_000 (> 1_048_576)
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32LE(2_000_000, 0);
    feedAndEnd(source, header);

    const items = await collectFrames(source, logger);
    expect(items).toHaveLength(0); // iterator ended without yielding

    const errorEntries = entries.filter((e) => e.level === "error");
    expect(errorEntries).toHaveLength(1);
    expect(errorEntries[0]?.bindings).toMatchObject({ kind: "length-overflow" });
  });

  // -------------------------------------------------------------------------
  // 4. Invalid JSON then valid frame → continue past, logger.warn once
  // -------------------------------------------------------------------------

  it("4. invalid-json then valid frame — continues past, logs warn once", async () => {
    const { logger, entries } = makeLogger();
    const source = new PassThrough();

    // Build an invalid-JSON frame: valid header (correct byte count) but garbage JSON
    const garbage = Buffer.from("{ not valid json !!! }");
    const badHeader = Buffer.allocUnsafe(4);
    badHeader.writeUInt32LE(garbage.byteLength, 0);

    feedAndEnd(source, Buffer.concat([badHeader, garbage]), encodeToBuffer(PING));

    const items = await collectFrames(source, logger);
    // Should yield the Left for invalid-json AND the Right for PING
    expect(items).toHaveLength(2);
    expect(items[0]?.fold((e) => e.kind, () => "ok")).toBe("invalid-json");
    expect(items[1]?.fold(() => null, (f) => f)).toEqual(PING);

    const warnEntries = entries.filter((e) => e.level === "warn");
    expect(warnEntries).toHaveLength(1);
    expect(warnEntries[0]?.bindings).toMatchObject({ kind: "invalid-json" });
  });

  // -------------------------------------------------------------------------
  // 5. Schema violation then valid frame → continue past, logger.warn once
  // -------------------------------------------------------------------------

  it("5. schema-violation then valid frame — continues past, logs warn once", async () => {
    const { logger, entries } = makeLogger();
    const source = new PassThrough();

    // Build a valid-JSON but invalid-schema frame
    const badObj = JSON.stringify({ v: 1, kind: "unknown-kind", correlationId: "c3" });
    const badPayload = Buffer.from(badObj, "utf8");
    const badHeader = Buffer.allocUnsafe(4);
    badHeader.writeUInt32LE(badPayload.byteLength, 0);

    feedAndEnd(source, Buffer.concat([badHeader, badPayload]), encodeToBuffer(PONG));

    const items = await collectFrames(source, logger);
    expect(items).toHaveLength(2);
    expect(items[0]?.fold((e) => e.kind, () => "ok")).toBe("schema-violation");
    expect(items[1]?.fold(() => null, (f) => f)).toEqual(PONG);

    const warnEntries = entries.filter((e) => e.level === "warn");
    expect(warnEntries).toHaveLength(1);
    expect(warnEntries[0]?.bindings).toMatchObject({ kind: "schema-violation" });
  });

  // -------------------------------------------------------------------------
  // 6. Premature EOF in header
  // -------------------------------------------------------------------------

  it("6. premature-eof in header — ends iterator, logs error", async () => {
    const { logger, entries } = makeLogger();
    const source = new PassThrough();

    // Push only 2 bytes (less than the 4-byte header) then EOF
    const partial = Buffer.alloc(2, 0x00);
    feedAndEnd(source, partial);

    const items = await collectFrames(source, logger);
    expect(items).toHaveLength(0);

    const errorEntries = entries.filter((e) => e.level === "error");
    expect(errorEntries).toHaveLength(1);
    expect(errorEntries[0]?.bindings).toMatchObject({ kind: "premature-eof" });
  });

  // -------------------------------------------------------------------------
  // 7. Premature EOF in payload
  // -------------------------------------------------------------------------

  it("7. premature-eof in payload — ends iterator, logs error", async () => {
    const { logger, entries } = makeLogger();
    const source = new PassThrough();

    // Push a valid 4-byte header declaring 100 bytes, then only 10 bytes payload
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32LE(100, 0);
    const partial = Buffer.alloc(10, 0x42);
    feedAndEnd(source, header, partial);

    const items = await collectFrames(source, logger);
    expect(items).toHaveLength(0);

    const errorEntries = entries.filter((e) => e.level === "error");
    expect(errorEntries).toHaveLength(1);
    expect(errorEntries[0]?.bindings).toMatchObject({ kind: "premature-eof" });
  });

  // -------------------------------------------------------------------------
  // 8. Clean EOF between frames → iterator completes, no error, no logger.error
  // -------------------------------------------------------------------------

  it("8. clean EOF between frames — completes without error, no logger.error", async () => {
    const { logger, entries } = makeLogger();
    const source = new PassThrough();

    // Push one valid frame then EOF immediately (clean disconnect)
    feedAndEnd(source, encodeToBuffer(PING));

    const items = await collectFrames(source, logger);
    expect(items).toHaveLength(1);
    expect(items[0]?.fold(() => null, (f) => f)).toEqual(PING);

    const errorEntries = entries.filter((e) => e.level === "error");
    expect(errorEntries).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 9. Stream error → end iterator
  // -------------------------------------------------------------------------

  it("9. stream error — ends iterator, logs error", async () => {
    const { logger, entries } = makeLogger();
    const source = new PassThrough();

    // Start reading (will block waiting for data), then emit a stream error
    const collectPromise = collectFrames(source, logger);
    setImmediate(() => { source.destroy(new Error("SOCKET_HANG_UP")); });

    const items = await collectPromise;
    expect(items).toHaveLength(0);

    const errorEntries = entries.filter((e) => e.level === "error");
    expect(errorEntries).toHaveLength(1);
    expect(errorEntries[0]?.bindings).toMatchObject({ kind: "stream-error" });
  });

  // -------------------------------------------------------------------------
  // 10. Cancellation mid-flight → clean resolve, no source.destroy()
  // -------------------------------------------------------------------------

  it("10. cancellation — resolves cleanly, removes listeners, does NOT destroy source", async () => {
    const { logger } = makeLogger();
    const source = new PassThrough();

    // Fork the reader IO to get a Fiber with cancellation support.
    // readerIO.fork() returns IO<never, Fiber<never, FrameReader>>; we unsafeRun it.
    const readerIO = createFrameReader({ source, logger });
    const forkResult = await readerIO.fork().unsafeRun();
    if (forkResult.type !== "Ok") throw new Error("fork IO failed unexpectedly");
    const fiber = forkResult.value;

    // Start consuming the iterable in a background promise
    const collectPromise = (async (): Promise<unknown[]> => {
      const joinResult = await fiber.join();
      if (joinResult.type !== "Ok") return [];
      const items: unknown[] = [];
      for await (const item of joinResult.value) {
        items.push(item);
      }
      return items;
    })();

    // Give the iterator time to start waiting for data on the source stream
    await new Promise<void>((r) => setImmediate(r));

    // Cancel the fiber — this aborts the AbortSignal passed to IO.cancellable
    await fiber.cancel();

    const items = await collectPromise;
    // Cancellation stops the iterator; no items yielded
    expect(items).toHaveLength(0);

    // Source must NOT be destroyed (ADR-8 §Decision 6)
    expect(source.destroyed).toBe(false);

    // Listeners for "readable" must be cleaned up after cancellation
    expect(source.listenerCount("readable")).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 11. Logger payload safety — SECRET_DIFF_BYTES never appears in log bindings
  // -------------------------------------------------------------------------

  it("11. logger payload safety — schema-violation payload bytes absent from logger bindings", async () => {
    const SECRET_DIFF_BYTES = "SECRET_DIFF_BYTES_THAT_SHOULD_NOT_APPEAR_IN_LOGS";
    const { logger, entries } = makeLogger();
    const source = new PassThrough();

    // A frame with invalid schema (unknown kind) that contains the secret value
    const evilPayload = JSON.stringify({
      v: 1,
      kind: "leak-attempt",
      correlationId: "c-evil",
      payload: { secret: SECRET_DIFF_BYTES },
    });
    const buf = Buffer.from(evilPayload, "utf8");
    const hdr = Buffer.allocUnsafe(4);
    hdr.writeUInt32LE(buf.byteLength, 0);

    feedAndEnd(source, Buffer.concat([hdr, buf]));
    await collectFrames(source, logger);

    // Verify no log entry carries the secret bytes
    for (const entry of entries) {
      expect(JSON.stringify(entry)).not.toContain(SECRET_DIFF_BYTES);
    }
  });

  // -------------------------------------------------------------------------
  // 12. Round-trip property — 8 hand-crafted Frame fixtures survive writer → PassThrough → reader
  // -------------------------------------------------------------------------

  it("12. round-trip — 8 frame fixtures survive writer → PassThrough → reader unchanged", async () => {
    const { logger } = makeLogger();

    const fixtures: Frame[] = [
      { v: 1, kind: "ping", correlationId: "rt1", payload: {} },
      { v: 1, kind: "ping", correlationId: "rt2", payload: { nonce: "abc" } },
      { v: 1, kind: "pong", correlationId: "rt3", payload: {} },
      { v: 1, kind: "pong", correlationId: "rt4", payload: { nonce: "xyz" } },
      {
        v: 1, kind: "error", correlationId: "rt5",
        payload: { reason: "schema-violation", message: "bad schema" },
      },
      {
        v: 1, kind: "error", correlationId: "rt6",
        payload: { reason: "unknown-message", message: "no such kind" },
      },
      {
        v: 1, kind: "error", correlationId: "rt7",
        payload: { reason: "version-mismatch", message: "v0 not supported" },
      },
      {
        v: 1, kind: "error", correlationId: "rt8",
        payload: { reason: "internal", message: "host exploded" },
      },
    ];

    // Write all frames through the writer into a PassThrough
    const pipe = new PassThrough();
    const writerLogger = makeLogger().logger;
    const write = createFrameWriter({ sink: pipe, logger: writerLogger });

    for (const frame of fixtures) {
      const result = await write(frame).unsafeRun();
      expect(result.type).toBe("Ok");
    }
    pipe.push(null); // EOF

    // Read them back
    const items = await collectFrames(pipe, logger);
    expect(items).toHaveLength(fixtures.length);

    for (let i = 0; i < fixtures.length; i++) {
      const decoded = items[i]?.fold(() => null, (f) => f);
      expect(decoded).toEqual(fixtures[i]);
    }
  });
});
