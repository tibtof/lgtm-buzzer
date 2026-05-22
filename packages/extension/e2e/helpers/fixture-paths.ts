/**
 * Canonical fixture URLs and file paths for the e2e suite (ADR-25 §3).
 *
 * Centralised so specs do not duplicate the URL list. All navigations in
 * the suite go through `routeFixtures` against these paths — no real network
 * calls to github.com or dev.azure.com are ever made.
 */

/** The fixture URLs routed to local HTML files via `page.route(...)`. */
export const FIXTURE_URLS = {
  github: "https://github.com/owner/repo/pull/1",
  ado: "https://dev.azure.com/contoso/MyProj/_git/MyRepo/pullrequest/42",
} as const;

/** Relative paths (from the e2e directory) to the fixture HTML files. */
export const FIXTURE_FILES = {
  github: "fixtures/github-pr.html",
  ado: "fixtures/ado-pr.html",
} as const;
