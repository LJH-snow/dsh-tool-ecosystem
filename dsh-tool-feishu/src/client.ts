/** Feishu/Lark Open API client with injected fetch for testability. */

import { assertSafeUrl, EndpointSecurityError, normalizeBaseUrl, type LookupImpl } from './url-security.js'

export interface FeishuClientOptions {
  /** Feishu app id for tenant_access_token authentication. */
  appId?: string
  /** Feishu app secret for tenant_access_token authentication. */
  appSecret?: string
  /** Pre-configured tenant access token. When provided, appId/appSecret are ignored. */
  token?: string
  /** Feishu Open API base URL. Default https://open.feishu.cn/open-apis. Use https://open.larksuite.com/open-apis for Lark international. */
  baseUrl?: string
  /** Request timeout in milliseconds. 0 disables the timeout. */
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /** Test-only DNS lookup override; production uses node:dns/promises. */
  lookupImpl?: LookupImpl
}

export class FeishuError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly apiCode: number | null = null,
  ) {
    super(message)
    this.name = 'FeishuError'
  }
}

interface TokenCache {
  token: string
  expiresAt: number
}

export interface ChatInfo {
  chatId: string
  name: string
  description: string
  avatar: string
  ownerType: string
  ownerId: string
  chatMode: string
  chatType: string
  external: boolean
  tenantKey: string
  memberCount: number
  botInChat: boolean
}

export interface ChatMemberInfo {
  memberId: string
  memberIdType: string
  name: string
  tenantKey: string
}

export interface MessageInfo {
  messageId: string
  rootId: string
  parentId: string
  createTime: string
  updateTime: string
  chatId: string
  msgType: string
  content: string
  senderId: string
  senderType: string
  deleted: boolean
  updated: boolean
  mentions: Array<{ key: string; id: string; name: string }>
}

export interface UserInfo {
  userId: string
  openId: string
  unionId: string
  name: string
  enName: string
  nickname: string
  email: string
  mobile: string
  avatar: string
  status: string
  departmentIds: string[]
  jobTitle: string
  city: string
  country: string
  tenantKey: string
}

export interface CalendarInfo {
  calendarId: string
  summary: string
  description: string
  permissions: string
  type: string
  role: string
}

export interface CalendarEventInfo {
  eventId: string
  summary: string
  description: string
  startTime: string
  endTime: string
  status: string
  organizerId: string
  location: string
  recurrence: string
}

export interface ApprovalInstanceInfo {
  approvalCode: string
  instanceId: string
  status: string
  title: string
  form: string
  createTime: string
  updateTime: string
  userId: string
}

export interface ApprovalInstanceDetailInfo extends ApprovalInstanceInfo {
  approvalName: string
  instanceCode: string
  serialNumber: string
  departmentId: string
  openId: string
  uuid: string
  startTime: string
  endTime: string
  modifiedInstanceCode: string
  revertedInstanceCode: string
  reverted: boolean
  taskIds: string[]
  taskCount: number
  commentCount: number
  timelineCount: number
}

export interface DepartmentInfo {
  departmentId: string
  openDepartmentId: string
  parentDepartmentId: string
  name: string
  memberCount: number
  leaderUserId: string
  status: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : value != null ? String(value) : ''
}

function asNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  return typeof value === 'number' ? value : 0
}

function asBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  return typeof value === 'boolean' ? value : false
}

function toJson(value: unknown): string {
  try { return JSON.stringify(value ?? {}) } catch { return '{}' }
}

function mapChat(data: unknown): ChatInfo {
  const r = asRecord(data)
  return {
    chatId: asString(r, 'chat_id'),
    name: asString(r, 'name'),
    description: asString(r, 'description'),
    avatar: asString(r, 'avatar'),
    ownerType: asString(r, 'owner_id_type'),
    ownerId: asString(r, 'owner_id'),
    chatMode: asString(r, 'chat_mode'),
    chatType: asString(r, 'chat_type'),
    external: asBoolean(r, 'external'),
    tenantKey: asString(r, 'tenant_key'),
    memberCount: asNumber(r, 'user_count'),
    botInChat: asBoolean(r, 'bot_in_chat'),
  }
}

function mapChatMember(data: unknown): ChatMemberInfo {
  const r = asRecord(data)
  return {
    memberId: asString(r, 'member_id'),
    memberIdType: asString(r, 'member_id_type'),
    name: asString(r, 'name'),
    tenantKey: asString(r, 'tenant_key'),
  }
}

