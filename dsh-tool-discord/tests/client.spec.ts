import { describe, expect, it, vi } from 'vitest'
import { DiscordClient, DiscordError } from '../src/client.ts'

/** Deterministic DNS so tests never depend on real resolution. */
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 as const }]

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function emptyResponse(status = 204): Response {
  return new Response(null, { status })
}

function requestParts(call: unknown[]): [string, RequestInit] {
  return [String(call[0]), (call[1] ?? {}) as RequestInit]
}

describe('DiscordClient', () => {
  it('authTest sends a Bot token and maps the current user', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      id: 'bot-1',
      username: 'dsh-bot',
      discriminator: '0',
      global_name: 'DSH Bot',
      bot: true,
    }))
    const client = new DiscordClient({ lookupImpl: publicLookup, token: 'secret-token', fetchImpl })

    await expect(client.authTest()).resolves.toEqual({
      ok: true,
      userId: 'bot-1',
      username: 'dsh-bot',
      discriminator: '0',
      globalName: 'DSH Bot',
      bot: true,
    })

    const [url, init] = requestParts(fetchImpl.mock.calls[0])
    expect(url).toContain('/users/@me')
    expect(new Headers(init.headers).get('authorization')).toBe('Bot secret-token')
  })

  it('listGuilds maps counts and clamps the Discord pagination limit', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [{
      id: 'g-1',
      name: 'Acme',
      icon: 'icon-hash',
      owner: true,
      permissions: '8',
      approximate_member_count: 42,
      approximate_presence_count: 7,
    }]))
    const client = new DiscordClient({ lookupImpl: publicLookup, token: 't', fetchImpl })

    const result = await client.listGuilds({ limit: 999, before: 'g-before', withCounts: true })
    expect(result.items).toEqual([{
      id: 'g-1',
      name: 'Acme',
      icon: 'icon-hash',
      owner: true,
      permissions: '8',
      approximateMemberCount: 42,
      approximatePresenceCount: 7,
    }])

    const [url] = requestParts(fetchImpl.mock.calls[0])
    expect(url).toContain('/users/@me/guilds?')
    expect(url).toContain('limit=200')
    expect(url).toContain('before=g-before')
    expect(url).toContain('with_counts=true')
  })

  it('listMembers maps safe profile fields and forwards the after cursor', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [{
      user: { id: 'u-1', username: 'alice', global_name: 'Alice', bot: false },
      nick: 'A',
      joined_at: '2024-01-02T03:04:05.000Z',
      roles: ['role-1'],
    }]))
    const client = new DiscordClient({ lookupImpl: publicLookup, token: 't', fetchImpl })

    const result = await client.listMembers('g-1', { limit: 1000, after: 'u-0' })
    expect(result.items[0]).toEqual({
      id: 'u-1',
      username: 'alice',
      globalName: 'Alice',
      nick: 'A',
      bot: false,
      joinedAt: '2024-01-02T03:04:05.000Z',
      roles: ['role-1'],
    })
    expect(result.nextAfter).toBe('u-1')

    const [url] = requestParts(fetchImpl.mock.calls[0])
    expect(url).toContain('/guilds/g-1/members?')
    expect(url).toContain('limit=1000')
    expect(url).toContain('after=u-0')
  })

  it('maps channels, messages, and search results without leaking raw Discord objects', async () => {
    const channelFetch = vi.fn(async () => jsonResponse(200, [{
      id: 'c-1', guild_id: 'g-1', name: 'general', type: 0, parent_id: null, position: 1, topic: 'Updates', member_count: 3,
    }]))
    const channelClient = new DiscordClient({ lookupImpl: publicLookup, token: 't', fetchImpl: channelFetch })
    await expect(channelClient.listChannels('g-1')).resolves.toEqual([{
      id: 'c-1', guildId: 'g-1', name: 'general', type: 0, parentId: '', position: 1, topic: 'Updates', memberCount: 3,
    }])

    const messageFetch = vi.fn(async () => jsonResponse(200, [{
      id: 'm-1', channel_id: 'c-1', content: 'hello', timestamp: '2024-01-02T03:04:05.000Z', edited_timestamp: null,
      author: { id: 'u-1', username: 'alice', global_name: 'Alice' },
      message_reference: { message_id: 'm-0' }, thread: { id: 'thread-1' },
      attachments: [{ url: 'https://cdn.example/a' }], embeds: [{ title: 'Embed' }],
    }]))
    const messageClient = new DiscordClient({ lookupImpl: publicLookup, token: 't', fetchImpl: messageFetch })
    const messages = await messageClient.listMessages('c-1', { limit: 100, before: 'm-2' })
    expect(messages.items[0]).toMatchObject({
      id: 'm-1', channelId: 'c-1', authorId: 'u-1', authorName: 'Alice', content: 'hello',
      timestamp: '2024-01-02T03:04:05.000Z', editedTimestamp: '', replyTo: 'm-0', threadId: 'thread-1',
      attachments: ['https://cdn.example/a'], embeds: [JSON.stringify({ title: 'Embed' })],
    })
    const [messageUrl] = requestParts(messageFetch.mock.calls[0])
    expect(messageUrl).toContain('/channels/c-1/messages?')
    expect(messageUrl).toContain('limit=100')
    expect(messageUrl).toContain('before=m-2')

    const searchFetch = vi.fn(async () => jsonResponse(200, {
      total_results: 1,
      messages: [[{ id: 'm-2', channel_id: 'c-1', content: 'deploy', timestamp: '2024-01-02T03:04:05.000Z', author: { id: 'u-2', username: 'bob' } }]],
    }))
    const searchClient = new DiscordClient({ lookupImpl: publicLookup, token: 't', fetchImpl: searchFetch })
    const search = await searchClient.searchMessages('g-1', { content: 'deploy', authorId: 'u-2', channelId: 'c-1', limit: 25, offset: 0 })
    expect(search.total).toBe(1)
    expect(search.items[0]).toMatchObject({ id: 'm-2', authorName: 'bob', content: 'deploy' })
    const [searchUrl] = requestParts(searchFetch.mock.calls[0])
    expect(searchUrl).toContain('/guilds/g-1/messages/search?')
    expect(searchUrl).toContain('content=deploy')
    expect(searchUrl).toContain('author_id=u-2')
    expect(searchUrl).toContain('channel_id=c-1')
  })

  it('maps a single channel and message lookup', async () => {
    const channelFetch = vi.fn(async () => jsonResponse(200, { id: 'c-1', guild_id: 'g-1', name: 'general', type: 0, position: 1 }))
    const channelClient = new DiscordClient({ lookupImpl: publicLookup, token: 't', fetchImpl: channelFetch })
    await expect(channelClient.getChannel('c-1')).resolves.toMatchObject({ id: 'c-1', guildId: 'g-1', name: 'general', type: 0 })
    expect(requestParts(channelFetch.mock.calls[0])[0]).toContain('/channels/c-1')

    const messageFetch = vi.fn(async () => jsonResponse(200, { id: 'm-1', channel_id: 'c-1', content: 'hello', timestamp: '2024-01-02T03:04:05.000Z', author: { id: 'u-1', username: 'alice' } }))
    const messageClient = new DiscordClient({ lookupImpl: publicLookup, token: 't', fetchImpl: messageFetch })
    await expect(messageClient.getMessage('c-1', 'm-1')).resolves.toMatchObject({ id: 'm-1', channelId: 'c-1', authorName: 'alice', content: 'hello' })
    expect(requestParts(messageFetch.mock.calls[0])[0]).toContain('/channels/c-1/messages/m-1')
  })

  it('surfaces Discord rate limits with retry information', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, { message: 'You are being rate limited.', global: false }, { 'retry-after': '1.25' }))
    const client = new DiscordClient({ lookupImpl: publicLookup, token: 't', fetchImpl })

    await expect(client.listGuilds()).rejects.toThrow(/429|rate limit/i)
  })

  it('sends, edits, deletes, and reacts to messages with the expected HTTP requests', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'm-1', channel_id: 'c-1', content: 'hello', timestamp: '2024-01-02T03:04:05.000Z', author: { id: 'bot-1', username: 'dsh-bot' } }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'm-1', channel_id: 'c-1', content: 'updated', timestamp: '2024-01-02T03:04:05.000Z', author: { id: 'bot-1', username: 'dsh-bot' } }))
      .mockResolvedValueOnce(emptyResponse())
      .mockResolvedValueOnce(emptyResponse())
      .mockResolvedValueOnce(emptyResponse())
    const client = new DiscordClient({ lookupImpl: publicLookup, token: 't', fetchImpl })

    await expect(client.sendMessage('c-1', { content: 'hello', tts: true })).resolves.toMatchObject({ ok: true, messageId: 'm-1', channelId: 'c-1' })
    await expect(client.editMessage('c-1', 'm-1', 'updated')).resolves.toMatchObject({ ok: true, messageId: 'm-1', channelId: 'c-1' })
    await expect(client.deleteMessage('c-1', 'm-1')).resolves.toMatchObject({ ok: true, messageId: 'm-1', channelId: 'c-1' })
    await expect(client.reactMessage('c-1', 'm-1', '👍', 'add')).resolves.toMatchObject({ ok: true, action: 'add', emoji: '👍' })
    await expect(client.reactMessage('c-1', 'm-1', '👍', 'remove')).resolves.toMatchObject({ ok: true, action: 'remove', emoji: '👍' })

    const [sendUrl, sendInit] = requestParts(fetchImpl.mock.calls[0])
    expect(sendUrl).toContain('/channels/c-1/messages')
    expect(sendInit.method).toBe('POST')
    expect(JSON.parse(String(sendInit.body))).toEqual({ content: 'hello', tts: true })

    const [editUrl, editInit] = requestParts(fetchImpl.mock.calls[1])
    expect(editUrl).toContain('/channels/c-1/messages/m-1')
    expect(editInit.method).toBe('PATCH')
    expect(JSON.parse(String(editInit.body))).toEqual({ content: 'updated' })
    expect(requestParts(fetchImpl.mock.calls[2])[1].method).toBe('DELETE')
    expect(requestParts(fetchImpl.mock.calls[3])[0]).toContain('/reactions/%F0%9F%91%8D/@me')
    expect(requestParts(fetchImpl.mock.calls[3])[1].method).toBe('PUT')
    expect(requestParts(fetchImpl.mock.calls[4])[1].method).toBe('DELETE')
  })

  it('rejects invalid base URLs without exposing their contents', () => {
    for (const baseUrl of [
      'discord.com/api/v10',
      'ftp://discord.com/api/v10',
      'https://user:secret@discord.com/api/v10',
      'https://discord.com/api/v10?token=secret',
      'https://discord.com/api/v10#fragment',
    ]) {
      let error: unknown
      try { new DiscordClient({ token: 'secret', baseUrl }) } catch (thrown) { error = thrown }
      expect(error).toBeInstanceOf(DiscordError)
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
      await expect(new DiscordClient({ token: 't', baseUrl, fetchImpl }).authTest()).rejects.toMatchObject({ name: 'DiscordError' })
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
      await expect(new DiscordClient({ token: 't', baseUrl: 'https://discord.example.test', fetchImpl, lookupImpl }).authTest()).rejects.toMatchObject({ name: 'DiscordError' })
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('keeps a public endpoint that resolves to a public address usable', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { id: 'bot-1', username: 'dsh-bot', bot: true }))
    await expect(new DiscordClient({ token: 't', baseUrl: 'https://discord.example.test/', fetchImpl, lookupImpl: publicLookup }).authTest()).resolves.toMatchObject({ ok: true, userId: 'bot-1' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
