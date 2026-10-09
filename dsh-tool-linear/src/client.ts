/** Minimal Linear GraphQL client with injected fetch for testability. */

import { assertSafeUrl, EndpointSecurityError, normalizeBaseUrl, type LookupImpl } from './url-security.js'

export interface LinearClientOptions {
  /** Linear personal API key. */
  apiKey?: string
  /** GraphQL endpoint override, default https://api.linear.app/graphql. */
  baseUrl?: string
  fetchImpl?: typeof fetch
  /** Request timeout in milliseconds. 0 disables the timeout. */
  timeoutMs?: number
  /** Test-only DNS lookup override; production uses node:dns/promises. */
  lookupImpl?: LookupImpl
}

export interface LinearIssueSummary {
  id: string
  identifier: string
  title: string
  description: string
  priority: number | null
  priorityLabel: string
  status: string
  stateType: string
  teamId: string
  teamKey: string
  teamName: string
  projectId: string | null
  projectName: string | null
  cycleId: string | null
  cycleName: string | null
  assigneeId: string | null
  assigneeName: string | null
  labels: string[]
  createdAt: string
  updatedAt: string
  dueDate: string | null
  url: string
}

export interface LinearIssueDetail extends LinearIssueSummary {}

export interface LinearIssueWriteResult {
  created: boolean
  id?: string
  identifier?: string
  url?: string
  reason?: string
}

export interface LinearWriteResult {
  ok: boolean
  id?: string
  reason?: string
}

export interface LinearCommentItem {
  id: string
  body: string
  author: string | null
  createdAt: string
  updatedAt: string
  url: string
}

export interface LinearCycleInfo {
  id: string
  name: string
  number: number
  startsAt: string
  endsAt: string
  completedAt: string | null
  progress: number
}

export interface LinearProjectInfo {
  id: string
  name: string
  description: string
  status: string
  startDate: string | null
  targetDate: string | null
  health: string | null
  progress: number
  teamIds: string[]
  teamKeys: string[]
  url: string
}

export interface LinearTeamInfo {
  id: string
  key: string
  name: string
  description: string
  icon: string | null
  color: string | null
  issueCount: number
  updatedAt: string
}

export interface LinearLabelInfo {
  id: string
  name: string
  color: string | null
  description: string
  parentId: string | null
  parentName: string | null
  teamId: string | null
  teamKey: string | null
  teamName: string | null
  url: string
}

export interface LinearUserInfo {
  id: string
  name: string
  displayName: string
  email: string
  avatarUrl: string | null
  active: boolean
  timezone: string | null
  createdAt: string
  updatedAt: string
  url: string
}

export interface LinearWorkflowStateInfo {
  id: string
  name: string
  type: string
  position: number
}

export class LinearError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'LinearError'
  }
}

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  priority
  priorityLabel
  url
  createdAt
  updatedAt
  dueDate
  team { id key name }
  state { id name type }
  project { id name }
  cycle { id name number }
  assignee { id name displayName }
  labels { nodes { id name } }
`

const COMMENT_FIELDS = `
  id
  body
  user { id name displayName }
  createdAt
  updatedAt
  url
`

const CYCLE_FIELDS = `
  id
  name
  number
  startsAt
  endsAt
  completedAt
  progress
`

const PROJECT_FIELDS = `
  id
  name
  description
  status { name type }
  startDate
  targetDate
  health
  progress
  teams { nodes { id key name } }
  url
`

const TEAM_FIELDS = `
  id
  key
  name
  description
  icon
  color
  issueCount
  updatedAt
`

const LABEL_FIELDS = `
  id
  name
  color
  description
  url
  parent { id name }
  team { id key name }
`

const USER_FIELDS = `
  id
  name
  displayName
  email
  avatarUrl
  active
  timezone
  createdAt
  updatedAt
  url
`

const WORKFLOW_STATE_FIELDS = `
  id
  name
  type
  position
