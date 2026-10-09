# dsh-tool-github

[English](README.md) | [中文](README.zh.md)

A Cordis tool plugin that gives [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) GitHub capabilities. Agents can look up repositories, search code, list issues, and create draft pull requests in natural language.

Built on the official "everything is a plugin" architecture via `ctx.tools.register(defineTool(...))`, following the official [adding-a-tool](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md) contract.

## Install

Install directly from GitHub (no npm publish needed):

```sh
npm install github:LJH-snow/dsh-tool-github
# or a specific branch/tag
npm install github:LJH-snow/dsh-tool-github#main
```

Or from a local checkout:

```sh
git clone https://github.com/LJH-snow/dsh-tool-github
cd dsh-tool-github
npm install && npm run build   # builds to lib/
npm install /path/to/dsh-tool-github
```

> Once published to npm, it will also be installable as `npm install @libai168/dsh-tool-github`.

Requires `@deepseek-ai/cordis` (^4.0.1) and `@deepseek-ai/dsh-tools` (^0.1.0-rc.6) as peer dependencies, provided by the host dsh runtime.

## Configuration

Load the plugin in a dsh composition config (`cordis.yml`):

```yaml
- name: 'dsh-tool-github'
  config:
    token: 'ghp_xxx'        # GitHub PAT (optional; required for code search and PR creation)
    baseUrl: 'https://api.github.com'   # optional, override for GitHub Enterprise
    timeoutMs: 15000        # optional, request timeout in ms (default 15000)
```

Full example: [examples/cordis.yml](examples/cordis.yml).

> Security: read-only tools need no token. `github_search_code` and `github_create_pr_draft` require a token. Prefer a minimal-scope fine-grained token and never commit it.

The endpoint is checked before every request. Link-local addresses (`169.254.0.0/16`, `fe80::/10`, including their IPv4-mapped and NAT64 forms) are always rejected: they are never a valid API endpoint and include the cloud metadata address. Self-hosted endpoints on private networks keep working by default. Set `enforcePublicEndpoint: true` to additionally require a publicly reachable host; that mode also resolves ordinary hostnames and rejects loopback, private, CGNAT, multicast, reserved, and every IANA special-purpose range.

## Tools

