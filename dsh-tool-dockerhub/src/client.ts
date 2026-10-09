/** Docker Hub API client with optional PAT authentication and injected fetch. */

import { assertSafeUrl, normalizeBaseUrl, type LookupImpl } from './url-security.js'

export interface DockerHubClientOptions {
  username?: string
  personalAccessToken?: string
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /** Test-only DNS resolver injection; production callers should omit it. */
  lookupImpl?: LookupImpl
}

export class DockerHubError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string | null = null) {
    super(message)
    this.name = 'DockerHubError'
  }
}

export interface DockerHubAuthInfo {
  username: string
  namespace: string
}

export interface DockerHubNamespaceInfo {
  namespace: string
  authenticated: boolean
}

export interface DockerHubRepositoryInfo {
  namespace: string
  name: string
  description: string
  pullCount: number
  starCount: number
  isPrivate: boolean
  lastUpdated: string
  status: string
  repoUrl: string
}

export interface DockerHubTagInfo {
  name: string
  digest: string
  lastUpdated: string
  fullSize: number
  architecture: string
  os: string
  status: string
}

export interface DockerHubSearchResult {
  name: string
  namespace: string
  description: string
  pullCount: number
  starCount: number
  isOfficial: boolean
  isAutomated: boolean
}

export interface DockerHubPage<T> {
  items: T[]
  count: number
  next: string
  previous: string
}

export interface DockerHubRateLimitInfo {
  limit: string
  remaining: string
  reset: string
  authenticated: boolean
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function asNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function asBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true
}

function boundedPage(value: number | undefined): number {
  return Number.isInteger(value) ? Math.max(1, value as number) : 1
}

function boundedPageSize(value: number | undefined): number {
  return Number.isInteger(value) ? Math.min(100, Math.max(1, value as number)) : 25
}

function mapRepository(value: unknown): DockerHubRepositoryInfo {
  const r = asRecord(value)
  const namespace = asString(r, 'namespace') || asString(r, 'user')
  const name = asString(r, 'name')
  return {
    namespace,
    name,
    description: asString(r, 'description'),
    pullCount: asNumber(r, 'pull_count'),
    starCount: asNumber(r, 'star_count'),
    isPrivate: asBoolean(r, 'is_private'),
    lastUpdated: asString(r, 'last_updated'),
    status: asString(r, 'status'),
    repoUrl: asString(r, 'repo_url') || (namespace && name ? `https://hub.docker.com/r/${namespace}/${name}` : ''),
  }
}

function mapTag(value: unknown): DockerHubTagInfo {
  const r = asRecord(value)
  const images = asArray(r.images)
  const image = images.length ? asRecord(images[0]) : {}
  return {
    name: asString(r, 'name'),
    digest: asString(image, 'digest') || asString(r, 'digest'),
    lastUpdated: asString(r, 'last_updated'),
    fullSize: asNumber(r, 'full_size') || asNumber(image, 'size'),
    architecture: asString(image, 'architecture'),
    os: asString(image, 'os'),
    status: asString(r, 'status'),
  }
}

function mapSearchResult(value: unknown): DockerHubSearchResult {
  const r = asRecord(value)
  return {
    name: asString(r, 'name'),
    namespace: asString(r, 'namespace'),
    description: asString(r, 'description'),
    pullCount: asNumber(r, 'pull_count'),
    starCount: asNumber(r, 'star_count'),
    isOfficial: asBoolean(r, 'is_official'),
    isAutomated: asBoolean(r, 'is_automated'),
  }
}

function mapPage<T>(value: unknown, key: string, mapper: (item: unknown) => T): DockerHubPage<T> {
  const r = asRecord(value)
  return {
    items: asArray(r[key]).map(mapper),
    count: asNumber(r, 'count'),
    next: asString(r, 'next'),
    previous: asString(r, 'previous'),
  }
}

export class DockerHubClient {
  private readonly username: string
  private readonly personalAccessToken: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly lookupImpl: LookupImpl | undefined
  private authToken = ''

  constructor(options: DockerHubClientOptions = {}) {
    this.username = options.username ?? ''
    this.personalAccessToken = options.personalAccessToken ?? ''
    try {
      this.baseUrl = normalizeBaseUrl(options.baseUrl)
    } catch (error) {
      throw new DockerHubError(error instanceof Error ? error.message : 'Docker Hub baseUrl is invalid.', 400, 'invalid_base_url')
    }
    this.timeoutMs = options.timeoutMs ?? 15000
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.lookupImpl = options.lookupImpl
  }

  hasCredentials(): boolean {
    return Boolean(this.username && this.personalAccessToken)
  }

  private async auth(signal?: AbortSignal): Promise<string> {
    if (this.authToken) return this.authToken
    if (!this.hasCredentials()) throw new DockerHubError('Docker Hub credentials not configured.', 401)
    const raw = await this.send('/v2/auth/token', 'POST', {
      body: { username: this.username, password: this.personalAccessToken },
      auth: false,
      signal,
    })
    const record = asRecord(raw.body)
    const token = asString(record, 'token') || asString(record, 'access_token')
    if (!token) throw new DockerHubError('Docker Hub authentication did not return a token.', 401)
    this.authToken = token
    return token
  }

