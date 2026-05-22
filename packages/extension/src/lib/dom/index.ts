/**
 * Public surface of the `dom` module.
 *
 * Exports all types and functions used by the content-script entrypoint
 * and any future modal integration layer.
 */
export { detectPRPage, type PRPageResult } from "./page-detection.js";

export {
  DOM_EVENTS,
  QuizRequestEventDetailSchema,
  QuizResultEventDetailSchema,
  QuizSubmitEventDetailSchema,
  QuizCancelEventDetailSchema,
  emitDOMEvent,
  addDOMEventListener,
  type QuizRequestEventDetail,
  type QuizResultEventDetail,
  type QuizSubmitEventDetail,
  type QuizCancelEventDetail,
  type DOMEventLogger,
} from "./dom-events.js";

export {
  setupApproveInterceptor,
  type ApproveBlockedEvent,
  type ApproveInterceptorDeps,
} from "./approve-intercept.js";

export {
  createQuizFlowController,
  type QuizFlowController,
  type QuizFlowDeps,
  type QuizFlowLogger,
  type SendFrameFn,
} from "./quiz-flow.js";
