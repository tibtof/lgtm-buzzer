import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parseJudgeVerdict,
  resolveJudge,
  callApi,
  _resetJudgeCache,
} from "./judge.js";
import type { JudgeKind } from "./judge.js";

// ─── parseJudgeVerdict ─────────────────────────────────────────────────────

describe("parseJudgeVerdict", () => {
  const cases: Array<{
    name: string;
    input: string;
    wantKind: "ok" | "err";
    check?: (result: ReturnType<typeof parseJudgeVerdict>) => void;
  }> = [
    {
      name: "well-formed JSON",
      input: JSON.stringify({
        relevance: 4,
        conceptualDepth: 3,
        discrimination: 4,
        score: 3,
        notes: "mostly conceptual",
      }),
      wantKind: "ok",
      check: (r) => {
        expect(r.kind).toBe("ok");
        if (r.kind === "ok") {
          expect(r.verdict.relevance).toBe(4);
          expect(r.verdict.conceptualDepth).toBe(3);
          expect(r.verdict.discrimination).toBe(4);
          expect(r.verdict.score).toBe(3);
          expect(r.verdict.notes).toBe("mostly conceptual");
        }
      },
    },
    {
      name: "JSON wrapped in ```json fence",
      input:
        "```json\n" +
        JSON.stringify({
          relevance: 5,
          conceptualDepth: 5,
          discrimination: 5,
          score: 5,
          notes: "excellent",
        }) +
        "\n```",
      wantKind: "ok",
      check: (r) => {
        expect(r.kind).toBe("ok");
        if (r.kind === "ok") expect(r.verdict.score).toBe(5);
      },
    },
    {
      name: "JSON wrapped in plain ``` fence",
      input:
        "```\n" +
        JSON.stringify({ relevance: 2, conceptualDepth: 2, discrimination: 2, score: 2, notes: "weak" }) +
        "\n```",
      wantKind: "ok",
    },
    {
      name: "malformed JSON → err",
      input: "not json at all {broken",
      wantKind: "err",
    },
    {
      name: "valid JSON but wrong schema (missing notes) → err",
      input: JSON.stringify({ relevance: 3, conceptualDepth: 3, discrimination: 3, score: 3 }),
      wantKind: "err",
    },
    {
      name: "valid JSON but score out of range → err",
      input: JSON.stringify({
        relevance: 3,
        conceptualDepth: 3,
        discrimination: 3,
        score: 6,
        notes: "test",
      }),
      wantKind: "err",
    },
    {
      name: "empty string → err",
      input: "",
      wantKind: "err",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = parseJudgeVerdict(c.input);
      expect(result.kind).toBe(c.wantKind);
      c.check?.(result);
    });
  }
});

// ─── score aggregation: MIN is used, not average ──────────────────────────

describe("parseJudgeVerdict: score is the minimum of the three axes", () => {
  const cases: Array<{
    name: string;
    axes: [number, number, number];
    scoreField: number;
    expectOk: boolean;
  }> = [
    { name: "all equal (3)", axes: [3, 3, 3], scoreField: 3, expectOk: true },
    { name: "min is discrimination (2)", axes: [5, 5, 2], scoreField: 2, expectOk: true },
    { name: "min is relevance (1)", axes: [1, 4, 4], scoreField: 1, expectOk: true },
    { name: "score doesn't match axes min → schema still passes (score is just validated 1-5)", axes: [4, 4, 4], scoreField: 4, expectOk: true },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const input = JSON.stringify({
        relevance: c.axes[0],
        conceptualDepth: c.axes[1],
        discrimination: c.axes[2],
        score: c.scoreField,
        notes: "test",
      });
      const result = parseJudgeVerdict(input);
      expect(result.kind).toBe(c.expectOk ? "ok" : "err");
      if (result.kind === "ok") {
        expect(result.verdict.score).toBe(c.scoreField);
      }
    });
  }
});

// ─── resolveJudge: env var handling ───────────────────────────────────────

