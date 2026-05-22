import { describe, expect, it } from "vitest";
import type { ChoiceId, QuestionId, QuizId } from "@lgtm-buzzer/core";
import type { IdGenerator } from "./ids.js";
import { parseResponse } from "./response.js";

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
  it("happy path: returns Right<Quiz> for valid quiz JSON in raw stdout", () => {
    const result = parseResponse(minimalQuizJson(), makeCounterIds());
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
    const ids = makeCounterIds();
    const result = parseResponse(modelJson, ids);
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
    const result = parseResponse(modelJson, makeCounterIds());
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
    const result = parseResponse(minimalQuizJson(), makeCounterIds());
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
    const result = parseResponse(fenced, makeCounterIds());
    expect(result.fold(() => "left", () => "right")).toBe("right");
  });

  it("strips plain ``` ... ``` markdown fence (no language tag)", () => {
    const fenced = "```\n" + minimalQuizJson() + "\n```";
    const result = parseResponse(fenced, makeCounterIds());
    expect(result.fold(() => "left", () => "right")).toBe("right");
  });

  it("raw stdout is not valid JSON → Left malformed-response with detail 'model-output-not-json'", () => {
    const result = parseResponse("not json at all", makeCounterIds());
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
    const result = parseResponse(badQuiz, makeCounterIds());
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
    const result = parseResponse(badIdx, makeCounterIds());
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

  it("raw field is clipped to 8 KiB on model-output-not-json", () => {
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

  it("empty questions array (LlmQuizSchema.min(1)) → Left malformed-response (quiz-schema)", () => {
    // LlmQuizSchema requires min(1) questions, so empty array fails at schema level
    const emptyQuiz = JSON.stringify({ questions: [] });
    const result = parseResponse(emptyQuiz, makeCounterIds());
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
    const result = parseResponse(modelJson, makeCounterIds());
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

  it("stdout with leading and trailing whitespace is handled correctly", () => {
    const result = parseResponse(`  \n${minimalQuizJson()}\n  `, makeCounterIds());
    expect(result.fold(() => "left", () => "right")).toBe("right");
  });
});
