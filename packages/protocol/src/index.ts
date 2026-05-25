export {
  PROTOCOL_VERSION,
  FrameSchema,
  type Frame,
  type FrameKind,
} from "./envelope.js";

export {
  PingPayloadSchema,
  PingFrameSchema,
  type PingPayload,
  type PingFrame,
} from "./messages/ping.js";

export {
  PongPayloadSchema,
  PongFrameSchema,
  type PongPayload,
  type PongFrame,
} from "./messages/pong.js";

export {
  ErrorReasonSchema,
  ErrorPayloadSchema,
  ErrorFrameSchema,
  type ErrorReason,
  type ErrorPayload,
  type ErrorFrame,
} from "./messages/error.js";

export {
  GitHubPRIdentifierSchema,
  AdoPRIdentifierSchema,
  PRIdentifierSchema,
  type GitHubPRIdentifierDTO,
  type AdoPRIdentifierDTO,
  type PRIdentifierDTO,
} from "./messages/pr-identifier.js";

export {
  CredentialsBagSchema,
  type CredentialsBag,
} from "./messages/credentials.js";

export {
  QuizRequestPayloadSchema,
  QuizRequestFrameSchema,
  type QuizRequestPayload,
  type QuizRequestFrame,
} from "./messages/quiz-request.js";

export {
  RESAMPLE_FAILED_PREFIX,
  QuizResampleRequestPayloadSchema,
  QuizResampleRequestFrameSchema,
  type QuizResampleRequestPayload,
  type QuizResampleRequestFrame,
} from "./messages/quiz-resample-request.js";

export {
  ChoiceDTOSchema,
  QuestionDTOSchema,
  QuizDTOSchema,
  QuizResponsePayloadSchema,
  QuizResponseFrameSchema,
  type ChoiceDTO,
  type QuestionDTO,
  type QuizDTO,
  type QuizResponsePayload,
  type QuizResponseFrame,
} from "./messages/quiz-response.js";

export {
  SubmittedAnswerSchema,
  QuizSubmitPayloadSchema,
  QuizSubmitFrameSchema,
  type SubmittedAnswer,
  type QuizSubmitPayload,
  type QuizSubmitFrame,
} from "./messages/quiz-submit.js";

export {
  PerQuestionResultSchema,
  QuizResultPayloadSchema,
  QuizResultFrameSchema,
  type PerQuestionResult,
  type QuizResultPayload,
  type QuizResultFrame,
} from "./messages/quiz-result.js";

export {
  ListAdaptersRequestPayloadSchema,
  ListAdaptersRequestFrameSchema,
  type ListAdaptersRequestPayload,
  type ListAdaptersRequestFrame,
} from "./messages/list-adapters-request.js";

export {
  ListAdaptersResponsePayloadSchema,
  ListAdaptersResponseFrameSchema,
  type ListAdaptersResponsePayload,
  type ListAdaptersResponseFrame,
} from "./messages/list-adapters-response.js";

export {
  CheckAuthRequestPayloadSchema,
  CheckAuthRequestFrameSchema,
  type CheckAuthRequestPayload,
  type CheckAuthRequestFrame,
} from "./messages/check-auth-request.js";

export {
  AuthStatusSchema,
  CheckAuthResponsePayloadSchema,
  CheckAuthResponseFrameSchema,
  type AuthStatus,
  type CheckAuthResponsePayload,
  type CheckAuthResponseFrame,
} from "./messages/check-auth-response.js";

export { parseFrame } from "./parse.js";
