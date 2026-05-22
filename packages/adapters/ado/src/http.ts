import { HttpClient } from "monadyssey-fetch";

/** Package-level User-Agent string injected into every request. */
export const USER_AGENT = "lgtm-buzzer-ado-adapter/0.0.0";

/**
 * Configuration object accepted by `createAdoHttpClient`.
 *
 * Only the fields directly consumed by the HTTP construction are listed here.
 * The full adapter config is `AdoAdapterConfig` in `provider.ts`.
 */
export type HttpClientConfig = {
  /**
   * Azure DevOps Personal Access Token. Never logged.
   *
   * ADO uses HTTP Basic auth with an empty username and the PAT as the password:
   * `Authorization: Basic base64(":" + pat)`. This is the documented and
   * recommended auth scheme for ADO REST APIs when using PATs.
   * See: https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate
   */
  readonly token: string;
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
 * @returns The base64-encoded credential string.
 */
const encodeAdoPat = (pat: string): string =>
  Buffer.from(`:${pat}`).toString("base64");

/**
 * Constructs an `HttpClient` pre-configured for the Azure DevOps REST API.
 *
 * Headers set on every request:
 * - `Authorization: Basic <base64(:PAT)>` — ADO PAT authentication using Basic
 *   auth with empty username. The PAT MUST NOT be logged or included in error
 *   payloads.
 * - `Accept: application/json` — ADO REST API returns JSON; the adapter reads
 *   the JSON body to extract diff information.
 * - `User-Agent: lgtm-buzzer-ado-adapter/0.0.0` — identifies the client.
 * - `Content-Type: application/json` — required for ADO API requests.
 *
 * @param config - Connection config including the PAT.
 * @returns A configured `HttpClient` instance.
 */
export const createAdoHttpClient = (config: HttpClientConfig): HttpClient => {
  const baseUrl = config.baseUrl ?? "https://dev.azure.com";
  const timeoutMs = config.timeoutMs ?? 30_000;
  const userAgent = config.userAgent ?? USER_AGENT;

  return new HttpClient({
    baseUrl,
    defaultHeaders: {
      Accept: "application/json",
      Authorization: `Basic ${encodeAdoPat(config.token)}`,
      "User-Agent": userAgent,
      "Content-Type": "application/json",
    },
    timeout: timeoutMs,
  });
};
