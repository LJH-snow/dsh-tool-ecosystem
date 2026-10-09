import { describe, expect, it, vi } from 'vitest'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { GithubClient } from '../src/client.ts'
import { createTools } from '../src/index.ts'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function exec(): ToolRunContext {
  return { signal: new AbortController().signal } as unknown as ToolRunContext
}

const tools = () => Object.fromEntries(createTools(new GithubClient({ fetchImpl: globalThis.fetch })).map(t => [t.name, t]))

describe('tool definitions', () => {
  it('registers the planned tools', () => {
    expect(Object.keys(tools()).sort()).toEqual([
      'github_add_collaborator',
      'github_add_issue_assignees',
      'github_add_team_repo',
      'github_cancel_workflow_run',
      'github_comment_issue',
      'github_create_branch',
      'github_create_gist',
      'github_create_issue',
      'github_create_pr_draft',
      'github_create_release',
      'github_create_repo_webhook',
      'github_create_repository',
      'github_delete_artifact',
      'github_delete_branch_protection',
      'github_delete_environment',
      'github_delete_release_asset',
      'github_delete_repo_secret',
      'github_delete_repo_variable',
      'github_delete_repo_webhook',
      'github_dispatch_workflow',
      'github_get_artifact',
      'github_get_branch_protection',
      'github_get_collaborator_permission',
      'github_get_environment',
      'github_get_file',
      'github_get_issue',
      'github_get_org',
      'github_get_pull_request',
      'github_get_readme',
      'github_get_release_asset',
      'github_get_repo',
      'github_get_repo_webhook',
      'github_get_team',
      'github_get_user',
      'github_get_workflow',
      'github_get_workflow_run',
      'github_get_workflow_run_logs',
      'github_list_branches',
      'github_list_collaborators',
      'github_list_commits',
      'github_list_environments',
      'github_list_gists',
      'github_list_issue_comments',
      'github_list_issues',
      'github_list_milestones',
      'github_list_org_members',
      'github_list_org_repos',
      'github_list_org_teams',
      'github_list_pr_comments',
      'github_list_prs',
      'github_list_pull_request_reviews',
      'github_list_release_assets',
      'github_list_releases',
      'github_list_repo_artifacts',
      'github_list_repo_secrets',
      'github_list_repo_variables',
      'github_list_repo_webhooks',
      'github_list_run_artifacts',
      'github_list_tags',
      'github_list_team_members',
      'github_list_team_repos',
      'github_list_workflow_jobs',
      'github_list_workflow_runs',
      'github_list_workflows',
      'github_merge_pr',
      'github_ping_repo_webhook',
      'github_remove_collaborator',
      'github_remove_team_membership',
      'github_remove_team_repo',
      'github_reply_pr_comment',
      'github_request_pr_reviewers',
      'github_rerun_workflow_run',
      'github_search_code',
      'github_search_repos',
      'github_set_branch_protection',
      'github_set_issue_labels',
      'github_set_issue_milestone',
      'github_set_repo_secret',
      'github_set_repo_topics',
      'github_set_repo_variable',
      'github_star_repo',
      'github_submit_pr_review',
      'github_unstar_repo',
      'github_update_collaborator_permission',
      'github_update_environment',
      'github_update_issue',
      'github_update_release_asset',
      'github_update_repo_webhook',
      'github_update_team_membership',
      'github_write_file',
    ])
  })

  it('github_get_repo returns found:false on 404', async () => {
    const client = new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    const tool = createTools(client).find(t => t.name === 'github_get_repo')!
    const result = await tool.execute({ owner: 'nope', repo: 'missing' }, exec())
    expect(result).toEqual({ found: false })
  })

  it('github_get_repo render is a pure function of the value', async () => {
    const client = new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    const tool = createTools(client).find(t => t.name === 'github_get_repo')!
    const blocks = await (tool.output as { render: (a: unknown, v: any) => unknown }).render({}, { found: true, owner: 'a', name: 'b', stars: 3, language: 'TS', license: 'MIT' })
    expect(JSON.stringify(blocks)).toContain('a/b')
    expect(JSON.stringify(blocks)).toContain('stars: 3')
  })

  it('github_search_code returns a clear unauthenticated value without a token', async () => {
    const client = new GithubClient({ fetchImpl: vi.fn() })
    const tool = createTools(client).find(t => t.name === 'github_search_code')!
    const result = await tool.execute({ query: 'defineTool' }, exec())
    expect(result).toEqual({ authenticated: false, total: 0, items: [] })
  })

  it('github_search_code renders the token hint when unauthenticated', async () => {
    const client = new GithubClient({ fetchImpl: vi.fn() })
    const tool = createTools(client).find(t => t.name === 'github_search_code')!
    const blocks = await (tool.output as { render: (a: unknown, v: any) => unknown }).render({}, { authenticated: false, total: 0, items: [] })
    expect(JSON.stringify(blocks)).toContain('token')
  })

  it('github_create_pr_draft maps 422 to created:false', async () => {
    const client = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(422, {})) })
    const tool = createTools(client).find(t => t.name === 'github_create_pr_draft')!
    const result = await tool.execute({ owner: 'a', repo: 'b', title: 'x', head: 'feat/x', base: 'main' }, exec())
    expect(result).toMatchObject({ created: false })
  })

  it('github_list_issues clamps limit to 20 and maps items', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { number: 1, title: 'T', state: 'open', labels: [], created_at: '2026-01-01T00:00:00Z', user: { login: 'u' }, html_url: 'https://x' },
    ]))
    const client = new GithubClient({ fetchImpl })
    const tool = createTools(client).find(t => t.name === 'github_list_issues')!
    const result = await tool.execute({ owner: 'a', repo: 'b', limit: 99 }, exec())
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('per_page=20')
    expect(result).toMatchObject({ items: [{ number: 1, title: 'T', author: 'u' }] })
  })
})

describe('tool presentation (pure render intents)', () => {
  const defs = () => Object.fromEntries(createTools(new GithubClient()).map(t => [t.name, t]))

  it('github_get_repo pending and result cards', () => {
    const t = defs()['github_get_repo'] as any
    const args = { owner: 'a', repo: 'b' }
    expect(t.presentCall(args)).toMatchObject({ card: 'generic', kind: 'read', title: 'Fetch repo a/b' })
    const res = t.presentResult(args, { found: true, owner: 'a', name: 'b', stars: 3, language: 'TS' })
    expect(res).toMatchObject({ card: 'generic', title: 'a/b' })
    expect(t.presentResult(args, { found: false })).toMatchObject({ title: 'Repo not found' })
  })

  it('github_search_repos pending and result cards', () => {
    const t = defs()['github_search_repos'] as any
    const args = { query: 'agent' }
    expect(t.presentCall(args)).toMatchObject({ card: 'generic', kind: 'search', title: 'Search repos: agent' })
    const res = t.presentResult(args, { total: 42, items: [{ fullName: 'a/b', stars: 3 }] })
    expect(res).toMatchObject({ card: 'generic', title: '42 repos for "agent"' })
    expect(t.presentResult({ query: 'x' }, { items: [] })).toMatchObject({ title: 'No repos for "x"' })
  })

  it('github_search_code emits a search paths card when authenticated', () => {
    const t = defs()['github_search_code'] as any
    const args = { query: 'defineTool' }
    expect(t.presentCall(args)).toMatchObject({ kind: 'search' })
    const res = t.presentResult(args, { authenticated: true, total: 2, items: [{ path: 'a.ts', repository: 'o/r' }] })
    expect(res).toMatchObject({ card: 'search', shape: 'paths', paths: ['o/r: a.ts'], total: 2 })
    expect(t.presentResult(args, { authenticated: false, items: [] })).toMatchObject({ title: 'Code search needs a token' })
  })

  it('github_create_pr_draft pending and result cards', () => {
    const t = defs()['github_create_pr_draft'] as any
    const args = { owner: 'a', repo: 'b', title: 'Fix x', head: 'feat/x', base: 'main' }
    expect(t.presentCall(args)).toMatchObject({ card: 'generic', kind: 'edit' })
    expect(t.presentResult(args, { created: true, number: 9, url: 'https://x' })).toMatchObject({ title: 'Draft PR #9' })
    expect(t.presentResult(args, { created: false, reason: 'nope' })).toMatchObject({ title: 'Draft PR failed' })
  })
})