  private async send(path: string, method = 'GET', options: { params?: Record<string, unknown>; body?: unknown; auth?: boolean; signal?: AbortSignal } = {}): Promise<{ body: unknown; headers: Headers }> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (options.params) {
      const search = new URLSearchParams()
      for (const [key, value] of Object.entries(options.params)) {
        if (value === undefined || value === null || value === '') continue
        search.set(key, String(value))
      }
      url.search = search.toString()
    }
    const headers: Record<string, string> = { accept: 'application/json' }
    if (options.body !== undefined) headers['content-type'] = 'application/json'
    if (options.auth !== false && this.hasCredentials()) headers.authorization = `Bearer ${await this.auth(options.signal)}`
    const controller = new AbortController()
    const combined = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
    const timer = this.timeoutMs > 0 ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined
    try {
      try {
        await assertSafeUrl(url, this.lookupImpl)
      } catch {
        throw new DockerHubError('Docker Hub request URL was rejected by host safety policy.', 400, 'unsafe_url')
      }
      const response = await this.fetchImpl(url.toString(), {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: combined,
      })
      const rawText = await response.text()
      let body: unknown = {}
      if (rawText) {
        try { body = JSON.parse(rawText) } catch { body = rawText }
      }
      if (!response.ok) {
        const r = asRecord(body)
        const detail = asString(r, 'detail') || asString(r, 'message') || rawText.slice(0, 300)
        const code = asString(r, 'code') || null
        throw new DockerHubError(`Docker Hub API ${method} ${path} returned HTTP ${response.status}: ${detail}`, response.status, code)
      }
      return { body, headers: response.headers }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async authTest(signal?: AbortSignal): Promise<DockerHubAuthInfo> {
    await this.auth(signal)
    return { username: this.username, namespace: this.username }
  }

  async getNamespace(): Promise<DockerHubNamespaceInfo> {
    if (!this.username) throw new DockerHubError('Docker Hub username is not configured.', 401)
    return { namespace: this.username, authenticated: this.hasCredentials() }
  }

  async listRepositories(options: { namespace?: string; page?: number; pageSize?: number; query?: string; order?: string; signal?: AbortSignal } = {}): Promise<DockerHubPage<DockerHubRepositoryInfo>> {
    const namespace = options.namespace || this.username
    if (!namespace) throw new DockerHubError('Docker Hub namespace is required for repository listing.', 400)
    const raw = await this.send('/v2/repositories/' + encodeURIComponent(namespace) + '/', 'GET', {
      params: { page: boundedPage(options.page), page_size: boundedPageSize(options.pageSize), name: options.query, ordering: options.order },
      signal: options.signal,
    })
    return mapPage(raw.body, 'results', mapRepository)
  }

  async getRepository(namespace: string, repository: string, signal?: AbortSignal): Promise<DockerHubRepositoryInfo> {
    const raw = await this.send(`/v2/repositories/${encodeURIComponent(namespace)}/${encodeURIComponent(repository)}/`, 'GET', { signal })
    return mapRepository(raw.body)
  }

  async listTags(namespace: string, repository: string, options: { page?: number; pageSize?: number; query?: string; signal?: AbortSignal } = {}): Promise<DockerHubPage<DockerHubTagInfo>> {
    const raw = await this.send(`/v2/repositories/${encodeURIComponent(namespace)}/${encodeURIComponent(repository)}/tags/`, 'GET', {
      params: { page: boundedPage(options.page), page_size: boundedPageSize(options.pageSize), name: options.query },      signal: options.signal,
    })
    return mapPage(raw.body, 'results', mapTag)
  }

  async getTag(namespace: string, repository: string, tag: string, signal?: AbortSignal): Promise<DockerHubTagInfo> {
    const raw = await this.send(`/v2/repositories/${encodeURIComponent(namespace)}/${encodeURIComponent(repository)}/tags/${encodeURIComponent(tag)}/`, 'GET', { signal })
    return mapTag(raw.body)
  }

  async searchRepositories(options: { query: string; page?: number; pageSize?: number; signal?: AbortSignal }): Promise<DockerHubPage<DockerHubSearchResult>> {
    const raw = await this.send('/v2/search/repositories/', 'GET', {
      params: { query: options.query, page: boundedPage(options.page), page_size: boundedPageSize(options.pageSize) },      signal: options.signal,
    })
    return mapPage(raw.body, 'results', mapSearchResult)
  }

  async getRateLimits(signal?: AbortSignal): Promise<DockerHubRateLimitInfo> {
    const raw = await this.send('/v2/', 'GET', { signal })
    return {
      limit: raw.headers.get('ratelimit-limit') ?? '',
      remaining: raw.headers.get('ratelimit-remaining') ?? '',
      reset: raw.headers.get('ratelimit-reset') ?? '',
      authenticated: this.hasCredentials(),
    }
  }
}
