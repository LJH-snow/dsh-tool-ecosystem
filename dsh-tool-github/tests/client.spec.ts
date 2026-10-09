import { describe, expect, it, vi } from 'vitest'
import sodium from 'libsodium-wrappers'
import { GithubClient, GithubError } from '../src/client.ts'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function makeLogZip(files: Array<{ name: string; content: string }>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let localSize = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const data = Buffer.from(file.content, 'utf8')
    const local = Buffer.alloc(30 + name.length + data.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    name.copy(local, 30)
    data.copy(local, 30 + name.length)

    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt32LE(0, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(localSize, 42)
    name.copy(central, 46)

    locals.push(local)
    centrals.push(central)
    localSize += local.length
  }
  const centralDir = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(centralDir.length, 12)
  eocd.writeUInt32LE(localSize, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, centralDir, eocd])
}

describe('GithubClient', () => {
  it('fetches repo metadata with auth header and base URL', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      full_name: 'deepseek-ai/deepseek-harness',
      description: 'agent harness',
      stargazers_count: 25000,
      language: 'TypeScript',
      license: { spdx_id: 'MIT' },
      homepage: 'https://deepseek.com',
      updated_at: '2026-08-13T00:00:00Z',
    }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const repo = await client.getRepo('deepseek-ai', 'deepseek-harness')

    expect(repo).toEqual({
      owner: 'deepseek-ai',
      name: 'deepseek-harness',
      description: 'agent harness',
      stars: 25000,
      language: 'TypeScript',
      license: 'MIT',
      homepage: 'https://deepseek.com',
      updatedAt: '2026-08-13T00:00:00Z',
    })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/deepseek-ai/deepseek-harness')
    expect(init.headers).toMatchObject({ authorization: 'Bearer ghp_test' })
  })

  it('throws GithubError with status 404 when repo does not exist', async () => {
    const client = new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    await expect(client.getRepo('nope', 'missing')).rejects.toThrow(GithubError)
  })

  it('throws GithubError 401 when token is invalid', async () => {
    const client = new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(401, {})) })
    await expect(client.getRepo('a', 'b')).rejects.toMatchObject({ status: 401 })
  })

  it('throws GithubError 403 on rate limiting', async () => {
    const client = new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(403, {})) })
    await expect(client.getRepo('a', 'b')).rejects.toMatchObject({ status: 403 })
  })

  it('honors baseUrl override without trailing slash', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      full_name: 'a/b', description: null, stargazers_count: 0, language: null,
      license: null, homepage: null, updated_at: '2026-01-01T00:00:00Z',
    }))
    const client = new GithubClient({ baseUrl: 'https://github.example/api/', fetchImpl })
    await client.getRepo('a', 'b')
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url.startsWith('https://github.example/api/repos/')).toBe(true)
  })

  it('searchRepos builds the query string and maps items', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      total_count: 42,
      items: [{ full_name: 'deepseek-ai/deepseek-harness', description: 'agent harness', stargazers_count: 25000, language: 'TypeScript', html_url: 'https://github.com/deepseek-ai/deepseek-harness' }],
    }))
    const client = new GithubClient({ fetchImpl })
    const result = await client.searchRepos('agent harness', { sort: 'stars', order: 'desc', perPage: 5 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/search/repositories?')
    expect(url).toContain('q=agent+harness')
    expect(url).toContain('sort=stars')
    expect(url).toContain('per_page=5')
    expect(result.total).toBe(42)
    expect(result.items[0]).toMatchObject({ fullName: 'deepseek-ai/deepseek-harness', stars: 25000 })
  })

  it('listIssues passes state, label, and per_page filters', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { number: 1, title: 'Bug', state: 'open', labels: [{ name: 'bug' }], created_at: '2026-01-01T00:00:00Z', user: { login: 'alice' }, html_url: 'https://github.com/a/b/issues/1' },
    ]))
    const client = new GithubClient({ fetchImpl })
    const issues = await client.listIssues('a', 'b', { state: 'open', label: 'bug', perPage: 3 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/repos/a/b/issues?')
    expect(url).toContain('state=open')
    expect(url).toContain('labels=bug')
    expect(url).toContain('per_page=3')
    expect(issues[0]).toMatchObject({ number: 1, title: 'Bug', labels: ['bug'], author: 'alice' })
  })

  it('searchCode requires the URLSearchParams shape and maps items', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      total_count: 7,
      items: [{ path: 'src/index.ts', repository: { full_name: 'a/b' }, html_url: 'https://github.com/a/b/blob/main/src/index.ts' }],
    }))
    const client = new GithubClient({ fetchImpl })
    const result = await client.searchCode('repo:a/b defineTool', { perPage: 5 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/search/code?')
    expect(result.items[0]).toMatchObject({ path: 'src/index.ts', repository: 'a/b' })
  })

  it('createPrDraft POSTs draft:true and returns created result', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { number: 12, html_url: 'https://github.com/a/b/pull/12', draft: true }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.createPrDraft('a', 'b', { title: 'My change', head: 'feat/x', base: 'main', body: 'Why' })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ title: 'My change', head: 'feat/x', base: 'main', body: 'Why', draft: true })
    expect(result).toEqual({ created: true, number: 12, url: 'https://github.com/a/b/pull/12' })
  })

  it('createPrDraft maps 422 to a created:false business value', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(422, {}))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.createPrDraft('a', 'b', { title: 'x', head: 'feat/x', base: 'main' })
    expect(result.created).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('hasToken reflects configured token', () => {
    expect(new GithubClient().hasToken()).toBe(false)
    expect(new GithubClient({ token: 'x' }).hasToken()).toBe(true)
  })
})

describe('GithubClient extended tools', () => {
  it('listPrs maps items and passes state/per_page', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { number: 5, title: 'Fix', state: 'open', draft: true, user: { login: 'bob' }, head: { ref: 'feat/x' }, base: { ref: 'main' }, created_at: '2026-01-02T00:00:00Z', html_url: 'https://github.com/a/b/pull/5' },
    ]))
    const client = new GithubClient({ fetchImpl })
    const prs = await client.listPrs('a', 'b', { state: 'open', perPage: 5 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/repos/a/b/pulls?')
    expect(url).toContain('state=open')
    expect(url).toContain('per_page=5')
    expect(prs[0]).toMatchObject({ number: 5, draft: true, headRef: 'feat/x', baseRef: 'main', author: 'bob' })
  })

  it('getFile requests the contents endpoint with optional ref', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      name: 'index.ts', path: 'src/index.ts', size: 42, content: 'aGVsbG8=', encoding: 'base64', html_url: 'https://x',
    }))
    const client = new GithubClient({ fetchImpl })
    const file = await client.getFile('a', 'b', 'src/index.ts', { ref: 'dev' })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/repos/a/b/contents/src%2Findex.ts?ref=dev')
    expect(file).toMatchObject({ name: 'index.ts', encoding: 'base64', content: 'aGVsbG8=' })
  })

  it('listCommits maps items and passes sha/author filters', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { sha: 'abcdef1234567890', commit: { message: 'Initial commit\nbody', author: { name: 'Alice', date: '2026-01-01T00:00:00Z' } }, html_url: 'https://github.com/a/b/commit/abcdef' },
    ]))
    const client = new GithubClient({ fetchImpl })
    const commits = await client.listCommits('a', 'b', { branch: 'main', author: 'alice', perPage: 3 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/repos/a/b/commits?')
    expect(url).toContain('sha=main')
    expect(url).toContain('author=alice')
    expect(commits[0]).toMatchObject({ sha: 'abcdef1', message: 'Initial commit', author: 'Alice' })
  })
})

