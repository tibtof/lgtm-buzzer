import { describe, it, expect } from "vitest";
import { assertSchemaConformance } from "./schema-conformance.js";

const VALID_QUIZ = JSON.stringify({
  questions: [
    {
      prompt: "What does validateEmail return for an invalid email?",
      choices: ["true", "false", "null", "throws an error"],
      correctChoiceIndex: 1,
      explanation: "Returns false for invalid email format.",
    },
  ],
});

describe("assertSchemaConformance", () => {
  it("passes for a valid quiz JSON", () => {
    const result = assertSchemaConformance(VALID_QUIZ);
    expect(result.pass).toBe(true);
  });

  it("passes for an empty output (skipped cell)", () => {
    const result = assertSchemaConformance("");
    expect(result.pass).toBe(true);
    expect(result.reason).toContain("skipped");
  });

  it("fails when output is not JSON", () => {
    const result = assertSchemaConformance("not json at all");
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("not valid JSON");
  });

  it("fails when questions array is missing", () => {
    const result = assertSchemaConformance(JSON.stringify({ something: "else" }));
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("schema validation failed");
  });

  it("fails when questions array is empty (LlmQuizSchema requires min 1)", () => {
    const result = assertSchemaConformance(JSON.stringify({ questions: [] }));
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("schema validation failed");
  });

  it("fails when correctChoiceIndex is out of bounds", () => {
    const outOfBounds = JSON.stringify({
      questions: [
        {
          prompt: "What is 2+2?",
          choices: ["3", "4"],
          correctChoiceIndex: 5,
        },
      ],
    });
    const result = assertSchemaConformance(outOfBounds);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("out of bounds");
  });

  it("fails when a question prompt is empty string", () => {
    const emptyPrompt = JSON.stringify({
      questions: [
        {
          prompt: "",
          choices: ["a", "b"],
          correctChoiceIndex: 0,
        },
      ],
    });
    const result = assertSchemaConformance(emptyPrompt);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("schema validation failed");
  });

  it("passes with explanation field present", () => {
    const withExplanation = JSON.stringify({
      questions: [
        {
          prompt: "What does this function do?",
          choices: ["Validates input", "Returns null"],
          correctChoiceIndex: 0,
          explanation: "It validates the input by checking the regex.",
        },
      ],
    });
    const result = assertSchemaConformance(withExplanation);
    expect(result.pass).toBe(true);
  });

  it("passes with multiple questions", () => {
    const multiQuestion = JSON.stringify({
      questions: [
        {
          prompt: "Q1?",
          choices: ["A", "B", "C"],
          correctChoiceIndex: 0,
        },
        {
          prompt: "Q2?",
          choices: ["X", "Y"],
          correctChoiceIndex: 1,
        },
        {
          prompt: "Q3?",
          choices: ["P", "Q", "R", "S"],
          correctChoiceIndex: 2,
        },
      ],
    });
    const result = assertSchemaConformance(multiQuestion);
    expect(result.pass).toBe(true);
  });
});