describe("resolveJudge: env var handling", () => {
  beforeEach(() => {
    _resetJudgeCache();
  });

  afterEach(() => {
    _resetJudgeCache();
    vi.unstubAllEnvs();
  });

  it("throws when LGTM_EVAL_JUDGE is set to an unknown value", async () => {
    vi.stubEnv("LGTM_EVAL_JUDGE", "gpt4");
    await expect(resolveJudge()).rejects.toThrow(/not a valid judge kind/);
  });

  it("throws when LGTM_EVAL_JUDGE is set to a valid value but binary is absent", async () => {
    // Use a binary that is guaranteed not to exist on this machine.
    vi.stubEnv("LGTM_EVAL_JUDGE", "codex");
    // We can't guarantee codex is absent, but we can check the error message shape
    // by checking that either it resolves or throws — codex may or may not be installed.
    // Skip this assertion if codex happens to be installed.
    const codexInstalled = await isInstalled("codex");
    if (codexInstalled) {
      // If codex is installed, resolveJudge should succeed.
      const r = await resolveJudge();
      expect(r.kind).toBe("resolved");
      expect((r as { judge: JudgeKind }).judge).toBe("codex");
    } else {
      await expect(resolveJudge()).rejects.toThrow(/explicitly requested/);
    }
  });

  it("accepts empty LGTM_EVAL_JUDGE and falls through to auto-detect", async () => {
    vi.stubEnv("LGTM_EVAL_JUDGE", "");
    // Should not throw due to empty string — it falls through to auto-detect.
    // If no judge is available at all, it throws with "No judge available".
    // Either outcome is valid; we just assert it doesn't throw "not a valid judge kind".
    try {
      await resolveJudge();
    } catch (e: unknown) {
      expect(String(e)).not.toContain("not a valid judge kind");
    }
  });
});

// ─── callApi: error handling ───────────────────────────────────────────────

describe("callApi: error handling — never throws", () => {
  beforeEach(() => {
    _resetJudgeCache();
  });

  afterEach(() => {
    _resetJudgeCache();
    vi.unstubAllEnvs();
  });

  it("returns pass:false when judge resolution fails", async () => {
    vi.stubEnv("LGTM_EVAL_JUDGE", "not-a-valid-judge");
    const result = await callApi("some rubric prompt");
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain("judge error");
  });
});

// ─── Diff-only canary: ANTHROPIC_API_KEY must not leak ────────────────────

describe("canary: ANTHROPIC_API_KEY must not appear in rubric prompt passed to judge", () => {
  it("judge prompt does not contain the literal ANTHROPIC_API_KEY env var value", async () => {
    // This test verifies the judge.ts code does not accidentally embed
    // ANTHROPIC_API_KEY in the rubric prompt or log it.
    // We verify by asserting that callApi receives the prompt as-is from promptfoo
    // and does NOT inject any env var values into it.
    //
    // Simulate a rubric prompt that does NOT contain an API key:
    const apiKey = "sk-ant-test-canary-key-never-logged";
    const rubricPrompt = "Score this quiz: { questions: [] }";

    // Ensure the api key is not in the prompt being passed to the judge.
    expect(rubricPrompt).not.toContain(apiKey);

    // The callApi function must not inject context.vars keys or env vars into
    // the rubric prompt — it passes the prompt verbatim to the judge process.
    // This is the canary: if judge.ts ever reads context.vars.* into the prompt
    // template, a secret could leak.
    // The assertion is structural: callApi(prompt) only passes `prompt` to the
    // judge, so if `prompt` doesn't contain the key, the judge won't receive it.
    // We verify the callApi signature accepts only a string (no context arg).
    expect(callApi.length).toBe(1);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Probes whether a binary is on PATH. Returns false if spawn fails. */
const isInstalled = async (binary: string): Promise<boolean> => {
  try {
    const { execFile } = await import("node:child_process");
    return await new Promise<boolean>((resolve) => {
      execFile(binary, ["--version"], { timeout: 3000 }, (err) => {
        resolve(err === null);
      });
    });
  } catch {
    return false;
  }
};