describe('GithubClient write operations', () => {
  it('createIssue POSTs title/body/labels and returns ok', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { number: 7, html_url: 'https://github.com/a/b/issues/7' }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.createIssue('a', 'b', { title: 'Bug', body: 'details', labels: ['bug'] })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ title: 'Bug', body: 'details', labels: ['bug'] })
    expect(result).toEqual({ ok: true, number: 7, url: 'https://github.com/a/b/issues/7' })
  })

  it('createIssue maps 422 to a business failure value', async () => {
    const client = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(422, {})) })
    const result = await client.createIssue('a', 'b', { title: 'Duplicate' })
    expect(result.ok).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('commentOnIssue POSTs to the comments endpoint', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 99, html_url: 'https://github.com/a/b/issues/7#issuecomment-99' }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.commentOnIssue('a', 'b', 7, 'LGTM')
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/repos/a/b/issues/7/comments')
    expect(JSON.parse(String(init.body))).toEqual({ body: 'LGTM' })
    expect(result).toEqual({ ok: true, number: 99, url: 'https://github.com/a/b/issues/7#issuecomment-99' })
  })

  it('updateIssue PATCHes the state and maps 404', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { number: 7, html_url: 'https://github.com/a/b/issues/7' }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.updateIssue('a', 'b', 7, 'closed')
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ state: 'closed' })
    expect(result).toEqual({ ok: true, number: 7, url: 'https://github.com/a/b/issues/7' })

    const client404 = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    const missing = await client404.updateIssue('a', 'b', 999, 'closed')
    expect(missing).toMatchObject({ ok: false })
  })
})

describe('GithubClient stage 7', () => {
  it('mergePr PUTs merge_method and returns ok', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { merged: true, html_url: 'https://github.com/a/b/pull/5' }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.mergePr('a', 'b', 5, { mergeMethod: 'squash' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/repos/a/b/pulls/5/merge')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ merge_method: 'squash' })
    expect(result).toEqual({ ok: true, number: 5, url: 'https://github.com/a/b/pull/5' })
  })

  it('mergePr maps 405 and 409 to business failures', async () => {
    for (const status of [405, 409]) {
      const client = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(status, {})) })
      const result = await client.mergePr('a', 'b', 5)
      expect(result.ok).toBe(false)
      expect(result.reason).toBeTruthy()
    }
  })

  it('mergePr maps 404 to not found', async () => {
    const client = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    const result = await client.mergePr('a', 'b', 999)
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('not found') })
  })

  it('listReleases maps items', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { tag_name: 'v1.0.0', name: 'Release One', draft: false, prerelease: false, author: { login: 'carol' }, published_at: '2026-01-01T00:00:00Z', html_url: 'https://github.com/a/b/releases/v1' },
    ]))
    const client = new GithubClient({ fetchImpl })
    const releases = await client.listReleases('a', 'b', { perPage: 5 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/repos/a/b/releases?')
    expect(url).toContain('per_page=5')
    expect(releases[0]).toMatchObject({ tagName: 'v1.0.0', author: 'carol' })
  })

  it('listBranches maps items with short SHA', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { name: 'main', commit: { sha: 'abcdef1234567890' } },
      { name: 'dev', commit: { sha: '1234567890abcdef' } },
    ]))
    const client = new GithubClient({ fetchImpl })
    const branches = await client.listBranches('a', 'b', { perPage: 2 })
    expect(branches).toEqual([
      { name: 'main', sha: 'abcdef1' },
      { name: 'dev', sha: '1234567' },
    ])
  })
})

describe('GithubClient stage 8', () => {
  it('getIssue maps the issue detail', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      number: 3, title: 'Bug', state: 'open', user: { login: 'alice' }, created_at: '2026-01-01T00:00:00Z',
      labels: [{ name: 'bug' }], body: 'details', html_url: 'https://github.com/a/b/issues/3',
    }))
    const client = new GithubClient({ fetchImpl })
    const issue = await client.getIssue('a', 'b', 3)
    expect(issue).toEqual({
      number: 3, title: 'Bug', state: 'open', author: 'alice', createdAt: '2026-01-01T00:00:00Z',
      labels: ['bug'], body: 'details', url: 'https://github.com/a/b/issues/3',
    })
  })

  it('listIssueComments hits the issue comments endpoint', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { id: 1, user: { login: 'bob' }, created_at: '2026-01-02T00:00:00Z', body: 'hi', html_url: 'https://x/1' },
    ]))
    const client = new GithubClient({ fetchImpl })
    const comments = await client.listIssueComments('a', 'b', 3, { perPage: 5 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/repos/a/b/issues/3/comments?')
    expect(url).toContain('per_page=5')
    expect(comments[0]).toMatchObject({ id: 1, author: 'bob', body: 'hi' })
  })

  it('listPrComments hits the pulls comments endpoint', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { id: 2, user: { login: 'carol' }, created_at: '2026-01-03T00:00:00Z', body: 'looks good', html_url: 'https://x/2' },
    ]))
    const client = new GithubClient({ fetchImpl })
    const comments = await client.listPrComments('a', 'b', 9, { perPage: 5 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/repos/a/b/pulls/9/comments?')
    expect(comments[0]).toMatchObject({ id: 2, author: 'carol' })
  })
})

describe('GithubClient stage 9', () => {
  it('getUser maps the user profile', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      login: 'octocat', name: 'Octo Cat', bio: 'hello', followers: 100, following: 2,
      public_repos: 10, location: 'SF', blog: 'https://blog.example', html_url: 'https://github.com/octocat',
    }))
    const client = new GithubClient({ fetchImpl })
    const user = await client.getUser('octocat')
    expect(user).toEqual({
      login: 'octocat', name: 'Octo Cat', bio: 'hello', followers: 100, following: 2,
      publicRepos: 10, location: 'SF', blog: 'https://blog.example', url: 'https://github.com/octocat',
    })
  })

  it('listWorkflowRuns hits actions/runs with filters', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      workflow_runs: [{ id: 1, name: 'CI', head_branch: 'main', status: 'completed', conclusion: 'success', created_at: '2026-01-01T00:00:00Z', html_url: 'https://x/1' }],
    }))
    const client = new GithubClient({ fetchImpl })
    const runs = await client.listWorkflowRuns('a', 'b', { branch: 'main', status: 'success', perPage: 5 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/repos/a/b/actions/runs?')
    expect(url).toContain('branch=main')
    expect(url).toContain('status=success')
    expect(runs[0]).toMatchObject({ workflowName: 'CI', headBranch: 'main', conclusion: 'success' })
  })

  it('createBranch resolves the base ref and POSTs a new ref', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { object: { sha: 'abc123' } }))
      .mockResolvedValueOnce(jsonResponse(201, {}))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.createBranch('a', 'b', 'feat/x', 'heads/main')
    const [baseUrl, postUrl, postInit] = [fetchImpl.mock.calls[0][0] as string, fetchImpl.mock.calls[1][0] as string, fetchImpl.mock.calls[1][1] as RequestInit]
    expect(baseUrl).toContain('/git/ref/heads/main')
    expect(postUrl).toContain('/git/refs')
    expect(postInit.method).toBe('POST')
    expect(JSON.parse(String(postInit.body))).toEqual({ ref: 'refs/heads/feat/x', sha: 'abc123' })
    expect(result).toEqual({ ok: true, name: 'feat/x' })
  })

  it('createBranch maps 422 to a business failure', async () => {
    const client = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(422, {})) })
    const result = await client.createBranch('a', 'b', 'feat/x', 'heads/main')
    expect(result.ok).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('writeFile PUTs base64 content and returns the commit SHA', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { commit: { sha: 'abcdef123456' } }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.writeFile('a', 'b', 'docs/notes.md', 'hello', { message: 'add notes', branch: 'main' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/repos/a/b/contents/docs%2Fnotes.md')
    expect(init.method).toBe('PUT')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({ message: 'add notes', branch: 'main' })
    expect(body.content).toBe(Buffer.from('hello').toString('base64'))
    expect(result).toEqual({ ok: true, path: 'docs/notes.md', commitSha: 'abcdef1' })
  })

  it('writeFile maps 422/409 to a business failure', async () => {
    for (const status of [422, 409]) {
      const client = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(status, {})) })
      const result = await client.writeFile('a', 'b', 'x.md', 'y', { message: 'm' })
      expect(result.ok).toBe(false)
    }
  })
})

