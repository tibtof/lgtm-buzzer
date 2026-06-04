export { spawnIO } from "./spawn-io.js";
export type { SpawnError, SpawnOutput } from "./errors.js";
export type { SpawnOptions } from "./spawn-io.js";
export { SYSTEM_PROMPT, buildUserMessage } from "./prompt.js";
export { defaultIdGenerator } from "./ids.js";
export type { IdGenerator } from "./ids.js";
export {
  LlmQuestionSchema,
  LlmQuizSchema,
  CODE_FENCE_RE,
  MAX_RAW_BYTES,
  clipRaw,
  parseQuizFromText,
} from "./quiz-from-text.js";
export {
  DEFAULT_CONTEXT_LINES,
  renderFileDiff,
  renderUnifiedDiff,
} from "./unified-diff.js";
export type { DiffFile } from "./unified-diff.js";
