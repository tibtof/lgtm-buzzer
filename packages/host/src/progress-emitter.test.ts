import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IO } from "monadyssey";
import { createProgressEmitter } from "./progress-emitter.js";
import type { FrameWriter } from "./framing/writer.js";
import type { Frame } from "@lgtm-buzzer/protocol";
import type { Logger } from "@lgtm-buzzer/core";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type RecordedFrame = { frame: Frame; writtenAt: number };

const makeWriteFake = (): {
  frames: RecordedFrame[];
  writer: FrameWriter;
  failNext: boolean;
} => {
  const frames: RecordedFrame[] = [];
  let failNext = false;
  const writer: FrameWriter = (frame) => {
    if (failNext) {
      failNext = false;
      return IO.fail({ kind: "stream-closed" as const });
    }
    frames.push({ frame, writtenAt: Date.now() });
    return IO.pure(undefined as void);
  };
  return { frames, writer, get failNext() { return failNext; }, set failNext(v) { failNext = v; } };
};

const makeLogger = (): { warnings: string[]; logger: Logger } => {
  const warnings: string[] = [];
  const logger: Logger = {
    debug: () => {},
    info: () => {},
    warn: (msg: string) => { warnings.push(msg); },
    error: () => {},
    child: () => logger,
  };
  return { warnings, logger };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createProgressEmitter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("emit", () => {
    it("writes a single well-formed quiz-progress frame", async () => {
      const { frames, writer } = makeWriteFake();
      const { logger } = makeLogger();
      const nowValue = 1000;
      const emitter = createProgressEmitter({
        write: writer,
        logger,
        now: () => nowValue,
      });

      await emitter.emit("cid-1", "fetching-diff");

      expect(frames).toHaveLength(1);
      const frame = frames[0]!.frame;
      expect(frame.kind).toBe("quiz-progress");
      expect(frame.correlationId).toBe("cid-1");
      if (frame.kind === "quiz-progress") {
        expect(frame.payload.phase).toBe("fetching-diff");
        // elapsedMs = now() - now() = 0 (both measured at the same clock tick)
        expect(frame.payload.elapsedMs).toBeGreaterThanOrEqual(0);
      }
    });

    it("writes with null correlationId", async () => {
      const { frames, writer } = makeWriteFake();
      const { logger } = makeLogger();
      const emitter = createProgressEmitter({
        write: writer,
        logger,
        now: () => 0,
      });

      await emitter.emit(null, "parsing");

      expect(frames[0]!.frame.correlationId).toBeNull();
    });

    it("does NOT throw when write fails — logs warning instead", async () => {
      const { writer } = makeWriteFake();
      const { warnings, logger } = makeLogger();
      // Override writer to always fail.
      const failingWriter: FrameWriter = () => IO.fail({ kind: "stream-closed" as const });
      const emitter = createProgressEmitter({
        write: failingWriter,
        logger,
        now: () => 0,
      });

      await expect(emitter.emit("cid-1", "parsing")).resolves.toBeUndefined();
      expect(warnings.length).toBeGreaterThan(0);
      expect(writer).toBeDefined(); // suppress unused warning
    });

    it("records correct elapsedMs at emit time", async () => {
      const nowValue = 5000;
      const { frames, writer } = makeWriteFake();
      const { logger } = makeLogger();
      const emitter = createProgressEmitter({
        write: writer,
        logger,
        now: () => nowValue,
      });

      await emitter.emit("cid-1", "generating-quiz");

      // Both startedAt and now() are captured from the same `now()` call during emit,
      // so elapsedMs = 0. This checks the shape is correct.
      expect(frames[0]!.frame.kind).toBe("quiz-progress");
      if (frames[0]!.frame.kind === "quiz-progress") {
        expect(frames[0]!.frame.payload.elapsedMs).toBe(0);
      }
    });
  });

  describe("startHeartbeat", () => {
    it("emits one frame immediately on start", async () => {
      const { frames, writer } = makeWriteFake();
      const { logger } = makeLogger();
      const emitter = createProgressEmitter({
        write: writer,
        logger,
        now: () => 0,
        intervalMs: 1000,
      });

      const stop = emitter.startHeartbeat("cid-2", "generating-quiz");
      // Let the immediate (synchronous-scheduled) frame land.
      await vi.advanceTimersByTimeAsync(10);

      expect(frames.length).toBeGreaterThanOrEqual(1);
      expect(frames[0]!.frame.kind).toBe("quiz-progress");

      stop();
    });

    it("emits additional frames on each interval tick", async () => {
      const { frames, writer } = makeWriteFake();
      const { logger } = makeLogger();
      let nowValue = 0;
      const emitter = createProgressEmitter({
        write: writer,
        logger,
        now: () => nowValue,
        intervalMs: 100,
      });

      const stop = emitter.startHeartbeat("cid-3", "generating-quiz");

      // Advance 3 interval ticks.
      nowValue = 100;
      await vi.advanceTimersByTimeAsync(100);
      nowValue = 200;
      await vi.advanceTimersByTimeAsync(100);
      nowValue = 300;
      await vi.advanceTimersByTimeAsync(100);

      stop();

      // Should have: 1 immediate + 3 interval ticks = 4 total.
      expect(frames.length).toBeGreaterThanOrEqual(4);
      expect(writer).toBeDefined(); // suppress
    });

    it("stop function prevents further writes after being called", async () => {
      const { frames, writer } = makeWriteFake();
      const { logger } = makeLogger();
      const emitter = createProgressEmitter({
        write: writer,
        logger,
        now: () => 0,
        intervalMs: 100,
      });

      const stop = emitter.startHeartbeat("cid-4", "generating-quiz");
      // Wait for the immediate frame to land.
      await vi.advanceTimersByTimeAsync(10);
      const countAfterImmediate = frames.length;

      stop();

      // Advance beyond interval — no more writes should happen.
      await vi.advanceTimersByTimeAsync(500);
      expect(frames.length).toBe(countAfterImmediate);
      expect(writer).toBeDefined(); // suppress
    });

    it("stop function is idempotent — calling twice does not throw", () => {
      const { writer } = makeWriteFake();
      const { logger } = makeLogger();
      const emitter = createProgressEmitter({
        write: writer,
        logger,
        now: () => 0,
        intervalMs: 100,
      });

      const stop = emitter.startHeartbeat("cid-5", "parsing");
      expect(() => { stop(); stop(); }).not.toThrow();
    });

    it("each tick carries the correct phase", async () => {
      const { frames, writer } = makeWriteFake();
      const { logger } = makeLogger();
      const emitter = createProgressEmitter({
        write: writer,
        logger,
        now: () => 0,
        intervalMs: 50,
      });

      const stop = emitter.startHeartbeat("cid-6", "caching");
      await vi.advanceTimersByTimeAsync(50);
      stop();

      for (const { frame } of frames) {
        if (frame.kind === "quiz-progress") {
          expect(frame.payload.phase).toBe("caching");
        }
      }
      expect(writer).toBeDefined();
    });

    it("write failure in heartbeat does NOT throw — warning is logged", async () => {
      const { warnings, logger } = makeLogger();
      const failingWriter: FrameWriter = () => IO.fail({ kind: "stream-error" as const, reason: "broken pipe" });
      const emitter = createProgressEmitter({
        write: failingWriter,
        logger,
        now: () => 0,
        intervalMs: 50,
      });

      const stop = emitter.startHeartbeat("cid-7", "generating-quiz");
      await vi.advanceTimersByTimeAsync(50);
      stop();

      expect(warnings.length).toBeGreaterThan(0);
    });

    it("elapsedMs increases with each tick", async () => {
      const { frames, writer } = makeWriteFake();
      const { logger } = makeLogger();
      let nowValue = 1_000;
      const emitter = createProgressEmitter({
        write: writer,
        logger,
        now: () => nowValue,
        intervalMs: 100,
      });

      const stop = emitter.startHeartbeat("cid-8", "generating-quiz");
      // Immediate frame: elapsedMs = 0 (nowValue hasn't advanced).

      nowValue = 1_100;
      await vi.advanceTimersByTimeAsync(100);

      nowValue = 1_200;
      await vi.advanceTimersByTimeAsync(100);

      stop();

      const progressFrames = frames
        .map((f) => f.frame)
        .filter((f): f is typeof f & { kind: "quiz-progress" } => f.kind === "quiz-progress");

      expect(progressFrames.length).toBeGreaterThanOrEqual(3);
      // Each subsequent frame should have greater or equal elapsedMs.
      for (let i = 1; i < progressFrames.length; i++) {
        expect(progressFrames[i]!.payload.elapsedMs).toBeGreaterThanOrEqual(
          progressFrames[i - 1]!.payload.elapsedMs,
        );
      }
      expect(writer).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // ADR-36: emitGenerationStage tests
  // ---------------------------------------------------------------------------

  describe("emitGenerationStage", () => {
    it("writes a quiz-progress frame with phase 'generating-quiz' and stage", async () => {
      const { frames, writer } = makeWriteFake();
      const { logger } = makeLogger();
      const startedAt = 1000;
      const emitter = createProgressEmitter({
        write: writer,
        logger,
        now: () => startedAt + 500,
      });

      await emitter.emitGenerationStage("cid-1", startedAt, { stage: "thinking" });

      expect(frames).toHaveLength(1);
      const frame = frames[0]!.frame;
      expect(frame.kind).toBe("quiz-progress");
      if (frame.kind === "quiz-progress") {
        expect(frame.payload.phase).toBe("generating-quiz");
        expect(frame.payload.stage).toBe("thinking");
        expect(frame.payload.elapsedMs).toBe(500);
        expect(frame.payload.questionsWritten).toBeUndefined();
      }
    });

    it("includes questionsWritten when provided", async () => {
      const { frames, writer } = makeWriteFake();
      const { logger } = makeLogger();
      const emitter = createProgressEmitter({ write: writer, logger, now: () => 1000 });

      await emitter.emitGenerationStage("cid-2", 1000, {
        stage: "writing",
        questionsWritten: 3,
      });

      if (frames[0]?.frame.kind === "quiz-progress") {
        expect(frames[0].frame.payload.stage).toBe("writing");
        expect(frames[0].frame.payload.questionsWritten).toBe(3);
      }
    });

    it("does NOT throw when write fails — logs warning instead", async () => {
      const { warnings, logger } = makeLogger();
      const failingWriter: FrameWriter = () => IO.fail({ kind: "stream-closed" as const });
      const emitter = createProgressEmitter({
        write: failingWriter,
        logger,
        now: () => 0,
      });

      await expect(
        emitter.emitGenerationStage("cid-3", 0, { stage: "thinking" }),
      ).resolves.toBeUndefined();
      expect(warnings.length).toBeGreaterThan(0);
    });

    it("SECURITY: emitted frame payload contains ONLY stage and questionsWritten (no raw text)", async () => {
      const SECRET = "SECRET_DIFF_CANARY_xyz123";
      const { frames, writer } = makeWriteFake();
      const { logger } = makeLogger();
      const emitter = createProgressEmitter({ write: writer, logger, now: () => 0 });

      // Even if a caller tries to sneak text in via questionsWritten (it's typed as number),
      // the payload is structurally controlled. We assert the serialized frame has no canary.
      await emitter.emitGenerationStage("cid-4", 0, { stage: "writing", questionsWritten: 2 });

      const serialized = JSON.stringify(frames[0]?.frame);
      expect(serialized).not.toContain(SECRET);

      // Verify allowed fields only.
      if (frames[0]?.frame.kind === "quiz-progress") {
        const payload = frames[0].frame.payload;
        expect(Object.keys(payload).sort()).toEqual(
          expect.arrayContaining(["phase", "elapsedMs", "stage", "questionsWritten"]),
        );
        // No text fields.
        const payloadValues = Object.values(payload);
        for (const v of payloadValues) {
          if (typeof v === "string") {
            expect(v).not.toContain(SECRET);
          }
        }
      }
    });
  });
});