describe('extended tools (stage 5)', () => {
  it('registers the full tool set', () => {
    const names = Object.keys(Object.fromEntries(createTools(new GithubClient()).map(t => [t.name, t]))).sort()
    expect(names).toEqual([
      'github_add_collaborator',
      'github_add_issue_assignees',
      'github_add_team_repo',
      'github_cancel_workflow_run',
      'github_comment_issue',
      'github_create_branch',
      'github_create_gist',
      'github_create_issue',
      'github_create_pr_draft',
      'github_create_release',
      'github_create_repo_webhook',
      'github_create_repository',
      'github_delete_artifact',
      'github_delete_branch_protection',
      'github_delete_environment',
      'github_delete_release_asset',
      'github_delete_repo_secret',
      'github_delete_repo_variable',
      'github_delete_repo_webhook',
      'github_dispatch_workflow',
      'github_get_artifact',
      'github_get_branch_protection',
      'github_get_collaborator_permission',
      'github_get_environment',
      'github_get_file',
      'github_get_issue',
      'github_get_org',
      'github_get_pull_request',
      'github_get_readme',
      'github_get_release_asset',
      'github_get_repo',
      'github_get_repo_webhook',
      'github_get_team',
      'github_get_user',
      'github_get_workflow',
      'github_get_workflow_run',
      'github_get_workflow_run_logs',
      'github_list_branches',
      'github_list_collaborators',
      'github_list_commits',
      'github_list_environments',
      'github_list_gists',
      'github_list_issue_comments',
      'github_list_issues',
      'github_list_milestones',
      'github_list_org_members',
      'github_list_org_repos',
      'github_list_org_teams',
      'github_list_pr_comments',
      'github_list_prs',
      'github_list_pull_request_reviews',
      'github_list_release_assets',
      'github_list_releases',
      'github_list_repo_artifacts',
      'github_list_repo_secrets',
      'github_list_repo_variables',
      'github_list_repo_webhooks',
      'github_list_run_artifacts',
      'github_list_tags',
      'github_list_team_members',
      'github_list_team_repos',
      'github_list_workflow_jobs',
      'github_list_workflow_runs',
      'github_list_workflows',
      'github_merge_pr',
      'github_ping_repo_webhook',
      'github_remove_collaborator',
      'github_remove_team_membership',
      'github_remove_team_repo',
      'github_reply_pr_comment',
      'github_request_pr_reviewers',
      'github_rerun_workflow_run',
      'github_search_code',
      'github_search_repos',
      'github_set_branch_protection',
      'github_set_issue_labels',
      'github_set_issue_milestone',
      'github_set_repo_secret',
      'github_set_repo_topics',
      'github_set_repo_variable',
      'github_star_repo',
      'github_submit_pr_review',
      'github_unstar_repo',
      'github_update_collaborator_permission',
      'github_update_environment',
      'github_update_issue',
      'github_update_release_asset',
      'github_update_repo_webhook',
      'github_update_team_membership',
      'github_write_file',
    ])
  })

  it('github_get_file returns found:false on 404 and decodes base64', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, {}))
    const client = new GithubClient({ fetchImpl })
    const tool = createTools(client).find(t => t.name === 'github_get_file')!
    const missing = await tool.execute({ owner: 'a', repo: 'b', path: 'nope.txt' }, exec())
    expect(missing).toEqual({ found: false })
  })

  it('github_get_file decodes base64 content', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      name: 'hello.txt', path: 'hello.txt', size: 5, content: Buffer.from('hello').toString('base64'), encoding: 'base64', html_url: 'https://x',
    }))
    const client = new GithubClient({ fetchImpl })
    const tool = createTools(client).find(t => t.name === 'github_get_file')!
    const result = await tool.execute({ owner: 'a', repo: 'b', path: 'hello.txt' }, exec())
    expect(result).toMatchObject({ found: true, content: 'hello', size: 5 })
  })

  it('github_list_commits clamps limit to 30', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, []))
    const client = new GithubClient({ fetchImpl })
    const tool = createTools(client).find(t => t.name === 'github_list_commits')!
    await tool.execute({ owner: 'a', repo: 'b', limit: 99 }, exec())
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('per_page=30')
  })

  it('github_list_prs presentCall uses search kind', () => {
    const t = createTools(new GithubClient()).find(t => t.name === 'github_list_prs') as any
    expect(t.presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ card: 'generic', kind: 'search' })
  })
})

describe('write tools (stage 6)', () => {
  it('write tools return a clear business value without a token', async () => {
    const defs = Object.fromEntries(createTools(new GithubClient({ fetchImpl: vi.fn() })).map(t => [t.name, t]))
    const create = await defs['github_create_issue'].execute({ owner: 'a', repo: 'b', title: 'x' }, exec())
    expect(create).toMatchObject({ ok: false })
    expect(create.reason).toContain('token')

    const comment = await defs['github_comment_issue'].execute({ owner: 'a', repo: 'b', issueNumber: 1, body: 'hi' }, exec())
    expect(comment).toMatchObject({ ok: false })

    const update = await defs['github_update_issue'].execute({ owner: 'a', repo: 'b', issueNumber: 1, state: 'closed' }, exec())
    expect(update).toMatchObject({ ok: false })
  })

  it('write tools proceed when a token is configured', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { number: 3, html_url: 'https://github.com/a/b/issues/3' }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const defs = Object.fromEntries(createTools(client).map(t => [t.name, t]))
    const result = await defs['github_create_issue'].execute({ owner: 'a', repo: 'b', title: 'x' }, exec())
    expect(result).toEqual({ ok: true, number: 3, url: 'https://github.com/a/b/issues/3' })
  })

  it('github_create_issue presentCall uses edit kind and shows the title', () => {
    const t = createTools(new GithubClient()).find(t => t.name === 'github_create_issue') as any
    const call = t.presentCall({ owner: 'a', repo: 'b', title: 'Fix bug' })
    expect(call).toMatchObject({ card: 'generic', kind: 'edit', title: 'Create issue: Fix bug' })
  })

  it('github_update_issue presentCall reflects the target state', () => {
    const t = createTools(new GithubClient()).find(t => t.name === 'github_update_issue') as any
    expect(t.presentCall({ owner: 'a', repo: 'b', issueNumber: 5, state: 'closed' })).toMatchObject({ title: 'Close issue #5' })
    expect(t.presentCall({ owner: 'a', repo: 'b', issueNumber: 5, state: 'open' })).toMatchObject({ title: 'Open issue #5' })
  })
})

describe('stage 7 tools', () => {
  it('github_merge_pr requires a token', async () => {
    const defs = Object.fromEntries(createTools(new GithubClient({ fetchImpl: vi.fn() })).map(t => [t.name, t]))
    const result = await defs['github_merge_pr'].execute({ owner: 'a', repo: 'b', prNumber: 5 }, exec())
    expect(result).toMatchObject({ ok: false, number: 5 })
    expect(result.reason).toContain('token')
  })

  it('github_merge_pr merges with a token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { merged: true, html_url: 'https://github.com/a/b/pull/5' }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const defs = Object.fromEntries(createTools(client).map(t => [t.name, t]))
    const result = await defs['github_merge_pr'].execute({ owner: 'a', repo: 'b', prNumber: 5, mergeMethod: 'squash' }, exec())
    expect(result).toEqual({ ok: true, number: 5, url: 'https://github.com/a/b/pull/5' })
  })

  it('read-only stage 7 tools work without a token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, []))
    const client = new GithubClient({ fetchImpl })
    const defs = Object.fromEntries(createTools(client).map(t => [t.name, t]))
    const releases = await defs['github_list_releases'].execute({ owner: 'a', repo: 'b' }, exec())
    expect(releases).toEqual({ items: [] })
    const branches = await defs['github_list_branches'].execute({ owner: 'a', repo: 'b' }, exec())
    expect(branches).toEqual({ items: [] })
  })

  it('presentCall titles for stage 7 tools', () => {
    const defs = Object.fromEntries(createTools(new GithubClient()).map(t => [t.name, t])) as any
    expect(defs['github_merge_pr'].presentCall({ owner: 'a', repo: 'b', prNumber: 5 })).toMatchObject({ title: 'Merge PR #5', kind: 'edit' })
    expect(defs['github_list_releases'].presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ kind: 'search' })
    expect(defs['github_list_branches'].presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ kind: 'search' })
  })
})

describe('stage 9 tools', () => {
  it('write tools require a token', async () => {
    const defs = Object.fromEntries(createTools(new GithubClient({ fetchImpl: vi.fn() })).map(t => [t.name, t]))
    const branch = await defs['github_create_branch'].execute({ owner: 'a', repo: 'b', branch: 'feat/x' }, exec())
    expect(branch).toMatchObject({ ok: false })
    expect(branch.reason).toContain('token')
    const write = await defs['github_write_file'].execute({ owner: 'a', repo: 'b', path: 'x.md', content: 'y', message: 'm' }, exec())
    expect(write).toMatchObject({ ok: false })
    expect(write.reason).toContain('token')
  })

  it('read tools work without a token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      login: 'u', name: null, bio: null, followers: 0, following: 0, public_repos: 0, location: null, blog: null, html_url: 'https://x',
    }))
    const client = new GithubClient({ fetchImpl })
    const defs = Object.fromEntries(createTools(client).map(t => [t.name, t]))
    const user = await defs['github_get_user'].execute({ username: 'u' }, exec())
    expect(user).toMatchObject({ found: true, login: 'u' })
  })

  it('github_get_user returns found:false on 404', async () => {
    const client = new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    const tool = createTools(client).find(t => t.name === 'github_get_user')!
    const result = await tool.execute({ username: 'nobody' }, exec())
    expect(result).toEqual({ found: false })
  })

  it('github_write_file passes through to the client with a token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { commit: { sha: 'abc123' } }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const tool = createTools(client).find(t => t.name === 'github_write_file')!
    const result = await tool.execute({ owner: 'a', repo: 'b', path: 'x.md', content: 'y', message: 'm' }, exec())
    expect(result).toEqual({ ok: true, path: 'x.md', commitSha: 'abc123' })
  })

  it('presentCall for stage 9 tools', () => {
    const defs = Object.fromEntries(createTools(new GithubClient()).map(t => [t.name, t])) as any
    expect(defs['github_get_user'].presentCall({ username: 'u' })).toMatchObject({ kind: 'read' })
    expect(defs['github_list_workflow_runs'].presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ kind: 'search' })
    expect(defs['github_create_branch'].presentCall({ owner: 'a', repo: 'b', branch: 'feat/x' })).toMatchObject({ kind: 'edit' })
    expect(defs['github_write_file'].presentCall({ owner: 'a', repo: 'b', path: 'x.md', content: '', message: '' })).toMatchObject({ kind: 'edit' })
  })
})

