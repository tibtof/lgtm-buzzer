/**
 * Azure DevOps VCS adapter — multi-call diff orchestration (ADR-34).
 *
 * Implements `VCSProvider.fetchDiff` as a single composed cancellable
 * `IO<VCSProviderError, Diff>` built by `flatMap`-composing five legs:
 *
 * 1. GET iterations list → pick max `id` (latest iteration).
 * 2. GET changes for that iteration (`$compareTo=0` for full PR diff).
 * 3. Per non-binary file: GET old blob + GET new blob by objectId.
 * 4. `renderFileDiff` per file, accumulate with incremental 2 MiB cap.
 * 5. Brand the concatenated string as `Diff`.
 *
 * Hard constraints (ADR-34, ADR-33):
 * - ONE composed `IO` — no intermediate `unsafeRun()` in the chain.
 * - All-or-nothing: any leg failure → whole `fetchDiff` fails.
 * - PAT never appears in any error payload.
 * - Cancellation propagates as `Cancelled` runtime outcome (ADR-10); never
 *   manufactured into `Err<VCSProviderError>`.
 * - Only these endpoints are called: iterations, iterations/{id}/changes,
 *   repositories/{repo}/blobs/{objectId}. No PR metadata, threads, comments.
 * - Every JSON response is zod-validated at the I/O boundary.
 *
 * Status: IMPLEMENTED, PENDING LIVE-INSTANCE VALIDATION (ADR-34 §Constraint).
 * See README for the list of unverified ADO API assumptions.
 */

import { IO } from "monadyssey";
import type { HttpClient, HttpError } from "monadyssey-fetch";
import type { VCSProvider, VCSProviderError, Diff, PRIdentifier } from "@lgtm-buzzer/core";
import { renderFileDiff, renderUnifiedDiff } from "@lgtm-buzzer/adapter-shared";
import type { DiffFile } from "@lgtm-buzzer/adapter-shared";
import { createAdoHttpClient } from "./http.js";
import { mapHttpError } from "./errors.js";
import {
  buildIterationsUrl,
  buildChangesUrl,
  buildBlobUrl,
} from "./url.js";
import type { AdoPR } from "./url.js";
import {
  AdoIterationsResponseSchema,
  AdoChangesResponseSchema,
} from "./schemas.js";
import { toDiffFiles } from "./changes.js";
import type { PlannedFile } from "./changes.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Stable identifier for the ADO VCS adapter. */
export const ADAPTER_ID = "ado" as const;

/** Default maximum diff body size in bytes (2 MiB). */
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

/** Maximum bytes kept in `raw` error payloads (8 KiB). */
const MAX_RAW_BYTES = 8 * 1024;

/** Clip a string to at most `MAX_RAW_BYTES` characters for error payloads. */
const clipRaw = (s: string): string =>
  s.length > MAX_RAW_BYTES ? s.slice(0, MAX_RAW_BYTES) : s;

/**
 * Returns `true` when the string looks like a valid unified diff or is empty.
 *
 * Mirrors the sniff used by the GitHub adapter (ADR-15). An empty PR is
 * legal (`length === 0 → true`). Non-empty strings must start with at least
 * one `diff --git ` or `--- ` line.
 */
const looksLikeUnifiedDiff = (s: string): boolean => {
  if (s.length === 0) return true;
  return /^diff --git /m.test(s) || /^--- /m.test(s);
};

/** NUL byte present in first 8 KiB → heuristic binary detection. */
const NUL_CHECK_WINDOW = 8 * 1024;

const containsNul = (content: string): boolean =>
  content.slice(0, NUL_CHECK_WINDOW).includes("\0");

// ---------------------------------------------------------------------------
// Config / Deps
// ---------------------------------------------------------------------------

/**
 * Per-instance configuration for `createAdoVcsProvider`.
 *
 * All fields except `token` are optional; defaults mirror the GitHub adapter
 * (ADR-15) with ADO-specific values.
 */
