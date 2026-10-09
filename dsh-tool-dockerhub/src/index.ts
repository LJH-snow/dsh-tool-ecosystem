import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallView } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DockerHubClient, DockerHubError } from './client.js'

export const name = 'dsh-tool-dockerhub'
export const inject = ['tools']

export interface DockerHubPluginConfig {
  username?: string
  personalAccessToken?: string
  baseUrl?: string
  timeoutMs?: number
}

export function apply(ctx: Context, config: DockerHubPluginConfig = {}) {
  const client = new DockerHubClient(config)
  for (const tool of createTools(client)) ctx.tools.register(tool)
}

function text(value: string) {
  return [{ type: 'text' as const, text: value }]
}

function unavailable(reason: string) {
  return { found: false, items: [], reason }
}

function errorReason(error: unknown): string {
  return error instanceof DockerHubError ? error.message : error instanceof Error ? error.message : String(error)
}

function renderRepositories(items: Array<{ namespace?: string; name?: string; description?: string; pullCount?: number; starCount?: number; isPrivate?: boolean; lastUpdated?: string }>) {
  if (!items.length) return text('No Docker Hub repositories found.')
  return text(items.map(repository => `${repository.namespace ?? ''}/${repository.name ?? ''} pulls=${repository.pullCount ?? 0} stars=${repository.starCount ?? 0} private=${repository.isPrivate ? 'yes' : 'no'} updated=${repository.lastUpdated ?? ''}\n  ${(repository.description ?? '').slice(0, 200)}`).join('\n'))
}

function renderTags(items: Array<{ name?: string; digest?: string; lastUpdated?: string; fullSize?: number; architecture?: string; os?: string }>) {
  if (!items.length) return text('No Docker Hub tags found.')
  return text(items.map(tag => `${tag.name ?? ''} digest=${tag.digest ?? ''} size=${tag.fullSize ?? 0} arch=${tag.architecture ?? ''} os=${tag.os ?? ''} updated=${tag.lastUpdated ?? ''}`).join('\n'))
}

function renderSearch(items: Array<{ namespace?: string; name?: string; description?: string; pullCount?: number; starCount?: number; isOfficial?: boolean }>) {
  if (!items.length) return text('No Docker Hub repositories matched the search.')
  return text(items.map(result => `${result.namespace ?? ''}/${result.name ?? ''} pulls=${result.pullCount ?? 0} stars=${result.starCount ?? 0} official=${result.isOfficial ? 'yes' : 'no'}\n  ${(result.description ?? '').slice(0, 200)}`).join('\n'))
}

function renderRepository(value: { namespace?: string; name?: string; description?: string; pullCount?: number; starCount?: number; isPrivate?: boolean; lastUpdated?: string; repoUrl?: string }) {
  return text(`${value.namespace ?? ''}/${value.name ?? ''}\npulls=${value.pullCount ?? 0} stars=${value.starCount ?? 0} private=${value.isPrivate ? 'yes' : 'no'} updated=${value.lastUpdated ?? ''}\n${value.description ?? ''}\n${value.repoUrl ?? ''}`)
}

function renderTag(value: { name?: string; digest?: string; lastUpdated?: string; fullSize?: number; architecture?: string; os?: string; status?: string }) {
  return text(`${value.name ?? ''}\ndigest=${value.digest ?? ''} size=${value.fullSize ?? 0} arch=${value.architecture ?? ''} os=${value.os ?? ''}\nupdated=${value.lastUpdated ?? ''} status=${value.status ?? ''}`)
}

