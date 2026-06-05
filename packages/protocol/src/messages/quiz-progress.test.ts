import { describe, it, expect } from "vitest";
import {
  QuizProgressPayloadSchema,
  QuizProgressFrameSchema,
  QuizProgressPhaseSchema,
  QuizGenerationStageSchema,
} from "./quiz-progress.js";

describe("QuizProgressPhaseSchema", () => {
  const validPhases = ["fetching-diff", "generating-quiz", "parsing", "caching"] as const;

  for (const phase of validPhases) {
    it(`accepts phase "${phase}"`, () => {
      expect(QuizProgressPhaseSchema.safeParse(phase).success).toBe(true);
    });
  }

  it("rejects unknown phase", () => {
    expect(QuizProgressPhaseSchema.safeParse("unknown-phase").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(QuizProgressPhaseSchema.safeParse("").success).toBe(false);
  });
});

describe("QuizProgressPayloadSchema", () => {
  it("accepts a valid payload with all fields", () => {
    const result = QuizProgressPayloadSchema.safeParse({
      phase: "generating-quiz",
      elapsedMs: 5000,
      expectedMs: 60000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phase).toBe("generating-quiz");
      expect(result.data.elapsedMs).toBe(5000);
      expect(result.data.expectedMs).toBe(60000);
    }
  });

  it("accepts a valid payload without optional expectedMs", () => {
    const result = QuizProgressPayloadSchema.safeParse({
      phase: "fetching-diff",
      elapsedMs: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expectedMs).toBeUndefined();
    }
  });

  it("accepts elapsedMs = 0", () => {
    expect(
      QuizProgressPayloadSchema.safeParse({ phase: "parsing", elapsedMs: 0 }).success,
    ).toBe(true);
  });

  it("rejects negative elapsedMs", () => {
    const result = QuizProgressPayloadSchema.safeParse({
      phase: "caching",
      elapsedMs: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer elapsedMs", () => {
    const result = QuizProgressPayloadSchema.safeParse({
      phase: "caching",
      elapsedMs: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative expectedMs", () => {
    const result = QuizProgressPayloadSchema.safeParse({
      phase: "generating-quiz",
      elapsedMs: 0,
      expectedMs: -100,
    });
    expect(result.success).toBe(false);
  });

  it("strips extra fields (diff-only invariant)", () => {
    const result = QuizProgressPayloadSchema.safeParse({
      phase: "generating-quiz",
      elapsedMs: 1000,
      diffPreview: "some diff text — MUST be stripped",
      questionsGenerated: 3,
      prTitle: "My PR title — MUST be stripped",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as Record<string, unknown>;
      expect(data["diffPreview"]).toBeUndefined();
      expect(data["questionsGenerated"]).toBeUndefined();
      expect(data["prTitle"]).toBeUndefined();
    }
  });

  it("rejects missing phase", () => {
    expect(
      QuizProgressPayloadSchema.safeParse({ elapsedMs: 0 }).success,
    ).toBe(false);
  });

  it("rejects missing elapsedMs", () => {
    expect(
      QuizProgressPayloadSchema.safeParse({ phase: "parsing" }).success,
    ).toBe(false);
  });

  // ADR-36: new optional fields
  it("accepts stage='thinking' with no questionsWritten", () => {
    const result = QuizProgressPayloadSchema.safeParse({
      phase: "generating-quiz",
      elapsedMs: 500,
      stage: "thinking",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stage).toBe("thinking");
      expect(result.data.questionsWritten).toBeUndefined();
    }
  });

  it("accepts stage='writing' with questionsWritten", () => {
    const result = QuizProgressPayloadSchema.safeParse({
      phase: "generating-quiz",
      elapsedMs: 2000,
      stage: "writing",
      questionsWritten: 3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stage).toBe("writing");
      expect(result.data.questionsWritten).toBe(3);
    }
  });

  it("rejects unknown stage value", () => {
    const result = QuizProgressPayloadSchema.safeParse({
      phase: "generating-quiz",
      elapsedMs: 0,
      stage: "hallucinating",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative questionsWritten", () => {
    const result = QuizProgressPayloadSchema.safeParse({
      phase: "generating-quiz",
      elapsedMs: 0,
      questionsWritten: -1,
    });
    expect(result.success).toBe(false);
  });

  it("backward compat: old payload (no stage/questionsWritten) still parses", () => {
    const result = QuizProgressPayloadSchema.safeParse({
      phase: "generating-quiz",
      elapsedMs: 1000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stage).toBeUndefined();
      expect(result.data.questionsWritten).toBeUndefined();
    }
  });

  it("strips stage/questionsWritten alongside other unknown fields", () => {
    // Extraneous unknown field is stripped.
    const result = QuizProgressPayloadSchema.safeParse({
      phase: "generating-quiz",
      elapsedMs: 0,
      stage: "thinking",
      questionsWritten: 2,
      unknownField: "should be stripped",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as Record<string, unknown>;
      expect(data["unknownField"]).toBeUndefined();
      // Known new fields are retained.
      expect(data["stage"]).toBe("thinking");
      expect(data["questionsWritten"]).toBe(2);
    }
  });
});

describe("QuizGenerationStageSchema", () => {
  it("accepts 'thinking'", () => {
    expect(QuizGenerationStageSchema.safeParse("thinking").success).toBe(true);
  });

  it("accepts 'writing'", () => {
    expect(QuizGenerationStageSchema.safeParse("writing").success).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(QuizGenerationStageSchema.safeParse("running").success).toBe(false);
    expect(QuizGenerationStageSchema.safeParse("").success).toBe(false);
  });
});

describe("QuizProgressFrameSchema", () => {
  const validFrame = {
    v: 1,
    kind: "quiz-progress",
    correlationId: "test-correlation-id",
    payload: {
      phase: "generating-quiz",
      elapsedMs: 5000,
    },
  };

  it("round-trips a valid frame", () => {
    const result = QuizProgressFrameSchema.safeParse(validFrame);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("quiz-progress");
      expect(result.data.correlationId).toBe("test-correlation-id");
      expect(result.data.payload.phase).toBe("generating-quiz");
      expect(result.data.payload.elapsedMs).toBe(5000);
    }
  });

  it("round-trips with null correlationId", () => {
    const frame = { ...validFrame, correlationId: null };
    const result = QuizProgressFrameSchema.safeParse(frame);
    expect(result.success).toBe(true);
  });

  it("round-trips each valid phase", () => {
    const phases: Array<string> = ["fetching-diff", "generating-quiz", "parsing", "caching"];
    for (const phase of phases) {
      const result = QuizProgressFrameSchema.safeParse({
        ...validFrame,
        payload: { phase, elapsedMs: 0 },
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects wrong protocol version", () => {
    const result = QuizProgressFrameSchema.safeParse({ ...validFrame, v: 2 });
    expect(result.success).toBe(false);
  });

  it("rejects wrong kind", () => {
    const result = QuizProgressFrameSchema.safeParse({ ...validFrame, kind: "quiz-request" });
    expect(result.success).toBe(false);
  });

  it("rejects missing correlationId", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { correlationId: _cid, ...noCorr } = validFrame;
    const result = QuizProgressFrameSchema.safeParse(noCorr);
    expect(result.success).toBe(false);
  });
});
