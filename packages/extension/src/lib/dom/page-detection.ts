import { parsePRIdentifier } from "@lgtm-buzzer/core";
import type { PRIdentifier, UnsupportedURL } from "@lgtm-buzzer/core";

/**
 * Discriminated union returned by `detectPRPage`.
 *
 * Uses a plain tagged-union shape rather than monadyssey `Either` so that
 * the `dom` layer stays Plain TS + zod (ADR-18 per-package policy).
 */
export type PRPageResult =
  | { readonly ok: true; readonly pr: PRIdentifier }
  | { readonly ok: false; readonly error: UnsupportedURL };

/**
 * Detects whether the given URL is a supported pull-request page and returns
 * the parsed `PRIdentifier` if so.
 *
 * This is a thin wrapper over `parsePRIdentifier` from `@lgtm-buzzer/core`
 * that converts the `Either` return value into a plain tagged-union result so
 * the `dom` layer has no monadyssey dependency (ADR-18 per-package policy).
 *
 * @param url - The URL to inspect (typically `window.location.href`).
 * @returns `{ ok: true, pr }` for a supported PR URL; `{ ok: false, error }` otherwise.
 */
export const detectPRPage = (url: string): PRPageResult => {
  const result = parsePRIdentifier(url);
  return result.fold(
    (error): PRPageResult => ({ ok: false, error }),
    (pr): PRPageResult => ({ ok: true, pr }),
  );
};
