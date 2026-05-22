import { Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createPinoLogger } from "./logger.js";

/** Collects all chunks written to a writable stream and returns a getter. */
const makeCapture = (): { stream: Writable; output: () => string } => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding: BufferEncoding, callback: () => void) {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      callback();
    },
  });
  return { stream, output: () => chunks.join("") };
};

/** Flush pino's sonic-boom buffer (async write) by waiting a tick. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe("createPinoLogger", () => {
  it("1. channel separation — never writes to stdout", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write");

    const { stream, output } = makeCapture();
    const logger = createPinoLogger({ destination: stream });
    logger.info("hello from logger");
    await flush();

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(output()).toContain("hello from logger");

    stdoutSpy.mockRestore();
  });

  it("2. redaction — replaces diff, body, and pr.* fields", async () => {
    const { stream, output } = makeCapture();
    const logger = createPinoLogger({ destination: stream });

    logger.info("redaction test", {
      diff: "FAKE DIFF BYTES",
      body: "FAKE BODY",
      pr: { title: "secret-title", body: "secret-body" },
    });
    await flush();

    const out = output();
    const redactedCount = (out.match(/\[Redacted\]/g) ?? []).length;
    expect(redactedCount).toBeGreaterThanOrEqual(3);
    expect(out).not.toContain("FAKE DIFF BYTES");
    expect(out).not.toContain("FAKE BODY");
    expect(out).not.toContain("secret-title");
    expect(out).not.toContain("secret-body");
  });

  it("3. wildcard redaction — catches nested *.diff and *.prompt fields", async () => {
    const { stream, output } = makeCapture();
    const logger = createPinoLogger({ destination: stream });

    logger.info("wildcard test", {
      payload: { diff: "NESTED DIFF", prompt: "NESTED PROMPT" },
    });
    await flush();

    const out = output();
    expect(out).toContain("[Redacted]");
    expect(out).not.toContain("NESTED DIFF");
    expect(out).not.toContain("NESTED PROMPT");
  });

  describe("4. level resolution from env", () => {
    it("LGTM_BUZZER_LOG_LEVEL=debug enables debug messages", async () => {
      const { stream, output } = makeCapture();
      const logger = createPinoLogger({
        env: { LGTM_BUZZER_LOG_LEVEL: "debug" },
        destination: stream,
      });

      logger.debug("debug-visible");
      await flush();

      expect(output()).toContain("debug-visible");
    });

    it("empty env defaults to info — debug messages are filtered", async () => {
      const { stream, output } = makeCapture();
      const logger = createPinoLogger({
        env: {},
        destination: stream,
      });

      logger.debug("should-be-filtered");
      logger.info("info-visible");
      await flush();

      const out = output();
      expect(out).not.toContain("should-be-filtered");
      expect(out).toContain("info-visible");
    });

    it("LGTM_BUZZER_LOG_LEVEL=nonsense falls back to info and emits a warn", async () => {
      const { stream, output } = makeCapture();

      // Must not throw
      createPinoLogger({
        env: { LGTM_BUZZER_LOG_LEVEL: "nonsense" },
        destination: stream,
      });
      await flush();

      const out = output();
      expect(out).toContain("nonsense");
      // pino serialises levels as numbers (40 = warn) in its default JSON format
      const parsed: unknown = JSON.parse(out.trim());
      expect(parsed).toMatchObject({ level: 40 });
    });
  });
});
