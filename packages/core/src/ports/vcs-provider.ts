import type { IO } from "monadyssey";
import type { Either } from "monadyssey";
import { Left, Right } from "monadyssey";

/**
 * Discriminated union identifying a pull request by its VCS-specific coordinates.
 *
 * Carries only location coordinates — no description, title, labels, or
 * comments. The diff-only invariant (CLAUDE.md §Key differentiator) is
 * enforced at the type level by this shape: there is no slot for non-diff
 * text. Reviewer rejects any change that adds a non-coordinate field.
 *
 * Variants:
 * - `github` — a GitHub pull request identified by owner, repo, and PR number.
 * - `ado`    — an Azure DevOps pull request identified by org, project, repo,
 *              and pull-request ID.
 *
 * Adding GitLab (or any other VCS) is additive — the dispatcher `switch` gains
 * a new case and TS exhaustiveness checking surfaces unhandled variants.
 */
export type PRIdentifier =
  | { readonly kind: "github"; readonly owner: string; readonly repo: string; readonly number: number }
  | { readonly kind: "ado"; readonly org: string; readonly project: string; readonly repo: string; readonly pullRequestId: number };

/**
 * Branded string carrying the raw unified-diff bytes fetched from a VCS adapter.
 *
 * Branding prevents accidental coercion of any string into the LLM input.
 * Construction MUST go through either:
 * 1. A VCS adapter at the trust boundary (`rawDiffString as Diff`), or
 * 2. The `asDiff` test-fixture helper in tests.
 *
 * Branding is compile-time only. Security is enforced by the reviewer on
 * every VCS-adapter PR: the adapter MUST call the diff endpoint exclusively
 * and treat the response body as diff bytes only.
 *
 * `Diff` extends `string` so that string utilities (length checks, passing to
 * string-typed LLM parameters) work without casting.
 */
export type Diff = string & { readonly __brand: "Diff" };

/**
 * Discriminated error union for `VCSProvider.fetchDiff`.
 *
 * Source-mapping (binding for every VCS adapter):
 * - HTTP non-2xx (including 401, 403, 404, 429, 5xx) → `transport { status, detail }`
 * - HTTP network / TLS failure                        → `transport { detail }` (no `status`)
 * - Server body fails zod parse / isn't unified-diff  → `malformed-response { detail, raw? }`
 * - Adapter wall-clock budget exceeded                → `timeout { afterMs }`
 * - Fiber cancelled by caller                         → `Cancelled` runtime (ADR-10);
 *                                                        `cancelled` variant kept for forward-compat.
 *
 * 401 and 404 are folded into `transport` via the optional `status` field —
 * mirrors ADR-11's collapsed HTTP error shape. Consumers branch on `status`
 * for adapter-specific handling.
 *
 * `cancelled` is unreachable via `Err` at monadyssey@2.0.1 (ADR-10). Adapters
 * MUST NOT construct it programmatically. Kept for type contract and
 * forward-compat with a future monadyssey that surfaces it via `Err`.
 */
export type VCSProviderError =
  | { readonly kind: "transport"; readonly status?: number; readonly detail: string }
  | { readonly kind: "malformed-response"; readonly detail: string; readonly raw?: string }
  | { readonly kind: "timeout"; readonly afterMs: number }
  | { readonly kind: "cancelled" };

/**
 * Port contract for fetching a pull-request diff from a version-control system.
 *
 * `fetchDiff` receives a `PRIdentifier` and returns the raw unified diff.
 * The return type is `Diff` — not a PR record, not `{ diff, description, ... }`.
 * This encodes the diff-only invariant (CLAUDE.md §Key differentiator) at the
 * type level: no slot exists for PR description, title, commits, labels, or
 * comments.
 *
 * Adapter implementations MUST call the diff endpoint exclusively and treat
 * the response body as diff bytes only. Reviewers enforce this on every
 * VCS-adapter PR (#37, #47).
 *
 * Cancellation note (ADR-10): at monadyssey@2.0.1, cancellation is delivered
 * as the `Cancelled` runtime outcome (not as `Err<VCSProviderError>`). The
 * `cancelled` variant of `VCSProviderError` is kept for type-contract
 * completeness and forward-compat. Adapters MUST NOT construct `cancelled`
 * from a cancellation signal — that code path is unreachable at this version.
 */