function mapMessage(data: unknown): MessageInfo {
  const r = asRecord(data)
  const sender = asRecord(r.sender)
  return {
    messageId: asString(r, 'message_id'),
    rootId: asString(r, 'root_id'),
    parentId: asString(r, 'parent_id'),
    createTime: asString(r, 'create_time'),
    updateTime: asString(r, 'update_time'),
    chatId: asString(r, 'chat_id'),
    msgType: asString(r, 'msg_type'),
    content: asString(r, 'body') ? asString(asRecord(r.body), 'content') : asString(r, 'content'),
    senderId: asString(sender, 'id'),
    senderType: asString(sender, 'sender_type'),
    deleted: asBoolean(r, 'deleted'),
    updated: asBoolean(r, 'updated'),
    mentions: asArray(r.mentions).map(m => {
      const mr = asRecord(m)
      return { key: asString(mr, 'key'), id: asString(mr, 'id'), name: asString(mr, 'name') }
    }),
  }
}

function mapUser(data: unknown): UserInfo {
  const r = asRecord(data)
  return {
    userId: asString(r, 'user_id'),
    openId: asString(r, 'open_id'),
    unionId: asString(r, 'union_id'),
    name: asString(r, 'name'),
    enName: asString(r, 'en_name'),
    nickname: asString(r, 'nickname'),
    email: asString(r, 'email'),
    mobile: asString(r, 'mobile'),
    avatar: asString(asRecord(r.avatar), 'avatar_origin') || asString(asRecord(r.avatar), 'avatar_72'),
    status: asBoolean(asRecord(r.status), 'is_activated') ? 'active' : 'inactive',
    departmentIds: asArray(r.department_ids).map(d => String(d)),
    jobTitle: asString(r, 'job_title'),
    city: asString(r, 'city'),
    country: asString(r, 'country'),
    tenantKey: asString(r, 'tenant_key'),
  }
}

function mapCalendar(data: unknown): CalendarInfo {
  const r = asRecord(data)
  return {
    calendarId: asString(r, 'calendar_id'),
    summary: asString(r, 'summary'),
    description: asString(r, 'description'),
    permissions: asString(r, 'permissions'),
    type: asString(r, 'type'),
    role: asString(r, 'role'),
  }
}

function mapCalendarEvent(data: unknown): CalendarEventInfo {
  const r = asRecord(data)
  const start = asRecord(r.start_time)
  const end = asRecord(r.end_time)
  return {
    eventId: asString(r, 'event_id'),
    summary: asString(r, 'summary'),
    description: asString(r, 'description'),
    startTime: asString(start, 'timestamp') || asString(start, 'date'),
    endTime: asString(end, 'timestamp') || asString(end, 'date'),
    status: asString(r, 'status'),
    organizerId: asString(asRecord(r.organizer), 'user_id'),
    location: asString(asRecord(r.location), 'name'),
    recurrence: toJson(r.recurrence),
  }
}

function mapApprovalInstance(data: unknown): ApprovalInstanceInfo {
  const r = asRecord(data)
  return {
    approvalCode: asString(r, 'approval_code'),
    instanceId: asString(r, 'instance_id'),
    status: asString(r, 'status'),
    title: asString(r, 'title'),
    form: typeof r.form === 'string' ? r.form : toJson(r.form),
    createTime: asString(r, 'create_time'),
    updateTime: asString(r, 'update_time'),
    userId: asString(r, 'user_id'),
  }
}

