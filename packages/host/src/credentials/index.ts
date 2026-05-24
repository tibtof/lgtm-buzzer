/**
 * Barrel for the host-side credential resolution module.
 *
 * The `CredentialResolver` is constructed once at host startup (in `cli.ts`)
 * and injected into the adapter registry. Each `resolve(adapterId)` call is
 * fresh — no caching between calls (ADR-29 §Wire-shape choices).
 */
export {
  createDefaultCredentialResolver,
  type CredentialResolver,
  type ResolverError,
  type ResolvedCredential,
} from "./resolver.js";

export { type ResolverDeps } from "./types.js";