| Tool | Description | Token |
|---|---|---|
| `github_get_repo` | Repository metadata (description, stars, language, license, homepage, updated) | no |
| `github_search_repos` | Search repositories (sort stars/forks/updated, up to 10 results) | no |
| `github_list_issues` | List issues (state/label filters, up to 20 results) | no |
| `github_search_code` | Code search; clear hint when no token is configured | yes |
| `github_list_prs` | List pull requests (state filter, up to 20) | no |
| `github_get_file` | Read a repository file (branch/ref support, base64-decoded) | no |
| `github_list_commits` | List recent commits (branch/author filters, up to 30) | no |
| `github_create_issue` | Create an issue (title required; body/labels optional) | yes |
| `github_comment_issue` | Comment on an issue or PR | yes |
| `github_update_issue` | Open or close an issue | yes |
| `github_merge_pr` | Merge a PR (merge/squash/rebase; requires token) | yes |
| `github_list_releases` | List releases (tag, draft/prerelease, author) | no |
| `github_list_branches` | List branches with latest SHAs | no |
| `github_get_issue` | Get issue details (title, state, author, labels, body) | no |
| `github_list_issue_comments` | List issue comments (author, time, body) | no |
| `github_list_milestones` | List repository milestones (state filter, due dates, issue counts) | no |
| `github_list_pr_comments` | List PR review comments (author, time, body) | no |
| `github_set_issue_labels` | Replace all labels on an issue or PR | yes |
| `github_add_issue_assignees` | Assign GitHub users to an issue or PR | yes |
| `github_set_issue_milestone` | Set or clear the milestone on an issue or PR | yes |
| `github_reply_pr_comment` | Reply to an existing PR review comment | yes |
| `github_get_pull_request` | Get PR details (branches, merge state, review decision, diff stats) | no |
| `github_list_pull_request_reviews` | List PR reviews (reviewer, state, body, time) | no |
| `github_request_pr_reviewers` | Request user or team reviewers on a PR | yes |
| `github_submit_pr_review` | Approve, request changes, or comment on a PR | yes |
| `github_get_user` | Get user/org info (name, bio, followers, repos) | no |
| `github_get_org` | Get organization profile and repo counts | no |
| `github_list_org_repos` | List organization repositories with visibility metadata | no |
| `github_list_org_members` | List organization members | yes |
| `github_list_org_teams` | List organization teams | yes |
| `github_get_team` | Get one organization team by slug | yes |
| `github_list_team_members` | List members of an organization team | yes |
| `github_list_team_repos` | List repositories accessible to an organization team | yes |
| `github_update_team_membership` | Add a team member or change their role | yes |
| `github_remove_team_membership` | Remove a user from an organization team | yes |
| `github_list_collaborators` | List repository collaborators and effective permissions | yes |
| `github_get_collaborator_permission` | Get one collaborator permission and role source | yes |
| `github_add_collaborator` | Invite or add a repository collaborator with a permission level | yes |
| `github_update_collaborator_permission` | Update an existing collaborator's permission | yes |
| `github_remove_collaborator` | Remove a direct collaborator from a repository | yes |
| `github_add_team_repo` | Grant an organization team access to a repository | yes |
| `github_remove_team_repo` | Remove an organization team's repository access | yes |
| `github_list_repo_webhooks` | List repository webhooks with events, payload config, and delivery endpoints | yes |
| `github_get_repo_webhook` | Get one repository webhook configuration | yes |
| `github_create_repo_webhook` | Create a repository webhook (events, secret, content type, active state) | yes |
| `github_update_repo_webhook` | Update webhook URL, events, secret, or active state | yes |
| `github_delete_repo_webhook` | Delete a repository webhook | yes |
| `github_ping_repo_webhook` | Send a ping to a repository webhook | yes |
| `github_list_release_assets` | List Release assets with size, downloads, and download URLs | yes |
| `github_get_release_asset` | Get one Release asset metadata | yes |
| `github_update_release_asset` | Rename a Release asset or update its label | yes |
| `github_delete_release_asset` | Delete a Release asset | yes |
| `github_list_workflow_runs` | List Actions runs (workflow, branch, status) | no* |
| `github_list_workflows` | List Actions workflows (name, path, state) | no* |
| `github_get_workflow` | Get a workflow detail | no* |
| `github_get_workflow_run` | Get a workflow run detail | no* |
| `github_list_workflow_jobs` | List jobs and steps for a workflow run | no* |
| `github_get_workflow_run_logs` | Download and decode workflow run logs (200k char cap) | no* |
| `github_list_repo_artifacts` | List all repository Actions artifacts with expiry/download metadata | yes |
| `github_list_run_artifacts` | List Actions artifacts produced by a workflow run | yes |
| `github_get_artifact` | Get one Actions artifact and its archive download URL | yes |
| `github_delete_artifact` | Delete an Actions artifact | yes |
| `github_rerun_workflow_run` | Rerun a workflow run | yes |
| `github_cancel_workflow_run` | Cancel an in-progress workflow run | yes |
| `github_dispatch_workflow` | Dispatch a workflow_dispatch run with a ref and string inputs | yes |
| `github_create_branch` | Create a branch from a ref | yes |
| `github_write_file` | Create/update a file (creates a commit) | yes |
| `github_list_environments` | List deployment environments, protection rules, and branch policy | yes |
| `github_get_environment` | Get one deployment environment and its policy | yes |
| `github_update_environment` | Create/update wait timer, reviewers, and branch policy | yes |
| `github_delete_environment` | Delete a deployment environment | yes |
| `github_get_readme` | Read the repository README (markdown) | no |
| `github_list_tags` | List version tags | no |
| `github_star_repo` | Star a repository | yes |
| `github_unstar_repo` | Remove a star | yes |
| `github_create_release` | Create a release for a tag | yes |
| `github_create_repository` | Create a user or organization repository | yes |
| `github_set_repo_topics` | Set the complete topic list for a repository | yes |
| `github_list_gists` | List user or public gists | no |
| `github_create_gist` | Create a public or secret gist | yes |
| `github_list_repo_variables` | List Actions repository variables | yes |
| `github_set_repo_variable` | Create or update an Actions repository variable | yes |
| `github_delete_repo_variable` | Delete an Actions repository variable | yes |
| `github_list_repo_secrets` | List Actions repository secret metadata | yes |
| `github_set_repo_secret` | Create/update a repository secret with local encryption | yes |
| `github_delete_repo_secret` | Delete an Actions repository secret | yes |
| `github_get_branch_protection` | Read branch protection rules | no |
| `github_set_branch_protection` | Update branch protection rules | yes |
| `github_delete_branch_protection` | Delete branch protection rules | yes |
| `github_create_pr_draft` | Create a draft PR (head/base/title/body) | yes |

### Behavior contract (per the official execute contract)

- **Business failures are canonical values**: missing repo → `{ found: false }`; PR creation failure (branch missing / PR exists) → `{ created: false, reason }`.
- **Only infrastructure errors throw**: invalid token (401), rate limit (403), etc.
- **Cancellable**: every request forwards `exec.signal`, with a default 15s timeout.

## Development

```sh
npm install
npm run typecheck   # type check
npm test            # unit tests (vitest)
npm run build       # build to lib/
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for plans and decisions.

## Publishing

1. The package is published under your npm scope: `@libai168/dsh-tool-github` (npm publishing requires a granular access token with **2FA bypass** enabled, or trusted publishing).
2. `npm run build`, then `npm publish --access public`.
3. Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your GitHub repo for ecosystem discovery.

## License

[MIT](LICENSE)
