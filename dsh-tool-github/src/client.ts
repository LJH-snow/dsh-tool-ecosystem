import { inflateRawSync } from 'node:zlib'
import sodium from 'libsodium-wrappers'
import { EndpointSecurityError, guardEndpoint, normalizeBaseUrl, type EndpointPolicy, type LookupImpl } from './url-security.js'

/** GitHub REST client with injected fetch for testability. */

export interface GithubClientOptions {
  baseUrl?: string
  token?: string
  fetchImpl?: typeof fetch
  /** Require a publicly reachable endpoint and resolve hostnames. Off by default so self-hosted deployments keep working. */
  enforcePublicEndpoint?: boolean
  /** Test-only DNS lookup override; production uses node:dns/promises. */
  lookupImpl?: LookupImpl
  /** Request timeout in milliseconds. 0 disables the timeout. */
  timeoutMs?: number
}

export interface RepoInfo {
  owner: string
  name: string
  description: string | null
  stars: number
  language: string | null
  license: string | null
  homepage: string | null
  updatedAt: string | null
}

export interface RepoSearchItem {
  fullName: string
  description: string | null
  stars: number
  language: string | null
  url: string
}

export interface RepositoryCreateResult {
  ok: boolean
  fullName?: string
  url?: string
  reason?: string
}

export interface RepoTopicResult {
  ok: boolean
  names?: string[]
  reason?: string
}

export interface GistItem {
  id: string
  description: string
  files: string[]
  owner: string | null
  public: boolean
  createdAt: string
  updatedAt: string
  url: string
}

export interface GistCreateResult {
  ok: boolean
  id?: string
  url?: string
  reason?: string
}

export interface RepoVariableItem {
  name: string
  value: string
  createdAt: string
  updatedAt: string
}

export interface RepoVariableListResult {
  found: boolean
  total: number
  items: RepoVariableItem[]
}

export interface RepoVariableWriteResult {
  ok: boolean
  name?: string
  created?: boolean
  updated?: boolean
  reason?: string
}

export interface RepoSecretItem {
  name: string
  createdAt: string
  updatedAt: string
}

export interface RepoSecretListResult {
  found: boolean
  total: number
  items: RepoSecretItem[]
}

export interface RepoSecretDeleteResult {
  ok: boolean
  name?: string
  reason?: string
}

export interface RepoSecretWriteResult {
  ok: boolean
  name?: string
  reason?: string
}

export interface BranchProtectionDetail {
  found: boolean
  enabled?: boolean
  contexts?: string[]
  strict?: boolean
  enforceAdmins?: boolean
  requiredApprovingReviewCount?: number
  dismissStaleReviews?: boolean
  requireCodeOwnerReviews?: boolean
  requiredLinearHistory?: boolean
  allowForcePushes?: boolean
  allowDeletions?: boolean
  requiredConversationResolution?: boolean
  url?: string
}

export interface BranchProtectionWriteResult {
  ok: boolean
  branch?: string
  url?: string
  reason?: string
}

export interface IssueItem {
  number: number
  title: string
  state: string
  labels: string[]
  createdAt: string
  author: string
  url: string
}

export interface CodeSearchItem {
  path: string
  repository: string
  url: string
}

export interface PrDraftResult {
  created: boolean
  number?: number
  url?: string
  reason?: string
}

export interface PrItem {
  number: number
  title: string
  state: string
  draft: boolean
  author: string
  headRef: string
  baseRef: string
  createdAt: string
  url: string
}

export interface PullRequestDetail {
  number: number
  title: string
  state: string
  draft: boolean
  author: string
  headRef: string
  headSha: string
  baseRef: string
  baseSha: string
  body: string
  mergeable: boolean | null
  merged: boolean
  reviewDecision: string | null
  additions: number
  deletions: number
  changedFiles: number
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  url: string
}

export interface PullRequestReviewItem {
  id: number
  author: string
  state: string
  body: string
  submittedAt: string
  commitSha: string | null
  url: string
}

export interface PrReviewersResult {
  ok: boolean
  prNumber?: number
  reviewers?: string[]
  reason?: string
}

export interface PrReviewSubmitResult {
  ok: boolean
  prNumber?: number
  reviewId?: number
  state?: string
  url?: string
  reason?: string
}

export interface FileContent {
  name: string
  path: string
  size: number
  content: string
  encoding: string
  url: string
}

export interface CommitItem {
  sha: string
  message: string
  author: string
  date: string
  url: string
}

export interface IssueWriteResult {
  ok: boolean
  number?: number
  url?: string
  reason?: string
}

export interface MilestoneItem {
  number: number
  title: string
  state: string
  openIssues: number
  closedIssues: number
  dueOn: string | null
  description: string
  url: string
}

export interface IssueMetaWriteResult {
  ok: boolean
  number?: number
  labels?: string[]
  milestoneNumber?: number | null
  reason?: string
}

export interface AssigneesWriteResult {
  ok: boolean
  number?: number
  assignees?: string[]
  reason?: string
}

export interface PrCommentReplyResult {
  ok: boolean
  commentId?: number
  url?: string
  reason?: string
}

export interface ReleaseItem {
  tagName: string
  name: string
  draft: boolean
  prerelease: boolean
  author: string
  publishedAt: string
  url: string
}

export interface BranchItem {
  name: string
  sha: string
}

export interface IssueDetail {
  number: number
  title: string
  state: string
  author: string
  createdAt: string
  labels: string[]
  body: string
  url: string
}

export interface CommentItem {
  id: number
  author: string
  createdAt: string
  body: string
  url: string
}

export interface UserInfo {
  login: string
  name: string | null
  bio: string | null
  followers: number
  following: number
  publicRepos: number
  location: string | null
  blog: string | null
  url: string
}

export interface WorkflowRunItem {
  id: number
  workflowName: string
  headBranch: string
  status: string
  conclusion: string | null
  createdAt: string
  url: string
}

export interface WorkflowItem {
  id: number
  name: string
  path: string
  state: string
  updatedAt: string
  url: string
}

export interface WorkflowRunDetail {
  id: number
  workflowId: number
  workflowName: string
  displayTitle: string
  headBranch: string
  headSha: string
  status: string
  conclusion: string | null
  event: string
  actor: string
  createdAt: string
  updatedAt: string
  runStartedAt: string | null
  url: string
}

export interface WorkflowJobStep {
  number: number
  name: string
  status: string
  conclusion: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface WorkflowJobItem {
  id: number
  name: string
  status: string
  conclusion: string | null
  startedAt: string | null
  completedAt: string | null
  steps: WorkflowJobStep[]
  url: string
}

export interface WorkflowLogsResult {
  found: boolean
  logs?: string
  truncated?: boolean
  totalChars?: number
}

export interface WorkflowActionResult {
  ok: boolean
  runId?: number
  reason?: string
}

export interface WorkflowDispatchResult {
  ok: boolean
  workflowId?: number
  reason?: string
}

export interface WorkflowArtifactItem {
  id: number
  name: string
  sizeInBytes: number
  expired: boolean
  createdAt: string
  expiresAt: string | null
  updatedAt: string
  archiveUrl: string | null
  url: string
  workflowRunId: number | null
  headBranch: string | null
  headSha: string | null
}

export interface ArtifactListResult {
  total: number
  items: WorkflowArtifactItem[]
}

export interface ArtifactWriteResult {
  ok: boolean
  artifactId?: number
  reason?: string
}

export interface EnvironmentProtectionRule {
  id: number
  type: string
  waitTimer: number | null
  preventSelfReview: boolean | null
  reviewers: Array<{ type: string; id: number }>
}

export interface EnvironmentItem {
  id: number
  name: string
  url: string
  htmlUrl: string
  createdAt: string
  updatedAt: string
  protectionRules: EnvironmentProtectionRule[]
  protectedBranches: boolean | null
  customBranchPolicies: boolean | null
}

export interface EnvironmentListResult {
  found: boolean
  total: number
  items: EnvironmentItem[]
  reason?: string
}

export interface EnvironmentWriteResult {
  ok: boolean
  name?: string
  url?: string
  reason?: string
}

export interface OrgInfo {
  login: string
  name: string | null
  description: string | null
  publicRepos: number
  totalPrivateRepos: number | null
  location: string | null
  blog: string | null
  createdAt: string | null
  url: string
}

export interface OrgRepoItem {
  fullName: string
  owner: string
  name: string
  description: string | null
  stars: number
  language: string | null
  visibility: string | null
  fork: boolean
  privateRepo: boolean
  updatedAt: string
  url: string
}

export interface OrgMemberItem {
  login: string
  id: number
  avatarUrl: string
  url: string
}

export interface TeamItem {
  id: number
  name: string
  slug: string
  description: string | null
  privacy: string
  permission: string
  url: string
  htmlUrl: string
  membersCount: number | null
  reposCount: number | null
}

export interface TeamMembershipResult {
  ok: boolean
  username?: string
  role?: string
  state?: string
  reason?: string
}

export interface CollaboratorItem {
  login: string
  id: number
  avatarUrl: string
  permissions?: {
    pull: boolean
    triage: boolean
    push: boolean
    maintain: boolean
    admin: boolean
  }
  roleName?: string
  url: string
  htmlUrl: string
}

export interface CollaboratorPermissionItem {
  permission: string
  login: string
  roleName?: string
  source?: string
  userUrl: string
}

export interface CollaboratorWriteResult {
  ok: boolean
  login?: string
  permission?: string
  created?: boolean
  reason?: string
}

export interface TeamRepoWriteResult {
  ok: boolean
  org?: string
  teamSlug?: string
  repo?: string
  permission?: string
  reason?: string
}

export interface WebhookItem {
  id: number
  name: string
  active: boolean
  events: string[]
  config: {
    url: string
    contentType: string
    insecureSsl: string | null
  }
  url: string
  pingUrl: string
  deliveriesUrl: string
  testUrl: string
  createdAt: string
  updatedAt: string
}

export interface WebhookWriteResult {
  ok: boolean
  id?: number
  url?: string
  reason?: string
}

export interface ReleaseAssetItem {
  id: number
  name: string
  label: string | null
  sizeInBytes: number
  downloadCount: number
  state: string
  contentType: string
  createdAt: string
  updatedAt: string
  downloadUrl: string
  browserDownloadUrl: string
}

export interface ReleaseAssetWriteResult {
  ok: boolean
  id?: number
  name?: string
  reason?: string
}

export interface BranchCreateResult {
  ok: boolean
  name?: string
  reason?: string
}

export interface FileWriteResult {
  ok: boolean
  path?: string
  commitSha?: string
  reason?: string
}

export interface ReadmeInfo {
  found: boolean
  content?: string
  size?: number
  url?: string
}

export interface TagItem {
  name: string
  commitSha: string
}

export interface StarResult {
  ok: boolean
  reason?: string
}

export interface ReleaseCreateResult {
  ok: boolean
  id?: number
  url?: string
  reason?: string
}

export type IssueState = 'open' | 'closed' | 'all'

export class GithubError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'GithubError'
  }
}