describe('stage 10 tools', () => {
  it('write tools require a token', async () => {
    const defs = Object.fromEntries(createTools(new GithubClient({ fetchImpl: vi.fn() })).map(t => [t.name, t]))
    for (const name of ['github_star_repo', 'github_unstar_repo', 'github_create_release']) {
      const args = name === 'github_create_release'
        ? { owner: 'a', repo: 'b', tagName: 'v1' }
        : { owner: 'a', repo: 'b' }
      const result = await defs[name].execute(args, exec())
      expect(result.ok).toBe(false)
      expect(result.reason).toContain('token')
    }
  })

  it('read-only stage 10 tools work without a token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, []))
    const client = new GithubClient({ fetchImpl })
    const defs = Object.fromEntries(createTools(client).map(t => [t.name, t]))
    const tags = await defs['github_list_tags'].execute({ owner: 'a', repo: 'b' }, exec())
    expect(tags).toEqual({ items: [] })
  })

  it('github_get_readme returns found:false on 404', async () => {
    const client = new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    const tool = createTools(client).find(t => t.name === 'github_get_readme')!
    const result = await tool.execute({ owner: 'a', repo: 'b' }, exec())
    expect(result).toEqual({ found: false })
  })

  it('github_create_release passes through with a token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 1, html_url: 'https://x' }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const tool = createTools(client).find(t => t.name === 'github_create_release')!
    const result = await tool.execute({ owner: 'a', repo: 'b', tagName: 'v1.0.0' }, exec())
    expect(result).toEqual({ ok: true, id: 1, url: 'https://x' })
  })

  it('presentCall for stage 10 tools', () => {
    const defs = Object.fromEntries(createTools(new GithubClient()).map(t => [t.name, t])) as any
    expect(defs['github_get_readme'].presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ kind: 'read' })
    expect(defs['github_list_tags'].presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ kind: 'search' })
    expect(defs['github_star_repo'].presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ kind: 'edit' })
    expect(defs['github_unstar_repo'].presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ kind: 'edit' })
    expect(defs['github_create_release'].presentCall({ owner: 'a', repo: 'b', tagName: 'v1' })).toMatchObject({ kind: 'edit' })
  })
})

describe('stage 11 tools', () => {
  it('read-only new tools work without a token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { total_count: 0, workflows: [] }))
    const first = new GithubClient({ fetchImpl })
    const defs = Object.fromEntries(createTools(first).map(t => [t.name, t]))
    expect(await defs['github_list_workflows'].execute({ owner: 'a', repo: 'b' }, exec())).toEqual({ total: 0, items: [] })

    const reviewFetch = vi.fn(async () => jsonResponse(200, []))
    const second = new GithubClient({ fetchImpl: reviewFetch })
    const reviewDefs = Object.fromEntries(createTools(second).map(t => [t.name, t]))
    expect(await reviewDefs['github_list_pull_request_reviews'].execute({ owner: 'a', repo: 'b', prNumber: 5 }, exec())).toEqual({ found: true, items: [] })
  })

  it('write tools require a token', async () => {
    const defs = Object.fromEntries(createTools(new GithubClient({ fetchImpl: vi.fn() })).map(t => [t.name, t]))
    const cases: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: 'github_rerun_workflow_run', args: { owner: 'a', repo: 'b', runId: 1 } },
      { name: 'github_cancel_workflow_run', args: { owner: 'a', repo: 'b', runId: 1 } },
      { name: 'github_request_pr_reviewers', args: { owner: 'a', repo: 'b', prNumber: 1, reviewers: ['alice'] } },
      { name: 'github_submit_pr_review', args: { owner: 'a', repo: 'b', prNumber: 1, body: 'LGTM', event: 'APPROVE' } },
    ]
    for (const { name, args } of cases) {
      const result = await defs[name].execute(args, exec())
      expect(result.ok).toBe(false)
      expect(result.reason).toContain('token')
    }
  })

  it('keyed detail tools return found:false on 404', async () => {
    const defs = Object.fromEntries(createTools(new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })).map(t => [t.name, t]))
    const cases: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: 'github_get_workflow', args: { owner: 'a', repo: 'b', workflowId: 1 } },
      { name: 'github_get_workflow_run', args: { owner: 'a', repo: 'b', runId: 1 } },
      { name: 'github_get_workflow_run_logs', args: { owner: 'a', repo: 'b', runId: 1 } },
      { name: 'github_list_workflow_jobs', args: { owner: 'a', repo: 'b', runId: 1 } },
      { name: 'github_get_pull_request', args: { owner: 'a', repo: 'b', prNumber: 1 } },
      { name: 'github_list_pull_request_reviews', args: { owner: 'a', repo: 'b', prNumber: 1 } },
    ]
    for (const { name, args } of cases) {
      expect(await defs[name].execute(args, exec())).toMatchObject({ found: false })
    }
  })

  it('github_request_pr_reviewers validates an empty reviewer list', async () => {
    const client = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn() })
    const tool = createTools(client).find(t => t.name === 'github_request_pr_reviewers')!
    const result = await tool.execute({ owner: 'a', repo: 'b', prNumber: 1 }, exec())
    expect(result).toMatchObject({ ok: false })
    expect(result.reason).toContain('reviewer')
  })

  it('presentCall for stage 11 tools', () => {
    const defs = Object.fromEntries(createTools(new GithubClient()).map(t => [t.name, t])) as any
    expect(defs['github_list_workflows'].presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ kind: 'search' })
    expect(defs['github_get_workflow'].presentCall({ owner: 'a', repo: 'b', workflowId: 1 })).toMatchObject({ kind: 'read' })
    expect(defs['github_get_workflow_run'].presentCall({ owner: 'a', repo: 'b', runId: 1 })).toMatchObject({ kind: 'read' })
    expect(defs['github_list_workflow_jobs'].presentCall({ owner: 'a', repo: 'b', runId: 1 })).toMatchObject({ kind: 'search' })
    expect(defs['github_get_workflow_run_logs'].presentCall({ owner: 'a', repo: 'b', runId: 1 })).toMatchObject({ kind: 'read' })
    expect(defs['github_rerun_workflow_run'].presentCall({ owner: 'a', repo: 'b', runId: 1 })).toMatchObject({ kind: 'edit' })
    expect(defs['github_cancel_workflow_run'].presentCall({ owner: 'a', repo: 'b', runId: 1 })).toMatchObject({ kind: 'edit' })
    expect(defs['github_get_pull_request'].presentCall({ owner: 'a', repo: 'b', prNumber: 1 })).toMatchObject({ kind: 'read' })
    expect(defs['github_list_pull_request_reviews'].presentCall({ owner: 'a', repo: 'b', prNumber: 1 })).toMatchObject({ kind: 'search' })
    expect(defs['github_request_pr_reviewers'].presentCall({ owner: 'a', repo: 'b', prNumber: 1, reviewers: ['alice'] })).toMatchObject({ kind: 'edit' })
    expect(defs['github_submit_pr_review'].presentCall({ owner: 'a', repo: 'b', prNumber: 1, body: 'LGTM', event: 'APPROVE' })).toMatchObject({ kind: 'edit' })
  })
})

describe('stage 12 tools', () => {
  it('github_dispatch_workflow requires a token and dispatches with one', async () => {
    const noToken = createTools(new GithubClient({ fetchImpl: vi.fn() })).find(t => t.name === 'github_dispatch_workflow')!
    expect(await noToken.execute({ owner: 'a', repo: 'b', workflowId: 1, ref: 'main' }, exec())).toMatchObject({ ok: false, reason: expect.stringContaining('token') })

    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const tool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl })).find(t => t.name === 'github_dispatch_workflow')!
    expect(await tool.execute({ owner: 'a', repo: 'b', workflowId: 1, ref: 'main', inputs: [{ name: 'version', value: '1.2.3' }] }, exec())).toEqual({ ok: true, workflowId: 1 })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/actions/workflows/1/dispatches')
    expect(JSON.parse(String(init.body))).toEqual({ ref: 'main', inputs: { version: '1.2.3' } })
  })

  it('presentCall for github_dispatch_workflow', () => {
    const defs = Object.fromEntries(createTools(new GithubClient()).map(t => [t.name, t])) as any
    expect(defs['github_dispatch_workflow'].presentCall({ owner: 'a', repo: 'b', workflowId: 1, ref: 'main' })).toMatchObject({ kind: 'edit' })
  })
})

