# dsh-tool-dockerhub

[English](README.md) | [中文](README.zh.md)

Read-only Docker Hub tools for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) as a Cordis plugin. Public search works without credentials; add a username + personal access token for private namespaces and authenticated rate-limit headers.

## Install

```sh
npm install @libai168/dsh-tool-dockerhub
```

Requires `@deepseek-ai/cordis` (^4.0.1) and `@deepseek-ai/dsh-tools` (^0.1.0-rc.6) as peer dependencies.

## Configuration

```yaml
- name: 'github:LJH-snow/dsh-tool-dockerhub'
  config:
    # username: 'docker-user'
    # personalAccessToken: 'dckr_pat_...'
    # baseUrl: 'https://hub.docker.com'
    # timeoutMs: 15000
```

Create a personal access token in Docker Hub account settings. The token is exchanged for a short-lived JWT that stays in memory; it is never returned by any tool.

`baseUrl` is optional and must be an absolute `http://` or `https://` URL with a hostname. A reverse-proxy path prefix is allowed and trailing slashes are normalized. URL credentials, query strings, and fragments are rejected. Before every request, the final host is checked: localhost names, loopback/private/link-local/shared (CGNAT), multicast, and every IANA special-purpose block (reserved, documentation, benchmarking, the `2001::/23` IETF protocol assignments prefix, deprecated site-local, SRv6 SIDs, AS112, and IPv4-mapped/NAT64 forms) are blocked. Ordinary hostnames must resolve to only permitted public addresses; DNS failures, empty results, or mixed safe/unsafe results fail closed before `fetch` is called.

## Tools

All tools are read-only.

| Tool | Description |
|---|---|
| `dockerhub_auth_test` | Verify username + PAT without exposing the token |
| `dockerhub_get_namespace` | Return the configured namespace summary |
| `dockerhub_list_repositories` | List repositories in a namespace with pagination and name filter |
| `dockerhub_get_repository` | Get one repository by namespace/name |
| `dockerhub_list_tags` | List tags with digest, size, platform metadata |
| `dockerhub_get_tag` | Get one tag's digest/size/platform details |
| `dockerhub_search_repositories` | Search public repositories (no credentials needed) |
| `dockerhub_get_rate_limits` | Read rate-limit response headers |

## Error contract

- Missing credentials where required: `{ ok: false }` / `{ found: false, reason }`.
- Docker Hub errors throw `DockerHubError` (status + code); tools surface them as normalized failure values.
- `page`/`pageSize` are clamped server-side by the client (1-100).

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

## License

[MIT](LICENSE)