function parseWorkflowLogZip(buffer: ArrayBuffer): string {
  const bytes = Buffer.from(buffer)
  const endMarker = 0x06054b50
  let endOffset = -1
  const start = Math.max(0, bytes.length - 0xffff - 22)
  for (let i = bytes.length - 22; i >= start; i -= 1) {
    if (bytes.readUInt32LE(i) === endMarker) {
      endOffset = i
      break
    }
  }
  if (endOffset < 0) throw new GithubError('Workflow logs archive is invalid', 502)

  const entryCount = bytes.readUInt16LE(endOffset + 10)
  const centralOffset = bytes.readUInt32LE(endOffset + 16)
  let offset = centralOffset
  const parts: string[] = []
  for (let i = 0; i < entryCount; i += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) {
      throw new GithubError('Workflow logs archive is invalid', 502)
    }
    const method = bytes.readUInt16LE(offset + 10)
    const compressedSize = bytes.readUInt32LE(offset + 20)
    const uncompressedSize = bytes.readUInt32LE(offset + 24)
    const nameLength = bytes.readUInt16LE(offset + 28)
    const extraLength = bytes.readUInt16LE(offset + 30)
    const commentLength = bytes.readUInt16LE(offset + 32)
    const localOffset = bytes.readUInt32LE(offset + 42)
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    const next = offset + 46 + nameLength + extraLength + commentLength

    if (!name.endsWith('/')) {
      if (bytes.readUInt32LE(localOffset) !== 0x04034b50) {
        throw new GithubError('Workflow logs archive is invalid', 502)
      }
      const localNameLength = bytes.readUInt16LE(localOffset + 26)
      const localExtraLength = bytes.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + localNameLength + localExtraLength
      const raw = bytes.subarray(dataStart, dataStart + compressedSize)
      let content: Buffer
      if (method === 0) {
        content = Buffer.from(raw)
      } else if (method === 8) {
        content = inflateRawSync(raw)
      } else {
        throw new GithubError('Unsupported compression in workflow logs archive', 502)
      }
      if (content.length !== uncompressedSize) {
        throw new GithubError('Workflow logs archive is invalid', 502)
      }
      parts.push(`--- ${name} ---\n${content.toString('utf8')}`)
    }
    offset = next
  }
  return parts.join('\n')
}

interface RawWorkflowArtifact {
  id: number
  name: string
  size_in_bytes: number
  expired: boolean
  created_at: string
  expires_at: string | null
  updated_at: string
  archive_download_url: string | null
  url: string
  workflow_run?: {
    id: number
    head_branch: string
    head_sha: string
  } | null
}

interface RawEnvironmentProtectionRule {
  id: number
  type: string
  wait_timer?: number | null
  prevent_self_review?: boolean | null
  reviewers?: Array<{ type: string; id: number }> | null
}

interface RawEnvironment {
  id: number
  name: string
  url: string
  html_url: string
  created_at: string
  updated_at: string
  protection_rules?: RawEnvironmentProtectionRule[] | null
  deployment_branch_policy?: {
    protected_branches: boolean
    custom_branch_policies: boolean
  } | null
}

function mapWorkflowArtifact(raw: RawWorkflowArtifact): WorkflowArtifactItem {
  return {
    id: raw.id,
    name: raw.name,
    sizeInBytes: raw.size_in_bytes,
    expired: raw.expired,
    createdAt: raw.created_at,
    expiresAt: raw.expires_at,
    updatedAt: raw.updated_at,
    archiveUrl: raw.archive_download_url,
    url: raw.url,
    workflowRunId: raw.workflow_run?.id ?? null,
    headBranch: raw.workflow_run?.head_branch ?? null,
    headSha: raw.workflow_run?.head_sha ?? null,
  }
}

function mapEnvironment(raw: RawEnvironment): EnvironmentItem {
  return {
    id: raw.id,
    name: raw.name,
    url: raw.url,
    htmlUrl: raw.html_url,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    protectionRules: (raw.protection_rules ?? []).map(rule => ({
      id: rule.id,
      type: rule.type,
      waitTimer: rule.wait_timer ?? null,
      preventSelfReview: rule.prevent_self_review ?? null,
      reviewers: rule.reviewers?.map(reviewer => ({ type: reviewer.type, id: reviewer.id })) ?? [],
    })),
    protectedBranches: raw.deployment_branch_policy?.protected_branches ?? null,
    customBranchPolicies: raw.deployment_branch_policy?.custom_branch_policies ?? null,
  }
}

interface RawOrg {
  login: string
  name: string | null
  description: string | null
  public_repos: number
  total_private_repos?: number | null
  location: string | null
  blog: string | null
  created_at: string | null
  html_url: string
}

interface RawOrgRepo {
  full_name: string
  name: string
  description: string | null
  stargazers_count: number
  language: string | null
  visibility: string | null
  fork: boolean
  private: boolean
  updated_at: string
  html_url: string
}

interface RawOrgMember {
  login: string
  id: number
  avatar_url: string
  html_url: string
}

interface RawTeam {
  id: number
  name: string
  slug: string
  description: string | null
  privacy: string
  permission: string
  url: string
  html_url: string
  members_count?: number | null
  repos_count?: number | null
}

function mapOrgRepo(raw: RawOrgRepo): OrgRepoItem {
  const [owner, name] = raw.full_name.split('/')
  return {
    fullName: raw.full_name,
    owner,
    name,
    description: raw.description,
    stars: raw.stargazers_count,
    language: raw.language,
    visibility: raw.visibility,
    fork: raw.fork,
    privateRepo: raw.private,
    updatedAt: raw.updated_at,
    url: raw.html_url,
  }
}

function mapTeam(raw: RawTeam): TeamItem {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    description: raw.description,
    privacy: raw.privacy,
    permission: raw.permission,
    url: raw.url,
    htmlUrl: raw.html_url,
    membersCount: raw.members_count ?? null,
    reposCount: raw.repos_count ?? null,
  }
}

interface RawCollaborator {
  login: string
  id: number
  avatar_url: string
  permissions?: {
    pull?: boolean
    triage?: boolean
    push?: boolean
    maintain?: boolean
    admin?: boolean
  }
  role_name?: string | null
  url: string
  html_url: string
}

interface RawCollaboratorPermission {
  permission: string
  role_name?: string | null
  source?: string
  user: {
    login: string
    html_url: string
  }
}

function mapCollaborator(raw: RawCollaborator): CollaboratorItem {
  return {
    login: raw.login,
    id: raw.id,
    avatarUrl: raw.avatar_url,
    permissions: raw.permissions ? {
      pull: raw.permissions.pull ?? false,
      triage: raw.permissions.triage ?? false,
      push: raw.permissions.push ?? false,
      maintain: raw.permissions.maintain ?? false,
      admin: raw.permissions.admin ?? false,
    } : undefined,
    roleName: raw.role_name ?? undefined,
    url: raw.url,
    htmlUrl: raw.html_url,
  }
}

function mapCollaboratorPermission(raw: RawCollaboratorPermission): CollaboratorPermissionItem {
  return {
    permission: raw.permission,
    login: raw.user.login,
    roleName: raw.role_name ?? undefined,
    source: raw.source,
    userUrl: raw.user.html_url,
  }
}

interface RawWebhook {
  id: number
  name: string
  active: boolean
  events: string[]
  config: {
    url: string
    content_type: string
    insecure_ssl: string | null
  }
  url: string
  ping_url: string
  deliveries_url: string
  test_url: string
  created_at: string
  updated_at: string
}

interface RawReleaseAsset {
  id: number
  name: string
  label: string | null
  size_in_bytes: number
  download_count: number
  state: string
  content_type: string
  created_at: string
  updated_at: string
  url: string
  browser_download_url: string
}