export type VCSProvider = {
  readonly id: string;
  readonly fetchDiff: (input: PRIdentifier) => IO<VCSProviderError, Diff>;
};

/**
 * The error returned by `parsePRIdentifier` when the supplied URL does not
 * match any supported pull-request URL shape.
 *
 * Note: do not log the full `url` value above `debug` level — legacy ADO
 * URLs may carry tokens in query strings.
 */
export type UnsupportedURL = {
  readonly kind: "unsupported-url";
  readonly detail: string;
  readonly url: string;
};

/** Matches `https://github.com/<owner>/<repo>/pull/<number>[/...]` */
const GITHUB_PR_RE =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/;

/**
 * `https://dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/<id>[?...]`
 * Project segment may be percent-encoded (e.g. `My%20Project`).
 */
const ADO_DEV_RE =
  /^https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)(?:[/?].*)?$/;

/**
 * `https://<org>.visualstudio.com/<project>/_git/<repo>/pullrequest/<id>[?...]`
 * Legacy ADO host shape.
 */
const ADO_VS_RE =
  /^https:\/\/([^.]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)(?:[/?].*)?$/;

/**
 * Parses a pull-request URL into a typed `PRIdentifier`.
 *
 * Supports:
 * - GitHub: `https://github.com/<owner>/<repo>/pull/<number>` (optional trailing path)
 * - Azure DevOps: `https://dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/<id>`
 * - Azure DevOps (legacy): `https://<org>.visualstudio.com/<project>/_git/<repo>/pullrequest/<id>`
 *
 * Any URL that is not `https:` to a known host with a known path shape returns
 * `Left<UnsupportedURL>`. This function never throws — it returns `Right` on
 * success and `Left` on any parse failure, including malformed URLs.
 *
 * Note (security): do not log the `url` argument above `debug` level — legacy
 * ADO URLs may carry access tokens in query strings.
 *
 * @param url - The pull-request URL to parse.
 * @returns `Right<PRIdentifier>` on success; `Left<UnsupportedURL>` otherwise.
 */
export const parsePRIdentifier = (url: string): Either<UnsupportedURL, PRIdentifier> => {
  const unsupported = (detail: string): Either<UnsupportedURL, PRIdentifier> =>
    Left.pure<UnsupportedURL>({ kind: "unsupported-url", detail, url });

  const githubMatch = GITHUB_PR_RE.exec(url);
  if (githubMatch !== null) {
    const [, owner, repo, numberStr] = githubMatch;
    const number = parseInt(numberStr ?? "", 10);
    if (!owner || !repo || isNaN(number)) {
      return unsupported("Parsed GitHub URL has missing or invalid fields.");
    }
    return Right.pure({ kind: "github", owner, repo, number });
  }

  const adoDevMatch = ADO_DEV_RE.exec(url);
  if (adoDevMatch !== null) {
    const [, org, encodedProject, repo, idStr] = adoDevMatch;
    const project = decodeURIComponent(encodedProject ?? "");
    const pullRequestId = parseInt(idStr ?? "", 10);
    if (!org || !project || !repo || isNaN(pullRequestId)) {
      return unsupported("Parsed ADO dev.azure.com URL has missing or invalid fields.");
    }
    return Right.pure({ kind: "ado", org, project, repo, pullRequestId });
  }

  const adoVsMatch = ADO_VS_RE.exec(url);
  if (adoVsMatch !== null) {
    const [, org, encodedProject, repo, idStr] = adoVsMatch;
    const project = decodeURIComponent(encodedProject ?? "");
    const pullRequestId = parseInt(idStr ?? "", 10);
    if (!org || !project || !repo || isNaN(pullRequestId)) {
      return unsupported("Parsed ADO visualstudio.com URL has missing or invalid fields.");
    }
    return Right.pure({ kind: "ado", org, project, repo, pullRequestId });
  }

  // Determine a more specific error message.
  if (!url.startsWith("https://")) {
    return unsupported("URL must use the https: scheme.");
  }
  return unsupported(
    "URL does not match any supported pull-request pattern (GitHub, Azure DevOps).",
  );
};