export function createTools(client: DockerHubClient) {
  return [
    defineTool({
      name: 'dockerhub_auth_test',
      description: 'Verify Docker Hub username and personal access token without returning the token.',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, reason: { type: 'string' }, username: { type: 'string' }, namespace: { type: 'string' } } },
        render: (_args, value) => value.ok ? text(`username=${value.username ?? ''} namespace=${value.namespace ?? ''}`) : text(`Docker Hub auth failed: ${value.reason ?? ''}`),
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Verify Docker Hub credentials', kind: 'read' } },
      async execute(_args, exec) {
        if (!client.hasCredentials()) return { ok: false, reason: 'Docker Hub username and personalAccessToken are not configured.' }
        try { return { ok: true, ...await client.authTest(exec.signal) } } catch (error) { return { ok: false, reason: errorReason(error) } }
      },
    }),

    defineTool({
      name: 'dockerhub_get_namespace',
      description: 'Return the configured Docker Hub namespace without querying a same-named repository.',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, namespace: { type: 'string' }, authenticated: { type: 'boolean' } } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Docker Hub is not configured.') : text(`namespace=${value.namespace ?? ''} authenticated=${value.authenticated ? 'yes' : 'no'}`),
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Docker Hub namespace', kind: 'read' } },
      async execute(_args, exec) {
        if (!client.hasCredentials()) return { found: false, reason: 'Docker Hub username and personalAccessToken are not configured.' }
        try { return { found: true, ...await client.getNamespace() } } catch (error) { return { found: false, reason: errorReason(error) } }
      },
    }),

    defineTool({
      name: 'dockerhub_list_repositories',
      description: 'List Docker Hub repositories in a namespace with pagination and optional name search.',
      parameters: {
        namespace: { type: 'string', description: 'Docker Hub namespace; defaults to configured username' },
        page: { type: 'integer', description: 'Page number, starting at 1' },
        pageSize: { type: 'integer', description: 'Results per page, 1-100 (default 25)' },
        query: { type: 'string', description: 'Filter repository names' },
        order: { type: 'string', description: 'Ordering, e.g. -last_updated or name' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: {
          found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { namespace: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, pullCount: { type: 'number' }, starCount: { type: 'number' }, isPrivate: { type: 'boolean' }, lastUpdated: { type: 'string' }, status: { type: 'string' }, repoUrl: { type: 'string' } } } }, count: { type: 'number' }, next: { type: 'string' }, previous: { type: 'string' },
        } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Docker Hub is not configured.') : renderRepositories(value.items ?? []),
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Docker Hub repositories', kind: 'search' } },
      async execute(args, exec) {
        try { return { found: true, ...await client.listRepositories({ namespace: args.namespace as string, page: args.page as number, pageSize: args.pageSize as number, query: args.query as string, order: args.order as string, signal: exec.signal }) } } catch (error) { return unavailable(errorReason(error)) }
      },
    }),

    defineTool({
      name: 'dockerhub_get_repository',
      description: 'Get one Docker Hub repository by namespace and repository name.',
      parameters: { namespace: { type: 'string', required: true, description: 'Docker Hub namespace' }, repository: { type: 'string', required: true, description: 'Repository name' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, namespace: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, pullCount: { type: 'number' }, starCount: { type: 'number' }, isPrivate: { type: 'boolean' }, lastUpdated: { type: 'string' }, status: { type: 'string' }, repoUrl: { type: 'string' } } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Docker Hub is not configured.') : renderRepository(value),
      },
      presentCall(args): ToolCallView { return { card: 'generic', title: `Docker Hub repository ${args.namespace ?? ''}/${args.repository ?? ''}`, kind: 'read' } },
      async execute(args, exec) {
        if (!args.namespace || !args.repository) return { found: false, reason: 'namespace and repository are required.' }
        try { return { found: true, ...await client.getRepository(args.namespace as string, args.repository as string, exec.signal) } } catch (error) { return { found: false, reason: errorReason(error) } }
      },
    }),

    defineTool({
      name: 'dockerhub_list_tags',
      description: 'List tags for a Docker Hub repository with pagination.',
      parameters: { namespace: { type: 'string', required: true, description: 'Docker Hub namespace' }, repository: { type: 'string', required: true, description: 'Repository name' }, page: { type: 'integer', description: 'Page number, starting at 1' }, pageSize: { type: 'integer', description: 'Results per page, 1-100 (default 25)' }, query: { type: 'string', description: 'Filter tag names' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, digest: { type: 'string' }, lastUpdated: { type: 'string' }, fullSize: { type: 'number' }, architecture: { type: 'string' }, os: { type: 'string' }, status: { type: 'string' } } } }, count: { type: 'number' }, next: { type: 'string' }, previous: { type: 'string' } } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Docker Hub is not configured.') : renderTags(value.items ?? []),
      },
      presentCall(args): ToolCallView { return { card: 'generic', title: `Docker Hub tags ${args.namespace ?? ''}/${args.repository ?? ''}`, kind: 'search' } },
      async execute(args, exec) {
        if (!args.namespace || !args.repository) return unavailable('namespace and repository are required.')
        try { return { found: true, ...await client.listTags(args.namespace as string, args.repository as string, { page: args.page as number, pageSize: args.pageSize as number, query: args.query as string, signal: exec.signal }) } } catch (error) { return unavailable(errorReason(error)) }
      },
    }),

    defineTool({
      name: 'dockerhub_get_tag',
      description: 'Get digest, size, platform, and update metadata for one Docker Hub tag.',
      parameters: { namespace: { type: 'string', required: true, description: 'Docker Hub namespace' }, repository: { type: 'string', required: true, description: 'Repository name' }, tag: { type: 'string', required: true, description: 'Tag name' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, name: { type: 'string' }, digest: { type: 'string' }, lastUpdated: { type: 'string' }, fullSize: { type: 'number' }, architecture: { type: 'string' }, os: { type: 'string' }, status: { type: 'string' } } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Docker Hub is not configured.') : renderTag(value),
      },
      presentCall(args): ToolCallView { return { card: 'generic', title: `Docker Hub tag ${args.namespace ?? ''}/${args.repository ?? ''}:${args.tag ?? ''}`, kind: 'read' } },
      async execute(args, exec) {
        if (!args.namespace || !args.repository || !args.tag) return { found: false, reason: 'namespace, repository, and tag are required.' }
        try { return { found: true, ...await client.getTag(args.namespace as string, args.repository as string, args.tag as string, exec.signal) } } catch (error) { return { found: false, reason: errorReason(error) } }
      },
    }),

    defineTool({
      name: 'dockerhub_search_repositories',
      description: 'Search public Docker Hub repositories by name or keyword.',
      parameters: { query: { type: 'string', required: true, description: 'Search query' }, page: { type: 'integer', description: 'Page number, starting at 1' }, pageSize: { type: 'integer', description: 'Results per page, 1-100 (default 25)' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, namespace: { type: 'string' }, description: { type: 'string' }, pullCount: { type: 'number' }, starCount: { type: 'number' }, isOfficial: { type: 'boolean' }, isAutomated: { type: 'boolean' } } } }, count: { type: 'number' }, next: { type: 'string' }, previous: { type: 'string' } } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Docker Hub search failed.') : renderSearch(value.items ?? []),
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Search Docker Hub repositories', kind: 'search' } },
      async execute(args, exec) {
        if (!args.query) return unavailable('query is required.')
        try { return { found: true, ...await client.searchRepositories({ query: args.query as string, page: args.page as number, pageSize: args.pageSize as number, signal: exec.signal }) } } catch (error) { return unavailable(errorReason(error)) }
      },
    }),

    defineTool({
      name: 'dockerhub_get_rate_limits',
      description: 'Read Docker Hub rate-limit headers without exposing credentials.',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, limit: { type: 'string' }, remaining: { type: 'string' }, reset: { type: 'string' }, authenticated: { type: 'boolean' } } },
        render: (_args, value) => !value.found ? text(value.reason ?? 'Docker Hub rate limits unavailable.') : text(`limit=${value.limit ?? ''} remaining=${value.remaining ?? ''} reset=${value.reset ?? ''} authenticated=${value.authenticated ? 'yes' : 'no'}`),
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Docker Hub rate limits', kind: 'read' } },
      async execute(_args, exec) {
        try { return { found: true, ...await client.getRateLimits(exec.signal) } } catch (error) { return { found: false, reason: errorReason(error) } }
      },
    }),
  ]
}
