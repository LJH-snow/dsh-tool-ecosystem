import { describe, expect, it, vi } from 'vitest'
import { DockerHubClient, DockerHubError, type DockerHubClientOptions } from '../src/client.ts'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

const stablePublicLookup: NonNullable<DockerHubClientOptions['lookupImpl']> = async () => [{ address: '93.184.216.34', family: 4 }]

function client(fetchImpl: ReturnType<typeof vi.fn>, options: Partial<DockerHubClientOptions> = {}) {
  return new DockerHubClient({ username: 'octocat', personalAccessToken: 'dckr_pat_secret', lookupImpl: stablePublicLookup, ...options, fetchImpl })
}

describe('DockerHubClient', () => {
  it('exchanges a PAT for a bearer token without exposing it', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ token: 'bearer-secret-token' }))
    const result = await client(fetchImpl).authTest()
    expect(result).toEqual({ username: 'octocat', namespace: 'octocat' })
    expect(JSON.stringify(result)).not.toContain('bearer-secret-token')
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://hub.docker.com/v2/auth/token')
    expect(init.method).toBe('POST')
    expect(String(init.body)).toContain('octocat')
    expect(String(init.body)).toContain('dckr_pat_secret')
  })

  it('lists repositories with pagination and bearer authentication', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'bearer-token' }))
      .mockResolvedValueOnce(jsonResponse({ count: 1, next: 'https://hub.docker.com/v2/next', previous: '', results: [{ namespace: 'octocat', name: 'demo', description: 'Demo image', pull_count: 12, star_count: 3, is_private: false, last_updated: '2026-01-01T00:00:00Z' }] }))
    const result = await client(fetchImpl).listRepositories({ page: 2, pageSize: 10, query: 'dem', order: '-last_updated' })
    expect(result).toMatchObject({ count: 1, next: 'https://hub.docker.com/v2/next' })
    expect(result.items[0]).toMatchObject({ namespace: 'octocat', name: 'demo', pullCount: 12, starCount: 3, isPrivate: false })
    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit]
    expect(url).toContain('/v2/repositories/octocat/')
    expect(url).toContain('page=2')
    expect(url).toContain('page_size=10')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer bearer-token')
  })

  it('maps repository details and tag image metadata', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'bearer-token' }))
      .mockResolvedValueOnce(jsonResponse({ name: 'demo', namespace: 'octocat', description: 'Demo', pull_count: 20, star_count: 4, is_private: true, last_updated: '2026-01-02' }))
      .mockResolvedValueOnce(jsonResponse({ name: 'latest', last_updated: '2026-01-02', full_size: 1234, images: [{ digest: 'sha256:abc', architecture: 'arm64', os: 'linux' }] }))
    const pd = new DockerHubClient({ username: 'octocat', personalAccessToken: 'token', lookupImpl: stablePublicLookup, fetchImpl })
    const repository = await pd.getRepository('octocat', 'demo')
    const tag = await pd.getTag('octocat', 'demo', 'latest')
    expect(repository).toMatchObject({ name: 'demo', pullCount: 20, isPrivate: true })
    expect(tag).toMatchObject({ name: 'latest', digest: 'sha256:abc', fullSize: 1234, architecture: 'arm64', os: 'linux' })
  })

  it('searches public repositories without credentials', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ count: 1, next: '', previous: '', results: [{ name: 'nginx', namespace: 'library', description: 'Official nginx', pull_count: 100, star_count: 50, is_official: true, is_automated: false }] }))
    const result = await new DockerHubClient({ lookupImpl: stablePublicLookup, fetchImpl }).searchRepositories({ query: 'nginx' })
    expect(result.items[0]).toMatchObject({ name: 'nginx', namespace: 'library', isOfficial: true, isAutomated: false })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).authorization).toBeUndefined()
  })

  it('reads rate-limit headers and authentication status', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'bearer-token' }))
      .mockResolvedValueOnce(jsonResponse({}, 200, { 'ratelimit-limit': '200', 'ratelimit-remaining': '199', 'ratelimit-reset': '1700000000' }))
    const result = await client(fetchImpl).getRateLimits()
    expect(result).toEqual({ limit: '200', remaining: '199', reset: '1700000000', authenticated: true })
  })

  it('rejects missing credentials for auth test and maps HTTP errors', async () => {
    await expect(new DockerHubClient({}).authTest()).rejects.toThrow(DockerHubError)
    const fetchImpl = vi.fn(async () => jsonResponse({ detail: 'Not found' }, 404))
    await expect(new DockerHubClient({ fetchImpl, lookupImpl: stablePublicLookup }).searchRepositories({ query: 'nope' })).rejects.toThrow('Not found')
  })

  it('preserves a custom base URL path prefix and normalizes trailing slashes', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ count: 0, next: '', previous: '', results: [] }))
    await new DockerHubClient({
      baseUrl: 'https://example.test/docker/hub///',
      lookupImpl: stablePublicLookup,
      fetchImpl,
    }).searchRepositories({ query: 'nginx' })
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://example.test/docker/hub/v2/search/repositories/?query=nginx&page=1&page_size=25')
  })

  it('rejects invalid base URLs during construction without exposing URL contents', () => {
    for (const baseUrl of [
      'not-a-url',
      'ftp://example.test',
      'https://user:password@example.test',
      'https://example.test/path?credential=secret',
      'https://example.test/path#credential-secret',
    ]) {
      expect(() => new DockerHubClient({ baseUrl })).toThrow(DockerHubError)
      try {
        new DockerHubClient({ baseUrl })
      } catch (error) {
        expect(String(error)).not.toContain('password')
        expect(String(error)).not.toContain('credential')
        expect(String(error)).not.toContain('secret')
      }
    }
  })

  it('rejects literal localhost, loopback, private, and reserved addresses before fetch', async () => {
    const blockedBaseUrls = [
      'http://localhost',
      'http://service.localhost',
      'http://localhost.localdomain',
      'http://service.local',
      'http://127.0.0.1',
      'http://[::1]',
      'http://0.0.0.0',
      'http://10.0.0.1',
      'http://172.16.0.1',
      'http://192.168.1.1',
      'http://169.254.1.1',
      'http://100.64.0.1',
      'http://224.0.0.1',
      'http://192.0.2.1',
      'http://198.18.0.1',
      'http://198.51.100.1',
      'http://203.0.113.1',
      'http://[fc00::1]',
      'http://[fe80::1]',
      'http://[ff02::1]',
      'http://[2001:db8::1]',
      // IANA special-purpose blocks that previously slipped through.
      'http://192.175.48.1',
      'http://[fec0::1]',
      'http://[2001:3::1]',
      'http://[2001:4:112::1]',
      'http://[2001:20::1]',
      'http://[2001:30::1]',
      'http://[5f00::1]',
      'http://[100:0:0:1::1]',
      'http://[2620:4f:8000::1]',
    ]

    for (const baseUrl of blockedBaseUrls) {
      const fetchImpl = vi.fn(async () => jsonResponse({}))
      const dockerHub = new DockerHubClient({ baseUrl, fetchImpl })
      await expect(dockerHub.searchRepositories({ query: 'nginx' })).rejects.toMatchObject({ name: 'DockerHubError', code: 'unsafe_url' })
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('fails closed when DNS resolves to a blocked address, fails, or returns no addresses', async () => {
    for (const lookupImpl of [
      async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }],
      async () => { throw new Error('DNS lookup failed for test.example') },
      async () => [],
    ]) {
      const fetchImpl = vi.fn(async () => jsonResponse({}))
      const dockerHub = new DockerHubClient({ baseUrl: 'https://test.example', lookupImpl, fetchImpl })
      await expect(dockerHub.searchRepositories({ query: 'nginx' })).rejects.toMatchObject({ name: 'DockerHubError', code: 'unsafe_url' })
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })
})