function mapApprovalInstanceDetail(data: unknown): ApprovalInstanceDetailInfo {
  const r = asRecord(data)
  const taskList = asArray(r.task_list)
  const timeline = asArray(r.timeline)
  const commentList = asArray(r.comment_list)
  const taskIds = Array.from(new Set([
    ...taskList.map(item => asString(asRecord(item), 'task_id')),
    ...timeline.map(item => asString(asRecord(item), 'task_id')),
  ].filter(Boolean)))
  const approvalCode = asString(r, 'approval_code')
  const instanceCode = asString(r, 'instance_code') || asString(r, 'instance_id')
  const instanceId = asString(r, 'instance_id') || instanceCode
  const title = asString(r, 'title') || asString(r, 'approval_name')
  return {
    approvalCode,
    instanceId,
    status: asString(r, 'status'),
    title,
    form: typeof r.form === 'string' ? r.form : toJson(r.form),
    createTime: asString(r, 'create_time'),
    updateTime: asString(r, 'update_time'),
    userId: asString(r, 'user_id'),
    approvalName: asString(r, 'approval_name') || title,
    instanceCode,
    serialNumber: asString(r, 'serial_number'),
    departmentId: asString(r, 'department_id'),
    openId: asString(r, 'open_id'),
    uuid: asString(r, 'uuid'),
    startTime: asString(r, 'start_time'),
    endTime: asString(r, 'end_time'),
    modifiedInstanceCode: asString(r, 'modified_instance_code'),
    revertedInstanceCode: asString(r, 'reverted_instance_code'),
    reverted: asBoolean(r, 'reverted'),
    taskIds,
    taskCount: taskList.length,
    commentCount: commentList.length,
    timelineCount: timeline.length,
  }
}

function mapDepartment(data: unknown): DepartmentInfo {
  const r = asRecord(data)
  return {
    departmentId: asString(r, 'department_id'),
    openDepartmentId: asString(r, 'open_department_id'),
    parentDepartmentId: asString(r, 'parent_department_id'),
    name: asString(r, 'name'),
    memberCount: asNumber(r, 'member_count'),
    leaderUserId: asString(r, 'leader_user_id'),
    status: asString(r, 'status'),
  }
}

export class FeishuClient {
  private readonly appId: string
  private readonly appSecret: string
  private readonly staticToken: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly lookupImpl: LookupImpl | undefined
  private tokenCache: TokenCache | null = null

  constructor(options: FeishuClientOptions = {}) {
    this.appId = options.appId ?? ''
    this.appSecret = options.appSecret ?? ''
    this.staticToken = options.token ?? ''
    try {
      this.baseUrl = normalizeBaseUrl(options.baseUrl, 'https://open.feishu.cn/open-apis')
    } catch (error) {
      if (error instanceof EndpointSecurityError) throw new FeishuError(error.message, 400)
      throw error
    }
    this.timeoutMs = options.timeoutMs ?? 15000
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.lookupImpl = options.lookupImpl
  }

  hasCredentials(): boolean {
    return Boolean(this.staticToken || (this.appId && this.appSecret))
  }

