import { describe, expect, it } from "vitest";
import type { ChoiceId, QuestionId, QuizId } from "@lgtm-buzzer/core";
import type { IdGenerator } from "./ids.js";
import { parseResponse, selectResultText } from "./response.js";

/** Deterministic counter-based IdGenerator for tests. */
const makeCounterIds = (): IdGenerator => {
  let q = 0;
  let c = 0;
  let qz = 0;
  return {
    quizId: () => `quiz-${++qz}` as QuizId,
    questionId: () => `question-${++q}` as QuestionId,
    choiceId: () => `choice-${++c}` as ChoiceId,
  };
};

/**
 * Build a stream-json stdout blob (ADR-36): a system line + optional assistant
 * lines + terminal result line.
 *
 * Each argument is a NDJSON line; they are joined with newlines.
 */
const streamJsonStdout = (modelJson: string, extras: string[] = []): string => {
  const systemLine = JSON.stringify({ type: "system", subtype: "init" });
  const resultLine = JSON.stringify({ type: "result", subtype: "success", result: modelJson });
  return [systemLine, ...extras, resultLine].join("\n");
};

/**
 * Single-line result (backward compat): still a valid NDJSON stream with one
 * terminal `result` line. The old `envelope()` helper shape is preserved here
 * so tests that exercised the old `--output-format json` envelope are
 * automatically covered under the new stream-json parser.
 */
const envelope = (modelJson: string): string =>
  JSON.stringify({ type: "result", subtype: "success", result: modelJson });

/** Minimal valid quiz JSON with one question. */
const minimalQuizJson = (correctIdx = 0): string =>
  JSON.stringify({
    questions: [
      {
        prompt: "What was changed?",
        choices: ["Option A", "Option B"],
        correctChoiceIndex: correctIdx,
      },
    ],
  });