describe('GithubClient stage 10', () => {
  it('getReadme fetches and decodes base64 content, 404 → found:false', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      content: Buffer.from('# Hello').toString('base64'), encoding: 'base64', size: 7, html_url: 'https://x',
    }))
    const client = new GithubClient({ fetchImpl })
    const readme = await client.getReadme('a', 'b')
    expect(readme).toEqual({ found: true, content: '# Hello', size: 7, url: 'https://x' })

    const client404 = new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect(await client404.getReadme('a', 'b')).toEqual({ found: false })
  })

  it('listTags maps tags with short SHA', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { name: 'v1.0.0', commit: { sha: 'abcdef123456' } },
    ]))
    const client = new GithubClient({ fetchImpl })
    const tags = await client.listTags('a', 'b', { perPage: 5 })
    expect(tags).toEqual([{ name: 'v1.0.0', commitSha: 'abcdef1' }])
  })

  it('starRepo PUTs and unstarRepo DELETEs', async () => {
    const starFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const starClient = new GithubClient({ token: 'ghp_test', fetchImpl: starFetch })
    expect(await starClient.starRepo('a', 'b')).toEqual({ ok: true })
    expect(starFetch.mock.calls[0][1]).toMatchObject({ method: 'PUT' })
    expect(starFetch.mock.calls[0][0]).toContain('/user/starred/a/b')

    const unstarFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const unstarClient = new GithubClient({ token: 'ghp_test', fetchImpl: unstarFetch })
    expect(await unstarClient.unstarRepo('a', 'b')).toEqual({ ok: true })
    expect(unstarFetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE' })
  })

  it('starRepo maps 404 to a business failure', async () => {
    const client = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    const result = await client.starRepo('nope', 'missing')
    expect(result.ok).toBe(false)
  })

  it('createRelease POSTs release fields and maps 422', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 5, html_url: 'https://github.com/a/b/releases/v1' }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.createRelease('a', 'b', { tagName: 'v1.0.0', name: 'Release One', body: 'notes' })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({ tag_name: 'v1.0.0', name: 'Release One', body: 'notes', draft: false, prerelease: false })
    expect(result).toEqual({ ok: true, id: 5, url: 'https://github.com/a/b/releases/v1' })

    const client422 = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(422, {})) })
    const failed = await client422.createRelease('a', 'b', { tagName: 'v1' })
    expect(failed.ok).toBe(false)
  })
})

describe('GithubClient stage 11', () => {
  it('listWorkflows hits the workflows endpoint and maps items', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      total_count: 1,
      workflows: [{ id: 7, name: 'CI', path: '.github/workflows/ci.yml', state: 'active', updated_at: '2026-01-01T00:00:00Z', html_url: 'https://github.com/a/b/actions/workflows/ci.yml' }],
    }))
    const client = new GithubClient({ fetchImpl })
    const result = await client.listWorkflows('a', 'b', { perPage: 5 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/repos/a/b/actions/workflows?')
    expect(url).toContain('per_page=5')
    expect(result).toEqual({
      total: 1,
      items: [{ id: 7, name: 'CI', path: '.github/workflows/ci.yml', state: 'active', updatedAt: '2026-01-01T00:00:00Z', url: 'https://github.com/a/b/actions/workflows/ci.yml' }],
    })
  })

  it('getWorkflow maps the workflow detail', async () => {
    const client = new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(200, {
      id: 7, name: 'CI', path: '.github/workflows/ci.yml', state: 'active', updated_at: '2026-01-01T00:00:00Z', html_url: 'https://x',
    })) })
    const workflow = await client.getWorkflow('a', 'b', 7)
    expect(workflow).toMatchObject({ id: 7, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' })
  })

  it('getWorkflowRun maps the run detail', async () => {
    const client = new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(200, {
      id: 9, workflow_id: 7, name: 'CI', display_title: 'Build main', head_branch: 'main', head_sha: 'abcdef1234567890',
      status: 'completed', conclusion: 'success', event: 'push', actor: { login: 'alice' }, created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:01:00Z', run_started_at: '2026-01-01T00:00:10Z', html_url: 'https://x',
    })) })
    const run = await client.getWorkflowRun('a', 'b', 9)
    expect(run).toMatchObject({ id: 9, workflowId: 7, workflowName: 'CI', displayTitle: 'Build main', headBranch: 'main', conclusion: 'success', event: 'push', actor: 'alice' })
  })

  it('listWorkflowJobs maps jobs and steps', async () => {
    const client = new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(200, {
      total_count: 1,
      jobs: [{
        id: 10, name: 'build', status: 'completed', conclusion: 'success', started_at: '2026-01-01T00:00:00Z', completed_at: '2026-01-01T00:01:00Z', html_url: 'https://x/10',
        steps: [{ number: 1, name: 'Checkout', status: 'completed', conclusion: 'success', started_at: '2026-01-01T00:00:00Z', completed_at: '2026-01-01T00:00:05Z' }],
      }],
    })) })
    const result = await client.listWorkflowJobs('a', 'b', 9, { perPage: 50 })
    expect(result).toMatchObject({ found: true, items: [{ id: 10, name: 'build', steps: [{ number: 1, name: 'Checkout', status: 'completed' }] }] })
  })

  it('getWorkflowRunLogs parses the GitHub log archive', async () => {
    const zip = makeLogZip([
      { name: '0_build.txt', content: 'hello workflow\n' },
      { name: '1_test.txt', content: 'tests done\n' },
    ])
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(zip), { status: 200, headers: { 'content-type': 'application/zip' } }))
    const client = new GithubClient({ fetchImpl })
    const result = await client.getWorkflowRunLogs('a', 'b', 9)
    expect(result.found).toBe(true)
    expect(result.logs).toContain('hello workflow')
    expect(result.logs).toContain('tests done')
    expect(result.truncated).toBeUndefined()
  })

  it('rerunWorkflowRun and cancelWorkflowRun post and map 409', async () => {
    const rerunFetch = vi.fn(async () => new Response(null, { status: 201 }))
    const rerunClient = new GithubClient({ token: 'ghp_test', fetchImpl: rerunFetch })
    expect(await rerunClient.rerunWorkflowRun('a', 'b', 9)).toEqual({ ok: true, runId: 9 })
    expect(rerunFetch.mock.calls[0][0]).toContain('/actions/runs/9/rerun')
    expect(rerunFetch.mock.calls[0][1]).toMatchObject({ method: 'POST' })

    const cancelFetch = vi.fn(async () => new Response(null, { status: 202 }))
    const cancelClient = new GithubClient({ token: 'ghp_test', fetchImpl: cancelFetch })
    expect(await cancelClient.cancelWorkflowRun('a', 'b', 9)).toEqual({ ok: true, runId: 9 })
    expect(cancelFetch.mock.calls[0][0]).toContain('/actions/runs/9/cancel')

    const blockedClient = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(409, {})) })
    expect((await blockedClient.rerunWorkflowRun('a', 'b', 9)).ok).toBe(false)
    expect((await blockedClient.cancelWorkflowRun('a', 'b', 9)).ok).toBe(false)
  })

  it('getPullRequest maps the PR detail', async () => {
    const client = new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(200, {
      number: 5, title: 'Fix bug', state: 'open', draft: false, user: { login: 'bob' },
      head: { ref: 'feat/x', sha: 'abcdef1' }, base: { ref: 'main', sha: '1234567' }, body: 'details',
      mergeable: true, merged: false, review_decision: 'APPROVED', additions: 10, deletions: 2, changed_files: 3,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', merged_at: null, html_url: 'https://x',
    })) })
    const pr = await client.getPullRequest('a', 'b', 5)
    expect(pr).toMatchObject({ number: 5, title: 'Fix bug', author: 'bob', headRef: 'feat/x', baseRef: 'main', reviewDecision: 'APPROVED', changedFiles: 3 })
  })

  it('listPullRequestReviews maps review items', async () => {
    const client = new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(200, [
      { id: 12, user: { login: 'carol' }, state: 'APPROVED', body: 'LGTM', submitted_at: '2026-01-02T00:00:00Z', commit_id: 'abcdef1', html_url: 'https://x/12' },
    ])) })
    const reviews = await client.listPullRequestReviews('a', 'b', 5, { perPage: 5 })
    expect(reviews).toEqual([{ id: 12, author: 'carol', state: 'APPROVED', body: 'LGTM', submittedAt: '2026-01-02T00:00:00Z', commitSha: 'abcdef1', url: 'https://x/12' }])
  })

  it('requestPrReviewers posts reviewers and maps 422', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { number: 5, requested_reviewers: [{ login: 'alice' }, { login: 'bob' }] }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.requestPrReviewers('a', 'b', 5, { reviewers: ['alice', 'bob'], teamReviewers: ['core'] })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ reviewers: ['alice', 'bob'], team_reviewers: ['core'] })
    expect(result).toEqual({ ok: true, prNumber: 5, reviewers: ['alice', 'bob'] })

    const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(422, {})) })
    expect((await failed.requestPrReviewers('a', 'b', 5, { reviewers: ['nope'] })).ok).toBe(false)
  })

  it('submitPrReview posts the review payload and maps 422', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 30, state: 'APPROVED', html_url: 'https://x/30' }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.submitPrReview('a', 'b', 5, { body: 'LGTM', event: 'APPROVE' })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ body: 'LGTM', event: 'APPROVE' })
    expect(result).toEqual({ ok: true, reviewId: 30, state: 'APPROVED', url: 'https://x/30' })

    const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(422, {})) })
    expect((await failed.submitPrReview('a', 'b', 5, { body: 'x', event: 'COMMENT' })).ok).toBe(false)
  })
})

