import { HttpClient } from "monadyssey-fetch";

/** Package-level User-Agent string injected into every request. */
export const USER_AGENT = "lgtm-buzzer-ado-adapter/0.0.0";

/**
 * ADO HTTP authorization scheme.
 *
 * - `"basic"`  — PAT auth: `Authorization: Basic base64(":" + pat)`.
 * - `"bearer"` — AAD OAuth token from `az account get-access-token`:
 *                `Authorization: Bearer <token>`.
 *
 * Default is `"basic"` for backward-compatibility with PAT-only construction.
 */
export type AdoAuthScheme = "basic" | "bearer";

/**
 * Configuration object accepted by `createAdoHttpClient`.
 *
 * Only the fields directly consumed by the HTTP construction are listed here.
 * The full adapter config is `AdoAdapterConfig` in `provider.ts`.
 */
export type HttpClientConfig = {
  /**
   * Azure DevOps credential (PAT or AAD bearer token). Never logged.
   *
   * For PATs (`authScheme: "basic"`), ADO Basic auth encodes an empty username
   * and the PAT as the password: `Authorization: Basic base64(":" + pat)`.
   * See: https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate
   *
   * For AAD tokens (`authScheme: "bearer"`), obtained via
   * `az account get-access-token --resource 499b84ac-…`, the token is sent
   * verbatim: `Authorization: Bearer <token>`.
   */
  readonly token: string;
  /** Auth scheme. Default `"basic"` (PAT). Use `"bearer"` for AAD tokens. */
  readonly authScheme?: AdoAuthScheme;
  /** API base URL. Default: `"https://dev.azure.com"`. */
  readonly baseUrl?: string;
  /** Wall-clock timeout in milliseconds. Default: `30_000`. */
  readonly timeoutMs?: number;
  /** Optional User-Agent override (mainly for tests). */
  readonly userAgent?: string;
};

/**
 * Encodes an ADO PAT for use in the Basic Authorization header.
 *
 * ADO Basic auth format: base64(":" + pat) — empty username, PAT as password.
 * The colon is the separator in the `user:password` Basic auth format.
 *
 * @param pat - The Personal Access Token. MUST NOT be logged.
 * @returns The base64-encoded credential string (without the `Basic ` prefix).
 */
const encodeAdoPat = (pat: string): string =>
  Buffer.from(`:${pat}`).toString("base64");

/**
 * Build the ADO `Authorization` header value for a given scheme.
 *
 * - `"basic"`  → `Basic base64(":" + token)` (PAT scheme).
 * - `"bearer"` → `Bearer <token>` (AAD OAuth scheme).
 *
 * The token is never logged; this function only returns the header value.
 * Exported for unit testing — the token bytes MUST NOT appear in any test
 * assertion other than the direct header-value assertion.
 *
 * @param token - The credential (PAT or AAD bearer token). MUST NOT be logged.
 * @param scheme - The auth scheme to apply.
 * @returns The complete `Authorization` header value (scheme + credential).
 */
export const buildAuthHeader = (token: string, scheme: AdoAuthScheme): string =>
  scheme === "bearer" ? `Bearer ${token}` : `Basic ${encodeAdoPat(token)}`;

/**
 * Constructs an `HttpClient` pre-configured for the Azure DevOps REST API.
 *
 * Headers set on every request:
 * - `Authorization: Basic <base64(:PAT)>` or `Authorization: Bearer <token>` —
 *   scheme selected from `config.authScheme` (default `"basic"`). The credential
 *   MUST NOT be logged or included in error payloads.
 * - `Accept: application/json` — ADO REST API returns JSON; the adapter reads
 *   the JSON body to extract diff information.
 * - `User-Agent: lgtm-buzzer-ado-adapter/0.0.0` — identifies the client.
 * - `Content-Type: application/json` — required for ADO API requests.
 *
 * @param config - Connection config including the credential and auth scheme.
 * @returns A configured `HttpClient` instance.
 */
export const createAdoHttpClient = (config: HttpClientConfig): HttpClient => {
  const baseUrl = config.baseUrl ?? "https://dev.azure.com";
  const timeoutMs = config.timeoutMs ?? 30_000;
  const userAgent = config.userAgent ?? USER_AGENT;
  const scheme = config.authScheme ?? "basic";

  return new HttpClient({
    baseUrl,
    defaultHeaders: {
      Accept: "application/json",
      Authorization: buildAuthHeader(config.token, scheme),
      "User-Agent": userAgent,
      "Content-Type": "application/json",
    },
    timeout: timeoutMs,
  });
};
