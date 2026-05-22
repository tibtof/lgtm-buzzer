# @lgtm-buzzer/adapter-github

GitHub VCS adapter implementing `VCSProvider` from `@lgtm-buzzer/core`.
Fetches the raw unified diff for a pull request via the single GitHub REST
endpoint `GET /repos/{owner}/{repo}/pulls/{number}` with
`Accept: application/vnd.github.v3.diff`.

## Usage

```ts
import { createGithubVcsProvider } from "@lgtm-buzzer/adapter-github";

const provider = createGithubVcsProvider({
  config: {
    token: process.env.GH_TOKEN ?? "",  // PAT (classic or fine-grained)
    // baseUrl: "https://api.github.com",  // override for GitHub Enterprise
    // timeoutMs: 30_000,
    // maxBytes: 2 * 1024 * 1024,         // 2 MiB hard ceiling
  },
});

const diff = await provider.fetchDiff({
  kind: "github",
  owner: "tibtof",
  repo: "lgtm-buzzer",
  number: 37,
}).unsafeRun();
```

## Contract tests (httptape)

Contract tests in `src/contract.test.ts` replay recorded GitHub API responses
through an httptape sidecar. They skip automatically if httptape is unavailable.

### Installing httptape

**Option 1 — Go install** (recommended for local dev):

```bash
go install github.com/httptape/httptape/cmd/httptape@latest
```

Verify: `httptape --help`

**Option 2 — Docker**:

```bash
docker run --rm -p 54321:8081 \
  -v $(pwd)/fixtures:/fixtures \
  tibtof/httptape serve --fixtures /fixtures --port 8081
# Then: LGTM_BUZZER_GH_HTTPTAPE_URL=http://localhost:54321 npm test
```

### Recording fixtures

Requires a GitHub PAT with `repo:read` scope on the target repository.

```bash
export LGTM_BUZZER_GH_TOKEN=ghp_your_pat_here
npm run record:github --workspace=@lgtm-buzzer/adapter-github
```

This calls `httptape record --upstream https://api.github.com --fixtures ./fixtures --config ./httptape.sanitize.json`, which proxies real requests and saves sanitized responses to `fixtures/`. The `httptape.sanitize.json` config redacts `Authorization`, `X-GitHub-Token`, `ETag`, and `Last-Modified` headers before any bytes touch disk.

### Replaying fixtures

The Vitest global setup (`vitest.globalSetup.ts`) automatically spawns
`httptape serve` on port 54321 if the `fixtures/` directory contains tape files.
It exposes `LGTM_BUZZER_GH_HTTPTAPE_URL=http://127.0.0.1:54321` so
`contract.test.ts` can construct the adapter with that base URL.

If no fixtures exist or httptape is not on PATH, a `console.warn` is emitted
and the contract suite skips cleanly.