describe('GithubClient stage 12', () => {
  it('dispatchWorkflow posts to the workflow dispatch endpoint', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.dispatchWorkflow('a', 'b', 7, { ref: 'main', inputs: { version: '1.2.3' } })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/repos/a/b/actions/workflows/7/dispatches')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ ref: 'main', inputs: { version: '1.2.3' } })
    expect(result).toEqual({ ok: true, workflowId: 7 })
  })

  it('dispatchWorkflow omits empty inputs and maps 422', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    await client.dispatchWorkflow('a', 'b', 7, { ref: 'main', inputs: {} })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ ref: 'main' })

    const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(422, {})) })
    expect((await failed.dispatchWorkflow('a', 'b', 7, { ref: 'nope' })).ok).toBe(false)
  })
})

describe('GithubClient stage 13', () => {
  it('createRepository posts to the user repos endpoint and maps 422', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { full_name: 'alice/new-repo', html_url: 'https://github.com/alice/new-repo' }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.createRepository({ name: 'new-repo', description: 'tools', privateRepo: true, autoInit: true })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/user/repos')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ name: 'new-repo', description: 'tools', private: true, auto_init: true })
    expect(result).toEqual({ ok: true, fullName: 'alice/new-repo', url: 'https://github.com/alice/new-repo' })

    const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(422, {})) })
    expect((await failed.createRepository({ name: 'dup' })).ok).toBe(false)
  })

  it('createRepository routes org repos to the org endpoint', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { full_name: 'acme/tools', html_url: 'https://github.com/acme/tools' }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    await client.createRepository({ owner: 'acme', name: 'tools' })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/orgs/acme/repos')
  })

  it('setRepoTopic PUTs the complete topic list', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { names: ['agent', 'github'] }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.setRepoTopic('a', 'b', ['agent', 'github'])
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/repos/a/b/topics')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ names: ['agent', 'github'] })
    expect(result).toEqual({ ok: true, names: ['agent', 'github'] })
  })

  it('listGists maps files, owner, and timestamps', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { id: 'abc', description: 'notes', files: { 'a.txt': {}, 'b.md': {} }, owner: { login: 'alice' }, public: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', html_url: 'https://gist.github.com/alice/abc' },
    ]))
    const client = new GithubClient({ fetchImpl })
    const result = await client.listGists({ perPage: 5 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/gists?')
    expect(url).toContain('per_page=5')
    expect(result[0]).toMatchObject({ id: 'abc', files: ['a.txt', 'b.md'], owner: 'alice', public: true, url: 'https://gist.github.com/alice/abc' })
  })

  it('createGist builds the files object and maps 422', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 'xyz', html_url: 'https://gist.github.com/alice/xyz' }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.createGist({ description: 'snippet', publicGist: true, files: [{ filename: 'hello.txt', content: 'hello' }] })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ description: 'snippet', public: true, files: { 'hello.txt': { content: 'hello' } } })
    expect(result).toEqual({ ok: true, id: 'xyz', url: 'https://gist.github.com/alice/xyz' })

    const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(422, {})) })
    expect((await failed.createGist({ files: [{ filename: 'x', content: 'y' }] })).ok).toBe(false)
  })
})

describe('GithubClient stage 14', () => {
  it('listRepoVariables maps variables and per_page', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      total_count: 1,
      variables: [{ name: 'DEPLOY_TARGET', value: 'prod', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' }],
    }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.listRepoVariables('a', 'b', { perPage: 5 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/repos/a/b/actions/variables?')
    expect(url).toContain('per_page=5')
    expect(result).toEqual({ found: true, total: 1, items: [{ name: 'DEPLOY_TARGET', value: 'prod', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' }] })

    const missing = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect(await missing.listRepoVariables('a', 'b')).toEqual({ found: false, total: 0, items: [] })
  })

  it('setRepoVariable creates and falls back to update on 409', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      if (String((init as RequestInit)?.method) === 'POST') return jsonResponse(409, {})
      return new Response(null, { status: 204 })
    })
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.setRepoVariable('a', 'b', 'DEPLOY_TARGET', 'prod')
    expect(result).toMatchObject({ ok: true, name: 'DEPLOY_TARGET', updated: true })
    expect(fetchImpl.mock.calls).toHaveLength(2)
    const [firstUrl, firstInit] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const [secondUrl, secondInit] = fetchImpl.mock.calls[1] as [string, RequestInit]
    expect(firstUrl).toContain('/actions/variables')
    expect(JSON.parse(String(firstInit.body))).toEqual({ name: 'DEPLOY_TARGET', value: 'prod' })
    expect(secondUrl).toContain('/actions/variables/DEPLOY_TARGET')
    expect(secondInit.method).toBe('PATCH')
  })

  it('deleteRepoVariable and deleteRepoSecret return ok on 204', async () => {
    const variableClient = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => new Response(null, { status: 204 })) })
    expect(await variableClient.deleteRepoVariable('a', 'b', 'DEPLOY_TARGET')).toEqual({ ok: true, name: 'DEPLOY_TARGET' })

    const secretClient = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => new Response(null, { status: 204 })) })
    expect(await secretClient.deleteRepoSecret('a', 'b', 'API_KEY')).toEqual({ ok: true, name: 'API_KEY' })
  })

  it('listRepoSecrets maps names and timestamps', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      total_count: 1,
      secrets: [{ name: 'API_KEY', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' }],
    }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.listRepoSecrets('a', 'b', { perPage: 5 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/repos/a/b/actions/secrets?')
    expect(result).toEqual({ found: true, total: 1, items: [{ name: 'API_KEY', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' }] })
  })

  it('getBranchProtection maps rules and returns found:false on 404', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      url: 'https://api.github.com/repos/a/b/branches/main/protection',
      required_status_checks: { strict: true, checks: [{ context: 'ci' }] },
      enforce_admins: { enabled: true },
      required_pull_request_reviews: { required_approving_review_count: 1, dismiss_stale_reviews: true, require_code_owner_reviews: true },
      restrictions: null,
      required_linear_history: { enabled: true },
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
      required_conversation_resolution: { enabled: false },
    }))
    const client = new GithubClient({ fetchImpl })
    const result = await client.getBranchProtection('a', 'b', 'main')
    expect(result).toMatchObject({ found: true, enabled: true, contexts: ['ci'], strict: true, enforceAdmins: true, requiredApprovingReviewCount: 1, requiredLinearHistory: true })

    const missing = new GithubClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect(await missing.getBranchProtection('a', 'b', 'main')).toEqual({ found: false })
  })

  it('setBranchProtection PUTs the rule payload and deleteBranchProtection returns ok', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { url: 'https://api.github.com/repos/a/b/branches/main/protection' }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.setBranchProtection('a', 'b', 'main', {
      requiredStatusChecks: ['ci'],
      strictRequiredStatusChecks: false,
      requiredApprovingReviewCount: 1,
      dismissStaleReviews: true,
      requireCodeOwnerReviews: true,
    })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/repos/a/b/branches/main/protection')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toMatchObject({
      required_status_checks: { strict: false, contexts: ['ci'] },
      enforce_admins: true,
      required_pull_request_reviews: { required_approving_review_count: 1, dismiss_stale_reviews: true, require_code_owner_reviews: true },
    })
    expect(result).toMatchObject({ ok: true, branch: 'main' })

    const deleteClient = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => new Response(null, { status: 204 })) })
    expect(await deleteClient.deleteBranchProtection('a', 'b', 'main')).toEqual({ ok: true, branch: 'main' })
  })

  it('setRepoSecret encrypts the value with the repository public key', async () => {
    await sodium.ready
    const keyPair = sodium.crypto_box_keypair()
    const fetchImpl = vi.fn(async (url, init) => {
      if (String((init as RequestInit)?.method) === 'GET') {
        return jsonResponse(200, { key_id: 'key-1', key: sodium.to_base64(keyPair.publicKey) })
      }
      return new Response(null, { status: 204 })
    })
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.setRepoSecret('a', 'b', 'API_KEY', 'super-secret')
    expect(result).toEqual({ ok: true, name: 'API_KEY' })
    expect(fetchImpl.mock.calls).toHaveLength(2)
    const [keyUrl] = fetchImpl.mock.calls[0] as [string]
    expect(keyUrl).toContain('/actions/secrets/public-key')
    const [putUrl, putInit] = fetchImpl.mock.calls[1] as [string, RequestInit]
    expect(putUrl).toContain('/actions/secrets/API_KEY')
    expect(putInit.method).toBe('PUT')
    const body = JSON.parse(String(putInit.body)) as { encrypted_value: string; key_id: string }
    expect(body.key_id).toBe('key-1')
    expect(sodium.crypto_box_seal_open(sodium.from_base64(body.encrypted_value), keyPair.publicKey, keyPair.privateKey, 'text')).toBe('super-secret')
  })
})