export type AdoAdapterConfig = {
  /** Required PAT. Never logged or included in error payloads. */
  readonly token: string;
  /** API base URL. Default: `"https://dev.azure.com"`. */
  readonly baseUrl?: string;
  /** Wall-clock timeout in milliseconds. Default: `30_000`. */
  readonly timeoutMs?: number;
  /** Maximum diff body size in bytes. Default: `2 * 1024 * 1024` (2 MiB). */
  readonly maxBytes?: number;
  /** Optional User-Agent override. */
  readonly userAgent?: string;
};

/**
 * Dependencies injected into `createAdoVcsProvider`.
 *
 * `config` is mandatory. `httpClient` is injectable for unit tests; when
 * omitted, a default client is constructed from `config` via
 * `createAdoHttpClient`.
 */
export type AdoAdapterDeps = {
  readonly config: AdoAdapterConfig;
  /** Injectable `HttpClient` for testing. When provided, overrides the client built from `config`. */
  readonly httpClient?: HttpClient;
};

// ---------------------------------------------------------------------------
// Orchestration helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a blob by objectId and return its text content.
 * Returns empty string immediately if `objectId` is `undefined` (no fetch).
 */
const fetchBlobContent = (
  client: HttpClient,
  blobUrl: string,
): IO<VCSProviderError, string> => {
  const getIO: IO<HttpError, Response> = client.get(blobUrl, {
    observe: "response",
  });

  return getIO
    .mapErr(mapHttpError)
    .flatMap(
      (response): IO<VCSProviderError, string> =>
        IO.lift<VCSProviderError, string>(
          () => response.text(),
          (e): VCSProviderError => ({
            kind: "transport",
            detail: `failed to read blob body: ${String(e)}`,
          }),
        ),
    );
};

/**
 * Process a single planned file:
 * - Binary files: emit stub immediately, no fetch.
 * - Pure add: fetch new blob only.
 * - Pure delete: fetch old blob only.
 * - Edit / rename: fetch both blobs.
 *
 * Returns the rendered diff section string (possibly "") and the byte length
 * of that section.
 */
const processFile = (
  client: HttpClient,
  baseUrl: string,
  pr: AdoPR,
  planned: PlannedFile,
): IO<VCSProviderError, string> => {
  // Binary shortcut — emit stub, no HTTP calls.
  if (planned.isBinary) {
    const stubBase = {
      path: planned.path,
      oldContent: "",
      newContent: "",
      changeType: planned.changeType,
      isBinary: true,
    } as const;
    // exactOptionalPropertyTypes: only include oldPath when non-undefined.
    const stubFile: DiffFile =
      planned.oldPath !== undefined
        ? { ...stubBase, oldPath: planned.oldPath }
        : stubBase;
    return IO.lift<VCSProviderError, string>(() => renderFileDiff(stubFile));
  }

  // Determine which blob URLs to fetch.
  const fetchOld: IO<VCSProviderError, string> =
    planned.oldObjectId !== undefined
      ? fetchBlobContent(client, buildBlobUrl(baseUrl, pr, planned.oldObjectId))
      : IO.lift<VCSProviderError, string>(() => "");

  const fetchNew: IO<VCSProviderError, string> =
    planned.newObjectId !== undefined
      ? fetchBlobContent(client, buildBlobUrl(baseUrl, pr, planned.newObjectId))
      : IO.lift<VCSProviderError, string>(() => "");

  return fetchOld.flatMap((oldContent) =>
    fetchNew.flatMap((newContent) => {
      // NUL-byte defence-in-depth heuristic: if new content looks binary,
      // emit stub and discard fetched content.
      const effectivelyBinary =
        (oldContent !== "" && containsNul(oldContent)) ||
        (newContent !== "" && containsNul(newContent));

      // exactOptionalPropertyTypes: only include oldPath when non-undefined.
      const fileBase = effectivelyBinary
        ? {
            path: planned.path,
            oldContent: "",
            newContent: "",
            changeType: planned.changeType,
            isBinary: true as const,
          }
        : {
            path: planned.path,
            oldContent,
            newContent,
            changeType: planned.changeType,
            isBinary: false as const,
          };
      const diffFile: DiffFile =
        planned.oldPath !== undefined
          ? { ...fileBase, oldPath: planned.oldPath }
          : fileBase;

      return IO.lift<VCSProviderError, string>(() => renderFileDiff(diffFile));
    }),
  );
};

