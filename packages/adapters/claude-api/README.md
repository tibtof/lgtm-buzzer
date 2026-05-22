# @lgtm-buzzer/adapter-claude-api

`LLMProvider` implementation that calls the Anthropic Messages API
(`POST /v1/messages`) with prompt caching enabled.

## Design

Implements ADR-20. Key properties:

- HTTP via `monadyssey-fetch` `HttpClient`. No `@anthropic-ai/sdk`.
- Two `cache_control: { type: "ephemeral" }` blocks (system prompt + diff
  user message) for cost reduction on quiz regeneration.
- Retry on 429/529/status-0 only (exponential backoff via `Schedule`).
- API key held in `ClaudeApiConfig.apiKey`; sent only as `x-api-key` header;
  never logged or included in error payloads.
- Diff-only invariant: `buildMessagesPayload` has exactly 4 parameters.

## Usage

```ts
import { createClaudeApiProvider } from "@lgtm-buzzer/adapter-claude-api";

const provider = createClaudeApiProvider({
  config: {
    apiKey: process.env.LGTM_BUZZER_ANTHROPIC_KEY ?? "",
    model: "claude-sonnet-4-7",   // default
    timeoutMs: 60_000,            // default
    maxTokens: 4096,              // default
  },
});
```

## Supported models

- `claude-sonnet-4-7` (default)
- `claude-opus-4-7`
- `claude-haiku-4-5`

Adding a new model requires an ADR-20 amendment.

## Contract tests (httptape)

Record fixtures (requires a real API key):

```bash
LGTM_BUZZER_ANTHROPIC_KEY=<key> npm run record:claude-api
```

Or with Docker:

```bash
docker run --rm -p 54322:8080 \
  -v $(pwd)/fixtures:/fixtures \
  tibtof/httptape serve --fixtures /fixtures
```
