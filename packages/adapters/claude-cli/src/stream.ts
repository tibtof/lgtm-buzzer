/**
 * ADR-36: pure streaming-signal reducer for the claude-cli `--output-format
 * stream-json` NDJSON event stream.
 *
 * The Claude Code CLI emits one JSON object per newline when invoked with
 * `--print --output-format stream-json --verbose`. Observed event shape
 * (verified against claude@2.1.165):
 *
 *   {"type":"system",    "subtype":"init", ...}
 *   {"type":"assistant", "message":{"content":[{"type":"text","text":"..."}],...}, ...}
 *   {"type":"rate_limit_event", ...}   // may be absent
 *   {"type":"result",    "subtype":"success", "result":"<full model text>", ...}
 *
 * There may be multiple "assistant" lines as the model streams its response.
 * The terminal "result" line carries the COMPLETE model text in its `result`
 * field — identical in content to `--output-format json`'s `.result` field.
 *
 * This module is pure: no I/O, no node:*, no monadyssey. The reducer is
 * called synchronously from the spawnIO `onLine` callback.
 *
 * SECURITY (ADR-36 §7): this module emits ONLY `QuizGenerationSignal` values
 * (stage enum + clamped integer). It MUST NOT forward raw stream text,
 * prompt content, or diff bytes. Any string matching inside this file is used
 * solely to extract structural signals (event type, delimiter count).
 */

import type { QuizGenerationSignal } from "@lgtm-buzzer/core";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Immutable reducer state threaded through `mapStreamLine` calls.
 *
 * `accumulated` holds the concatenated assistant text seen so far. It is
 * used exclusively for counting `"prompt":` delimiters (never forwarded).
 * `questionsWritten` is the clamped, monotonically increasing count.
 */
export type StreamState = {
  readonly stage: "thinking" | "writing";
  readonly accumulated: string;
  readonly questionsWritten: number;
};

/** Initial state: LLM has not yet emitted any visible content. */
export const initialStreamState: StreamState = {
  stage: "thinking",
  accumulated: "",
  questionsWritten: 0,
};

// ---------------------------------------------------------------------------
// NDJSON line discriminator
// ---------------------------------------------------------------------------

/**
 * Try to parse one NDJSON line from the claude CLI stream.
 *
 * Returns `null` on malformed or unrecognised lines — the caller should
 * treat those as no-ops (ADR-36: malformed lines are ignored, never affecting
 * the real parse that runs on the complete buffer after spawn).
 */
const parseStreamLine = (
  line: string,
): { type: "system" | "assistant" | "result" | "other"; text?: string } | null => {
  if (line.trim() === "") return null;
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const rec = obj as Record<string, unknown>;
  const type = rec["type"];
  if (type === "system") return { type: "system" };
  if (type === "result") return { type: "result" };
  if (type === "assistant") {
    // Extract concatenated text content from message.content array.
    const msg = rec["message"];
    if (typeof msg !== "object" || msg === null) return { type: "assistant" };
    const content = (msg as Record<string, unknown>)["content"];
    if (!Array.isArray(content)) return { type: "assistant" };
    const text = content
      .filter(
        (c): c is { type: "text"; text: string } =>
          typeof c === "object" &&
          c !== null &&
          (c as Record<string, unknown>)["type"] === "text" &&
          typeof (c as Record<string, unknown>)["text"] === "string",
      )
      .map((c) => c.text)
      .join("");
    return { type: "assistant", text };
  }
  return { type: "other" };
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Pure reducer: advance `StreamState` by one NDJSON line and optionally
 * emit a `QuizGenerationSignal`.
 *
 * Rules (ADR-36 §2):
 * - `system/init`  → no signal; state unchanged (still thinking).
 * - `assistant` with non-empty text → if first assistant event, transition
 *   stage from `"thinking"` to `"writing"` and emit `{ kind: "thinking" }`
 *   immediately followed by a `"writing"` signal on the NEXT call. To keep
 *   the reducer single-signal-per-call we emit `"thinking"` on the first
 *   assistant event (acknowledging the model is working) and flip to
 *   `"writing"` so subsequent events emit `"writing"` with the growing count.
 * - `result` / unrecognised → no signal.
 * - Malformed line → no signal; state unchanged.
 *
 * `poolSize` is used to clamp `questionsWritten` to `[0, poolSize]`.
 *
 * SECURITY: the `accumulated` field is ONLY used for counting the number of
 * `"prompt":` delimiters. The delimiter string itself and the count (an int)
 * are the only information that escapes this function — never the raw text.
 *
 * @param line - One complete NDJSON line (newline stripped).
 * @param state - Current reducer state.
 * @param poolSize - Upper bound for `questionsWritten` clamping.
 * @returns Updated state and an optional signal to emit.
 */
export const mapStreamLine = (
  line: string,
  state: StreamState,
  poolSize: number,
): { readonly state: StreamState; readonly signal?: QuizGenerationSignal } => {
  const parsed = parseStreamLine(line);
  if (parsed === null) return { state };

  switch (parsed.type) {
    case "system":
    case "result":
    case "other":
      return { state };

    case "assistant": {
      const text = parsed.text ?? "";
      // Accumulate text for delimiter counting. NEVER forwarded outside.
      const newAccumulated = state.accumulated + text;

      // Count `"prompt":` occurrences in the accumulated text (best-effort).
      // One occurrence per question object in the LLM's JSON output.
      const promptKeyRegex = /"prompt"\s*:/g;
      let count = 0;
      while (promptKeyRegex.exec(newAccumulated) !== null) {
        count++;
      }
      const clampedCount = Math.min(count, Math.max(0, poolSize));

      const newState: StreamState = {
        stage: "writing",
        accumulated: newAccumulated,
        questionsWritten: clampedCount,
      };

      if (state.stage === "thinking") {
        // First assistant event: emit "thinking" to mark LLM is processing,
        // then the next call will be in "writing" state.
        // Per ADR-36: emit "thinking" on first assistant event then flip.
        return {
          state: newState,
          signal: { kind: "thinking" },
        };
      }

      // Already in writing — emit updated writing signal.
      const signal: QuizGenerationSignal = {
        kind: "writing",
        questionsWritten: clampedCount,
      };
      return { state: newState, signal };
    }
  }
};
