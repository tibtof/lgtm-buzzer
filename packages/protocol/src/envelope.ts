import { z } from "zod";
import { PingFrameSchema } from "./messages/ping.js";
import { PongFrameSchema } from "./messages/pong.js";
import { ErrorFrameSchema } from "./messages/error.js";
import { QuizRequestFrameSchema } from "./messages/quiz-request.js";
import { QuizResponseFrameSchema } from "./messages/quiz-response.js";
import { QuizResampleRequestFrameSchema } from "./messages/quiz-resample-request.js";
import { QuizSubmitFrameSchema } from "./messages/quiz-submit.js";
import { QuizResultFrameSchema } from "./messages/quiz-result.js";
import { ListAdaptersRequestFrameSchema } from "./messages/list-adapters-request.js";
import { ListAdaptersResponseFrameSchema } from "./messages/list-adapters-response.js";
import { CheckAuthRequestFrameSchema } from "./messages/check-auth-request.js";
import { CheckAuthResponseFrameSchema } from "./messages/check-auth-response.js";
import { QuizProgressFrameSchema } from "./messages/quiz-progress.js";
import { QuizCancelRequestFrameSchema } from "./messages/quiz-cancel-request.js";

export { PROTOCOL_VERSION, EnvelopeBase } from "./base.js";

/** Zod schema for the full discriminated union of all supported native-messaging frames. */
export const FrameSchema = z.discriminatedUnion("kind", [
  PingFrameSchema,
  PongFrameSchema,
  ErrorFrameSchema,
  QuizRequestFrameSchema,
  QuizResponseFrameSchema,
  QuizResampleRequestFrameSchema,
  QuizSubmitFrameSchema,
  QuizResultFrameSchema,
  ListAdaptersRequestFrameSchema,
  ListAdaptersResponseFrameSchema,
  CheckAuthRequestFrameSchema,
  CheckAuthResponseFrameSchema,
  QuizProgressFrameSchema,
  QuizCancelRequestFrameSchema,
]);

/** A well-formed native-messaging frame after parsing. */
export type Frame = z.infer<typeof FrameSchema>;

/** The `kind` discriminator of any valid frame. */
export type FrameKind = Frame["kind"];
