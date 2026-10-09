import { describe, expect, it, vi } from 'vitest'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { FeishuClient } from '../src/client.ts'
import { createTools } from '../src/index.ts'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'

/** Deterministic DNS so tests never depend on real resolution. */
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 as const }]

function feishuOk(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'ok', data }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function exec(): ToolRunContext {
  return { signal: new AbortController().signal } as unknown as ToolRunContext
}

function tools(client = new FeishuClient({ lookupImpl: publicLookup, fetchImpl: globalThis.fetch })) {
  return Object.fromEntries(createTools(client).map(t => [t.name, t]))
}

function expectValidOutput(tool: ReturnType<typeof createTools>[number], value: unknown) {
  expect(validateJsonSchemaValue(tool.output.schema, value, 'value')).toEqual([])
}

describe('tool definitions', () => {
  it('registers the planned Feishu tool set', () => {
    expect(Object.keys(tools()).sort()).toEqual([
      'feishu_approve_approval_task',
      'feishu_auth_test',
      'feishu_get_approval_instance',
      'feishu_get_chat',
      'feishu_get_department',
      'feishu_get_message',
      'feishu_get_user',
      'feishu_list_approval_instances',
      'feishu_list_calendar_events',
      'feishu_list_calendars',
      'feishu_list_chat_members',
      'feishu_list_chats',
      'feishu_list_department_children',
      'feishu_list_departments',
      'feishu_list_messages',
      'feishu_list_users',
      'feishu_reject_approval_task',
      'feishu_send_message',
    ])
  })

  it('auth test takes no model-visible parameters', () => {
    expect(tools().feishu_auth_test.parameters).toEqual({ type: 'object', properties: {} })
  })

  it('returns business values without credentials', async () => {
    const map = tools()
    expect(await map.feishu_auth_test.execute({}, exec())).toMatchObject({ ok: false })
    expect(String((await map.feishu_auth_test.execute({}, exec())).reason)).toContain('not configured')
    expect(await map.feishu_list_chats.execute({}, exec())).toMatchObject({ found: false })
    expect(await map.feishu_get_chat.execute({ chatId: 'oc_1' }, exec())).toMatchObject({ found: false })
    expect(await map.feishu_get_department.execute({ departmentId: 'dep_1' }, exec())).toMatchObject({ found: false })
    expect(await map.feishu_list_chat_members.execute({ chatId: 'oc_1' }, exec())).toMatchObject({ found: false })
    expect(await map.feishu_list_departments.execute({}, exec())).toMatchObject({ found: false })
    expect(await map.feishu_list_department_children.execute({ departmentId: 'dep_1' }, exec())).toMatchObject({ found: false })
    expect(await map.feishu_list_messages.execute({ chatId: 'oc_1' }, exec())).toMatchObject({ found: false })
    expect(await map.feishu_get_message.execute({ messageId: 'msg_1' }, exec())).toMatchObject({ found: false })
    expect(await map.feishu_send_message.execute({ chatId: 'oc_1', msgType: 'text', content: '{}' }, exec())).toMatchObject({ ok: false })
    expect(await map.feishu_get_user.execute({ userId: 'u1' }, exec())).toMatchObject({ found: false })
    expect(await map.feishu_list_users.execute({}, exec())).toMatchObject({ found: false })
    expect(await map.feishu_list_calendars.execute({}, exec())).toMatchObject({ found: false })
    expect(await map.feishu_list_calendar_events.execute({ calendarId: 'cal_1' }, exec())).toMatchObject({ found: false })
    expect(await map.feishu_list_approval_instances.execute({}, exec())).toMatchObject({ found: false })
    expect(await map.feishu_get_approval_instance.execute({ instanceId: 'inst_1' }, exec())).toMatchObject({ found: false })
    expect(await map.feishu_approve_approval_task.execute({ instanceId: 'inst_1', taskId: 'task_1', userId: 'u1' }, exec())).toMatchObject({ ok: false })
    expect(await map.feishu_reject_approval_task.execute({ instanceId: 'inst_1', taskId: 'task_1', userId: 'u1' }, exec())).toMatchObject({ ok: false })
  })

  it('validates and renders successful list output', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      items: [{ chat_id: 'oc_1', name: 'General', chat_type: 'group', user_count: 10, bot_in_chat: true }],
      has_more: false, page_token: '',
    }))
    const map = tools(new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl }))
    const result = await map.feishu_list_chats.execute({}, exec())

    expect(result).toMatchObject({ found: true })
    expectValidOutput(map.feishu_list_chats, result)
    expect(map.feishu_list_chats.output.render({}, result)[0]?.text).toContain('General')
    expect(map.feishu_list_chats.output.render({}, result)[0]?.text).not.toContain('not configured')
  })

  it('executes auth test and list chats', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(feishuOk({ tenant_access_token: 't-abc', expire: 7200 }))
      .mockResolvedValueOnce(feishuOk({
        items: [{ chat_id: 'oc_1', name: 'General', chat_type: 'group', user_count: 10, bot_in_chat: true }],
        has_more: false, page_token: '',
      }))
    const map = tools(new FeishuClient({ lookupImpl: publicLookup, appId: 'cli_test', appSecret: 'secret', fetchImpl }))

    expect(await map.feishu_auth_test.execute({}, exec())).toMatchObject({ ok: true, appId: 'cli_test' })
    const chats = await map.feishu_list_chats.execute({}, exec())
    expect(chats).toMatchObject({ found: true })
    expectValidOutput(map.feishu_list_chats, chats)
    expect(chats.items[0]).toMatchObject({ chatId: 'oc_1', name: 'General' })
    expect(fetchImpl.mock.calls.length).toBe(2)
  })

  it('executes get department and list departments', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(feishuOk({
        department: {
          department_id: 'dep_1', open_department_id: 'od_1', parent_department_id: 'dep_root',
          name: 'Engineering', member_count: 12, leader_user_id: 'u1', status: 'active',
        },
      }))
      .mockResolvedValueOnce(feishuOk({
        department_list: [{ department_id: 'dep_2', name: 'Design', member_count: 5, status: 'active' }],
        has_more: false, page_token: '',
      }))
    const map = tools(new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl }))

    const department = await map.feishu_get_department.execute({ departmentId: 'dep_1', departmentIdType: 'open_department_id' }, exec())
    expect(department).toMatchObject({ found: true, name: 'Engineering', memberCount: 12 })
    expectValidOutput(map.feishu_get_department, department)
    const departments = await map.feishu_list_departments.execute({ parentDepartmentId: 'dep_root', fetchChild: true }, exec())
    expect(departments).toMatchObject({ found: true })
    expectValidOutput(map.feishu_list_departments, departments)
    expect(departments.items[0]).toMatchObject({ departmentId: 'dep_2', name: 'Design' })
    expect(fetchImpl.mock.calls.length).toBe(2)
  })

  it('executes list department children', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      items: [{ department_id: 'dep_child_1', name: 'Platform', member_count: 7, status: 'active' }],
      has_more: false, page_token: '',
    }))
    const map = tools(new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl }))

    const departments = await map.feishu_list_department_children.execute({ departmentId: 'dep_1', departmentIdType: 'open_department_id', fetchChild: true }, exec())
    expect(departments).toMatchObject({ found: true })
    expectValidOutput(map.feishu_list_department_children, departments)
    expect(departments.items[0]).toMatchObject({ departmentId: 'dep_child_1', name: 'Platform' })
    expect(fetchImpl.mock.calls.length).toBe(1)
  })

  it('executes get chat and list members', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(feishuOk({ chat_id: 'oc_1', name: 'General', description: 'Main', chat_type: 'group', user_count: 10 }))
      .mockResolvedValueOnce(feishuOk({
        items: [{ member_id: 'u1', member_id_type: 'user_id', name: 'Alice', tenant_key: 'tk1' }],
        has_more: false, page_token: '',
      }))
    const map = tools(new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl }))

    const chat = await map.feishu_get_chat.execute({ chatId: 'oc_1' }, exec())
    expect(chat).toMatchObject({ found: true, name: 'General', memberCount: 10 })
    expectValidOutput(map.feishu_get_chat, chat)
    const members = await map.feishu_list_chat_members.execute({ chatId: 'oc_1' }, exec())
    expect(members).toMatchObject({ found: true })
    expectValidOutput(map.feishu_list_chat_members, members)
    expect(members.items[0]).toMatchObject({ memberId: 'u1', name: 'Alice' })
    expect(fetchImpl.mock.calls.length).toBe(2)
  })

  it('executes list messages and get message', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(feishuOk({
        items: [{
          message_id: 'msg_1', chat_id: 'oc_1', msg_type: 'text',
          body: { content: '{"text":"hello"}' },
          sender: { id: 'u1', sender_type: 'user' },
          create_time: '1700000000', update_time: '1700000000',
          deleted: false, updated: false, mentions: [],
        }],
        has_more: false, page_token: '',
      }))
      .mockResolvedValueOnce(feishuOk({
        message_id: 'msg_1', chat_id: 'oc_1', msg_type: 'text',
        body: { content: '{"text":"hello"}' },
        sender: { id: 'u1', sender_type: 'user' },
        create_time: '1700000000', update_time: '1700000000',
        deleted: false, updated: false, mentions: [],
      }))
    const map = tools(new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl }))

    const messages = await map.feishu_list_messages.execute({ chatId: 'oc_1' }, exec())
    expect(messages).toMatchObject({ found: true })
    expectValidOutput(map.feishu_list_messages, messages)
    expect(messages.items[0]).toMatchObject({ messageId: 'msg_1', senderId: 'u1' })
    const message = await map.feishu_get_message.execute({ messageId: 'msg_1' }, exec())
    expect(message).toMatchObject({ found: true, messageId: 'msg_1' })
    expectValidOutput(map.feishu_get_message, message)
    expect(fetchImpl.mock.calls.length).toBe(2)
  })

  it('executes send message', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({ message_id: 'msg_new' }))
    const map = tools(new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl }))

    const sent = await map.feishu_send_message.execute({ chatId: 'oc_1', msgType: 'text', content: '{"text":"hi"}' }, exec())
    expect(sent).toMatchObject({ ok: true, messageId: 'msg_new' })
    expectValidOutput(map.feishu_send_message, sent)
    expect(fetchImpl.mock.calls.length).toBe(1)
  })

  it('executes get user and list users', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(feishuOk({
        user: {
          user_id: 'u1', name: 'Alice', email: 'alice@example.com',
          avatar: { avatar_origin: 'https://avatar.example.com/alice' },
          status: { is_activated: true }, department_ids: ['dept_1'],
          job_title: 'Engineer', city: 'Shanghai', tenant_key: 'tk1',
        },
      }))
      .mockResolvedValueOnce(feishuOk({
        items: [{
          user_id: 'u1', name: 'Alice', email: 'alice@example.com',
          avatar: {}, status: { is_activated: true }, department_ids: ['dept_1'],
          job_title: 'Engineer', city: 'Shanghai', tenant_key: 'tk1',
        }],
        has_more: false, page_token: '',
      }))
    const map = tools(new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl }))

    const user = await map.feishu_get_user.execute({ userId: 'u1' }, exec())
    expect(user).toMatchObject({ found: true, name: 'Alice', email: 'alice@example.com' })
    expectValidOutput(map.feishu_get_user, user)
    const users = await map.feishu_list_users.execute({ departmentIdType: 'open_department_id' }, exec())
    expect(users).toMatchObject({ found: true })
    expectValidOutput(map.feishu_list_users, users)
    expect(users.items[0]).toMatchObject({ userId: 'u1', name: 'Alice' })
    expect(fetchImpl.mock.calls.length).toBe(2)
  })

  it('executes calendar and approval tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(feishuOk({
        has_more: true, page_token: 'next', sync_token: 'sync',
        calendar_list: [{ calendar_id: 'cal_1', summary: 'Work', permissions: 'reader', type: 'shared', role: 'reader' }],
      }))
      .mockResolvedValueOnce(feishuOk({
        items: [{
          event_id: 'evt_1', summary: 'Standup',
          start_time: { timestamp: '1700000000' }, end_time: { timestamp: '1700003600' },
          status: 'confirmed', organizer: { user_id: 'u1' }, location: { name: 'Room A' },
        }],
        has_more: false, page_token: '',
      }))
      .mockResolvedValueOnce(feishuOk({
        items: [{
          approval_code: 'ap_1', instance_id: 'inst_1', status: 'PENDING',
          title: 'Leave Request', user_id: 'u1',
          create_time: '1700000000', update_time: '1700000000', form: '[]',
        }],
        has_more: false, page_token: '',
      }))
      .mockResolvedValueOnce(feishuOk({
        approval_code: 'ap_1',
        instance_code: 'inst_1',
        approval_name: 'Leave Request',
        status: 'PENDING',
        form: '[]',
        create_time: '1700000000',
        update_time: '1700000000',
        user_id: 'u1',
        task_list: [{ task_id: 'task_1' }],
        comment_list: [],
        timeline: [{ task_id: 'task_1' }],
      }))
      .mockResolvedValueOnce(feishuOk({}))
      .mockResolvedValueOnce(feishuOk({}))
    const map = tools(new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl }))

    const calendars = await map.feishu_list_calendars.execute({}, exec())
    expect(calendars).toMatchObject({ found: true })
    expectValidOutput(map.feishu_list_calendars, calendars)
    expect(calendars.items[0]).toMatchObject({ calendarId: 'cal_1', summary: 'Work' })
    const events = await map.feishu_list_calendar_events.execute({ calendarId: 'cal_1' }, exec())
    expect(events).toMatchObject({ found: true })
    expectValidOutput(map.feishu_list_calendar_events, events)
    expect(events.items[0]).toMatchObject({ eventId: 'evt_1', summary: 'Standup' })
    const approvals = await map.feishu_list_approval_instances.execute({}, exec())
    expect(approvals).toMatchObject({ found: true })
    expectValidOutput(map.feishu_list_approval_instances, approvals)
    expect(approvals.items[0]).toMatchObject({ instanceId: 'inst_1', status: 'PENDING' })
    const detail = await map.feishu_get_approval_instance.execute({ instanceId: 'inst_1' }, exec())
    expect(detail).toMatchObject({ found: true, instanceId: 'inst_1', approvalCode: 'ap_1', taskIds: ['task_1'] })
    expectValidOutput(map.feishu_get_approval_instance, detail)
    expect(map.feishu_get_approval_instance.output.render({}, detail)[0]?.text).toContain('Leave Request')
    expect(map.feishu_get_approval_instance.output.render({}, detail)[0]?.text).toContain('task_1')
    const approved = await map.feishu_approve_approval_task.execute({ instanceId: 'inst_1', taskId: 'task_1', userId: 'u1', approvalCode: 'ap_1', instanceCode: 'inst_1' }, exec())
    expect(approved).toMatchObject({ ok: true, approvalCode: 'ap_1', instanceCode: 'inst_1', taskId: 'task_1' })
    expectValidOutput(map.feishu_approve_approval_task, approved)
    expect(map.feishu_approve_approval_task.output.render({}, approved)[0]?.text).toContain('approved')
    const rejected = await map.feishu_reject_approval_task.execute({ instanceId: 'inst_1', taskId: 'task_2', userId: 'u1', approvalCode: 'ap_1', instanceCode: 'inst_1' }, exec())
    expect(rejected).toMatchObject({ ok: true, approvalCode: 'ap_1', instanceCode: 'inst_1', taskId: 'task_2' })
    expectValidOutput(map.feishu_reject_approval_task, rejected)
    expect(map.feishu_reject_approval_task.output.render({}, rejected)[0]?.text).toContain('rejected')
    expect(fetchImpl.mock.calls.length).toBe(6)
  })

  it('resolves approval codes from detail when approving and rejecting', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(feishuOk({
        approval_code: 'ap_1',
        instance_code: 'inst_1',
        approval_name: 'Leave Request',
        status: 'PENDING',
        form: '[]',
        create_time: '1700000000',
        update_time: '1700000000',
        user_id: 'u1',
        task_list: [{ task_id: 'task_1' }],
        comment_list: [],
        timeline: [{ task_id: 'task_1' }],
      }))
      .mockResolvedValueOnce(feishuOk({}))
      .mockResolvedValueOnce(feishuOk({
        approval_code: 'ap_1',
        instance_code: 'inst_1',
        approval_name: 'Leave Request',
        status: 'PENDING',
        form: '[]',
        create_time: '1700000000',
        update_time: '1700000000',
        user_id: 'u1',
        task_list: [{ task_id: 'task_2' }],
        comment_list: [],
        timeline: [{ task_id: 'task_2' }],
      }))
      .mockResolvedValueOnce(feishuOk({}))
    const map = tools(new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl }))

    const approved = await map.feishu_approve_approval_task.execute({ instanceId: 'inst_1', taskId: 'task_1', userId: 'u1' }, exec())
    expect(approved).toMatchObject({ ok: true, approvalCode: 'ap_1', instanceCode: 'inst_1', taskId: 'task_1' })
    const rejected = await map.feishu_reject_approval_task.execute({ instanceId: 'inst_1', taskId: 'task_2', userId: 'u1' }, exec())
    expect(rejected).toMatchObject({ ok: true, approvalCode: 'ap_1', instanceCode: 'inst_1', taskId: 'task_2' })
    const approveUrl = fetchImpl.mock.calls[1]?.[0] as string
    const rejectUrl = fetchImpl.mock.calls[3]?.[0] as string
    expect(approveUrl).toContain('user_id_type=open_id')
    expect(rejectUrl).toContain('user_id_type=open_id')
    expect(fetchImpl.mock.calls.length).toBe(4)
  })
})