describe('stage 13 tools', () => {
  it('read-only github_list_gists works without a token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, []))
    const tool = createTools(new GithubClient({ fetchImpl })).find(t => t.name === 'github_list_gists')!
    expect(await tool.execute({ limit: 3 }, exec())).toEqual({ items: [] })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('per_page=3')
  })

  it('write tools require a token and validate required inputs', async () => {
    const noToken = Object.fromEntries(createTools(new GithubClient({ fetchImpl: vi.fn() })).map(t => [t.name, t]))
    const cases: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: 'github_create_repository', args: { name: 'tools' } },
      { name: 'github_set_repo_topics', args: { owner: 'a', repo: 'b', topics: ['agent'] } },
      { name: 'github_create_gist', args: { files: [{ filename: 'x', content: 'y' }] } },
    ]
    for (const { name, args } of cases) {
      expect(await noToken[name].execute(args, exec())).toMatchObject({ ok: false, reason: expect.stringContaining('token') })
    }

    const fetchImpl = vi.fn(async () => jsonResponse(200, { names: ['agent'] }))
    const tokenTools = Object.fromEntries(createTools(new GithubClient({ token: 'ghp_test', fetchImpl })).map(t => [t.name, t]))
    expect(await tokenTools['github_set_repo_topics'].execute({ owner: 'a', repo: 'b', topics: [] }, exec())).toMatchObject({ ok: false })
    expect(await tokenTools['github_create_gist'].execute({ files: [] }, exec())).toMatchObject({ ok: false })
  })

  it('write tools pass through with a token', async () => {
    const repoFetch = vi.fn(async () => jsonResponse(201, { full_name: 'alice/tools', html_url: 'https://github.com/alice/tools' }))
    const repoTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: repoFetch })).find(t => t.name === 'github_create_repository')!
    expect(await repoTool.execute({ owner: 'alice', name: 'tools', privateRepo: true }, exec())).toMatchObject({ ok: true, fullName: 'alice/tools' })
    const [repoUrl] = repoFetch.mock.calls[0] as [string]
    expect(repoUrl).toContain('/orgs/alice/repos')

    const gistFetch = vi.fn(async () => jsonResponse(201, { id: 'xyz', html_url: 'https://gist.github.com/alice/xyz' }))
    const gistTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: gistFetch })).find(t => t.name === 'github_create_gist')!
    expect(await gistTool.execute({ description: 'snippet', files: [{ filename: 'a.txt', content: 'hello' }] }, exec())).toMatchObject({ ok: true, id: 'xyz' })
    const [, gistInit] = gistFetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(gistInit.body))).toMatchObject({ files: { 'a.txt': { content: 'hello' } } })
  })

  it('presentCall for stage 13 tools', () => {
    const defs = Object.fromEntries(createTools(new GithubClient()).map(t => [t.name, t])) as any
    expect(defs['github_create_repository'].presentCall({ name: 'tools' })).toMatchObject({ kind: 'edit' })
    expect(defs['github_set_repo_topics'].presentCall({ owner: 'a', repo: 'b', topics: ['agent'] })).toMatchObject({ kind: 'edit' })
    expect(defs['github_list_gists'].presentCall({})).toMatchObject({ kind: 'search' })
    expect(defs['github_create_gist'].presentCall({ files: [{ filename: 'a', content: 'b' }] })).toMatchObject({ kind: 'edit' })
  })
})

describe('stage 14 tools', () => {
  it('branch protection reads without a token and returns found:false on 404', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, {}))
    const tool = createTools(new GithubClient({ fetchImpl })).find(t => t.name === 'github_get_branch_protection')!
    expect(await tool.execute({ owner: 'a', repo: 'b', branch: 'main' }, exec())).toEqual({ found: false })
  })

  it('variables and secrets require a token', async () => {
    const noToken = Object.fromEntries(createTools(new GithubClient({ fetchImpl: vi.fn() })).map(t => [t.name, t]))
    const cases: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: 'github_list_repo_variables', args: { owner: 'a', repo: 'b' } },
      { name: 'github_set_repo_variable', args: { owner: 'a', repo: 'b', name: 'FOO', value: 'bar' } },
      { name: 'github_delete_repo_variable', args: { owner: 'a', repo: 'b', name: 'FOO' } },
      { name: 'github_list_repo_secrets', args: { owner: 'a', repo: 'b' } },
      { name: 'github_delete_repo_secret', args: { owner: 'a', repo: 'b', name: 'API_KEY' } },
      { name: 'github_set_repo_secret', args: { owner: 'a', repo: 'b', name: 'API_KEY', value: 'secret' } },
      { name: 'github_set_branch_protection', args: { owner: 'a', repo: 'b', branch: 'main', requiredApprovingReviewCount: 1 } },
      { name: 'github_delete_branch_protection', args: { owner: 'a', repo: 'b', branch: 'main' } },
    ]
    for (const { name, args } of cases) {
      const result = await noToken[name].execute(args, exec()) as Record<string, unknown>
      expect(result.reason).toContain('token')
    }
  })

  it('governance write tools pass through with a token', async () => {
    const variableFetch = vi.fn(async () => jsonResponse(201, {}))
    const variableTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: variableFetch })).find(t => t.name === 'github_set_repo_variable')!
    expect(await variableTool.execute({ owner: 'a', repo: 'b', name: 'FOO', value: 'bar' }, exec())).toMatchObject({ ok: true, created: true })
    const [variableUrl, variableInit] = variableFetch.mock.calls[0] as [string, RequestInit]
    expect(variableUrl).toContain('/actions/variables')
    expect(JSON.parse(String(variableInit.body))).toEqual({ name: 'FOO', value: 'bar' })

    const secretFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const secretTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: secretFetch })).find(t => t.name === 'github_delete_repo_secret')!
    expect(await secretTool.execute({ owner: 'a', repo: 'b', name: 'API_KEY' }, exec())).toMatchObject({ ok: true })
    expect(secretFetch.mock.calls[0][0]).toContain('/actions/secrets/API_KEY')

    const protectionFetch = vi.fn(async () => jsonResponse(200, { url: 'https://x/protection' }))
    const protectionTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: protectionFetch })).find(t => t.name === 'github_set_branch_protection')!
    expect(await protectionTool.execute({ owner: 'a', repo: 'b', branch: 'main', requiredStatusChecks: ['ci'], requiredApprovingReviewCount: 1 }, exec())).toMatchObject({ ok: true })
    const [, protectionInit] = protectionFetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(protectionInit.body))).toMatchObject({ required_status_checks: { contexts: ['ci'] }, required_pull_request_reviews: { required_approving_review_count: 1 } })
  })

  it('presentCall for stage 14 tools', () => {
    const defs = Object.fromEntries(createTools(new GithubClient()).map(t => [t.name, t])) as any
    expect(defs['github_list_repo_variables'].presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ kind: 'search' })
    expect(defs['github_set_repo_variable'].presentCall({ owner: 'a', repo: 'b', name: 'FOO', value: 'bar' })).toMatchObject({ kind: 'edit' })
    expect(defs['github_list_repo_secrets'].presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ kind: 'search' })
    expect(defs['github_get_branch_protection'].presentCall({ owner: 'a', repo: 'b', branch: 'main' })).toMatchObject({ kind: 'read' })
    expect(defs['github_set_branch_protection'].presentCall({ owner: 'a', repo: 'b', branch: 'main', requiredApprovingReviewCount: 1 })).toMatchObject({ kind: 'edit' })
  })
})

