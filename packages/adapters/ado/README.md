# @lgtm-buzzer/adapter-ado

Azure DevOps VCS adapter for LGTM-Buzzer.

**Status: IMPLEMENTED, PENDING LIVE-INSTANCE VALIDATION**

The adapter implements the full multi-call diff orchestration (ADR-34) against
the documented ADO REST API 7.1 shapes. It has been validated only with
synthetic, hand-authored fixtures. No live ADO instance was available during
development. See "Pending live validation" below for the exact list of
unverified assumptions.

## How it works

ADO exposes no single endpoint that returns a unified-diff string (unlike
GitHub's `Accept: application/vnd.github.v3.diff`). The adapter orchestrates
five legs to synthesise one:

1. **Iterations list** — `GET …/pullRequests/{id}/iterations?api-version=7.1`
   → pick the iteration with the maximum `id` (latest head of the PR).
2. **Changes list** — `GET …/iterations/{iterId}/changes?api-version=7.1&$top=10000&$compareTo=0`
   → list of changed files with change types, object IDs, and binary metadata.
3. **Blob fetches** (per non-binary file) —
   `GET …/blobs/{objectId}?api-version=7.1&$format=text`
   → old-side and/or new-side raw file content.
4. **Unified-diff synthesis** — per-file sections rendered by the pure
   `renderFileDiff` helper from `@lgtm-buzzer/adapter-shared`; sections
   concatenated with `renderUnifiedDiff`.
5. **Brand as `Diff`** — the concatenated string is branded and returned to
   the core dispatcher.

The entire chain is a **single composed `IO<VCSProviderError, Diff>`** (no
intermediate `unsafeRun()`), honouring ADR-33's cancellation contract.

## Endpoint allowlist (binding)

Only these three endpoint families are ever called:

| Leg | Endpoint family |
|-----|----------------|
| 1   | `…/pullRequests/{id}/iterations` |
| 2   | `…/pullRequests/{id}/iterations/{iterId}/changes` |
| 3   | `…/repositories/{repo}/blobs/{objectId}` |

**Forbidden on all paths**: `…/threads`, `…/comments`, `…/workItems`,
`…/reviewers`, `…/votes`, `…/policy*`, the PR root
`…/pullRequests/{id}` (which carries description/title), and
`…/diffs/commits`. No PR description, title, commit message, or comment text
ever enters the orchestration.

This invariant is enforced by test case #2 (BINDING #2 per ADR-34), which
asserts the positive allowlist of recorded `.get()` URIs.

## Safety properties

- **PAT never in error payloads**: no `detail` or `raw` field can contain
  the configured token. Tested across all error paths (test #3).
- **All-or-nothing**: any leg failure → the whole `fetchDiff` fails. No
  partial diff is ever returned (test #8).
- **Incremental 2 MiB cap**: applied after each file's rendered section is
  appended. Short-circuits mid-chain without fetching the remaining files
  (test #7).
- **Binary stub without fetch**: files detected as binary via
  `contentMetadata.isBinary` are emitted as
  `Binary files a/<path> and b/<path> differ` with no blob calls (test #9).
- **Cancellation**: the IO is forked by the host dispatcher (ADR-33). When
  the user closes the modal, the fiber is cancelled; the in-flight blob fetch
  aborts; no `Diff` is produced (test #11).

## Pending live validation

The following assumptions about the ADO REST API 7.1 were made from
documentation only. Each is marked `// ASSUMPTION (ADR-34, unverified against
live ADO)` in the source. A live-instance validation run should check each:

| # | Assumption | Source file |
|---|-----------|-------------|
| 1 | The iteration-changes endpoint uses the top-level key `changeEntries` (not `changes`). | `schemas.ts` |
| 2 | `item.contentMetadata.isBinary` is a boolean field present on blob entries in the changes response. | `schemas.ts`, `changes.ts` |
| 3 | `item.objectId` and `item.originalObjectId` are direct fields on the change item (not nested under `item.commitId` or similar). | `schemas.ts` |
| 4 | `originalPath` is the field name for the old path on renamed entries. | `schemas.ts`, `changes.ts` |
| 5 | `$format=text` on the blobs endpoint returns the raw file content as the response body (not a JSON envelope). | `url.ts`, `provider.ts` |
| 6 | `$compareTo=0` on the changes endpoint diffs against the PR base (iteration 0), giving the full PR diff. | `url.ts` |
| 7 | `gitObjectType === "tree"` (lowercase) identifies directory entries. | `changes.ts` |

When a live ADO org becomes available, run:

```bash
LGTM_BUZZER_ADO_TOKEN=<PAT> npm run record:ado --workspace=@lgtm-buzzer/adapter-ado
```

and replace the synthetic fixtures in `fixtures/` with recorded ones.

## Running tests

```bash
# Unit tests (no live ADO required)
npm test --workspace=@lgtm-buzzer/adapter-ado

# With httptape replay (once synthetic or recorded fixtures are in fixtures/)
LGTM_BUZZER_ADO_HTTPTAPE_URL=http://127.0.0.1:54322 npm test \
  --workspace=@lgtm-buzzer/adapter-ado
```
