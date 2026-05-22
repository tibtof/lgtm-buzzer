import { describe, it, expect } from "vitest";
import {
  classifyError,
  errorClassToUI,
  PORT_ERROR_MARKERS,
  QUIZ_FLOW_ERROR_MARKERS,
  INSTALL_HOST_URL,
  type DisplayErrorClass,
} from "./error-classes.js";

// ---------------------------------------------------------------------------
// 1–8. classifyError — internal reason with marker strings
// ---------------------------------------------------------------------------

describe("classifyError — internal reason transport markers", () => {
  it('1. "host disconnected" → host-unreachable', () => {
    expect(classifyError("internal", "host disconnected")).toEqual({
      kind: "host-unreachable",
    });
  });

  it('2. "host did not respond" → host-timeout', () => {
    expect(classifyError("internal", "host did not respond")).toEqual({
      kind: "host-timeout",
    });
  });

  it('3. "Unexpected reply kind: ping" → host-unexpected-reply { replyKind: "ping" }', () => {
    expect(classifyError("internal", "Unexpected reply kind: ping")).toEqual({
      kind: "host-unexpected-reply",
      replyKind: "ping",
    });
  });

  it('4. "connect failed: ENOENT" → host-unreachable', () => {
    expect(classifyError("internal", "connect failed: ENOENT")).toEqual({
      kind: "host-unreachable",
    });
  });

  it('5. "sendFrame threw: TypeError" → transport-internal', () => {
    const result = classifyError("internal", "sendFrame threw: TypeError");
    expect(result.kind).toBe("transport-internal");
  });

  it('6. "invalid SW response" → transport-internal', () => {
    const result = classifyError("internal", "invalid SW response");
    expect(result.kind).toBe("transport-internal");
  });

  it('7. "replay failed: Error" → transport-internal', () => {
    const result = classifyError("internal", "replay failed: Error");
    expect(result.kind).toBe("transport-internal");
  });

  it('8. unknown internal message → internal (genuine host-side)', () => {
    expect(classifyError("internal", "some other thing")).toEqual({
      kind: "internal",
    });
  });
});

// ---------------------------------------------------------------------------
// 9–16. classifyError — 1:1 wire reason mapping
// ---------------------------------------------------------------------------