describe('stage 15 tools', () => {
  it('github_list_milestones reads without a token and clamps limit', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, []))
    const tool = createTools(new GithubClient({ fetchImpl })).find(t => t.name === 'github_list_milestones')!
    expect(await tool.execute({ owner: 'a', repo: 'b', limit: 99 }, exec())).toEqual({ items: [] })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('per_page=50')
  })

  it('write tools require a token', async () => {
    const noToken = Object.fromEntries(createTools(new GithubClient({ fetchImpl: vi.fn() })).map(t => [t.name, t]))
    const cases: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: 'github_set_issue_labels', args: { owner: 'a', repo: 'b', issueNumber: 8, labels: ['bug'] } },
      { name: 'github_add_issue_assignees', args: { owner: 'a', repo: 'b', issueNumber: 8, assignees: ['alice'] } },
      { name: 'github_set_issue_milestone', args: { owner: 'a', repo: 'b', issueNumber: 8, milestoneNumber: 3 } },
      { name: 'github_reply_pr_comment', args: { owner: 'a', repo: 'b', prNumber: 8, commentId: 12, body: 'Thanks' } },
    ]
    for (const { name, args } of cases) {
      const result = await noToken[name].execute(args, exec()) as Record<string, unknown>
      expect(result.ok).toBe(false)
      expect(result.reason).toContain('token')
    }
  })

  it('write tools validate required issue inputs with a token', async () => {
    const fetchImpl = vi.fn()
    const defs = Object.fromEntries(createTools(new GithubClient({ token: 'ghp_test', fetchImpl })).map(t => [t.name, t]))
    const milestone = await defs['github_set_issue_milestone'].execute({ owner: 'a', repo: 'b', issueNumber: 8 }, exec())
    expect(milestone).toMatchObject({ ok: false })
    expect(milestone.reason).toContain('milestoneNumber')

    const assignees = await defs['github_add_issue_assignees'].execute({ owner: 'a', repo: 'b', issueNumber: 8, assignees: [] }, exec())
    expect(assignees).toMatchObject({ ok: false })
    expect(assignees.reason).toContain('assignee')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('write tools pass through with a token', async () => {
    const labelFetch = vi.fn(async () => jsonResponse(200, { number: 8, labels: [{ name: 'bug' }] }))
    const labelTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: labelFetch })).find(t => t.name === 'github_set_issue_labels')!
    expect(await labelTool.execute({ owner: 'a', repo: 'b', issueNumber: 8, labels: ['bug'] }, exec())).toEqual({ ok: true, number: 8, labels: ['bug'] })
    expect(JSON.parse(String(labelFetch.mock.calls[0][1]?.body))).toEqual({ labels: ['bug'] })

    const assigneeFetch = vi.fn(async () => jsonResponse(200, { number: 8, assignees: [{ login: 'alice' }] }))
    const assigneeTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: assigneeFetch })).find(t => t.name === 'github_add_issue_assignees')!
    expect(await assigneeTool.execute({ owner: 'a', repo: 'b', issueNumber: 8, assignees: ['alice'] }, exec())).toEqual({ ok: true, number: 8, assignees: ['alice'] })
    expect(assigneeFetch.mock.calls[0][0]).toContain('/issues/8/assignees')

    const milestoneFetch = vi.fn(async () => jsonResponse(200, { number: 8, milestone: { number: 3 } }))
    const milestoneTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: milestoneFetch })).find(t => t.name === 'github_set_issue_milestone')!
    expect(await milestoneTool.execute({ owner: 'a', repo: 'b', issueNumber: 8, milestoneNumber: 3 }, exec())).toEqual({ ok: true, number: 8, milestoneNumber: 3 })
    expect(JSON.parse(String(milestoneFetch.mock.calls[0][1]?.body))).toEqual({ milestone: 3 })

    const replyFetch = vi.fn(async () => jsonResponse(201, { id: 99, html_url: 'https://github.com/a/b/pull/8#discussion_r99' }))
    const replyTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: replyFetch })).find(t => t.name === 'github_reply_pr_comment')!
    expect(await replyTool.execute({ owner: 'a', repo: 'b', prNumber: 8, commentId: 12, body: 'Thanks' }, exec())).toEqual({ ok: true, commentId: 99, url: 'https://github.com/a/b/pull/8#discussion_r99' })
    expect(JSON.parse(String(replyFetch.mock.calls[0][1]?.body))).toEqual({ body: 'Thanks', in_reply_to: 12 })
  })

  it('presentCall for stage 15 tools', () => {
    const defs = Object.fromEntries(createTools(new GithubClient()).map(t => [t.name, t])) as any
    expect(defs['github_list_milestones'].presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ kind: 'search' })
    expect(defs['github_set_issue_labels'].presentCall({ owner: 'a', repo: 'b', issueNumber: 8, labels: ['bug'] })).toMatchObject({ kind: 'edit' })
    expect(defs['github_add_issue_assignees'].presentCall({ owner: 'a', repo: 'b', issueNumber: 8, assignees: ['alice'] })).toMatchObject({ kind: 'edit' })
    expect(defs['github_set_issue_milestone'].presentCall({ owner: 'a', repo: 'b', issueNumber: 8, milestoneNumber: 3 })).toMatchObject({ kind: 'edit' })
    expect(defs['github_reply_pr_comment'].presentCall({ owner: 'a', repo: 'b', prNumber: 8, commentId: 12, body: 'Thanks' })).toMatchObject({ kind: 'edit' })
  })
})

describe('stage 16 tools', () => {
  it('all artifact and environment tools require a token', async () => {
    const noToken = Object.fromEntries(createTools(new GithubClient({ fetchImpl: vi.fn() })).map(t => [t.name, t]))
    const cases: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: 'github_list_repo_artifacts', args: { owner: 'a', repo: 'b' } },
      { name: 'github_list_run_artifacts', args: { owner: 'a', repo: 'b', runId: 1 } },
      { name: 'github_get_artifact', args: { owner: 'a', repo: 'b', artifactId: 1 } },
      { name: 'github_delete_artifact', args: { owner: 'a', repo: 'b', artifactId: 1 } },
      { name: 'github_list_environments', args: { owner: 'a', repo: 'b' } },
      { name: 'github_get_environment', args: { owner: 'a', repo: 'b', environmentName: 'prod' } },
      { name: 'github_update_environment', args: { owner: 'a', repo: 'b', name: 'prod' } },
      { name: 'github_delete_environment', args: { owner: 'a', repo: 'b', name: 'prod' } },
    ]
    for (const { name, args } of cases) {
      const result = await noToken[name].execute(args, exec()) as Record<string, unknown>
      expect(result.reason).toContain('token')
      if (name.startsWith('github_list') || name.startsWith('github_get')) {
        expect(result.found).toBe(false)
      } else {
        expect(result.ok).toBe(false)
      }
    }
  })

  it('artifact reads pass through with a token and get_artifact returns found:false on 404', async () => {
    const listFetch = vi.fn(async () => jsonResponse(200, {
      total_count: 1,
      artifacts: [{
        id: 10,
        name: 'build.zip',
        size_in_bytes: 5120,
        expired: false,
        created_at: '2026-08-25T00:00:00Z',
        expires_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-08-25T00:01:00Z',
        archive_download_url: 'https://archive.example/build.zip',
        url: 'https://api.github.com/repos/a/b/actions/artifacts/10',
        workflow_run: { id: 7, head_branch: 'main', head_sha: 'abc123' },
      }],
    }))
    const listTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: listFetch })).find(t => t.name === 'github_list_repo_artifacts')!
    const listed = await listTool.execute({ owner: 'a', repo: 'b', name: 'build', limit: 50 }, exec())
    expect(listed).toMatchObject({ found: true, total: 1, items: [{ id: 10, name: 'build.zip' }] })
    expect(String(listFetch.mock.calls[0][0])).toContain('name=build')

    const runFetch = vi.fn(async () => jsonResponse(200, { total_count: 0, artifacts: [] }))
    const runTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: runFetch })).find(t => t.name === 'github_list_run_artifacts')!
    expect(await runTool.execute({ owner: 'a', repo: 'b', runId: 9 }, exec())).toEqual({ found: true, total: 0, items: [] })
    expect(String(runFetch.mock.calls[0][0])).toContain('/actions/runs/9/artifacts')

    const missing = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })).find(t => t.name === 'github_get_artifact')!
    expect(await missing.execute({ owner: 'a', repo: 'b', artifactId: 10 }, exec())).toEqual({ found: false })
  })

  it('environment reads and writes pass through with a token', async () => {
    const envPayload = {
      id: 5,
      name: 'prod',
      url: 'https://api.github.com/repos/a/b/environments/prod',
      html_url: 'https://github.com/a/b/environments/prod',
      created_at: '2026-08-25T00:00:00Z',
      updated_at: '2026-08-25T00:01:00Z',
      protection_rules: [],
      deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
    }

    const listFetch = vi.fn(async () => jsonResponse(200, { total_count: 1, environments: [envPayload] }))
    const listTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: listFetch })).find(t => t.name === 'github_list_environments')!
    expect(await listTool.execute({ owner: 'a', repo: 'b' }, exec())).toMatchObject({ found: true, total: 1, items: [{ name: 'prod', protectedBranches: true }] })

    const getFetch = vi.fn(async () => jsonResponse(200, envPayload))
    const getTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: getFetch })).find(t => t.name === 'github_get_environment')!
    expect(await getTool.execute({ owner: 'a', repo: 'b', environmentName: 'prod' }, exec())).toMatchObject({ found: true, name: 'prod' })

    const updateFetch = vi.fn(async () => jsonResponse(200, envPayload))
    const updateTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: updateFetch })).find(t => t.name === 'github_update_environment')!
    expect(await updateTool.execute({
      owner: 'a',
      repo: 'b',
      name: 'prod',
      waitTimer: 15,
      preventSelfReview: true,
      reviewers: [{ type: 'User', id: 2 }],
      protectedBranches: true,
    }, exec())).toMatchObject({ ok: true, name: 'prod' })
    const [, updateInit] = updateFetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(updateInit.body))).toEqual({
      wait_timer: 15,
      prevent_self_review: true,
      reviewers: [{ type: 'User', id: 2 }],
      deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
    })

    const invalidFetch = vi.fn()
    const invalidTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: invalidFetch })).find(t => t.name === 'github_update_environment')!
    const invalid = await invalidTool.execute({ owner: 'a', repo: 'b', name: 'prod', protectedBranches: true, customBranchPolicies: true }, exec())
    expect(invalid).toMatchObject({ ok: false })
    expect(invalid.reason).toContain('policy')
    expect(invalidFetch).not.toHaveBeenCalled()

    const deleteArtifactFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const deleteArtifactTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: deleteArtifactFetch })).find(t => t.name === 'github_delete_artifact')!
    expect(await deleteArtifactTool.execute({ owner: 'a', repo: 'b', artifactId: 10 }, exec())).toEqual({ ok: true, artifactId: 10 })

    const deleteEnvFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const deleteEnvTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: deleteEnvFetch })).find(t => t.name === 'github_delete_environment')!
    expect(await deleteEnvTool.execute({ owner: 'a', repo: 'b', name: 'prod' }, exec())).toEqual({ ok: true, name: 'prod' })
  })

  it('presentCall for stage 16 tools', () => {
    const defs = Object.fromEntries(createTools(new GithubClient()).map(t => [t.name, t])) as any
    expect(defs['github_list_repo_artifacts'].presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ kind: 'search' })
    expect(defs['github_list_run_artifacts'].presentCall({ owner: 'a', repo: 'b', runId: 9 })).toMatchObject({ kind: 'search' })
    expect(defs['github_get_artifact'].presentCall({ owner: 'a', repo: 'b', artifactId: 10 })).toMatchObject({ kind: 'read' })
    expect(defs['github_delete_artifact'].presentCall({ owner: 'a', repo: 'b', artifactId: 10 })).toMatchObject({ kind: 'edit' })
    expect(defs['github_list_environments'].presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ kind: 'search' })
    expect(defs['github_get_environment'].presentCall({ owner: 'a', repo: 'b', environmentName: 'prod' })).toMatchObject({ kind: 'read' })
    expect(defs['github_update_environment'].presentCall({ owner: 'a', repo: 'b', name: 'prod' })).toMatchObject({ kind: 'edit' })
    expect(defs['github_delete_environment'].presentCall({ owner: 'a', repo: 'b', name: 'prod' })).toMatchObject({ kind: 'edit' })
  })
})