describe('GithubClient stage 15', () => {
  it('listMilestones builds the query and maps items', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      {
        number: 3,
        title: 'v1',
        state: 'open',
        open_issues: 2,
        closed_issues: 5,
        due_on: '2026-09-01T00:00:00Z',
        description: null,
        html_url: 'https://github.com/a/b/milestone/3',
      },
    ]))
    const client = new GithubClient({ fetchImpl })
    const result = await client.listMilestones('a', 'b', { state: 'all', perPage: 50 })
    expect(result).toEqual([{
      number: 3,
      title: 'v1',
      state: 'open',
      openIssues: 2,
      closedIssues: 5,
      dueOn: '2026-09-01T00:00:00Z',
      description: '',
      url: 'https://github.com/a/b/milestone/3',
    }])
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/repos/a/b/milestones?')
    expect(url).toContain('state=all')
    expect(url).toContain('per_page=50')
  })

  it('setIssueMilestone PATCHes the number, clears with null, and maps 404/422', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { number: 8, milestone: { number: 3 } }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.setIssueMilestone('a', 'b', 8, { milestoneNumber: 3 })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/repos/a/b/issues/8')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ milestone: 3 })
    expect(result).toEqual({ ok: true, number: 8, milestoneNumber: 3 })

    const clearFetch = vi.fn(async () => jsonResponse(200, { number: 8, milestone: null }))
    const clearClient = new GithubClient({ token: 'ghp_test', fetchImpl: clearFetch })
    const cleared = await clearClient.setIssueMilestone('a', 'b', 8, { clear: true })
    const [, clearInit] = clearFetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(clearInit.body))).toEqual({ milestone: null })
    expect(cleared).toEqual({ ok: true, number: 8, milestoneNumber: null })

    for (const status of [404, 422]) {
      const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(status, {})) })
      expect((await failed.setIssueMilestone('a', 'b', 8, { milestoneNumber: 9 })).ok).toBe(false)
    }
  })

  it('setIssueLabels PATCHes the complete label list and maps errors', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { number: 8, labels: [{ name: 'bug' }, { name: 'agent' }] }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.setIssueLabels('a', 'b', 8, ['bug', 'agent'])
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ labels: ['bug', 'agent'] })
    expect(result).toEqual({ ok: true, number: 8, labels: ['bug', 'agent'] })

    const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(422, {})) })
    expect((await failed.setIssueLabels('a', 'b', 8, ['nope'])).ok).toBe(false)
  })

  it('addIssueAssignees POSTs to the assignees endpoint', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { number: 8, assignees: [{ login: 'alice' }] }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.addIssueAssignees('a', 'b', 8, ['alice'])
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/repos/a/b/issues/8/assignees')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ assignees: ['alice'] })
    expect(result).toEqual({ ok: true, number: 8, assignees: ['alice'] })

    const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await failed.addIssueAssignees('a', 'b', 8, ['nobody'])).ok).toBe(false)
  })

  it('replyPrComment POSTs the reply with in_reply_to and maps errors', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 99, html_url: 'https://github.com/a/b/pull/8#discussion_r99' }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.replyPrComment('a', 'b', 8, { commentId: 12, body: 'Thanks' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/repos/a/b/pulls/8/comments')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ body: 'Thanks', in_reply_to: 12 })
    expect(result).toEqual({ ok: true, commentId: 99, url: 'https://github.com/a/b/pull/8#discussion_r99' })

    for (const status of [404, 422]) {
      const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(status, {})) })
      expect((await failed.replyPrComment('a', 'b', 8, { commentId: 12, body: 'x' })).ok).toBe(false)
    }
  })
})

describe('GithubClient stage 16', () => {
  it('listArtifacts builds the repo query and maps workflow metadata', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
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
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.listArtifacts('a', 'b', { name: 'build', perPage: 50 })
    expect(result).toEqual({
      total: 1,
      items: [{
        id: 10,
        name: 'build.zip',
        sizeInBytes: 5120,
        expired: false,
        createdAt: '2026-08-25T00:00:00Z',
        expiresAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-08-25T00:01:00Z',
        archiveUrl: 'https://archive.example/build.zip',
        url: 'https://api.github.com/repos/a/b/actions/artifacts/10',
        workflowRunId: 7,
        headBranch: 'main',
        headSha: 'abc123',
      }],
    })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/repos/a/b/actions/artifacts?')
    expect(url).toContain('name=build')
    expect(url).toContain('per_page=50')
  })

  it('listRunArtifacts hits the run-specific endpoint', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { total_count: 0, artifacts: [] }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    expect(await client.listRunArtifacts('a', 'b', 9, { perPage: 5 })).toEqual({ total: 0, items: [] })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/repos/a/b/actions/runs/9/artifacts?')
    expect(url).toContain('per_page=5')
  })

  it('getArtifact maps one artifact and deleteArtifact maps 204 and 404', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      id: 10,
      name: 'build.zip',
      size_in_bytes: 5120,
      expired: true,
      created_at: '2026-08-25T00:00:00Z',
      expires_at: null,
      updated_at: '2026-08-25T00:01:00Z',
      archive_download_url: null,
      url: 'https://api.github.com/repos/a/b/actions/artifacts/10',
      workflow_run: null,
    }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    expect(await client.getArtifact('a', 'b', 10)).toMatchObject({ id: 10, name: 'build.zip', expired: true, workflowRunId: null })

    const deleteClient = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => new Response(null, { status: 204 })) })
    expect(await deleteClient.deleteArtifact('a', 'b', 10)).toEqual({ ok: true, artifactId: 10 })

    const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await failed.deleteArtifact('a', 'b', 10)).ok).toBe(false)
  })

  it('listEnvironments maps protection rules and policy and returns not found on 404', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      total_count: 1,
      environments: [{
        id: 5,
        name: 'prod',
        url: 'https://api.github.com/repos/a/b/environments/prod',
        html_url: 'https://github.com/a/b/environments/prod',
        created_at: '2026-08-25T00:00:00Z',
        updated_at: '2026-08-25T00:01:00Z',
        protection_rules: [{
          id: 1,
          type: 'wait_timer',
          wait_timer: 30,
          prevent_self_review: true,
          reviewers: null,
        }],
        deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
      }],
    }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.listEnvironments('a', 'b', { perPage: 10 })
    expect(result).toEqual({
      found: true,
      total: 1,
      items: [{
        id: 5,
        name: 'prod',
        url: 'https://api.github.com/repos/a/b/environments/prod',
        htmlUrl: 'https://github.com/a/b/environments/prod',
        createdAt: '2026-08-25T00:00:00Z',
        updatedAt: '2026-08-25T00:01:00Z',
        protectionRules: [{ id: 1, type: 'wait_timer', waitTimer: 30, preventSelfReview: true, reviewers: [] }],
        protectedBranches: true,
        customBranchPolicies: false,
      }],
    })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/repos/a/b/environments?')
    expect(url).toContain('per_page=10')

    const missing = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect(await missing.listEnvironments('a', 'b')).toEqual({ found: false, total: 0, items: [] })
  })

  it('getEnvironment and updateEnvironment map settings and errors', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      id: 5,
      name: 'prod',
      url: 'https://api.github.com/repos/a/b/environments/prod',
      html_url: 'https://github.com/a/b/environments/prod',
      created_at: '2026-08-25T00:00:00Z',
      updated_at: '2026-08-25T00:01:00Z',
      protection_rules: [],
      deployment_branch_policy: null,
    }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    expect(await client.getEnvironment('a', 'b', 'prod')).toMatchObject({ id: 5, name: 'prod', protectedBranches: null })

    const updateFetch = vi.fn(async () => jsonResponse(200, {
      id: 5,
      name: 'prod',
      url: 'https://api.github.com/repos/a/b/environments/prod',
      html_url: 'https://github.com/a/b/environments/prod',
      created_at: '2026-08-25T00:00:00Z',
      updated_at: '2026-08-25T00:01:00Z',
      protection_rules: [],
      deployment_branch_policy: null,
    }))
    const updateClient = new GithubClient({ token: 'ghp_test', fetchImpl: updateFetch })
    const result = await updateClient.updateEnvironment('a', 'b', 'prod', {
      waitTimer: 15,
      preventSelfReview: true,
      reviewers: [{ type: 'User', id: 2 }],
      protectedBranches: true,
    })
    const [updateUrl, updateInit] = updateFetch.mock.calls[0] as [string, RequestInit]
    expect(updateUrl).toContain('/repos/a/b/environments/prod')
    expect(updateInit.method).toBe('PUT')
    expect(JSON.parse(String(updateInit.body))).toEqual({
      wait_timer: 15,
      prevent_self_review: true,
      reviewers: [{ type: 'User', id: 2 }],
      deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
    })
    expect(result).toEqual({ ok: true, name: 'prod', url: 'https://github.com/a/b/environments/prod' })

    const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(422, {})) })
    expect((await failed.updateEnvironment('a', 'b', 'prod', { waitTimer: 30 })).ok).toBe(false)
  })

  it('deleteEnvironment deletes and maps errors', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    expect(await client.deleteEnvironment('a', 'b', 'prod')).toEqual({ ok: true, name: 'prod' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/repos/a/b/environments/prod')
    expect(init.method).toBe('DELETE')

    const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await failed.deleteEnvironment('a', 'b', 'prod')).ok).toBe(false)
  })
})