describe("classifyError — 1:1 wire reason mapping", () => {
  const cases: Array<{ reason: Parameters<typeof classifyError>[0]; expected: DisplayErrorClass }> = [
    { reason: "schema-violation",        expected: { kind: "schema-violation" } },
    { reason: "unknown-message",         expected: { kind: "unknown-message" } },
    { reason: "version-mismatch",        expected: { kind: "version-mismatch" } },
    { reason: "unknown-quiz-id",         expected: { kind: "unknown-quiz-id" } },
    { reason: "unsupported-llm-adapter", expected: { kind: "unsupported-llm-adapter" } },
    { reason: "unsupported-vcs-adapter", expected: { kind: "unsupported-vcs-adapter" } },
    { reason: "bad-credentials",         expected: { kind: "bad-credentials" } },
    { reason: "missing-credentials",     expected: { kind: "missing-credentials" } },
  ];

  for (const { reason, expected } of cases) {
    it(`${reason} → ${expected.kind}`, () => {
      expect(classifyError(reason, "irrelevant message")).toEqual(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// 17. errorClassToUI — exhaustive: every variant returns non-empty title+body
// ---------------------------------------------------------------------------

describe("errorClassToUI — exhaustive title + body", () => {
  const allClasses: DisplayErrorClass[] = [
    { kind: "host-unreachable" },
    { kind: "host-timeout" },
    { kind: "host-unexpected-reply", replyKind: "ping" },
    { kind: "transport-internal", detail: "sendFrame threw: x" },
    { kind: "schema-violation" },
    { kind: "unknown-message" },
    { kind: "version-mismatch" },
    { kind: "internal" },
    { kind: "unknown-quiz-id" },
    { kind: "unsupported-llm-adapter" },
    { kind: "unsupported-vcs-adapter" },
    { kind: "bad-credentials" },
    { kind: "missing-credentials" },
  ];

  for (const cls of allClasses) {
    it(`${cls.kind}: returns non-empty title and body`, () => {
      const spec = errorClassToUI(cls);
      expect(spec.title.length).toBeGreaterThan(0);
      expect(spec.body.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// 18. errorClassToUI — specific CTA assertions
// ---------------------------------------------------------------------------

describe("errorClassToUI — specific CTA assertions", () => {
  it('host-unreachable → install-host CTA pointing to README', () => {
    const spec = errorClassToUI({ kind: "host-unreachable" });
    expect(spec.cta?.action.kind).toBe("install-host");
    if (spec.cta?.action.kind === "install-host") {
      expect(spec.cta.action.url).toBe(INSTALL_HOST_URL);
    }
  });

  it('host-timeout → retry CTA', () => {
    expect(errorClassToUI({ kind: "host-timeout" }).cta?.action.kind).toBe("retry");
  });

  it('bad-credentials → open-options CTA', () => {
    expect(errorClassToUI({ kind: "bad-credentials" }).cta?.action.kind).toBe("open-options");
  });

  it('missing-credentials → open-options CTA', () => {
    expect(errorClassToUI({ kind: "missing-credentials" }).cta?.action.kind).toBe("open-options");
  });

  it('schema-violation → install-host CTA', () => {
    expect(errorClassToUI({ kind: "schema-violation" }).cta?.action.kind).toBe("install-host");
  });

  it('version-mismatch → install-host CTA', () => {
    expect(errorClassToUI({ kind: "version-mismatch" }).cta?.action.kind).toBe("install-host");
  });

  it('unsupported-llm-adapter → open-options CTA', () => {
    expect(errorClassToUI({ kind: "unsupported-llm-adapter" }).cta?.action.kind).toBe("open-options");
  });

  it('unsupported-vcs-adapter → open-options CTA', () => {
    expect(errorClassToUI({ kind: "unsupported-vcs-adapter" }).cta?.action.kind).toBe("open-options");
  });

  it('internal → retry CTA', () => {
    expect(errorClassToUI({ kind: "internal" }).cta?.action.kind).toBe("retry");
  });

  it('unknown-quiz-id → retry CTA', () => {
    expect(errorClassToUI({ kind: "unknown-quiz-id" }).cta?.action.kind).toBe("retry");
  });
});

// ---------------------------------------------------------------------------
// 19. Marker-drift canary: assert every marker value is recognised by classifyError
// ---------------------------------------------------------------------------

describe("Marker-drift canary", () => {
  it("PORT_ERROR_MARKERS.hostDisconnected is classified as host-unreachable", () => {
    expect(classifyError("internal", PORT_ERROR_MARKERS.hostDisconnected)).toEqual({
      kind: "host-unreachable",
    });
  });

  it("PORT_ERROR_MARKERS.hostNoResponse is classified as host-timeout", () => {
    expect(classifyError("internal", PORT_ERROR_MARKERS.hostNoResponse)).toEqual({
      kind: "host-timeout",
    });
  });

  it("PORT_ERROR_MARKERS.connectFailed prefix is classified as host-unreachable", () => {
    const msg = `${PORT_ERROR_MARKERS.connectFailed} ENOENT /usr/local/bin/lgtm-host`;
    expect(classifyError("internal", msg)).toEqual({ kind: "host-unreachable" });
  });

  it("QUIZ_FLOW_ERROR_MARKERS.invalidSwResponse is classified as transport-internal", () => {
    expect(classifyError("internal", QUIZ_FLOW_ERROR_MARKERS.invalidSwResponse).kind).toBe(
      "transport-internal",
    );
  });

  it("QUIZ_FLOW_ERROR_MARKERS.unexpectedReplyKindPrefix is classified as host-unexpected-reply", () => {
    const msg = `${QUIZ_FLOW_ERROR_MARKERS.unexpectedReplyKindPrefix} quiz-response`;
    expect(classifyError("internal", msg).kind).toBe("host-unexpected-reply");
  });

  it("QUIZ_FLOW_ERROR_MARKERS.sendFrameThrewPrefix is classified as transport-internal", () => {
    const msg = `${QUIZ_FLOW_ERROR_MARKERS.sendFrameThrewPrefix} TypeError: network error`;
    expect(classifyError("internal", msg).kind).toBe("transport-internal");
  });

  it("QUIZ_FLOW_ERROR_MARKERS.replayFailedPrefix is classified as transport-internal", () => {
    const msg = `${QUIZ_FLOW_ERROR_MARKERS.replayFailedPrefix} DOMException`;
    expect(classifyError("internal", msg).kind).toBe("transport-internal");
  });

  it("QUIZ_FLOW_ERROR_MARKERS.noActivePr results in internal (no active PR is a genuine state error)", () => {
    // "no active PR" is used in the error-state dead-end path — it falls through
    // to the genuine-internal fallback since it is not a transport marker.
    const result = classifyError("internal", QUIZ_FLOW_ERROR_MARKERS.noActivePr);
    // It should classify as "internal" (genuine host-side fallback) because "no active PR"
    // is a quiz-flow-level dead-end, not a transport marker.
    expect(result.kind).toBe("internal");
  });
});
