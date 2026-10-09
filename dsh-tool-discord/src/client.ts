/** Discord REST v10 client with injected fetch for deterministic tests. */

import { assertSafeUrl, EndpointSecurityError, normalizeBaseUrl, type LookupImpl } from './url-security.js'

export interface DiscordClientOptions {
  /** Discord bot token. It is never returned in canonical tool values. */
  token?: string
  /** API root, default https://discord.com/api/v10. */
  baseUrl?: string
  /** Request timeout in milliseconds. */
  timeoutMs?: number
  /** Fetch implementation for tests or a host transport. */
  fetchImpl?: typeof fetch
  /** Test-only DNS lookup override; production uses node:dns/promises. */
  lookupImpl?: LookupImpl
}

export type DiscordAction = 'add' | 'remove'

export interface DiscordAuthInfo { ok: boolean; reason?: string; userId: string; username: string; discriminator: string; globalName: string; bot: boolean }
export interface DiscordGuildInfo { id: string; name: string; icon: string; owner: boolean; permissions: string; approximateMemberCount: number; approximatePresenceCount: number }
export interface DiscordChannelInfo { id: string; guildId: string; name: string; type: number; parentId: string; position: number; topic: string; memberCount: number }
export interface DiscordMemberInfo { id: string; username: string; globalName: string; nick: string; bot: boolean; joinedAt: string; roles: string[] }
export interface DiscordMessageInfo { id: string; channelId: string; authorId: string; authorName: string; content: string; timestamp: string; editedTimestamp: string; replyTo: string; threadId: string; attachments: string[]; embeds: string[] }

export interface DiscordListResult<T> { items: T[]; nextBefore: string; nextAfter: string }
export interface DiscordMemberListResult { items: DiscordMemberInfo[]; nextAfter: string }
export interface DiscordMessageListResult { items: DiscordMessageInfo[]; nextBefore: string; nextAfter: string }
export interface DiscordSearchResult { total: number; items: DiscordMessageInfo[] }
export interface DiscordWriteResult { ok: boolean; reason?: string; messageId?: string; channelId?: string; url?: string }

export class DiscordError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: number, public readonly retryAfter?: number) {
    super(message)
    this.name = 'DiscordError'
  }
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function stringValue(value: unknown): string { return typeof value === 'string' ? value : value == null ? '' : String(value) }
function numberValue(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : Number(value ?? 0) || 0 }
function boolValue(value: unknown): boolean { return value === true }
function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value as number))) : fallback
}
function queryString(values: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') query.set(key, String(value))
  const rendered = query.toString()
  return rendered ? '?' + rendered : ''
}

function mapGuild(value: unknown): DiscordGuildInfo {
  const raw = record(value)
  return {
    id: stringValue(raw.id), name: stringValue(raw.name), icon: stringValue(raw.icon), owner: boolValue(raw.owner), permissions: stringValue(raw.permissions),
    approximateMemberCount: numberValue(raw.approximate_member_count), approximatePresenceCount: numberValue(raw.approximate_presence_count),
  }
}

function mapChannel(value: unknown): DiscordChannelInfo {
  const raw = record(value)
  return {
    id: stringValue(raw.id), guildId: stringValue(raw.guild_id), name: stringValue(raw.name), type: numberValue(raw.type), parentId: stringValue(raw.parent_id),
    position: numberValue(raw.position), topic: stringValue(raw.topic), memberCount: numberValue(raw.member_count),
  }
}

function mapMember(value: unknown): DiscordMemberInfo {
  const raw = record(value)
  const user = record(raw.user)
  return {
    id: stringValue(user.id || raw.user_id), username: stringValue(user.username), globalName: stringValue(user.global_name), nick: stringValue(raw.nick),
    bot: boolValue(user.bot), joinedAt: stringValue(raw.joined_at), roles: array(raw.roles).map(stringValue),
  }
}

function mapMessage(value: unknown, channelId = ''): DiscordMessageInfo {
  const raw = record(value)
  const author = record(raw.author)
  const reference = record(raw.message_reference)
  const thread = record(raw.thread)
  return {
    id: stringValue(raw.id), channelId: stringValue(raw.channel_id) || channelId, authorId: stringValue(author.id),
    authorName: stringValue(author.global_name) || stringValue(author.username) || stringValue(author.id), content: stringValue(raw.content),
    timestamp: stringValue(raw.timestamp), editedTimestamp: stringValue(raw.edited_timestamp), replyTo: stringValue(reference.message_id), threadId: stringValue(thread.id),
    attachments: array(raw.attachments).map(item => stringValue(record(item).url)).filter(Boolean),
    embeds: array(raw.embeds).map(item => JSON.stringify({ title: record(item).title, description: record(item).description, url: record(item).url })).filter(value => value !== '{}'),
  }
}

