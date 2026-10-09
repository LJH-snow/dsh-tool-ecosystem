import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallView } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { FeishuClient, FeishuError } from './client.js'

export const name = 'dsh-tool-feishu'
export const inject = ['tools']

export interface FeishuPluginConfig {
  appId?: string
  appSecret?: string
  token?: string
  baseUrl?: string
  timeoutMs?: number
}

export function apply(ctx: Context, config: FeishuPluginConfig = {}) {
  const client = new FeishuClient(config)
  for (const tool of createTools(client)) {
    ctx.tools.register(tool)
  }
}

function unavailable(reason: string) {
  return { found: false, items: [], reason }
}

function text(value: string) {
  return [{ type: 'text' as const, text: value }]
}

function renderChats(items: Array<{ name?: string; chatId?: string; memberCount?: number; chatType?: string }>) {
  if (!items.length) return text('No Feishu chats found.')
  return text(items.map(c => `${c.name ?? ''} (${c.chatId ?? ''}) members=${c.memberCount ?? 0} type=${c.chatType ?? ''}`).join('\n'))
}

function renderChatMembers(items: Array<{ name?: string; memberId?: string }>) {
  if (!items.length) return text('No chat members found.')
  return text(items.map(m => `${m.name ?? ''} (${m.memberId ?? ''})`).join('\n'))
}

function renderMessages(items: Array<{ messageId?: string; senderId?: string; msgType?: string; content?: string; createTime?: string }>) {
  if (!items.length) return text('No messages found.')
  return text(items.map(m => `[${m.createTime ?? ''}] ${m.senderId ?? ''} (${m.msgType ?? ''}): ${(m.content ?? '').slice(0, 200)}`).join('\n'))
}

function renderUsers(items: Array<{ name?: string; userId?: string; email?: string; jobTitle?: string }>) {
  if (!items.length) return text('No Feishu users found.')
  return text(items.map(u => `${u.name ?? ''} (${u.userId ?? ''}) ${u.email ?? ''} ${u.jobTitle ?? ''}`).join('\n'))
}

function renderDepartments(items: Array<{ name?: string; departmentId?: string; openDepartmentId?: string; memberCount?: number }>) {
  if (!items.length) return text('No Feishu departments found.')
  return text(items.map(d => `${d.name ?? ''} (${d.departmentId ?? d.openDepartmentId ?? ''}) members=${d.memberCount ?? 0}`).join('\n'))
}

function renderCalendars(items: Array<{ calendarId?: string; summary?: string; type?: string; role?: string }>) {
  if (!items.length) return text('No Feishu calendars found.')
  return text(items.map(c => `${c.summary ?? ''} (${c.calendarId ?? ''}) type=${c.type ?? ''} role=${c.role ?? ''}`).join('\n'))
}

function renderCalendarEvents(items: Array<{ eventId?: string; summary?: string; startTime?: string; endTime?: string; status?: string }>) {
  if (!items.length) return text('No calendar events found.')
  return text(items.map(e => `${e.summary ?? ''} (${e.eventId ?? ''}) ${e.startTime ?? ''} -> ${e.endTime ?? ''} ${e.status ?? ''}`).join('\n'))
}

function renderApprovalInstances(items: Array<{ instanceId?: string; title?: string; status?: string; userId?: string; createTime?: string }>) {
  if (!items.length) return text('No approval instances found.')
  return text(items.map(a => `${a.title ?? ''} (${a.instanceId ?? ''}) status=${a.status ?? ''} by=${a.userId ?? ''} ${a.createTime ?? ''}`).join('\n'))
}

function renderApprovalDetail(value: {
  title?: string
  approvalName?: string
  instanceId?: string
  instanceCode?: string
  approvalCode?: string
  status?: string
  userId?: string
  createTime?: string
  updateTime?: string
  startTime?: string
  endTime?: string
  taskIds?: string[]
  taskCount?: number
  commentCount?: number
  timelineCount?: number
}) {
  const title = value.title ?? value.approvalName ?? ''
  const id = value.instanceId ?? value.instanceCode ?? ''
  const taskLine = value.taskIds?.length ? `tasks=${value.taskIds.join(', ')}` : `tasks=${value.taskCount ?? 0}`
  return text([
    `${title} (${id})`,
    `approval=${value.approvalCode ?? ''} status=${value.status ?? ''} user=${value.userId ?? ''}`,
    `start=${value.startTime ?? ''} end=${value.endTime ?? ''} create=${value.createTime ?? ''} update=${value.updateTime ?? ''}`,
    `${taskLine} comments=${value.commentCount ?? 0} timeline=${value.timelineCount ?? 0}`,
  ].join('\n'))
}

