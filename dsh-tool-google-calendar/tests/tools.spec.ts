import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { GoogleCalendarClient } from '../src/client.ts'
import { createTools } from '../src/index.ts'

/** Deterministic DNS so tests never depend on real resolution. */
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 as const }]

const testToken = process.env.GCAL_TEST_TOKEN ?? `gcal-test-${randomUUID()}`

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function runContext(): ToolRunContext {
  return { signal: new AbortController().signal } as unknown as ToolRunContext
}

function toolMap(client = new GoogleCalendarClient({ lookupImpl: publicLookup, fetchImpl: globalThis.fetch })) {
  return Object.fromEntries(createTools(client).map(tool => [tool.name, tool])) as Record<string, any>
}

describe('Google Calendar tool definitions', () => {
  it('registers the complete read-only Google Calendar tool set', () => {
    expect(Object.keys(toolMap()).sort()).toEqual([
      'gcal_auth_test',
      'gcal_get_event',
      'gcal_list_calendars',
      'gcal_list_events',
      'gcal_search_events',
    ])
  })

  it('returns stable business values for every tool when no credentials are configured', async () => {
    const map = toolMap(new GoogleCalendarClient({ lookupImpl: publicLookup, fetchImpl: globalThis.fetch }))
    expect(await map.gcal_auth_test.execute({}, runContext())).toMatchObject({ ok: false, reason: expect.stringContaining('credentials') })
    expect(await map.gcal_list_calendars.execute({}, runContext())).toMatchObject({ found: false, reason: expect.stringContaining('credentials') })
    expect(await map.gcal_list_events.execute({}, runContext())).toMatchObject({ found: false, reason: expect.stringContaining('credentials') })
    expect(await map.gcal_search_events.execute({ query: 'x' }, runContext())).toMatchObject({ found: false, reason: expect.stringContaining('credentials') })
    expect(await map.gcal_get_event.execute({ eventId: 'e-1' }, runContext())).toMatchObject({ found: false, reason: expect.stringContaining('credentials') })
  })

  it('keeps every call a read or search; the package exposes no edits', () => {
    const requiredArgs: Record<string, Record<string, string>> = {
      gcal_search_events: { query: 'standup' },
      gcal_get_event: { eventId: 'evt_1' },
    }
    for (const tool of createTools(new GoogleCalendarClient({ lookupImpl: publicLookup, accessToken: testToken }))) {
      const view = tool.presentCall?.(requiredArgs[tool.name] ?? {}) as { kind?: string } | undefined
      expect(['read', 'search']).toContain(view?.kind)
    }
  })

  it('renders calendar, event list, and single event output', async () => {
    const map = toolMap(new GoogleCalendarClient({ lookupImpl: publicLookup, accessToken: testToken }))

    const calendars = map.gcal_list_calendars
    expect((calendars.output.render({}, { found: true, items: [{ id: 'user@gmail.test', summary: 'user@gmail.test', accessRole: 'owner', primary: true, timeZone: 'UTC' }] }) as Array<{ text: string }>)[0].text)
      .toContain('[primary] user@gmail.test (user@gmail.test) role=owner tz=UTC')

    const events = map.gcal_list_events
    const eventView = (events.output.render({}, {
      found: true,
      items: [{ id: 'evt_1', summary: 'Standup', start: { dateTime: '2026-10-06T09:00:00+08:00', timeZone: 'Asia/Shanghai' }, end: { dateTime: '2026-10-06T09:15:00+08:00', timeZone: 'Asia/Shanghai' }, location: 'Room 4' }],
      nextPageToken: 'tok-1',
    }) as Array<{ text: string }>)[0].text
    expect(eventView).toContain('Standup (evt_1)')
    expect(eventView).toContain('@ Room 4')
    expect(eventView).toContain('nextPageToken=tok-1')

    const single = map.gcal_get_event
    const singleView = (single.output.render({}, {
      found: true, id: 'evt_1', summary: 'Standup', status: 'confirmed',
      start: { dateTime: '2026-10-06T09:00:00Z' }, end: { dateTime: '2026-10-06T09:15:00Z' },
      organizerEmail: 'alice@gmail.test', attendeeCount: 3, htmlLink: 'https://calendar.google.com/e/1',
    }) as Array<{ text: string }>)[0].text
    expect(singleView).toContain('Standup (evt_1) status=confirmed')
    expect(singleView).toContain('organizer=alice@gmail.test')
    expect(singleView).toContain('attendees=3')
  })

  it('executes list and search through the tool layer without exposing the token', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'cal-1', summary: 'Work', accessRole: 'owner' }], nextPageToken: '' }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'evt_1', status: 'confirmed', summary: 'Sync', start: { dateTime: '2026-10-06T09:00:00Z' }, end: { dateTime: '2026-10-06T10:00:00Z' } }], nextPageToken: 'next' }))
    const map = toolMap(new GoogleCalendarClient({ lookupImpl: publicLookup, accessToken: testToken, fetchImpl }))

    const calendars = await map.gcal_list_calendars.execute({}, runContext())
    expect(calendars).toMatchObject({ found: true, items: [{ id: 'cal-1' }] })

    const search = await map.gcal_search_events.execute({ query: 'sync' }, runContext())
    expect(search).toMatchObject({ found: true, items: [{ id: 'evt_1', summary: 'Sync' }], nextPageToken: 'next' })
    expect(JSON.stringify([calendars, search])).not.toContain(testToken)

    const [firstUrl] = fetchImpl.mock.calls[0] as unknown as [URL]
    expect(new URL(String(firstUrl)).searchParams.get('maxResults')).toBe('50')
    const [secondUrl] = fetchImpl.mock.calls[1] as unknown as [URL]
    expect(new URL(String(secondUrl)).searchParams.get('q')).toBe('sync')
  })

  it('maps client errors into found:false results at the tool layer', async () => {
    const failing = vi.fn(async () => jsonResponse({ error: { code: 404, message: 'Not Found' } }, 404))
    const map = toolMap(new GoogleCalendarClient({ lookupImpl: publicLookup, accessToken: testToken, fetchImpl: failing }))
    await expect(map.gcal_list_events.execute({}, runContext())).resolves.toMatchObject({ found: false, reason: expect.stringContaining('HTTP 404') })
  })
})
