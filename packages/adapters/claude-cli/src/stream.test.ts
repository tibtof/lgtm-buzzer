import { describe, expect, it } from "vitest";
import { mapStreamLine, initialStreamState } from "./stream.js";
import type { StreamState } from "./stream.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const systemLine = JSON.stringify({ type: "system", subtype: "init" });
const resultLine = JSON.stringify({ type: "result", subtype: "success", result: "quiz text" });
const rateLimitLine = JSON.stringify({ type: "rate_limit_event" });

const assistantLine = (text: string): string =>
  JSON.stringify({
    type: "assistant",
    message: {
      content: [{ type: "text", text }],
    },
  });

const assistantMultiContent = (texts: string[]): string =>
  JSON.stringify({
    type: "assistant",
    message: {
      content: texts.map((t) => ({ type: "text", text: t })),
    },
  });

// ---------------------------------------------------------------------------
// Stage transition tests
// ---------------------------------------------------------------------------

describe("mapStreamLine — stage transitions", () => {
  it("initial state is 'thinking' with empty accumulated", () => {
    expect(initialStreamState).toEqual({
      stage: "thinking",
      accumulated: "",
      questionsWritten: 0,
    });
  });

  it("system/init line → no signal, state unchanged", () => {
    const { state, signal } = mapStreamLine(systemLine, initialStreamState, 5);
    expect(signal).toBeUndefined();
    expect(state).toEqual(initialStreamState);
  });

  it("result line → no signal, state unchanged", () => {
    const { state, signal } = mapStreamLine(resultLine, initialStreamState, 5);
    expect(signal).toBeUndefined();
    expect(state).toEqual(initialStreamState);
  });

  it("rate_limit_event line → no signal, state unchanged", () => {
    const { state, signal } = mapStreamLine(rateLimitLine, initialStreamState, 5);
    expect(signal).toBeUndefined();
    expect(state).toEqual(initialStreamState);
  });

  it("first assistant event → emits 'thinking' signal, stage flips to writing", () => {
    const { state, signal } = mapStreamLine(
      assistantLine("Hello, I am thinking"),
      initialStreamState,
      5,
    );
    expect(signal).toEqual({ kind: "thinking" });
    expect(state.stage).toBe("writing");
  });

  it("second assistant event → emits 'writing' signal (not thinking again)", () => {
    const { state: s1 } = mapStreamLine(
      assistantLine("First chunk"),
      initialStreamState,
      5,
    );
    const { signal } = mapStreamLine(assistantLine("Second chunk"), s1, 5);
    expect(signal?.kind).toBe("writing");
  });

  it("assistant with empty text → still flips to writing and emits thinking", () => {
    const { state, signal } = mapStreamLine(assistantLine(""), initialStreamState, 5);
    expect(signal).toEqual({ kind: "thinking" });
    expect(state.stage).toBe("writing");
  });

  it("malformed JSON line → no signal, state unchanged", () => {
    const { state, signal } = mapStreamLine("not json at all {{{", initialStreamState, 5);
    expect(signal).toBeUndefined();
    expect(state).toEqual(initialStreamState);
  });

  it("empty line → no signal, state unchanged", () => {
    const { state, signal } = mapStreamLine("", initialStreamState, 5);
    expect(signal).toBeUndefined();
    expect(state).toEqual(initialStreamState);
  });

  it("whitespace-only line → no signal, state unchanged", () => {
    const { state, signal } = mapStreamLine("   ", initialStreamState, 5);
    expect(signal).toBeUndefined();
    expect(state).toEqual(initialStreamState);
  });
});

// ---------------------------------------------------------------------------
// questionsWritten best-effort count tests
// ---------------------------------------------------------------------------

