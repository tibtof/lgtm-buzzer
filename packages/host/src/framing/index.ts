/**
 * Length-prefixed native-messaging stdio framing for `@lgtm-buzzer/host`.
 *
 * Provides the reader and writer halves of Chrome's native-messaging wire
 * format (4-byte little-endian uint32 header + UTF-8 JSON payload).
 *
 * ADR-8 is the design contract for this module.
 */
export type { DecodeError, WriteError } from "./errors.js";
export { MAX_FRAME_BYTES, HEADER_BYTES } from "./errors.js";
export type { FrameReaderDeps, FrameReader } from "./reader.js";
export { createFrameReader } from "./reader.js";
export type { FrameWriterDeps, FrameWriter } from "./writer.js";
export { createFrameWriter, encodeFrame } from "./writer.js";
