import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallView, ToolResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { GithubClient, GithubError } from './client.js'

export const name = 'dsh-tool-github'
export const inject = ['tools']

export interface GithubPluginConfig {
  /** GitHub Personal Access Token. Read-only scopes are enough for v0.1 tools. */
  token?: string
  /** API base URL override (e.g. GitHub Enterprise). */
  baseUrl?: string
  /** Request timeout in milliseconds. */
  timeoutMs?: number
}

export function apply(ctx: Context, config: GithubPluginConfig = {}) {
  const client = new GithubClient({ baseUrl: config.baseUrl, token: config.token, timeoutMs: config.timeoutMs })
  for (const tool of createTools(client)) {
    ctx.tools.register(tool)
  }
}

/** Build the tool definitions for a client. Exported so tests can drive execute/render directly. */
export function createTools(client: GithubClient) {
  return [
    defineTool({
      name: 'github_get_repo',
      description: 'Get metadata about a GitHub repository: owner, description, star count, language, license, homepage, and last update time.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner (user or organization), e.g. deepseek-ai' },
        repo: { type: 'string', required: true, description: 'Repository name, e.g. deepseek-harness' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the repository exists' },
            owner: { type: 'string', description: 'Repository owner' },
            name: { type: 'string', description: 'Repository name' },
            description: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Repository description' },
            stars: { type: 'integer', description: 'Star count' },
            language: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Primary language' },
            license: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'SPDX license identifier' },
            homepage: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Homepage URL' },
            updatedAt: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'ISO last-update timestamp' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Repository not found.' }]
          const lines = [
            `${value.owner}/${value.name}`,
            value.description ?? '',
            `stars: ${value.stars ?? 0}`,
            `language: ${value.language ?? 'n/a'}`,
            `license: ${value.license ?? 'n/a'}`,
            value.homepage ? `homepage: ${value.homepage}` : '',
            value.updatedAt ? `updated: ${value.updatedAt}` : '',
          ].filter(Boolean)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Fetch repo ${args.owner}/${args.repo}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; owner?: string; name?: string; stars?: number; language?: string | null }
        if (!v.found) return { card: 'generic', title: 'Repo not found' }
        return {
          card: 'generic',
          title: `${v.owner}/${v.name}`,
          content: [{ type: 'text', text: `${v.stars ?? 0} stars · ${v.language ?? 'n/a'}` }],
        }
      },
      async execute(args, exec) {
        try {
          const info = await client.getRepo(args.owner, args.repo, exec.signal)
          return { found: true, ...info }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_search_repos',
      description: 'Search GitHub repositories by keyword, sorted by stars by default. Returns full names, descriptions, star counts, languages, and URLs.',
      parameters: {
        query: { type: 'string', required: true, description: 'Search query, e.g. "agent harness" or "deepseek"' },
        sort: { type: 'string', enum: ['stars', 'forks', 'updated'], description: 'Sort criterion (default stars)' },
        order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order (default desc)' },
        limit: { type: 'integer', description: 'Maximum results, 1-10 (default 5)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            total: { type: 'integer', description: 'Total number of matches on GitHub' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  fullName: { type: 'string', description: 'Owner/name' },
                  description: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Repository description' },
                  stars: { type: 'integer', description: 'Star count' },
                  language: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Primary language' },
                  url: { type: 'string', description: 'Repository URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No repositories found.' }]
          const lines = items.map(item => {
            const stars = item.stars ?? 0
            const language = item.language ?? 'n/a'
            const description = item.description ? ` — ${item.description}` : ''
            return `${item.fullName} (${stars}★, ${language})${description}`
          })
          return [{ type: 'text', text: `Found ${value.total ?? 0} repositories:\n${lines.join('\n')}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Search repos: ${args.query}`, kind: 'search' }
      },
      presentResult(args, result): ToolResultView | undefined {
        const v = result as unknown as { total?: number; items?: Array<{ fullName: string; stars?: number }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: `No repos for "${args.query}"` }
        return {
          card: 'generic',
          title: `${v.total ?? items.length} repos for "${args.query}"`,
          content: [{ type: 'text', text: items.map(i => `${i.fullName} (${i.stars ?? 0}★)`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 5 : Math.max(1, Math.min(args.limit, 10))
        const result = await client.searchRepos(args.query, { sort: args.sort, order: args.order, perPage: limit, signal: exec.signal })
        return result
      },
    }),

    defineTool({
      name: 'github_list_issues',
      description: 'List issues of a GitHub repository, optionally filtered by state and label.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state (default open)' },
        label: { type: 'string', description: 'Filter by label name' },
        limit: { type: 'integer', description: 'Maximum results, 1-20 (default 10)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  number: { type: 'integer', description: 'Issue number' },
                  title: { type: 'string', description: 'Issue title' },
                  state: { type: 'string', description: 'Issue state' },
                  labels: { type: 'array', items: { type: 'string' }, description: 'Label names' },
                  createdAt: { type: 'string', description: 'ISO creation timestamp' },
                  author: { type: 'string', description: 'Author login' },
                  url: { type: 'string', description: 'Issue URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No issues found.' }]
          const lines = items.map(item => {
            const labels = item.labels ?? []
            const labelText = labels.length > 0 ? ` [${labels.join(', ')}]` : ''
            return `#${item.number} ${item.title} (${item.state}, @${item.author})${labelText}`
          })
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        const label = args.label ? ` [${args.label}]` : ''
        return { card: 'generic', title: `Issues: ${args.owner}/${args.repo}${label}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ number: number; title: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No issues' }
        return {
          card: 'generic',
          title: `${items.length} issue(s)`,
          content: [{ type: 'text', text: items.map(i => `#${i.number} ${i.title}`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 10 : Math.max(1, Math.min(args.limit, 20))
        const items = await client.listIssues(args.owner, args.repo, { state: args.state, label: args.label, perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'github_search_code',
      description: 'Search code on GitHub. Requires a configured GitHub token. Returns file paths, repositories, and URLs.',
      parameters: {
        query: { type: 'string', required: true, description: 'Code search query, e.g. "repo:deepseek-ai/deepseek-harness language:typescript defineTool"' },
        limit: { type: 'integer', description: 'Maximum results, 1-10 (default 5)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean', description: 'Whether a GitHub token was configured; code search requires one' },
            total: { type: 'integer', description: 'Total number of matches on GitHub' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  path: { type: 'string', description: 'File path in the repository' },
                  repository: { type: 'string', description: 'Owner/name of the repository' },
                  url: { type: 'string', description: 'File URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Code search requires a GitHub token. Configure the plugin with a token (read-only scopes are enough).' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No code matches found.' }]
          const lines = items.map(item => `${item.repository}: ${item.path} — ${item.url}`)
          return [{ type: 'text', text: `Found ${value.total ?? 0} matches:\n${lines.join('\n')}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Search code: ${args.query}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; total?: number; items?: Array<{ path: string; repository: string }> }
        if (!v.authenticated) return { card: 'generic', title: 'Code search needs a token' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No code matches' }
        return {
          card: 'search',
          shape: 'paths',
          title: `${v.total ?? items.length} code match(es)`,
          paths: items.map(i => `${i.repository}: ${i.path}`),
          truncated: false,
          total: v.total ?? items.length,
        }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { authenticated: false, total: 0, items: [] }
        }
        const limit = args.limit === undefined ? 5 : Math.max(1, Math.min(args.limit, 10))
        const result = await client.searchCode(args.query, { perPage: limit, signal: exec.signal })
        return { authenticated: true, ...result }
      },
    }),

    defineTool({
      name: 'github_list_prs',
      description: 'List pull requests of a GitHub repository, optionally filtered by state. Returns number, title, author, branches, and draft status.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'PR state (default open)' },
        limit: { type: 'integer', description: 'Maximum results, 1-20 (default 10)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  number: { type: 'integer', description: 'PR number' },
                  title: { type: 'string', description: 'PR title' },
                  state: { type: 'string', description: 'PR state' },
                  draft: { type: 'boolean', description: 'Whether this is a draft PR' },
                  author: { type: 'string', description: 'Author login' },
                  headRef: { type: 'string', description: 'Head branch' },
                  baseRef: { type: 'string', description: 'Base branch' },
                  createdAt: { type: 'string', description: 'ISO creation timestamp' },
                  url: { type: 'string', description: 'PR URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No pull requests found.' }]
          const lines = items.map(item => {
            const draft = item.draft ? ' [draft]' : ''
            return `#${item.number} ${item.title} (${item.state}, @${item.author})${draft} → ${item.headRef} -> ${item.baseRef}`
          })
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `PRs: ${args.owner}/${args.repo}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ number: number; title: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No PRs' }
        return {
          card: 'generic',
          title: `${items.length} PR(s)`,
          content: [{ type: 'text', text: items.map(i => `#${i.number} ${i.title}`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 10 : Math.max(1, Math.min(args.limit, 20))
        const items = await client.listPrs(args.owner, args.repo, { state: args.state, perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'github_get_file',
      description: 'Read a file from a GitHub repository (raw content, base64-decoded). Supports an optional branch or ref.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        path: { type: 'string', required: true, description: 'File path in the repository, e.g. src/index.ts' },
        ref: { type: 'string', description: 'Branch or commit ref (defaults to the default branch)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the file exists' },
            name: { type: 'string', description: 'File name' },
            path: { type: 'string', description: 'File path' },
            size: { type: 'integer', description: 'File size in bytes' },
            content: { type: 'string', description: 'File content (decoded text)' },
            url: { type: 'string', description: 'File URL' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'File not found.' }]
          const content = value.content ?? ''
          const preview = content.length > 2000 ? `${content.slice(0, 2000)}\n... [truncated, ${content.length} chars total]` : content
          return [{ type: 'text', text: `${value.path} (${value.size} bytes)\n\n${preview}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Read ${args.path}`, kind: 'read', locations: [{ path: args.path }] }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; path?: string; size?: number; content?: string }
        if (!v.found) return { card: 'generic', title: 'File not found' }
        return { card: 'generic', title: `${v.path} (${v.size} bytes)` }
      },
      async execute(args, exec) {
        try {
          const file = await client.getFile(args.owner, args.repo, args.path, { ref: args.ref, signal: exec.signal })
          const content = file.encoding === 'base64'
            ? Buffer.from(file.content, 'base64').toString('utf8')
            : file.content
          return { found: true, name: file.name, path: file.path, size: file.size, content, url: file.url }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_list_commits',
      description: 'List recent commits of a GitHub repository, optionally filtered by branch and author.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        branch: { type: 'string', description: 'Branch name (defaults to the default branch)' },
        author: { type: 'string', description: 'GitHub username or email to filter by' },
        limit: { type: 'integer', description: 'Maximum results, 1-30 (default 10)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  sha: { type: 'string', description: 'Short commit SHA' },
                  message: { type: 'string', description: 'Commit subject' },
                  author: { type: 'string', description: 'Author name' },
                  date: { type: 'string', description: 'ISO commit timestamp' },
                  url: { type: 'string', description: 'Commit URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No commits found.' }]
          const lines = items.map(item => `${item.sha} ${item.message} (${item.author}, ${item.date})`)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Commits: ${args.owner}/${args.repo}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ sha: string; message: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No commits' }
        return {
          card: 'generic',
          title: `${items.length} commit(s)`,
          content: [{ type: 'text', text: items.map(i => `${i.sha} ${i.message}`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 10 : Math.max(1, Math.min(args.limit, 30))
        const items = await client.listCommits(args.owner, args.repo, { branch: args.branch, author: args.author, perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'github_create_issue',
      description: 'Create an issue in a GitHub repository. WRITE operation: requires a configured token and affects the remote repository.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        title: { type: 'string', required: true, description: 'Issue title' },
        body: { type: 'string', description: 'Issue body (Markdown)' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Label names to apply' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the issue was created' },
            number: { type: 'integer', description: 'Issue number when created' },
            url: { type: 'string', description: 'Issue URL when created' },
            reason: { type: 'string', description: 'Explanation when not created' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Created issue #${value.number}: ${value.url}` }]
          return [{ type: 'text', text: `Could not create the issue: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Create issue: ${args.title}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; number?: number; url?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Issue #${v.number} created`, content: [{ type: 'text', text: v.url ?? '' }] }
        return { card: 'generic', title: 'Create issue failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Creating an issue requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.createIssue(args.owner, args.repo, { title: args.title, body: args.body, labels: args.labels }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_comment_issue',
      description: 'Comment on a GitHub issue or pull request. WRITE operation: requires a configured token and affects the remote repository.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        issueNumber: { type: 'integer', required: true, description: 'Issue or PR number' },
        body: { type: 'string', required: true, description: 'Comment body (Markdown)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the comment was posted' },
            number: { type: 'integer', description: 'Comment id when posted' },
            url: { type: 'string', description: 'Comment URL when posted' },
            reason: { type: 'string', description: 'Explanation when not posted' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Posted comment: ${value.url}` }]
          return [{ type: 'text', text: `Could not post the comment: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Comment on #${args.issueNumber}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; url?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: 'Comment posted', content: [{ type: 'text', text: v.url ?? '' }] }
        return { card: 'generic', title: 'Comment failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Commenting requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.commentOnIssue(args.owner, args.repo, args.issueNumber, args.body, exec.signal)
      },
    }),

    defineTool({
      name: 'github_update_issue',
      description: 'Open or close a GitHub issue. WRITE operation: requires a configured token and affects the remote repository.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        issueNumber: { type: 'integer', required: true, description: 'Issue number' },
        state: { type: 'string', enum: ['open', 'closed'], required: true, description: 'Target state' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the issue state was updated' },
            number: { type: 'integer', description: 'Issue number' },
            url: { type: 'string', description: 'Issue URL' },
            reason: { type: 'string', description: 'Explanation when not updated' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Updated issue #${value.number}: ${value.url}` }]
          return [{ type: 'text', text: `Could not update the issue: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `${args.state === 'closed' ? 'Close' : 'Open'} issue #${args.issueNumber}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; number?: number; url?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Issue #${v.number} updated`, content: [{ type: 'text', text: v.url ?? '' }] }
        return { card: 'generic', title: 'Update issue failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Updating an issue requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.updateIssue(args.owner, args.repo, args.issueNumber, args.state, exec.signal)
      },
    }),

    defineTool({
      name: 'github_merge_pr',
      description: 'Merge a GitHub pull request. WRITE operation: requires a configured token and affects the remote repository. Only merges when the PR is mergeable.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        prNumber: { type: 'integer', required: true, description: 'Pull request number' },
        mergeMethod: { type: 'string', enum: ['merge', 'squash', 'rebase'], description: 'Merge method (default merge)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the PR was merged' },
            number: { type: 'integer', description: 'PR number' },
            url: { type: 'string', description: 'PR URL' },
            reason: { type: 'string', description: 'Explanation when not merged' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Merged PR #${value.number}: ${value.url}` }]
          return [{ type: 'text', text: `Could not merge PR #${value.number}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Merge PR #${args.prNumber}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; number?: number; url?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `PR #${v.number} merged`, content: [{ type: 'text', text: v.url ?? '' }] }
        return { card: 'generic', title: `Merge PR #${v.number} failed`, content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, number: args.prNumber, reason: 'Merging a PR requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.mergePr(args.owner, args.repo, args.prNumber, { mergeMethod: args.mergeMethod, signal: exec.signal })
      },
    }),

    defineTool({
      name: 'github_list_releases',
      description: 'List releases of a GitHub repository, including tag, name, draft/prerelease status, author, and publish time.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        limit: { type: 'integer', description: 'Maximum results, 1-20 (default 10)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  tagName: { type: 'string', description: 'Release tag' },
                  name: { type: 'string', description: 'Release name' },
                  draft: { type: 'boolean', description: 'Whether this is a draft release' },
                  prerelease: { type: 'boolean', description: 'Whether this is a prerelease' },
                  author: { type: 'string', description: 'Release author login' },
                  publishedAt: { type: 'string', description: 'ISO publish timestamp' },
                  url: { type: 'string', description: 'Release URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No releases found.' }]
          const lines = items.map(item => {
            const flags = [item.draft ? 'draft' : '', item.prerelease ? 'pre' : ''].filter(Boolean).join('+')
            const flagText = flags ? ` [${flags}]` : ''
            return `${item.tagName} — ${item.name ?? ''} (@${item.author}, ${item.publishedAt})${flagText}`
          })
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Releases: ${args.owner}/${args.repo}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ tagName: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No releases' }
        return {
          card: 'generic',
          title: `${items.length} release(s)`,
          content: [{ type: 'text', text: items.map(i => i.tagName).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 10 : Math.max(1, Math.min(args.limit, 20))
        const items = await client.listReleases(args.owner, args.repo, { perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'github_list_branches',
      description: 'List branches of a GitHub repository with their latest commit SHAs.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string', description: 'Branch name' },
                  sha: { type: 'string', description: 'Latest commit short SHA' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No branches found.' }]
          return [{ type: 'text', text: items.map(i => `${i.name} (${i.sha})`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Branches: ${args.owner}/${args.repo}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ name: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No branches' }
        return {
          card: 'generic',
          title: `${items.length} branch(es)`,
          content: [{ type: 'text', text: items.map(i => i.name).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit, 50))
        const items = await client.listBranches(args.owner, args.repo, { perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'github_get_issue',
      description: 'Get details of a single GitHub issue: title, state, author, labels, body, and creation time.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        issueNumber: { type: 'integer', required: true, description: 'Issue number' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the issue exists' },
            number: { type: 'integer', description: 'Issue number' },
            title: { type: 'string', description: 'Issue title' },
            state: { type: 'string', description: 'Issue state' },
            author: { type: 'string', description: 'Author login' },
            createdAt: { type: 'string', description: 'ISO creation timestamp' },
            labels: { type: 'array', items: { type: 'string' }, description: 'Label names' },
            body: { type: 'string', description: 'Issue body (Markdown)' },
            url: { type: 'string', description: 'Issue URL' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Issue not found.' }]
          const labels = value.labels && value.labels.length > 0 ? ` [${value.labels.join(', ')}]` : ''
          const body = value.body ? `\n\n${value.body}` : ''
          return [{ type: 'text', text: `#${value.number} ${value.title} (${value.state}, @${value.author})${labels}${body}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Issue #${args.issueNumber}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; number?: number; title?: string; state?: string }
        if (!v.found) return { card: 'generic', title: 'Issue not found' }
        return { card: 'generic', title: `#${v.number} ${v.title}`, content: [{ type: 'text', text: `state: ${v.state}` }] }
      },
      async execute(args, exec) {
        try {
          const issue = await client.getIssue(args.owner, args.repo, args.issueNumber, exec.signal)
          return { found: true, ...issue }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_list_issue_comments',
      description: 'List comments on a GitHub issue: author, time, and body.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        issueNumber: { type: 'integer', required: true, description: 'Issue number' },
        limit: { type: 'integer', description: 'Maximum results, 1-30 (default 10)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Comment id' },
                  author: { type: 'string', description: 'Author login' },
                  createdAt: { type: 'string', description: 'ISO creation timestamp' },
                  body: { type: 'string', description: 'Comment body' },
                  url: { type: 'string', description: 'Comment URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No comments found.' }]
          const lines = items.map(item => `@${item.author} (${item.createdAt}): ${(item.body ?? '').slice(0, 200)}`)
          return [{ type: 'text', text: lines.join('\n\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Comments on #${args.issueNumber}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ author: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No comments' }
        return {
          card: 'generic',
          title: `${items.length} comment(s)`,
          content: [{ type: 'text', text: items.map(i => `@${i.author}`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 10 : Math.max(1, Math.min(args.limit, 30))
        const items = await client.listIssueComments(args.owner, args.repo, args.issueNumber, { perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'github_list_pr_comments',
      description: 'List review comments on a GitHub pull request: author, time, and body.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        prNumber: { type: 'integer', required: true, description: 'Pull request number' },
        limit: { type: 'integer', description: 'Maximum results, 1-30 (default 10)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Comment id' },
                  author: { type: 'string', description: 'Author login' },
                  createdAt: { type: 'string', description: 'ISO creation timestamp' },
                  body: { type: 'string', description: 'Comment body' },
                  url: { type: 'string', description: 'Comment URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No PR comments found.' }]
          const lines = items.map(item => `@${item.author} (${item.createdAt}): ${(item.body ?? '').slice(0, 200)}`)
          return [{ type: 'text', text: lines.join('\n\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `PR #${args.prNumber} comments`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ author: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No PR comments' }
        return {
          card: 'generic',
          title: `${items.length} PR comment(s)`,
          content: [{ type: 'text', text: items.map(i => `@${i.author}`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 10 : Math.max(1, Math.min(args.limit, 30))
        const items = await client.listPrComments(args.owner, args.repo, args.prNumber, { perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'github_get_user',
      description: 'Get information about a GitHub user or organization: name, bio, followers, public repositories, and location.',
      parameters: {
        username: { type: 'string', required: true, description: 'GitHub username or organization name' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the user exists' },
            login: { type: 'string', description: 'Username' },
            name: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Display name' },
            bio: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Bio' },
            followers: { type: 'integer', description: 'Follower count' },
            following: { type: 'integer', description: 'Following count' },
            publicRepos: { type: 'integer', description: 'Public repository count' },
            location: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Location' },
            blog: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Website URL' },
            url: { type: 'string', description: 'Profile URL' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'User not found.' }]
          const lines = [
            `${value.name ?? value.login} (@${value.login})`,
            value.bio ?? '',
            `followers: ${value.followers ?? 0} · following: ${value.following ?? 0} · public repos: ${value.publicRepos ?? 0}`,
            value.location ? `location: ${value.location}` : '',
            value.blog ? `blog: ${value.blog}` : '',
            value.url ?? '',
          ].filter(Boolean)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `User: ${args.username}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; login?: string; name?: string | null }
        if (!v.found) return { card: 'generic', title: 'User not found' }
        return { card: 'generic', title: `${v.name ?? v.login} (@${v.login})` }
      },
      async execute(args, exec) {
        try {
          const user = await client.getUser(args.username, exec.signal)
          return { found: true, ...user }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_list_workflow_runs',
      description: 'List recent GitHub Actions workflow runs: workflow name, branch, status, and conclusion. Public repositories need no token.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        branch: { type: 'string', description: 'Filter by branch' },
        status: { type: 'string', enum: ['completed', 'in_progress', 'queued', 'success', 'failure', 'cancelled'], description: 'Filter by run status' },
        limit: { type: 'integer', description: 'Maximum results, 1-20 (default 10)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Run id' },
                  workflowName: { type: 'string', description: 'Workflow name' },
                  headBranch: { type: 'string', description: 'Branch' },
                  status: { type: 'string', description: 'Run status' },
                  conclusion: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Run conclusion when completed' },
                  createdAt: { type: 'string', description: 'ISO creation timestamp' },
                  url: { type: 'string', description: 'Run URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No workflow runs found.' }]
          const lines = items.map(item => {
            const conclusion = item.conclusion ? ` → ${item.conclusion}` : ''
            return `${item.workflowName} @ ${item.headBranch} (${item.status}${conclusion}, ${item.createdAt})`
          })
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `CI runs: ${args.owner}/${args.repo}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ workflowName: string; status: string; conclusion?: string | null }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No workflow runs' }
        return {
          card: 'generic',
          title: `${items.length} run(s)`,
          content: [{ type: 'text', text: items.map(i => `${i.workflowName}: ${i.conclusion ?? i.status}`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 10 : Math.max(1, Math.min(args.limit, 20))
        const items = await client.listWorkflowRuns(args.owner, args.repo, { branch: args.branch, status: args.status, perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'github_create_branch',
      description: 'Create a branch in a GitHub repository from an existing ref (default branch or any other ref). WRITE operation: requires a token.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        branch: { type: 'string', required: true, description: 'New branch name, e.g. feature/my-change' },
        fromRef: { type: 'string', description: 'Source ref to branch from, e.g. main or heads/main (default: the default branch, use "heads/main" format for other branches)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the branch was created' },
            name: { type: 'string', description: 'Branch name' },
            reason: { type: 'string', description: 'Explanation when not created' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Created branch ${value.name}` }]
          return [{ type: 'text', text: `Could not create branch: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Create branch ${args.branch}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; name?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Branch ${v.name} created` }
        return { card: 'generic', title: 'Create branch failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Creating a branch requires a GitHub token. Configure the plugin with a token.' }
        }
        const fromRef = args.fromRef ?? 'heads/main'
        return client.createBranch(args.owner, args.repo, args.branch, fromRef, exec.signal)
      },
    }),

    defineTool({
      name: 'github_write_file',
      description: 'Create or update a file in a GitHub repository. WRITE operation: requires a token and creates a commit on the remote repository.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        path: { type: 'string', required: true, description: 'File path in the repository, e.g. docs/notes.md' },
        content: { type: 'string', required: true, description: 'File content (UTF-8 text)' },
        message: { type: 'string', required: true, description: 'Commit message' },
        branch: { type: 'string', description: 'Branch to write to (defaults to the default branch)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the file was written' },
            path: { type: 'string', description: 'File path' },
            commitSha: { type: 'string', description: 'Commit short SHA' },
            reason: { type: 'string', description: 'Explanation when not written' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Wrote ${value.path} (commit ${value.commitSha})` }]
          return [{ type: 'text', text: `Could not write ${value.path}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Write ${args.path}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; path?: string; commitSha?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Wrote ${v.path}`, content: [{ type: 'text', text: `commit ${v.commitSha}` }] }
        return { card: 'generic', title: 'Write file failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Writing a file requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.writeFile(args.owner, args.repo, args.path, args.content, { message: args.message, branch: args.branch, signal: exec.signal })
      },
    }),

    defineTool({
      name: 'github_get_readme',
      description: 'Read the README of a GitHub repository as markdown text.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        ref: { type: 'string', description: 'Branch or ref (defaults to the default branch)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether a README exists' },
            content: { type: 'string', description: 'README markdown text' },
            size: { type: 'integer', description: 'README size in bytes' },
            url: { type: 'string', description: 'README URL' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'No README found.' }]
          const content = value.content ?? ''
          const preview = content.length > 4000 ? `${content.slice(0, 4000)}\n... [truncated, ${content.length} chars total]` : content
          return [{ type: 'text', text: preview }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `README: ${args.owner}/${args.repo}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; size?: number }
        if (!v.found) return { card: 'generic', title: 'No README' }
        return { card: 'generic', title: `README (${v.size} bytes)` }
      },
      async execute(args, exec) {
        const readme = await client.getReadme(args.owner, args.repo, { ref: args.ref, signal: exec.signal })
        return readme
      },
    }),

    defineTool({
      name: 'github_list_tags',
      description: 'List version tags of a GitHub repository with their latest commit SHAs.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string', description: 'Tag name' },
                  commitSha: { type: 'string', description: 'Commit short SHA' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No tags found.' }]
          return [{ type: 'text', text: items.map(i => `${i.name} (${i.commitSha})`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Tags: ${args.owner}/${args.repo}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ name: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No tags' }
        return { card: 'generic', title: `${items.length} tag(s)`, content: [{ type: 'text', text: items.map(i => i.name).join('\n') }] }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit, 50))
        const items = await client.listTags(args.owner, args.repo, { perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'github_star_repo',
      description: 'Star a GitHub repository for the authenticated user. WRITE operation: requires a token.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the repository was starred' },
            reason: { type: 'string', description: 'Explanation when not starred' },
          },
        },
        render: (args, value) => {
          if (value.ok) return [{ type: 'text', text: `Starred ${args.owner}/${args.repo}` }]
          return [{ type: 'text', text: `Could not star: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Star ${args.owner}/${args.repo}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; reason?: string }
        if (v.ok) return { card: 'generic', title: 'Starred' }
        return { card: 'generic', title: 'Star failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Starring requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.starRepo(args.owner, args.repo, exec.signal)
      },
    }),

    defineTool({
      name: 'github_unstar_repo',
      description: 'Remove a star from a GitHub repository for the authenticated user. WRITE operation: requires a token.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the star was removed' },
            reason: { type: 'string', description: 'Explanation when not removed' },
          },
        },
        render: (args, value) => {
          if (value.ok) return [{ type: 'text', text: `Unstarred ${args.owner}/${args.repo}` }]
          return [{ type: 'text', text: `Could not unstar: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Unstar ${args.owner}/${args.repo}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; reason?: string }
        if (v.ok) return { card: 'generic', title: 'Unstarred' }
        return { card: 'generic', title: 'Unstar failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Unstarring requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.unstarRepo(args.owner, args.repo, exec.signal)
      },
    }),

    defineTool({
      name: 'github_create_release',
      description: 'Create a GitHub Release for an existing tag. WRITE operation: requires a token and creates a public release.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        tagName: { type: 'string', required: true, description: 'Existing tag name, e.g. v1.0.0' },
        name: { type: 'string', description: 'Release title (defaults to the tag name)' },
        body: { type: 'string', description: 'Release notes (Markdown)' },
        draft: { type: 'boolean', description: 'Create as a draft (default false)' },
        prerelease: { type: 'boolean', description: 'Mark as prerelease (default false)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the release was created' },
            id: { type: 'integer', description: 'Release id' },
            url: { type: 'string', description: 'Release URL' },
            reason: { type: 'string', description: 'Explanation when not created' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Created release: ${value.url}` }]
          return [{ type: 'text', text: `Could not create release: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Release ${args.tagName}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; url?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: 'Release created', content: [{ type: 'text', text: v.url ?? '' }] }
        return { card: 'generic', title: 'Create release failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Creating a release requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.createRelease(args.owner, args.repo, { tagName: args.tagName, name: args.name, body: args.body, draft: args.draft, prerelease: args.prerelease }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_list_workflows',
      description: 'List GitHub Actions workflows in a repository: name, workflow file path, state, and update time.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 10)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            total: { type: 'integer', description: 'Total number of workflows' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Workflow id' },
                  name: { type: 'string', description: 'Workflow name' },
                  path: { type: 'string', description: 'Workflow file path' },
                  state: { type: 'string', description: 'Workflow state' },
                  updatedAt: { type: 'string', description: 'ISO update timestamp' },
                  url: { type: 'string', description: 'Workflow URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No workflows found.' }]
          const lines = items.map(item => `${item.name} (${item.path}, ${item.state}, updated ${item.updatedAt})`)
          return [{ type: 'text', text: `Found ${value.total ?? items.length} workflows:\n${lines.join('\n')}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Workflows: ${args.owner}/${args.repo}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { total?: number; items?: Array<{ name: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No workflows' }
        return {
          card: 'generic',
          title: `${v.total ?? items.length} workflow(s)`,
          content: [{ type: 'text', text: items.map(i => i.name).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 10 : Math.max(1, Math.min(args.limit, 50))
        return client.listWorkflows(args.owner, args.repo, { perPage: limit, signal: exec.signal })
      },
    }),

    defineTool({
      name: 'github_get_workflow',
      description: 'Get details of a single GitHub Actions workflow: name, file path, state, and update time.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        workflowId: { type: 'integer', required: true, description: 'Workflow id' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the workflow exists' },
            id: { type: 'integer', description: 'Workflow id' },
            name: { type: 'string', description: 'Workflow name' },
            path: { type: 'string', description: 'Workflow file path' },
            state: { type: 'string', description: 'Workflow state' },
            updatedAt: { type: 'string', description: 'ISO update timestamp' },
            url: { type: 'string', description: 'Workflow URL' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Workflow not found.' }]
          return [{ type: 'text', text: `${value.name} (${value.path}, ${value.state})\nupdated: ${value.updatedAt}\n${value.url}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Workflow #${args.workflowId}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; name?: string; state?: string }
        if (!v.found) return { card: 'generic', title: 'Workflow not found' }
        return { card: 'generic', title: v.name ?? 'Workflow', content: [{ type: 'text', text: `state: ${v.state}` }] }
      },
      async execute(args, exec) {
        try {
          const workflow = await client.getWorkflow(args.owner, args.repo, args.workflowId, exec.signal)
          return { found: true, ...workflow }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_get_workflow_run',
      description: 'Get details of a GitHub Actions workflow run: workflow, branch, head SHA, event, status, conclusion, and timing.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        runId: { type: 'integer', required: true, description: 'Workflow run id' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the run exists' },
            id: { type: 'integer', description: 'Run id' },
            workflowId: { type: 'integer', description: 'Workflow id' },
            workflowName: { type: 'string', description: 'Workflow name' },
            displayTitle: { type: 'string', description: 'Display title' },
            headBranch: { type: 'string', description: 'Branch' },
            headSha: { type: 'string', description: 'Commit SHA' },
            status: { type: 'string', description: 'Run status' },
            conclusion: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Run conclusion when completed' },
            event: { type: 'string', description: 'Trigger event' },
            actor: { type: 'string', description: 'Actor login' },
            createdAt: { type: 'string', description: 'ISO created timestamp' },
            updatedAt: { type: 'string', description: 'ISO updated timestamp' },
            runStartedAt: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'ISO run start timestamp' },
            url: { type: 'string', description: 'Run URL' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Workflow run not found.' }]
          const conclusion = value.conclusion ? ` -> ${value.conclusion}` : ''
          return [{ type: 'text', text: [
            `${value.displayTitle ?? value.workflowName} (run #${value.id})`,
            `workflow: ${value.workflowName}`,
            `branch: ${value.headBranch} @ ${(value.headSha ?? '').slice(0, 7)}`,
            `status: ${value.status}${conclusion}`,
            `event: ${value.event} by @${value.actor}`,
            `created: ${value.createdAt}`,
            `started: ${value.runStartedAt ?? 'n/a'}`,
            `updated: ${value.updatedAt}`,
            value.url ?? '',
          ].filter(Boolean).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `CI run #${args.runId}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; id?: number; displayTitle?: string; workflowName?: string; status?: string; conclusion?: string | null }
        if (!v.found) return { card: 'generic', title: 'Workflow run not found' }
        return {
          card: 'generic',
          title: `CI run #${v.id}`,
          content: [{ type: 'text', text: `${v.status}${v.conclusion ? ` -> ${v.conclusion}` : ''}` }],
        }
      },
      async execute(args, exec) {
        try {
          const run = await client.getWorkflowRun(args.owner, args.repo, args.runId, exec.signal)
          return { found: true, ...run }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_list_workflow_jobs',
      description: 'List jobs of a GitHub Actions workflow run, including each job and its steps with statuses and timings.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        runId: { type: 'integer', required: true, description: 'Workflow run id' },
        limit: { type: 'integer', description: 'Maximum jobs, 1-100 (default 30)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the run exists' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Job id' },
                  name: { type: 'string', description: 'Job name' },
                  status: { type: 'string', description: 'Job status' },
                  conclusion: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Job conclusion' },
                  startedAt: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'ISO start timestamp' },
                  completedAt: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'ISO completion timestamp' },
                  url: { type: 'string', description: 'Job URL' },
                  steps: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        number: { type: 'integer', description: 'Step number' },
                        name: { type: 'string', description: 'Step name' },
                        status: { type: 'string', description: 'Step status' },
                        conclusion: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Step conclusion' },
                        startedAt: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'ISO start timestamp' },
                        completedAt: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'ISO completion timestamp' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Workflow run not found.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No jobs found.' }]
          const lines = items.map(job => {
            const conclusion = job.conclusion ? ` -> ${job.conclusion}` : ''
            const steps = (job.steps ?? []).map(step => {
              const stepConclusion = step.conclusion ? ` -> ${step.conclusion}` : ''
              return `  ${step.number}. ${step.name}: ${step.status}${stepConclusion}`
            }).join('\n')
            return `#${job.id} ${job.name} (${job.status}${conclusion})${steps ? `\n${steps}` : ''}`
          })
          return [{ type: 'text', text: lines.join('\n\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Jobs for CI run #${args.runId}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; items?: Array<{ name: string; status: string; conclusion?: string | null }> }
        if (!v.found) return { card: 'generic', title: 'Workflow run not found' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No jobs' }
        return {
          card: 'generic',
          title: `${items.length} job(s)`,
          content: [{ type: 'text', text: items.map(i => `${i.name}: ${i.conclusion ?? i.status}`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 30 : Math.max(1, Math.min(args.limit, 100))
        try {
          return await client.listWorkflowJobs(args.owner, args.repo, args.runId, { perPage: limit, signal: exec.signal })
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false, items: [] }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_get_workflow_run_logs',
      description: 'Download and decode GitHub Actions workflow run logs. Returns the combined log text, capped to 200,000 characters.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        runId: { type: 'integer', required: true, description: 'Workflow run id' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the run exists' },
            logs: { type: 'string', description: 'Combined workflow logs (may be truncated)' },
            truncated: { type: 'boolean', description: 'Whether logs were truncated to the output cap' },
            totalChars: { type: 'integer', description: 'Total decoded log characters' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Workflow run not found.' }]
          const logs = value.logs ?? ''
          const preview = logs.length > 10_000 ? `${logs.slice(0, 10_000)}\n... [truncated preview, ${logs.length} chars total]` : logs
          const note = value.truncated ? `\n\n[Logs truncated by tool to ${value.totalChars ?? logs.length} total chars]\n` : ''
          return [{ type: 'text', text: `${preview}${note}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `CI logs for run #${args.runId}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; logs?: string; truncated?: boolean; totalChars?: number }
        if (!v.found) return { card: 'generic', title: 'Workflow run not found' }
        return {
          card: 'generic',
          title: `CI logs (${v.totalChars ?? (v.logs ?? '').length} chars)`,
          content: [{ type: 'text', text: `${v.truncated ? 'truncated: ' : ''}${(v.logs ?? '').slice(0, 120)}` }],
        }
      },
      async execute(args, exec) {
        try {
          return await client.getWorkflowRunLogs(args.owner, args.repo, args.runId, { signal: exec.signal })
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_rerun_workflow_run',
      description: 'Rerun a GitHub Actions workflow run. WRITE operation: requires a token and starts a new run.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        runId: { type: 'integer', required: true, description: 'Workflow run id' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the rerun was requested' },
            runId: { type: 'integer', description: 'Workflow run id' },
            reason: { type: 'string', description: 'Explanation when not rerun' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Rerun requested for workflow run #${value.runId}` }]
          return [{ type: 'text', text: `Could not rerun workflow run #${value.runId}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Rerun CI run #${args.runId}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; runId?: number; reason?: string }
        if (v.ok) return { card: 'generic', title: `Rerun requested for run #${v.runId}` }
        return { card: 'generic', title: 'Rerun failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, runId: args.runId, reason: 'Rerunning a workflow requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.rerunWorkflowRun(args.owner, args.repo, args.runId, exec.signal)
      },
    }),

    defineTool({
      name: 'github_cancel_workflow_run',
      description: 'Cancel a GitHub Actions workflow run. WRITE operation: requires a token and stops an in-progress run.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        runId: { type: 'integer', required: true, description: 'Workflow run id' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether cancellation was requested' },
            runId: { type: 'integer', description: 'Workflow run id' },
            reason: { type: 'string', description: 'Explanation when not cancelled' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Cancellation requested for workflow run #${value.runId}` }]
          return [{ type: 'text', text: `Could not cancel workflow run #${value.runId}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Cancel CI run #${args.runId}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; runId?: number; reason?: string }
        if (v.ok) return { card: 'generic', title: `Cancellation requested for run #${v.runId}` }
        return { card: 'generic', title: 'Cancel failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, runId: args.runId, reason: 'Cancelling a workflow requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.cancelWorkflowRun(args.owner, args.repo, args.runId, exec.signal)
      },
    }),

    defineTool({
      name: 'github_get_pull_request',
      description: 'Get details of a GitHub pull request: branches, SHAs, body, merge state, review decision, changed files, and timestamps.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        prNumber: { type: 'integer', required: true, description: 'Pull request number' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the pull request exists' },
            number: { type: 'integer', description: 'PR number' },
            title: { type: 'string', description: 'PR title' },
            state: { type: 'string', description: 'PR state' },
            draft: { type: 'boolean', description: 'Whether the PR is a draft' },
            author: { type: 'string', description: 'Author login' },
            headRef: { type: 'string', description: 'Head branch' },
            headSha: { type: 'string', description: 'Head commit SHA' },
            baseRef: { type: 'string', description: 'Base branch' },
            baseSha: { type: 'string', description: 'Base commit SHA' },
            body: { type: 'string', description: 'PR body (Markdown)' },
            mergeable: { oneOf: [{ type: 'boolean' }, { type: 'null' }], description: 'Whether GitHub can merge the PR' },
            merged: { type: 'boolean', description: 'Whether the PR is merged' },
            reviewDecision: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Review decision' },
            additions: { type: 'integer', description: 'Added line count' },
            deletions: { type: 'integer', description: 'Deleted line count' },
            changedFiles: { type: 'integer', description: 'Changed file count' },
            createdAt: { type: 'string', description: 'ISO created timestamp' },
            updatedAt: { type: 'string', description: 'ISO updated timestamp' },
            mergedAt: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'ISO merged timestamp' },
            url: { type: 'string', description: 'PR URL' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Pull request not found.' }]
          const status = value.merged ? 'merged' : value.draft ? 'draft' : value.state
          const review = value.reviewDecision ? `, review: ${value.reviewDecision}` : ''
          const merge = value.mergeable === null ? '' : value.mergeable ? ', mergeable' : ', not mergeable'
          const body = value.body ? `\n\n${value.body}` : ''
          return [{ type: 'text', text: [
            `#${value.number} ${value.title} (${status}, @${value.author})${review}${merge}`,
            `${value.headRef} (${(value.headSha ?? '').slice(0, 7)}) -> ${value.baseRef} (${(value.baseSha ?? '').slice(0, 7)})`,
            `+${value.additions} -${value.deletions} in ${value.changedFiles} files`,
            `created: ${value.createdAt}, updated: ${value.updatedAt}`,
            value.url ?? '',
            body,
          ].filter(Boolean).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `PR #${args.prNumber}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; number?: number; title?: string; state?: string }
        if (!v.found) return { card: 'generic', title: 'Pull request not found' }
        return { card: 'generic', title: `PR #${v.number} ${v.title}`, content: [{ type: 'text', text: `state: ${v.state}` }] }
      },
      async execute(args, exec) {
        try {
          const pr = await client.getPullRequest(args.owner, args.repo, args.prNumber, exec.signal)
          return { found: true, ...pr }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_list_pull_request_reviews',
      description: 'List reviews on a GitHub pull request: reviewer, review state, body, and submission time.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        prNumber: { type: 'integer', required: true, description: 'Pull request number' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the pull request exists' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Review id' },
                  author: { type: 'string', description: 'Reviewer login' },
                  state: { type: 'string', description: 'Review state' },
                  body: { type: 'string', description: 'Review body' },
                  submittedAt: { type: 'string', description: 'ISO submission timestamp' },
                  commitSha: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Reviewed commit SHA' },
                  url: { type: 'string', description: 'Review URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Pull request not found.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No reviews found.' }]
          const lines = items.map(item => `@${item.author} [${item.state}] (${item.submittedAt}): ${(item.body ?? '').slice(0, 500)}`)
          return [{ type: 'text', text: lines.join('\n\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Reviews: PR #${args.prNumber}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; items?: Array<{ author: string; state: string }> }
        if (!v.found) return { card: 'generic', title: 'Pull request not found' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No reviews' }
        return {
          card: 'generic',
          title: `${items.length} review(s)`,
          content: [{ type: 'text', text: items.map(i => `@${i.author}: ${i.state}`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit, 50))
        try {
          const items = await client.listPullRequestReviews(args.owner, args.repo, args.prNumber, { perPage: limit, signal: exec.signal })
          return { found: true, items }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false, items: [] }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_request_pr_reviewers',
      description: 'Request reviewers on a GitHub pull request. WRITE operation: requires a token; supports users or team reviewers.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        prNumber: { type: 'integer', required: true, description: 'Pull request number' },
        reviewers: { type: 'array', items: { type: 'string' }, description: 'GitHub usernames to request' },
        teamReviewers: { type: 'array', items: { type: 'string' }, description: 'Team slugs to request (requires organization permissions)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether reviewers were requested' },
            prNumber: { type: 'integer', description: 'PR number' },
            reviewers: { type: 'array', items: { type: 'string' }, description: 'Requested reviewer logins' },
            reason: { type: 'string', description: 'Explanation when not requested' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Requested reviewers for PR #${value.prNumber}: ${(value.reviewers ?? []).join(', ')}` }]
          return [{ type: 'text', text: `Could not request reviewers for PR #${value.prNumber}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Request reviewers for PR #${args.prNumber}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; prNumber?: number; reviewers?: string[]; reason?: string }
        if (v.ok) return { card: 'generic', title: `Reviewers requested for PR #${v.prNumber}`, content: [{ type: 'text', text: (v.reviewers ?? []).join(', ') }] }
        return { card: 'generic', title: 'Request reviewers failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, prNumber: args.prNumber, reason: 'Requesting reviewers requires a GitHub token. Configure the plugin with a token.' }
        }
        if (!args.reviewers?.length && !args.teamReviewers?.length) {
          return { ok: false, prNumber: args.prNumber, reason: 'Provide at least one reviewer or team reviewer.' }
        }
        return client.requestPrReviewers(args.owner, args.repo, args.prNumber, { reviewers: args.reviewers, teamReviewers: args.teamReviewers }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_submit_pr_review',
      description: 'Submit a review on a GitHub pull request. WRITE operation: requires a token; event is APPROVE, REQUEST_CHANGES, or COMMENT.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        prNumber: { type: 'integer', required: true, description: 'Pull request number' },
        body: { type: 'string', required: true, description: 'Review summary (Markdown)' },
        event: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'], required: true, description: 'Review event' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the review was submitted' },
            prNumber: { type: 'integer', description: 'PR number' },
            reviewId: { type: 'integer', description: 'Review id' },
            state: { type: 'string', description: 'Review state' },
            url: { type: 'string', description: 'Review URL' },
            reason: { type: 'string', description: 'Explanation when not submitted' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Submitted ${value.state} review on PR #${value.prNumber}: ${value.url}` }]
          return [{ type: 'text', text: `Could not submit review on PR #${value.prNumber}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `${args.event === 'APPROVE' ? 'Approve' : args.event === 'REQUEST_CHANGES' ? 'Request changes on' : 'Comment on'} PR #${args.prNumber}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; prNumber?: number; state?: string; url?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `${v.state ?? 'Review'} submitted on PR #${v.prNumber}`, content: [{ type: 'text', text: v.url ?? '' }] }
        return { card: 'generic', title: 'Submit review failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, prNumber: args.prNumber, reason: 'Submitting a PR review requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.submitPrReview(args.owner, args.repo, args.prNumber, { body: args.body, event: args.event }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_create_pr_draft',
      description: 'Create a draft pull request on GitHub. Returns the PR number and URL when created.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        title: { type: 'string', required: true, description: 'Pull request title' },
        head: { type: 'string', required: true, description: 'Head branch name, e.g. feature/my-change' },
        base: { type: 'string', required: true, description: 'Base branch name, e.g. main' },
        body: { type: 'string', description: 'Pull request description (Markdown)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            created: { type: 'boolean', description: 'Whether the draft PR was created' },
            number: { type: 'integer', description: 'PR number when created' },
            url: { type: 'string', description: 'PR URL when created' },
            reason: { type: 'string', description: 'Explanation when not created' },
          },
        },
        render: (_args, value) => {
          if (value.created) return [{ type: 'text', text: `Created draft PR #${value.number}: ${value.url}` }]
          return [{ type: 'text', text: `Could not create the draft PR: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Draft PR: ${args.title}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { created?: boolean; number?: number; url?: string; reason?: string }
        if (v.created) {
          return {
            card: 'generic',
            title: `Draft PR #${v.number}`,
            content: [{ type: 'text', text: v.url ?? '' }],
          }
        }
        return { card: 'generic', title: 'Draft PR failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        return client.createPrDraft(args.owner, args.repo, { title: args.title, head: args.head, base: args.base, body: args.body }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_dispatch_workflow',
      description: 'Dispatch a GitHub Actions workflow with optional string inputs. WRITE operation: requires a token and starts a new workflow run.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        workflowId: { type: 'integer', required: true, description: 'Workflow id (the action must support workflow_dispatch)' },
        ref: { type: 'string', required: true, description: 'Git ref to run the workflow on, e.g. main' },
        inputs: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string', required: true, description: 'Input name' },
              value: { type: 'string', required: true, description: 'Input value' },
            },
          },
          description: 'Optional workflow_dispatch inputs (name/value pairs, string values only)',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the dispatch was accepted' },
            workflowId: { type: 'integer', description: 'Workflow id' },
            reason: { type: 'string', description: 'Explanation when not dispatched' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Workflow #${value.workflowId} dispatched on ${_args.ref}` }]
          return [{ type: 'text', text: `Could not dispatch workflow #${value.workflowId}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Dispatch workflow #${args.workflowId} on ${args.ref}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; workflowId?: number; reason?: string }
        if (v.ok) return { card: 'generic', title: `Workflow #${v.workflowId} dispatched` }
        return { card: 'generic', title: 'Dispatch failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, workflowId: args.workflowId as number, reason: 'Dispatching a workflow requires a GitHub token. Configure the plugin with a token.' }
        }
        const inputs = (args.inputs as Array<{ name: string; value: string }> | undefined)?.reduce<Record<string, string>>((acc, item) => {
          acc[item.name] = item.value
          return acc
        }, {})
        return client.dispatchWorkflow(args.owner as string, args.repo as string, args.workflowId as number, { ref: args.ref as string, inputs }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_create_repository',
      description: 'Create a GitHub repository for the authenticated user or an organization. WRITE operation: requires a token.',
      parameters: {
        owner: { type: 'string', description: 'Organization owner. Omit to create under the authenticated user.' },
        name: { type: 'string', required: true, description: 'Repository name, e.g. agent-tools' },
        description: { type: 'string', description: 'Repository description' },
        privateRepo: { type: 'boolean', description: 'Create as private (default false)' },
        autoInit: { type: 'boolean', description: 'Initialize with a README (default false)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the repository was created' },
            fullName: { type: 'string', description: 'Owner/name of the created repository' },
            url: { type: 'string', description: 'Repository URL' },
            reason: { type: 'string', description: 'Explanation when not created' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Created repository: ${value.fullName} (${value.url})` }]
          return [{ type: 'text', text: `Could not create repository: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Create repository ${args.name}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; fullName?: string; url?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Created ${v.fullName}`, content: [{ type: 'text', text: v.url ?? '' }] }
        return { card: 'generic', title: 'Create repository failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Creating a repository requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.createRepository({
          owner: args.owner as string | undefined,
          name: args.name as string,
          description: args.description as string | undefined,
          privateRepo: args.privateRepo as boolean | undefined,
          autoInit: args.autoInit as boolean | undefined,
        }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_set_repo_topics',
      description: 'Set the complete topic list on a GitHub repository. WRITE operation: requires a token and overwrites existing topics.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        topics: { type: 'array', items: { type: 'string' }, required: true, description: 'Topic names to set, 1-20 items' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether topics were updated' },
            names: { type: 'array', items: { type: 'string' }, description: 'Topics currently set on the repository' },
            reason: { type: 'string', description: 'Explanation when topics were not updated' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Topics updated: ${(value.names ?? []).join(', ')}` }]
          return [{ type: 'text', text: `Could not update topics: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Set topics: ${args.owner}/${args.repo}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; names?: string[]; reason?: string }
        if (v.ok) return { card: 'generic', title: 'Topics updated', content: [{ type: 'text', text: (v.names ?? []).join(', ') }] }
        return { card: 'generic', title: 'Update topics failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Updating repository topics requires a GitHub token. Configure the plugin with a token.' }
        }
        const topics = (args.topics as string[]) ?? []
        if (topics.length === 0) {
          return { ok: false, reason: 'Provide at least one topic. Topics are set as a complete list.' }
        }
        return client.setRepoTopic(args.owner as string, args.repo as string, topics, exec.signal)
      },
    }),

    defineTool({
      name: 'github_list_gists',
      description: 'List gists for the authenticated user, or public gists when no token is configured. Returns file names, timestamps, and URLs.',
      parameters: {
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', description: 'Gist id' },
                  description: { type: 'string', description: 'Gist description' },
                  files: { type: 'array', items: { type: 'string' }, description: 'File names' },
                  owner: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Owner login' },
                  public: { type: 'boolean', description: 'Whether the gist is public' },
                  createdAt: { type: 'string', description: 'ISO creation timestamp' },
                  updatedAt: { type: 'string', description: 'ISO update timestamp' },
                  url: { type: 'string', description: 'Gist URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No gists found.' }]
          const lines = items.map(item => `${item.owner ?? 'anonymous'} / ${item.id} (${(item.files ?? []).join(', ')}, updated ${item.updatedAt})`)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(_args): ToolCallView {
        return { card: 'generic', title: 'List gists', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ id: string; files: string[]; owner: string | null }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No gists' }
        return {
          card: 'generic',
          title: `${items.length} gist(s)`,
          content: [{ type: 'text', text: items.map(i => `${i.owner ?? 'anonymous'}: ${i.id} (${i.files.join(', ')})`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit as number, 50))
        const items = await client.listGists({ perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'github_create_gist',
      description: 'Create a GitHub gist with one or more files. WRITE operation: requires a token.',
      parameters: {
        description: { type: 'string', description: 'Gist description' },
        publicGist: { type: 'boolean', description: 'Create as public (default false)' },
        files: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              filename: { type: 'string', required: true, description: 'File name, e.g. notes.txt' },
              content: { type: 'string', required: true, description: 'File content' },
            },
          },
          description: 'Files to include in the gist',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the gist was created' },
            id: { type: 'string', description: 'Gist id' },
            url: { type: 'string', description: 'Gist URL' },
            reason: { type: 'string', description: 'Explanation when not created' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Created gist: ${value.url}` }]
          return [{ type: 'text', text: `Could not create gist: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Create gist (${((args.files as Array<{ filename: string }>) ?? []).length} files)`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; id?: string; url?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Gist ${v.id}`, content: [{ type: 'text', text: v.url ?? '' }] }
        return { card: 'generic', title: 'Create gist failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Creating a gist requires a GitHub token. Configure the plugin with a token.' }
        }
        const files = (args.files as Array<{ filename: string; content: string }>) ?? []
        if (files.length === 0) {
          return { ok: false, reason: 'Provide at least one file.' }
        }
        return client.createGist({
          description: args.description as string | undefined,
          publicGist: args.publicGist as boolean | undefined,
          files,
        }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_list_repo_variables',
      description: 'List GitHub Actions variables for a repository. Requires a token with repository administration access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 30)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the repository exists and is accessible' },
            total: { type: 'integer', description: 'Total variable count' },
            reason: { type: 'string', description: 'Explanation when variables are not accessible' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string', description: 'Variable name' },
                  value: { type: 'string', description: 'Variable value' },
                  createdAt: { type: 'string', description: 'ISO creation timestamp' },
                  updatedAt: { type: 'string', description: 'ISO update timestamp' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Repository variables not found or not accessible.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No repository variables found.' }]
          const lines = items.map(item => `${item.name}=${item.value} (updated ${item.updatedAt})`)
          return [{ type: 'text', text: `Found ${value.total ?? items.length} variables:\n${lines.join('\n')}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Variables: ${args.owner}/${args.repo}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; total?: number; items?: Array<{ name: string }> }
        if (!v.found) return { card: 'generic', title: 'Variables not found' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No variables' }
        return { card: 'generic', title: `${v.total ?? items.length} variable(s)`, content: [{ type: 'text', text: items.map(i => i.name).join('\n') }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, total: 0, items: [], reason: 'Listing repository variables requires a GitHub token. Configure the plugin with a token.' }
        }
        const limit = args.limit === undefined ? 30 : Math.max(1, Math.min(args.limit as number, 50))
        return client.listRepoVariables(args.owner as string, args.repo as string, { perPage: limit, signal: exec.signal })
      },
    }),

    defineTool({
      name: 'github_set_repo_variable',
      description: 'Create or update a GitHub Actions repository variable. WRITE operation: requires a token.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        name: { type: 'string', required: true, description: 'Variable name, e.g. DEPLOY_TARGET' },
        value: { type: 'string', required: true, description: 'Variable value' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the variable was saved' },
            name: { type: 'string', description: 'Variable name' },
            created: { type: 'boolean', description: 'Whether the variable was created' },
            updated: { type: 'boolean', description: 'Whether an existing variable was updated' },
            reason: { type: 'string', description: 'Explanation when not saved' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Saved variable ${value.name}${value.updated ? ' (updated)' : ' (created)'}` }]
          return [{ type: 'text', text: `Could not save variable ${value.name}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Save variable ${args.name}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; name?: string; updated?: boolean; reason?: string }
        if (v.ok) return { card: 'generic', title: `Variable ${v.name} saved`, content: [{ type: 'text', text: v.updated ? 'updated' : 'created' }] }
        return { card: 'generic', title: 'Save variable failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, name: args.name as string, reason: 'Setting a repository variable requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.setRepoVariable(args.owner as string, args.repo as string, args.name as string, args.value as string, exec.signal)
      },
    }),

    defineTool({
      name: 'github_delete_repo_variable',
      description: 'Delete a GitHub Actions repository variable. WRITE operation: requires a token.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        name: { type: 'string', required: true, description: 'Variable name' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the variable was deleted' },
            name: { type: 'string', description: 'Variable name' },
            reason: { type: 'string', description: 'Explanation when not deleted' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Deleted variable ${value.name}` }]
          return [{ type: 'text', text: `Could not delete variable ${value.name}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Delete variable ${args.name}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; name?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Variable ${v.name} deleted` }
        return { card: 'generic', title: 'Delete variable failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, name: args.name as string, reason: 'Deleting a repository variable requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.deleteRepoVariable(args.owner as string, args.repo as string, args.name as string, exec.signal)
      },
    }),

    defineTool({
      name: 'github_list_repo_secrets',
      description: 'List GitHub Actions repository secret names and timestamps. Values are never returned. Requires a token with repository administration access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 30)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the repository exists and is accessible' },
            total: { type: 'integer', description: 'Total secret count' },
            reason: { type: 'string', description: 'Explanation when secrets are not accessible' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string', description: 'Secret name' },
                  createdAt: { type: 'string', description: 'ISO creation timestamp' },
                  updatedAt: { type: 'string', description: 'ISO update timestamp' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Repository secrets not found or not accessible.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No repository secrets found.' }]
          const lines = items.map(item => `${item.name} (updated ${item.updatedAt})`)
          return [{ type: 'text', text: `Found ${value.total ?? items.length} secrets:\n${lines.join('\n')}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Secrets: ${args.owner}/${args.repo}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; total?: number; items?: Array<{ name: string }> }
        if (!v.found) return { card: 'generic', title: 'Secrets not found' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No secrets' }
        return { card: 'generic', title: `${v.total ?? items.length} secret(s)`, content: [{ type: 'text', text: items.map(i => i.name).join('\n') }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, total: 0, items: [], reason: 'Listing repository secrets requires a GitHub token. Configure the plugin with a token.' }
        }
        const limit = args.limit === undefined ? 30 : Math.max(1, Math.min(args.limit as number, 50))
        return client.listRepoSecrets(args.owner as string, args.repo as string, { perPage: limit, signal: exec.signal })
      },
    }),

    defineTool({
      name: 'github_delete_repo_secret',
      description: 'Delete a GitHub Actions repository secret. WRITE operation: requires a token.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        name: { type: 'string', required: true, description: 'Secret name' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the secret was deleted' },
            name: { type: 'string', description: 'Secret name' },
            reason: { type: 'string', description: 'Explanation when not deleted' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Deleted secret ${value.name}` }]
          return [{ type: 'text', text: `Could not delete secret ${value.name}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Delete secret ${args.name}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; name?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Secret ${v.name} deleted` }
        return { card: 'generic', title: 'Delete secret failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, name: args.name as string, reason: 'Deleting a repository secret requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.deleteRepoSecret(args.owner as string, args.repo as string, args.name as string, exec.signal)
      },
    }),

    defineTool({
      name: 'github_set_repo_secret',
      description: 'Create or update a GitHub Actions repository secret. WRITE operation: requires a token; the value is encrypted locally before upload.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        name: { type: 'string', required: true, description: 'Secret name, e.g. API_KEY' },
        value: { type: 'string', required: true, description: 'Secret value. Never log or expose this value.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the secret was saved' },
            name: { type: 'string', description: 'Secret name' },
            reason: { type: 'string', description: 'Explanation when not saved' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Saved secret ${value.name}` }]
          return [{ type: 'text', text: `Could not save secret ${value.name}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Save secret ${args.name}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; name?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Secret ${v.name} saved` }
        return { card: 'generic', title: 'Save secret failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, name: args.name as string, reason: 'Setting a repository secret requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.setRepoSecret(args.owner as string, args.repo as string, args.name as string, args.value as string, exec.signal)
      },
    }),

    defineTool({
      name: 'github_get_branch_protection',
      description: 'Get branch protection rules for a GitHub branch: status checks, review requirements, admins, force pushes, deletions, and linear history.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        branch: { type: 'string', required: true, description: 'Branch name, e.g. main' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether branch protection is configured' },
            enabled: { type: 'boolean', description: 'Whether protection is enabled' },
            contexts: { type: 'array', items: { type: 'string' }, description: 'Required status check contexts' },
            strict: { type: 'boolean', description: 'Whether status checks must be up to date' },
            enforceAdmins: { type: 'boolean', description: 'Whether admins must follow the rules' },
            requiredApprovingReviewCount: { type: 'integer', description: 'Required approving reviews' },
            dismissStaleReviews: { type: 'boolean', description: 'Whether stale reviews are dismissed' },
            requireCodeOwnerReviews: { type: 'boolean', description: 'Whether code owner reviews are required' },
            requiredLinearHistory: { type: 'boolean', description: 'Whether linear history is required' },
            allowForcePushes: { type: 'boolean', description: 'Whether force pushes are allowed' },
            allowDeletions: { type: 'boolean', description: 'Whether deletions are allowed' },
            requiredConversationResolution: { type: 'boolean', description: 'Whether resolved conversations are required' },
            url: { type: 'string', description: 'Protection API URL' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'No branch protection is configured for this branch.' }]
          const checks = (value.contexts ?? []).length > 0 ? `checks: ${(value.contexts ?? []).join(', ')}` : 'checks: none'
          return [{ type: 'text', text: [
            `Branch protection enabled`,
            checks,
            `reviews: ${value.requiredApprovingReviewCount ?? 0} required${value.dismissStaleReviews ? ', stale reviews dismissed' : ''}${value.requireCodeOwnerReviews ? ', code owners required' : ''}`,
            `admins: ${value.enforceAdmins ? 'enforced' : 'not enforced'}`,
            `linear history: ${value.requiredLinearHistory ? 'required' : 'off'}`,
            `force pushes: ${value.allowForcePushes ? 'allowed' : 'blocked'}`,
            `deletions: ${value.allowDeletions ? 'allowed' : 'blocked'}`,
          ].join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Branch protection: ${args.owner}/${args.repo}#${args.branch}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; contexts?: string[]; requiredApprovingReviewCount?: number }
        if (!v.found) return { card: 'generic', title: 'No branch protection' }
        return {
          card: 'generic',
          title: 'Branch protection enabled',
          content: [{ type: 'text', text: `${v.requiredApprovingReviewCount ?? 0} reviews, ${(v.contexts ?? []).length} checks` }],
        }
      },
      async execute(args, exec) {
        return client.getBranchProtection(args.owner as string, args.repo as string, args.branch as string, exec.signal)
      },
    }),

    defineTool({
      name: 'github_set_branch_protection',
      description: 'Set branch protection rules on a GitHub branch. WRITE operation: requires a token and overwrites existing rules.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        branch: { type: 'string', required: true, description: 'Branch name, e.g. main' },
        requiredStatusChecks: { type: 'array', items: { type: 'string' }, description: 'Required status check contexts' },
        strictRequiredStatusChecks: { type: 'boolean', description: 'Require status checks to be up to date (default true)' },
        enforceAdmins: { type: 'boolean', description: 'Apply rules to admins (default true)' },
        requiredApprovingReviewCount: { type: 'integer', description: 'Required approving reviews, 0 disables PR review rules' },
        dismissStaleReviews: { type: 'boolean', description: 'Dismiss stale PR reviews (default false)' },
        requireCodeOwnerReviews: { type: 'boolean', description: 'Require code owner reviews (default false)' },
        requiredLinearHistory: { type: 'boolean', description: 'Require linear history (default false)' },
        allowForcePushes: { type: 'boolean', description: 'Allow force pushes (default false)' },
        allowDeletions: { type: 'boolean', description: 'Allow branch deletion (default false)' },
        requiredConversationResolution: { type: 'boolean', description: 'Require resolved conversations (default false)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether branch protection was updated' },
            branch: { type: 'string', description: 'Branch name' },
            url: { type: 'string', description: 'Protection API URL' },
            reason: { type: 'string', description: 'Explanation when not updated' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Updated branch protection for ${value.branch}: ${value.url}` }]
          return [{ type: 'text', text: `Could not update branch protection for ${value.branch}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Set branch protection: ${args.branch}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; branch?: string; url?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Protection updated for ${v.branch}`, content: [{ type: 'text', text: v.url ?? '' }] }
        return { card: 'generic', title: 'Update protection failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, branch: args.branch as string, reason: 'Setting branch protection requires a GitHub token. Configure the plugin with a token.' }
        }
        const reviewCount = args.requiredApprovingReviewCount === undefined ? undefined : Math.max(0, Math.min(args.requiredApprovingReviewCount as number, 10))
        return client.setBranchProtection(args.owner as string, args.repo as string, args.branch as string, {
          requiredStatusChecks: args.requiredStatusChecks as string[] | undefined,
          strictRequiredStatusChecks: args.strictRequiredStatusChecks as boolean | undefined,
          enforceAdmins: args.enforceAdmins as boolean | undefined,
          requiredApprovingReviewCount: reviewCount,
          dismissStaleReviews: args.dismissStaleReviews as boolean | undefined,
          requireCodeOwnerReviews: args.requireCodeOwnerReviews as boolean | undefined,
          requiredLinearHistory: args.requiredLinearHistory as boolean | undefined,
          allowForcePushes: args.allowForcePushes as boolean | undefined,
          allowDeletions: args.allowDeletions as boolean | undefined,
          requiredConversationResolution: args.requiredConversationResolution as boolean | undefined,
        }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_delete_branch_protection',
      description: 'Delete branch protection rules on a GitHub branch. WRITE operation: requires a token.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        branch: { type: 'string', required: true, description: 'Branch name' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether branch protection was deleted' },
            branch: { type: 'string', description: 'Branch name' },
            reason: { type: 'string', description: 'Explanation when not deleted' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Deleted branch protection for ${value.branch}` }]
          return [{ type: 'text', text: `Could not delete branch protection for ${value.branch}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Delete branch protection: ${args.branch}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; branch?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Protection deleted for ${v.branch}` }
        return { card: 'generic', title: 'Delete protection failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, branch: args.branch as string, reason: 'Deleting branch protection requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.deleteBranchProtection(args.owner as string, args.repo as string, args.branch as string, exec.signal)
      },
    }),

    defineTool({
      name: 'github_list_milestones',
      description: 'List milestones in a GitHub repository: title, state, open/closed issue counts, due date, and URL.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Milestone state (default open)' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  number: { type: 'integer', description: 'Milestone number' },
                  title: { type: 'string', description: 'Milestone title' },
                  state: { type: 'string', description: 'Milestone state' },
                  openIssues: { type: 'integer', description: 'Open issue count' },
                  closedIssues: { type: 'integer', description: 'Closed issue count' },
                  dueOn: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'ISO due date' },
                  description: { type: 'string', description: 'Milestone description' },
                  url: { type: 'string', description: 'Milestone URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No milestones found.' }]
          const lines = items.map(item => `${item.title} (#${item.number}, ${item.openIssues} open / ${item.closedIssues} closed, due ${item.dueOn ?? 'n/a'})`)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Milestones: ${args.owner}/${args.repo}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ title: string; openIssues: number; closedIssues: number }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No milestones' }
        return {
          card: 'generic',
          title: `${items.length} milestone(s)`,
          content: [{ type: 'text', text: items.map(i => `${i.title} (${i.openIssues}/${i.closedIssues})`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit as number, 50))
        const items = await client.listMilestones(args.owner as string, args.repo as string, {
          state: args.state as 'open' | 'closed' | 'all' | undefined,
          perPage: limit,
          signal: exec.signal,
        })
        return { items }
      },
    }),

    defineTool({
      name: 'github_set_issue_labels',
      description: 'Set the complete label list on a GitHub issue or PR. WRITE operation: requires a token and overwrites existing labels.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        issueNumber: { type: 'integer', required: true, description: 'Issue or PR number' },
        labels: { type: 'array', items: { type: 'string' }, required: true, description: 'Complete label names list (empty clears labels)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether labels were updated' },
            number: { type: 'integer', description: 'Issue or PR number' },
            labels: { type: 'array', items: { type: 'string' }, description: 'Labels now applied' },
            reason: { type: 'string', description: 'Explanation when not updated' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Labels for #${value.number}: ${(value.labels ?? []).join(', ') || 'none'}` }]
          return [{ type: 'text', text: `Could not set labels on #${value.number}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Set labels on #${args.issueNumber}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; number?: number; labels?: string[]; reason?: string }
        if (v.ok) return { card: 'generic', title: `Labels updated on #${v.number}`, content: [{ type: 'text', text: (v.labels ?? []).join(', ') || 'none' }] }
        return { card: 'generic', title: 'Set labels failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, number: args.issueNumber as number, reason: 'Setting issue labels requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.setIssueLabels(args.owner as string, args.repo as string, args.issueNumber as number, (args.labels as string[]) ?? [], exec.signal)
      },
    }),

    defineTool({
      name: 'github_add_issue_assignees',
      description: 'Assign GitHub users to an issue or pull request. WRITE operation: requires a token.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        issueNumber: { type: 'integer', required: true, description: 'Issue or PR number' },
        assignees: { type: 'array', items: { type: 'string' }, required: true, description: 'GitHub usernames to assign' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether assignees were added' },
            number: { type: 'integer', description: 'Issue or PR number' },
            assignees: { type: 'array', items: { type: 'string' }, description: 'Assignees now on the issue' },
            reason: { type: 'string', description: 'Explanation when not assigned' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Assigned to #${value.number}: ${(value.assignees ?? []).join(', ')}` }]
          return [{ type: 'text', text: `Could not assign #${value.number}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Assign #${args.issueNumber}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; number?: number; assignees?: string[]; reason?: string }
        if (v.ok) return { card: 'generic', title: `Assigned #${v.number}`, content: [{ type: 'text', text: (v.assignees ?? []).join(', ') }] }
        return { card: 'generic', title: 'Assign failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, number: args.issueNumber as number, reason: 'Assigning an issue requires a GitHub token. Configure the plugin with a token.' }
        }
        const assignees = (args.assignees as string[]) ?? []
        if (assignees.length === 0) {
          return { ok: false, number: args.issueNumber as number, reason: 'Provide at least one assignee.' }
        }
        return client.addIssueAssignees(args.owner as string, args.repo as string, args.issueNumber as number, assignees, exec.signal)
      },
    }),

    defineTool({
      name: 'github_set_issue_milestone',
      description: 'Set or clear the milestone on a GitHub issue or PR. WRITE operation: requires a token.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        issueNumber: { type: 'integer', required: true, description: 'Issue or PR number' },
        milestoneNumber: { type: 'integer', description: 'Milestone number to set' },
        clear: { type: 'boolean', description: 'Clear the current milestone (default false)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the milestone was updated' },
            number: { type: 'integer', description: 'Issue or PR number' },
            milestoneNumber: { oneOf: [{ type: 'integer' }, { type: 'null' }], description: 'Milestone now set on the issue' },
            reason: { type: 'string', description: 'Explanation when not updated' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Milestone on #${value.number}: ${value.milestoneNumber ?? 'none'}` }]
          return [{ type: 'text', text: `Could not set milestone on #${value.number}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Set milestone on #${args.issueNumber}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; number?: number; milestoneNumber?: number | null; reason?: string }
        if (v.ok) return { card: 'generic', title: `Milestone updated on #${v.number}`, content: [{ type: 'text', text: v.milestoneNumber?.toString() ?? 'none' }] }
        return { card: 'generic', title: 'Set milestone failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, number: args.issueNumber as number, reason: 'Setting an issue milestone requires a GitHub token. Configure the plugin with a token.' }
        }
        const milestoneNumber = args.milestoneNumber as number | undefined
        const clear = Boolean(args.clear)
        if (!clear && milestoneNumber === undefined) {
          return { ok: false, number: args.issueNumber as number, reason: 'Provide milestoneNumber or set clear=true.' }
        }
        return client.setIssueMilestone(args.owner as string, args.repo as string, args.issueNumber as number, { milestoneNumber, clear }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_reply_pr_comment',
      description: 'Reply to an existing pull request review comment. WRITE operation: requires a token.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        prNumber: { type: 'integer', required: true, description: 'Pull request number' },
        commentId: { type: 'integer', required: true, description: 'Parent review comment id' },
        body: { type: 'string', required: true, description: 'Reply body (Markdown)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the reply was posted' },
            commentId: { type: 'integer', description: 'New comment id' },
            url: { type: 'string', description: 'New comment URL' },
            reason: { type: 'string', description: 'Explanation when not posted' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Replied to PR comment: ${value.url}` }]
          return [{ type: 'text', text: `Could not reply to PR comment #${value.commentId}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Reply to PR comment #${args.commentId}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; commentId?: number; url?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `PR comment reply #${v.commentId}`, content: [{ type: 'text', text: v.url ?? '' }] }
        return { card: 'generic', title: 'Reply failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, commentId: args.commentId as number, reason: 'Replying to a PR comment requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.replyPrComment(args.owner as string, args.repo as string, args.prNumber as number, { commentId: args.commentId as number, body: args.body as string }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_list_repo_artifacts',
      description: 'List GitHub Actions artifacts for the whole repository, optionally filtered by name. Requires a token with Actions read access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        name: { type: 'string', description: 'Filter artifacts by name' },
        limit: { type: 'integer', description: 'Maximum results, 1-100 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether artifacts can be listed' },
            total: { type: 'integer', description: 'Total artifact count' },
            reason: { type: 'string', description: 'Explanation when artifacts are not accessible' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Artifact id' },
                  name: { type: 'string', description: 'Artifact name' },
                  sizeInBytes: { type: 'integer', description: 'Artifact size in bytes' },
                  expired: { type: 'boolean', description: 'Whether the artifact has expired' },
                  createdAt: { type: 'string', description: 'ISO creation timestamp' },
                  expiresAt: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'ISO expiration timestamp' },
                  updatedAt: { type: 'string', description: 'ISO update timestamp' },
                  archiveUrl: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Archive download URL' },
                  url: { type: 'string', description: 'Artifact API URL' },
                  workflowRunId: { oneOf: [{ type: 'integer' }, { type: 'null' }], description: 'Workflow run id' },
                  headBranch: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Run head branch' },
                  headSha: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Run head SHA' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Repository artifacts are not accessible.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No artifacts found.' }]
          const lines = items.map(item => `${item.name} (#${item.id}, ${item.sizeInBytes} bytes, expires ${item.expiresAt ?? 'n/a'})`)
          return [{ type: 'text', text: `Found ${value.total ?? items.length} artifacts:\n${lines.join('\n')}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Artifacts: ${args.owner}/${args.repo}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; total?: number; items?: Array<{ name: string; id: number }> }
        if (!v.found) return { card: 'generic', title: 'Artifacts not accessible' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No artifacts' }
        return { card: 'generic', title: `${v.total ?? items.length} artifact(s)`, content: [{ type: 'text', text: items.map(i => `#${i.id} ${i.name}`).join('\n') }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, total: 0, items: [], reason: 'Listing repository artifacts requires a GitHub token with Actions read access.' }
        }
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit as number, 100))
        const result = await client.listArtifacts(args.owner as string, args.repo as string, { name: args.name as string | undefined, perPage: limit, signal: exec.signal })
        return { found: true, ...result }
      },
    }),

    defineTool({
      name: 'github_list_run_artifacts',
      description: 'List GitHub Actions artifacts produced by a workflow run. Requires a token with Actions read access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        runId: { type: 'integer', required: true, description: 'Workflow run id' },
        limit: { type: 'integer', description: 'Maximum results, 1-100 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether artifacts can be listed' },
            total: { type: 'integer', description: 'Total artifact count' },
            reason: { type: 'string', description: 'Explanation when artifacts are not accessible' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Artifact id' },
                  name: { type: 'string', description: 'Artifact name' },
                  sizeInBytes: { type: 'integer', description: 'Artifact size in bytes' },
                  expired: { type: 'boolean', description: 'Whether the artifact has expired' },
                  createdAt: { type: 'string', description: 'ISO creation timestamp' },
                  expiresAt: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'ISO expiration timestamp' },
                  updatedAt: { type: 'string', description: 'ISO update timestamp' },
                  archiveUrl: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Archive download URL' },
                  url: { type: 'string', description: 'Artifact API URL' },
                  workflowRunId: { oneOf: [{ type: 'integer' }, { type: 'null' }], description: 'Workflow run id' },
                  headBranch: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Run head branch' },
                  headSha: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Run head SHA' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Run artifacts are not accessible.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No artifacts found.' }]
          const lines = items.map(item => `${item.name} (#${item.id}, ${item.sizeInBytes} bytes, expires ${item.expiresAt ?? 'n/a'})`)
          return [{ type: 'text', text: `Found ${value.total ?? items.length} artifacts:\n${lines.join('\n')}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Artifacts for CI run #${args.runId}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; total?: number; items?: Array<{ name: string; id: number }> }
        if (!v.found) return { card: 'generic', title: 'Run artifacts not accessible' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No artifacts' }
        return { card: 'generic', title: `${v.total ?? items.length} artifact(s)`, content: [{ type: 'text', text: items.map(i => `#${i.id} ${i.name}`).join('\n') }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, total: 0, items: [], reason: 'Listing run artifacts requires a GitHub token with Actions read access.' }
        }
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit as number, 100))
        const result = await client.listRunArtifacts(args.owner as string, args.repo as string, args.runId as number, { perPage: limit, signal: exec.signal })
        return { found: true, ...result }
      },
    }),

    defineTool({
      name: 'github_get_artifact',
      description: 'Get metadata for one GitHub Actions artifact, including where it expires and its archive download URL. Requires a token with Actions read access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        artifactId: { type: 'integer', required: true, description: 'Artifact id' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the artifact exists and is accessible' },
            id: { type: 'integer', description: 'Artifact id' },
            name: { type: 'string', description: 'Artifact name' },
            sizeInBytes: { type: 'integer', description: 'Artifact size in bytes' },
            expired: { type: 'boolean', description: 'Whether the artifact has expired' },
            createdAt: { type: 'string', description: 'ISO creation timestamp' },
            expiresAt: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'ISO expiration timestamp' },
            updatedAt: { type: 'string', description: 'ISO update timestamp' },
            archiveUrl: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Archive download URL' },
            url: { type: 'string', description: 'Artifact API URL' },
            workflowRunId: { oneOf: [{ type: 'integer' }, { type: 'null' }], description: 'Workflow run id' },
            headBranch: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Run head branch' },
            headSha: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Run head SHA' },
            reason: { type: 'string', description: 'Explanation when the artifact is not accessible' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Artifact not found or not accessible.' }]
          return [{
            type: 'text',
            text: [
              `${value.name} (#${value.id})`,
              `size: ${value.sizeInBytes} bytes`,
              `expired: ${value.expired}`,
              `expires: ${value.expiresAt ?? 'n/a'}`,
              `run: ${value.workflowRunId ?? 'n/a'} ${value.headBranch ?? ''} @ ${value.headSha ?? ''}`,
              `archive: ${value.archiveUrl ?? 'n/a'}`,
            ].filter(Boolean).join('\n'),
          }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Artifact #${args.artifactId}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; id?: number; name?: string }
        if (!v.found) return { card: 'generic', title: 'Artifact not found' }
        return { card: 'generic', title: `Artifact #${v.id} ${v.name ?? ''}`.trim() }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, reason: 'Getting an artifact requires a GitHub token with Actions read access.' }
        }
        try {
          const artifact = await client.getArtifact(args.owner as string, args.repo as string, args.artifactId as number, exec.signal)
          return { found: true, ...artifact }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_delete_artifact',
      description: 'Delete a GitHub Actions artifact. WRITE operation: requires a token and permanently removes the artifact.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        artifactId: { type: 'integer', required: true, description: 'Artifact id' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the artifact was deleted' },
            artifactId: { type: 'integer', description: 'Artifact id' },
            reason: { type: 'string', description: 'Explanation when not deleted' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Deleted artifact #${value.artifactId}` }]
          return [{ type: 'text', text: `Could not delete artifact #${value.artifactId}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Delete artifact #${args.artifactId}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; artifactId?: number; reason?: string }
        if (v.ok) return { card: 'generic', title: `Artifact #${v.artifactId} deleted` }
        return { card: 'generic', title: 'Delete artifact failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, artifactId: args.artifactId as number, reason: 'Deleting an artifact requires a GitHub token with Actions write access.' }
        }
        return client.deleteArtifact(args.owner as string, args.repo as string, args.artifactId as number, exec.signal)
      },
    }),

    defineTool({
      name: 'github_list_environments',
      description: 'List deployment environments for a repository, including protection rules and deployment branch policy. Requires a token with environment management access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        limit: { type: 'integer', description: 'Maximum results, 1-100 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether environments can be listed' },
            total: { type: 'integer', description: 'Total environment count' },
            reason: { type: 'string', description: 'Explanation when environments are not accessible' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Environment id' },
                  name: { type: 'string', description: 'Environment name' },
                  url: { type: 'string', description: 'Environment API URL' },
                  htmlUrl: { type: 'string', description: 'Environment page URL' },
                  createdAt: { type: 'string', description: 'ISO creation timestamp' },
                  updatedAt: { type: 'string', description: 'ISO update timestamp' },
                  protectedBranches: { oneOf: [{ type: 'boolean' }, { type: 'null' }], description: 'Whether only protected branches can deploy' },
                  customBranchPolicies: { oneOf: [{ type: 'boolean' }, { type: 'null' }], description: 'Whether custom branch policies are enabled' },
                  protectionRules: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        id: { type: 'integer', description: 'Protection rule id' },
                        type: { type: 'string', description: 'Protection rule type' },
                        waitTimer: { oneOf: [{ type: 'integer' }, { type: 'null' }], description: 'Required wait timer in minutes' },
                        preventSelfReview: { oneOf: [{ type: 'boolean' }, { type: 'null' }], description: 'Whether the creator cannot review deployments' },
                        reviewers: {
                          type: 'array',
                          items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                              type: { type: 'string', description: 'Reviewer type' },
                              id: { type: 'integer', description: 'Reviewer user or team id' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Environments are not accessible.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No environments found.' }]
          const lines = items.map(env => {
            const policy = env.protectedBranches ? 'protected branches' : env.customBranchPolicies ? 'custom branches' : 'all branches'
            return `${env.name} (#${env.id}, ${(env.protectionRules ?? []).length} protection rule(s), ${policy})`
          })
          return [{ type: 'text', text: `Found ${value.total ?? items.length} environments:\n${lines.join('\n')}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Environments: ${args.owner}/${args.repo}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; total?: number; items?: Array<{ name: string }> }
        if (!v.found) return { card: 'generic', title: 'Environments not accessible' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No environments' }
        return { card: 'generic', title: `${v.total ?? items.length} environment(s)`, content: [{ type: 'text', text: items.map(i => i.name).join('\n') }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, total: 0, items: [], reason: 'Listing environments requires a GitHub token with environment management access.' }
        }
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit as number, 100))
        return client.listEnvironments(args.owner as string, args.repo as string, { perPage: limit, signal: exec.signal })
      },
    }),

    defineTool({
      name: 'github_get_environment',
      description: 'Get one deployment environment with its protection rules and deployment branch policy. Requires a token with environment management access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        environmentName: { type: 'string', required: true, description: 'Environment name' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the environment exists and is accessible' },
            id: { type: 'integer', description: 'Environment id' },
            name: { type: 'string', description: 'Environment name' },
            url: { type: 'string', description: 'Environment API URL' },
            htmlUrl: { type: 'string', description: 'Environment page URL' },
            createdAt: { type: 'string', description: 'ISO creation timestamp' },
            updatedAt: { type: 'string', description: 'ISO update timestamp' },
            protectedBranches: { oneOf: [{ type: 'boolean' }, { type: 'null' }], description: 'Whether only protected branches can deploy' },
            customBranchPolicies: { oneOf: [{ type: 'boolean' }, { type: 'null' }], description: 'Whether custom branch policies are enabled' },
            reason: { type: 'string', description: 'Explanation when the environment is not accessible' },
            protectionRules: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Protection rule id' },
                  type: { type: 'string', description: 'Protection rule type' },
                  waitTimer: { oneOf: [{ type: 'integer' }, { type: 'null' }], description: 'Required wait timer in minutes' },
                  preventSelfReview: { oneOf: [{ type: 'boolean' }, { type: 'null' }], description: 'Whether the creator cannot review deployments' },
                  reviewers: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        type: { type: 'string', description: 'Reviewer type' },
                        id: { type: 'integer', description: 'Reviewer user or team id' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Environment not found or not accessible.' }]
          const policy = value.protectedBranches ? 'protected branches' : value.customBranchPolicies ? 'custom branches' : 'all branches'
          const rules = (value.protectionRules ?? []).map(rule => `${rule.type}${rule.waitTimer ? ` (wait ${rule.waitTimer}m)` : ''}`).join(', ') || 'none'
          return [{
            type: 'text',
            text: [
              `${value.name} (#${value.id})`,
              `url: ${value.htmlUrl}`,
              `deployment policy: ${policy}`,
              `protection: ${rules}`,
              `created: ${value.createdAt}`,
              `updated: ${value.updatedAt}`,
            ].join('\n'),
          }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Environment ${args.environmentName}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; name?: string; htmlUrl?: string }
        if (!v.found) return { card: 'generic', title: 'Environment not found' }
        return { card: 'generic', title: `Environment ${v.name}`, content: [{ type: 'text', text: v.htmlUrl ?? '' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, reason: 'Getting an environment requires a GitHub token with environment management access.' }
        }
        try {
          const environment = await client.getEnvironment(args.owner as string, args.repo as string, args.environmentName as string, exec.signal)
          return { found: true, ...environment }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_update_environment',
      description: 'Create or update a deployment environment with wait timer, self-review protection, reviewers, and deployment branch policy. WRITE operation: requires a token.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        name: { type: 'string', required: true, description: 'Environment name' },
        waitTimer: { type: 'integer', description: 'Required wait timer in minutes (default 0)' },
        preventSelfReview: { type: 'boolean', description: 'Whether the deployment creator cannot approve their own deployment (default false)' },
        protectedBranches: { type: 'boolean', description: 'Only protected branches may deploy' },
        customBranchPolicies: { type: 'boolean', description: 'Use custom branch policies for deployments' },
        reviewers: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', description: 'Reviewer type: User or Team' },
              id: { type: 'integer', required: true, description: 'Reviewer user or team id' },
            },
          },
          description: 'Reviewers who approve deployments (empty clears reviewers)',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the environment was saved' },
            name: { type: 'string', description: 'Environment name' },
            url: { type: 'string', description: 'Environment page URL' },
            reason: { type: 'string', description: 'Explanation when not saved' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Saved environment ${value.name}: ${value.url}` }]
          return [{ type: 'text', text: `Could not save environment ${value.name}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Update environment ${args.name}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; name?: string; url?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Environment ${v.name} saved`, content: [{ type: 'text', text: v.url ?? '' }] }
        return { card: 'generic', title: 'Update environment failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, name: args.name as string, reason: 'Updating an environment requires a GitHub token with environment management access.' }
        }
        if (args.protectedBranches && args.customBranchPolicies) {
          return { ok: false, name: args.name as string, reason: 'Only one deployment branch policy can be enabled at a time.' }
        }
        return client.updateEnvironment(args.owner as string, args.repo as string, args.name as string, {
          waitTimer: args.waitTimer as number | undefined,
          preventSelfReview: args.preventSelfReview as boolean | undefined,
          reviewers: args.reviewers as Array<{ type: 'User' | 'Team'; id: number }> | undefined,
          protectedBranches: args.protectedBranches as boolean | undefined,
          customBranchPolicies: args.customBranchPolicies as boolean | undefined,
        }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_delete_environment',
      description: 'Delete a deployment environment. WRITE operation: requires a token and permanently removes the environment.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        name: { type: 'string', required: true, description: 'Environment name' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the environment was deleted' },
            name: { type: 'string', description: 'Environment name' },
            reason: { type: 'string', description: 'Explanation when not deleted' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Deleted environment ${value.name}` }]
          return [{ type: 'text', text: `Could not delete environment ${value.name}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Delete environment ${args.name}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; name?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Environment ${v.name} deleted` }
        return { card: 'generic', title: 'Delete environment failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, name: args.name as string, reason: 'Deleting an environment requires a GitHub token with environment management access.' }
        }
        return client.deleteEnvironment(args.owner as string, args.repo as string, args.name as string, exec.signal)
      },
    }),

    defineTool({
      name: 'github_get_org',
      description: 'Get GitHub organization profile data: name, description, repo counts, location, blog, and URL.',
      parameters: {
        org: { type: 'string', required: true, description: 'Organization login' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the organization exists' },
            login: { type: 'string', description: 'Organization login' },
            name: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Display name' },
            description: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Organization description' },
            publicRepos: { type: 'integer', description: 'Public repository count' },
            totalPrivateRepos: { oneOf: [{ type: 'integer' }, { type: 'null' }], description: 'Private repository count' },
            location: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Location' },
            blog: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Website URL' },
            createdAt: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'ISO creation timestamp' },
            url: { type: 'string', description: 'Organization URL' },
            reason: { type: 'string', description: 'Explanation when not found' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Organization not found.' }]
          return [{
            type: 'text',
            text: [
              `${value.name ?? value.login} (@${value.login})`,
              `description: ${value.description ?? 'n/a'}`,
              `public repos: ${value.publicRepos}`,
              `private repos: ${value.totalPrivateRepos ?? 'n/a'}`,
              `location: ${value.location ?? 'n/a'}`,
              `blog: ${value.blog ?? 'n/a'}`,
              `created: ${value.createdAt ?? 'n/a'}`,
              value.url ?? '',
            ].filter(Boolean).join('\n'),
          }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Org ${args.org}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; login?: string; name?: string | null }
        if (!v.found) return { card: 'generic', title: 'Organization not found' }
        return { card: 'generic', title: `Org ${v.name ?? v.login}` }
      },
      async execute(args, exec) {
        try {
          const org = await client.getOrg(args.org as string, exec.signal)
          return { found: true, ...org }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_list_org_repos',
      description: 'List repositories in a GitHub organization, with optional type filtering and visibility metadata.',
      parameters: {
        org: { type: 'string', required: true, description: 'Organization login' },
        type: { type: 'string', enum: ['all', 'public', 'private', 'forks', 'sources', 'member'], description: 'Repository type filter (default all)' },
        limit: { type: 'integer', description: 'Maximum results, 1-100 (default 30)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the organization can be queried' },
            reason: { type: 'string', description: 'Explanation when not found' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  fullName: { type: 'string', description: 'Full repository name' },
                  owner: { type: 'string', description: 'Repository owner login' },
                  name: { type: 'string', description: 'Repository name' },
                  description: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Repository description' },
                  stars: { type: 'integer', description: 'Star count' },
                  language: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Primary language' },
                  visibility: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Repository visibility' },
                  fork: { type: 'boolean', description: 'Whether the repository is a fork' },
                  privateRepo: { type: 'boolean', description: 'Whether the repository is private' },
                  updatedAt: { type: 'string', description: 'ISO update timestamp' },
                  url: { type: 'string', description: 'Repository URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Organization not found.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No repositories found.' }]
          return [{ type: 'text', text: items.map(item => `${item.fullName} (${item.stars} stars, ${item.language ?? 'n/a'}, updated ${item.updatedAt})`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Org repos: ${args.org}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; items?: Array<{ fullName: string; stars: number }> }
        if (!v.found) return { card: 'generic', title: 'Organization not found' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No repos' }
        return { card: 'generic', title: `${items.length} repo(s)`, content: [{ type: 'text', text: items.map(i => `${i.fullName} (${i.stars})`).join('\n') }] }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 30 : Math.max(1, Math.min(args.limit as number, 100))
        try {
          const items = await client.listOrgRepos(args.org as string, { type: args.type as 'all' | 'public' | 'private' | 'forks' | 'sources' | 'member' | undefined, perPage: limit, signal: exec.signal })
          return { found: true, items }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false, items: [] }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_list_org_members',
      description: 'List members of a GitHub organization. Requires a token with organization member read access.',
      parameters: {
        org: { type: 'string', required: true, description: 'Organization login' },
        role: { type: 'string', enum: ['all', 'admin', 'member'], description: 'Filter by organization role (default all)' },
        limit: { type: 'integer', description: 'Maximum results, 1-100 (default 30)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether members can be listed' },
            reason: { type: 'string', description: 'Explanation when members are not accessible' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  login: { type: 'string', description: 'Member login' },
                  id: { type: 'integer', description: 'Member user id' },
                  avatarUrl: { type: 'string', description: 'Avatar URL' },
                  url: { type: 'string', description: 'Profile URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Organization members are not accessible.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No members found.' }]
          return [{ type: 'text', text: items.map(item => `${item.login} (${item.url})`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Org members: ${args.org}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; items?: Array<{ login: string }> }
        if (!v.found) return { card: 'generic', title: 'Members not accessible' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No members' }
        return { card: 'generic', title: `${items.length} member(s)`, content: [{ type: 'text', text: items.map(i => i.login).join('\n') }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, items: [], reason: 'Listing organization members requires a GitHub token with organization member access.' }
        }
        const limit = args.limit === undefined ? 30 : Math.max(1, Math.min(args.limit as number, 100))
        try {
          const items = await client.listOrgMembers(args.org as string, { role: args.role as 'all' | 'admin' | 'member' | undefined, perPage: limit, signal: exec.signal })
          return { found: true, items }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false, items: [] }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_list_org_teams',
      description: 'List teams in a GitHub organization. Requires a token with organization admin or member read access.',
      parameters: {
        org: { type: 'string', required: true, description: 'Organization login' },
        limit: { type: 'integer', description: 'Maximum results, 1-100 (default 30)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether teams can be listed' },
            reason: { type: 'string', description: 'Explanation when teams are not accessible' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Team id' },
                  name: { type: 'string', description: 'Team name' },
                  slug: { type: 'string', description: 'Team slug' },
                  description: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Team description' },
                  privacy: { type: 'string', description: 'Team privacy' },
                  permission: { type: 'string', description: 'Team permission' },
                  url: { type: 'string', description: 'Team API URL' },
                  htmlUrl: { type: 'string', description: 'Team page URL' },
                  membersCount: { oneOf: [{ type: 'integer' }, { type: 'null' }], description: 'Member count' },
                  reposCount: { oneOf: [{ type: 'integer' }, { type: 'null' }], description: 'Repository count' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Organization teams are not accessible.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No teams found.' }]
          return [{ type: 'text', text: items.map(item => `${item.name} (${item.slug}, ${item.permission}, ${item.privacy}, ${item.membersCount ?? '?'} members)`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Org teams: ${args.org}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; items?: Array<{ name: string; slug: string }> }
        if (!v.found) return { card: 'generic', title: 'Teams not accessible' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No teams' }
        return { card: 'generic', title: `${items.length} team(s)`, content: [{ type: 'text', text: items.map(i => `${i.name} (${i.slug})`).join('\n') }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, items: [], reason: 'Listing organization teams requires a GitHub token with organization access.' }
        }
        const limit = args.limit === undefined ? 30 : Math.max(1, Math.min(args.limit as number, 100))
        try {
          const items = await client.listOrgTeams(args.org as string, { perPage: limit, signal: exec.signal })
          return { found: true, items }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false, items: [] }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_get_team',
      description: 'Get one GitHub organization team by slug, including permission, privacy, and member/repo counts. Requires a token with organization access.',
      parameters: {
        org: { type: 'string', required: true, description: 'Organization login' },
        teamSlug: { type: 'string', required: true, description: 'Team slug, e.g. core-maintainers' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the team exists and is accessible' },
            id: { type: 'integer', description: 'Team id' },
            name: { type: 'string', description: 'Team name' },
            slug: { type: 'string', description: 'Team slug' },
            description: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Team description' },
            privacy: { type: 'string', description: 'Team privacy' },
            permission: { type: 'string', description: 'Team permission' },
            url: { type: 'string', description: 'Team API URL' },
            htmlUrl: { type: 'string', description: 'Team page URL' },
            membersCount: { oneOf: [{ type: 'integer' }, { type: 'null' }], description: 'Member count' },
            reposCount: { oneOf: [{ type: 'integer' }, { type: 'null' }], description: 'Repository count' },
            reason: { type: 'string', description: 'Explanation when not found' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Team not found or not accessible.' }]
          return [{
            type: 'text',
            text: [
              `${value.name} (${value.slug})`,
              `permission: ${value.permission}`,
              `privacy: ${value.privacy}`,
              `members: ${value.membersCount ?? 'n/a'}`,
              `repos: ${value.reposCount ?? 'n/a'}`,
              `description: ${value.description ?? 'n/a'}`,
              value.htmlUrl ?? '',
            ].filter(Boolean).join('\n'),
          }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Team ${args.teamSlug}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; name?: string; htmlUrl?: string }
        if (!v.found) return { card: 'generic', title: 'Team not found' }
        return { card: 'generic', title: `Team ${v.name}`, content: [{ type: 'text', text: v.htmlUrl ?? '' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, reason: 'Getting a team requires a GitHub token with organization access.' }
        }
        try {
          const team = await client.getTeam(args.org as string, args.teamSlug as string, exec.signal)
          return { found: true, ...team }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_list_team_members',
      description: 'List members of a GitHub organization team. Requires a token with organization access.',
      parameters: {
        org: { type: 'string', required: true, description: 'Organization login' },
        teamSlug: { type: 'string', required: true, description: 'Team slug' },
        role: { type: 'string', enum: ['all', 'member', 'maintainer'], description: 'Filter by team role (default all)' },
        limit: { type: 'integer', description: 'Maximum results, 1-100 (default 30)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether team members can be listed' },
            reason: { type: 'string', description: 'Explanation when members are not accessible' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  login: { type: 'string', description: 'Member login' },
                  id: { type: 'integer', description: 'Member user id' },
                  avatarUrl: { type: 'string', description: 'Avatar URL' },
                  url: { type: 'string', description: 'Profile URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Team members are not accessible.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No team members found.' }]
          return [{ type: 'text', text: items.map(item => `${item.login} (${item.url})`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Team members: ${args.org}/${args.teamSlug}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; items?: Array<{ login: string }> }
        if (!v.found) return { card: 'generic', title: 'Team members not accessible' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No team members' }
        return { card: 'generic', title: `${items.length} member(s)`, content: [{ type: 'text', text: items.map(i => i.login).join('\n') }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, items: [], reason: 'Listing team members requires a GitHub token with organization access.' }
        }
        const limit = args.limit === undefined ? 30 : Math.max(1, Math.min(args.limit as number, 100))
        try {
          const items = await client.listTeamMembers(args.org as string, args.teamSlug as string, { role: args.role as 'all' | 'member' | 'maintainer' | undefined, perPage: limit, signal: exec.signal })
          return { found: true, items }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false, items: [] }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_list_team_repos',
      description: 'List repositories accessible to a GitHub organization team. Requires a token with organization access.',
      parameters: {
        org: { type: 'string', required: true, description: 'Organization login' },
        teamSlug: { type: 'string', required: true, description: 'Team slug' },
        limit: { type: 'integer', description: 'Maximum results, 1-100 (default 30)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether team repositories can be listed' },
            reason: { type: 'string', description: 'Explanation when repositories are not accessible' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  fullName: { type: 'string', description: 'Full repository name' },
                  owner: { type: 'string', description: 'Repository owner login' },
                  name: { type: 'string', description: 'Repository name' },
                  description: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Repository description' },
                  stars: { type: 'integer', description: 'Star count' },
                  language: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Primary language' },
                  visibility: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Repository visibility' },
                  fork: { type: 'boolean', description: 'Whether the repository is a fork' },
                  privateRepo: { type: 'boolean', description: 'Whether the repository is private' },
                  updatedAt: { type: 'string', description: 'ISO update timestamp' },
                  url: { type: 'string', description: 'Repository URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Team repositories are not accessible.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No team repositories found.' }]
          return [{ type: 'text', text: items.map(item => `${item.fullName} (${item.visibility ?? 'n/a'}, ${item.stars} stars)`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Team repos: ${args.org}/${args.teamSlug}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; items?: Array<{ fullName: string }> }
        if (!v.found) return { card: 'generic', title: 'Team repos not accessible' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No team repos' }
        return { card: 'generic', title: `${items.length} repo(s)`, content: [{ type: 'text', text: items.map(i => i.fullName).join('\n') }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, items: [], reason: 'Listing team repositories requires a GitHub token with organization access.' }
        }
        const limit = args.limit === undefined ? 30 : Math.max(1, Math.min(args.limit as number, 100))
        try {
          const items = await client.listTeamRepos(args.org as string, args.teamSlug as string, { perPage: limit, signal: exec.signal })
          return { found: true, items }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false, items: [] }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_update_team_membership',
      description: 'Add a user to a GitHub organization team or change their role to member/maintainer. WRITE operation: requires a token.',
      parameters: {
        org: { type: 'string', required: true, description: 'Organization login' },
        teamSlug: { type: 'string', required: true, description: 'Team slug' },
        username: { type: 'string', required: true, description: 'GitHub username' },
        role: { type: 'string', enum: ['member', 'maintainer'], description: 'Team role (default member)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether membership was updated' },
            username: { type: 'string', description: 'GitHub username' },
            role: { type: 'string', description: 'Current team role' },
            state: { type: 'string', description: 'Membership state' },
            reason: { type: 'string', description: 'Explanation when not updated' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Updated ${value.username} as ${value.role} on team ${_args.teamSlug} (${value.state})` }]
          return [{ type: 'text', text: `Could not update ${value.username} on team ${_args.teamSlug}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Update team member ${args.username}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; username?: string; role?: string; state?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Team membership ${v.username} updated`, content: [{ type: 'text', text: `${v.role} (${v.state})` }] }
        return { card: 'generic', title: 'Team membership update failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, username: args.username as string, reason: 'Updating team membership requires a GitHub token with organization access.' }
        }
        return client.setTeamMembership(args.org as string, args.teamSlug as string, args.username as string, { role: args.role as 'member' | 'maintainer' | undefined }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_remove_team_membership',
      description: 'Remove a user from a GitHub organization team. WRITE operation: requires a token.',
      parameters: {
        org: { type: 'string', required: true, description: 'Organization login' },
        teamSlug: { type: 'string', required: true, description: 'Team slug' },
        username: { type: 'string', required: true, description: 'GitHub username' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether membership was removed' },
            username: { type: 'string', description: 'GitHub username' },
            reason: { type: 'string', description: 'Explanation when not removed' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Removed ${value.username} from team ${_args.teamSlug}` }]
          return [{ type: 'text', text: `Could not remove ${value.username} from team ${_args.teamSlug}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Remove team member ${args.username}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; username?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Removed ${v.username}` }
        return { card: 'generic', title: 'Remove team member failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, username: args.username as string, reason: 'Removing team membership requires a GitHub token with organization access.' }
        }
        return client.removeTeamMembership(args.org as string, args.teamSlug as string, args.username as string, exec.signal)
      },
    }),

    defineTool({
      name: 'github_list_collaborators',
      description: 'List repository collaborators with their effective permissions. Requires a token with repository access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        affiliation: { type: 'string', enum: ['all', 'direct', 'outside'], description: 'Collaborator affiliation filter (default all)' },
        permission: { type: 'string', enum: ['pull', 'triage', 'push', 'maintain', 'admin'], description: 'Filter collaborators by permission' },
        limit: { type: 'integer', description: 'Maximum results, 1-100 (default 30)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether collaborators can be listed' },
            reason: { type: 'string', description: 'Explanation when collaborators are not accessible' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  login: { type: 'string', description: 'GitHub username' },
                  id: { type: 'integer', description: 'User id' },
                  avatarUrl: { type: 'string', description: 'Avatar URL' },
                  permissions: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      pull: { type: 'boolean', description: 'Can pull' },
                      triage: { type: 'boolean', description: 'Can triage' },
                      push: { type: 'boolean', description: 'Can push' },
                      maintain: { type: 'boolean', description: 'Can maintain' },
                      admin: { type: 'boolean', description: 'Can administer' },
                    },
                    description: 'Effective permission flags',
                  },
                  roleName: { type: 'string', description: 'Highest role name' },
                  url: { type: 'string', description: 'API user URL' },
                  htmlUrl: { type: 'string', description: 'GitHub user URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Repository collaborators are not accessible.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No collaborators found.' }]
          return [{ type: 'text', text: items.map(item => {
            const permission = item.permissions ? Object.entries(item.permissions).filter(([, enabled]) => enabled).map(([name]) => name).join('/') : item.roleName ?? 'unknown'
            return `${item.login} (${permission}) ${item.htmlUrl}`
          }).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Collaborators: ${args.owner}/${args.repo}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; items?: Array<{ login: string }> }
        if (!v.found) return { card: 'generic', title: 'Collaborators not accessible' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No collaborators' }
        return { card: 'generic', title: `${items.length} collaborator(s)`, content: [{ type: 'text', text: items.map(i => i.login).join('\n') }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, items: [], reason: 'Listing repository collaborators requires a GitHub token. Configure the plugin with a token.' }
        }
        const limit = args.limit === undefined ? 30 : Math.max(1, Math.min(args.limit as number, 100))
        try {
          const items = await client.listCollaborators(args.owner as string, args.repo as string, {
            affiliation: args.affiliation as 'all' | 'direct' | 'outside' | undefined,
            permission: args.permission as 'pull' | 'triage' | 'push' | 'maintain' | 'admin' | undefined,
            perPage: limit,
            signal: exec.signal,
          })
          return { found: true, items }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false, items: [] }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_get_collaborator_permission',
      description: 'Get one repository collaborator permission and effective role. Requires a token with repository admin access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        username: { type: 'string', required: true, description: 'GitHub username' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the collaborator exists and is accessible' },
            login: { type: 'string', description: 'GitHub username' },
            permission: { type: 'string', description: 'Effective permission' },
            roleName: { type: 'string', description: 'Role name' },
            source: { type: 'string', description: 'Permission source' },
            userUrl: { type: 'string', description: 'GitHub user URL' },
            reason: { type: 'string', description: 'Explanation when not found' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Collaborator not found or not accessible.' }]
          return [{ type: 'text', text: `${value.login}: ${value.permission}${value.roleName ? ` (${value.roleName})` : ''}${value.source ? ` via ${value.source}` : ''}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Collaborator permission: ${args.username}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; login?: string; permission?: string }
        if (!v.found) return { card: 'generic', title: 'Collaborator not found' }
        return { card: 'generic', title: `${v.login}: ${v.permission}` }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, reason: 'Getting collaborator permission requires a GitHub token with repository admin access.' }
        }
        try {
          const permission = await client.getCollaboratorPermission(args.owner as string, args.repo as string, args.username as string, exec.signal)
          return { found: true, ...permission }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_add_collaborator',
      description: 'Invite or add a repository collaborator with a permission level. WRITE operation: requires a token with repository admin access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        username: { type: 'string', required: true, description: 'GitHub username' },
        permission: { type: 'string', enum: ['pull', 'triage', 'push', 'maintain', 'admin'], description: 'Permission level (default pull)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the collaborator was added or invited' },
            login: { type: 'string', description: 'GitHub username' },
            permission: { type: 'string', description: 'Assigned permission' },
            created: { type: 'boolean', description: 'Whether a collaborator body was returned (newly invited)' },
            reason: { type: 'string', description: 'Explanation when not added' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Added ${value.login} to ${_args.owner}/${_args.repo} as ${value.permission}` }]
          return [{ type: 'text', text: `Could not add ${value.login}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Add collaborator ${args.username}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; login?: string; permission?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Collaborator ${v.login} added`, content: [{ type: 'text', text: v.permission ?? '' }] }
        return { card: 'generic', title: 'Add collaborator failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, login: args.username as string, reason: 'Adding a collaborator requires a GitHub token with repository admin access.' }
        }
        return client.setCollaboratorPermission(args.owner as string, args.repo as string, args.username as string, {
          permission: args.permission as 'pull' | 'triage' | 'push' | 'maintain' | 'admin' | undefined,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'github_update_collaborator_permission',
      description: 'Update an existing repository collaborator permission. WRITE operation: requires a token with repository admin access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        username: { type: 'string', required: true, description: 'GitHub username' },
        permission: { type: 'string', enum: ['pull', 'triage', 'push', 'maintain', 'admin'], required: true, description: 'New permission level' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the permission was updated' },
            login: { type: 'string', description: 'GitHub username' },
            permission: { type: 'string', description: 'Updated permission' },
            reason: { type: 'string', description: 'Explanation when not updated' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Updated ${value.login} to ${value.permission}` }]
          return [{ type: 'text', text: `Could not update ${value.login}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Update collaborator ${args.username}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; login?: string; permission?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Collaborator ${v.login} updated`, content: [{ type: 'text', text: v.permission ?? '' }] }
        return { card: 'generic', title: 'Update collaborator failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, login: args.username as string, reason: 'Updating collaborator permission requires a GitHub token with repository admin access.' }
        }
        const result = await client.setCollaboratorPermission(args.owner as string, args.repo as string, args.username as string, {
          permission: args.permission as 'pull' | 'triage' | 'push' | 'maintain' | 'admin',
          signal: exec.signal,
        })
        return { ok: result.ok, login: result.login, permission: result.permission, reason: result.reason }
      },
    }),

    defineTool({
      name: 'github_remove_collaborator',
      description: 'Remove a direct collaborator from a repository. WRITE operation: requires a token with repository admin access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        username: { type: 'string', required: true, description: 'GitHub username' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the collaborator was removed' },
            login: { type: 'string', description: 'GitHub username' },
            reason: { type: 'string', description: 'Explanation when not removed' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Removed ${value.login} from ${_args.owner}/${_args.repo}` }]
          return [{ type: 'text', text: `Could not remove ${value.login}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Remove collaborator ${args.username}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; login?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Collaborator ${v.login} removed` }
        return { card: 'generic', title: 'Remove collaborator failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, login: args.username as string, reason: 'Removing a collaborator requires a GitHub token with repository admin access.' }
        }
        return client.removeCollaborator(args.owner as string, args.repo as string, args.username as string, exec.signal)
      },
    }),

    defineTool({
      name: 'github_add_team_repo',
      description: 'Grant an organization team access to a repository. WRITE operation: requires a token with organization/repository admin access.',
      parameters: {
        org: { type: 'string', required: true, description: 'Organization login' },
        teamSlug: { type: 'string', required: true, description: 'Team slug' },
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        permission: { type: 'string', enum: ['pull', 'push', 'admin'], description: 'Team permission (default push)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether repository access was granted' },
            org: { type: 'string', description: 'Organization login' },
            teamSlug: { type: 'string', description: 'Team slug' },
            repo: { type: 'string', description: 'Full repository name' },
            permission: { type: 'string', description: 'Granted permission' },
            reason: { type: 'string', description: 'Explanation when not granted' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Granted ${value.teamSlug} ${value.permission} access to ${value.repo}` }]
          return [{ type: 'text', text: `Could not grant ${_args.teamSlug} access to ${_args.owner}/${_args.repo}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Add ${args.repo} to ${args.teamSlug}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; teamSlug?: string; repo?: string; permission?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Team ${v.teamSlug} added`, content: [{ type: 'text', text: `${v.repo} (${v.permission})` }] }
        return { card: 'generic', title: 'Add team repo failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, org: args.org as string, teamSlug: args.teamSlug as string, repo: `${args.owner}/${args.repo}`, reason: 'Adding a repository to a team requires a GitHub token with organization access.' }
        }
        return client.addTeamRepo(args.org as string, args.teamSlug as string, args.owner as string, args.repo as string, {
          permission: args.permission as 'pull' | 'push' | 'admin' | undefined,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'github_remove_team_repo',
      description: 'Remove an organization team repository access. WRITE operation: requires a token with organization/repository admin access.',
      parameters: {
        org: { type: 'string', required: true, description: 'Organization login' },
        teamSlug: { type: 'string', required: true, description: 'Team slug' },
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether repository access was removed' },
            org: { type: 'string', description: 'Organization login' },
            teamSlug: { type: 'string', description: 'Team slug' },
            repo: { type: 'string', description: 'Full repository name' },
            reason: { type: 'string', description: 'Explanation when not removed' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Removed ${value.repo} from ${value.teamSlug}` }]
          return [{ type: 'text', text: `Could not remove ${_args.owner}/${_args.repo} from ${_args.teamSlug}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Remove ${args.repo} from ${args.teamSlug}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; teamSlug?: string; repo?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Team ${v.teamSlug} access removed`, content: [{ type: 'text', text: v.repo ?? '' }] }
        return { card: 'generic', title: 'Remove team repo failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, org: args.org as string, teamSlug: args.teamSlug as string, repo: `${args.owner}/${args.repo}`, reason: 'Removing a repository from a team requires a GitHub token with organization access.' }
        }
        return client.removeTeamRepo(args.org as string, args.teamSlug as string, args.owner as string, args.repo as string, exec.signal)
      },
    }),

    defineTool({
      name: 'github_list_repo_webhooks',
      description: 'List repository webhooks with active state, subscribed events, delivery URLs, and configuration metadata. Requires a token with repository admin access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        limit: { type: 'integer', description: 'Maximum results, 1-100 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether webhooks can be listed' },
            reason: { type: 'string', description: 'Explanation when webhooks are not accessible' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              id: { type: 'integer', description: 'Webhook id' },
              name: { type: 'string', description: 'Webhook name' },
              active: { type: 'boolean', description: 'Whether the webhook is active' },
              events: { type: 'array', items: { type: 'string' }, description: 'Subscribed events' },
              config: { type: 'object', additionalProperties: false, properties: {
                url: { type: 'string', description: 'Payload URL' },
                contentType: { type: 'string', description: 'payload content type' },
                insecureSsl: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Whether TLS verification is skipped' },
              } },
              url: { type: 'string', description: 'Webhook API URL' },
              pingUrl: { type: 'string', description: 'Ping endpoint URL' },
              deliveriesUrl: { type: 'string', description: 'Deliveries endpoint URL' },
              testUrl: { type: 'string', description: 'Test endpoint URL' },
              createdAt: { type: 'string', description: 'ISO creation timestamp' },
              updatedAt: { type: 'string', description: 'ISO update timestamp' },
            } } },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Repository webhooks are not accessible.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No webhooks found.' }]
          return [{ type: 'text', text: items.map(item => `#${item.id} ${item.config?.url ?? ''} (${item.active ? 'active' : 'inactive'}, ${(item.events ?? []).join(', ') || 'no events'})`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Webhooks: ${args.owner}/${args.repo}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; items?: Array<{ id: number; config: { url: string }; active: boolean }> }
        if (!v.found) return { card: 'generic', title: 'Webhooks not accessible' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No webhooks' }
        return { card: 'generic', title: `${items.length} webhook(s)`, content: [{ type: 'text', text: items.map(i => `#${i.id} ${i.config.url} (${i.active ? 'active' : 'inactive'})`).join('\n') }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, items: [], reason: 'Listing repository webhooks requires a GitHub token with repository admin access.' }
        }
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit as number, 100))
        try {
          const items = await client.listRepoWebhooks(args.owner as string, args.repo as string, { perPage: limit, signal: exec.signal })
          return { found: true, items }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false, items: [] }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_get_repo_webhook',
      description: 'Get one repository webhook and its configuration. Requires a token with repository admin access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        hookId: { type: 'integer', required: true, description: 'Webhook id' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the webhook exists and is accessible' },
            id: { type: 'integer', description: 'Webhook id' },
            name: { type: 'string', description: 'Webhook name' },
            active: { type: 'boolean', description: 'Whether the webhook is active' },
            events: { type: 'array', items: { type: 'string' }, description: 'Subscribed events' },
            config: { type: 'object', additionalProperties: false, properties: {
              url: { type: 'string', description: 'Payload URL' },
              contentType: { type: 'string', description: 'payload content type' },
              insecureSsl: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Whether TLS verification is skipped' },
            } },
            url: { type: 'string', description: 'Webhook API URL' },
            pingUrl: { type: 'string', description: 'Ping endpoint URL' },
            deliveriesUrl: { type: 'string', description: 'Deliveries endpoint URL' },
            testUrl: { type: 'string', description: 'Test endpoint URL' },
            createdAt: { type: 'string', description: 'ISO creation timestamp' },
            updatedAt: { type: 'string', description: 'ISO update timestamp' },
            reason: { type: 'string', description: 'Explanation when not found' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Webhook not found or not accessible.' }]
          return [{
            type: 'text',
            text: [
              `#${value.id} ${value.config?.url ?? ''}`,
              `status: ${value.active ? 'active' : 'inactive'}`,
              `events: ${(value.events ?? []).join(', ') || 'none'}`,
              `content type: ${value.config?.contentType ?? 'n/a'}`,
              `insecure ssl: ${value.config?.insecureSsl ?? 'n/a'}`,
              `created: ${value.createdAt}`,
              `updated: ${value.updatedAt}`,
            ].join('\n'),
          }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Webhook #${args.hookId}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; id?: number; config?: { url: string }; active?: boolean }
        if (!v.found) return { card: 'generic', title: 'Webhook not found' }
        return { card: 'generic', title: `Webhook #${v.id}`, content: [{ type: 'text', text: `${v.config?.url ?? ''} (${v.active ? 'active' : 'inactive'})` }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, reason: 'Getting a repository webhook requires a GitHub token with repository admin access.' }
        }
        try {
          const webhook = await client.getRepoWebhook(args.owner as string, args.repo as string, args.hookId as number, exec.signal)
          return { found: true, ...webhook }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_create_repo_webhook',
      description: 'Create a repository webhook that sends GitHub events to a payload URL. WRITE operation: requires a token with repository admin access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        url: { type: 'string', required: true, description: 'Payload URL to receive webhook events' },
        contentType: { type: 'string', enum: ['json', 'form'], description: 'Payload content type (default json)' },
        secret: { type: 'string', description: 'Webhook secret for payload verification' },
        insecureSsl: { type: 'boolean', description: 'Skip TLS verification for the payload URL (default false)' },
        events: { type: 'array', items: { type: 'string' }, description: 'Events to subscribe (default push)' },
        active: { type: 'boolean', description: 'Create as active (default true)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the webhook was created' },
            id: { type: 'integer', description: 'Webhook id' },
            url: { type: 'string', description: 'Webhook API URL' },
            reason: { type: 'string', description: 'Explanation when not created' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Created webhook #${value.id}: ${value.url}` }]
          return [{ type: 'text', text: `Could not create webhook: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Create webhook for ${args.owner}/${args.repo}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; id?: number; url?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Webhook #${v.id} created`, content: [{ type: 'text', text: v.url ?? '' }] }
        return { card: 'generic', title: 'Create webhook failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Creating a repository webhook requires a GitHub token with repository admin access.' }
        }
        return client.createRepoWebhook(args.owner as string, args.repo as string, {
          url: args.url as string,
          contentType: (args.contentType as 'json' | 'form' | undefined) ?? 'json',
          secret: args.secret as string | undefined,
          insecureSsl: args.insecureSsl as boolean | undefined,
          events: args.events as string[] | undefined,
          active: args.active as boolean | undefined,
        }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_update_repo_webhook',
      description: 'Update a repository webhook URL, events, active state, or payload security settings. WRITE operation: requires a token with repository admin access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        hookId: { type: 'integer', required: true, description: 'Webhook id' },
        url: { type: 'string', description: 'New payload URL' },
        contentType: { type: 'string', enum: ['json', 'form'], description: 'Payload content type' },
        secret: { type: 'string', description: 'New webhook secret' },
        insecureSsl: { type: 'boolean', description: 'Skip TLS verification for the payload URL' },
        events: { type: 'array', items: { type: 'string' }, description: 'Complete event list to replace' },
        addEvents: { type: 'array', items: { type: 'string' }, description: 'Events to add' },
        removeEvents: { type: 'array', items: { type: 'string' }, description: 'Events to remove' },
        active: { type: 'boolean', description: 'Whether the webhook is active' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the webhook was updated' },
            id: { type: 'integer', description: 'Webhook id' },
            url: { type: 'string', description: 'Webhook API URL' },
            reason: { type: 'string', description: 'Explanation when not updated' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Updated webhook #${value.id}: ${value.url}` }]
          return [{ type: 'text', text: `Could not update webhook #${value.id}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Update webhook #${args.hookId}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; id?: number; url?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Webhook #${v.id} updated`, content: [{ type: 'text', text: v.url ?? '' }] }
        return { card: 'generic', title: 'Update webhook failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, id: args.hookId as number, reason: 'Updating a repository webhook requires a GitHub token with repository admin access.' }
        }
        return client.updateRepoWebhook(args.owner as string, args.repo as string, args.hookId as number, {
          url: args.url as string | undefined,
          contentType: args.contentType as 'json' | 'form' | undefined,
          secret: args.secret as string | undefined,
          insecureSsl: args.insecureSsl as boolean | undefined,
          events: args.events as string[] | undefined,
          addEvents: args.addEvents as string[] | undefined,
          removeEvents: args.removeEvents as string[] | undefined,
          active: args.active as boolean | undefined,
        }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_delete_repo_webhook',
      description: 'Delete a repository webhook. WRITE operation: requires a token with repository admin access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        hookId: { type: 'integer', required: true, description: 'Webhook id' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the webhook was deleted' },
            id: { type: 'integer', description: 'Webhook id' },
            reason: { type: 'string', description: 'Explanation when not deleted' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Deleted webhook #${value.id}` }]
          return [{ type: 'text', text: `Could not delete webhook #${value.id}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Delete webhook #${args.hookId}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; id?: number; reason?: string }
        if (v.ok) return { card: 'generic', title: `Webhook #${v.id} deleted` }
        return { card: 'generic', title: 'Delete webhook failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, id: args.hookId as number, reason: 'Deleting a repository webhook requires a GitHub token with repository admin access.' }
        }
        return client.deleteRepoWebhook(args.owner as string, args.repo as string, args.hookId as number, exec.signal)
      },
    }),

    defineTool({
      name: 'github_ping_repo_webhook',
      description: 'Send a ping event to a repository webhook to verify it is receiving payloads. WRITE operation: requires a token with repository admin access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        hookId: { type: 'integer', required: true, description: 'Webhook id' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the ping was sent' },
            id: { type: 'integer', description: 'Webhook id' },
            reason: { type: 'string', description: 'Explanation when ping could not be sent' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Pinged webhook #${value.id}` }]
          return [{ type: 'text', text: `Could not ping webhook #${value.id}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Ping webhook #${args.hookId}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; id?: number; reason?: string }
        if (v.ok) return { card: 'generic', title: `Webhook #${v.id} pinged` }
        return { card: 'generic', title: 'Ping webhook failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, id: args.hookId as number, reason: 'Pinging a repository webhook requires a GitHub token with repository admin access.' }
        }
        return client.pingRepoWebhook(args.owner as string, args.repo as string, args.hookId as number, exec.signal)
      },
    }),

    defineTool({
      name: 'github_list_release_assets',
      description: 'List assets attached to a GitHub Release, including file size, download count, state, content type, and download URLs. Requires a token for private repos.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        releaseId: { type: 'integer', required: true, description: 'Release id' },
        limit: { type: 'integer', description: 'Maximum results, 1-100 (default 30)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the release assets are accessible' },
            reason: { type: 'string', description: 'Explanation when assets are not accessible' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Asset id' },
                  name: { type: 'string', description: 'Asset file name' },
                  label: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Optional display label' },
                  sizeInBytes: { type: 'integer', description: 'File size in bytes' },
                  downloadCount: { type: 'integer', description: 'Download count' },
                  state: { type: 'string', description: 'Asset state' },
                  contentType: { type: 'string', description: 'Content type' },
                  createdAt: { type: 'string', description: 'ISO upload timestamp' },
                  updatedAt: { type: 'string', description: 'ISO update timestamp' },
                  downloadUrl: { type: 'string', description: 'Asset API URL' },
                  browserDownloadUrl: { type: 'string', description: 'Browser download URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Release assets are not accessible.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No release assets found.' }]
          return [{ type: 'text', text: items.map(item => `${item.name} (${item.sizeInBytes} bytes, ${item.downloadCount} downloads, ${item.state}, ${item.contentType})`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Release assets: ${args.owner}/${args.repo} #${args.releaseId}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; items?: Array<{ name: string }> }
        if (!v.found) return { card: 'generic', title: 'Release assets not accessible' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No release assets' }
        return {
          card: 'generic',
          title: `${items.length} release asset(s)`,
          content: [{ type: 'text', text: items.map(i => i.name).join('\n') }],
        }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, items: [], reason: 'Listing release assets requires a GitHub token. Configure the plugin with a token.' }
        }
        const limit = args.limit === undefined ? 30 : Math.max(1, Math.min(args.limit as number, 100))
        try {
          const items = await client.listReleaseAssets(args.owner as string, args.repo as string, args.releaseId as number, { perPage: limit, signal: exec.signal })
          return { found: true, items }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false, items: [] }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_get_release_asset',
      description: 'Get metadata for one GitHub Release asset, including size, download count, state, content type, and URLs. Requires a token for private repos.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        assetId: { type: 'integer', required: true, description: 'Release asset id' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the asset exists and is accessible' },
            id: { type: 'integer', description: 'Asset id' },
            name: { type: 'string', description: 'Asset file name' },
            label: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Optional display label' },
            sizeInBytes: { type: 'integer', description: 'File size in bytes' },
            downloadCount: { type: 'integer', description: 'Download count' },
            state: { type: 'string', description: 'Asset state' },
            contentType: { type: 'string', description: 'Content type' },
            createdAt: { type: 'string', description: 'ISO upload timestamp' },
            updatedAt: { type: 'string', description: 'ISO update timestamp' },
            downloadUrl: { type: 'string', description: 'Asset API URL' },
            browserDownloadUrl: { type: 'string', description: 'Browser download URL' },
            reason: { type: 'string', description: 'Explanation when not found' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Release asset not found or not accessible.' }]
          return [{
            type: 'text',
            text: [
              `#${value.id} ${value.name}`,
              `size: ${value.sizeInBytes} bytes`,
              `downloads: ${value.downloadCount}`,
              `state: ${value.state}`,
              `content type: ${value.contentType}`,
              `label: ${value.label ?? 'none'}`,
              `download: ${value.browserDownloadUrl}`,
              `created: ${value.createdAt}`,
              `updated: ${value.updatedAt}`,
            ].join('\n'),
          }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Release asset #${args.assetId}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; id?: number; name?: string }
        if (!v.found) return { card: 'generic', title: 'Release asset not found' }
        return { card: 'generic', title: `Release asset #${v.id}`, content: [{ type: 'text', text: v.name ?? '' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { found: false, reason: 'Getting a release asset requires a GitHub token. Configure the plugin with a token.' }
        }
        try {
          const asset = await client.getReleaseAsset(args.owner as string, args.repo as string, args.assetId as number, exec.signal)
          return { found: true, ...asset }
        } catch (error) {
          if (error instanceof GithubError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'github_update_release_asset',
      description: 'Update the file name or display label of a GitHub Release asset. WRITE operation: requires a token with repository contents access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        assetId: { type: 'integer', required: true, description: 'Release asset id' },
        name: { type: 'string', description: 'New asset file name' },
        label: { type: 'string', description: 'New display label' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the asset was updated' },
            id: { type: 'integer', description: 'Asset id' },
            name: { type: 'string', description: 'Updated asset name' },
            reason: { type: 'string', description: 'Explanation when not updated' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Updated release asset #${value.id}: ${value.name}` }]
          return [{ type: 'text', text: `Could not update release asset #${value.id}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Update release asset #${args.assetId}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; id?: number; name?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Release asset #${v.id} updated`, content: [{ type: 'text', text: v.name ?? '' }] }
        return { card: 'generic', title: 'Update release asset failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, id: args.assetId as number, reason: 'Updating a release asset requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.updateReleaseAsset(args.owner as string, args.repo as string, args.assetId as number, {
          name: args.name as string | undefined,
          label: args.label as string | undefined,
        }, exec.signal)
      },
    }),

    defineTool({
      name: 'github_delete_release_asset',
      description: 'Delete a GitHub Release asset. WRITE operation: requires a token with repository contents access.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner' },
        repo: { type: 'string', required: true, description: 'Repository name' },
        assetId: { type: 'integer', required: true, description: 'Release asset id' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the asset was deleted' },
            id: { type: 'integer', description: 'Asset id' },
            reason: { type: 'string', description: 'Explanation when not deleted' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Deleted release asset #${value.id}` }]
          return [{ type: 'text', text: `Could not delete release asset #${value.id}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Delete release asset #${args.assetId}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; id?: number; reason?: string }
        if (v.ok) return { card: 'generic', title: `Release asset #${v.id} deleted` }
        return { card: 'generic', title: 'Delete release asset failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, id: args.assetId as number, reason: 'Deleting a release asset requires a GitHub token. Configure the plugin with a token.' }
        }
        return client.deleteReleaseAsset(args.owner as string, args.repo as string, args.assetId as number, exec.signal)
      },
    }),
  ]
}
