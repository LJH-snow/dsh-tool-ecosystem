# dsh-tool-openai

[中文](README.zh.md) | English

An intentionally small Cordis plugin for DeepSeek Harness that exposes safe text operations backed by the official OpenAI Responses API.

## Install

From the standalone repository (or a published package):

~~~sh
npm install github:LJH-snow/dsh-tool-openai
# after npm publication:
npm install @libai168/dsh-tool-openai
~~~

The host provides @deepseek-ai/cordis and @deepseek-ai/dsh-tools as peer dependencies.

## Configuration

~~~yaml
- name: '@libai168/dsh-tool-openai'
  config:
    # Prefer an environment variable or secret manager over putting this in YAML.
    apiKey: 'sk-...'
    timeoutMs: 30000
~~~

If apiKey is omitted, the plugin reads OPENAI_API_KEY. Requests use the fixed official endpoint https://api.openai.com/v1; this MVP rejects custom hosts, credentials, query strings, fragments, and non-HTTPS URLs.

## Tools

| Tool | Behavior |
| --- | --- |
| openai_auth_test | Performs a bounded model-list request and returns only authentication status and a request ID. |
| openai_models_list | Lists at most 50 model IDs and owners. |
| openai_responses_create | Creates a text response with an explicit model and store: false; input and output are bounded. |

The MVP accepts text only. It does not expose streaming, image/audio/file inputs, remote URLs, code interpreter, web search, function calling, or other built-in tools. No tool writes files or changes an OpenAI resource.

## Development

~~~sh
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
~~~

Unit tests inject a transport and never call the OpenAI service. The client forwards cancellation signals, applies a timeout, redacts credentials from errors, and limits model/output data before it reaches the tool result.

## Publishing

Build and verify the package before publishing:

~~~sh
npm publish --access public
~~~

Publishing, repository creation, credentials, and remote pushes are intentionally outside this package's local test workflow.

## License

MIT
