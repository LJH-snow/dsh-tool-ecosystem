# dsh-tool-openai development notes

## Scope

The first release deliberately contains three tools: an authentication check, a bounded model listing, and a text-only Responses API call. The model must provide the response model explicitly so a deployment does not silently change its billing or capability profile.

## Security decisions

- The endpoint is fixed to https://api.openai.com/v1 and is validated before an SDK client is created.
- API keys are read from configuration or OPENAI_API_KEY, never returned by a tool, and removed from mapped error messages.
- store: false is unconditional.
- Inputs and instructions are capped at 16,000 characters; output text is capped at 20,000 characters. Model lists are capped at 50 entries.
- The MVP does not accept URLs, files, images, audio, streaming, function definitions, or built-in Responses tools.
- Tests use OpenAITransport injection, so the test suite has no network dependency and cannot spend API credits.

## Tool contract

Each tool uses defineTool, declares a JSON output schema, renders model-facing text through output.render, and forwards exec.signal. Business failures are returned as bounded { ok: false, ... } values; the client maps API and timeout failures without exposing response bodies or credentials.

## Verification checklist

~~~sh
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
~~~

The aggregate repository additionally runs node scripts/release-check.mjs --strict-output, which regenerates the release matrix, security report, versions, and tool manifest.

## Future scope

Streaming, multimodal input, file search, web search, function calling, and other Responses features require a separate threat-model and output contract review before being added.