export function createTools(client: FeishuClient) {
  return [
    defineTool({
      name: 'feishu_auth_test',
      description: 'Verify Feishu app credentials and return tenant access token metadata.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            reason: { type: 'string' },
            appId: { type: 'string' },
            tenantToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.ok) return text(`Feishu auth failed: ${value.reason}`)
          return text(`appId: ${value.appId}\ntenantToken: ${value.tenantToken}`)
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Verify Feishu credentials', kind: 'read' }
      },
      async execute(_args, exec) {
        if (!client.hasCredentials()) return { ok: false, reason: 'Feishu appId/appSecret or token is not configured.' }
        try {
          return await client.authTest(exec.signal)
        } catch (error) {
          if (error instanceof FeishuError) return { ok: false, reason: error.message }
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_list_chats',
      description: 'List Feishu chats visible to the bot, with pagination.',
      parameters: {
        pageSize: { type: 'integer', description: 'Maximum results per page, 1-100 (default 20)' },
        pageToken: { type: 'string', description: 'Opaque cursor from a previous response' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              chatId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' },
              avatar: { type: 'string' }, ownerType: { type: 'string' }, ownerId: { type: 'string' },
              chatMode: { type: 'string' }, chatType: { type: 'string' }, external: { type: 'boolean' },
              tenantKey: { type: 'string' }, memberCount: { type: 'number' }, botInChat: { type: 'boolean' },
            }}},
            hasMore: { type: 'boolean' },
            pageToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'Feishu is not configured.')
          return renderChats(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Feishu chats', kind: 'search' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Feishu appId/appSecret or token is not configured.')
        try {
          const result = await client.listChats({ pageSize: args.pageSize as number, pageToken: args.pageToken as string, signal: exec.signal })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof FeishuError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_get_chat',
      description: 'Get one Feishu chat by chat ID with name, description, and member count.',
      parameters: {
        chatId: { type: 'string', required: true, description: 'Feishu chat ID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            chatId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' },
            avatar: { type: 'string' }, ownerType: { type: 'string' }, ownerId: { type: 'string' },
            chatMode: { type: 'string' }, chatType: { type: 'string' }, external: { type: 'boolean' },
            tenantKey: { type: 'string' }, memberCount: { type: 'number' }, botInChat: { type: 'boolean' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'Feishu is not configured.')
          return text(`${value.name ?? ''} (${value.chatId ?? ''})\nmembers: ${value.memberCount ?? 0}\ntype: ${value.chatType ?? ''}\n${value.description ?? ''}`)
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Feishu chat ${args.chatId ?? ''}`, kind: 'read' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return { found: false, reason: 'Feishu appId/appSecret or token is not configured.' }
        try {
          const chat = await client.getChat(args.chatId as string, exec.signal)
          return { found: true, ...chat }
        } catch (error) {
          if (error instanceof FeishuError) return { found: false, reason: error.message }
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_list_chat_members',
      description: 'List members of one Feishu chat by chat ID.',
      parameters: {
        chatId: { type: 'string', required: true, description: 'Feishu chat ID' },
        pageSize: { type: 'integer', description: 'Maximum results per page, 1-100 (default 20)' },
        pageToken: { type: 'string', description: 'Opaque cursor from a previous response' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              memberId: { type: 'string' }, memberIdType: { type: 'string' }, name: { type: 'string' }, tenantKey: { type: 'string' },
            }}},
            hasMore: { type: 'boolean' },
            pageToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'Feishu is not configured.')
          return renderChatMembers(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Feishu chat members ${args.chatId ?? ''}`, kind: 'search' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Feishu appId/appSecret or token is not configured.')
        try {
          const result = await client.listChatMembers(args.chatId as string, { pageSize: args.pageSize as number, pageToken: args.pageToken as string, signal: exec.signal })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof FeishuError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_list_messages',
      description: 'List messages in one Feishu chat with optional time range and pagination.',
      parameters: {
        chatId: { type: 'string', required: true, description: 'Feishu chat ID' },
        startTime: { type: 'string', description: 'Start time as Unix timestamp in seconds' },
        endTime: { type: 'string', description: 'End time as Unix timestamp in seconds' },
        pageSize: { type: 'integer', description: 'Maximum results per page, 1-50 (default 20)' },
        pageToken: { type: 'string', description: 'Opaque cursor from a previous response' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              messageId: { type: 'string' }, rootId: { type: 'string' }, parentId: { type: 'string' },
              createTime: { type: 'string' }, updateTime: { type: 'string' }, chatId: { type: 'string' },
              msgType: { type: 'string' }, content: { type: 'string' }, senderId: { type: 'string' },
              senderType: { type: 'string' }, deleted: { type: 'boolean' }, updated: { type: 'boolean' },
              mentions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
                key: { type: 'string' }, id: { type: 'string' }, name: { type: 'string' },
              }}},
            }}},
            hasMore: { type: 'boolean' },
            pageToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'Feishu is not configured.')
          return renderMessages(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Feishu messages ${args.chatId ?? ''}`, kind: 'search' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Feishu appId/appSecret or token is not configured.')
        try {
          const result = await client.listMessages(args.chatId as string, {
            startTime: args.startTime as string, endTime: args.endTime as string,
            pageSize: args.pageSize as number, pageToken: args.pageToken as string, signal: exec.signal,
          })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof FeishuError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_get_message',
      description: 'Get one Feishu message by message ID.',
      parameters: {
        messageId: { type: 'string', required: true, description: 'Feishu message ID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            messageId: { type: 'string' }, rootId: { type: 'string' }, parentId: { type: 'string' },
            msgType: { type: 'string' }, content: { type: 'string' }, senderId: { type: 'string' },
            senderType: { type: 'string' }, chatId: { type: 'string' },
            createTime: { type: 'string' }, updateTime: { type: 'string' },
            deleted: { type: 'boolean' }, updated: { type: 'boolean' },
            mentions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              key: { type: 'string' }, id: { type: 'string' }, name: { type: 'string' },
            }}},
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'Feishu is not configured.')
          return text(`[${value.createTime ?? ''}] ${value.senderId ?? ''} (${value.msgType ?? ''}): ${(value.content ?? '').slice(0, 500)}`)
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Feishu message ${args.messageId ?? ''}`, kind: 'read' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return { found: false, reason: 'Feishu appId/appSecret or token is not configured.' }
        try {
          const msg = await client.getMessage(args.messageId as string, exec.signal)
          return { found: true, ...msg }
        } catch (error) {
          if (error instanceof FeishuError) return { found: false, reason: error.message }
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_send_message',
      description: 'Send a message to a Feishu chat. WRITE operation.',
      parameters: {
        chatId: { type: 'string', required: true, description: 'Feishu chat ID' },
        msgType: { type: 'string', required: true, description: 'Message type: text, post, image, interactive, etc.' },
        content: { type: 'string', required: true, description: 'Message content as JSON string' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            reason: { type: 'string' },
            messageId: { type: 'string' },
          },
        },
        render: (_args, value) => value.ok
          ? text(`Message sent: ${value.messageId ?? ''}`)
          : text(`Failed to send: ${value.reason}`),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Send Feishu message', kind: 'edit' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return { ok: false, reason: 'Feishu appId/appSecret or token is not configured.' }
        if (!args.chatId || !args.msgType || !args.content) return { ok: false, reason: 'chatId, msgType, and content are required.' }
        try {
          const result = await client.sendMessage(args.chatId as string, args.msgType as string, args.content as string, exec.signal)
          return { ok: true, messageId: result.messageId }
        } catch (error) {
          if (error instanceof FeishuError) return { ok: false, reason: error.message }
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_get_user',
      description: 'Get one Feishu user by user ID with name, email, department, and status.',
      parameters: {
        userId: { type: 'string', required: true, description: 'Feishu user ID' },
        userIdType: { type: 'string', description: 'ID type: user_id, open_id, union_id (default user_id)' },
        departmentIdType: { type: 'string', description: 'Department ID type: department_id or open_department_id (default department_id)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            userId: { type: 'string' }, openId: { type: 'string' }, unionId: { type: 'string' },
            name: { type: 'string' }, enName: { type: 'string' }, nickname: { type: 'string' },
            email: { type: 'string' }, mobile: { type: 'string' }, avatar: { type: 'string' },
            status: { type: 'string' }, departmentIds: { type: 'array', items: { type: 'string' } },
            jobTitle: { type: 'string' }, city: { type: 'string' }, country: { type: 'string' }, tenantKey: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'Feishu is not configured.')
          return text(`${value.name ?? ''} (${value.userId ?? ''})\nemail: ${value.email ?? ''}\njob: ${value.jobTitle ?? ''}\ncity: ${value.city ?? ''}\nstatus: ${value.status ?? ''}`)
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Feishu user ${args.userId ?? ''}`, kind: 'read' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return { found: false, reason: 'Feishu appId/appSecret or token is not configured.' }
        try {
          const user = await client.getUser(args.userId as string, { userIdType: args.userIdType as string, departmentIdType: args.departmentIdType as string, signal: exec.signal })
          return { found: true, ...user }
        } catch (error) {
          if (error instanceof FeishuError) return { found: false, reason: error.message }
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_list_users',
      description: 'List Feishu users in a department with pagination.',
      parameters: {
        departmentId: { type: 'string', description: 'Department ID to list users from (default root 0)' },
        departmentIdType: { type: 'string', description: 'Department ID type: department_id or open_department_id (default department_id)' },
        pageSize: { type: 'integer', description: 'Maximum results per page, 1-50 (default 20)' },
        pageToken: { type: 'string', description: 'Opaque cursor from a previous response' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              userId: { type: 'string' }, openId: { type: 'string' }, unionId: { type: 'string' },
              name: { type: 'string' }, enName: { type: 'string' }, nickname: { type: 'string' },
              email: { type: 'string' }, mobile: { type: 'string' }, avatar: { type: 'string' },
              status: { type: 'string' }, departmentIds: { type: 'array', items: { type: 'string' } },
              jobTitle: { type: 'string' }, city: { type: 'string' }, country: { type: 'string' }, tenantKey: { type: 'string' },
            }}},
            hasMore: { type: 'boolean' },
            pageToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'Feishu is not configured.')
          return renderUsers(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Feishu users', kind: 'search' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Feishu appId/appSecret or token is not configured.')
        try {
          const result = await client.listUsers({ departmentId: args.departmentId as string, departmentIdType: args.departmentIdType as string, pageSize: args.pageSize as number, pageToken: args.pageToken as string, signal: exec.signal })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof FeishuError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_get_department',
      description: 'Get one Feishu department by department ID with name and member count.',
      parameters: {
        departmentId: { type: 'string', required: true, description: 'Feishu department ID' },
        departmentIdType: { type: 'string', description: 'Department ID type: department_id or open_department_id (default department_id)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            departmentId: { type: 'string' }, openDepartmentId: { type: 'string' }, parentDepartmentId: { type: 'string' },
            name: { type: 'string' }, memberCount: { type: 'number' }, leaderUserId: { type: 'string' }, status: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'Feishu is not configured.')
          return text(`${value.name ?? ''} (${value.departmentId ?? value.openDepartmentId ?? ''}) members: ${value.memberCount ?? 0}`)
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Feishu department ${args.departmentId ?? ''}`, kind: 'read' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return { found: false, reason: 'Feishu appId/appSecret or token is not configured.' }
        try {
          const department = await client.getDepartment(args.departmentId as string, { departmentIdType: args.departmentIdType as string, signal: exec.signal })
          return { found: true, ...department }
        } catch (error) {
          if (error instanceof FeishuError) return { found: false, reason: error.message }
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_list_departments',
      description: 'List child Feishu departments with pagination.',
      parameters: {
        parentDepartmentId: { type: 'string', description: 'Parent department ID (default root 0)' },
        departmentIdType: { type: 'string', description: 'Department ID type: department_id or open_department_id (default department_id)' },
        fetchChild: { type: 'boolean', description: 'Whether to fetch child departments recursively' },
        pageSize: { type: 'integer', description: 'Maximum results per page, 1-50 (default 20)' },
        pageToken: { type: 'string', description: 'Opaque cursor from a previous response' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              departmentId: { type: 'string' }, openDepartmentId: { type: 'string' }, parentDepartmentId: { type: 'string' },
              name: { type: 'string' }, memberCount: { type: 'number' }, leaderUserId: { type: 'string' }, status: { type: 'string' },
            }}},
            hasMore: { type: 'boolean' },
            pageToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'Feishu is not configured.')
          return renderDepartments(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Feishu departments ${args.parentDepartmentId ?? '0'}`, kind: 'search' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Feishu appId/appSecret or token is not configured.')
        try {
          const result = await client.listDepartments({
            parentDepartmentId: args.parentDepartmentId as string,
            departmentIdType: args.departmentIdType as string,
            fetchChild: args.fetchChild as boolean,
            pageSize: args.pageSize as number,
            pageToken: args.pageToken as string,
            signal: exec.signal,
          })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof FeishuError) return unavailable(error.message)
          throw error
        }
      },
    }),
    defineTool({
      name: 'feishu_list_department_children',
      description: 'List child departments under one Feishu department with pagination.',
      parameters: {
        departmentId: { type: 'string', required: true, description: 'Parent Feishu department ID' },
        departmentIdType: { type: 'string', description: 'Department ID type: department_id or open_department_id (default department_id)' },
        fetchChild: { type: 'boolean', description: 'Whether to fetch child departments recursively' },
        pageSize: { type: 'integer', description: 'Maximum results per page, 1-50 (default 20)' },
        pageToken: { type: 'string', description: 'Opaque cursor from a previous response' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              departmentId: { type: 'string' }, openDepartmentId: { type: 'string' }, parentDepartmentId: { type: 'string' },
              name: { type: 'string' }, memberCount: { type: 'number' }, leaderUserId: { type: 'string' }, status: { type: 'string' },
            }}},
            hasMore: { type: 'boolean' },
            pageToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'Feishu is not configured.')
          return renderDepartments(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Feishu child departments ${args.departmentId ?? ''}`, kind: 'search' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Feishu appId/appSecret or token is not configured.')
        try {
          const result = await client.listDepartmentChildren(args.departmentId as string, {
            departmentIdType: args.departmentIdType as string,
            fetchChild: args.fetchChild as boolean,
            pageSize: args.pageSize as number,
            pageToken: args.pageToken as string,
            signal: exec.signal,
          })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof FeishuError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_list_calendars',
      description: 'List Feishu calendars accessible to the bot.',
      parameters: {
        pageSize: { type: 'integer', description: 'Maximum results per page, 1-50 (default 20)' },
        pageToken: { type: 'string', description: 'Opaque cursor from a previous response' },
        syncToken: { type: 'string', description: 'Optional sync token for incremental listing' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              calendarId: { type: 'string' }, summary: { type: 'string' }, description: { type: 'string' },
              permissions: { type: 'string' }, type: { type: 'string' }, role: { type: 'string' },
            }}},
            hasMore: { type: 'boolean' },
            pageToken: { type: 'string' },
            syncToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'Feishu is not configured.')
          return renderCalendars(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Feishu calendars', kind: 'search' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Feishu appId/appSecret or token is not configured.')
        try {
          const result = await client.listCalendars({
            pageSize: args.pageSize as number,
            pageToken: args.pageToken as string,
            syncToken: args.syncToken as string,
            signal: exec.signal,
          })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof FeishuError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_list_calendar_events',
      description: 'List events in one Feishu calendar with optional time range and pagination.',
      parameters: {
        calendarId: { type: 'string', required: true, description: 'Feishu calendar ID' },
        startTime: { type: 'string', description: 'Start time as Unix timestamp in seconds' },
        endTime: { type: 'string', description: 'End time as Unix timestamp in seconds' },
        pageSize: { type: 'integer', description: 'Maximum results per page, 1-50 (default 20)' },
        pageToken: { type: 'string', description: 'Opaque cursor from a previous response' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              eventId: { type: 'string' }, summary: { type: 'string' }, description: { type: 'string' },
              startTime: { type: 'string' }, endTime: { type: 'string' }, status: { type: 'string' },
              organizerId: { type: 'string' }, location: { type: 'string' }, recurrence: { type: 'string' },
            }}},
            hasMore: { type: 'boolean' },
            pageToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'Feishu is not configured.')
          return renderCalendarEvents(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Feishu events ${args.calendarId ?? ''}`, kind: 'search' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Feishu appId/appSecret or token is not configured.')
        try {
          const result = await client.listCalendarEvents(args.calendarId as string, {
            startTime: args.startTime as string, endTime: args.endTime as string,
            pageSize: args.pageSize as number, pageToken: args.pageToken as string, signal: exec.signal,
          })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof FeishuError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_list_approval_instances',
      description: 'List Feishu approval instances with optional filters and pagination.',
      parameters: {
        approvalCode: { type: 'string', description: 'Approval definition code to filter by' },
        startTime: { type: 'string', description: 'Start time as Unix timestamp in seconds' },
        endTime: { type: 'string', description: 'End time as Unix timestamp in seconds' },
        pageSize: { type: 'integer', description: 'Maximum results per page, 1-50 (default 20)' },
        pageToken: { type: 'string', description: 'Opaque cursor from a previous response' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              approvalCode: { type: 'string' }, instanceId: { type: 'string' }, status: { type: 'string' },
              title: { type: 'string' }, form: { type: 'string' }, userId: { type: 'string' }, createTime: { type: 'string' }, updateTime: { type: 'string' },
            }}},
            hasMore: { type: 'boolean' },
            pageToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'Feishu is not configured.')
          return renderApprovalInstances(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Feishu approvals', kind: 'search' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Feishu appId/appSecret or token is not configured.')
        try {
          const result = await client.listApprovalInstances({
            approvalCode: args.approvalCode as string, startTime: args.startTime as string, endTime: args.endTime as string,
            pageSize: args.pageSize as number, pageToken: args.pageToken as string, signal: exec.signal,
          })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof FeishuError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_get_approval_instance',
      description: 'Get one Feishu approval instance by instance ID with detail fields and task IDs.',
      parameters: {
        instanceId: { type: 'string', required: true, description: 'Feishu approval instance ID' },
        userId: { type: 'string', description: 'Optional user ID for viewing the approval in a user-specific context' },
        userIdType: { type: 'string', description: 'User ID type: open_id, user_id, union_id (default open_id)' },
        locale: { type: 'string', description: 'Optional locale for the API response, such as zh-CN or en-US' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            approvalCode: { type: 'string' },
            instanceId: { type: 'string' },
            instanceCode: { type: 'string' },
            title: { type: 'string' },
            approvalName: { type: 'string' },
            status: { type: 'string' },
            form: { type: 'string' },
            createTime: { type: 'string' },
            updateTime: { type: 'string' },
            userId: { type: 'string' },
            serialNumber: { type: 'string' },
            departmentId: { type: 'string' },
            openId: { type: 'string' },
            uuid: { type: 'string' },
            startTime: { type: 'string' },
            endTime: { type: 'string' },
            modifiedInstanceCode: { type: 'string' },
            revertedInstanceCode: { type: 'string' },
            reverted: { type: 'boolean' },
            taskIds: { type: 'array', items: { type: 'string' } },
            taskCount: { type: 'number' },
            commentCount: { type: 'number' },
            timelineCount: { type: 'number' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'Feishu is not configured.')
          return renderApprovalDetail(value)
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Feishu approval ${args.instanceId ?? ''}`, kind: 'read' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Feishu appId/appSecret or token is not configured.')
        try {
          const result = await client.getApprovalInstance(args.instanceId as string, {
            userId: args.userId as string,
            userIdType: args.userIdType as string,
            locale: args.locale as string,
            signal: exec.signal,
          })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof FeishuError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_approve_approval_task',
      description: 'Approve a Feishu approval task by instance ID and task ID. WRITE operation.',
      parameters: {
        instanceId: { type: 'string', required: true, description: 'Feishu approval instance ID' },
        taskId: { type: 'string', required: true, description: 'Feishu approval task ID' },
        userId: { type: 'string', required: true, description: 'Approver user ID' },
        userIdType: { type: 'string', description: 'User ID type: open_id, user_id, union_id (default open_id)' },
        comment: { type: 'string', description: 'Optional approval comment' },
        approvalCode: { type: 'string', description: 'Optional approval definition code if already known' },
        instanceCode: { type: 'string', description: 'Optional approval instance code if already known' },
        locale: { type: 'string', description: 'Optional locale used when fetching approval detail for code resolution' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            reason: { type: 'string' },
            approvalCode: { type: 'string' },
            instanceCode: { type: 'string' },
            instanceId: { type: 'string' },
            taskId: { type: 'string' },
            userId: { type: 'string' },
            userIdType: { type: 'string' },
            comment: { type: 'string' },
          },
        },
        render: (_args, value) => value.ok
          ? text(`Approval task approved: ${value.taskId ?? ''}`)
          : text(`Failed to approve approval task: ${value.reason}`),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Approve Feishu task ${args.taskId ?? ''}`, kind: 'edit' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return { ok: false, reason: 'Feishu appId/appSecret or token is not configured.' }
        if (!args.instanceId || !args.taskId || !args.userId) return { ok: false, reason: 'instanceId, taskId, and userId are required.' }
        try {
          let approvalCode = args.approvalCode as string
          let instanceCode = args.instanceCode as string
          if (!approvalCode || !instanceCode) {
            const detail = await client.getApprovalInstance(args.instanceId as string, {
              userId: args.userId as string,
              userIdType: args.userIdType as string,
              locale: args.locale as string,
              signal: exec.signal,
            })
            approvalCode = approvalCode || detail.approvalCode
            instanceCode = instanceCode || detail.instanceCode || detail.instanceId
          }
          await client.approveApprovalTask({
            approvalCode,
            instanceCode,
            taskId: args.taskId as string,
            userId: args.userId as string,
            userIdType: args.userIdType as string,
            comment: args.comment as string,
            signal: exec.signal,
          })
          return {
            ok: true,
            approvalCode,
            instanceCode,
            instanceId: args.instanceId as string,
            taskId: args.taskId as string,
            userId: args.userId as string,
            userIdType: (args.userIdType as string) || 'open_id',
            comment: (args.comment as string) || '',
          }
        } catch (error) {
          if (error instanceof FeishuError) return { ok: false, reason: error.message }
          throw error
        }
      },
    }),

    defineTool({
      name: 'feishu_reject_approval_task',
      description: 'Reject a Feishu approval task by instance ID and task ID. WRITE operation.',
      parameters: {
        instanceId: { type: 'string', required: true, description: 'Feishu approval instance ID' },
        taskId: { type: 'string', required: true, description: 'Feishu approval task ID' },
        userId: { type: 'string', required: true, description: 'Approver user ID' },
        userIdType: { type: 'string', description: 'User ID type: open_id, user_id, union_id (default open_id)' },
        comment: { type: 'string', description: 'Optional rejection comment' },
        approvalCode: { type: 'string', description: 'Optional approval definition code if already known' },
        instanceCode: { type: 'string', description: 'Optional approval instance code if already known' },
        locale: { type: 'string', description: 'Optional locale used when fetching approval detail for code resolution' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            reason: { type: 'string' },
            approvalCode: { type: 'string' },
            instanceCode: { type: 'string' },
            instanceId: { type: 'string' },
            taskId: { type: 'string' },
            userId: { type: 'string' },
            userIdType: { type: 'string' },
            comment: { type: 'string' },
          },
        },
        render: (_args, value) => value.ok
          ? text(`Approval task rejected: ${value.taskId ?? ''}`)
          : text(`Failed to reject approval task: ${value.reason}`),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Reject Feishu task ${args.taskId ?? ''}`, kind: 'edit' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return { ok: false, reason: 'Feishu appId/appSecret or token is not configured.' }
        if (!args.instanceId || !args.taskId || !args.userId) return { ok: false, reason: 'instanceId, taskId, and userId are required.' }
        try {
          let approvalCode = args.approvalCode as string
          let instanceCode = args.instanceCode as string
          if (!approvalCode || !instanceCode) {
            const detail = await client.getApprovalInstance(args.instanceId as string, {
              userId: args.userId as string,
              userIdType: args.userIdType as string,
              locale: args.locale as string,
              signal: exec.signal,
            })
            approvalCode = approvalCode || detail.approvalCode
            instanceCode = instanceCode || detail.instanceCode || detail.instanceId
          }
          await client.rejectApprovalTask({
            approvalCode,
            instanceCode,
            taskId: args.taskId as string,
            userId: args.userId as string,
            userIdType: args.userIdType as string,
            comment: args.comment as string,
            signal: exec.signal,
          })
          return {
            ok: true,
            approvalCode,
            instanceCode,
            instanceId: args.instanceId as string,
            taskId: args.taskId as string,
            userId: args.userId as string,
            userIdType: (args.userIdType as string) || 'open_id',
            comment: (args.comment as string) || '',
          }
        } catch (error) {
          if (error instanceof FeishuError) return { ok: false, reason: error.message }
          throw error
        }
      },
    }),
  ]
}