function writeResult(value: unknown, channelId: string): DiscordWriteResult {
  const raw = record(value)
  const messageId = stringValue(raw.id)
  return { ok: Boolean(messageId), messageId, channelId: stringValue(raw.channel_id) || channelId, url: messageId ? 'https://discord.com/channels/@me/' + channelId + '/' + messageId : '' }
}

export class DiscordClient {
  private readonly token: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly lookupImpl: LookupImpl | undefined

  constructor(private readonly options: DiscordClientOptions = {}) {
    this.token = options.token ?? ''
    try {
      this.baseUrl = normalizeBaseUrl(options.baseUrl, 'https://discord.com/api/v10')
    } catch (error) {
      if (error instanceof EndpointSecurityError) throw new DiscordError(error.message, 400)
      throw error
    }
    this.timeoutMs = options.timeoutMs ?? 15_000
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new Error('timeoutMs must be a positive finite number.')
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.lookupImpl = options.lookupImpl
  }

  hasToken(): boolean { return this.token.length > 0 }

  async authTest(signal?: AbortSignal): Promise<DiscordAuthInfo> {
    const raw = record(await this.request('/users/@me', {}, signal))
    return { ok: true, userId: stringValue(raw.id), username: stringValue(raw.username), discriminator: stringValue(raw.discriminator), globalName: stringValue(raw.global_name), bot: boolValue(raw.bot) }
  }

  async listGuilds(options: { limit?: number; before?: string; after?: string; withCounts?: boolean; signal?: AbortSignal } = {}): Promise<DiscordListResult<DiscordGuildInfo>> {
    const raw = array(await this.request('/users/@me/guilds' + queryString({ limit: clamp(options.limit, 1, 200, 100), before: options.before, after: options.after, with_counts: options.withCounts }), {}, options.signal)).map(mapGuild)
    return { items: raw, nextBefore: raw[0]?.id ?? '', nextAfter: raw.at(-1)?.id ?? '' }
  }

  async listChannels(guildId: string, signal?: AbortSignal): Promise<DiscordChannelInfo[]> {
    return array(await this.request('/guilds/' + encodeURIComponent(guildId) + '/channels', {}, signal)).map(mapChannel)
  }

  async listMembers(guildId: string, options: { limit?: number; after?: string; signal?: AbortSignal } = {}): Promise<DiscordMemberListResult> {
    const raw = array(await this.request('/guilds/' + encodeURIComponent(guildId) + '/members' + queryString({ limit: clamp(options.limit, 1, 1000, 100), after: options.after }), {}, options.signal)).map(mapMember)
    return { items: raw, nextAfter: raw.at(-1)?.id ?? '' }
  }

  async getChannel(channelId: string, signal?: AbortSignal): Promise<DiscordChannelInfo> {
    return mapChannel(await this.request('/channels/' + encodeURIComponent(channelId), {}, signal))
  }

  async listMessages(channelId: string, options: { limit?: number; before?: string; after?: string; around?: string; signal?: AbortSignal } = {}): Promise<DiscordMessageListResult> {
    const cursors = [options.before, options.after, options.around].filter(Boolean)
    if (cursors.length > 1) throw new Error('Discord message pagination accepts only one of before, after, or around.')
    const raw = array(await this.request('/channels/' + encodeURIComponent(channelId) + '/messages' + queryString({ limit: clamp(options.limit, 1, 100, 50), before: options.before, after: options.after, around: options.around }), {}, options.signal)).map(item => mapMessage(item, channelId))
    return { items: raw, nextBefore: raw[0]?.id ?? '', nextAfter: raw.at(-1)?.id ?? '' }
  }

  async getMessage(channelId: string, messageId: string, signal?: AbortSignal): Promise<DiscordMessageInfo> {
    return mapMessage(await this.request('/channels/' + encodeURIComponent(channelId) + '/messages/' + encodeURIComponent(messageId), {}, signal), channelId)
  }

