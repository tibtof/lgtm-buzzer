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

  describe("ADR-22: credential redaction", () => {
    it("5a. { credentials: { apiKey: 'x' } } — top-level credentials field censored", async () => {
      const { stream, output } = makeCapture();
      const logger = createPinoLogger({ destination: stream });

      logger.info("cred test", { credentials: { apiKey: "TOP_LEVEL_CRED_VALUE" } });
      await flush();

      const out = output();
      expect(out).not.toContain("TOP_LEVEL_CRED_VALUE");
      expect(out).toContain("[Redacted]");
    });

    it("5b. { payload: { credentials: { apiKey: 'x' } } } — payload.credentials censored", async () => {
      const { stream, output } = makeCapture();
      const logger = createPinoLogger({ destination: stream });

      logger.info("payload cred test", {
        payload: { credentials: { apiKey: "PAYLOAD_CRED_VALUE" } },
      });
      await flush();

      const out = output();
      expect(out).not.toContain("PAYLOAD_CRED_VALUE");
      expect(out).toContain("[Redacted]");
    });

    it("5c. { pat: 'ghp_secret' } — *.pat censored", async () => {
      const { stream, output } = makeCapture();
      const logger = createPinoLogger({ destination: stream });

      logger.info("pat test", { pat: "ghp_PAT_SECRET_VALUE" });
      await flush();

      const out = output();
      expect(out).not.toContain("ghp_PAT_SECRET_VALUE");
      expect(out).toContain("[Redacted]");
    });

    it("5d. { token: 'abc123' } — *.token censored", async () => {
      const { stream, output } = makeCapture();
      const logger = createPinoLogger({ destination: stream });

      logger.info("token test", { token: "TOKEN_SECRET_VALUE" });
      await flush();

      const out = output();
      expect(out).not.toContain("TOKEN_SECRET_VALUE");
      expect(out).toContain("[Redacted]");
    });

    it("5e. { 'x-api-key': 'hdr_secret' } — *.x-api-key censored", async () => {
      const { stream, output } = makeCapture();
      const logger = createPinoLogger({ destination: stream });

      logger.info("x-api-key test", { "x-api-key": "XAPIKEY_SECRET_VALUE" });
      await flush();

      const out = output();
      expect(out).not.toContain("XAPIKEY_SECRET_VALUE");
      expect(out).toContain("[Redacted]");
    });

    it("5f. nested { foo: { credentials: { pat: 'ghp_x' } } } — *.credentials censored", async () => {
      const { stream, output } = makeCapture();
      const logger = createPinoLogger({ destination: stream });

      logger.info("nested cred test", {
        foo: { credentials: { pat: "NESTED_CRED_VALUE" } },
      });
      await flush();

      const out = output();
      expect(out).not.toContain("NESTED_CRED_VALUE");
      expect(out).toContain("[Redacted]");
    });

    it("5g. { apiKey: 'sk-ant-xxx' } — *.apiKey censored", async () => {
      const { stream, output } = makeCapture();
      const logger = createPinoLogger({ destination: stream });

      logger.info("apiKey test", { apiKey: "APIKEY_SECRET_VALUE" });
      await flush();

      const out = output();
      expect(out).not.toContain("APIKEY_SECRET_VALUE");
      expect(out).toContain("[Redacted]");
    });

    // ADR-29: resolver output — *.secret and secret paths are redacted.
    it("5h. { resolved: { secret: 'SECRET_xxx' } } — secret redacted (ADR-29)", async () => {
      const { stream, output } = makeCapture();
      const logger = createPinoLogger({ destination: stream });

      logger.info("resolver output", { resolved: { secret: "SECRET_RESOLVER_VALUE", detail: "via gh CLI" } });
      await flush();

      const out = output();
      expect(out).not.toContain("SECRET_RESOLVER_VALUE");
      expect(out).toContain("[Redacted]");
    });

    it("5i. detail field in resolver output is NOT redacted (only secret is)", async () => {
      const { stream, output } = makeCapture();
      const logger = createPinoLogger({ destination: stream });

      logger.info("resolver detail visible", { resolved: { secret: "SECRET_X", detail: "via gh CLI" } });
      await flush();

      const out = output();
      // detail should be visible (it's a step label, not a secret)
      expect(out).toContain("via gh CLI");
      // but secret must be redacted
      expect(out).not.toContain("SECRET_X");
    });
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