describe("parseResponse", () => {
  it("happy path: returns Right<Quiz> for valid envelope + quiz JSON", () => {
    const stdout = envelope(minimalQuizJson());
    const result = parseResponse(stdout, makeCounterIds());
    expect(result.fold(() => "left", (q) => q.id)).toBe("quiz-1");
  });

  it("happy path: maps correctChoiceIndex to the correct choice's id", () => {
    const modelJson = JSON.stringify({
      questions: [
        {
          prompt: "Which was added?",
          choices: ["A", "B", "C"],
          correctChoiceIndex: 1,
        },
      ],
    });
    const stdout = envelope(modelJson);
    const ids = makeCounterIds();
    const result = parseResponse(stdout, ids);
    result.fold(
      () => {
        throw new Error("Expected Right");
      },
      (quiz) => {
        const q = quiz.questions.head;
        const allChoices = q.choices.toArray();
        const correct = allChoices.find((c) => c.id === q.correctChoiceId);
        expect(correct?.label).toBe("B");
      },
    );
  });

  it("happy path: explanation field is mapped when present", () => {
    const modelJson = JSON.stringify({
      questions: [
        {
          prompt: "Q?",
          choices: ["Yes", "No"],
          correctChoiceIndex: 0,
          explanation: "Because yes.",
        },
      ],
    });
    const result = parseResponse(envelope(modelJson), makeCounterIds());
    result.fold(
      () => {
        throw new Error("Expected Right");
      },
      (quiz) => {
        expect(quiz.questions.head.explanation).toBe("Because yes.");
      },
    );
  });

  it("happy path: explanation field is absent when not provided", () => {
    const result = parseResponse(envelope(minimalQuizJson()), makeCounterIds());
    result.fold(
      () => {
        throw new Error("Expected Right");
      },
      (quiz) => {
        expect(quiz.questions.head.explanation).toBeUndefined();
      },
    );
  });

  it("strips markdown fence ```json ... ``` before parsing", () => {
    const fenced = "```json\n" + minimalQuizJson() + "\n```";
    const stdout = envelope(fenced);
    const result = parseResponse(stdout, makeCounterIds());
    expect(result.fold(() => "left", () => "right")).toBe("right");
  });

  it("strips plain ``` ... ``` markdown fence (no language tag)", () => {
    const fenced = "```\n" + minimalQuizJson() + "\n```";
    const stdout = envelope(fenced);
    const result = parseResponse(stdout, makeCounterIds());
    expect(result.fold(() => "left", () => "right")).toBe("right");
  });

  it("stdout with no result line → Left malformed-response with detail 'no-result-event'", () => {
    const result = parseResponse("not json at all", makeCounterIds());
    result.fold(
      (e) => {
        if (e.kind !== "malformed-response") throw new Error("Expected malformed-response");
        expect(e.kind).toBe("malformed-response");
        expect(e.detail).toBe("no-result-event");
      },
      () => {
        throw new Error("Expected Left");
      },
    );
  });

  it("stdout with no result line (non-result JSON) → Left malformed-response 'no-result-event'", () => {
    const noResultEnvelope = JSON.stringify({ type: "not-result", result: "x" });
    const result = parseResponse(noResultEnvelope, makeCounterIds());
    result.fold(
      (e) => {
        if (e.kind !== "malformed-response") throw new Error("Expected malformed-response");
        expect(e.kind).toBe("malformed-response");
        expect(e.detail).toBe("no-result-event");
      },
      () => {
        throw new Error("Expected Left");
      },
    );
  });

  it("model output is not valid JSON → Left malformed-response with detail 'model-output-not-json'", () => {
    const stdout = envelope("this is not json");
    const result = parseResponse(stdout, makeCounterIds());
    result.fold(
      (e) => {
        if (e.kind !== "malformed-response") throw new Error("Expected malformed-response");
        expect(e.kind).toBe("malformed-response");
        expect(e.detail).toBe("model-output-not-json");
      },
      () => {
        throw new Error("Expected Left");
      },
    );
  });

  it("model JSON doesn't match LlmQuizSchema → Left malformed-response (quiz-schema)", () => {
    const badQuiz = JSON.stringify({ questions: [{ prompt: "Q" }] }); // missing choices and index
    const stdout = envelope(badQuiz);
    const result = parseResponse(stdout, makeCounterIds());
    result.fold(
      (e) => {
        if (e.kind !== "malformed-response") throw new Error("Expected malformed-response");
        expect(e.kind).toBe("malformed-response");
        expect(e.detail).toContain("quiz-schema");
      },
      () => {
        throw new Error("Expected Left");
      },
    );
  });

  it("correctChoiceIndex out of bounds → Left malformed-response with specific detail", () => {
    const badIdx = JSON.stringify({
      questions: [
        {
          prompt: "Q?",
          choices: ["A", "B"],
          correctChoiceIndex: 5, // out of range for 2-choice list
        },
      ],
    });
    const result = parseResponse(envelope(badIdx), makeCounterIds());
    result.fold(
      (e) => {
        if (e.kind !== "malformed-response") throw new Error("Expected malformed-response");
        expect(e.kind).toBe("malformed-response");
        expect(e.detail).toBe("correctChoiceIndex out of range");
      },
      () => {
        throw new Error("Expected Left");
      },
    );
  });

  it("raw field is clipped to 8 KiB when no result line present", () => {
    const huge = "x".repeat(9 * 1024);
    const result = parseResponse(huge, makeCounterIds());
    result.fold(
      (e) => {
        if (e.kind !== "malformed-response") throw new Error("Expected malformed-response");
        expect(e.kind).toBe("malformed-response");
        expect((e.raw ?? "").length).toBe(8 * 1024);
      },
      () => {
        throw new Error("Expected Left");
      },
    );
  });

  it("empty questions array from model (LlmQuizSchema.min(1)) → Left malformed-response (quiz-schema)", () => {
    // LlmQuizSchema requires min(1) questions, so empty array fails at schema level
    const emptyQuiz = JSON.stringify({ questions: [] });
    const stdout = envelope(emptyQuiz);
    const result = parseResponse(stdout, makeCounterIds());
    result.fold(
      (e) => {
        if (e.kind !== "malformed-response") throw new Error("Expected malformed-response");
        expect(e.kind).toBe("malformed-response");
        // Either quiz-schema (min violation) is acceptable
        expect(e.detail).toContain("quiz-schema");
      },
      () => {
        throw new Error("Expected Left");
      },
    );
  });

  it("multiple questions are all mapped correctly", () => {
    const modelJson = JSON.stringify({
      questions: [
        { prompt: "Q1?", choices: ["A", "B"], correctChoiceIndex: 0 },
        { prompt: "Q2?", choices: ["X", "Y", "Z"], correctChoiceIndex: 2 },
      ],
    });
    const result = parseResponse(envelope(modelJson), makeCounterIds());
    result.fold(
      () => {
        throw new Error("Expected Right");
      },
      (quiz) => {
        const qs = quiz.questions.toArray();
        expect(qs).toHaveLength(2);
        expect(qs[0]?.prompt).toBe("Q1?");
        expect(qs[1]?.prompt).toBe("Q2?");
      },
    );
  });

  it("stream-json stdout (multi-line NDJSON) parses correctly", () => {
    const modelJson = JSON.stringify({
      questions: [{ prompt: "What changed?", choices: ["A", "B"], correctChoiceIndex: 0 }],
    });
    const stdout = streamJsonStdout(modelJson, [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "thinking..." }] } }),
    ]);
    const result = parseResponse(stdout, makeCounterIds());
    expect(result.fold(() => "left", (q) => q.id)).toBe("quiz-1");
  });

  it("stream-json stdout picks the LAST result line when multiple present", () => {
    const firstModel = JSON.stringify({ questions: [{ prompt: "Q1?", choices: ["A"], correctChoiceIndex: 0 }] });
    const lastModel = JSON.stringify({
      questions: [
        { prompt: "Final Q1?", choices: ["A", "B"], correctChoiceIndex: 0 },
      ],
    });
    const stdout = [
      JSON.stringify({ type: "result", result: firstModel }),
      JSON.stringify({ type: "result", result: lastModel }),
    ].join("\n");
    const result = parseResponse(stdout, makeCounterIds());
    result.fold(
      () => { throw new Error("Expected Right"); },
      (quiz) => {
        expect(quiz.questions.head.prompt).toBe("Final Q1?");
      },
    );
  });
});