describe('GithubClient stage 17', () => {
  it('getOrg maps organization profile fields', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      login: 'acme',
      name: 'Acme',
      description: 'dev tools',
      public_repos: 12,
      total_private_repos: 3,
      location: 'Shanghai',
      blog: 'https://acme.dev',
      created_at: '2020-01-01T00:00:00Z',
      html_url: 'https://github.com/acme',
    }))
    const client = new GithubClient({ fetchImpl })
    expect(await client.getOrg('acme')).toEqual({
      login: 'acme',
      name: 'Acme',
      description: 'dev tools',
      publicRepos: 12,
      totalPrivateRepos: 3,
      location: 'Shanghai',
      blog: 'https://acme.dev',
      createdAt: '2020-01-01T00:00:00Z',
      url: 'https://github.com/acme',
    })
    expect(fetchImpl.mock.calls[0][0]).toContain('/orgs/acme')
  })

  it('listOrgRepos builds the query and maps repository metadata', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [{
      full_name: 'acme/tools',
      name: 'tools',
      description: 'agent tools',
      stargazers_count: 10,
      language: 'TypeScript',
      visibility: 'public',
      fork: false,
      private: false,
      updated_at: '2026-08-25T00:00:00Z',
      html_url: 'https://github.com/acme/tools',
    }]))
    const client = new GithubClient({ fetchImpl })
    expect(await client.listOrgRepos('acme', { type: 'all', perPage: 50 })).toEqual([{
      fullName: 'acme/tools',
      owner: 'acme',
      name: 'tools',
      description: 'agent tools',
      stars: 10,
      language: 'TypeScript',
      visibility: 'public',
      fork: false,
      privateRepo: false,
      updatedAt: '2026-08-25T00:00:00Z',
      url: 'https://github.com/acme/tools',
    }])
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/orgs/acme/repos?')
    expect(url).toContain('type=all')
    expect(url).toContain('per_page=50')
  })

  it('listOrgMembers and listOrgTeams map member and team items', async () => {
    const memberFetch = vi.fn(async () => jsonResponse(200, [{
      login: 'alice',
      id: 1,
      avatar_url: 'https://avatar.example/alice.png',
      html_url: 'https://github.com/alice',
    }]))
    const memberClient = new GithubClient({ token: 'ghp_test', fetchImpl: memberFetch })
    expect(await memberClient.listOrgMembers('acme', { role: 'admin', perPage: 50 })).toEqual([{
      login: 'alice',
      id: 1,
      avatarUrl: 'https://avatar.example/alice.png',
      url: 'https://github.com/alice',
    }])
    expect(String(memberFetch.mock.calls[0][0])).toContain('role=admin')

    const teamFetch = vi.fn(async () => jsonResponse(200, [{
      id: 7,
      name: 'Core',
      slug: 'core',
      description: 'core maintainers',
      privacy: 'closed',
      permission: 'admin',
      url: 'https://api.github.com/orgs/acme/teams/core',
      html_url: 'https://github.com/orgs/acme/teams/core',
      members_count: 3,
      repos_count: 5,
    }]))
    const teamClient = new GithubClient({ token: 'ghp_test', fetchImpl: teamFetch })
    expect(await teamClient.listOrgTeams('acme', { perPage: 20 })).toEqual([{
      id: 7,
      name: 'Core',
      slug: 'core',
      description: 'core maintainers',
      privacy: 'closed',
      permission: 'admin',
      url: 'https://api.github.com/orgs/acme/teams/core',
      htmlUrl: 'https://github.com/orgs/acme/teams/core',
      membersCount: 3,
      reposCount: 5,
    }])
  })

  it('getTeam, listTeamMembers, and listTeamRepos map team-scoped data', async () => {
    const teamFetch = vi.fn(async () => jsonResponse(200, {
      id: 7,
      name: 'Core',
      slug: 'core',
      description: null,
      privacy: 'closed',
      permission: 'pull',
      url: 'https://api.github.com/orgs/acme/teams/core',
      html_url: 'https://github.com/orgs/acme/teams/core',
      members_count: null,
      repos_count: null,
    }))
    const teamClient = new GithubClient({ token: 'ghp_test', fetchImpl: teamFetch })
    expect(await teamClient.getTeam('acme', 'core')).toMatchObject({ id: 7, slug: 'core', permission: 'pull' })

    const memberFetch = vi.fn(async () => jsonResponse(200, [{ login: 'bob', id: 2, avatar_url: 'https://avatar', html_url: 'https://github.com/bob' }]))
    const memberClient = new GithubClient({ token: 'ghp_test', fetchImpl: memberFetch })
    expect(await memberClient.listTeamMembers('acme', 'core', { role: 'member', perPage: 10 })).toEqual([{ login: 'bob', id: 2, avatarUrl: 'https://avatar', url: 'https://github.com/bob' }])
    expect(String(memberFetch.mock.calls[0][0])).toContain('/teams/core/members?')
    expect(String(memberFetch.mock.calls[0][0])).toContain('role=member')

    const repoFetch = vi.fn(async () => jsonResponse(200, [{
      full_name: 'acme/tools', name: 'tools', description: null, stargazers_count: 0, language: null,
      visibility: 'public', fork: false, private: false, updated_at: '2026-08-25T00:00:00Z', html_url: 'https://github.com/acme/tools',
    }]))
    const repoClient = new GithubClient({ token: 'ghp_test', fetchImpl: repoFetch })
    expect(await repoClient.listTeamRepos('acme', 'core')).toMatchObject([{ fullName: 'acme/tools', privateRepo: false }])
    expect(String(repoFetch.mock.calls[0][0])).toContain('/teams/core/repos?')
  })

  it('setTeamMembership PUTs the role and removeTeamMembership deletes', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { url: 'https://api.github.com/orgs/acme/teams/core/memberships/alice', role: 'maintainer', state: 'active' }))
    const client = new GithubClient({ token: 'ghp_test', fetchImpl })
    const result = await client.setTeamMembership('acme', 'core', 'alice', { role: 'maintainer' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/orgs/acme/teams/core/memberships/alice')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ role: 'maintainer' })
    expect(result).toEqual({ ok: true, username: 'alice', role: 'maintainer', state: 'active' })

    const removeFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const removeClient = new GithubClient({ token: 'ghp_test', fetchImpl: removeFetch })
    expect(await removeClient.removeTeamMembership('acme', 'core', 'alice')).toEqual({ ok: true, username: 'alice' })
    expect(removeFetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE' })

    const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await failed.setTeamMembership('acme', 'core', 'alice')).ok).toBe(false)
    expect((await failed.removeTeamMembership('acme', 'core', 'alice')).ok).toBe(false)
  })
})

