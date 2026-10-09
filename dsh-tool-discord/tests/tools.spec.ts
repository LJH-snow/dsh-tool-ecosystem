import { describe, expect, it, vi } from 'vitest'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { DiscordClient } from '../src/client.ts'
import { createTools } from '../src/index.ts'

/** Deterministic DNS so tests never depend on real resolution. */
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 as const }]

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function exec(): ToolRunContext {
  return { signal: new AbortController().signal } as unknown as ToolRunContext
}

function toolMap(client = new DiscordClient({ fetchImpl: globalThis.fetch })) {
  return Object.fromEntries(createTools(client).map(tool => [tool.name, tool])) as Record<string, any>
}

describe('Discord tool definitions', () => {
  it('registers the complete Discord tool set', () => {
    expect(Object.keys(toolMap()).sort()).toEqual([
      'discord_auth_test',
      'discord_delete_message',
      'discord_edit_message',
      'discord_get_channel',
      'discord_get_message',
      'discord_list_channels',
      'discord_list_guilds',
      'discord_list_members',
      'discord_list_messages',
      'discord_react_message',
      'discord_search_messages',
      'discord_send_message',
    ])
  })

  it('returns stable business values for every tool when no token is configured', async () => {
    const map = toolMap()
    expect(await map.discord_auth_test.execute({}, exec())).toMatchObject({ ok: false, reason: expect.stringContaining('token') })
    expect(await map.discord_list_guilds.execute({}, exec())).toMatchObject({ found: false, reason: expect.stringContaining('token') })
    expect(await map.discord_list_channels.execute({ guildId: 'g-1' }, exec())).toMatchObject({ found: false, reason: expect.stringContaining('token') })
    expect(await map.discord_list_members.execute({ guildId: 'g-1' }, exec())).toMatchObject({ found: false, reason: expect.stringContaining('token') })
    expect(await map.discord_get_channel.execute({ channelId: 'c-1' }, exec())).toMatchObject({ found: false, reason: expect.stringContaining('token') })
    expect(await map.discord_list_messages.execute({ channelId: 'c-1' }, exec())).toMatchObject({ found: false, reason: expect.stringContaining('token') })
    expect(await map.discord_get_message.execute({ channelId: 'c-1', messageId: 'm-1' }, exec())).toMatchObject({ found: false, reason: expect.stringContaining('token') })
    expect(await map.discord_search_messages.execute({ guildId: 'g-1' }, exec())).toMatchObject({ found: false, reason: expect.stringContaining('token') })
    expect(await map.discord_send_message.execute({ channelId: 'c-1', content: 'hello' }, exec())).toMatchObject({ ok: false, reason: expect.stringContaining('token') })
    expect(await map.discord_edit_message.execute({ channelId: 'c-1', messageId: 'm-1', content: 'updated' }, exec())).toMatchObject({ ok: false, reason: expect.stringContaining('token') })
    expect(await map.discord_delete_message.execute({ channelId: 'c-1', messageId: 'm-1' }, exec())).toMatchObject({ ok: false, reason: expect.stringContaining('token') })
    expect(await map.discord_react_message.execute({ channelId: 'c-1', messageId: 'm-1', emoji: '👍' }, exec())).toMatchObject({ ok: false, reason: expect.stringContaining('token') })
  })

  it('forwards bounded guild pagination and returns mapped guilds', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [{ id: 'g-1', name: 'Acme', owner: true, permissions: '8', approximate_member_count: 4, approximate_presence_count: 2 }]))
    const map = toolMap(new DiscordClient({ token: 't', lookupImpl: publicLookup, fetchImpl }))
    const result = await map.discord_list_guilds.execute({ limit: 999, after: 'g-0', withCounts: true }, exec())
    expect(result).toMatchObject({ found: true, items: [{ id: 'g-1', name: 'Acme', approximateMemberCount: 4 }] })
    const url = String(fetchImpl.mock.calls[0][0])
    expect(url).toContain('limit=200')
    expect(url).toContain('after=g-0')
    expect(url).toContain('with_counts=true')
    expect(map.discord_list_guilds.presentCall!({ limit: 999 })).toMatchObject({ card: 'generic', kind: 'search' })
  })

  it('executes channel/message reads and renders replay-safe text', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'c-1', guild_id: 'g-1', name: 'general', type: 0, topic: 'Updates' }))
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 'm-1', channel_id: 'c-1', content: 'hello', timestamp: '2024-01-02T03:04:05.000Z', author: { id: 'u-1', username: 'alice' } }]))
    const map = toolMap(new DiscordClient({ token: 't', lookupImpl: publicLookup, fetchImpl }))
    expect(await map.discord_get_channel.execute({ channelId: 'c-1' }, exec())).toMatchObject({ found: true, name: 'general', topic: 'Updates' })
    expect(await map.discord_list_messages.execute({ channelId: 'c-1', limit: 1 }, exec())).toMatchObject({ found: true, items: [{ id: 'm-1', content: 'hello' }] })

    const channelRendered = map.discord_get_channel.output.render({}, { found: true, id: 'c-1', name: 'general', type: 0, guildId: 'g-1', topic: 'Updates' })
    expect(JSON.stringify(channelRendered)).toContain('#general (c-1)')
    const messageRendered = map.discord_list_messages.output.render({}, { found: true, items: [{ id: 'm-1', authorName: 'alice', content: 'hello', timestamp: '2024-01-02T03:04:05.000Z' }] })
    expect(JSON.stringify(messageRendered)).toContain('hello')
    expect(map.discord_send_message.presentCall!({ channelId: 'c-1', content: 'hello' })).toMatchObject({ card: 'generic', kind: 'edit' })
    expect(map.discord_list_messages.presentCall!({ channelId: 'c-1' })).toMatchObject({ card: 'generic', kind: 'search' })
  })

  it('runs all Discord write tools and preserves edit presentation', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'm-1', channel_id: 'c-1', content: 'hello', timestamp: '2024-01-02T03:04:05.000Z', author: { id: 'bot-1', username: 'dsh-bot' } }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'm-1', channel_id: 'c-1', content: 'updated', timestamp: '2024-01-02T03:04:05.000Z', author: { id: 'bot-1', username: 'dsh-bot' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const map = toolMap(new DiscordClient({ token: 't', lookupImpl: publicLookup, fetchImpl }))

    expect(await map.discord_send_message.execute({ channelId: 'c-1', content: 'hello', tts: true }, exec())).toMatchObject({ ok: true, messageId: 'm-1' })
    expect(await map.discord_edit_message.execute({ channelId: 'c-1', messageId: 'm-1', content: 'updated' }, exec())).toMatchObject({ ok: true, messageId: 'm-1' })
    expect(await map.discord_delete_message.execute({ channelId: 'c-1', messageId: 'm-1' }, exec())).toMatchObject({ ok: true, messageId: 'm-1' })
    expect(await map.discord_react_message.execute({ channelId: 'c-1', messageId: 'm-1', emoji: '👍', action: 'add' }, exec())).toMatchObject({ ok: true, action: 'add' })

    const [, sendInit] = [String(fetchImpl.mock.calls[0][0]), fetchImpl.mock.calls[0][1] as RequestInit]
    expect(sendInit.method).toBe('POST')
    expect(JSON.parse(String(sendInit.body))).toEqual({ content: 'hello', tts: true })
    expect(map.discord_delete_message.presentCall!({ channelId: 'c-1', messageId: 'm-1' })).toMatchObject({ card: 'generic', kind: 'edit' })
  })

  it('maps Discord rate limits as rejected infrastructure errors', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, { message: 'You are being rate limited.', retry_after: 1.25 }))
    const map = toolMap(new DiscordClient({ token: 't', lookupImpl: publicLookup, fetchImpl }))
    await expect(map.discord_list_guilds.execute({}, exec())).rejects.toThrow(/429|rate limit/i)
  })
})