describe('stage 17 tools', () => {
  it('organization and team management tools require a token', async () => {
    const noToken = Object.fromEntries(createTools(new GithubClient({ fetchImpl: vi.fn() })).map(t => [t.name, t]))
    const cases: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: 'github_list_org_members', args: { org: 'acme' } },
      { name: 'github_list_org_teams', args: { org: 'acme' } },
      { name: 'github_get_team', args: { org: 'acme', teamSlug: 'core' } },
      { name: 'github_list_team_members', args: { org: 'acme', teamSlug: 'core' } },
      { name: 'github_list_team_repos', args: { org: 'acme', teamSlug: 'core' } },
      { name: 'github_update_team_membership', args: { org: 'acme', teamSlug: 'core', username: 'alice' } },
      { name: 'github_remove_team_membership', args: { org: 'acme', teamSlug: 'core', username: 'alice' } },
    ]
    for (const { name, args } of cases) {
      const result = await noToken[name].execute(args, exec()) as Record<string, unknown>
      expect(result.reason).toContain('token')
      expect(name.startsWith('github_get') || name.startsWith('github_list') ? result.found : result.ok).toBe(false)
    }
  })

  it('github_get_org and github_list_org_repos work without a token', async () => {
    const orgFetch = vi.fn(async () => jsonResponse(200, {
      login: 'acme', name: 'Acme', description: 'dev tools', public_repos: 12, total_private_repos: null,
      location: 'Shanghai', blog: 'https://acme.dev', created_at: '2020-01-01T00:00:00Z', html_url: 'https://github.com/acme',
    }))
    const orgTool = createTools(new GithubClient({ fetchImpl: orgFetch })).find(t => t.name === 'github_get_org')!
    expect(await orgTool.execute({ org: 'acme' }, exec())).toMatchObject({ found: true, login: 'acme', publicRepos: 12 })

    const repoFetch = vi.fn(async () => jsonResponse(200, [{ full_name: 'acme/tools', name: 'tools', description: null, stargazers_count: 0, language: null, visibility: 'public', fork: false, private: false, updated_at: '2026-08-25T00:00:00Z', html_url: 'https://github.com/acme/tools' }]))
    const repoTool = createTools(new GithubClient({ fetchImpl: repoFetch })).find(t => t.name === 'github_list_org_repos')!
    expect(await repoTool.execute({ org: 'acme', limit: 50 }, exec())).toMatchObject({ found: true, items: [{ fullName: 'acme/tools' }] })
    expect(String(repoFetch.mock.calls[0][0])).toContain('per_page=50')

    const missing = createTools(new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })).find(t => t.name === 'github_get_org')!
    expect(await missing.execute({ org: 'nope' }, exec())).toEqual({ found: false })
  })

  it('org and team reads pass through with a token', async () => {
    const memberFetch = vi.fn(async () => jsonResponse(200, [{ login: 'alice', id: 1, avatar_url: 'https://avatar', html_url: 'https://github.com/alice' }]))
    const memberTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: memberFetch })).find(t => t.name === 'github_list_org_members')!
    expect(await memberTool.execute({ org: 'acme', role: 'admin' }, exec())).toMatchObject({ found: true, items: [{ login: 'alice' }] })
    expect(String(memberFetch.mock.calls[0][0])).toContain('role=admin')

    const teamListFetch = vi.fn(async () => jsonResponse(200, [{ id: 7, name: 'Core', slug: 'core', description: null, privacy: 'closed', permission: 'admin', url: 'https://api', html_url: 'https://github.com/orgs/acme/teams/core', members_count: 3, repos_count: 5 }]))
    const teamListTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: teamListFetch })).find(t => t.name === 'github_list_org_teams')!
    expect(await teamListTool.execute({ org: 'acme' }, exec())).toMatchObject({ found: true, items: [{ slug: 'core' }] })

    const teamFetch = vi.fn(async () => jsonResponse(200, { id: 7, name: 'Core', slug: 'core', description: null, privacy: 'closed', permission: 'pull', url: 'https://api', html_url: 'https://github.com/orgs/acme/teams/core', members_count: null, repos_count: null }))
    const teamTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: teamFetch })).find(t => t.name === 'github_get_team')!
    expect(await teamTool.execute({ org: 'acme', teamSlug: 'core' }, exec())).toMatchObject({ found: true, permission: 'pull' })

    const teamRepoFetch = vi.fn(async () => jsonResponse(200, [{ full_name: 'acme/tools', name: 'tools', description: null, stargazers_count: 0, language: null, visibility: 'public', fork: false, private: false, updated_at: '2026-08-25T00:00:00Z', html_url: 'https://github.com/acme/tools' }]))
    const teamRepoTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: teamRepoFetch })).find(t => t.name === 'github_list_team_repos')!
    expect(await teamRepoTool.execute({ org: 'acme', teamSlug: 'core' }, exec())).toMatchObject({ found: true, items: [{ fullName: 'acme/tools' }] })
  })

  it('team membership write tools pass through with a token', async () => {
    const updateFetch = vi.fn(async () => jsonResponse(200, { url: 'https://api.github.com/orgs/acme/teams/core/memberships/alice', role: 'maintainer', state: 'active' }))
    const updateTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: updateFetch })).find(t => t.name === 'github_update_team_membership')!
    expect(await updateTool.execute({ org: 'acme', teamSlug: 'core', username: 'alice', role: 'maintainer' }, exec())).toEqual({ ok: true, username: 'alice', role: 'maintainer', state: 'active' })
    const [, updateInit] = updateFetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(updateInit.body))).toEqual({ role: 'maintainer' })

    const removeFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const removeTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: removeFetch })).find(t => t.name === 'github_remove_team_membership')!
    expect(await removeTool.execute({ org: 'acme', teamSlug: 'core', username: 'alice' }, exec())).toEqual({ ok: true, username: 'alice' })
  })

  it('presentCall for stage 17 tools', () => {
    const defs = Object.fromEntries(createTools(new GithubClient()).map(t => [t.name, t])) as any
    expect(defs['github_get_org'].presentCall({ org: 'acme' })).toMatchObject({ kind: 'read' })
    expect(defs['github_list_org_repos'].presentCall({ org: 'acme' })).toMatchObject({ kind: 'search' })
    expect(defs['github_list_org_members'].presentCall({ org: 'acme' })).toMatchObject({ kind: 'search' })
    expect(defs['github_list_org_teams'].presentCall({ org: 'acme' })).toMatchObject({ kind: 'search' })
    expect(defs['github_get_team'].presentCall({ org: 'acme', teamSlug: 'core' })).toMatchObject({ kind: 'read' })
    expect(defs['github_list_team_members'].presentCall({ org: 'acme', teamSlug: 'core' })).toMatchObject({ kind: 'search' })
    expect(defs['github_list_team_repos'].presentCall({ org: 'acme', teamSlug: 'core' })).toMatchObject({ kind: 'search' })
    expect(defs['github_update_team_membership'].presentCall({ org: 'acme', teamSlug: 'core', username: 'alice' })).toMatchObject({ kind: 'edit' })
    expect(defs['github_remove_team_membership'].presentCall({ org: 'acme', teamSlug: 'core', username: 'alice' })).toMatchObject({ kind: 'edit' })
  })
})