`

interface RawIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  priority: number | null
  priorityLabel: string | null
  url: string
  createdAt: string
  updatedAt: string
  dueDate: string | null
  team: { id: string; key: string; name: string } | null
  state: { id: string; name: string; type: string } | null
  project: { id: string; name: string } | null
  cycle: { id: string; name: string; number: number } | null
  assignee: { id: string; name: string; displayName: string } | null
  labels: { nodes: Array<{ id: string; name: string }> } | null
}

function mapIssue(raw: RawIssue): LinearIssueSummary {
  return {
    id: raw.id,
    identifier: raw.identifier,
    title: raw.title,
    description: raw.description ?? '',
    priority: raw.priority,
    priorityLabel: raw.priorityLabel ?? '',
    status: raw.state?.name ?? '',
    stateType: raw.state?.type ?? '',
    teamId: raw.team?.id ?? '',
    teamKey: raw.team?.key ?? '',
    teamName: raw.team?.name ?? '',
    projectId: raw.project?.id ?? null,
    projectName: raw.project?.name ?? null,
    cycleId: raw.cycle?.id ?? null,
    cycleName: raw.cycle?.name ?? null,
    assigneeId: raw.assignee?.id ?? null,
    assigneeName: raw.assignee?.displayName ?? raw.assignee?.name ?? null,
    labels: (raw.labels?.nodes ?? []).map(label => label.name),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    dueDate: raw.dueDate ?? null,
    url: raw.url,
  }
}

function mapComment(raw: {
  id: string
  body: string | null
  user: { id: string; name: string; displayName: string } | null
  createdAt: string
  updatedAt: string
  url: string
}): LinearCommentItem {
  return {
    id: raw.id,
    body: raw.body ?? '',
    author: raw.user?.displayName ?? raw.user?.name ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    url: raw.url,
  }
}

function mapCycle(raw: {
  id: string
  name: string
  number: number
  startsAt: string
  endsAt: string
  completedAt: string | null
  progress: number | null
}): LinearCycleInfo {
  return {
    id: raw.id,
    name: raw.name,
    number: raw.number,
    startsAt: raw.startsAt,
    endsAt: raw.endsAt,
    completedAt: raw.completedAt,
    progress: raw.progress ?? 0,
  }
}

function mapProject(raw: {
  id: string
  name: string
  description: string | null
  status: { name: string; type: string } | null
  startDate: string | null
  targetDate: string | null
  health: string | null
  progress: number | null
  teams: { nodes: Array<{ id: string; key: string; name: string }> } | null
  url: string
}): LinearProjectInfo {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    status: raw.status?.name ?? raw.status?.type ?? '',
    startDate: raw.startDate,
    targetDate: raw.targetDate,
    health: raw.health,
    progress: raw.progress ?? 0,
    teamIds: (raw.teams?.nodes ?? []).map(team => team.id),
    teamKeys: (raw.teams?.nodes ?? []).map(team => team.key),
    url: raw.url,
  }
}

function mapTeam(raw: {
  id: string
  key: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  issueCount: number | null
  updatedAt: string
}): LinearTeamInfo {
  return {
    id: raw.id,
    key: raw.key,
    name: raw.name,
    description: raw.description ?? '',
    icon: raw.icon,
    color: raw.color,
    issueCount: raw.issueCount ?? 0,
    updatedAt: raw.updatedAt,
  }
}

interface RawIssueLabel {
  id: string
  name: string
  color: string | null
  description: string | null
  url: string
  parent: { id: string; name: string } | null
  team: { id: string; key: string; name: string } | null
}

interface RawUser {
  id: string
  name: string
  displayName: string
  email: string
  avatarUrl: string | null
  active: boolean
  timezone: string | null
  createdAt: string
  updatedAt: string
  url: string
}

function mapLabel(raw: RawIssueLabel): LinearLabelInfo {
  return {
    id: raw.id,
    name: raw.name,
    color: raw.color,
    description: raw.description ?? '',
    parentId: raw.parent?.id ?? null,
    parentName: raw.parent?.name ?? null,
    teamId: raw.team?.id ?? null,
    teamKey: raw.team?.key ?? null,
    teamName: raw.team?.name ?? null,
    url: raw.url,
  }
}

function mapUser(raw: RawUser): LinearUserInfo {
  return {
    id: raw.id,
    name: raw.name,
    displayName: raw.displayName,
    email: raw.email,
    avatarUrl: raw.avatarUrl,
    active: raw.active,
    timezone: raw.timezone,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    url: raw.url,
  }
}

function mapWorkflowState(raw: {
  id: string
  name: string
  type: string
  position: number | null
}): LinearWorkflowStateInfo {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    position: raw.position ?? 0,
  }
}

interface GraphqlResponse<T> {
  data?: T
  errors?: Array<{
    message: string
    extensions?: {
      code?: string
      http?: { status?: number }
    }
  }>
}

export class LinearClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly lookupImpl: LookupImpl | undefined

  constructor(options: LinearClientOptions = {}) {
    this.apiKey = options.apiKey ?? ''
    try {
      this.baseUrl = normalizeBaseUrl(options.baseUrl, 'https://api.linear.app/graphql')
    } catch (error) {
      if (error instanceof EndpointSecurityError) throw new LinearError(error.message, 400)
      throw error
    }
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.lookupImpl = options.lookupImpl
  }

  hasToken(): boolean {
    return this.apiKey.length > 0
  }

  private combinedSignal(signal?: AbortSignal): AbortSignal | undefined {
    if (this.timeoutMs <= 0) return signal
    const timeout = AbortSignal.timeout(this.timeoutMs)
    return signal ? AbortSignal.any([signal, timeout]) : timeout
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'dsh-tool-linear',
    }
    if (this.apiKey) headers.authorization = this.apiKey
    return headers
  }

  private async request<T>(query: string, variables: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    try {
      await assertSafeUrl(new URL(this.baseUrl), this.lookupImpl)
    } catch (error) {
      if (error instanceof EndpointSecurityError) throw new LinearError(error.message, 400)
      throw error
    }
    const response = await this.fetchImpl(this.baseUrl, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ query, variables }),
      signal: this.combinedSignal(signal),
    })

    let body: GraphqlResponse<T> | undefined
    try {
      body = await response.json() as GraphqlResponse<T>
    } catch {
      body = undefined
    }

    if (!response.ok) {
      const message = body?.errors?.[0]?.message ?? `Linear API HTTP error ${response.status}`
      throw new LinearError(message, response.status, body?.errors?.[0]?.extensions?.code)
    }
    if (!body) throw new LinearError('Linear API returned a non-JSON response', 502)
    if (body.errors?.length) {
      const first = body.errors[0]
      const status = first.extensions?.http?.status ?? (first.extensions?.code === 'AUTHENTICATION_ERROR' ? 401 : 400)
      throw new LinearError(first.message, status, first.extensions?.code)
    }
    if (!body.data) throw new LinearError('Linear API returned no data', 502)
    return body.data
  }

  async searchIssues(
    term: string,
    options: { teamId?: string; limit?: number; signal?: AbortSignal } = {},
  ): Promise<LinearIssueSummary[]> {
    const data = await this.request<{ searchIssues: { nodes: RawIssue[] } }>(
      `
        query SearchIssues($term: String!, $teamId: String, $first: Int) {
          searchIssues(term: $term, teamId: $teamId, first: $first) {
            nodes {
              ${ISSUE_FIELDS}
            }
          }
        }
      `,
      {
        term,
        teamId: options.teamId ?? null,
        first: clampLimit(options.limit ?? 20),
      },
      options.signal,
    )
    return (data.searchIssues?.nodes ?? []).map(mapIssue)
  }

  async listIssues(
    options: {
      teamId?: string
      projectId?: string
      cycleId?: string
      stateType?: string
      limit?: number
      signal?: AbortSignal
    } = {},
  ): Promise<LinearIssueSummary[]> {
    const filter: Record<string, unknown> = {}
    if (options.teamId) filter.team = { id: { eq: options.teamId } }
    if (options.projectId) filter.project = { id: { eq: options.projectId } }
    if (options.cycleId) filter.cycle = { id: { eq: options.cycleId } }
    if (options.stateType) filter.state = { type: { eq: options.stateType } }

    const data = await this.request<{ issues: { nodes: RawIssue[] } }>(
      `
        query ListIssues($first: Int, $filter: IssueFilter) {
          issues(first: $first, filter: $filter) {
            nodes {
              ${ISSUE_FIELDS}
            }
          }
        }
      `,
      {
        first: clampLimit(options.limit ?? 20),
        filter: Object.keys(filter).length > 0 ? filter : null,
      },
      options.signal,
    )
    return (data.issues?.nodes ?? []).map(mapIssue)
  }

  async getIssue(idOrIdentifier: string, signal?: AbortSignal): Promise<LinearIssueDetail> {
    try {
      const data = await this.request<{ issue: RawIssue | null }>(
        `
          query GetIssue($id: String!) {
            issue(id: $id) {
              ${ISSUE_FIELDS}
            }
          }
        `,
        { id: idOrIdentifier },
        signal,
      )
      if (!data.issue) throw new LinearError('Linear issue not found', 404, 'NOT_FOUND')
      return mapIssue(data.issue)
    } catch (error) {
      if (
        error instanceof LinearError &&
        (error.status === 404 || /not found/i.test(error.message)) &&
        /^[A-Z]+-\d+$/i.test(idOrIdentifier)
      ) {
        const results = await this.searchIssues(idOrIdentifier, { limit: 1, signal })
        const found = results.find(issue => issue.identifier.toLowerCase() === idOrIdentifier.toLowerCase())
        if (!found) throw new LinearError('Linear issue not found', 404, 'NOT_FOUND')
        return this.getIssue(found.id, signal)
      }
      throw error
    }
  }

  async createIssue(
    input: {
      teamId: string
      title: string
      description?: string
      priority?: number
      projectId?: string
      cycleId?: string
      assigneeId?: string
      labelIds?: string[]
      stateId?: string
      dueDate?: string
      signal?: AbortSignal
    },
  ): Promise<LinearIssueWriteResult> {
    try {
      const data = await this.request<{
        issueCreate: { success: boolean; issue: { id: string; identifier: string; url: string } | null }
      }>(
        `
          mutation IssueCreate($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue { id identifier url }
            }
          }
        `,
        {
          input: {
            teamId: input.teamId,
            title: input.title,
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.priority !== undefined ? { priority: input.priority } : {}),
            ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
            ...(input.cycleId !== undefined ? { cycleId: input.cycleId } : {}),
            ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
            ...(input.labelIds !== undefined ? { labelIds: input.labelIds } : {}),
            ...(input.stateId !== undefined ? { stateId: input.stateId } : {}),
            ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          },
        },
        input.signal,
      )
      if (!data.issueCreate.success || !data.issueCreate.issue) {
        return { created: false, reason: 'Linear did not confirm issue creation.' }
      }
      const issue = data.issueCreate.issue
      return { created: true, id: issue.id, identifier: issue.identifier, url: issue.url }
    } catch (error) {
      if (error instanceof LinearError && isInfrastructureError(error)) throw error
      return {
        created: false,
        reason: error instanceof LinearError ? error.message : 'Could not create the Linear issue.',
      }
    }
  }

  async updateIssue(
    id: string,
    input: {
      title?: string
      description?: string
      priority?: number
      projectId?: string
      cycleId?: string
      assigneeId?: string
      labelIds?: string[]
      stateId?: string
      dueDate?: string
      signal?: AbortSignal
    },
  ): Promise<LinearWriteResult> {
    try {
      const data = await this.request<{ issueUpdate: { success: boolean; issue: { id: string } | null } }>(
        `
          mutation IssueUpdate($id: ID!, $input: IssueUpdateInput!) {
            issueUpdate(id: $id, input: $input) {
              success
              issue { id }
            }
          }
        `,
        {
          id,
          input: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.priority !== undefined ? { priority: input.priority } : {}),
            ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
            ...(input.cycleId !== undefined ? { cycleId: input.cycleId } : {}),
            ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
            ...(input.labelIds !== undefined ? { labelIds: input.labelIds } : {}),
            ...(input.stateId !== undefined ? { stateId: input.stateId } : {}),
            ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          },
        },
        input.signal,
      )
      if (!data.issueUpdate.success || !data.issueUpdate.issue) {
        return { ok: false, id, reason: 'Linear did not confirm the issue update.' }
      }
      return { ok: true, id: data.issueUpdate.issue.id }
    } catch (error) {
      if (error instanceof LinearError && isInfrastructureError(error)) throw error
      return { ok: false, id, reason: error instanceof LinearError ? error.message : 'Could not update the Linear issue.' }
    }
  }

  async listIssueComments(id: string, options: { limit?: number; signal?: AbortSignal } = {}): Promise<{
    items: LinearCommentItem[]
  }> {
    try {
      const data = await this.request<{ issue: { comments: { nodes: Array<{
        id: string
        body: string | null
        user: { id: string; name: string; displayName: string } | null
        createdAt: string
        updatedAt: string
        url: string
      }> } } | null }>(
        `
          query IssueComments($id: String!, $first: Int) {
            issue(id: $id) {
              comments(first: $first) {
                nodes {
                  ${COMMENT_FIELDS}
                }
              }
            }
          }
        `,
        { id, first: clampLimit(options.limit ?? 20) },
        options.signal,
      )
      if (!data.issue) throw new LinearError('Linear issue not found', 404, 'NOT_FOUND')
      return { items: (data.issue.comments?.nodes ?? []).map(mapComment) }
    } catch (error) {
      if (
        error instanceof LinearError &&
        (error.status === 404 || /not found/i.test(error.message)) &&
        /^[A-Z]+-\d+$/i.test(id)
      ) {
        const results = await this.searchIssues(id, { limit: 1, signal: options.signal })
        const found = results.find(issue => issue.identifier.toLowerCase() === id.toLowerCase())
        if (!found) throw new LinearError('Linear issue not found', 404, 'NOT_FOUND')
        return this.listIssueComments(found.id, options)
      }
      throw error
    }
  }

  async addIssueComment(id: string, body: string, signal?: AbortSignal): Promise<LinearWriteResult> {
    try {
      const data = await this.request<{ commentCreate: { success: boolean; comment: { id: string } | null } }>(
        `
          mutation CommentCreate($input: CommentCreateInput!) {
            commentCreate(input: $input) {
              success
              comment { id }
            }
          }
        `,
        { input: { issueId: id, body } },
        signal,
      )
      if (!data.commentCreate.success || !data.commentCreate.comment) {
        return { ok: false, reason: 'Linear did not confirm the comment.' }
      }
      return { ok: true, id: data.commentCreate.comment.id }
    } catch (error) {
      if (error instanceof LinearError && isInfrastructureError(error)) throw error
      return { ok: false, reason: error instanceof LinearError ? error.message : 'Could not add the Linear comment.' }
    }
  }

  async listCycles(teamId: string, options: { limit?: number; signal?: AbortSignal } = {}): Promise<LinearCycleInfo[]> {
    const data = await this.request<{ team: { cycles: { nodes: Array<{
      id: string
      name: string
      number: number
      startsAt: string
      endsAt: string
      completedAt: string | null
      progress: number | null
    }> } } | null }>(
      `
        query TeamCycles($teamId: String!, $first: Int) {
          team(id: $teamId) {
            cycles(first: $first) {
              nodes {
                ${CYCLE_FIELDS}
              }
            }
          }
        }
      `,
      { teamId, first: clampLimit(options.limit ?? 20) },
      options.signal,
    )
    if (!data.team) throw new LinearError('Linear team not found', 404, 'NOT_FOUND')
    return (data.team.cycles?.nodes ?? []).map(mapCycle)
  }

  async getCycle(id: string, signal?: AbortSignal): Promise<LinearCycleInfo> {
    const data = await this.request<{ cycle: {
      id: string
      name: string
      number: number
      startsAt: string
      endsAt: string
      completedAt: string | null
      progress: number | null
    } | null }>(
      `
        query GetCycle($id: String!) {
          cycle(id: $id) {
            ${CYCLE_FIELDS}
          }
        }
      `,
      { id },
      signal,
    )
    if (!data.cycle) throw new LinearError('Linear cycle not found', 404, 'NOT_FOUND')
    return mapCycle(data.cycle)
  }

  async listProjects(
    options: { teamId?: string; limit?: number; signal?: AbortSignal } = {},
  ): Promise<LinearProjectInfo[]> {
    if (options.teamId) {
      const data = await this.request<{ team: { projects: { nodes: Array<{
        id: string
        name: string
        description: string | null
        status: { name: string; type: string } | null
        startDate: string | null
        targetDate: string | null
        health: string | null
        progress: number | null
        teams: { nodes: Array<{ id: string; key: string; name: string }> } | null
        url: string
      }> } } | null }>(
        `
          query TeamProjects($teamId: String!, $first: Int) {
            team(id: $teamId) {
              projects(first: $first) {
                nodes {
                  ${PROJECT_FIELDS}
                }
              }
            }
          }
        `,
        { teamId: options.teamId, first: clampLimit(options.limit ?? 20) },
        options.signal,
      )
      if (!data.team) throw new LinearError('Linear team not found', 404, 'NOT_FOUND')
      return (data.team.projects?.nodes ?? []).map(mapProject)
    }

    const data = await this.request<{ projects: { nodes: Array<{
      id: string
      name: string
      description: string | null
      status: { name: string; type: string } | null
      startDate: string | null
      targetDate: string | null
      health: string | null
      progress: number | null
      teams: { nodes: Array<{ id: string; key: string; name: string }> } | null
      url: string
    }> } }>(
      `
        query ListProjects($first: Int) {
          projects(first: $first) {
            nodes {
              ${PROJECT_FIELDS}
            }
          }
        }
      `,
      { first: clampLimit(options.limit ?? 20) },
      options.signal,
    )
    return (data.projects?.nodes ?? []).map(mapProject)
  }

  async getProject(id: string, signal?: AbortSignal): Promise<LinearProjectInfo> {
    const data = await this.request<{ project: {
      id: string
      name: string
      description: string | null
      status: { name: string; type: string } | null
      startDate: string | null
      targetDate: string | null
      health: string | null
      progress: number | null
      teams: { nodes: Array<{ id: string; key: string; name: string }> } | null
      url: string
    } | null }>(
      `
        query GetProject($id: String!) {
          project(id: $id) {
            ${PROJECT_FIELDS}
          }
        }
      `,
      { id },
      signal,
    )
    if (!data.project) throw new LinearError('Linear project not found', 404, 'NOT_FOUND')
    return mapProject(data.project)
  }

  async listTeams(options: { limit?: number; signal?: AbortSignal } = {}): Promise<LinearTeamInfo[]> {
    const data = await this.request<{ teams: { nodes: Array<{
      id: string
      key: string
      name: string
      description: string | null
      icon: string | null
      color: string | null
      issueCount: number | null
      updatedAt: string
    }> } }>(
      `
        query ListTeams($first: Int) {
          teams(first: $first) {
            nodes {
              ${TEAM_FIELDS}
            }
          }
        }
      `,
      { first: clampLimit(options.limit ?? 20) },
      options.signal,
    )
    return (data.teams?.nodes ?? []).map(mapTeam)
  }

  async getTeam(id: string, signal?: AbortSignal): Promise<LinearTeamInfo> {
    const data = await this.request<{ team: {
      id: string
      key: string
      name: string
      description: string | null
      icon: string | null
      color: string | null
      issueCount: number | null
      updatedAt: string
    } | null }>(
      `
        query GetTeam($id: String!) {
          team(id: $id) {
            ${TEAM_FIELDS}
          }
        }
      `,
      { id },
      signal,
    )
    if (!data.team) throw new LinearError('Linear team not found', 404, 'NOT_FOUND')
    return mapTeam(data.team)
  }

  async listLabels(
    options: { teamId?: string; limit?: number; signal?: AbortSignal } = {},
  ): Promise<LinearLabelInfo[]> {
    if (options.teamId) {
      const data = await this.request<{ team: { labels: { nodes: RawIssueLabel[] } } | null }>(
        `
          query TeamLabels($teamId: String!, $first: Int) {
            team(id: $teamId) {
              labels(first: $first) {
                nodes {
                  ${LABEL_FIELDS}
                }
              }
            }
          }
        `,
        { teamId: options.teamId, first: clampLimit(options.limit ?? 20) },
        options.signal,
      )
      if (!data.team) throw new LinearError('Linear team not found', 404, 'NOT_FOUND')
      return (data.team.labels?.nodes ?? []).map(mapLabel)
    }

    const data = await this.request<{ issueLabels: { nodes: RawIssueLabel[] } }>(
      `
        query ListLabels($first: Int) {
          issueLabels(first: $first) {
            nodes {
              ${LABEL_FIELDS}
            }
          }
        }
      `,
      { first: clampLimit(options.limit ?? 20) },
      options.signal,
    )
    return (data.issueLabels?.nodes ?? []).map(mapLabel)
  }

  async getLabel(id: string, signal?: AbortSignal): Promise<LinearLabelInfo> {
    const data = await this.request<{ issueLabel: RawIssueLabel | null }>(
      `
        query GetLabel($id: String!) {
          issueLabel(id: $id) {
            ${LABEL_FIELDS}
          }
        }
      `,
      { id },
      signal,
    )
    if (!data.issueLabel) throw new LinearError('Linear label not found', 404, 'NOT_FOUND')
    return mapLabel(data.issueLabel)
  }

  async listUsers(
    options: { query?: string; limit?: number; signal?: AbortSignal } = {},
  ): Promise<LinearUserInfo[]> {
    const data = await this.request<{ users: { nodes: RawUser[] } }>(
      `
        query ListUsers($first: Int) {
          users(first: $first) {
            nodes {
              ${USER_FIELDS}
            }
          }
        }
      `,
      { first: clampLimit(options.limit ?? 20) },
      options.signal,
    )
    const query = options.query?.trim().toLowerCase()
    const users = (data.users?.nodes ?? []).map(mapUser)
    if (!query) return users
    return users.filter(user =>
      user.name.toLowerCase().includes(query) ||
      user.displayName.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query),
    )
  }

  async getUser(id: string, signal?: AbortSignal): Promise<LinearUserInfo> {
    const data = await this.request<{ user: RawUser | null }>(
      `
        query GetUser($id: String!) {
          user(id: $id) {
            ${USER_FIELDS}
          }
        }
      `,
      { id },
      signal,
    )
    if (!data.user) throw new LinearError('Linear user not found', 404, 'NOT_FOUND')
    return mapUser(data.user)
  }

  async listWorkflowStates(
    teamId: string,
    options: { limit?: number; signal?: AbortSignal } = {},
  ): Promise<LinearWorkflowStateInfo[]> {
    const data = await this.request<{ team: { states: { nodes: Array<{
      id: string
      name: string
      type: string
      position: number | null
    }> } } | null }>(
      `
        query TeamWorkflowStates($teamId: String!, $first: Int) {
          team(id: $teamId) {
            states(first: $first) {
              nodes {
                ${WORKFLOW_STATE_FIELDS}
              }
            }
          }
        }
      `,
      { teamId, first: clampLimit(options.limit ?? 20) },
      options.signal,
    )
    if (!data.team) throw new LinearError('Linear team not found', 404, 'NOT_FOUND')
    return (data.team.states?.nodes ?? []).map(mapWorkflowState)
  }
}

function clampLimit(value: number): number {
  return Math.max(1, Math.min(value, 100))
}

function isInfrastructureError(error: LinearError): boolean {
  return error.status === 401 || error.status === 403 || error.status === 429 || error.status >= 500 || error.code === 'RATE_LIMITED'
}