  private async getToken(signal?: AbortSignal): Promise<string> {
    if (this.staticToken) return this.staticToken
    if (!this.appId || !this.appSecret) throw new FeishuError('Feishu credentials not configured.', 401)
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) return this.tokenCache.token
    const data = await this.request('POST', '/auth/v3/tenant_access_token/internal', {
      body: { app_id: this.appId, app_secret: this.appSecret },
      auth: false,
      unwrapData: false,
      signal,
    })
    const record = asRecord(data)
    const body = asRecord(record.data)
    const token = asString(record, 'tenant_access_token') || asString(body, 'tenant_access_token')
    const expire = asNumber(record, 'expire') || asNumber(body, 'expire')
    if (!token) throw new FeishuError('Failed to obtain tenant access token.', 401)
    this.tokenCache = { token, expiresAt: Date.now() + (expire - 60) * 1000 }
    return token
  }

  private async request(
    method: string,
    path: string,
    options: {
      body?: unknown
      params?: Record<string, string>
      auth?: boolean
      unwrapData?: boolean
      signal?: AbortSignal
    } = {},
  ): Promise<unknown> {
    const { body, params, auth = true, unwrapData = true, signal } = options
    let url = `${this.baseUrl}${path}`
    if (params) {
      const qs = Object.entries(params).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
      if (qs) url += `?${qs}`
    }
    const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' }
    if (auth) {
      const token = await this.getToken(signal)
      headers.authorization = `Bearer ${token}`
    }
    const controller = new AbortController()
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
    const timer = this.timeoutMs > 0 ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined
    try {
      const target = new URL(url)
      try {
        await assertSafeUrl(target, this.lookupImpl)
      } catch (error) {
        if (error instanceof EndpointSecurityError) throw new FeishuError(error.message, 400)
        throw error
      }
      const response = await this.fetchImpl(target.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: combined,
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new FeishuError(`Feishu API ${method} ${path} returned HTTP ${response.status}: ${text}`, response.status)
      }
      const json = await response.json() as Record<string, unknown>
      const code = asNumber(json, 'code')
      if (code !== 0) {
        const msg = asString(json, 'msg')
        throw new FeishuError(`Feishu API error: ${msg} (code ${code})`, 400, code)
      }
      return unwrapData && Object.hasOwn(json, 'data') ? json.data : json
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async authTest(signal?: AbortSignal): Promise<{ ok: boolean; appId: string; tenantToken: string }> {
    const token = await this.getToken(signal)
    return { ok: true, appId: this.appId || '(static token)', tenantToken: token.slice(0, 8) + '...' }
  }

  async listChats(options: {
    pageSize?: number
    pageToken?: string
    signal?: AbortSignal
  } = {}): Promise<{ items: ChatInfo[]; hasMore: boolean; pageToken: string }> {
    const params: Record<string, string> = {}
    if (options.pageSize) params.page_size = String(options.pageSize)
    if (options.pageToken) params.page_token = options.pageToken
    const data = asRecord(await this.request('GET', '/im/v1/chats', { params, signal: options.signal }))
    return {
      items: asArray(data.items).map(mapChat),
      hasMore: asBoolean(data, 'has_more'),
      pageToken: asString(data, 'page_token'),
    }
  }

  async getChat(chatId: string, signal?: AbortSignal): Promise<ChatInfo> {
    const data = await this.request('GET', `/im/v1/chats/${encodeURIComponent(chatId)}`, { signal })
    return mapChat(data)
  }

  async listChatMembers(chatId: string, options: {
    pageSize?: number
    pageToken?: string
    signal?: AbortSignal
  } = {}): Promise<{ items: ChatMemberInfo[]; hasMore: boolean; pageToken: string }> {
    const params: Record<string, string> = {}
    if (options.pageSize) params.page_size = String(options.pageSize)
    if (options.pageToken) params.page_token = options.pageToken
    const data = asRecord(await this.request('GET', `/im/v1/chats/${encodeURIComponent(chatId)}/members`, { params, signal: options.signal }))
    return {
      items: asArray(data.items).map(mapChatMember),
      hasMore: asBoolean(data, 'has_more'),
      pageToken: asString(data, 'page_token'),
    }
  }

  async listMessages(chatId: string, options: {
    startTime?: string
    endTime?: string
    pageSize?: number
    pageToken?: string
    signal?: AbortSignal
  } = {}): Promise<{ items: MessageInfo[]; hasMore: boolean; pageToken: string }> {
    const params: Record<string, string> = { container_id_type: 'chat', container_id: chatId }
    if (options.startTime) params.start_time = options.startTime
    if (options.endTime) params.end_time = options.endTime
    if (options.pageSize) params.page_size = String(options.pageSize)
    if (options.pageToken) params.page_token = options.pageToken
    const data = asRecord(await this.request('GET', '/im/v1/messages', { params, signal: options.signal }))
    return {
      items: asArray(data.items).map(mapMessage),
      hasMore: asBoolean(data, 'has_more'),
      pageToken: asString(data, 'page_token'),
    }
  }

  async getMessage(messageId: string, signal?: AbortSignal): Promise<MessageInfo> {
    const data = await this.request('GET', `/im/v1/messages/${encodeURIComponent(messageId)}`, { signal })
    const record = asRecord(data)
    return mapMessage(asArray(record.items)[0] ?? record)
  }

  async sendMessage(chatId: string, msgType: string, content: string, signal?: AbortSignal): Promise<{ messageId: string }> {
    const data = asRecord(await this.request('POST', '/im/v1/messages', {
      body: { receive_id: chatId, msg_type: msgType, content },
      params: { receive_id_type: 'chat_id' },
      signal,
    }))
    return { messageId: asString(asRecord(data), 'message_id') }
  }

  async getUser(userId: string, options: { userIdType?: string; departmentIdType?: string; signal?: AbortSignal } = {}): Promise<UserInfo> {
    const params: Record<string, string> = {}
    if (options.userIdType) params.user_id_type = options.userIdType
    if (options.departmentIdType) params.department_id_type = options.departmentIdType
    const data = await this.request('GET', `/contact/v3/users/${encodeURIComponent(userId)}`, { params, signal: options.signal })
    return mapUser(asRecord(data).user ?? data)
  }

  async listUsers(options: {
    departmentId?: string
    departmentIdType?: string
    pageSize?: number
    pageToken?: string
    signal?: AbortSignal
  } = {}): Promise<{ items: UserInfo[]; hasMore: boolean; pageToken: string }> {
    const params: Record<string, string> = {}
    params.department_id = options.departmentId ?? '0'
    if (options.departmentIdType) params.department_id_type = options.departmentIdType
    if (options.pageSize) params.page_size = String(options.pageSize)
    if (options.pageToken) params.page_token = options.pageToken
    const data = asRecord(await this.request('GET', '/contact/v3/users/find_by_department', { params, signal: options.signal }))
    return {
      items: asArray(data.items).map(item => mapUser(asRecord(item).user ?? item)),
      hasMore: asBoolean(data, 'has_more'),
      pageToken: asString(data, 'page_token'),
    }
  }

  async listCalendars(options: {
    pageSize?: number
    pageToken?: string
    syncToken?: string
    signal?: AbortSignal
  } = {}): Promise<{ items: CalendarInfo[]; hasMore: boolean; pageToken: string; syncToken: string }> {
    const params: Record<string, string> = {}
    if (options.pageSize) params.page_size = String(options.pageSize)
    if (options.pageToken) params.page_token = options.pageToken
    if (options.syncToken) params.sync_token = options.syncToken
    const data = asRecord(await this.request('GET', '/calendar/v4/calendars', { params, signal: options.signal }))
    return {
      items: asArray(data.calendar_list).map(mapCalendar),
      hasMore: asBoolean(data, 'has_more'),
      pageToken: asString(data, 'page_token'),
      syncToken: asString(data, 'sync_token'),
    }
  }

  async listCalendarEvents(calendarId: string, options: {
    startTime?: string
    endTime?: string
    pageSize?: number
    pageToken?: string
    signal?: AbortSignal
  } = {}): Promise<{ items: CalendarEventInfo[]; hasMore: boolean; pageToken: string }> {
    const params: Record<string, string> = {}
    if (options.startTime) params.start_time = options.startTime
    if (options.endTime) params.end_time = options.endTime
    if (options.pageSize) params.page_size = String(options.pageSize)
    if (options.pageToken) params.page_token = options.pageToken
    const data = asRecord(await this.request('GET', `/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events`, { params, signal: options.signal }))
    return {
      items: asArray(data.items).map(mapCalendarEvent),
      hasMore: asBoolean(data, 'has_more'),
      pageToken: asString(data, 'page_token'),
    }
  }

  async getDepartment(departmentId: string, options: { departmentIdType?: string; signal?: AbortSignal } = {}): Promise<DepartmentInfo> {
    const params: Record<string, string> = {}
    if (options.departmentIdType) params.department_id_type = options.departmentIdType
    const data = await this.request('GET', `/contact/v3/departments/${encodeURIComponent(departmentId)}`, { params, signal: options.signal })
    return mapDepartment(asRecord(data).department ?? data)
  }

  async listDepartments(options: {
    parentDepartmentId?: string
    departmentIdType?: string
    fetchChild?: boolean
    pageSize?: number
    pageToken?: string
    signal?: AbortSignal
  } = {}): Promise<{ items: DepartmentInfo[]; hasMore: boolean; pageToken: string }> {
    const params: Record<string, string> = {}
    params.parent_department_id = options.parentDepartmentId ?? '0'
    if (options.departmentIdType) params.department_id_type = options.departmentIdType
    if (options.fetchChild !== undefined) params.fetch_child = String(options.fetchChild)
    if (options.pageSize) params.page_size = String(options.pageSize)
    if (options.pageToken) params.page_token = options.pageToken
    const data = asRecord(await this.request('GET', '/contact/v3/departments', { params, signal: options.signal }))
    const rawItems = asArray(data.items).length ? asArray(data.items) : asArray(data.department_list).length ? asArray(data.department_list) : asArray(data.departments)
    return {
      items: rawItems.map(item => mapDepartment(asRecord(item).department ?? item)),
      hasMore: asBoolean(data, 'has_more'),
      pageToken: asString(data, 'page_token'),
    }
  }

  async listDepartmentChildren(departmentId: string, options: {
    departmentIdType?: string
    fetchChild?: boolean
    pageSize?: number
    pageToken?: string
    signal?: AbortSignal
  } = {}): Promise<{ items: DepartmentInfo[]; hasMore: boolean; pageToken: string }> {
    const params: Record<string, string> = {}
    if (options.departmentIdType) params.department_id_type = options.departmentIdType
    if (options.fetchChild !== undefined) params.fetch_child = String(options.fetchChild)
    if (options.pageSize) params.page_size = String(options.pageSize)
    if (options.pageToken) params.page_token = options.pageToken
    const data = asRecord(await this.request('GET', `/contact/v3/departments/${encodeURIComponent(departmentId)}/children`, { params, signal: options.signal }))
    const rawItems = asArray(data.items).length ? asArray(data.items) : asArray(data.department_list).length ? asArray(data.department_list) : asArray(data.departments)
    return {
      items: rawItems.map(item => mapDepartment(asRecord(item).department ?? item)),
      hasMore: asBoolean(data, 'has_more'),
      pageToken: asString(data, 'page_token'),
    }
  }
  async listApprovalInstances(options: {
    approvalCode?: string
    startTime?: string
    endTime?: string
    pageSize?: number
    pageToken?: string
    signal?: AbortSignal
  } = {}): Promise<{ items: ApprovalInstanceInfo[]; hasMore: boolean; pageToken: string }> {
    const params: Record<string, string> = {}
    if (options.approvalCode) params.approval_code = options.approvalCode
    if (options.startTime) params.start_time = options.startTime
    if (options.endTime) params.end_time = options.endTime
    if (options.pageSize) params.page_size = String(options.pageSize)
    if (options.pageToken) params.page_token = options.pageToken
    const data = asRecord(await this.request('GET', '/approval/v4/instances', { params, signal: options.signal }))
    return {
      items: asArray(data.items).map(mapApprovalInstance),
      hasMore: asBoolean(data, 'has_more'),
      pageToken: asString(data, 'page_token'),
    }
  }

  async getApprovalInstance(instanceId: string, options: {
    userId?: string
    userIdType?: string
    locale?: string
    signal?: AbortSignal
  } = {}): Promise<ApprovalInstanceDetailInfo> {
    const params: Record<string, string> = {}
    if (options.userId) params.user_id = options.userId
    if (options.userIdType || options.userId) params.user_id_type = options.userIdType ?? 'open_id'
    if (options.locale) params.locale = options.locale
    const data = await this.request('GET', `/approval/v4/instances/${encodeURIComponent(instanceId)}`, { params, signal: options.signal })
    return mapApprovalInstanceDetail(asRecord(data).instance ?? asRecord(data).approval_instance ?? data)
  }

  async approveApprovalTask(options: {
    approvalCode: string
    instanceCode: string
    taskId: string
    userId: string
    userIdType?: string
    comment?: string
    signal?: AbortSignal
  }): Promise<{ ok: boolean; approvalCode: string; instanceCode: string; taskId: string; userId: string; userIdType: string; comment: string }> {
    const params: Record<string, string> = { user_id_type: options.userIdType ?? 'open_id' }
    await this.request('POST', '/approval/v4/tasks/approve', {
      params,
      body: {
        approval_code: options.approvalCode,
        instance_code: options.instanceCode,
        task_id: options.taskId,
        user_id: options.userId,
        comment: options.comment ?? '',
      },
      signal: options.signal,
    })
    return {
      ok: true,
      approvalCode: options.approvalCode,
      instanceCode: options.instanceCode,
      taskId: options.taskId,
      userId: options.userId,
      userIdType: options.userIdType ?? 'open_id',
      comment: options.comment ?? '',
    }
  }

  async rejectApprovalTask(options: {
    approvalCode: string
    instanceCode: string
    taskId: string
    userId: string
    userIdType?: string
    comment?: string
    signal?: AbortSignal
  }): Promise<{ ok: boolean; approvalCode: string; instanceCode: string; taskId: string; userId: string; userIdType: string; comment: string }> {
    const params: Record<string, string> = { user_id_type: options.userIdType ?? 'open_id' }
    await this.request('POST', '/approval/v4/tasks/reject', {
      params,
      body: {
        approval_code: options.approvalCode,
        instance_code: options.instanceCode,
        task_id: options.taskId,
        user_id: options.userId,
        comment: options.comment ?? '',
      },
      signal: options.signal,
    })
    return {
      ok: true,
      approvalCode: options.approvalCode,
      instanceCode: options.instanceCode,
      taskId: options.taskId,
      userId: options.userId,
      userIdType: options.userIdType ?? 'open_id',
      comment: options.comment ?? '',
    }
  }
}