describe('stage 18 tools', () => {
  it('webhook and release asset tools require a token', async () => {
    const noToken = Object.fromEntries(createTools(new GithubClient({ fetchImpl: vi.fn() })).map(t => [t.name, t]))
    const cases: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: 'github_list_repo_webhooks', args: { owner: 'a', repo: 'b' } },
      { name: 'github_get_repo_webhook', args: { owner: 'a', repo: 'b', hookId: 12 } },
      { name: 'github_create_repo_webhook', args: { owner: 'a', repo: 'b', url: 'https://example.com/hook' } },
      { name: 'github_update_repo_webhook', args: { owner: 'a', repo: 'b', hookId: 12, url: 'https://example.com/new' } },
      { name: 'github_delete_repo_webhook', args: { owner: 'a', repo: 'b', hookId: 12 } },
      { name: 'github_ping_repo_webhook', args: { owner: 'a', repo: 'b', hookId: 12 } },
      { name: 'github_list_release_assets', args: { owner: 'a', repo: 'b', releaseId: 5 } },
      { name: 'github_get_release_asset', args: { owner: 'a', repo: 'b', assetId: 99 } },
      { name: 'github_update_release_asset', args: { owner: 'a', repo: 'b', assetId: 99, name: 'renamed.zip' } },
      { name: 'github_delete_release_asset', args: { owner: 'a', repo: 'b', assetId: 99 } },
    ]
    for (const { name, args } of cases) {
      const result = await noToken[name].execute(args, exec()) as Record<string, unknown>
      expect(result.reason).toContain('token')
      if (name.startsWith('github_list') || name.startsWith('github_get')) {
        expect(result.found).toBe(false)
      } else {
        expect(result.ok).toBe(false)
      }
    }
  })

  it('repository webhook tools pass through with a token', async () => {
    const rawWebhook = {
      id: 12,
      name: 'web',
      active: true,
      events: ['push'],
      config: { url: 'https://example.com/hook', content_type: 'json', insecure_ssl: '1' },
      url: 'https://api.github.com/repos/a/b/hooks/12',
      ping_url: 'https://api.github.com/repos/a/b/hooks/12/pings',
      deliveries_url: 'https://api.github.com/repos/a/b/hooks/12/deliveries',
      test_url: 'https://api.github.com/repos/a/b/hooks/12/test',
      created_at: '2026-08-25T00:00:00Z',
      updated_at: '2026-08-25T01:00:00Z',
    }

    const listFetch = vi.fn(async () => jsonResponse(200, [rawWebhook]))
    const listTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: listFetch })).find(t => t.name === 'github_list_repo_webhooks')!
    expect(await listTool.execute({ owner: 'a', repo: 'b', limit: 50 }, exec())).toMatchObject({ found: true, items: [{ id: 12, config: { url: 'https://example.com/hook' } }] })
    expect(String(listFetch.mock.calls[0][0])).toContain('per_page=50')

    const getTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(200, rawWebhook)) })).find(t => t.name === 'github_get_repo_webhook')!
    expect(await getTool.execute({ owner: 'a', repo: 'b', hookId: 12 }, exec())).toMatchObject({ found: true, id: 12, active: true })

    const createFetch = vi.fn(async () => jsonResponse(201, rawWebhook))
    const createTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: createFetch })).find(t => t.name === 'github_create_repo_webhook')!
    expect(await createTool.execute({
      owner: 'a', repo: 'b', url: 'https://example.com/hook', contentType: 'form',
      secret: 'secret', insecureSsl: true, events: ['push'], active: false,
    }, exec())).toEqual({ ok: true, id: 12, url: 'https://api.github.com/repos/a/b/hooks/12' })
    const [, createInit] = createFetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(createInit.body))).toMatchObject({
      config: { url: 'https://example.com/hook', content_type: 'form', secret: 'secret', insecure_ssl: '1' },
      events: ['push'],
      active: false,
    })

    const updateFetch = vi.fn(async () => jsonResponse(200, rawWebhook))
    const updateTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: updateFetch })).find(t => t.name === 'github_update_repo_webhook')!
    expect(await updateTool.execute({ owner: 'a', repo: 'b', hookId: 12, url: 'https://example.com/new', addEvents: ['issues'], removeEvents: ['pull_request'], active: true }, exec())).toEqual({ ok: true, id: 12, url: 'https://api.github.com/repos/a/b/hooks/12' })
    const [, updateInit] = updateFetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(updateInit.body))).toEqual({ config: { url: 'https://example.com/new' }, add_events: ['issues'], remove_events: ['pull_request'], active: true })

    const pingTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => new Response(null, { status: 204 })) })).find(t => t.name === 'github_ping_repo_webhook')!
    expect(await pingTool.execute({ owner: 'a', repo: 'b', hookId: 12 }, exec())).toEqual({ ok: true, id: 12 })

    const deleteTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => new Response(null, { status: 204 })) })).find(t => t.name === 'github_delete_repo_webhook')!
    expect(await deleteTool.execute({ owner: 'a', repo: 'b', hookId: 12 }, exec())).toEqual({ ok: true, id: 12 })
  })

  it('release asset tools pass through with a token', async () => {
    const rawAsset = {
      id: 99,
      name: 'plugin.zip',
      label: 'Linux binary',
      size_in_bytes: 1234,
      download_count: 7,
      state: 'uploaded',
      content_type: 'application/zip',
      created_at: '2026-08-25T00:00:00Z',
      updated_at: '2026-08-25T02:00:00Z',
      url: 'https://api.github.com/repos/a/b/releases/assets/99',
      browser_download_url: 'https://github.com/a/b/releases/download/v1/plugin.zip',
    }

    const listFetch = vi.fn(async () => jsonResponse(200, [rawAsset]))
    const listTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: listFetch })).find(t => t.name === 'github_list_release_assets')!
    expect(await listTool.execute({ owner: 'a', repo: 'b', releaseId: 5, limit: 10 }, exec())).toMatchObject({ found: true, items: [{ id: 99, name: 'plugin.zip' }] })
    expect(String(listFetch.mock.calls[0][0])).toContain('/releases/5/assets?')
    expect(String(listFetch.mock.calls[0][0])).toContain('per_page=10')

    const getTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(200, rawAsset)) })).find(t => t.name === 'github_get_release_asset')!
    expect(await getTool.execute({ owner: 'a', repo: 'b', assetId: 99 }, exec())).toMatchObject({ found: true, id: 99, browserDownloadUrl: 'https://github.com/a/b/releases/download/v1/plugin.zip' })

    const updateFetch = vi.fn(async () => jsonResponse(200, { ...rawAsset, name: 'renamed.zip' }))
    const updateTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: updateFetch })).find(t => t.name === 'github_update_release_asset')!
    expect(await updateTool.execute({ owner: 'a', repo: 'b', assetId: 99, name: 'renamed.zip', label: 'Renamed binary' }, exec())).toEqual({ ok: true, id: 99, name: 'renamed.zip' })
    const [, updateInit] = updateFetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(updateInit.body))).toEqual({ name: 'renamed.zip', label: 'Renamed binary' })

    const deleteTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => new Response(null, { status: 204 })) })).find(t => t.name === 'github_delete_release_asset')!
    expect(await deleteTool.execute({ owner: 'a', repo: 'b', assetId: 99 }, exec())).toEqual({ ok: true, id: 99 })
  })

  it('webhook and asset reads and writes map 404 or 422 to business failure values', async () => {
    const missing = Object.fromEntries(createTools(new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })).map(t => [t.name, t]))
    expect(await missing['github_list_repo_webhooks'].execute({ owner: 'a', repo: 'b' }, exec())).toEqual({ found: false, items: [] })
    expect(await missing['github_get_repo_webhook'].execute({ owner: 'a', repo: 'b', hookId: 12 }, exec())).toEqual({ found: false })
    expect(await missing['github_list_release_assets'].execute({ owner: 'a', repo: 'b', releaseId: 5 }, exec())).toEqual({ found: false, items: [] })
    expect(await missing['github_get_release_asset'].execute({ owner: 'a', repo: 'b', assetId: 99 }, exec())).toEqual({ found: false })
    expect(await missing['github_update_repo_webhook'].execute({ owner: 'a', repo: 'b', hookId: 12, url: 'https://example.com/new' }, exec())).toMatchObject({ ok: false })
    expect(await missing['github_delete_release_asset'].execute({ owner: 'a', repo: 'b', assetId: 99 }, exec())).toMatchObject({ ok: false })
  })

  it('presentCall and presentResult for stage 18 tools', () => {
    const defs = Object.fromEntries(createTools(new GithubClient()).map(t => [t.name, t])) as any
    expect(defs['github_list_repo_webhooks'].presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ kind: 'search' })
    expect(defs['github_list_release_assets'].presentCall({ owner: 'a', repo: 'b', releaseId: 5 })).toMatchObject({ kind: 'search' })
    expect(defs['github_get_repo_webhook'].presentCall({ owner: 'a', repo: 'b', hookId: 12 })).toMatchObject({ kind: 'read' })
    expect(defs['github_get_release_asset'].presentCall({ owner: 'a', repo: 'b', assetId: 99 })).toMatchObject({ kind: 'read' })
    expect(defs['github_create_repo_webhook'].presentCall({ owner: 'a', repo: 'b', url: 'https://example.com/hook' })).toMatchObject({ kind: 'edit' })
    expect(defs['github_update_release_asset'].presentCall({ owner: 'a', repo: 'b', assetId: 99, name: 'renamed.zip' })).toMatchObject({ kind: 'edit' })
    expect(defs['github_delete_repo_webhook'].presentCall({ owner: 'a', repo: 'b', hookId: 12 })).toMatchObject({ kind: 'edit' })
    expect(defs['github_list_repo_webhooks'].presentResult({ owner: 'a', repo: 'b' }, { found: false })).toMatchObject({ title: 'Webhooks not accessible' })
    expect(defs['github_get_release_asset'].presentResult({ owner: 'a', repo: 'b', assetId: 99 }, { found: false })).toMatchObject({ title: 'Release asset not found' })
    expect(defs['github_update_repo_webhook'].presentResult({ owner: 'a', repo: 'b', hookId: 12 }, { ok: false, reason: 'nope' })).toMatchObject({ title: 'Update webhook failed' })
  })
})