describe("mapStreamLine — questionsWritten count", () => {
  it("counts 'prompt': delimiters in accumulated text", () => {
    const text = `{"questions":[{"prompt": "Q1?"},{"prompt": "Q2?"}]}`;
    const { state } = mapStreamLine(assistantLine(text), initialStreamState, 10);
    expect(state.questionsWritten).toBe(2);
  });

  it("count is monotonically increasing across calls", () => {
    let state: StreamState = initialStreamState;
    const lines = [
      assistantLine(`{"questions":[{"prompt": "Q1?"}`),
      assistantLine(`,{"prompt": "Q2?"}`),
      assistantLine(`,{"prompt": "Q3?"}]}`),
    ];
    const counts: number[] = [];
    for (const line of lines) {
      const result = mapStreamLine(line, state, 10);
      state = result.state;
      counts.push(state.questionsWritten);
    }
    // Counts should be non-decreasing.
    expect(counts[1]).toBeGreaterThanOrEqual(counts[0]!);
    expect(counts[2]).toBeGreaterThanOrEqual(counts[1]!);
    expect(counts[2]).toBe(3);
  });

  it("count is clamped to poolSize", () => {
    const text = `{"questions":[{"prompt":"Q1"},{"prompt":"Q2"},{"prompt":"Q3"}]}`;
    const { state } = mapStreamLine(assistantLine(text), initialStreamState, 2);
    expect(state.questionsWritten).toBeLessThanOrEqual(2);
    expect(state.questionsWritten).toBe(2);
  });

  it("count stays 0 when no prompt delimiter in text", () => {
    const { state } = mapStreamLine(
      assistantLine("I am generating your quiz now..."),
      initialStreamState,
      5,
    );
    expect(state.questionsWritten).toBe(0);
  });

  it("multi-content assistant line: all text parts are concatenated for counting", () => {
    const line = assistantMultiContent([`{"prompt":"Q1"}`, `,{"prompt":"Q2"}`]);
    const { state } = mapStreamLine(line, initialStreamState, 10);
    expect(state.questionsWritten).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Security canary: no stream/diff text escapes as signal payload
// ---------------------------------------------------------------------------

describe("mapStreamLine — security canary", () => {
  const SECRET_DIFF_CANARY = "SECRET_DIFF_CANARY_xyz123";

  it("assistant text containing canary produces signal with NO canary in payload", () => {
    const line = assistantLine(
      `This text contains ${SECRET_DIFF_CANARY} and also {"prompt":"Q1"}`,
    );
    const { signal, state } = mapStreamLine(line, initialStreamState, 5);

    // Signal may only contain kind (string enum) and questionsWritten (number).
    const signalJson = JSON.stringify(signal);
    expect(signalJson).not.toContain(SECRET_DIFF_CANARY);

    // The accumulated state also must not leak when serialized as a signal.
    // (accumulated is internal; the signal is the only exported value.)
    // We verify the signal object directly.
    if (signal !== undefined) {
      expect(signal.kind).toBe("thinking");
      // thinking signal has no questionsWritten or text fields.
      expect(Object.keys(signal)).toEqual(["kind"]);
    }

    // Verify the state's accumulated field does contain the text (internal)
    // but questionsWritten is just a number.
    expect(typeof state.questionsWritten).toBe("number");
    expect(typeof state.stage).toBe("string");
  });

  it("subsequent writing signal also contains no canary", () => {
    const writingState: StreamState = {
      stage: "writing",
      accumulated: "",
      questionsWritten: 0,
    };
    const line = assistantLine(
      `More ${SECRET_DIFF_CANARY} content with {"prompt":"Q1"}`,
    );
    const { signal } = mapStreamLine(line, writingState, 5);
    expect(JSON.stringify(signal)).not.toContain(SECRET_DIFF_CANARY);
    if (signal !== undefined) {
      expect(signal.kind).toBe("writing");
      // writing signal has kind + optional questionsWritten (a number).
      const keys = Object.keys(signal);
      expect(keys).not.toContain("text");
      expect(keys).not.toContain("accumulated");
      expect(keys).not.toContain("raw");
    }
  });
});

// ---------------------------------------------------------------------------
// Full sequence test
// ---------------------------------------------------------------------------

describe("mapStreamLine — full sequence", () => {
  it("processes a complete stream sequence: system → assistant → result", () => {
    const sequence = [
      systemLine,
      assistantLine("I will now write your quiz."),
      assistantLine(`Here are the questions: {"prompt":"What changed?","choices":["A","B"]}`),
      resultLine,
    ];

    let state: StreamState = initialStreamState;
    const signals = [];
    for (const line of sequence) {
      const result = mapStreamLine(line, state, 10);
      state = result.state;
      if (result.signal !== undefined) signals.push(result.signal);
    }

    // First assistant line → thinking
    expect(signals[0]).toEqual({ kind: "thinking" });
    // Second assistant line → writing with count
    expect(signals[1]?.kind).toBe("writing");
    // result line → no additional signal
    expect(signals).toHaveLength(2);

    // Final state is writing
    expect(state.stage).toBe("writing");
    expect(state.questionsWritten).toBe(1);
  });
});