function mapWebhook(raw: RawWebhook): WebhookItem {
  return {
    id: raw.id,
    name: raw.name,
    active: raw.active,
    events: raw.events,
    config: {
      url: raw.config.url,
      contentType: raw.config.content_type,
      insecureSsl: raw.config.insecure_ssl,
    },
    url: raw.url,
    pingUrl: raw.ping_url,
    deliveriesUrl: raw.deliveries_url,
    testUrl: raw.test_url,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

function mapReleaseAsset(raw: RawReleaseAsset): ReleaseAssetItem {
  return {
    id: raw.id,
    name: raw.name,
    label: raw.label,
    sizeInBytes: raw.size_in_bytes,
    downloadCount: raw.download_count,
    state: raw.state,
    contentType: raw.content_type,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    downloadUrl: raw.url,
    browserDownloadUrl: raw.browser_download_url,
  }
}

export class GithubClient {
  private readonly baseUrl: string
  private readonly token: string | undefined
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly endpointPolicy: EndpointPolicy

  constructor(options: GithubClientOptions = {}) {
    try {
      this.baseUrl = options.enforcePublicEndpoint === true
        ? normalizeBaseUrl(options.baseUrl, 'https://api.github.com')
        : (options.baseUrl ?? 'https://api.github.com').replace(/\/$/, '')
    } catch (error) {
      if (error instanceof EndpointSecurityError) throw new GithubError(error.message, 400)
      throw error
    }
    this.token = options.token
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.endpointPolicy = { enforcePublicEndpoint: options.enforcePublicEndpoint === true, lookupImpl: options.lookupImpl }
  }

  hasToken(): boolean {
    return Boolean(this.token)
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'dsh-tool-github',
    }
    if (this.token) headers.authorization = `Bearer ${this.token}`
    return headers
  }

  private combinedSignal(signal?: AbortSignal): AbortSignal | undefined {
    if (this.timeoutMs <= 0) return signal
    const timeout = AbortSignal.timeout(this.timeoutMs)
    return signal ? AbortSignal.any([signal, timeout]) : timeout
  }

  private async request<T>(path: string, options: { signal?: AbortSignal; method?: string; body?: unknown } = {}): Promise<T> {
    const headers = this.headers()
    const init: RequestInit = { headers, method: options.method ?? 'GET', signal: this.combinedSignal(options.signal) }
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json'
      init.body = JSON.stringify(options.body)
    }
        const blocked = await guardEndpoint(`${this.baseUrl}${path}`, this.endpointPolicy)
    if (blocked) throw new GithubError(blocked, 400)
const res = await this.fetchImpl(`${this.baseUrl}${path}`, init)
    if (res.status === 404) throw new GithubError('Not found', 404)
    if (res.status === 401) throw new GithubError('Invalid or missing GitHub token', 401)
    if (res.status === 403) throw new GithubError('GitHub rate limit exceeded or forbidden', 403)
    if (!res.ok) throw new GithubError(`GitHub API error ${res.status}`, res.status)
    if (res.status === 204) return undefined as T
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  async getRepo(owner: string, repo: string, signal?: AbortSignal): Promise<RepoInfo> {
    const data = await this.request<{
      full_name: string
      description: string | null
      stargazers_count: number
      language: string | null
      license: { spdx_id: string } | null
      homepage: string | null
      updated_at: string
    }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { signal })
    const [ownerName, name] = data.full_name.split('/')
    return {
      owner: ownerName,
      name,
      description: data.description,
      stars: data.stargazers_count,
      language: data.language,
      license: data.license?.spdx_id ?? null,
      homepage: data.homepage,
      updatedAt: data.updated_at,
    }
  }

  async searchRepos(query: string, options: { sort?: 'stars' | 'forks' | 'updated'; order?: 'asc' | 'desc'; perPage?: number; signal?: AbortSignal } = {}): Promise<{ total: number; items: RepoSearchItem[] }> {
    const params = new URLSearchParams({
      q: query,
      sort: options.sort ?? 'stars',
      order: options.order ?? 'desc',
      per_page: String(Math.max(1, Math.min(options.perPage ?? 5, 100))),
    })
    const data = await this.request<{
      total_count: number
      items: Array<{ full_name: string; description: string | null; stargazers_count: number; language: string | null; html_url: string }>
    }>(`/search/repositories?${params}`, { signal: options.signal })
    return {
      total: data.total_count,
      items: data.items.map(item => ({
        fullName: item.full_name,
        description: item.description,
        stars: item.stargazers_count,
        language: item.language,
        url: item.html_url,
      })),
    }
  }

  async listIssues(owner: string, repo: string, options: { state?: IssueState; label?: string; perPage?: number; signal?: AbortSignal } = {}): Promise<IssueItem[]> {
    const params = new URLSearchParams({
      state: options.state ?? 'open',
      per_page: String(Math.max(1, Math.min(options.perPage ?? 10, 100))),
    })
    if (options.label) params.set('labels', options.label)
    const data = await this.request<Array<{
      number: number
      title: string
      state: string
      labels: Array<{ name: string }>
      created_at: string
      user: { login: string } | null
      html_url: string
    }>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${params}`, { signal: options.signal })
    return data.map(item => ({
      number: item.number,
      title: item.title,
      state: item.state,
      labels: item.labels.map(label => label.name),
      createdAt: item.created_at,
      author: item.user?.login ?? 'unknown',
      url: item.html_url,
    }))
  }

  async searchCode(query: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<{ total: number; items: CodeSearchItem[] }> {
    const params = new URLSearchParams({
      q: query,
      per_page: String(Math.max(1, Math.min(options.perPage ?? 5, 100))),
    })
    const data = await this.request<{
      total_count: number
      items: Array<{ path: string; repository: { full_name: string }; html_url: string }>
    }>(`/search/code?${params}`, { signal: options.signal })
    return {
      total: data.total_count,
      items: data.items.map(item => ({
        path: item.path,
        repository: item.repository.full_name,
        url: item.html_url,
      })),
    }
  }

  async listPrs(owner: string, repo: string, options: { state?: 'open' | 'closed' | 'all'; perPage?: number; signal?: AbortSignal } = {}): Promise<PrItem[]> {
    const params = new URLSearchParams({
      state: options.state ?? 'open',
      per_page: String(Math.max(1, Math.min(options.perPage ?? 10, 100))),
    })
    const data = await this.request<Array<{
      number: number
      title: string
      state: string
      draft: boolean
      user: { login: string } | null
      head: { ref: string }
      base: { ref: string }
      created_at: string
      html_url: string
    }>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${params}`, { signal: options.signal })
    return data.map(item => ({
      number: item.number,
      title: item.title,
      state: item.state,
      draft: item.draft,
      author: item.user?.login ?? 'unknown',
      headRef: item.head.ref,
      baseRef: item.base.ref,
      createdAt: item.created_at,
      url: item.html_url,
    }))
  }

  async getFile(owner: string, repo: string, path: string, options: { ref?: string; signal?: AbortSignal } = {}): Promise<FileContent> {
    const query = options.ref ? `?ref=${encodeURIComponent(options.ref)}` : ''
    const data = await this.request<{
      name: string
      path: string
      size: number
      content: string
      encoding: string
      html_url: string
    }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}${query}`, { signal: options.signal })
    return {
      name: data.name,
      path: data.path,
      size: data.size,
      content: data.content,
      encoding: data.encoding,
      url: data.html_url,
    }
  }

  async listCommits(owner: string, repo: string, options: { branch?: string; author?: string; perPage?: number; signal?: AbortSignal } = {}): Promise<CommitItem[]> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 10, 100))),
    })
    if (options.branch) params.set('sha', options.branch)
    if (options.author) params.set('author', options.author)
    const data = await this.request<Array<{
      sha: string
      commit: { message: string; author: { name: string; date: string } }
      html_url: string
    }>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${params}`, { signal: options.signal })
    return data.map(item => ({
      sha: item.sha.slice(0, 7),
      message: item.commit.message.split('\n')[0],
      author: item.commit.author.name,
      date: item.commit.author.date,
      url: item.html_url,
    }))
  }

  async createIssue(owner: string, repo: string, input: { title: string; body?: string; labels?: string[] }, signal?: AbortSignal): Promise<IssueWriteResult> {
    try {
      const data = await this.request<{ number: number; html_url: string }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
        {
          method: 'POST',
          body: { title: input.title, body: input.body ?? '', labels: input.labels ?? [] },
          signal,
        },
      )
      return { ok: true, number: data.number, url: data.html_url }
    } catch (error) {
      if (error instanceof GithubError && error.status === 422) {
        return { ok: false, reason: 'Validation failed (e.g. an issue with this title already exists, or an invalid label).' }
      }
      throw error
    }
  }

  async commentOnIssue(owner: string, repo: string, issueNumber: number, body: string, signal?: AbortSignal): Promise<IssueWriteResult> {
    try {
      const data = await this.request<{ id: number; html_url: string }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
        { method: 'POST', body: { body }, signal },
      )
      return { ok: true, number: data.id, url: data.html_url }
    } catch (error) {
      if (error instanceof GithubError && error.status === 422) {
        return { ok: false, reason: 'Comment validation failed (e.g. the issue is locked or the comment is empty).' }
      }
      throw error
    }
  }

  async updateIssue(owner: string, repo: string, issueNumber: number, state: 'open' | 'closed', signal?: AbortSignal): Promise<IssueWriteResult> {
    try {
      const data = await this.request<{ number: number; html_url: string }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`,
        { method: 'PATCH', body: { state }, signal },
      )
      return { ok: true, number: data.number, url: data.html_url }
    } catch (error) {
      if (error instanceof GithubError && error.status === 404) {
        return { ok: false, reason: 'Issue not found.' }
      }
      throw error
    }
  }

  async listMilestones(owner: string, repo: string, options: { state?: 'open' | 'closed' | 'all'; perPage?: number; signal?: AbortSignal } = {}): Promise<MilestoneItem[]> {
    const params = new URLSearchParams({
      state: options.state ?? 'open',
      per_page: String(Math.max(1, Math.min(options.perPage ?? 20, 100))),
    })
    const data = await this.request<Array<{
      number: number
      title: string
      state: string
      open_issues: number
      closed_issues: number
      due_on: string | null
      description: string | null
      html_url: string
    }>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/milestones?${params}`, { signal: options.signal })
    return data.map(item => ({
      number: item.number,
      title: item.title,
      state: item.state,
      openIssues: item.open_issues,
      closedIssues: item.closed_issues,
      dueOn: item.due_on,
      description: item.description ?? '',
      url: item.html_url,
    }))
  }

  async setIssueMilestone(owner: string, repo: string, issueNumber: number, input: { milestoneNumber?: number | null; clear?: boolean }, signal?: AbortSignal): Promise<IssueMetaWriteResult> {
    try {
      const data = await this.request<{ number: number; milestone: { number: number } | null }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`,
        { method: 'PATCH', body: { milestone: input.clear ? null : input.milestoneNumber ?? null }, signal },
      )
      return { ok: true, number: data.number, milestoneNumber: data.milestone?.number ?? null }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, number: issueNumber, reason: 'Could not set the issue milestone (not found or invalid milestone).' }
      }
      throw error
    }
  }

  async setIssueLabels(owner: string, repo: string, issueNumber: number, labels: string[], signal?: AbortSignal): Promise<IssueMetaWriteResult> {
    try {
      const data = await this.request<{ number: number; labels: Array<{ name: string }> }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`,
        { method: 'PATCH', body: { labels }, signal },
      )
      return { ok: true, number: data.number, labels: data.labels.map(label => label.name) }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, number: issueNumber, reason: 'Could not set the issue labels (not found or invalid label).' }
      }
      throw error
    }
  }

  async addIssueAssignees(owner: string, repo: string, issueNumber: number, assignees: string[], signal?: AbortSignal): Promise<AssigneesWriteResult> {
    try {
      const data = await this.request<{ number: number; assignees: Array<{ login: string }> }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/assignees`,
        { method: 'POST', body: { assignees }, signal },
      )
      return { ok: true, number: data.number, assignees: data.assignees.map(assignee => assignee.login) }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, number: issueNumber, reason: 'Could not add issue assignees (not found or invalid assignee).' }
      }
      throw error
    }
  }

  async replyPrComment(owner: string, repo: string, prNumber: number, input: { commentId: number; body: string }, signal?: AbortSignal): Promise<PrCommentReplyResult> {
    try {
      const data = await this.request<{ id: number; html_url: string }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/comments`,
        { method: 'POST', body: { body: input.body, in_reply_to: input.commentId }, signal },
      )
      return { ok: true, commentId: data.id, url: data.html_url }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, commentId: input.commentId, reason: 'Could not reply to the PR review comment (not found or invalid reply).' }
      }
      throw error
    }
  }

  async listArtifacts(owner: string, repo: string, options: { name?: string; perPage?: number; signal?: AbortSignal } = {}): Promise<ArtifactListResult> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 20, 100))),
    })
    if (options.name) params.set('name', options.name)
    const data = await this.request<{ total_count: number; artifacts: RawWorkflowArtifact[] }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/artifacts?${params}`,
      { signal: options.signal },
    )
    return { total: data.total_count, items: data.artifacts.map(mapWorkflowArtifact) }
  }

  async listRunArtifacts(owner: string, repo: string, runId: number, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<ArtifactListResult> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 20, 100))),
    })
    const data = await this.request<{ total_count: number; artifacts: RawWorkflowArtifact[] }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/artifacts?${params}`,
      { signal: options.signal },
    )
    return { total: data.total_count, items: data.artifacts.map(mapWorkflowArtifact) }
  }

  async getArtifact(owner: string, repo: string, artifactId: number, signal?: AbortSignal): Promise<WorkflowArtifactItem> {
    const data = await this.request<RawWorkflowArtifact>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/artifacts/${artifactId}`,
      { signal },
    )
    return mapWorkflowArtifact(data)
  }

  async deleteArtifact(owner: string, repo: string, artifactId: number, signal?: AbortSignal): Promise<ArtifactWriteResult> {
    try {
      await this.request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/artifacts/${artifactId}`,
        { method: 'DELETE', signal },
      )
      return { ok: true, artifactId }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, artifactId, reason: 'Could not delete the workflow artifact (not found or invalid).' }
      }
      throw error
    }
  }

  async listEnvironments(owner: string, repo: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<EnvironmentListResult> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 20, 100))),
    })
    try {
      const data = await this.request<{ total_count: number; environments: RawEnvironment[] }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments?${params}`,
        { signal: options.signal },
      )
      return {
        found: true,
        total: data.total_count,
        items: (data.environments ?? []).map(mapEnvironment),
      }
    } catch (error) {
      if (error instanceof GithubError && error.status === 404) {
        return { found: false, total: 0, items: [] }
      }
      throw error
    }
  }

  async getEnvironment(owner: string, repo: string, environmentName: string, signal?: AbortSignal): Promise<EnvironmentItem> {
    const data = await this.request<RawEnvironment>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments/${encodeURIComponent(environmentName)}`,
      { signal },
    )
    return mapEnvironment(data)
  }

  async updateEnvironment(
    owner: string,
    repo: string,
    environmentName: string,
    input: {
      waitTimer?: number
      preventSelfReview?: boolean
      reviewers?: Array<{ type: 'User' | 'Team'; id: number }>
      protectedBranches?: boolean
      customBranchPolicies?: boolean
    },
    signal?: AbortSignal,
  ): Promise<EnvironmentWriteResult> {
    const body: Record<string, unknown> = {
      wait_timer: input.waitTimer ?? 0,
      prevent_self_review: input.preventSelfReview ?? false,
    }
    if (input.reviewers !== undefined) {
      body.reviewers = input.reviewers.map(reviewer => ({ type: reviewer.type, id: reviewer.id }))
    }
    if (input.protectedBranches !== undefined || input.customBranchPolicies !== undefined) {
      body.deployment_branch_policy = {
        protected_branches: input.protectedBranches ?? false,
        custom_branch_policies: input.customBranchPolicies ?? false,
      }
    }
    try {
      const data = await this.request<RawEnvironment>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments/${encodeURIComponent(environmentName)}`,
        { method: 'PUT', body, signal },
      )
      return { ok: true, name: data.name, url: data.html_url }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, name: environmentName, reason: 'Could not update the deployment environment (not found or invalid settings).' }
      }
      throw error
    }
  }

  async deleteEnvironment(owner: string, repo: string, environmentName: string, signal?: AbortSignal): Promise<EnvironmentWriteResult> {
    try {
      await this.request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments/${encodeURIComponent(environmentName)}`,
        { method: 'DELETE', signal },
      )
      return { ok: true, name: environmentName }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, name: environmentName, reason: 'Could not delete the deployment environment (not found or invalid).' }
      }
      throw error
    }
  }

  async createPrDraft(owner: string, repo: string, input: { title: string; head: string; base: string; body?: string }, signal?: AbortSignal): Promise<PrDraftResult> {
    try {
      const data = await this.request<{ number: number; html_url: string; draft: boolean }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
        {
          method: 'POST',
          body: { title: input.title, head: input.head, base: input.base, body: input.body ?? '', draft: true },
          signal,
        },
      )
      return { created: true, number: data.number, url: data.html_url }
    } catch (error) {
      if (error instanceof GithubError && error.status === 422) {
        return { created: false, reason: 'Validation failed (e.g. the head branch does not exist or a pull request already exists).' }
      }
      throw error
    }
  }

  async mergePr(owner: string, repo: string, prNumber: number, options: { mergeMethod?: 'merge' | 'squash' | 'rebase'; signal?: AbortSignal } = {}): Promise<IssueWriteResult> {
    try {
      const data = await this.request<{ merged: boolean; html_url: string }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/merge`,
        { method: 'PUT', body: { merge_method: options.mergeMethod ?? 'merge' }, signal: options.signal },
      )
      return { ok: data.merged, number: prNumber, url: data.html_url }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 405 || error.status === 409)) {
        return { ok: false, number: prNumber, reason: 'Pull request is not mergeable (e.g. conflicts, pending checks, or already merged).' }
      }
      if (error instanceof GithubError && error.status === 404) {
        return { ok: false, number: prNumber, reason: 'Pull request not found.' }
      }
      throw error
    }
  }

  async listReleases(owner: string, repo: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<ReleaseItem[]> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 10, 100))),
    })
    const data = await this.request<Array<{
      tag_name: string
      name: string
      draft: boolean
      prerelease: boolean
      author: { login: string } | null
      published_at: string | null
      html_url: string
    }>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?${params}`, { signal: options.signal })
    return data.map(item => ({
      tagName: item.tag_name,
      name: item.name,
      draft: item.draft,
      prerelease: item.prerelease,
      author: item.author?.login ?? 'unknown',
      publishedAt: item.published_at ?? '',
      url: item.html_url,
    }))
  }

  async listBranches(owner: string, repo: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<BranchItem[]> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 20, 100))),
    })
    const data = await this.request<Array<{ name: string; commit: { sha: string } }>>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?${params}`,
      { signal: options.signal },
    )
    return data.map(item => ({ name: item.name, sha: item.commit.sha.slice(0, 7) }))
  }

  async getIssue(owner: string, repo: string, issueNumber: number, signal?: AbortSignal): Promise<IssueDetail> {
    const data = await this.request<{
      number: number
      title: string
      state: string
      user: { login: string } | null
      created_at: string
      labels: Array<{ name: string }>
      body: string | null
      html_url: string
    }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`, { signal })
    return {
      number: data.number,
      title: data.title,
      state: data.state,
      author: data.user?.login ?? 'unknown',
      createdAt: data.created_at,
      labels: data.labels.map(label => label.name),
      body: data.body ?? '',
      url: data.html_url,
    }
  }

  async listIssueComments(owner: string, repo: string, issueNumber: number, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<CommentItem[]> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 20, 100))),
    })
    const data = await this.request<Array<{
      id: number
      user: { login: string } | null
      created_at: string
      body: string
      html_url: string
    }>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments?${params}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      author: item.user?.login ?? 'unknown',
      createdAt: item.created_at,
      body: item.body,
      url: item.html_url,
    }))
  }

  async listPrComments(owner: string, repo: string, prNumber: number, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<CommentItem[]> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 20, 100))),
    })
    const data = await this.request<Array<{
      id: number
      user: { login: string } | null
      created_at: string
      body: string
      html_url: string
    }>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/comments?${params}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      author: item.user?.login ?? 'unknown',
      createdAt: item.created_at,
      body: item.body,
      url: item.html_url,
    }))
  }

  async getUser(username: string, signal?: AbortSignal): Promise<UserInfo> {
    const data = await this.request<{
      login: string
      name: string | null
      bio: string | null
      followers: number
      following: number
      public_repos: number
      location: string | null
      blog: string | null
      html_url: string
    }>(`/users/${encodeURIComponent(username)}`, { signal })
    return {
      login: data.login,
      name: data.name,
      bio: data.bio,
      followers: data.followers,
      following: data.following,
      publicRepos: data.public_repos,
      location: data.location,
      blog: data.blog,
      url: data.html_url,
    }
  }

  async getOrg(org: string, signal?: AbortSignal): Promise<OrgInfo> {
    const data = await this.request<RawOrg>(`/orgs/${encodeURIComponent(org)}`, { signal })
    return {
      login: data.login,
      name: data.name,
      description: data.description,
      publicRepos: data.public_repos,
      totalPrivateRepos: data.total_private_repos ?? null,
      location: data.location,
      blog: data.blog,
      createdAt: data.created_at,
      url: data.html_url,
    }
  }

  async listOrgRepos(org: string, options: { type?: 'all' | 'public' | 'private' | 'forks' | 'sources' | 'member'; perPage?: number; signal?: AbortSignal } = {}): Promise<OrgRepoItem[]> {
    const params = new URLSearchParams({
      type: options.type ?? 'all',
      per_page: String(Math.max(1, Math.min(options.perPage ?? 30, 100))),
    })
    const data = await this.request<RawOrgRepo[]>(
      `/orgs/${encodeURIComponent(org)}/repos?${params}`,
      { signal: options.signal },
    )
    return data.map(mapOrgRepo)
  }

  async listOrgMembers(org: string, options: { role?: 'all' | 'admin' | 'member'; perPage?: number; signal?: AbortSignal } = {}): Promise<OrgMemberItem[]> {
    const params = new URLSearchParams({
      role: options.role ?? 'all',
      per_page: String(Math.max(1, Math.min(options.perPage ?? 30, 100))),
    })
    const data = await this.request<RawOrgMember[]>(
      `/orgs/${encodeURIComponent(org)}/members?${params}`,
      { signal: options.signal },
    )
    return data.map(item => ({
      login: item.login,
      id: item.id,
      avatarUrl: item.avatar_url,
      url: item.html_url,
    }))
  }

  async listOrgTeams(org: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<TeamItem[]> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 30, 100))),
    })
    const data = await this.request<RawTeam[]>(
      `/orgs/${encodeURIComponent(org)}/teams?${params}`,
      { signal: options.signal },
    )
    return data.map(mapTeam)
  }

  async getTeam(org: string, teamSlug: string, signal?: AbortSignal): Promise<TeamItem> {
    const data = await this.request<RawTeam>(
      `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}`,
      { signal },
    )
    return mapTeam(data)
  }

  async listTeamMembers(org: string, teamSlug: string, options: { role?: 'all' | 'member' | 'maintainer'; perPage?: number; signal?: AbortSignal } = {}): Promise<OrgMemberItem[]> {
    const params = new URLSearchParams({
      role: options.role ?? 'all',
      per_page: String(Math.max(1, Math.min(options.perPage ?? 30, 100))),
    })
    const data = await this.request<RawOrgMember[]>(
      `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/members?${params}`,
      { signal: options.signal },
    )
    return data.map(item => ({
      login: item.login,
      id: item.id,
      avatarUrl: item.avatar_url,
      url: item.html_url,
    }))
  }

  async listTeamRepos(org: string, teamSlug: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<OrgRepoItem[]> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 30, 100))),
    })
    const data = await this.request<RawOrgRepo[]>(
      `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/repos?${params}`,
      { signal: options.signal },
    )
    return data.map(mapOrgRepo)
  }

  async setTeamMembership(org: string, teamSlug: string, username: string, input: { role?: 'member' | 'maintainer' } = {}, signal?: AbortSignal): Promise<TeamMembershipResult> {
    try {
      const data = await this.request<{ role: string; state: string }>(
        `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/memberships/${encodeURIComponent(username)}`,
        { method: 'PUT', body: { role: input.role ?? 'member' }, signal },
      )
      return { ok: true, username, role: data.role, state: data.state }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, username, reason: 'Could not update team membership (team or user not found, or invalid role).' }
      }
      throw error
    }
  }

  async removeTeamMembership(org: string, teamSlug: string, username: string, signal?: AbortSignal): Promise<TeamMembershipResult> {
    try {
      await this.request<unknown>(
        `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/memberships/${encodeURIComponent(username)}`,
        { method: 'DELETE', signal },
      )
      return { ok: true, username }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, username, reason: 'Could not remove team membership (team or user not found).' }
      }
      throw error
    }
  }

  async listCollaborators(owner: string, repo: string, options: {
    affiliation?: 'all' | 'direct' | 'outside'
    permission?: 'pull' | 'triage' | 'push' | 'maintain' | 'admin'
    perPage?: number
    signal?: AbortSignal
  } = {}): Promise<CollaboratorItem[]> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 30, 100))),
    })
    if (options.affiliation) params.set('affiliation', options.affiliation)
    if (options.permission) params.set('permission', options.permission)
    const data = await this.request<RawCollaborator[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators?${params}`,
      { signal: options.signal },
    )
    return data.map(mapCollaborator)
  }

  async getCollaboratorPermission(owner: string, repo: string, username: string, signal?: AbortSignal): Promise<CollaboratorPermissionItem> {
    const data = await this.request<RawCollaboratorPermission>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}/permission`,
      { signal },
    )
    return mapCollaboratorPermission(data)
  }

  async setCollaboratorPermission(
    owner: string,
    repo: string,
    username: string,
    input: { permission?: 'pull' | 'triage' | 'push' | 'maintain' | 'admin'; signal?: AbortSignal } = {},
  ): Promise<CollaboratorWriteResult> {
    try {
      const data = await this.request<RawCollaborator | undefined>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}`,
        { method: 'PUT', body: { permission: input.permission ?? 'pull' }, signal: input.signal },
      )
      return {
        ok: true,
        login: username,
        permission: input.permission ?? 'pull',
        created: data !== undefined,
      }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, login: username, reason: 'Could not add or update the collaborator (repository or user not found, or permission invalid).' }
      }
      throw error
    }
  }

  async removeCollaborator(owner: string, repo: string, username: string, signal?: AbortSignal): Promise<CollaboratorWriteResult> {
    try {
      await this.request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}`,
        { method: 'DELETE', signal },
      )
      return { ok: true, login: username }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, login: username, reason: 'Could not remove the collaborator (repository or user not found).' }
      }
      throw error
    }
  }

  async addTeamRepo(org: string, teamSlug: string, owner: string, repo: string, input: { permission?: 'pull' | 'push' | 'admin'; signal?: AbortSignal } = {}): Promise<TeamRepoWriteResult> {
    try {
      await this.request<unknown>(
        `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        { method: 'PUT', body: { permission: input.permission ?? 'push' }, signal: input.signal },
      )
      return { ok: true, org, teamSlug, repo: `${owner}/${repo}`, permission: input.permission ?? 'push' }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, org, teamSlug, repo: `${owner}/${repo}`, reason: 'Could not add the repository to the team (team, repo, or permission invalid).' }
      }
      throw error
    }
  }

  async removeTeamRepo(org: string, teamSlug: string, owner: string, repo: string, signal?: AbortSignal): Promise<TeamRepoWriteResult> {
    try {
      await this.request<unknown>(
        `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        { method: 'DELETE', signal },
      )
      return { ok: true, org, teamSlug, repo: `${owner}/${repo}` }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, org, teamSlug, repo: `${owner}/${repo}`, reason: 'Could not remove the repository from the team (team or repo not found).' }
      }
      throw error
    }
  }

  async listRepoWebhooks(owner: string, repo: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<WebhookItem[]> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 20, 100))),
    })
    const data = await this.request<RawWebhook[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks?${params}`,
      { signal: options.signal },
    )
    return data.map(mapWebhook)
  }

  async getRepoWebhook(owner: string, repo: string, hookId: number, signal?: AbortSignal): Promise<WebhookItem> {
    const data = await this.request<RawWebhook>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks/${hookId}`,
      { signal },
    )
    return mapWebhook(data)
  }

  async createRepoWebhook(
    owner: string,
    repo: string,
    input: {
      url: string
      contentType: 'json' | 'form'
      secret?: string
      insecureSsl?: boolean
      events?: string[]
      active?: boolean
    },
    signal?: AbortSignal,
  ): Promise<WebhookWriteResult> {
    const config: Record<string, unknown> = { url: input.url, content_type: input.contentType }
    if (input.secret !== undefined) config.secret = input.secret
    if (input.insecureSsl !== undefined) config.insecure_ssl = input.insecureSsl ? '1' : '0'
    const body: Record<string, unknown> = { name: 'web', config }
    if (input.events !== undefined) body.events = input.events
    if (input.active !== undefined) body.active = input.active
    try {
      const data = await this.request<RawWebhook>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`,
        { method: 'POST', body, signal },
      )
      return { ok: true, id: data.id, url: data.url }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, reason: 'Could not create the repository webhook (not found or invalid configuration).' }
      }
      throw error
    }
  }

  async updateRepoWebhook(
    owner: string,
    repo: string,
    hookId: number,
    input: {
      url?: string
      contentType?: 'json' | 'form'
      secret?: string
      insecureSsl?: boolean
      events?: string[]
      addEvents?: string[]
      removeEvents?: string[]
      active?: boolean
    },
    signal?: AbortSignal,
  ): Promise<WebhookWriteResult> {
    const body: Record<string, unknown> = {}
    if (input.url !== undefined || input.contentType !== undefined || input.secret !== undefined || input.insecureSsl !== undefined) {
      const config: Record<string, unknown> = {}
      if (input.url !== undefined) config.url = input.url
      if (input.contentType !== undefined) config.content_type = input.contentType
      if (input.secret !== undefined) config.secret = input.secret
      if (input.insecureSsl !== undefined) config.insecure_ssl = input.insecureSsl ? '1' : '0'
      body.config = config
    }
    if (input.events !== undefined) body.events = input.events
    if (input.addEvents !== undefined) body.add_events = input.addEvents
    if (input.removeEvents !== undefined) body.remove_events = input.removeEvents
    if (input.active !== undefined) body.active = input.active
    try {
      const data = await this.request<RawWebhook>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks/${hookId}`,
        { method: 'PATCH', body, signal },
      )
      return { ok: true, id: data.id, url: data.url }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, id: hookId, reason: 'Could not update the repository webhook (not found or invalid configuration).' }
      }
      throw error
    }
  }

  async deleteRepoWebhook(owner: string, repo: string, hookId: number, signal?: AbortSignal): Promise<WebhookWriteResult> {
    try {
      await this.request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks/${hookId}`,
        { method: 'DELETE', signal },
      )
      return { ok: true, id: hookId }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, id: hookId, reason: 'Could not delete the repository webhook (not found or invalid).' }
      }
      throw error
    }
  }

  async pingRepoWebhook(owner: string, repo: string, hookId: number, signal?: AbortSignal): Promise<WebhookWriteResult> {
    try {
      await this.request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks/${hookId}/pings`,
        { method: 'POST', body: {}, signal },
      )
      return { ok: true, id: hookId }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, id: hookId, reason: 'Could not ping the repository webhook (not found or invalid).' }
      }
      throw error
    }
  }

  async listReleaseAssets(owner: string, repo: string, releaseId: number, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<ReleaseAssetItem[]> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 30, 100))),
    })
    const data = await this.request<RawReleaseAsset[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${releaseId}/assets?${params}`,
      { signal: options.signal },
    )
    return data.map(mapReleaseAsset)
  }

  async getReleaseAsset(owner: string, repo: string, assetId: number, signal?: AbortSignal): Promise<ReleaseAssetItem> {
    const data = await this.request<RawReleaseAsset>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/assets/${assetId}`,
      { signal },
    )
    return mapReleaseAsset(data)
  }

  async updateReleaseAsset(owner: string, repo: string, assetId: number, input: { name?: string; label?: string }, signal?: AbortSignal): Promise<ReleaseAssetWriteResult> {
    const body: Record<string, unknown> = {}
    if (input.name !== undefined) body.name = input.name
    if (input.label !== undefined) body.label = input.label
    try {
      const data = await this.request<RawReleaseAsset>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/assets/${assetId}`,
        { method: 'PATCH', body, signal },
      )
      return { ok: true, id: data.id, name: data.name }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, id: assetId, reason: 'Could not update the release asset (not found or invalid name).' }
      }
      throw error
    }
  }

  async deleteReleaseAsset(owner: string, repo: string, assetId: number, signal?: AbortSignal): Promise<ReleaseAssetWriteResult> {
    try {
      await this.request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/assets/${assetId}`,
        { method: 'DELETE', signal },
      )
      return { ok: true, id: assetId }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, id: assetId, reason: 'Could not delete the release asset (not found or invalid).' }
      }
      throw error
    }
  }

  async listWorkflowRuns(owner: string, repo: string, options: { branch?: string; status?: string; perPage?: number; signal?: AbortSignal } = {}): Promise<WorkflowRunItem[]> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 10, 100))),
    })
    if (options.branch) params.set('branch', options.branch)
    if (options.status) params.set('status', options.status)
    const data = await this.request<{ workflow_runs: Array<{
      id: number
      name: string
      head_branch: string
      status: string
      conclusion: string | null
      created_at: string
      html_url: string
    }> }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?${params}`, { signal: options.signal })
    return data.workflow_runs.map(item => ({
      id: item.id,
      workflowName: item.name,
      headBranch: item.head_branch,
      status: item.status,
      conclusion: item.conclusion,
      createdAt: item.created_at,
      url: item.html_url,
    }))
  }

  async createBranch(owner: string, repo: string, branch: string, fromRef: string, signal?: AbortSignal): Promise<BranchCreateResult> {
    try {
      const base = await this.request<{ object: { sha: string } }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/${fromRef.split('/').map(encodeURIComponent).join('/')}`,
        { signal },
      )
      await this.request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
        { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: base.object.sha }, signal },
      )
      return { ok: true, name: branch }
    } catch (error) {
      if (error instanceof GithubError && error.status === 422) {
        return { ok: false, name: branch, reason: 'Branch already exists or the ref is invalid.' }
      }
      throw error
    }
  }

  async writeFile(owner: string, repo: string, path: string, content: string, options: { message: string; branch?: string; signal?: AbortSignal }): Promise<FileWriteResult> {
    try {
      const data = await this.request<{ commit: { sha: string } }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`,
        {
          method: 'PUT',
          body: {
            message: options.message,
            content: Buffer.from(content, 'utf8').toString('base64'),
            branch: options.branch,
          },
          signal: options.signal,
        },
      )
      return { ok: true, path, commitSha: data.commit.sha.slice(0, 7) }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 422 || error.status === 409)) {
        return { ok: false, path, reason: 'Could not write the file (validation failed or the branch has conflicts).' }
      }
      throw error
    }
  }

  async getReadme(owner: string, repo: string, options: { ref?: string; signal?: AbortSignal } = {}): Promise<ReadmeInfo> {
    try {
      const query = options.ref ? `?ref=${encodeURIComponent(options.ref)}` : ''
      const data = await this.request<{ content: string; encoding: string; size: number; html_url: string }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme${query}`,
        { signal: options.signal },
      )
      const content = data.encoding === 'base64' ? Buffer.from(data.content, 'base64').toString('utf8') : data.content
      return { found: true, content, size: data.size, url: data.html_url }
    } catch (error) {
      if (error instanceof GithubError && error.status === 404) {
        return { found: false }
      }
      throw error
    }
  }

  async listTags(owner: string, repo: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<TagItem[]> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 20, 100))),
    })
    const data = await this.request<Array<{ name: string; commit: { sha: string } }>>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags?${params}`,
      { signal: options.signal },
    )
    return data.map(item => ({ name: item.name, commitSha: item.commit.sha.slice(0, 7) }))
  }

  async starRepo(owner: string, repo: string, signal?: AbortSignal): Promise<StarResult> {
    try {
      await this.request<unknown>(`/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { method: 'PUT', signal })
      return { ok: true }
    } catch (error) {
      if (error instanceof GithubError && error.status === 404) {
        return { ok: false, reason: 'Repository not found.' }
      }
      throw error
    }
  }

  async unstarRepo(owner: string, repo: string, signal?: AbortSignal): Promise<StarResult> {
    try {
      await this.request<unknown>(`/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { method: 'DELETE', signal })
      return { ok: true }
    } catch (error) {
      if (error instanceof GithubError && error.status === 404) {
        return { ok: false, reason: 'Repository not found or not starred.' }
      }
      throw error
    }
  }

  async createRelease(owner: string, repo: string, input: { tagName: string; name?: string; body?: string; draft?: boolean; prerelease?: boolean }, signal?: AbortSignal): Promise<ReleaseCreateResult> {
    try {
      const data = await this.request<{ id: number; html_url: string }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`,
        {
          method: 'POST',
          body: {
            tag_name: input.tagName,
            name: input.name ?? input.tagName,
            body: input.body ?? '',
            draft: input.draft ?? false,
            prerelease: input.prerelease ?? false,
          },
          signal,
        },
      )
      return { ok: true, id: data.id, url: data.html_url }
    } catch (error) {
      if (error instanceof GithubError && error.status === 422) {
        return { ok: false, reason: 'Validation failed (e.g. the tag does not exist or the release already exists).' }
      }
      throw error
    }
  }

  async createRepository(input: { owner?: string; name: string; description?: string; privateRepo?: boolean; autoInit?: boolean }, signal?: AbortSignal): Promise<RepositoryCreateResult> {
    const path = input.owner ? `/orgs/${encodeURIComponent(input.owner)}/repos` : '/user/repos'
    try {
      const data = await this.request<{ full_name: string; html_url: string }>(path, {
        method: 'POST',
        body: {
          name: input.name,
          description: input.description ?? '',
          private: input.privateRepo ?? false,
          auto_init: input.autoInit ?? false,
        },
        signal,
      })
      return { ok: true, fullName: data.full_name, url: data.html_url }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 409 || error.status === 422)) {
        return { ok: false, reason: 'Could not create the repository (missing owner, duplicate name, or invalid settings).' }
      }
      throw error
    }
  }

  async setRepoTopic(owner: string, repo: string, names: string[], signal?: AbortSignal): Promise<RepoTopicResult> {
    try {
      const data = await this.request<{ names: string[] }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/topics`,
        { method: 'PUT', body: { names }, signal },
      )
      return { ok: true, names: data.names }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, reason: 'Could not update topics (repository not found or a topic is invalid).' }
      }
      throw error
    }
  }

  async listGists(options: { perPage?: number; signal?: AbortSignal } = {}): Promise<GistItem[]> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 20, 100))),
    })
    const data = await this.request<Array<{
      id: string
      description: string | null
      files: Record<string, unknown>
      owner: { login: string } | null
      public: boolean
      created_at: string
      updated_at: string
      html_url: string
    }>>(`/gists?${params}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      description: item.description ?? '',
      files: Object.keys(item.files ?? {}),
      owner: item.owner?.login ?? null,
      public: item.public,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      url: item.html_url,
    }))
  }

  async createGist(input: { description?: string; publicGist?: boolean; files: Array<{ filename: string; content: string }> }, signal?: AbortSignal): Promise<GistCreateResult> {
    try {
      const files: Record<string, { content: string }> = {}
      for (const file of input.files) files[file.filename] = { content: file.content }
      const data = await this.request<{ id: string; html_url: string }>('/gists', {
        method: 'POST',
        body: {
          description: input.description ?? '',
          public: input.publicGist ?? false,
          files,
        },
        signal,
      })
      return { ok: true, id: data.id, url: data.html_url }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, reason: 'Could not create the gist (invalid files or description).' }
      }
      throw error
    }
  }

  async listRepoVariables(owner: string, repo: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<RepoVariableListResult> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 30, 100))),
    })
    try {
      const data = await this.request<{
        total_count: number
        variables: Array<{ name: string; value: string; created_at: string; updated_at: string }>
      }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/variables?${params}`, { signal: options.signal })
      return {
        found: true,
        total: data.total_count,
        items: data.variables.map(item => ({
          name: item.name,
          value: item.value,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        })),
      }
    } catch (error) {
      if (error instanceof GithubError && error.status === 404) {
        return { found: false, total: 0, items: [] }
      }
      throw error
    }
  }

  async setRepoVariable(owner: string, repo: string, name: string, value: string, signal?: AbortSignal): Promise<RepoVariableWriteResult> {
    const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/variables`
    try {
      await this.request<unknown>(base, { method: 'POST', body: { name, value }, signal })
      return { ok: true, name, created: true }
    } catch (error) {
      if (error instanceof GithubError && error.status === 409) {
        try {
          await this.request<unknown>(`${base}/${encodeURIComponent(name)}`, { method: 'PATCH', body: { name, value }, signal })
          return { ok: true, name, updated: true }
        } catch (updateError) {
          if (updateError instanceof GithubError && (updateError.status === 404 || updateError.status === 422)) {
            return { ok: false, name, reason: 'Could not update the repository variable (not found or invalid value).' }
          }
          throw updateError
        }
      }
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, name, reason: 'Could not create or update the repository variable.' }
      }
      throw error
    }
  }

  async deleteRepoVariable(owner: string, repo: string, name: string, signal?: AbortSignal): Promise<RepoVariableWriteResult> {
    try {
      await this.request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/variables/${encodeURIComponent(name)}`,
        { method: 'DELETE', signal },
      )
      return { ok: true, name }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, name, reason: 'Could not delete the repository variable (not found or invalid name).' }
      }
      throw error
    }
  }

  async listRepoSecrets(owner: string, repo: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<RepoSecretListResult> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 30, 100))),
    })
    try {
      const data = await this.request<{
        total_count: number
        secrets: Array<{ name: string; created_at: string; updated_at: string }>
      }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/secrets?${params}`, { signal: options.signal })
      return {
        found: true,
        total: data.total_count,
        items: data.secrets.map(item => ({
          name: item.name,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        })),
      }
    } catch (error) {
      if (error instanceof GithubError && error.status === 404) {
        return { found: false, total: 0, items: [] }
      }
      throw error
    }
  }

  async deleteRepoSecret(owner: string, repo: string, name: string, signal?: AbortSignal): Promise<RepoSecretDeleteResult> {
    try {
      await this.request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/secrets/${encodeURIComponent(name)}`,
        { method: 'DELETE', signal },
      )
      return { ok: true, name }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, name, reason: 'Could not delete the repository secret (not found or invalid name).' }
      }
      throw error
    }
  }

  async setRepoSecret(owner: string, repo: string, name: string, value: string, signal?: AbortSignal): Promise<RepoSecretWriteResult> {
    try {
      const publicKey = await this.request<{ key_id: string; key: string }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/secrets/public-key`,
        { signal },
      )
      await sodium.ready
      const encryptedValue = sodium.crypto_box_seal(value, sodium.from_base64(publicKey.key), 'base64')
      await this.request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/secrets/${encodeURIComponent(name)}`,
        { method: 'PUT', body: { encrypted_value: encryptedValue, key_id: publicKey.key_id }, signal },
      )
      return { ok: true, name }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, name, reason: 'Could not create or update the repository secret (not found or invalid input).' }
      }
      throw error
    }
  }

  async getBranchProtection(owner: string, repo: string, branch: string, signal?: AbortSignal): Promise<BranchProtectionDetail> {
    try {
      const data = await this.request<{
        url: string
        required_status_checks: {
          strict: boolean
          contexts?: string[]
          checks?: Array<{ context: string }>
        } | null
        enforce_admins: { enabled: boolean } | null
        required_pull_request_reviews: {
          required_approving_review_count: number
          dismiss_stale_reviews: boolean
          require_code_owner_reviews: boolean
        } | null
        restrictions: unknown | null
        required_linear_history: { enabled: boolean } | null
        allow_force_pushes: { enabled: boolean } | null
        allow_deletions: { enabled: boolean } | null
        required_conversation_resolution: { enabled: boolean } | null
      }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}/protection`,
        { signal },
      )
      const checks = data.required_status_checks?.checks ? data.required_status_checks.checks.map(check => check.context) : data.required_status_checks?.contexts ?? []
      return {
        found: true,
        enabled: true,
        contexts: checks,
        strict: data.required_status_checks?.strict ?? false,
        enforceAdmins: data.enforce_admins?.enabled ?? false,
        requiredApprovingReviewCount: data.required_pull_request_reviews?.required_approving_review_count ?? 0,
        dismissStaleReviews: data.required_pull_request_reviews?.dismiss_stale_reviews ?? false,
        requireCodeOwnerReviews: data.required_pull_request_reviews?.require_code_owner_reviews ?? false,
        requiredLinearHistory: data.required_linear_history?.enabled ?? false,
        allowForcePushes: data.allow_force_pushes?.enabled ?? false,
        allowDeletions: data.allow_deletions?.enabled ?? false,
        requiredConversationResolution: data.required_conversation_resolution?.enabled ?? false,
        url: data.url,
      }
    } catch (error) {
      if (error instanceof GithubError && error.status === 404) {
        return { found: false }
      }
      throw error
    }
  }

  async setBranchProtection(owner: string, repo: string, branch: string, input: {
    requiredStatusChecks?: string[]
    strictRequiredStatusChecks?: boolean
    enforceAdmins?: boolean
    requiredApprovingReviewCount?: number
    dismissStaleReviews?: boolean
    requireCodeOwnerReviews?: boolean
    requiredLinearHistory?: boolean
    allowForcePushes?: boolean
    allowDeletions?: boolean
    requiredConversationResolution?: boolean
  }, signal?: AbortSignal): Promise<BranchProtectionWriteResult> {
    try {
      const data = await this.request<{ url: string }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}/protection`,
        {
          method: 'PUT',
          body: {
            required_status_checks: input.requiredStatusChecks?.length ? {
              strict: input.strictRequiredStatusChecks ?? true,
              contexts: input.requiredStatusChecks,
            } : null,
            enforce_admins: input.enforceAdmins ?? true,
            required_pull_request_reviews: input.requiredApprovingReviewCount ? {
              required_approving_review_count: input.requiredApprovingReviewCount,
              dismiss_stale_reviews: input.dismissStaleReviews ?? false,
              require_code_owner_reviews: input.requireCodeOwnerReviews ?? false,
            } : null,
            restrictions: null,
            required_linear_history: input.requiredLinearHistory ?? false,
            allow_force_pushes: input.allowForcePushes ?? false,
            allow_deletions: input.allowDeletions ?? false,
            required_conversation_resolution: input.requiredConversationResolution ?? false,
            block_creations: false,
            lock_branch: false,
          },
          signal,
        },
      )
      return { ok: true, branch, url: data.url }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 409 || error.status === 422)) {
        return { ok: false, branch, reason: 'Could not update branch protection (not found or invalid settings).' }
      }
      throw error
    }
  }

  async deleteBranchProtection(owner: string, repo: string, branch: string, signal?: AbortSignal): Promise<BranchProtectionWriteResult> {
    try {
      await this.request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}/protection`,
        { method: 'DELETE', signal },
      )
      return { ok: true, branch }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, branch, reason: 'Could not delete branch protection (not found or invalid branch).' }
      }
      throw error
    }
  }

  async listWorkflows(owner: string, repo: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<{ total: number; items: WorkflowItem[] }> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 10, 100))),
    })
    const data = await this.request<{
      total_count: number
      workflows: Array<{
        id: number
        name: string
        path: string
        state: string
        updated_at: string
        html_url: string
      }>
    }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows?${params}`, { signal: options.signal })
    return {
      total: data.total_count,
      items: data.workflows.map(item => ({
        id: item.id,
        name: item.name,
        path: item.path,
        state: item.state,
        updatedAt: item.updated_at,
        url: item.html_url,
      })),
    }
  }

  async getWorkflow(owner: string, repo: string, workflowId: number, signal?: AbortSignal): Promise<WorkflowItem> {
    const data = await this.request<{
      id: number
      name: string
      path: string
      state: string
      updated_at: string
      html_url: string
    }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${workflowId}`, { signal })
    return {
      id: data.id,
      name: data.name,
      path: data.path,
      state: data.state,
      updatedAt: data.updated_at,
      url: data.html_url,
    }
  }

  async getWorkflowRun(owner: string, repo: string, runId: number, signal?: AbortSignal): Promise<WorkflowRunDetail> {
    const data = await this.request<{
      id: number
      workflow_id: number
      name: string | null
      display_title: string
      head_branch: string
      head_sha: string
      status: string
      conclusion: string | null
      event: string
      actor: { login: string } | null
      created_at: string
      updated_at: string
      run_started_at: string | null
      html_url: string
    }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}`, { signal })
    return {
      id: data.id,
      workflowId: data.workflow_id,
      workflowName: data.name ?? data.display_title,
      displayTitle: data.display_title,
      headBranch: data.head_branch,
      headSha: data.head_sha,
      status: data.status,
      conclusion: data.conclusion,
      event: data.event,
      actor: data.actor?.login ?? 'unknown',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      runStartedAt: data.run_started_at,
      url: data.html_url,
    }
  }

  async listWorkflowJobs(owner: string, repo: string, runId: number, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<{ found: boolean; items: WorkflowJobItem[] }> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 30, 100))),
    })
    const data = await this.request<{ jobs: Array<{
      id: number
      name: string
      status: string
      conclusion: string | null
      started_at: string | null
      completed_at: string | null
      html_url: string
      steps: Array<{
        number: number
        name: string
        status: string
        conclusion: string | null
        started_at: string | null
        completed_at: string | null
      }>
    }> }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/jobs?${params}`, { signal: options.signal })
    return {
      found: true,
      items: data.jobs.map(job => ({
        id: job.id,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        steps: (job.steps ?? []).map(step => ({
          number: step.number,
          name: step.name,
          status: step.status,
          conclusion: step.conclusion,
          startedAt: step.started_at,
          completedAt: step.completed_at,
        })),
        url: job.html_url,
      })),
    }
  }

  async getWorkflowRunLogs(owner: string, repo: string, runId: number, options: { maxChars?: number; signal?: AbortSignal } = {}): Promise<WorkflowLogsResult> {
    const url = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/logs`
        const blocked = await guardEndpoint(`${this.baseUrl}${url}`, this.endpointPolicy)
    if (blocked) throw new GithubError(blocked, 400)
const res = await this.fetchImpl(`${this.baseUrl}${url}`, {
      headers: this.headers(),
      method: 'GET',
      signal: this.combinedSignal(options.signal),
    })
    if (res.status === 404) throw new GithubError('Not found', 404)
    if (res.status === 401) throw new GithubError('Invalid or missing GitHub token', 401)
    if (res.status === 403) throw new GithubError('GitHub rate limit exceeded or forbidden', 403)
    if (!res.ok) throw new GithubError(`GitHub API error ${res.status}`, res.status)

    const logs = parseWorkflowLogZip(await res.arrayBuffer())
    const maxChars = options.maxChars && options.maxChars > 0 ? options.maxChars : 200_000
    if (logs.length > maxChars) {
      return { found: true, logs: logs.slice(0, maxChars), truncated: true, totalChars: logs.length }
    }
    return { found: true, logs, totalChars: logs.length }
  }

  async rerunWorkflowRun(owner: string, repo: string, runId: number, signal?: AbortSignal): Promise<WorkflowActionResult> {
    try {
      await this.request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/rerun`,
        { method: 'POST', body: {}, signal },
      )
      return { ok: true, runId }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 409)) {
        return { ok: false, runId, reason: 'Cannot rerun this workflow run (not found or another run is already in progress).' }
      }
      throw error
    }
  }

  async cancelWorkflowRun(owner: string, repo: string, runId: number, signal?: AbortSignal): Promise<WorkflowActionResult> {
    try {
      await this.request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/cancel`,
        { method: 'POST', body: {}, signal },
      )
      return { ok: true, runId }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 409)) {
        return { ok: false, runId, reason: 'Cannot cancel this workflow run (not found or the run is already complete).' }
      }
      throw error
    }
  }

  async dispatchWorkflow(owner: string, repo: string, workflowId: number, input: { ref: string; inputs?: Record<string, string> }, signal?: AbortSignal): Promise<WorkflowDispatchResult> {
    try {
      const body: Record<string, unknown> = { ref: input.ref }
      if (input.inputs && Object.keys(input.inputs).length > 0) {
        body.inputs = input.inputs
      }
      await this.request<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${workflowId}/dispatches`,
        { method: 'POST', body, signal },
      )
      return { ok: true, workflowId }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, workflowId, reason: 'Cannot dispatch this workflow (not found, or the ref/inputs are invalid).' }
      }
      throw error
    }
  }

  async getPullRequest(owner: string, repo: string, prNumber: number, signal?: AbortSignal): Promise<PullRequestDetail> {
    const data = await this.request<{
      number: number
      title: string
      state: string
      draft: boolean
      user: { login: string } | null
      head: { ref: string; sha: string }
      base: { ref: string; sha: string }
      body: string | null
      mergeable: boolean | null
      merged: boolean
      review_decision: string | null
      additions: number
      deletions: number
      changed_files: number
      created_at: string
      updated_at: string
      merged_at: string | null
      html_url: string
    }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`, { signal })
    return {
      number: data.number,
      title: data.title,
      state: data.state,
      draft: data.draft,
      author: data.user?.login ?? 'unknown',
      headRef: data.head.ref,
      headSha: data.head.sha,
      baseRef: data.base.ref,
      baseSha: data.base.sha,
      body: data.body ?? '',
      mergeable: data.mergeable,
      merged: data.merged,
      reviewDecision: data.review_decision,
      additions: data.additions,
      deletions: data.deletions,
      changedFiles: data.changed_files,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      mergedAt: data.merged_at,
      url: data.html_url,
    }
  }

  async listPullRequestReviews(owner: string, repo: string, prNumber: number, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<PullRequestReviewItem[]> {
    const params = new URLSearchParams({
      per_page: String(Math.max(1, Math.min(options.perPage ?? 20, 100))),
    })
    const data = await this.request<Array<{
      id: number
      user: { login: string } | null
      state: string
      body: string | null
      submitted_at: string
      commit_id: string
      html_url: string
    }>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/reviews?${params}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      author: item.user?.login ?? 'unknown',
      state: item.state,
      body: item.body ?? '',
      submittedAt: item.submitted_at,
      commitSha: item.commit_id || null,
      url: item.html_url,
    }))
  }

  async requestPrReviewers(owner: string, repo: string, prNumber: number, input: { reviewers?: string[]; teamReviewers?: string[] }, signal?: AbortSignal): Promise<PrReviewersResult> {
    try {
      const body: Record<string, string[]> = {}
      if (input.reviewers && input.reviewers.length > 0) body.reviewers = input.reviewers
      if (input.teamReviewers && input.teamReviewers.length > 0) body.team_reviewers = input.teamReviewers
      const data = await this.request<{
        number: number
        requested_reviewers: Array<{ login: string }>
      }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/requested_reviewers`,
        { method: 'POST', body, signal },
      )
      return { ok: true, prNumber: data.number, reviewers: data.requested_reviewers.map(reviewer => reviewer.login) }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, prNumber, reason: 'Could not request reviewers (PR not found or a reviewer is invalid).' }
      }
      throw error
    }
  }

  async submitPrReview(owner: string, repo: string, prNumber: number, input: { body: string; event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' }, signal?: AbortSignal): Promise<PrReviewSubmitResult> {
    try {
      const data = await this.request<{ id: number; state: string; html_url: string }>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/reviews`,
        { method: 'POST', body: { body: input.body, event: input.event }, signal },
      )
      return { ok: true, reviewId: data.id, state: data.state, url: data.html_url }
    } catch (error) {
      if (error instanceof GithubError && (error.status === 404 || error.status === 422)) {
        return { ok: false, prNumber, reason: 'Could not submit the review (PR not found or the review payload is invalid).' }
      }
      throw error
    }
  }
}
