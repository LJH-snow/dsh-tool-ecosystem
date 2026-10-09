import { describe, expect, it, vi } from 'vitest'
import { FeishuClient, FeishuError } from '../src/client.ts'

/** Deterministic DNS so tests never depend on real resolution. */
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 as const }]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function feishuOk(data: unknown): Response {
  return jsonResponse({ code: 0, msg: 'ok', data })
}

function requestInit(fetchImpl: ReturnType<typeof vi.fn>, callIndex = 0): RequestInit {
  return (fetchImpl.mock.calls[callIndex] as [string, RequestInit])[1]
}

describe('FeishuClient', () => {
  it('obtains tenant access token with appId and appSecret', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      tenant_access_token: 't-abc123',
      expire: 7200,
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, appId: 'cli_test', appSecret: 'secret_test', fetchImpl })
    const auth = await client.authTest()

    expect(auth).toMatchObject({ ok: true, appId: 'cli_test' })
    expect(auth.tenantToken).toContain('t-abc1')
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal')
    expect(init.method).toBe('POST')
  })

  it('handles tenant token responses without data wrapper', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      code: 0,
      msg: 'ok',
      tenant_access_token: 't-raw123',
      expire: 7200,
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, appId: 'cli_test', appSecret: 'secret_test', fetchImpl })
    const auth = await client.authTest()

    expect(auth).toMatchObject({ ok: true, appId: 'cli_test' })
    expect(auth.tenantToken).toContain('t-raw1')
  })

  it('uses static token when provided and skips token endpoint', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      items: [{ chat_id: 'oc_1', name: 'General', user_count: 10 }],
      has_more: false,
      page_token: '',
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 'static-token', fetchImpl })
    const result = await client.listChats()

    expect(result.items[0]).toMatchObject({ chatId: 'oc_1', name: 'General', memberCount: 10 })
    expect(fetchImpl.mock.calls.length).toBe(1)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/im/v1/chats')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer static-token')
  })

  it('lists chats with pagination', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      items: [
        { chat_id: 'oc_1', name: 'General', chat_type: 'group', user_count: 10, bot_in_chat: true },
        { chat_id: 'oc_2', name: 'Dev', chat_type: 'p2p', user_count: 2, bot_in_chat: false },
      ],
      has_more: true,
      page_token: 'page2',
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const result = await client.listChats({ pageSize: 10, pageToken: 'page1' })

    expect(result.hasMore).toBe(true)
    expect(result.pageToken).toBe('page2')
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({ chatId: 'oc_1', name: 'General', chatType: 'group', memberCount: 10 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('page_size=10')
    expect(url).toContain('page_token=page1')
  })

  it('gets chat info by ID', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      chat_id: 'oc_1', name: 'General', description: 'Main chat', chat_type: 'group', user_count: 10,
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const chat = await client.getChat('oc_1')

    expect(chat).toMatchObject({ chatId: 'oc_1', name: 'General', description: 'Main chat', memberCount: 10 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/im/v1/chats/oc_1')
  })

  it('lists chat members', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      items: [
        { member_id: 'u1', member_id_type: 'user_id', name: 'Alice', tenant_key: 'tk1' },
        { member_id: 'u2', member_id_type: 'user_id', name: 'Bob', tenant_key: 'tk1' },
      ],
      has_more: false,
      page_token: '',
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const result = await client.listChatMembers('oc_1')

    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({ memberId: 'u1', name: 'Alice' })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/im/v1/chats/oc_1/members')
  })

  it('lists messages with time range', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      items: [{
        message_id: 'msg_1', chat_id: 'oc_1', msg_type: 'text',
        body: { content: '{"text":"hello"}' },
        sender: { id: 'u1', sender_type: 'user' },
        create_time: '1700000000', update_time: '1700000000',
        deleted: false, updated: false, mentions: [],
      }],
      has_more: false,
      page_token: '',
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const result = await client.listMessages('oc_1', { startTime: '1700000000', endTime: '1700003600' })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ messageId: 'msg_1', msgType: 'text', senderId: 'u1' })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('container_id=oc_1')
    expect(url).toContain('start_time=1700000000')
  })

  it('gets one message by ID', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      message_id: 'msg_1', chat_id: 'oc_1', msg_type: 'text',
      body: { content: '{"text":"hello"}' },
      sender: { id: 'u1', sender_type: 'user' },
      create_time: '1700000000', update_time: '1700000000',
      deleted: false, updated: false, mentions: [],
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const msg = await client.getMessage('msg_1')

    expect(msg).toMatchObject({ messageId: 'msg_1', msgType: 'text', senderId: 'u1' })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/im/v1/messages/msg_1')
  })

  it('gets message from items response', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      items: [{
        message_id: 'msg_items', chat_id: 'oc_1', msg_type: 'text',
        body: { content: '{"text":"from items"}' },
        sender: { id: 'u1', sender_type: 'user' },
        create_time: '1700000000', update_time: '1700000000',
        deleted: false, updated: false, mentions: [],
      }],
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const message = await client.getMessage('msg_items')

    expect(message).toMatchObject({ messageId: 'msg_items', content: '{"text":"from items"}', senderId: 'u1' })
  })

  it('sends a message', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      message_id: 'msg_new',
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const result = await client.sendMessage('oc_1', 'text', '{"text":"hi"}')

    expect(result).toMatchObject({ messageId: 'msg_new' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/im/v1/messages')
    expect(url).toContain('receive_id_type=chat_id')
    expect(init.method).toBe('POST')
  })

  it('gets user info', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      user: {
        user_id: 'u1', open_id: 'ou_1', name: 'Alice', en_name: 'Alice',
        email: 'alice@example.com', mobile: '+8613800000000',
        avatar: { avatar_origin: 'https://avatar.example.com/alice' },
        status: { is_activated: true },
        department_ids: ['dept_1'],
        job_title: 'Engineer', city: 'Shanghai', country: 'CN', tenant_key: 'tk1',
      },
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const user = await client.getUser('u1', { userIdType: 'open_id', departmentIdType: 'open_department_id' })

    expect(user).toMatchObject({ userId: 'u1', name: 'Alice', email: 'alice@example.com', jobTitle: 'Engineer', status: 'active' })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/contact/v3/users/u1')
    expect(url).toContain('user_id_type=open_id')
    expect(url).toContain('department_id_type=open_department_id')
  })

  it('maps inactive users correctly', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      user: {
        user_id: 'u2', name: 'Bob', email: 'bob@example.com',
        status: { is_activated: false }, department_ids: ['dept_1'],
      },
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const user = await client.getUser('u2')

    expect(user).toMatchObject({ userId: 'u2', name: 'Bob', status: 'inactive' })
  })

  it('defaults to root department when omitted', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      items: [],
      has_more: false,
      page_token: '',
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    await client.listUsers()

    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('department_id=0')
  })

  it('lists users with department filter', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      items: [{
        user_id: 'u1', name: 'Alice', email: 'alice@example.com',
        avatar: {}, status: { is_activated: true }, department_ids: ['dept_1'],
        job_title: 'Engineer', city: 'Shanghai', tenant_key: 'tk1',
      }],
      has_more: false,
      page_token: '',
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const result = await client.listUsers({ departmentId: 'dept_1', departmentIdType: 'open_department_id', pageSize: 10 })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ userId: 'u1', name: 'Alice' })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('department_id=dept_1')
    expect(url).toContain('department_id_type=open_department_id')
  })

  it('gets department info by ID', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      department: {
        department_id: 'dep_1', open_department_id: 'od_1', parent_department_id: 'dep_root',
        name: 'Engineering', member_count: 12, leader_user_id: 'u1', status: 'active',
      },
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const dept = await client.getDepartment('dep_1', { departmentIdType: 'open_department_id' })

    expect(dept).toMatchObject({ departmentId: 'dep_1', openDepartmentId: 'od_1', name: 'Engineering', memberCount: 12 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/contact/v3/departments/dep_1')
    expect(url).toContain('department_id_type=open_department_id')
  })

  it('lists departments with pagination', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      department_list: [
        { department_id: 'dep_1', name: 'Engineering', member_count: 12, status: 'active' },
        { department_id: 'dep_2', name: 'Design', member_count: 5, status: 'active' },
      ],
      has_more: true,
      page_token: 'dep_page2',
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const result = await client.listDepartments({ parentDepartmentId: 'dep_root', departmentIdType: 'open_department_id', fetchChild: true, pageSize: 10, pageToken: 'dep_page1' })

    expect(result.hasMore).toBe(true)
    expect(result.pageToken).toBe('dep_page2')
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({ departmentId: 'dep_1', name: 'Engineering', memberCount: 12 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/contact/v3/departments?')
    expect(url).toContain('parent_department_id=dep_root')
    expect(url).toContain('department_id_type=open_department_id')
    expect(url).toContain('fetch_child=true')
    expect(url).toContain('page_size=10')
    expect(url).toContain('page_token=dep_page1')
  })

  it('lists department children', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      items: [
        { department_id: 'dep_child_1', name: 'Platform', member_count: 7, status: 'active' },
      ],
      has_more: false,
      page_token: '',
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const result = await client.listDepartmentChildren('dep_1', { departmentIdType: 'open_department_id', fetchChild: true, pageSize: 10 })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ departmentId: 'dep_child_1', name: 'Platform', memberCount: 7 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/contact/v3/departments/dep_1/children')
    expect(url).toContain('department_id_type=open_department_id')
    expect(url).toContain('fetch_child=true')
    expect(url).toContain('page_size=10')
  })

  it('lists calendars with pagination', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      has_more: true,
      page_token: 'next-token',
      sync_token: 'sync-token',
      calendar_list: [
        { calendar_id: 'cal_1', summary: 'Work', permissions: 'reader', type: 'shared', role: 'reader' },
        { calendar_id: 'cal_2', summary: 'Personal', permissions: 'owner', type: 'personal', role: 'owner' },
      ],
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const result = await client.listCalendars({ pageSize: 10, pageToken: 'page1', syncToken: 'sync1' })

    expect(result.hasMore).toBe(true)
    expect(result.pageToken).toBe('next-token')
    expect(result.syncToken).toBe('sync-token')
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({ calendarId: 'cal_1', summary: 'Work', type: 'shared' })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('page_size=10')
    expect(url).toContain('page_token=page1')
    expect(url).toContain('sync_token=sync1')
  })

  it('lists calendar events', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      items: [{
        event_id: 'evt_1', summary: 'Standup',
        start_time: { timestamp: '1700000000' },
        end_time: { timestamp: '1700003600' },
        status: 'confirmed',
        organizer: { user_id: 'u1' },
        location: { name: 'Room A' },
      }],
      has_more: false,
      page_token: '',
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const result = await client.listCalendarEvents('cal_1', { startTime: '1700000000', endTime: '1700003600' })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ eventId: 'evt_1', summary: 'Standup', startTime: '1700000000', location: 'Room A' })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/calendar/v4/calendars/cal_1/events')
  })

  it('lists approval instances', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      items: [{
        approval_code: 'ap_1', instance_id: 'inst_1', status: 'PENDING',
        title: 'Leave Request', user_id: 'u1',
        create_time: '1700000000', update_time: '1700000000',
        form: '[]',
      }],
      has_more: false,
      page_token: '',
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const result = await client.listApprovalInstances({ approvalCode: 'ap_1' })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ instanceId: 'inst_1', status: 'PENDING', title: 'Leave Request', form: '[]' })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('approval_code=ap_1')
  })

  it('gets approval instance detail and resolves task ids', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      approval_code: 'ap_1',
      instance_code: 'inst_1',
      approval_name: 'Leave Request',
      serial_number: 'SN-1001',
      department_id: 'dept_1',
      open_id: 'ou_1',
      uuid: 'uuid_1',
      status: 'PENDING',
      form: [{ id: 'field_1', value: 'hello' }],
      start_time: '1700000000',
      end_time: '1700003600',
      create_time: '1700000000',
      update_time: '1700003600',
      user_id: 'u1',
      task_list: [{ task_id: 'task_1' }, { task_id: 'task_2' }],
      comment_list: [{ comment: 'ok' }],
      timeline: [{ task_id: 'task_1', action: 'approve' }, { task_id: 'task_2', action: 'approve' }],
      modified_instance_code: 'inst_1',
      reverted_instance_code: '',
      reverted: false,
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    const detail = await client.getApprovalInstance('inst_1', { userId: 'u1', userIdType: 'open_id', locale: 'zh-CN' })

    expect(detail).toMatchObject({
      approvalCode: 'ap_1',
      instanceId: 'inst_1',
      instanceCode: 'inst_1',
      approvalName: 'Leave Request',
      serialNumber: 'SN-1001',
      taskIds: ['task_1', 'task_2'],
      taskCount: 2,
      commentCount: 1,
      timelineCount: 2,
    })
    expect(detail.form).toContain('field_1')
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/approval/v4/instances/inst_1')
    expect(url).toContain('user_id=u1')
    expect(url).toContain('user_id_type=open_id')
    expect(url).toContain('locale=zh-CN')
  })

  it('defaults approval instance detail user id type to open_id', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({
      approval_code: 'ap_1',
      instance_code: 'inst_1',
      approval_name: 'Leave Request',
      status: 'PENDING',
      form: '[]',
      create_time: '1700000000',
      update_time: '1700000000',
      user_id: 'u1',
      task_list: [],
      comment_list: [],
      timeline: [],
    }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })
    await client.getApprovalInstance('inst_1', { userId: 'u1' })

    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('user_id=u1')
    expect(url).toContain('user_id_type=open_id')
  })

  it('approves and rejects approval tasks', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(feishuOk({}))
      .mockResolvedValueOnce(feishuOk({}))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })

    const approved = await client.approveApprovalTask({
      approvalCode: 'ap_1',
      instanceCode: 'inst_1',
      taskId: 'task_1',
      userId: 'u1',
      comment: 'approved',
    })
    const rejected = await client.rejectApprovalTask({
      approvalCode: 'ap_1',
      instanceCode: 'inst_1',
      taskId: 'task_2',
      userId: 'u1',
      comment: 'rejected',
    })

    expect(approved).toMatchObject({ ok: true, approvalCode: 'ap_1', instanceCode: 'inst_1', taskId: 'task_1', userId: 'u1' })
    expect(rejected).toMatchObject({ ok: true, approvalCode: 'ap_1', instanceCode: 'inst_1', taskId: 'task_2', userId: 'u1' })
    const [approveUrl, approveInit] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(approveUrl).toContain('/approval/v4/tasks/approve')
    expect(approveUrl).toContain('user_id_type=open_id')
    expect(JSON.parse(String(approveInit.body))).toMatchObject({
      approval_code: 'ap_1',
      instance_code: 'inst_1',
      task_id: 'task_1',
      user_id: 'u1',
      comment: 'approved',
    })
    const [rejectUrl, rejectInit] = fetchImpl.mock.calls[1] as [string, RequestInit]
    expect(rejectUrl).toContain('/approval/v4/tasks/reject')
    expect(rejectUrl).toContain('user_id_type=open_id')
    expect(JSON.parse(String(rejectInit.body))).toMatchObject({
      approval_code: 'ap_1',
      instance_code: 'inst_1',
      task_id: 'task_2',
      user_id: 'u1',
      comment: 'rejected',
    })
  })

  it('throws FeishuError on API error', async () => {
    const fetchImpl = vi.fn(async () => feishuOk(null))
    // Override to return error code
    fetchImpl.mockResolvedValueOnce(jsonResponse({ code: 99991, msg: 'token invalid', data: null }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 'bad', fetchImpl })

    await expect(client.listChats()).rejects.toThrow('token invalid')
  })

  it('throws FeishuError on HTTP error', async () => {
    const fetchImpl = vi.fn(async () => new Response('Internal Server Error', { status: 500 }))
    const client = new FeishuClient({ lookupImpl: publicLookup, token: 't', fetchImpl })

    await expect(client.listChats()).rejects.toThrow('HTTP 500')
  })

  it('rejects invalid base URLs without exposing their contents', () => {
    for (const baseUrl of [
      'open.feishu.cn/open-apis',
      'ftp://open.feishu.cn/open-apis',
      'https://user:secret@open.feishu.cn/open-apis',
      'https://open.feishu.cn/open-apis?token=secret',
      'https://open.feishu.cn/open-apis#fragment',
    ]) {
      let error: unknown
      try { new FeishuClient({ token: 'secret', baseUrl }) } catch (thrown) { error = thrown }
      expect(error).toBeInstanceOf(FeishuError)
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
      await expect(new FeishuClient({ token: 't', baseUrl, fetchImpl }).listChats()).rejects.toMatchObject({ name: 'FeishuError' })
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
      await expect(new FeishuClient({ token: 't', baseUrl: 'https://feishu.example.test', fetchImpl, lookupImpl }).listChats()).rejects.toMatchObject({ name: 'FeishuError' })
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('keeps a public endpoint that resolves to a public address usable', async () => {
    const fetchImpl = vi.fn(async () => feishuOk({ items: [] }))
    await expect(new FeishuClient({ token: 't', baseUrl: 'https://feishu.example.test/', fetchImpl, lookupImpl: publicLookup }).listChats()).resolves.toBeDefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
