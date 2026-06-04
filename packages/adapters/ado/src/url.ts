import type { PRIdentifier } from "@lgtm-buzzer/core";

/** Convenience alias for the ADO-specific `PRIdentifier` variant. */
export type AdoPR = Extract<PRIdentifier, { kind: "ado" }>;

/** Strips trailing slashes from a base URL. */
const trimBase = (baseUrl: string): string => baseUrl.replace(/\/+$/, "");

/**
 * Builds the Azure DevOps REST API URL for fetching a pull request's
 * iterations list (Leg 1 of the ADR-34 multi-call chain).
 *
 * Endpoint:
 * ```
 * GET /{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{id}/iterations?api-version=7.1
 * ```
 *
 * This is the starting point of the multi-call diff orchestration (ADR-34).
 * `buildPullDiffUrl` is kept as a backward-compatible alias.
 *
 * **Diff-only invariant**: only the diff-related PR endpoints are called in
 * the multi-call implementation. No description, title, comments, work-items,
 * policies, votes, or threads are ever fetched.
 *
 * @param baseUrl - API base URL (default `"https://dev.azure.com"`). Trailing
 *   slashes are stripped.
 * @param pr - An ADO `PRIdentifier` (must have `kind: "ado"`).
 * @returns The full URL string for the PR iterations endpoint.
 */
export const buildIterationsUrl = (baseUrl: string, pr: AdoPR): string => {
  const base = trimBase(baseUrl);
  const org = encodeURIComponent(pr.org);
  const project = encodeURIComponent(pr.project);
  const repo = encodeURIComponent(pr.repo);
  return `${base}/${org}/${project}/_apis/git/repositories/${repo}/pullRequests/${pr.pullRequestId}/iterations?api-version=7.1`;
};

/**
 * Backward-compatible alias for `buildIterationsUrl`.
 *
 * Existing tests and code that call `buildPullDiffUrl` continue to work
 * unchanged. The name was updated to `buildIterationsUrl` in ADR-34 to
 * reflect that it is specifically the first leg of the multi-call chain.
 */
export const buildPullDiffUrl = buildIterationsUrl;

/**
 * Builds the URL for Leg 2 of the ADR-34 multi-call chain: the per-iteration
 * changes list.
 *
 * Endpoint:
 * ```
 * GET /{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{id}/iterations/{iterId}/changes?api-version=7.1&$top=10000&$compareTo=0
 * ```
 *
 * `$compareTo=0` diffs against the PR base (iteration 0), giving the full
 * cumulative diff. `$top=10000` requests a large page to avoid pagination for
 * typical PRs.
 *
 * @param baseUrl     - API base URL. Trailing slashes are stripped.
 * @param pr          - An ADO `PRIdentifier`.
 * @param iterationId - The numeric ID of the iteration to fetch changes for.
 * @returns           The full URL string.
 */
export const buildChangesUrl = (
  baseUrl: string,
  pr: AdoPR,
  iterationId: number,
): string => {
  const base = trimBase(baseUrl);
  const org = encodeURIComponent(pr.org);
  const project = encodeURIComponent(pr.project);
  const repo = encodeURIComponent(pr.repo);
  return `${base}/${org}/${project}/_apis/git/repositories/${repo}/pullRequests/${pr.pullRequestId}/iterations/${iterationId}/changes?api-version=7.1&$top=10000&$compareTo=0`;
};

/**
 * Builds the URL for Leg 3 of the ADR-34 multi-call chain: fetching a blob's
 * raw content by its Git object ID.
 *
 * Endpoint:
 * ```
 * GET /{org}/{project}/_apis/git/repositories/{repo}/blobs/{objectId}?api-version=7.1&$format=text
 * ```
 *
 * `$format=text` returns the raw file content as the response body (not a JSON
 * envelope). The caller reads the body with `response.text()`.
 *
 * @param baseUrl  - API base URL. Trailing slashes are stripped.
 * @param pr       - An ADO `PRIdentifier`.
 * @param objectId - The Git blob object ID (SHA-1 / SHA-256 hex string).
 * @returns        The full URL string.
 */
export const buildBlobUrl = (
  baseUrl: string,
  pr: AdoPR,
  objectId: string,
): string => {
  const base = trimBase(baseUrl);
  const org = encodeURIComponent(pr.org);
  const project = encodeURIComponent(pr.project);
  const repo = encodeURIComponent(pr.repo);
  return `${base}/${org}/${project}/_apis/git/repositories/${repo}/blobs/${objectId}?api-version=7.1&$format=text`;
};
