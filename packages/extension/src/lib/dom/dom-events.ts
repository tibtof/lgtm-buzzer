import { z } from "zod";
import {
  PRIdentifierSchema,
  QuizDTOSchema,
  QuizResultPayloadSchema,
  SubmittedAnswerSchema,
  ErrorReasonSchema,
} from "@lgtm-buzzer/protocol";

/**
 * Namespaced DOM event name constants for the CS ↔ modal pub/sub channel.
 *
 * All events carry a zod-validated `detail` object. The modal subscribes to
 * `quizRequest` and `quizResult`; the CS listens for `quizSubmit`,
 * `quizCancel`, and `quizRetry`. This decoupling means #42 (CS) and #43
 * (modal) ship independently.
 */
export const DOM_EVENTS = {
  quizRequest: "lgtm-buzzer:quiz-request",
  quizResult: "lgtm-buzzer:quiz-result",
  quizSubmit: "lgtm-buzzer:quiz-submit",
  quizCancel: "lgtm-buzzer:quiz-cancel",
  quizRetry: "lgtm-buzzer:quiz-retry",
} as const;

/**
 * Detail carried by `lgtm-buzzer:quiz-request` (CS → modal).
 *
 * `requestId` is a per-Approve-click identifier owned by the controller.
 * `correlationId` is the wire-level correlation id used in the Frame sent to
 * the SW and host.
 * `pr` carries only PR coordinates — no description, title, or comments.
 */
export const QuizRequestEventDetailSchema = z.object({
  requestId: z.string().min(1),
  correlationId: z.string().min(1),
  pr: PRIdentifierSchema,
});

/** The detail object for a `lgtm-buzzer:quiz-request` custom event. */
export type QuizRequestEventDetail = z.infer<typeof QuizRequestEventDetailSchema>;

/**
 * Detail carried by `lgtm-buzzer:quiz-result` (CS → modal).
 *
 * `outcome` is a discriminated union so the modal can branch exhaustively:
 * - `quiz-ready` — quiz received from host; modal should render the quiz.
 * - `quiz-passed` — user answered correctly; Approve is proceeding.
 * - `quiz-failed` — user answered incorrectly; Approve blocked.
 * - `error` — a transport or schema error; modal should show an error state.
 */
export const QuizResultEventDetailSchema = z.object({
  requestId: z.string().min(1),
  outcome: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("quiz-ready"), quiz: QuizDTOSchema }),
    z.object({ kind: z.literal("quiz-passed"), result: QuizResultPayloadSchema }),
    z.object({ kind: z.literal("quiz-failed"), result: QuizResultPayloadSchema }),
    z.object({
      kind: z.literal("error"),
      reason: ErrorReasonSchema,
      message: z.string().min(1),
    }),
  ]),
});

/** The detail object for a `lgtm-buzzer:quiz-result` custom event. */
export type QuizResultEventDetail = z.infer<typeof QuizResultEventDetailSchema>;

/**
 * Detail carried by `lgtm-buzzer:quiz-submit` (modal → CS).
 *
 * The modal dispatches this after the user selects answers and submits.
 * `quizId` is the id received in the `quiz-ready` outcome.
 */
export const QuizSubmitEventDetailSchema = z.object({
  requestId: z.string().min(1),
  quizId: z.string().min(1),
  answers: z.array(SubmittedAnswerSchema).min(1),
});

/** The detail object for a `lgtm-buzzer:quiz-submit` custom event. */
export type QuizSubmitEventDetail = z.infer<typeof QuizSubmitEventDetailSchema>;

/**
 * Detail carried by `lgtm-buzzer:quiz-cancel` (modal → CS).
 *
 * The modal dispatches this when the user closes the quiz dialog without
 * submitting. The CS drops the pending state; the SW's 60s timeout cleans
 * the host side.
 */
export const QuizCancelEventDetailSchema = z.object({
  requestId: z.string().min(1),
});

/** The detail object for a `lgtm-buzzer:quiz-cancel` custom event. */
export type QuizCancelEventDetail = z.infer<typeof QuizCancelEventDetailSchema>;

/**
 * Detail carried by `lgtm-buzzer:quiz-retry` (modal → CS).
 *
 * Fired when the user clicks Retry in `error` state or Try Again in
 * `failed` state. The CS re-emits a fresh `quiz-request` with a new
 * requestId and correlationId, so the old correlation map slot is not reused.
 */
export const QuizRetryEventDetailSchema = z.object({
  requestId: z.string().min(1),
});

/** The detail object for a `lgtm-buzzer:quiz-retry` custom event. */
export type QuizRetryEventDetail = z.infer<typeof QuizRetryEventDetailSchema>;

/**
 * Emits a `CustomEvent` with the given name and detail on `doc`.
 *
 * @param doc - The document on which to dispatch the event.
 * @param name - The event name (use one of the `DOM_EVENTS` constants).
 * @param detail - The validated detail payload.
 */
export const emitDOMEvent = (
  doc: Document,
  name: string,
  detail: unknown,
): void => {
  doc.dispatchEvent(new CustomEvent(name, { detail, bubbles: false }));
};

/** Logger interface used by `addDOMEventListener`. */
export type DOMEventLogger = {
  readonly warn: (msg: string, ctx?: Record<string, unknown>) => void;
};

/**
 * Adds a type-safe listener for a custom DOM event whose `detail` is
 * validated by the given zod schema.
 *
 * Malformed detail payloads are logged and dropped — the listener callback
 * is not invoked. This ensures the controller never receives untrusted data
 * from the modal (or from a compromised page that happens to dispatch the same
 * event name).
 *
 * @param doc - The document on which to add the listener.
 * @param name - The event name.
 * @param schema - Zod schema to validate `event.detail`.
 * @param callback - Called with the parsed, type-safe detail.
 * @param logger - Optional logger for validation warnings.
 * @returns A dispose function that removes the listener.
 */
export const addDOMEventListener = <T>(
  doc: Document,
  name: string,
  schema: z.ZodType<T>,
  callback: (detail: T) => void,
  logger?: DOMEventLogger,
): (() => void) => {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    const parsed = schema.safeParse(detail);
    if (!parsed.success) {
      logger?.warn(`[lgtm-buzzer:cs] malformed ${name} detail — dropped`, {
        issues: parsed.error.issues,
      });
      return;
    }
    callback(parsed.data);
  };

  doc.addEventListener(name, handler);
  return () => { doc.removeEventListener(name, handler); };
};