/**
 * Sequentially processes all planned files, accumulating rendered diff
 * sections. Short-circuits with `malformed-response { detail: "diff-too-large: <n>" }`
 * as soon as the running byte total exceeds `maxBytes`.
 *
 * Returns the array of rendered sections (one per file).
 */
const processFilesSequentially = (
  client: HttpClient,
  baseUrl: string,
  pr: AdoPR,
  files: readonly PlannedFile[],
  maxBytes: number,
): IO<VCSProviderError, readonly string[]> => {
  // Fold over the file list, threading accumulated bytes and sections.
  type Acc = { readonly sections: readonly string[]; readonly bytes: number };

  const initial: IO<VCSProviderError, Acc> = IO.lift(() => ({
    sections: [] as string[],
    bytes: 0,
  }));

  return files.reduce(
    (accIO: IO<VCSProviderError, Acc>, planned: PlannedFile): IO<VCSProviderError, Acc> =>
      accIO.flatMap((acc) => {
        // Incremental cap check before fetching: if we're already over budget,
        // short-circuit immediately without issuing any more HTTP calls.
        if (acc.bytes > maxBytes) {
          return IO.fail<VCSProviderError, Acc>({
            kind: "malformed-response",
            detail: `diff-too-large: ${acc.bytes}`,
          });
        }

        return processFile(client, baseUrl, pr, planned).flatMap(
          (section): IO<VCSProviderError, Acc> => {
            const newBytes =
              acc.bytes + Buffer.byteLength(section, "utf8");

            if (newBytes > maxBytes) {
              return IO.fail<VCSProviderError, Acc>({
                kind: "malformed-response",
                detail: `diff-too-large: ${newBytes}`,
              });
            }

            return IO.lift<VCSProviderError, Acc>(() => ({
              sections: [...acc.sections, section],
              bytes: newBytes,
            }));
          },
        );
      }),
    initial,
  ).flatMap((acc) => IO.lift<VCSProviderError, readonly string[]>(() => acc.sections));
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Factory that creates a `VCSProvider` backed by the Azure DevOps REST API.
 *
 * `fetchDiff` orchestrates five legs (ADR-34):
 * 1. GET PR iterations → pick latest.
 * 2. GET iteration changes with `$compareTo=0`.
 * 3. Per non-binary file: GET old + new blobs by objectId.
 * 4. Incremental 2 MiB cap applied after each file's section.
 * 5. Brand final string as `Diff`.
 *
 * Status: IMPLEMENTED, PENDING LIVE-INSTANCE VALIDATION.
 *
 * @param deps - Injected dependencies (`config` required, `httpClient` optional).
 * @returns A fully wired `VCSProvider`.
 */
export const createAdoVcsProvider = (deps: AdoAdapterDeps): VCSProvider => {
  const { config } = deps;
  const baseUrl = config.baseUrl ?? "https://dev.azure.com";
  const maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = config.timeoutMs ?? 30_000;
  const userAgent = config.userAgent ?? undefined;

  const client =
    deps.httpClient ??
    createAdoHttpClient(
      userAgent !== undefined
        ? { token: config.token, baseUrl, timeoutMs, userAgent }
        : { token: config.token, baseUrl, timeoutMs },
    );

  const fetchDiff = (input: PRIdentifier): IO<VCSProviderError, Diff> => {
    // Guard: only ADO PRs are handled by this adapter.
    if (input.kind !== "ado") {
      return IO.fail<VCSProviderError, Diff>({
        kind: "transport",
        detail: "wrong-vcs",
      });
    }

    const pr = input as AdoPR;

    // -----------------------------------------------------------------------
    // Leg 1: fetch iterations list, pick the one with the maximum id.
    // -----------------------------------------------------------------------
    const iterationsUrl = buildIterationsUrl(baseUrl, pr);

    const iterationsIO: IO<VCSProviderError, number> = client
      .get(iterationsUrl, { observe: "response" })
      .mapErr(mapHttpError)
      .flatMap(
        (response): IO<VCSProviderError, string> =>
          IO.lift<VCSProviderError, string>(
            () => response.text(),
            (e): VCSProviderError => ({
              kind: "transport",
              detail: `failed to read iterations body: ${String(e)}`,
            }),
          ),
      )
      .flatMap((body): IO<VCSProviderError, number> => {
        let raw: unknown;
        try {
          raw = JSON.parse(body);
        } catch {
          return IO.fail<VCSProviderError, number>({
            kind: "malformed-response",
            detail: "ado-bad-iterations-response",
            raw: clipRaw(body),
          });
        }

        const parsed = AdoIterationsResponseSchema.safeParse(raw);
        if (!parsed.success) {
          return IO.fail<VCSProviderError, number>({
            kind: "malformed-response",
            detail: "ado-bad-iterations-response",
            raw: clipRaw(body),
          });
        }

        const { value: iterations } = parsed.data;
        if (iterations.length === 0) {
          return IO.fail<VCSProviderError, number>({
            kind: "malformed-response",
            detail: "ado-no-iterations",
          });
        }

        // Pick the iteration with the maximum id (latest iteration).
        const latestId = iterations.reduce(
          (max, it) => Math.max(max, it.id),
          -Infinity,
        );

        return IO.lift<VCSProviderError, number>(() => latestId);
      });

    // -----------------------------------------------------------------------
    // Leg 2: fetch changes for the latest iteration.
    // -----------------------------------------------------------------------
    const changesIO = iterationsIO.flatMap(
      (latestIterId): IO<VCSProviderError, readonly PlannedFile[]> => {
        const changesUrl = buildChangesUrl(baseUrl, pr, latestIterId);

        return client
          .get(changesUrl, { observe: "response" })
          .mapErr(mapHttpError)
          .flatMap(
            (response): IO<VCSProviderError, string> =>
              IO.lift<VCSProviderError, string>(
                () => response.text(),
                (e): VCSProviderError => ({
                  kind: "transport",
                  detail: `failed to read changes body: ${String(e)}`,
                }),
              ),
          )
          .flatMap((body): IO<VCSProviderError, readonly PlannedFile[]> => {
            let raw: unknown;
            try {
              raw = JSON.parse(body);
            } catch {
              return IO.fail<VCSProviderError, readonly PlannedFile[]>({
                kind: "malformed-response",
                detail: "ado-bad-changes-response",
                raw: clipRaw(body),
              });
            }

            const parsed = AdoChangesResponseSchema.safeParse(raw);
            if (!parsed.success) {
              return IO.fail<VCSProviderError, readonly PlannedFile[]>({
                kind: "malformed-response",
                detail: "ado-bad-changes-response",
                raw: clipRaw(body),
              });
            }

            const planned = toDiffFiles(parsed.data);
            return IO.lift<VCSProviderError, readonly PlannedFile[]>(() => planned);
          });
      },
    );

    // -----------------------------------------------------------------------
    // Leg 3+: per-file blob fetches, incremental cap, assemble diff.
    // -----------------------------------------------------------------------
    return changesIO
      .flatMap(
        (files): IO<VCSProviderError, readonly string[]> =>
          processFilesSequentially(client, baseUrl, pr, files, maxBytes),
      )
      .flatMap((sections): IO<VCSProviderError, Diff> => {
        // Temporarily build the list of DiffFile objects to pass to
        // renderUnifiedDiff. We already have pre-rendered sections so we
        // just join them.
        const fullDiff = sections.join("");

        // Defence-in-depth sniff: the constructed diff must look like a
        // unified diff (or be empty for a PR with no file changes).
        if (!looksLikeUnifiedDiff(fullDiff)) {
          return IO.fail<VCSProviderError, Diff>({
            kind: "malformed-response",
            detail: "not-unified-diff",
            raw: clipRaw(fullDiff),
          });
        }

        return IO.lift<VCSProviderError, Diff>(() => fullDiff as Diff);
      });
  };

  return {
    id: ADAPTER_ID,
    fetchDiff,
  };
};

// Re-export renderUnifiedDiff for any caller that needs to assemble from
// DiffFile values directly (e.g., test fixtures).
export { renderUnifiedDiff };