  async searchMessages(guildId: string, options: { content?: string; authorId?: string; channelId?: string; limit?: number; offset?: number; signal?: AbortSignal } = {}): Promise<DiscordSearchResult> {
    const raw = record(await this.request('/guilds/' + encodeURIComponent(guildId) + '/messages/search' + queryString({ content: options.content, author_id: options.authorId, channel_id: options.channelId, limit: clamp(options.limit, 1, 25, 25), offset: clamp(options.offset, 0, 1000, 0) }), {}, options.signal))
    const items = array(raw.messages).flatMap(group => array(group).map(message => mapMessage(message)))
    return { total: numberValue(raw.total_results), items }
  }

  async sendMessage(channelId: string, input: { content: string; tts?: boolean }, signal?: AbortSignal): Promise<DiscordWriteResult> {
    this.validateContent(input.content)
    return writeResult(await this.request('/channels/' + encodeURIComponent(channelId) + '/messages', { method: 'POST', body: JSON.stringify({ content: input.content, tts: input.tts === true }) }, signal), channelId)
  }

  async editMessage(channelId: string, messageId: string, content: string, signal?: AbortSignal): Promise<DiscordWriteResult> {
    this.validateContent(content)
    return writeResult(await this.request('/channels/' + encodeURIComponent(channelId) + '/messages/' + encodeURIComponent(messageId), { method: 'PATCH', body: JSON.stringify({ content }) }, signal), channelId)
  }

  async deleteMessage(channelId: string, messageId: string, signal?: AbortSignal): Promise<DiscordWriteResult> {
    await this.request('/channels/' + encodeURIComponent(channelId) + '/messages/' + encodeURIComponent(messageId), { method: 'DELETE' }, signal)
    return { ok: true, messageId, channelId }
  }

  async reactMessage(channelId: string, messageId: string, emoji: string, action: DiscordAction, signal?: AbortSignal): Promise<DiscordWriteResult & { action: DiscordAction; emoji: string }> {
    if (!emoji) throw new Error('Discord emoji is required.')
    const path = '/channels/' + encodeURIComponent(channelId) + '/messages/' + encodeURIComponent(messageId) + '/reactions/' + encodeURIComponent(emoji) + '/@me'
    await this.request(path, { method: action === 'add' ? 'PUT' : 'DELETE' }, signal)
    return { ok: true, action, emoji, channelId, messageId }
  }

  async dispose(): Promise<void> {}

  private validateContent(content: string): void {
    if (!content.trim()) throw new Error('Discord message content must not be empty.')
    if (content.length > 2000) throw new Error('Discord message content must be at most 2000 characters.')
  }

  private async request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController()
    const onAbort = () => controller.abort(signal?.reason)
    if (signal) {
      if (signal.aborted) controller.abort(signal.reason)
      else signal.addEventListener('abort', onAbort, { once: true })
    }
    const timer = setTimeout(() => controller.abort(new Error('Discord request timed out after ' + this.timeoutMs + 'ms')), this.timeoutMs)
    try {
      const headers: Record<string, string> = { accept: 'application/json', authorization: 'Bot ' + this.token }
      if (init.body !== undefined && init.body !== null) headers['content-type'] = 'application/json'
      const url = new URL(this.baseUrl + path)
      try {
        await assertSafeUrl(url, this.lookupImpl)
      } catch (error) {
        if (error instanceof EndpointSecurityError) throw new DiscordError(error.message, 400)
        throw error
      }
      const response = await this.fetchImpl(url.toString(), { ...init, headers: { ...headers, ...init.headers }, signal: controller.signal })
      if (!response.ok) {
        let message = 'Discord API request failed with status ' + response.status
        let code: number | undefined
        let retryAfter: number | undefined
        try {
          const data = record(await response.json())
          if (data.message) message = stringValue(data.message)
          code = typeof data.code === 'number' ? data.code : undefined
          retryAfter = typeof data.retry_after === 'number' ? data.retry_after : Number(data.retry_after) || undefined
        } catch { /* status text is the only available error detail */ }
        if (retryAfter === undefined) {
          const headerRetryAfter = Number(response.headers.get('retry-after'))
          retryAfter = Number.isFinite(headerRetryAfter) && headerRetryAfter > 0 ? headerRetryAfter : undefined
        }
        if (retryAfter !== undefined) message += ' Retry after ' + retryAfter + ' seconds.'
        throw new DiscordError(message, response.status, code, retryAfter)
      }
      if (response.status === 204) return undefined as T
      return await response.json() as T
    } finally {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }
  }
}
