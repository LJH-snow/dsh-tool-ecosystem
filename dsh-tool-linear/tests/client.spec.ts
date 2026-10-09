import { describe, expect, it, vi } from 'vitest'
import { LinearClient, LinearError } from '../src/client.ts'

/** Deterministic DNS so tests never depend on real resolution. */
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 as const }]


function jsonGraphql(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

const issueNode = {
  id: 'issue-1',
  identifier: 'ABC-1',
  title: 'Fix checkout',
  description: 'The button does nothing.',
  priority: 2,
  priorityLabel: 'High',
  url: 'https://linear.app/acme/issue/ABC-1',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
  dueDate: null,
  team: { id: 'team-1', key: 'ABC', name: 'Acme' },
  state: { id: 'state-1', name: 'In Progress', type: 'started' },
  project: { id: 'project-1', name: 'Checkout' },
  cycle: { id: 'cycle-1', name: 'Cycle 5' },
  assignee: { id: 'user-1', name: 'Alice', displayName: 'Alice' },
  labels: { nodes: [{ id: 'label-1', name: 'bug' }] },
}

const labelNode = {
  id: 'label-1',
  name: 'bug',
  color: '#ff0000',
  description: 'Something is broken',
  url: 'https://linear.app/acme/label/label-1',
  parent: null,
  team: { id: 'team-1', key: 'ABC', name: 'Acme' },
}

const userNode = {
  id: 'user-1',
  name: 'Alice Smith',
  displayName: 'Alice',
  email: 'alice@example.com',
  avatarUrl: null,
  active: true,
  timezone: 'Asia/Shanghai',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-02T00:00:00Z',
  url: 'https://linear.app/acme/user/user-1',
}

const workflowStateNode = {
  id: 'state-1',
  name: 'In Progress',
  type: 'started',
  position: 2,
}

describe('LinearClient', () => {
  it('posts GraphQL with the API key and maps search results', async () => {
    const fetchImpl = vi.fn(async () => jsonGraphql({ data: { searchIssues: { nodes: [issueNode] } } }))
    const client = new LinearClient({ lookupImpl: publicLookup, apiKey: 'lin_api_test', fetchImpl })
    const items = await client.searchIssues('checkout', { teamId: 'team-1', limit: 10 })

    expect(items[0]).toMatchObject({
      identifier: 'ABC-1',
      title: 'Fix checkout',
      status: 'In Progress',
      stateType: 'started',
      teamKey: 'ABC',
      projectName: 'Checkout',
      assigneeName: 'Alice',
      labels: ['bug'],
    })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.linear.app/graphql')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ authorization: 'lin_api_test' })
    const body = JSON.parse(String(init.body))
    expect(body.variables).toEqual({ term: 'checkout', teamId: 'team-1', first: 10 })
    expect(body.query).toContain('searchIssues')
  })

  it('listIssues builds an IssueFilter and clamps the limit', async () => {
    const fetchImpl = vi.fn(async () => jsonGraphql({ data: { issues: { nodes: [issueNode] } } }))
    const client = new LinearClient({ lookupImpl: publicLookup, apiKey: 'lin_api_test', fetchImpl })
    await client.listIssues({
      teamId: 'team-1',
      projectId: 'project-1',
      cycleId: 'cycle-1',
      stateType: 'started',
      limit: 500,
    })
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1]?.body))
    expect(body.variables.first).toBe(100)
    expect(body.variables.filter).toEqual({
      team: { id: { eq: 'team-1' } },
      project: { id: { eq: 'project-1' } },
      cycle: { id: { eq: 'cycle-1' } },
      state: { type: { eq: 'started' } },
    })
  })

  it('getIssue maps detail and supports identifier lookup fallback', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonGraphql({ data: { issue: null } }))
      .mockResolvedValueOnce(jsonGraphql({ data: { searchIssues: { nodes: [issueNode] } } }))
      .mockResolvedValueOnce(jsonGraphql({ data: { issue: issueNode } }))
    const client = new LinearClient({ lookupImpl: publicLookup, apiKey: 'lin_api_test', fetchImpl })
    const issue = await client.getIssue('ABC-1')

    expect(issue).toMatchObject({ identifier: 'ABC-1', description: 'The button does nothing.' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(JSON.parse(String((fetchImpl.mock.calls[1] as [string, RequestInit])[1]?.body)).query).toContain('searchIssues')
  })

  it('getIssue throws 404 when a UUID is not found', async () => {
    const client = new LinearClient({ lookupImpl: publicLookup, apiKey: 'lin_api_test', fetchImpl: vi.fn(async () => jsonGraphql({ data: { issue: null } })) })
    await expect(client.getIssue('7f000001-...')).rejects.toMatchObject({ status: 404 })
  })

  it('createIssue sends IssueCreateInput and returns the created issue', async () => {
    const fetchImpl = vi.fn(async () => jsonGraphql({
      data: { issueCreate: { success: true, issue: { id: 'issue-2', identifier: 'ABC-2', url: 'https://linear.app/acme/issue/ABC-2' } } },
    }))
    const client = new LinearClient({ lookupImpl: publicLookup, apiKey: 'lin_api_test', fetchImpl })
    const result = await client.createIssue({
      teamId: 'team-1',
      title: 'New bug',
      description: 'Details',
      priority: 2,
      projectId: 'project-1',
      cycleId: 'cycle-1',
      assigneeId: 'user-1',
      labelIds: ['label-1'],
      stateId: 'state-1',
      dueDate: '2026-09-30',
    })

    const body = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1]?.body))
    expect(body.variables.input).toEqual({
      teamId: 'team-1',
      title: 'New bug',
      description: 'Details',
      priority: 2,
      projectId: 'project-1',
      cycleId: 'cycle-1',
      assigneeId: 'user-1',
      labelIds: ['label-1'],
      stateId: 'state-1',
      dueDate: '2026-09-30',
    })
    expect(result).toEqual({ created: true, id: 'issue-2', identifier: 'ABC-2', url: 'https://linear.app/acme/issue/ABC-2' })
  })

  it('maps GraphQL user errors to business failures and auth errors to infrastructure errors', async () => {
    const userError = new LinearClient({ lookupImpl: publicLookup, apiKey: 'lin_api_test', fetchImpl: vi.fn(async () => jsonGraphql({
      errors: [{ message: 'Team not found', extensions: { code: 'BAD_USER_INPUT' } }],
    })) })
    expect(await userError.createIssue({ teamId: 'missing', title: 'x' })).toMatchObject({
      created: false,
      reason: 'Team not found',
    })

    const authError = new LinearClient({ lookupImpl: publicLookup, apiKey: 'bad', fetchImpl: vi.fn(async () => jsonGraphql({
      errors: [{ message: 'Authentication required', extensions: { code: 'AUTHENTICATION_ERROR' } }],
    })) })
    await expect(authError.createIssue({ teamId: 'team-1', title: 'x' })).rejects.toThrow(LinearError)
  })

  it('updateIssue and addIssueComment send the expected mutations', async () => {
    const updateFetch = vi.fn(async () => jsonGraphql({ data: { issueUpdate: { success: true, issue: { id: 'issue-1' } } } }))
    const client = new LinearClient({ lookupImpl: publicLookup, apiKey: 'lin_api_test', fetchImpl: updateFetch })
    const update = await client.updateIssue('issue-1', { title: 'Renamed', stateId: 'state-2' })
    const updateBody = JSON.parse(String((updateFetch.mock.calls[0] as [string, RequestInit])[1]?.body))
    expect(updateBody.variables).toEqual({ id: 'issue-1', input: { title: 'Renamed', stateId: 'state-2' } })
    expect(update).toEqual({ ok: true, id: 'issue-1' })

    const commentFetch = vi.fn(async () => jsonGraphql({
      data: { commentCreate: { success: true, comment: { id: 'comment-1' } } },
    }))
    const commentClient = new LinearClient({ lookupImpl: publicLookup, apiKey: 'lin_api_test', fetchImpl: commentFetch })
    const comment = await commentClient.addIssueComment('issue-1', 'Looks good')
    const commentBody = JSON.parse(String((commentFetch.mock.calls[0] as [string, RequestInit])[1]?.body))
    expect(commentBody.variables.input).toEqual({ issueId: 'issue-1', body: 'Looks good' })
    expect(comment).toEqual({ ok: true, id: 'comment-1' })
  })

  it('listIssueComments maps author and body fields', async () => {
    const fetchImpl = vi.fn(async () => jsonGraphql({
      data: { issue: { comments: { nodes: [{
        id: 'comment-1',
        body: 'Please fix',
        user: { id: 'user-1', name: 'Alice', displayName: 'Alice' },
        createdAt: '2026-08-02T00:00:00Z',
        updatedAt: '2026-08-02T00:00:00Z',
        url: 'https://linear.app/acme/issue/ABC-1/comment/comment-1',
      }] } } },
    }))
    const client = new LinearClient({ lookupImpl: publicLookup, apiKey: 'lin_api_test', fetchImpl })
    const result = await client.listIssueComments('issue-1')
    expect(result.items[0]).toMatchObject({ author: 'Alice', body: 'Please fix' })
  })

  it('listIssueComments resolves an identifier fallback', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonGraphql({ data: { issue: null } }))
      .mockResolvedValueOnce(jsonGraphql({ data: { searchIssues: { nodes: [issueNode] } } }))
      .mockResolvedValueOnce(jsonGraphql({
        data: { issue: { comments: { nodes: [{
          id: 'comment-1',
          body: 'Please fix',
          user: { id: 'user-1', name: 'Alice', displayName: 'Alice' },
          createdAt: '2026-08-02T00:00:00Z',
          updatedAt: '2026-08-02T00:00:00Z',
          url: 'https://linear.app/acme/issue/ABC-1/comment/comment-1',
        }] } } },
      }))
    const client = new LinearClient({ lookupImpl: publicLookup, apiKey: 'lin_api_test', fetchImpl })
    const result = await client.listIssueComments('ABC-1', { limit: 5 })

    expect(result.items[0]).toMatchObject({ author: 'Alice', body: 'Please fix' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    const body = JSON.parse(String((fetchImpl.mock.calls[2] as [string, RequestInit])[1]?.body))
    expect(body.variables).toEqual({ id: 'issue-1', first: 5 })
  })

  it('maps cycles, projects, and teams', async () => {
    const cycleFetch = vi.fn(async () => jsonGraphql({
      data: { team: { cycles: { nodes: [{
        id: 'cycle-1', name: 'Cycle 5', number: 5,
        startsAt: '2026-08-01T00:00:00Z', endsAt: '2026-08-14T00:00:00Z',
        completedAt: null, progress: 0.4,
      }] } } },
    }))
    const cycles = new LinearClient({ lookupImpl: publicLookup, apiKey: 't', fetchImpl: cycleFetch })
    expect(await cycles.listCycles('team-1', { limit: 3 })).toMatchObject([
      { id: 'cycle-1', number: 5, progress: 0.4 },
    ])

    const projectFetch = vi.fn(async () => jsonGraphql({
      data: { project: {
        id: 'project-1', name: 'Checkout', description: 'd', status: { name: 'In Progress', type: 'started' },
        startDate: '2026-09-01', targetDate: '2026-10-01', health: 'onTrack', progress: 0.5,
        teams: { nodes: [{ id: 'team-1', key: 'ABC', name: 'Acme' }] },
        url: 'https://linear.app/acme/project/project-1',
      } },
    }))
    const projects = new LinearClient({ lookupImpl: publicLookup, apiKey: 't', fetchImpl: projectFetch })
    expect(await projects.getProject('project-1')).toMatchObject({
      id: 'project-1',
      status: 'In Progress',
      teamKeys: ['ABC'],
    })

    const teamFetch = vi.fn(async () => jsonGraphql({
      data: { team: {
        id: 'team-1', key: 'ABC', name: 'Acme', description: 'Product', icon: null, color: 'blue',
        issueCount: 42, updatedAt: '2026-08-02T00:00:00Z',
      } },
    }))
    const teams = new LinearClient({ lookupImpl: publicLookup, apiKey: 't', fetchImpl: teamFetch })
    expect(await teams.getTeam('team-1')).toMatchObject({ key: 'ABC', issueCount: 42 })
  })

  it('lists team labels and workspace labels', async () => {
    const teamFetch = vi.fn(async () => jsonGraphql({ data: { team: { labels: { nodes: [labelNode] } } } }))
    const teamClient = new LinearClient({ lookupImpl: publicLookup, apiKey: 't', fetchImpl: teamFetch })
    expect(await teamClient.listLabels({ teamId: 'team-1', limit: 50 })).toMatchObject([
      { id: 'label-1', name: 'bug', teamKey: 'ABC' },
    ])
    const teamBody = JSON.parse(String((teamFetch.mock.calls[0] as [string, RequestInit])[1]?.body))
    expect(teamBody.variables).toEqual({ teamId: 'team-1', first: 50 })
    expect(teamBody.query).toContain('team(id: $teamId)')

    const workspaceFetch = vi.fn(async () => jsonGraphql({ data: { issueLabels: { nodes: [labelNode] } } }))
    const workspaceClient = new LinearClient({ lookupImpl: publicLookup, apiKey: 't', fetchImpl: workspaceFetch })
    expect(await workspaceClient.listLabels()).toMatchObject([{ id: 'label-1', name: 'bug' }])
    const workspaceBody = JSON.parse(String((workspaceFetch.mock.calls[0] as [string, RequestInit])[1]?.body))
    expect(workspaceBody.query).toContain('issueLabels')
  })

  it('getLabel maps details and throws 404 when missing', async () => {
    const fetchImpl = vi.fn(async () => jsonGraphql({ data: { issueLabel: labelNode } }))
    const client = new LinearClient({ lookupImpl: publicLookup, apiKey: 't', fetchImpl })
    expect(await client.getLabel('label-1')).toMatchObject({
      id: 'label-1',
      name: 'bug',
      teamKey: 'ABC',
    })
    expect(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1]?.body)).toContain('issueLabel(id: $id)')

    const missing = new LinearClient({ lookupImpl: publicLookup, apiKey: 't', fetchImpl: vi.fn(async () => jsonGraphql({ data: { issueLabel: null } })) })
    await expect(missing.getLabel('missing-label')).rejects.toMatchObject({ status: 404 })
  })

  it('listUsers filters by name, display name, or email', async () => {
    const bobNode = {
      ...userNode,
      id: 'user-2',
      name: 'Bob Brown',
      displayName: 'Support Bot',
      email: 'bob@example.com',
    }
    const fetchImpl = vi.fn(async () => jsonGraphql({ data: { users: { nodes: [userNode, bobNode] } } }))
    const client = new LinearClient({ lookupImpl: publicLookup, apiKey: 't', fetchImpl })

    expect(await client.listUsers({ query: 'alice' })).toMatchObject([{ id: 'user-1', email: 'alice@example.com' }])
    expect(await client.listUsers({ query: 'support' })).toMatchObject([{ id: 'user-2', email: 'bob@example.com' }])
    expect(await client.listUsers({ query: 'bob@example.com' })).toMatchObject([{ id: 'user-2' }])

    const body = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1]?.body))
    expect(body.variables.first).toBe(20)
    expect(body.query).toContain('users(first: $first)')
  })

  it('getUser maps details and throws 404 when missing', async () => {
    const fetchImpl = vi.fn(async () => jsonGraphql({ data: { user: userNode } }))
    const client = new LinearClient({ lookupImpl: publicLookup, apiKey: 't', fetchImpl })
    expect(await client.getUser('user-1')).toMatchObject({
      id: 'user-1',
      displayName: 'Alice',
      active: true,
    })
    expect(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1]?.body)).toContain('user(id: $id)')

    const missing = new LinearClient({ lookupImpl: publicLookup, apiKey: 't', fetchImpl: vi.fn(async () => jsonGraphql({ data: { user: null } })) })
    await expect(missing.getUser('missing-user')).rejects.toMatchObject({ status: 404 })
  })

  it('listWorkflowStates maps team states and clamps the limit', async () => {
    const fetchImpl = vi.fn(async () => jsonGraphql({ data: { team: { states: { nodes: [workflowStateNode] } } } }))
    const client = new LinearClient({ lookupImpl: publicLookup, apiKey: 't', fetchImpl })
    expect(await client.listWorkflowStates('team-1', { limit: 500 })).toMatchObject([
      { id: 'state-1', name: 'In Progress', type: 'started', position: 2 },
    ])
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1]?.body))
    expect(body.variables).toEqual({ teamId: 'team-1', first: 100 })
    expect(body.query).toContain('states(first: $first)')
  })

  it('strips a trailing slash from a baseUrl override and checks hasToken', async () => {
    const fetchImpl = vi.fn(async () => jsonGraphql({ data: { teams: { nodes: [] } } }))
    const client = new LinearClient({ lookupImpl: publicLookup, baseUrl: 'https://linear.example.com/graphql/', fetchImpl })
    expect(client.hasToken()).toBe(false)
    await client.listTeams()
    expect(fetchImpl.mock.calls[0][0]).toBe('https://linear.example.com/graphql')
    expect(new LinearClient({ lookupImpl: publicLookup, apiKey: 'x' }).hasToken()).toBe(true)
  })
})

