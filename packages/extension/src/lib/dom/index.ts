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
  type InterceptedApproveEvent,
} from "./approve-intercept.js";

export {
  setupAdoVoteInterceptor,
  recognizeAdoVoteClick,
  KNOWN_ADO_VOTE_TESTIDS,
  type AdoVoteVariant,
  type AdoVoteSelectorOverrides,
  type AdoInterceptedApproveEvent,
  type AdoVoteInterceptorDeps,
} from "./ado-vote-intercept.js";

export {
  createGitHubNavigationWatcher,
  createAdoNavigationWatcher,
  type NavigationWatcher,
} from "./navigation.js";

export {
  createQuizFlowController,
  type QuizFlowController,
  type QuizFlowDeps,
  type QuizFlowLogger,
  type SendFrameFn,
  type InterceptorFactory,
} from "./quiz-flow.js";

export {
  createQuizModal,
  type QuizModal,
  type QuizModalDeps,
} from "./modal.js";

export {
  createManualTriggerButton,
  type ManualTriggerButton,
  type ManualTriggerButtonDeps,
} from "./manual-trigger-button.js";
