# dsh-tool-linear

[English](README.md) | [中文](README.zh.md)

A Cordis tool plugin that gives [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) Linear issue management capabilities. Agents can search and list issues, read issue details, create and update tickets, add and list comments, and inspect teams, projects, cycles, labels, users, and workflow states.

It follows the official "everything is a plugin" architecture with `ctx.tools.register(defineTool(...))` and the [adding-a-tool](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md) contract.

## Install

Install directly from GitHub:

```sh
npm install github:LJH-snow/dsh-tool-linear
```

Or from a local checkout:

```sh
git clone https://github.com/LJH-snow/dsh-tool-linear
cd dsh-tool-linear
npm install && npm run build
npm install /path/to/dsh-tool-linear
```

Requires `@deepseek-ai/cordis` (^4.0.1) and `@deepseek-ai/dsh-tools` (^0.1.0-rc.6) as peer dependencies, provided by the host dsh runtime.

## Configuration

Load the plugin in a dsh composition config (`cordis.yml`):

```yaml
- name: 'github:LJH-snow/dsh-tool-linear'
  config:
    apiKey: 'lin_api_xxx'              # required: Linear personal API key
    baseUrl: 'https://api.linear.app/graphql'  # optional
    timeoutMs: 15000                    # optional, default 15000
```

Full example: [examples/cordis.yml](examples/cordis.yml).

> Security: the first version requires an API key for every tool because Linear workspaces are access-controlled and several tools modify tickets. Create a personal API key under Linear Settings > Security & access, grant it the minimum permissions needed, and never commit it.

The `baseUrl` override must be an absolute `http://` or `https://` root URL. Only publicly reachable hosts are allowed: localhost, loopback, private, link-local, CGNAT, multicast, reserved/documentation/benchmark ranges, and every IANA special-purpose block are rejected, and a hostname whose DNS results contain any such address fails closed before the request is sent. Credentials, query strings, fragments, and non-root paths are not allowed.

## Tools

| Tool | Description | Credentials |
|---|---|---|
| `linear_search_issues` | Search issues by title, identifier, description, or comment text | yes |
| `linear_list_issues` | List issues filtered by team, project, cycle, or workflow state | yes |
| `linear_get_issue` | Get issue details by UUID or identifier such as `ABC-123` | yes |
| `linear_create_issue` | Create an issue with title, description, priority, project, cycle, assignee, labels, state, and due date | yes |
| `linear_update_issue` | Update title, description, priority, project, cycle, assignee, labels, state, or due date | yes |
| `linear_add_issue_comment` | Add a comment to an issue | yes |
| `linear_list_issue_comments` | List comments on an issue | yes |
| `linear_list_cycles` | List cycles for a team | yes |
| `linear_get_cycle` | Get cycle details | yes |
| `linear_list_projects` | List projects, optionally scoped to a team | yes |
| `linear_get_project` | Get project details, dates, progress, health, and teams | yes |
| `linear_list_teams` | List teams visible to the API key | yes |
| `linear_get_team` | Get team details | yes |
| `linear_list_workflow_states` | List workflow states for a team, useful when choosing issue states | yes |
| `linear_list_labels` | List labels, optionally scoped to a team | yes |
| `linear_get_label` | Get label details | yes |
| `linear_list_users` | List users, optionally filtered by name, display name, or email | yes |
| `linear_get_user` | Get user details | yes |

### Behavior Contract

- Missing credentials return canonical business values: read tools return `{ authenticated: false, ... }`, write tools return `{ created: false, reason }` or `{ ok: false, reason }`.
- Missing issue, cycle, project, team, label, or user maps to `{ found: false }`.
- GraphQL validation and user errors on writes map to `{ created: false, reason }` or `{ ok: false, reason }`.
- Infrastructure errors such as invalid credentials (401), forbidden access (403), rate limiting (429), or server failures (5xx) throw `LinearError`.
- Every request forwards `exec.signal` and uses a configurable timeout (default 15 seconds).

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for the architecture and test coverage.

## License

[MIT](LICENSE)
