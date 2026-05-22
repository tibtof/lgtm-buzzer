import type { PRIdentifier } from "@lgtm-buzzer/core";

/**
 * Builds the Azure DevOps REST API URL for fetching a pull request's unified diff.
 *
 * ## ADO v1 diff strategy — design decision
 *
 * ADO does not expose a single endpoint that returns a raw unified-diff string
 * the way GitHub does with `Accept: application/vnd.github.v3.diff`. The three
 * realistic options are:
 *
 * 1. **Commit-diff endpoint** —
 *    `GET /{org}/{project}/_apis/git/repositories/{repo}/diffs/commits?baseVersion={target}&targetVersion={source}`
 *    Returns a JSON object with `changes` (file paths + change types) but no
 *    per-file content. It does NOT return a diff body. Unsuitable on its own.
 *
 * 2. **Multi-call orchestration** —
 *    iterations → changes → per-file `FileDiff` requests. Complex, requires
 *    multiple round-trips, and the per-file diffs returned by the ADO API are
 *    block diffs (JSON), not unified-diff text.
 *
 * 3. **Pull-request items endpoint with diff format** —
 *    `GET /{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{id}/iterations/{iter}/changes`
 *    followed by item fetches. Still JSON, not unified diff.
 *
 * **Decision (v1)**: ADO's API cannot natively return a unified-diff string.
 * Rather than silently emit malformed output, the adapter immediately returns
 * `malformed-response { detail: "ado-multi-call-not-yet-implemented" }` until
 * a future ADR designs the multi-call strategy carefully. The URL builder is
 * provided as a structural placeholder and to enable testing of the URL
 * construction logic in isolation.
 *
 * The URL built here targets the pull-request iterations endpoint, which is the
 * first leg of the multi-call chain described above. When multi-call is
 * implemented in a future ADR, this URL becomes the real starting point.
 *
 * **Diff-only invariant**: only the diff-related PR endpoints will be called in
 * the eventual multi-call implementation. No description, title, comments,
 * work-items, policies, votes, or threads are ever fetched.
 *
 * @param baseUrl - API base URL (default `"https://dev.azure.com"`). Trailing
 *   slashes are stripped.
 * @param pr - An ADO `PRIdentifier` (must have `kind: "ado"`).
 * @returns The full URL string for the PR iterations endpoint.
 */
export const buildPullDiffUrl = (
  baseUrl: string,
  pr: Extract<PRIdentifier, { kind: "ado" }>,
): string => {
  const trimmed = baseUrl.replace(/\/+$/, "");
  const org = encodeURIComponent(pr.org);
  const project = encodeURIComponent(pr.project);
  const repo = encodeURIComponent(pr.repo);
  return `${trimmed}/${org}/${project}/_apis/git/repositories/${repo}/pullRequests/${pr.pullRequestId}/iterations?api-version=7.1`;
};