// ---------------------------------------------------------------------------
// selectResultText tests
// ---------------------------------------------------------------------------

describe("selectResultText", () => {
  it("returns Right with model text from a valid result line", () => {
    const modelText = "some quiz text";
    const stdout = JSON.stringify({ type: "result", result: modelText });
    const result = selectResultText(stdout);
    expect(result.fold(() => "left", (t) => t)).toBe(modelText);
  });

  it("returns Right from multi-line NDJSON stream", () => {
    const modelText = "quiz content here";
    const stdout = [
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hi" }] } }),
      JSON.stringify({ type: "result", result: modelText }),
    ].join("\n");
    const result = selectResultText(stdout);
    expect(result.fold(() => "left", (t) => t)).toBe(modelText);
  });

  it("returns Left 'no-result-event' when no result line present", () => {
    const stdout = JSON.stringify({ type: "system", subtype: "init" });
    const result = selectResultText(stdout);
    result.fold(
      (e) => {
        expect(e.kind).toBe("malformed-response");
        if (e.kind === "malformed-response") expect(e.detail).toBe("no-result-event");
      },
      () => { throw new Error("Expected Left"); },
    );
  });

  it("returns Left 'no-result-event' for empty stdout", () => {
    const result = selectResultText("");
    result.fold(
      (e) => { expect(e.kind).toBe("malformed-response"); },
      () => { throw new Error("Expected Left"); },
    );
  });

  it("returns Left 'no-result-event' for stdout with only malformed JSON", () => {
    const result = selectResultText("not json\nalso not json");
    result.fold(
      (e) => { expect(e.kind).toBe("malformed-response"); },
      () => { throw new Error("Expected Left"); },
    );
  });

  it("picks the LAST result line when multiple present", () => {
    const stdout = [
      JSON.stringify({ type: "result", result: "first" }),
      JSON.stringify({ type: "result", result: "last" }),
    ].join("\n");
    const result = selectResultText(stdout);
    expect(result.fold(() => "left", (t) => t)).toBe("last");
  });

  it("skips malformed lines and finds the result line", () => {
    const stdout = [
      "not json",
      JSON.stringify({ type: "result", result: "found me" }),
    ].join("\n");
    const result = selectResultText(stdout);
    expect(result.fold(() => "left", (t) => t)).toBe("found me");
  });
});
