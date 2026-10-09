import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { LinearClient, LinearError } from './client.js'

export const name = 'dsh-tool-linear'
export const inject = ['tools']

export interface LinearPluginConfig {
  /** Linear personal API key. All Linear GraphQL calls require it. */
  apiKey?: string
  /** GraphQL endpoint override (default https://api.linear.app/graphql). */
  baseUrl?: string
  /** Request timeout in milliseconds. */
  timeoutMs?: number
}

export function apply(ctx: Context, config: LinearPluginConfig = {}) {
  const client = new LinearClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
  })
  for (const tool of createTools(client)) {
    ctx.tools.register(tool)
  }
}

/** Build the tool definitions for a client. Exported so tests can drive execute/render directly. */
export function createTools(client: LinearClient) {
  return [
    defineTool({
      name: 'linear_search_issues',
      description: 'Search Linear issues by title, identifier, description, or comment text.',
      parameters: {
        query: { type: 'string', required: true, description: 'Search text, e.g. checkout or ticket ABC-123' },
        teamId: { type: 'string', description: 'Optional Linear team UUID to narrow the search' },
        limit: { type: 'integer', description: 'Maximum results, 1-100 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean', description: 'Whether Linear credentials are configured' },
            found: { type: 'boolean', description: 'Whether the search is accessible' },
            reason: { type: 'string', description: 'Explanation when not accessible' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  identifier: { type: 'string' },
                  title: { type: 'string' },
                  status: { type: 'string' },
                  stateType: { type: 'string' },
                  priorityLabel: { type: 'string' },
                  teamKey: { type: 'string' },
                  projectName: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  assigneeName: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  labels: { type: 'array', items: { type: 'string' } },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                  url: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Searching Linear issues requires an API key.' }]
          if (!value.found) return [{ type: 'text', text: value.reason ?? 'Linear search is not accessible.' }]
          return renderIssueList(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Search Linear: ${args.query}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; found?: boolean; items?: unknown[]; reason?: string }
        if (!v.authenticated) return { card: 'generic', title: 'Requires Linear API key' }
        if (!v.found) return { card: 'generic', title: 'Search unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} issue(s)` }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { authenticated: false, found: false, items: [], reason: 'Searching Linear issues requires a Linear API key.' }
        }
        const limit = clampLimit(args.limit)
        const items = await client.searchIssues(args.query as string, { teamId: args.teamId, limit, signal: exec.signal })
        return { authenticated: true, found: true, items }
      },
    }),

    defineTool({
      name: 'linear_list_issues',
      description: 'List Linear issues with optional team, project, cycle, and workflow state filters.',
      parameters: {
        teamId: { type: 'string', description: 'Linear team UUID, from linear_list_teams' },
        projectId: { type: 'string', description: 'Linear project UUID' },
        cycleId: { type: 'string', description: 'Linear cycle UUID' },
        stateType: { type: 'string', description: 'Workflow state type, e.g. backlog, unstarted, started, completed, canceled' },
        limit: { type: 'integer', description: 'Maximum results, 1-100 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean' },
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  identifier: { type: 'string' },
                  title: { type: 'string' },
                  status: { type: 'string' },
                  stateType: { type: 'string' },
                  priorityLabel: { type: 'string' },
                  teamKey: { type: 'string' },
                  projectName: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  assigneeName: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  labels: { type: 'array', items: { type: 'string' } },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                  url: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Listing Linear issues requires an API key.' }]
          if (!value.found) return [{ type: 'text', text: value.reason ?? 'Linear issues are not accessible.' }]
          return renderIssueList(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Linear issues', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; found?: boolean; items?: unknown[] }
        if (!v.authenticated) return { card: 'generic', title: 'Requires Linear API key' }
        if (!v.found) return { card: 'generic', title: 'Issues unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} issue(s)` }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { authenticated: false, found: false, items: [], reason: 'Listing Linear issues requires a Linear API key.' }
        }
        const items = await client.listIssues({
          teamId: args.teamId,
          projectId: args.projectId,
          cycleId: args.cycleId,
          stateType: args.stateType,
          limit: clampLimit(args.limit),
          signal: exec.signal,
        })
        return { authenticated: true, found: true, items }
      },
    }),

    defineTool({
      name: 'linear_get_issue',
      description: 'Get one Linear issue by UUID or identifier, such as ABC-123.',
      parameters: {
        id: { type: 'string', required: true, description: 'Linear issue UUID or identifier' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean' },
            found: { type: 'boolean' },
            reason: { type: 'string' },
            id: { type: 'string' },
            identifier: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string' },
            stateType: { type: 'string' },
            priority: { oneOf: [{ type: 'number' }, { type: 'null' }] },
            priorityLabel: { type: 'string' },
            teamKey: { type: 'string' },
            teamName: { type: 'string' },
            projectName: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            cycleName: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            assigneeName: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            labels: { type: 'array', items: { type: 'string' } },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' },
            dueDate: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            url: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Reading a Linear issue requires an API key.' }]
          if (!value.found) return [{ type: 'text', text: 'Linear issue not found.' }]
          const lines = [
            `${value.identifier ?? ''}: ${value.title ?? ''}`,
            `status: ${value.status ?? ''} (${value.stateType ?? ''})`,
            `priority: ${value.priorityLabel ?? 'none'}`,
            value.teamKey ? `team: ${value.teamKey} ${value.teamName ?? ''}` : '',
            value.projectName ? `project: ${value.projectName}` : '',
            value.cycleName ? `cycle: ${value.cycleName}` : '',
            value.assigneeName ? `assignee: ${value.assigneeName}` : '',
            `labels: ${(value.labels ?? []).join(', ') || 'none'}`,
            value.dueDate ? `due: ${value.dueDate}` : '',
            value.description ? `description:\n${value.description}` : '',
            value.url ?? '',
          ].filter(Boolean)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Linear issue ${args.id}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; found?: boolean; identifier?: string; title?: string; status?: string }
        if (!v.authenticated) return { card: 'generic', title: 'Requires Linear API key' }
        if (!v.found) return { card: 'generic', title: 'Issue not found' }
        return { card: 'generic', title: `${v.identifier}: ${v.title}`, content: [{ type: 'text', text: v.status ?? '' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { authenticated: false, found: false, reason: 'Reading a Linear issue requires a Linear API key.' }
        try {
          const info = await client.getIssue(args.id as string, exec.signal)
          return { authenticated: true, found: true, ...info }
        } catch (error) {
          if (error instanceof LinearError && (error.status === 404 || /not found/i.test(error.message))) {
            return { authenticated: true, found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'linear_create_issue',
      description: 'Create a Linear issue. WRITE operation: requires an API key.',
      parameters: {
        teamId: { type: 'string', required: true, description: 'Linear team UUID, from linear_list_teams' },
        title: { type: 'string', required: true, description: 'Issue title' },
        description: { type: 'string', description: 'Issue description' },
        priority: { type: 'number', description: 'Urgency: 0 none, 1 urgent, 2 high, 3 medium, 4 low' },
        projectId: { type: 'string', description: 'Linear project UUID' },
        cycleId: { type: 'string', description: 'Linear cycle UUID' },
        assigneeId: { type: 'string', description: 'Linear user UUID' },
        labelIds: { type: 'array', items: { type: 'string' }, description: 'Linear label UUIDs' },
        stateId: { type: 'string', description: 'Linear workflow state UUID' },
        dueDate: { type: 'string', description: 'Due date, e.g. 2026-09-30' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            created: { type: 'boolean' },
            id: { type: 'string' },
            identifier: { type: 'string' },
            url: { type: 'string' },
            reason: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (value.created) return [{ type: 'text', text: `Created Linear issue ${value.identifier}.` }]
          return [{ type: 'text', text: `Could not create the Linear issue: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Create Linear issue in ${args.teamId}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { created?: boolean; identifier?: string; id?: string; reason?: string }
        if (v.created) return { card: 'generic', title: `Linear issue ${v.identifier ?? v.id} created` }
        return { card: 'generic', title: 'Create issue failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { created: false, reason: 'Creating a Linear issue requires a Linear API key.' }
        return client.createIssue({
          teamId: args.teamId as string,
          title: args.title as string,
          description: args.description,
          priority: args.priority,
          projectId: args.projectId,
          cycleId: args.cycleId,
          assigneeId: args.assigneeId,
          labelIds: args.labelIds,
          stateId: args.stateId,
          dueDate: args.dueDate,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'linear_update_issue',
      description: 'Update a Linear issue title, description, priority, project, cycle, assignee, labels, workflow state, or due date. WRITE operation: requires an API key.',
      parameters: {
        id: { type: 'string', required: true, description: 'Linear issue UUID' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        priority: { type: 'number', description: 'Urgency: 0 none, 1 urgent, 2 high, 3 medium, 4 low' },
        projectId: { type: 'string', description: 'Linear project UUID' },
        cycleId: { type: 'string', description: 'Linear cycle UUID' },
        assigneeId: { type: 'string', description: 'Linear user UUID' },
        labelIds: { type: 'array', items: { type: 'string' }, description: 'Replacement label UUIDs' },
        stateId: { type: 'string', description: 'Linear workflow state UUID' },
        dueDate: { type: 'string', description: 'Due date, e.g. 2026-09-30' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            id: { type: 'string' },
            reason: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Updated Linear issue ${value.id}.` }]
          return [{ type: 'text', text: `Could not update ${_args.id}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Update Linear issue ${args.id}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; id?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Issue ${v.id} updated` }
        return { card: 'generic', title: 'Update issue failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { ok: false, id: args.id as string, reason: 'Updating a Linear issue requires a Linear API key.' }
        if (
          args.title === undefined &&
          args.description === undefined &&
          args.priority === undefined &&
          args.projectId === undefined &&
          args.cycleId === undefined &&
          args.assigneeId === undefined &&
          args.labelIds === undefined &&
          args.stateId === undefined &&
          args.dueDate === undefined
        ) {
          return { ok: false, id: args.id as string, reason: 'Provide at least one field to update.' }
        }
        return client.updateIssue(args.id as string, {
          title: args.title,
          description: args.description,
          priority: args.priority,
          projectId: args.projectId,
          cycleId: args.cycleId,
          assigneeId: args.assigneeId,
          labelIds: args.labelIds,
          stateId: args.stateId,
          dueDate: args.dueDate,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'linear_add_issue_comment',
      description: 'Add a comment to a Linear issue. WRITE operation: requires an API key.',
      parameters: {
        id: { type: 'string', required: true, description: 'Linear issue UUID' },
        body: { type: 'string', required: true, description: 'Comment text' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            id: { type: 'string' },
            reason: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Comment ${value.id} added to ${_args.id}.` }]
          return [{ type: 'text', text: `Could not add the comment: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Comment on ${args.id}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; id?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Comment ${v.id} added` }
        return { card: 'generic', title: 'Add comment failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { ok: false, reason: 'Adding a Linear comment requires a Linear API key.' }
        return client.addIssueComment(args.id as string, args.body as string, exec.signal)
      },
    }),

    defineTool({
      name: 'linear_list_issue_comments',
      description: 'List comments on a Linear issue.',
      parameters: {
        id: { type: 'string', required: true, description: 'Linear issue UUID or identifier' },
        limit: { type: 'integer', description: 'Maximum comments, 1-100 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean' },
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  body: { type: 'string' },
                  author: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                  url: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Listing Linear comments requires an API key.' }]
          if (!value.found) return [{ type: 'text', text: value.reason ?? 'Issue not found.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No comments on this issue.' }]
          return [{ type: 'text', text: items.map((item: { author?: string | null; createdAt?: string; body?: string }) =>
            `${item.author ?? 'unknown'} (${item.createdAt ?? ''}): ${item.body ?? ''}`,
          ).join('\n\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Comments on ${args.id}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; found?: boolean; items?: unknown[] }
        if (!v.authenticated) return { card: 'generic', title: 'Requires Linear API key' }
        if (!v.found) return { card: 'generic', title: 'Issue not found' }
        return { card: 'generic', title: `${(v.items ?? []).length} comment(s)` }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { authenticated: false, found: false, items: [], reason: 'Listing Linear comments requires a Linear API key.' }
        try {
          const result = await client.listIssueComments(args.id as string, { limit: clampLimit(args.limit), signal: exec.signal })
          return { authenticated: true, found: true, items: result.items }
        } catch (error) {
          if (error instanceof LinearError && (error.status === 404 || /not found/i.test(error.message))) {
            return { authenticated: true, found: false, items: [], reason: 'Linear issue not found.' }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'linear_list_cycles',
      description: 'List Linear cycles for a team.',
      parameters: {
        teamId: { type: 'string', required: true, description: 'Linear team UUID, from linear_list_teams' },
        limit: { type: 'integer', description: 'Maximum cycles, 1-100 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean' },
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  number: { type: 'number' },
                  startsAt: { type: 'string' },
                  endsAt: { type: 'string' },
                  completedAt: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  progress: { type: 'number' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Listing Linear cycles requires an API key.' }]
          if (!value.found) return [{ type: 'text', text: value.reason ?? 'Team not found.' }]
          return renderCycleList(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Cycles for ${args.teamId}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; found?: boolean; items?: unknown[] }
        if (!v.authenticated) return { card: 'generic', title: 'Requires Linear API key' }
        if (!v.found) return { card: 'generic', title: 'Team not found' }
        return { card: 'generic', title: `${(v.items ?? []).length} cycle(s)` }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { authenticated: false, found: false, items: [], reason: 'Listing Linear cycles requires a Linear API key.' }
        try {
          const items = await client.listCycles(args.teamId as string, { limit: clampLimit(args.limit), signal: exec.signal })
          return { authenticated: true, found: true, items }
        } catch (error) {
          if (error instanceof LinearError && (error.status === 404 || /not found/i.test(error.message))) {
            return { authenticated: true, found: false, items: [], reason: 'Linear team not found.' }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'linear_get_cycle',
      description: 'Get one Linear cycle.',
      parameters: {
        id: { type: 'string', required: true, description: 'Linear cycle UUID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean' },
            found: { type: 'boolean' },
            reason: { type: 'string' },
            id: { type: 'string' },
            name: { type: 'string' },
            number: { type: 'number' },
            startsAt: { type: 'string' },
            endsAt: { type: 'string' },
            completedAt: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            progress: { type: 'number' },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Reading a Linear cycle requires an API key.' }]
          if (!value.found) return [{ type: 'text', text: 'Linear cycle not found.' }]
          return [{ type: 'text', text: `Cycle ${value.number ?? ''}: ${value.name ?? ''}\nstart: ${value.startsAt}\nend: ${value.endsAt}\nprogress: ${value.progress ?? 0}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Cycle ${args.id}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; found?: boolean; name?: string; number?: number }
        if (!v.authenticated) return { card: 'generic', title: 'Requires Linear API key' }
        if (!v.found) return { card: 'generic', title: 'Cycle not found' }
        return { card: 'generic', title: `Cycle ${v.number}: ${v.name}` }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { authenticated: false, found: false, reason: 'Reading a Linear cycle requires a Linear API key.' }
        try {
          const info = await client.getCycle(args.id as string, exec.signal)
          return { authenticated: true, found: true, ...info }
        } catch (error) {
          if (error instanceof LinearError && (error.status === 404 || /not found/i.test(error.message))) {
            return { authenticated: true, found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'linear_list_projects',
      description: 'List Linear projects, optionally scoped to a team.',
      parameters: {
        teamId: { type: 'string', description: 'Optional Linear team UUID, from linear_list_teams' },
        limit: { type: 'integer', description: 'Maximum projects, 1-100 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean' },
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  status: { type: 'string' },
                  startDate: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  targetDate: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  progress: { type: 'number' },
                  teamKeys: { type: 'array', items: { type: 'string' } },
                  url: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Listing Linear projects requires an API key.' }]
          if (!value.found) return [{ type: 'text', text: value.reason ?? 'Projects are not accessible.' }]
          return renderProjectList(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Linear projects', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; found?: boolean; items?: unknown[] }
        if (!v.authenticated) return { card: 'generic', title: 'Requires Linear API key' }
        if (!v.found) return { card: 'generic', title: 'Projects unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} project(s)` }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { authenticated: false, found: false, items: [], reason: 'Listing Linear projects requires a Linear API key.' }
        try {
          const items = await client.listProjects({ teamId: args.teamId, limit: clampLimit(args.limit), signal: exec.signal })
          return { authenticated: true, found: true, items }
        } catch (error) {
          if (error instanceof LinearError && (error.status === 404 || /not found/i.test(error.message))) {
            return { authenticated: true, found: false, items: [], reason: 'Linear team not found.' }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'linear_get_project',
      description: 'Get one Linear project with status, dates, progress, and teams.',
      parameters: {
        id: { type: 'string', required: true, description: 'Linear project UUID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean' },
            found: { type: 'boolean' },
            reason: { type: 'string' },
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string' },
            startDate: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            targetDate: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            health: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            progress: { type: 'number' },
            teamKeys: { type: 'array', items: { type: 'string' } },
            url: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Reading a Linear project requires an API key.' }]
          if (!value.found) return [{ type: 'text', text: 'Linear project not found.' }]
          const lines = [
            `${value.name ?? ''} [${value.status ?? ''}]`,
            `progress: ${value.progress ?? 0}`,
            value.health ? `health: ${value.health}` : '',
            value.startDate ? `start: ${value.startDate}` : '',
            value.targetDate ? `target: ${value.targetDate}` : '',
            `teams: ${(value.teamKeys ?? []).join(', ') || 'none'}`,
            value.description ? `description:\n${value.description}` : '',
            value.url ?? '',
          ].filter(Boolean)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Linear project ${args.id}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; found?: boolean; name?: string; status?: string }
        if (!v.authenticated) return { card: 'generic', title: 'Requires Linear API key' }
        if (!v.found) return { card: 'generic', title: 'Project not found' }
        return { card: 'generic', title: v.name ?? '', content: [{ type: 'text', text: v.status ?? '' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { authenticated: false, found: false, reason: 'Reading a Linear project requires a Linear API key.' }
        try {
          const info = await client.getProject(args.id as string, exec.signal)
          return { authenticated: true, found: true, ...info }
        } catch (error) {
          if (error instanceof LinearError && (error.status === 404 || /not found/i.test(error.message))) {
            return { authenticated: true, found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'linear_list_teams',
      description: 'List Linear teams visible to the API key.',
      parameters: {
        limit: { type: 'integer', description: 'Maximum teams, 1-100 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean' },
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  key: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  issueCount: { type: 'number' },
                  updatedAt: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Listing Linear teams requires an API key.' }]
          if (!value.found) return [{ type: 'text', text: value.reason ?? 'Teams are not accessible.' }]
          return renderTeamList(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Linear teams', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; found?: boolean; items?: unknown[] }
        if (!v.authenticated) return { card: 'generic', title: 'Requires Linear API key' }
        if (!v.found) return { card: 'generic', title: 'Teams unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} team(s)` }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { authenticated: false, found: false, items: [], reason: 'Listing Linear teams requires a Linear API key.' }
        const items = await client.listTeams({ limit: clampLimit(args.limit), signal: exec.signal })
        return { authenticated: true, found: true, items }
      },
    }),

    defineTool({
      name: 'linear_get_team',
      description: 'Get one Linear team by UUID.',
      parameters: {
        id: { type: 'string', required: true, description: 'Linear team UUID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean' },
            found: { type: 'boolean' },
            reason: { type: 'string' },
            id: { type: 'string' },
            key: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            icon: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            color: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            issueCount: { type: 'number' },
            updatedAt: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Reading a Linear team requires an API key.' }]
          if (!value.found) return [{ type: 'text', text: 'Linear team not found.' }]
          const lines = [
            `${value.name ?? ''} (${value.key ?? ''})`,
            `issues: ${value.issueCount ?? 0}`,
            value.description ? `description:\n${value.description}` : '',
          ].filter(Boolean)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Linear team ${args.id}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; found?: boolean; name?: string; key?: string }
        if (!v.authenticated) return { card: 'generic', title: 'Requires Linear API key' }
        if (!v.found) return { card: 'generic', title: 'Team not found' }
        return { card: 'generic', title: `${v.name} (${v.key})` }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { authenticated: false, found: false, reason: 'Reading a Linear team requires a Linear API key.' }
        try {
          const info = await client.getTeam(args.id as string, exec.signal)
          return { authenticated: true, found: true, ...info }
        } catch (error) {
          if (error instanceof LinearError && (error.status === 404 || /not found/i.test(error.message))) {
            return { authenticated: true, found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'linear_list_labels',
      description: 'List Linear issue labels, optionally scoped to a team.',
      parameters: {
        teamId: { type: 'string', description: 'Optional Linear team UUID to narrow labels' },
        limit: { type: 'integer', description: 'Maximum labels, 1-100 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean' },
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  color: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  description: { type: 'string' },
                  parentId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  parentName: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  teamId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  teamKey: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  teamName: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  url: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Listing Linear labels requires an API key.' }]
          if (!value.found) return [{ type: 'text', text: value.reason ?? 'Linear labels are not accessible.' }]
          return renderLabelList(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: args.teamId ? `Labels for ${args.teamId}` : 'Linear labels', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; found?: boolean; items?: unknown[] }
        if (!v.authenticated) return { card: 'generic', title: 'Requires Linear API key' }
        if (!v.found) return { card: 'generic', title: 'Labels unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} label(s)` }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { authenticated: false, found: false, items: [], reason: 'Listing Linear labels requires a Linear API key.' }
        try {
          const items = await client.listLabels({ teamId: args.teamId, limit: clampLimit(args.limit), signal: exec.signal })
          return { authenticated: true, found: true, items }
        } catch (error) {
          if (error instanceof LinearError && (error.status === 404 || /not found/i.test(error.message))) {
            return { authenticated: true, found: false, items: [], reason: 'Linear team not found.' }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'linear_get_label',
      description: 'Get one Linear issue label by UUID.',
      parameters: {
        id: { type: 'string', required: true, description: 'Linear label UUID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean' },
            found: { type: 'boolean' },
            reason: { type: 'string' },
            id: { type: 'string' },
            name: { type: 'string' },
            color: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            description: { type: 'string' },
            parentId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            parentName: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            teamId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            teamKey: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            teamName: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            url: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Reading a Linear label requires an API key.' }]
          if (!value.found) return [{ type: 'text', text: 'Linear label not found.' }]
          const lines = [
            `${value.name ?? ''}`,
            value.color ? `color: ${value.color}` : '',
            value.teamKey ? `team: ${value.teamKey} ${value.teamName ?? ''}` : '',
            value.parentName ? `parent: ${value.parentName}` : '',
            value.description ? `description:\n${value.description}` : '',
            value.url ?? '',
          ].filter(Boolean)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Linear label ${args.id}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; found?: boolean; name?: string }
        if (!v.authenticated) return { card: 'generic', title: 'Requires Linear API key' }
        if (!v.found) return { card: 'generic', title: 'Label not found' }
        return { card: 'generic', title: v.name ?? 'Linear label' }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { authenticated: false, found: false, reason: 'Reading a Linear label requires a Linear API key.' }
        try {
          const info = await client.getLabel(args.id as string, exec.signal)
          return { authenticated: true, found: true, ...info }
        } catch (error) {
          if (error instanceof LinearError && (error.status === 404 || /not found/i.test(error.message))) {
            return { authenticated: true, found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'linear_list_users',
      description: 'List Linear users visible to the API key, optionally filtered by name, display name, or email.',
      parameters: {
        query: { type: 'string', description: 'Optional case-insensitive text matched against name, display name, or email' },
        limit: { type: 'integer', description: 'Maximum users, 1-100 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean' },
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  displayName: { type: 'string' },
                  email: { type: 'string' },
                  avatarUrl: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  active: { type: 'boolean' },
                  timezone: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' },
                  url: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Listing Linear users requires an API key.' }]
          if (!value.found) return [{ type: 'text', text: value.reason ?? 'Linear users are not accessible.' }]
          return renderUserList(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: args.query ? `Search Linear users: ${args.query}` : 'Linear users', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; found?: boolean; items?: unknown[] }
        if (!v.authenticated) return { card: 'generic', title: 'Requires Linear API key' }
        if (!v.found) return { card: 'generic', title: 'Users unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} user(s)` }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { authenticated: false, found: false, items: [], reason: 'Listing Linear users requires a Linear API key.' }
        const items = await client.listUsers({ query: args.query, limit: clampLimit(args.limit), signal: exec.signal })
        return { authenticated: true, found: true, items }
      },
    }),

    defineTool({
      name: 'linear_get_user',
      description: 'Get one Linear user by UUID.',
      parameters: {
        id: { type: 'string', required: true, description: 'Linear user UUID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean' },
            found: { type: 'boolean' },
            reason: { type: 'string' },
            id: { type: 'string' },
            name: { type: 'string' },
            displayName: { type: 'string' },
            email: { type: 'string' },
            avatarUrl: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            active: { type: 'boolean' },
            timezone: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' },
            url: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Reading a Linear user requires an API key.' }]
          if (!value.found) return [{ type: 'text', text: 'Linear user not found.' }]
          const lines = [
            `${value.displayName ?? value.name ?? ''}`,
            value.email ? `email: ${value.email}` : '',
            `active: ${value.active ?? false}`,
            value.timezone ? `timezone: ${value.timezone}` : '',
            value.url ?? '',
          ].filter(Boolean)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Linear user ${args.id}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; found?: boolean; displayName?: string; name?: string }
        if (!v.authenticated) return { card: 'generic', title: 'Requires Linear API key' }
        if (!v.found) return { card: 'generic', title: 'User not found' }
        return { card: 'generic', title: v.displayName ?? v.name ?? 'Linear user' }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { authenticated: false, found: false, reason: 'Reading a Linear user requires a Linear API key.' }
        try {
          const info = await client.getUser(args.id as string, exec.signal)
          return { authenticated: true, found: true, ...info }
        } catch (error) {
          if (error instanceof LinearError && (error.status === 404 || /not found/i.test(error.message))) {
            return { authenticated: true, found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'linear_list_workflow_states',
      description: 'List Linear workflow states for a team, useful when choosing a state for create or update.',
      parameters: {
        teamId: { type: 'string', required: true, description: 'Linear team UUID, from linear_list_teams' },
        limit: { type: 'integer', description: 'Maximum states, 1-100 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean' },
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  type: { type: 'string' },
                  position: { type: 'number' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Listing Linear workflow states requires an API key.' }]
          if (!value.found) return [{ type: 'text', text: value.reason ?? 'Linear workflow states are not accessible.' }]
          return renderWorkflowStateList(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Workflow states for ${args.teamId}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; found?: boolean; items?: unknown[] }
        if (!v.authenticated) return { card: 'generic', title: 'Requires Linear API key' }
        if (!v.found) return { card: 'generic', title: 'Team not found' }
        return { card: 'generic', title: `${(v.items ?? []).length} state(s)` }
      },
      async execute(args, exec) {
        if (!client.hasToken()) return { authenticated: false, found: false, items: [], reason: 'Listing Linear workflow states requires a Linear API key.' }
        try {
          const items = await client.listWorkflowStates(args.teamId as string, { limit: clampLimit(args.limit), signal: exec.signal })
          return { authenticated: true, found: true, items }
        } catch (error) {
          if (error instanceof LinearError && (error.status === 404 || /not found/i.test(error.message))) {
            return { authenticated: true, found: false, items: [], reason: 'Linear team not found.' }
          }
          throw error
        }
      },
    }),
  ]
}

function renderIssueList(items: Array<{ identifier?: string; title?: string; status?: string; url?: string }>) {
  if (items.length === 0) return [{ type: 'text' as const, text: 'No Linear issues found.' }]
  return [{ type: 'text' as const, text: items.map(item =>
    `${item.identifier}: ${item.title} [${item.status}] ${item.url ?? ''}`,
  ).join('\n') }]
}

function renderCycleList(items: Array<{ name?: string; number?: number; startsAt?: string; endsAt?: string; progress?: number }>) {
  if (items.length === 0) return [{ type: 'text' as const, text: 'No Linear cycles found.' }]
  return [{ type: 'text' as const, text: items.map(item =>
    `Cycle ${item.number ?? ''}: ${item.name ?? ''} (${item.startsAt ?? ''} to ${item.endsAt ?? ''}, ${item.progress ?? 0}%)`,
  ).join('\n') }]
}

function renderProjectList(items: Array<{ name?: string; status?: string; teamKeys?: string[]; url?: string }>) {
  if (items.length === 0) return [{ type: 'text' as const, text: 'No Linear projects found.' }]
  return [{ type: 'text' as const, text: items.map(item =>
    `${item.name ?? ''} [${item.status ?? ''}] ${(item.teamKeys ?? []).join(', ')} ${item.url ?? ''}`,
  ).join('\n') }]
}

function renderTeamList(items: Array<{ key?: string; name?: string; issueCount?: number }>) {
  if (items.length === 0) return [{ type: 'text' as const, text: 'No Linear teams found.' }]
  return [{ type: 'text' as const, text: items.map(item =>
    `${item.key ?? ''}: ${item.name ?? ''} (${item.issueCount ?? 0} issues)`,
  ).join('\n') }]
}

function renderLabelList(items: Array<{ name?: string; color?: string | null; teamKey?: string | null; url?: string }>) {
  if (items.length === 0) return [{ type: 'text' as const, text: 'No Linear labels found.' }]
  return [{ type: 'text' as const, text: items.map(item =>
    `${item.name ?? ''}${item.color ? ` [${item.color}]` : ''} ${item.teamKey ?? ''} ${item.url ?? ''}`,
  ).join('\n') }]
}

function renderUserList(items: Array<{ displayName?: string; name?: string; email?: string; active?: boolean }>) {
  if (items.length === 0) return [{ type: 'text' as const, text: 'No Linear users found.' }]
  return [{ type: 'text' as const, text: items.map(item =>
    `${item.displayName ?? item.name ?? 'unknown'} (${item.email ?? ''}, ${item.active ? 'active' : 'inactive'})`,
  ).join('\n') }]
}

function renderWorkflowStateList(items: Array<{ name?: string; type?: string; position?: number }>) {
  if (items.length === 0) return [{ type: 'text' as const, text: 'No Linear workflow states found.' }]
  return [{ type: 'text' as const, text: items.map(item =>
    `${item.position ?? 0}: ${item.name ?? ''} [${item.type ?? ''}]`,
  ).join('\n') }]
}

function clampLimit(value: number | undefined): number {
  if (value === undefined) return 20
  return Math.max(1, Math.min(value, 100))
}
