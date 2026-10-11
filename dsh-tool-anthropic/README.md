# dsh-tool-anthropic

[中文](README.zh.md) | English

An intentionally small Cordis plugin for DeepSeek Harness that exposes safe text operations backed by the official Anthropic Claude Messages API.

## Install

From the standalone repository (or a published package):

~~~sh
npm install github:LJH-snow/dsh-tool-anthropic
# after npm publication:
npm install @libai168/dsh-tool-anthropic
~~~

The host provides @deepseek-ai/cordis and @deepseek-ai/dsh-tools as peer dependencies.

## Configuration

~~~yaml
- name: '@libai168/dsh-tool-anthropic'
  config:
    # Prefer ANTHROPIC_API_KEY in the environment or a secret manager.
    timeoutMs: 30000
~~~

If apiKey is omitted, the plugin reads ANTHROPIC_API_KEY. Requests use the fixed official endpoint https://api.anthropic.com/v1; this MVP rejects custom hosts, credentials, query strings, fragments, and non-HTTPS URLs.

## Tools

| Tool | Behavior |
| --- | --- |
| anthropic_auth_test | Performs a bounded model-list request and returns only authentication status and a request ID. |
| anthropic_models_list | Lists at most 50 model IDs, display names, and creation dates. |
| anthropic_messages_create | Creates a text message with an explicit model; input and output are bounded. |

The MVP accepts one text user message and an optional system instruction. It does not expose streaming, image/file inputs, remote URLs, code execution, web search, or tool use. No tool writes files or changes an Anthropic resource.

## Development

~~~sh
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
~~~

Unit tests inject a transport and never call the Anthropic service. The client forwards cancellation signals, applies a timeout, redacts credentials from errors, and limits model/output data before it reaches the tool result.

## Publishing

Build and verify the package before publishing:

~~~sh
npm publish --access public
~~~

Publishing, repository creation, credentials, and remote pushes are intentionally outside this package's local test workflow.

## License

MIT