describe('stage 19 tools', () => {
  it('collaborator and team repo tools require a token', async () => {
    const noToken = Object.fromEntries(createTools(new GithubClient({ fetchImpl: vi.fn() })).map(t => [t.name, t]))
    const cases: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: 'github_list_collaborators', args: { owner: 'a', repo: 'b' } },
      { name: 'github_get_collaborator_permission', args: { owner: 'a', repo: 'b', username: 'alice' } },
      { name: 'github_add_collaborator', args: { owner: 'a', repo: 'b', username: 'alice', permission: 'push' } },
      { name: 'github_update_collaborator_permission', args: { owner: 'a', repo: 'b', username: 'alice', permission: 'admin' } },
      { name: 'github_remove_collaborator', args: { owner: 'a', repo: 'b', username: 'alice' } },
      { name: 'github_add_team_repo', args: { org: 'acme', teamSlug: 'core', owner: 'a', repo: 'b', permission: 'push' } },
      { name: 'github_remove_team_repo', args: { org: 'acme', teamSlug: 'core', owner: 'a', repo: 'b' } },
    ]
    for (const { name, args } of cases) {
      const result = await noToken[name].execute(args, exec()) as Record<string, unknown>
      expect(result.reason).toContain('token')
      if (name.startsWith('github_list') || name.startsWith('github_get')) {
        expect(result.found).toBe(false)
      } else {
        expect(result.ok).toBe(false)
      }
    }
  })

  it('collaborator tools pass through with a token', async () => {
    const rawCollaborator = {
      login: 'alice',
      id: 101,
      avatar_url: 'https://avatar.example/alice.png',
      permissions: { pull: true, triage: false, push: true, maintain: false, admin: false },
      role_name: 'write',
      url: 'https://api.github.com/users/alice',
      html_url: 'https://github.com/alice',
    }

    const listFetch = vi.fn(async () => jsonResponse(200, [rawCollaborator]))
    const listTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: listFetch })).find(t => t.name === 'github_list_collaborators')!
    expect(await listTool.execute({ owner: 'a', repo: 'b', permission: 'push', affiliation: 'direct', limit: 10 }, exec())).toMatchObject({
      found: true,
      items: [{ login: 'alice', roleName: 'write' }],
    })
    const listUrl = String(listFetch.mock.calls[0][0])
    expect(listUrl).toContain('/repos/a/b/collaborators?')
    expect(listUrl).toContain('permission=push')
    expect(listUrl).toContain('affiliation=direct')
    expect(listUrl).toContain('per_page=10')

    const getFetch = vi.fn(async () => jsonResponse(200, {
      permission: 'admin',
      role_name: 'admin',
      source: 'organization',
      user: { login: 'alice', html_url: 'https://github.com/alice' },
    }))
    const getTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: getFetch })).find(t => t.name === 'github_get_collaborator_permission')!
    expect(await getTool.execute({ owner: 'a', repo: 'b', username: 'alice' }, exec())).toMatchObject({
      found: true,
      login: 'alice',
      permission: 'admin',
      source: 'organization',
    })

    const addFetch = vi.fn(async () => jsonResponse(201, rawCollaborator))
    const addTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: addFetch })).find(t => t.name === 'github_add_collaborator')!
    expect(await addTool.execute({ owner: 'a', repo: 'b', username: 'alice', permission: 'push' }, exec())).toEqual({
      ok: true,
      login: 'alice',
      permission: 'push',
      created: true,
    })
    const [, addInit] = addFetch.mock.calls[0] as [string, RequestInit]
    expect(addInit.method).toBe('PUT')
    expect(JSON.parse(String(addInit.body))).toEqual({ permission: 'push' })

    const updateFetch = vi.fn(async () => jsonResponse(200, rawCollaborator))
    const updateTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: updateFetch })).find(t => t.name === 'github_update_collaborator_permission')!
    expect(await updateTool.execute({ owner: 'a', repo: 'b', username: 'alice', permission: 'admin' }, exec())).toEqual({
      ok: true,
      login: 'alice',
      permission: 'admin',
    })
    const [, updateInit] = updateFetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(updateInit.body))).toEqual({ permission: 'admin' })

    const removeFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const removeTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: removeFetch })).find(t => t.name === 'github_remove_collaborator')!
    expect(await removeTool.execute({ owner: 'a', repo: 'b', username: 'alice' }, exec())).toEqual({ ok: true, login: 'alice' })
  })

  it('team repo tools pass through with a token', async () => {
    const addFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const addTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: addFetch })).find(t => t.name === 'github_add_team_repo')!
    expect(await addTool.execute({ org: 'acme', teamSlug: 'core', owner: 'a', repo: 'b', permission: 'admin' }, exec())).toEqual({
      ok: true,
      org: 'acme',
      teamSlug: 'core',
      repo: 'a/b',
      permission: 'admin',
    })
    const [addUrl, addInit] = addFetch.mock.calls[0] as [string, RequestInit]
    expect(addUrl).toContain('/orgs/acme/teams/core/repos/a/b')
    expect(addInit.method).toBe('PUT')
    expect(JSON.parse(String(addInit.body))).toEqual({ permission: 'admin' })

    const removeFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const removeTool = createTools(new GithubClient({ token: 'ghp_test', fetchImpl: removeFetch })).find(t => t.name === 'github_remove_team_repo')!
    expect(await removeTool.execute({ org: 'acme', teamSlug: 'core', owner: 'a', repo: 'b' }, exec())).toEqual({
      ok: true,
      org: 'acme',
      teamSlug: 'core',
      repo: 'a/b',
    })
  })

  it('collaborator and team repo reads map 404 and writes map 404/422 to business failures', async () => {
    const missing = Object.fromEntries(createTools(new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })).map(t => [t.name, t]))
    expect(await missing['github_list_collaborators'].execute({ owner: 'a', repo: 'b' }, exec())).toEqual({ found: false, items: [] })
    expect(await missing['github_get_collaborator_permission'].execute({ owner: 'a', repo: 'b', username: 'nobody' }, exec())).toEqual({ found: false })
    expect(await missing['github_add_collaborator'].execute({ owner: 'a', repo: 'b', username: 'nobody' }, exec())).toMatchObject({ ok: false })
    expect(await missing['github_update_collaborator_permission'].execute({ owner: 'a', repo: 'b', username: 'nobody', permission: 'push' }, exec())).toMatchObject({ ok: false })
    expect(await missing['github_remove_collaborator'].execute({ owner: 'a', repo: 'b', username: 'nobody' }, exec())).toMatchObject({ ok: false })
    expect(await missing['github_add_team_repo'].execute({ org: 'acme', teamSlug: 'core', owner: 'a', repo: 'missing' }, exec())).toMatchObject({ ok: false })
    expect(await missing['github_remove_team_repo'].execute({ org: 'acme', teamSlug: 'core', owner: 'a', repo: 'missing' }, exec())).toMatchObject({ ok: false })
  })

  it('presentCall for stage 19 tools', () => {
    const defs = Object.fromEntries(createTools(new GithubClient()).map(t => [t.name, t])) as any
    expect(defs['github_list_collaborators'].presentCall({ owner: 'a', repo: 'b' })).toMatchObject({ kind: 'search' })
    expect(defs['github_get_collaborator_permission'].presentCall({ owner: 'a', repo: 'b', username: 'alice' })).toMatchObject({ kind: 'read' })
    expect(defs['github_add_collaborator'].presentCall({ owner: 'a', repo: 'b', username: 'alice' })).toMatchObject({ kind: 'edit' })
    expect(defs['github_update_collaborator_permission'].presentCall({ owner: 'a', repo: 'b', username: 'alice', permission: 'admin' })).toMatchObject({ kind: 'edit' })
    expect(defs['github_remove_collaborator'].presentCall({ owner: 'a', repo: 'b', username: 'alice' })).toMatchObject({ kind: 'edit' })
    expect(defs['github_add_team_repo'].presentCall({ org: 'acme', teamSlug: 'core', owner: 'a', repo: 'b' })).toMatchObject({ kind: 'edit' })
    expect(defs['github_remove_team_repo'].presentCall({ org: 'acme', teamSlug: 'core', owner: 'a', repo: 'b' })).toMatchObject({ kind: 'edit' })
  })
})
