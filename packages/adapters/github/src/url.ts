import type { PRIdentifier } from "@lgtm-buzzer/core";

/**
 * Builds the GitHub REST API path for fetching a pull request's unified diff.
 *
 * The returned URL targets `GET /repos/{owner}/{repo}/pulls/{number}` with the
 * `Accept: application/vnd.github.v3.diff` header expected to be set on the
 * `HttpClient` instance. Only the diff endpoint is ever called — the diff-only
 * invariant is enforced at this level.
 *
 * @param baseUrl - API base URL (default `"https://api.github.com"`). Trailing
 *   slashes are stripped.
 * @param pr - A GitHub `PRIdentifier` (must have `kind: "github"`).
 * @returns The full URL string for the diff endpoint.
 */
export const buildPullDiffUrl = (
  baseUrl: string,
  pr: Extract<PRIdentifier, { kind: "github" }>,
): string => {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/repos/${encodeURIComponent(pr.owner)}/${encodeURIComponent(pr.repo)}/pulls/${pr.number}`;
};