describe('Linear endpoint security', () => {
  const valid = { apiKey: 'lin_api_test' }

  it('rejects invalid base URLs without exposing their contents', () => {
    for (const baseUrl of [
      'api.linear.app/graphql',
      'ftp://api.linear.app/graphql',
      'https://user:secretapi.linear.app/graphql',
      'https://api.linear.app/graphql?token=secret',
      'https://api.linear.app/graphql#fragment',
    ]) {
      let error: unknown
      try { new LinearClient({ ...valid, baseUrl }) } catch (thrown) { error = thrown }
      expect(error).toBeInstanceOf(LinearError)
      expect(String(error)).not.toContain('secret')
    }
  })

  it('rejects literal local, private, and reserved addresses before fetch', async () => {
    for (const baseUrl of [
      'http://localhost',
      'http://service.localhost',
      'http://service.local',
      'http://127.0.0.1',
      'http://169.254.169.254',
      'http://10.0.0.1',
      'http://192.168.1.1',
      'http://192.0.2.1',
      'http://198.18.0.1',
      'http://224.0.0.1',
      'http://192.175.48.1',
      'http://[::1]',
      'http://[fc00::1]',
      'http://[fe80::1]',
      'http://[fec0::1]',
      'http://[2001:db8::1]',
      'http://[2001:3::1]',
      'http://[2001:4:112::1]',
      'http://[2001:30::1]',
      'http://[5f00::1]',
      'http://[100:0:0:1::1]',
      'http://[2620:4f:8000::1]',
      'http://[64:ff9b::7f00:1]',
      'http://[ff02::1]',
    ]) {
      const fetchImpl = vi.fn()
      await expect(new LinearClient({ ...valid, baseUrl, fetchImpl }).listIssues()).rejects.toMatchObject({ name: 'LinearError' })
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('fails closed on blocked, failed, empty, or inconsistent DNS results', async () => {
    for (const lookupImpl of [
      async () => [{ address: '192.168.1.10', family: 4 as const }],
      async () => [{ address: '93.184.216.34', family: 4 as const }, { address: '169.254.169.254', family: 4 as const }],
      async () => { throw new Error('dns failure') },
      async () => [],
      async () => [{ address: '2001:db8::1', family: 4 as const }],
    ]) {
      const fetchImpl = vi.fn()
      await expect(new LinearClient({ ...valid, baseUrl: 'https://linear.example.test', fetchImpl, lookupImpl }).listIssues()).rejects.toMatchObject({ name: 'LinearError' })
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('allows a public endpoint that resolves to a public address', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    await new LinearClient({ ...valid, baseUrl: 'https://linear.example.test', fetchImpl, lookupImpl: publicLookup }).listIssues().catch(() => undefined)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