describe('GithubClient stage 18', () => {
  it('listRepoWebhooks and getRepoWebhook map webhook data', async () => {
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
    const expected = {
      id: 12,
      name: 'web',
      active: true,
      events: ['push'],
      config: { url: 'https://example.com/hook', contentType: 'json', insecureSsl: '1' },
      url: 'https://api.github.com/repos/a/b/hooks/12',
      pingUrl: 'https://api.github.com/repos/a/b/hooks/12/pings',
      deliveriesUrl: 'https://api.github.com/repos/a/b/hooks/12/deliveries',
      testUrl: 'https://api.github.com/repos/a/b/hooks/12/test',
      createdAt: '2026-08-25T00:00:00Z',
      updatedAt: '2026-08-25T01:00:00Z',
    }

    const listFetch = vi.fn(async () => jsonResponse(200, [rawWebhook]))
    const listClient = new GithubClient({ token: 'ghp_test', fetchImpl: listFetch })
    expect(await listClient.listRepoWebhooks('a', 'b', { perPage: 50 })).toEqual([expected])
    expect(String(listFetch.mock.calls[0][0])).toContain('/repos/a/b/hooks?')
    expect(String(listFetch.mock.calls[0][0])).toContain('per_page=50')

    const getFetch = vi.fn(async () => jsonResponse(200, rawWebhook))
    const getClient = new GithubClient({ token: 'ghp_test', fetchImpl: getFetch })
    expect(await getClient.getRepoWebhook('a', 'b', 12)).toEqual(expected)
    expect(String(getFetch.mock.calls[0][0])).toContain('/repos/a/b/hooks/12')
  })

  it('repo webhook writes send the expected POST and PATCH bodies', async () => {
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

    const createFetch = vi.fn(async () => jsonResponse(201, rawWebhook))
    const createClient = new GithubClient({ token: 'ghp_test', fetchImpl: createFetch })
    const created = await createClient.createRepoWebhook('a', 'b', {
      url: 'https://example.com/hook',
      contentType: 'form',
      secret: 'secret',
      insecureSsl: true,
      events: ['push'],
      active: false,
    })
    expect(created).toEqual({ ok: true, id: 12, url: 'https://api.github.com/repos/a/b/hooks/12' })
    const [createUrl, createInit] = createFetch.mock.calls[0] as [string, RequestInit]
    expect(createUrl).toContain('/repos/a/b/hooks')
    expect(createInit.method).toBe('POST')
    expect(JSON.parse(String(createInit.body))).toEqual({
      name: 'web',
      config: { url: 'https://example.com/hook', content_type: 'form', secret: 'secret', insecure_ssl: '1' },
      events: ['push'],
      active: false,
    })

    const updateFetch = vi.fn(async () => jsonResponse(200, { ...rawWebhook, url: 'https://api.github.com/repos/a/b/hooks/12' }))
    const updateClient = new GithubClient({ token: 'ghp_test', fetchImpl: updateFetch })
    const updated = await updateClient.updateRepoWebhook('a', 'b', 12, {
      url: 'https://example.com/new',
      contentType: 'json',
      addEvents: ['issues'],
      removeEvents: ['pull_request'],
      active: true,
    })
    expect(updated).toEqual({ ok: true, id: 12, url: 'https://api.github.com/repos/a/b/hooks/12' })
    const [, updateInit] = updateFetch.mock.calls[0] as [string, RequestInit]
    expect(updateInit.method).toBe('PATCH')
    expect(JSON.parse(String(updateInit.body))).toEqual({
      config: { url: 'https://example.com/new', content_type: 'json' },
      add_events: ['issues'],
      remove_events: ['pull_request'],
      active: true,
    })
  })

  it('repo webhook delete/ping and webhook failure paths', async () => {
    const pingFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const pingClient = new GithubClient({ token: 'ghp_test', fetchImpl: pingFetch })
    expect(await pingClient.pingRepoWebhook('a', 'b', 12)).toEqual({ ok: true, id: 12 })
    expect(pingFetch.mock.calls[0][1]).toMatchObject({ method: 'POST' })
    expect(String(pingFetch.mock.calls[0][0])).toContain('/repos/a/b/hooks/12/pings')

    const deleteFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const deleteClient = new GithubClient({ token: 'ghp_test', fetchImpl: deleteFetch })
    expect(await deleteClient.deleteRepoWebhook('a', 'b', 12)).toEqual({ ok: true, id: 12 })
    expect(deleteFetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE' })

    const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await failed.createRepoWebhook('a', 'b', { url: 'https://example.com/hook', contentType: 'json' })).ok).toBe(false)
    expect((await failed.updateRepoWebhook('a', 'b', 12, { url: 'https://example.com/new' })).ok).toBe(false)
    expect((await failed.pingRepoWebhook('a', 'b', 12)).ok).toBe(false)
    expect((await failed.deleteRepoWebhook('a', 'b', 12)).ok).toBe(false)
  })

  it('release asset reads map asset metadata', async () => {
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
    const expected = {
      id: 99,
      name: 'plugin.zip',
      label: 'Linux binary',
      sizeInBytes: 1234,
      downloadCount: 7,
      state: 'uploaded',
      contentType: 'application/zip',
      createdAt: '2026-08-25T00:00:00Z',
      updatedAt: '2026-08-25T02:00:00Z',
      downloadUrl: 'https://api.github.com/repos/a/b/releases/assets/99',
      browserDownloadUrl: 'https://github.com/a/b/releases/download/v1/plugin.zip',
    }

    const listFetch = vi.fn(async () => jsonResponse(200, [rawAsset]))
    const listClient = new GithubClient({ token: 'ghp_test', fetchImpl: listFetch })
    expect(await listClient.listReleaseAssets('a', 'b', 5, { perPage: 10 })).toEqual([expected])
    expect(String(listFetch.mock.calls[0][0])).toContain('/repos/a/b/releases/5/assets?')
    expect(String(listFetch.mock.calls[0][0])).toContain('per_page=10')

    const getFetch = vi.fn(async () => jsonResponse(200, rawAsset))
    const getClient = new GithubClient({ token: 'ghp_test', fetchImpl: getFetch })
    expect(await getClient.getReleaseAsset('a', 'b', 99)).toEqual(expected)
    expect(String(getFetch.mock.calls[0][0])).toContain('/repos/a/b/releases/assets/99')
  })

  it('release asset writes send PATCH/DELETE and map failures', async () => {
    const rawAsset = {
      id: 99,
      name: 'renamed.zip',
      label: 'Renamed binary',
      size_in_bytes: 1234,
      download_count: 7,
      state: 'uploaded',
      content_type: 'application/zip',
      created_at: '2026-08-25T00:00:00Z',
      updated_at: '2026-08-25T02:00:00Z',
      url: 'https://api.github.com/repos/a/b/releases/assets/99',
      browser_download_url: 'https://github.com/a/b/releases/download/v1/renamed.zip',
    }

    const updateFetch = vi.fn(async () => jsonResponse(200, rawAsset))
    const updateClient = new GithubClient({ token: 'ghp_test', fetchImpl: updateFetch })
    expect(await updateClient.updateReleaseAsset('a', 'b', 99, { name: 'renamed.zip', label: 'Renamed binary' })).toEqual({ ok: true, id: 99, name: 'renamed.zip' })
    const [, updateInit] = updateFetch.mock.calls[0] as [string, RequestInit]
    expect(updateInit.method).toBe('PATCH')
    expect(String(updateFetch.mock.calls[0][0])).toContain('/repos/a/b/releases/assets/99')
    expect(JSON.parse(String(updateInit.body))).toEqual({ name: 'renamed.zip', label: 'Renamed binary' })

    const deleteFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const deleteClient = new GithubClient({ token: 'ghp_test', fetchImpl: deleteFetch })
    expect(await deleteClient.deleteReleaseAsset('a', 'b', 99)).toEqual({ ok: true, id: 99 })
    expect(deleteFetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE' })

    const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(422, {})) })
    expect((await failed.updateReleaseAsset('a', 'b', 99, { name: 'bad name' })).ok).toBe(false)
    expect((await failed.deleteReleaseAsset('a', 'b', 99)).ok).toBe(false)
  })
})

describe('GithubClient stage 19', () => {
  it('collaborator reads map permission data and pass filters', async () => {
    const rawCollaborators = [{
      login: 'alice',
      id: 101,
      avatar_url: 'https://avatar.example/alice.png',
      permissions: { pull: true, triage: false, push: true, maintain: false, admin: false },
      role_name: 'write',
      url: 'https://api.github.com/users/alice',
      html_url: 'https://github.com/alice',
    }]
    const listFetch = vi.fn(async () => jsonResponse(200, rawCollaborators))
    const listClient = new GithubClient({ token: 'ghp_test', fetchImpl: listFetch })
    expect(await listClient.listCollaborators('a', 'b', {
      affiliation: 'direct',
      permission: 'push',
      perPage: 10,
    })).toEqual([{
      login: 'alice',
      id: 101,
      avatarUrl: 'https://avatar.example/alice.png',
      permissions: { pull: true, triage: false, push: true, maintain: false, admin: false },
      roleName: 'write',
      url: 'https://api.github.com/users/alice',
      htmlUrl: 'https://github.com/alice',
    }])
    const listUrl = String(listFetch.mock.calls[0][0])
    expect(listUrl).toContain('/repos/a/b/collaborators?')
    expect(listUrl).toContain('affiliation=direct')
    expect(listUrl).toContain('permission=push')
    expect(listUrl).toContain('per_page=10')

    const permissionFetch = vi.fn(async () => jsonResponse(200, {
      permission: 'admin',
      role_name: 'admin',
      source: 'organization',
      user: { login: 'alice', html_url: 'https://github.com/alice' },
    }))
    const permissionClient = new GithubClient({ token: 'ghp_test', fetchImpl: permissionFetch })
    expect(await permissionClient.getCollaboratorPermission('a', 'b', 'alice')).toEqual({
      permission: 'admin',
      login: 'alice',
      roleName: 'admin',
      source: 'organization',
      userUrl: 'https://github.com/alice',
    })
    expect(String(permissionFetch.mock.calls[0][0])).toContain('/repos/a/b/collaborators/alice/permission')
  })

  it('collaborator and team repo writes send PUT/DELETE and map failures', async () => {
    const collaboratorFetch = vi.fn(async () => jsonResponse(201, {
      login: 'alice',
      id: 101,
      avatar_url: 'https://avatar',
      url: 'https://api.github.com/users/alice',
      html_url: 'https://github.com/alice',
    }))
    const collaboratorClient = new GithubClient({ token: 'ghp_test', fetchImpl: collaboratorFetch })
    expect(await collaboratorClient.setCollaboratorPermission('a', 'b', 'alice', { permission: 'maintain' })).toEqual({
      ok: true,
      login: 'alice',
      permission: 'maintain',
      created: true,
    })
    const [collaboratorUrl, collaboratorInit] = collaboratorFetch.mock.calls[0] as [string, RequestInit]
    expect(collaboratorUrl).toContain('/repos/a/b/collaborators/alice')
    expect(collaboratorInit.method).toBe('PUT')
    expect(JSON.parse(String(collaboratorInit.body))).toEqual({ permission: 'maintain' })

    const removeFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const removeClient = new GithubClient({ token: 'ghp_test', fetchImpl: removeFetch })
    expect(await removeClient.removeCollaborator('a', 'b', 'alice')).toEqual({ ok: true, login: 'alice' })
    expect(removeFetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE' })

    const teamRepoFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const teamRepoClient = new GithubClient({ token: 'ghp_test', fetchImpl: teamRepoFetch })
    expect(await teamRepoClient.addTeamRepo('acme', 'core', 'a', 'b', { permission: 'admin' })).toEqual({
      ok: true,
      org: 'acme',
      teamSlug: 'core',
      repo: 'a/b',
      permission: 'admin',
    })
    const [teamRepoUrl, teamRepoInit] = teamRepoFetch.mock.calls[0] as [string, RequestInit]
    expect(teamRepoUrl).toContain('/orgs/acme/teams/core/repos/a/b')
    expect(teamRepoInit.method).toBe('PUT')
    expect(JSON.parse(String(teamRepoInit.body))).toEqual({ permission: 'admin' })

    const removeTeamRepoFetch = vi.fn(async () => new Response(null, { status: 204 }))
    const removeTeamRepoClient = new GithubClient({ token: 'ghp_test', fetchImpl: removeTeamRepoFetch })
    expect(await removeTeamRepoClient.removeTeamRepo('acme', 'core', 'a', 'b')).toEqual({
      ok: true,
      org: 'acme',
      teamSlug: 'core',
      repo: 'a/b',
    })
    expect(removeTeamRepoFetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE' })

    const failed = new GithubClient({ token: 'ghp_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await failed.setCollaboratorPermission('a', 'b', 'nobody')).ok).toBe(false)
    expect((await failed.removeCollaborator('a', 'b', 'nobody')).ok).toBe(false)
    expect((await failed.addTeamRepo('acme', 'core', 'a', 'missing')).ok).toBe(false)
    expect((await failed.removeTeamRepo('acme', 'core', 'a', 'missing')).ok).toBe(false)
  })
})

describe('GitHub endpoint policy', () => {
  const valid = { token: 'ghp_test' }
  const ok = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  const call = (client: GithubClient) => client.getRepo('o', 'r')

  it('rejects literal link-local endpoints by default, including IPv4 embedded in IPv6', async () => {
    for (const baseUrl of [
      'http://169.254.169.254',
      'http://169.254.1.1',
      'http://[fe80::1]',
      'http://[::ffff:169.254.169.254]',
      'http://[64:ff9b::a9fe:a9fe]',
      'http://[::169.254.169.254]',
    ]) {
      const fetchImpl = vi.fn()
      await expect(call(new GithubClient({ ...valid, baseUrl, fetchImpl }))).rejects.toBeInstanceOf(GithubError)
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('keeps self-hosted private and loopback endpoints working by default', async () => {
    for (const baseUrl of [
      'http://10.0.0.5',
      'http://172.16.4.4',
      'http://192.168.1.10',
      'http://127.0.0.1:8080',
      'http://[fc00::1]',
    ]) {
      const fetchImpl = vi.fn(async () => ok())
      await call(new GithubClient({ ...valid, baseUrl, fetchImpl })).catch(() => undefined)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  })

  it('performs no DNS work in the default mode', async () => {
    const lookupImpl = vi.fn(async () => { throw new Error('default mode must not resolve hostnames') })
    const fetchImpl = vi.fn(async () => ok())
    await call(new GithubClient({ ...valid, baseUrl: 'https://github.internal.corp', fetchImpl, lookupImpl })).catch(() => undefined)
    expect(lookupImpl).not.toHaveBeenCalled()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects private and link-local endpoints when enforcePublicEndpoint is on', async () => {
    for (const baseUrl of ['http://10.0.0.5', 'http://127.0.0.1', 'http://169.254.169.254', 'http://[fc00::1]']) {
      const fetchImpl = vi.fn()
      await expect(call(new GithubClient({ ...valid, baseUrl, fetchImpl, enforcePublicEndpoint: true }))).rejects.toBeInstanceOf(GithubError)
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('resolves and rejects blocked hostnames only when enforcePublicEndpoint is on', async () => {
    const lookupImpl = async () => [{ address: '169.254.169.254', family: 4 as const }]
    const fetchImpl = vi.fn()
    await expect(call(new GithubClient({ ...valid, baseUrl: 'https://metadata.github.test', fetchImpl, lookupImpl, enforcePublicEndpoint: true }))).rejects.toBeInstanceOf(GithubError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('allows a public endpoint when enforcePublicEndpoint is on', async () => {
    const lookupImpl = async () => [{ address: '93.184.216.34', family: 4 as const }]
    const fetchImpl = vi.fn(async () => ok())
    await call(new GithubClient({ ...valid, baseUrl: 'https://github.example.test', fetchImpl, lookupImpl, enforcePublicEndpoint: true })).catch(() => undefined)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('GithubError identity', () => {
  it('reports its own class name so callers can branch on error.name', () => {
    const error = new GithubError('probe', 400)
    expect(error).toBeInstanceOf(GithubError)
    expect(error.name).toBe('GithubError')
  })
})
