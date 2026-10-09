import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { GoogleCalendarClient, GoogleCalendarError } from '../src/client.ts'

/** Deterministic DNS so tests never depend on real resolution. */
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 as const }]

const testToken = process.env.GCAL_TEST_TOKEN ?? `gcal-test-${randomUUID()}`
const refreshedToken = process.env.GCAL_TEST_REFRESHED ?? `gcal-refreshed-${randomUUID()}`

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('GoogleCalendarClient', () => {
  const valid = { accessToken: testToken }

  it('rejects invalid base and token URLs without exposing their contents', () => {
    for (const override of [
      { baseUrl: 'www.googleapis.com/calendar/v3' },
      { baseUrl: 'ftp://www.googleapis.com/calendar/v3' },
      { baseUrl: 'https://user:secret@www.googleapis.com/calendar/v3' },
      { baseUrl: 'https://www.googleapis.com/calendar/v3?token=secret' },
      { tokenUrl: 'https://oauth2.googleapis.com/token?token=secret' },
    ]) {
      let error: unknown
      try { new GoogleCalendarClient({ ...valid, ...override }) } catch (thrown) { error = thrown }
      expect(error).toBeInstanceOf(GoogleCalendarError)
      expect(String(error)).not.toContain('secret')
    }
  })

  it('rejects literal local, private, and reserved API addresses before fetch', async () => {
    for (const baseUrl of [
      'http://localhost',
      'http://127.0.0.1',
      'http://169.254.169.254',
      'http://0.0.0.0',
      'http://10.0.0.1',
      'http://192.168.1.1',
      'http://192.0.2.1',
      'http://198.18.0.1',
      'http://224.0.0.1',
      'http://192.175.48.1',
      'http://[::1]',
      'http://[::]',
      'http://[fc00::1]',
      'http://[fe80::1]',
      'http://[2001:db8::1]',
      'http://[ff02::1]',
    ]) {
      const fetchImpl = vi.fn()
      const client = new GoogleCalendarClient({ ...valid, baseUrl, lookupImpl: publicLookup, fetchImpl })
      await expect(client.listEvents()).rejects.toThrow('rejected by host safety policy')
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('authenticates against the primary calendar and never exposes the token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'user@gmail.test', summary: 'user@gmail.test', timeZone: 'Asia/Shanghai' }))
    const client = new GoogleCalendarClient({ lookupImpl: publicLookup, accessToken: testToken, fetchImpl })

    const auth = await client.authTest()

    expect(auth).toMatchObject({ ok: true, authMethod: 'access_token', calendarId: 'user@gmail.test', summary: 'user@gmail.test', timeZone: 'Asia/Shanghai' })
    expect(auth).not.toHaveProperty('tokenPreview')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(new URL(String(url)).origin + new URL(String(url)).pathname).toBe('https://www.googleapis.com/calendar/v3/calendars/primary')
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${testToken}`)
    expect(JSON.stringify(auth)).not.toContain(testToken)
  })

  it('refreshes access tokens and caches them', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: refreshedToken, expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'user@gmail.test', summary: 'user@gmail.test', timeZone: 'UTC' }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
    const client = new GoogleCalendarClient({ lookupImpl: publicLookup, clientId: 'cid', clientSecret: 'csecret', refreshToken: 'rtok', fetchImpl })

    await client.authTest()

    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token')
    expect(String(tokenInit.body)).toContain('grant_type=refresh_token')
    const [apiUrl, apiInit] = fetchImpl.mock.calls[1] as unknown as [URL, RequestInit]
    expect((apiInit.headers as Record<string, string>).authorization).toBe(`Bearer ${refreshedToken}`)
    expect(JSON.stringify(apiInit.body ?? '')).not.toContain(refreshedToken)

    await client.listCalendars({ pageSize: 1 })
    const [, secondInit] = fetchImpl.mock.calls[2] as unknown as [URL, RequestInit]
    expect((secondInit.headers as Record<string, string>).authorization).toBe(`Bearer ${refreshedToken}`)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('lists calendars with clamped page size and safe fields', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      items: [
        { id: 'user@gmail.test', summary: 'user@gmail.test', accessRole: 'owner', primary: true, timeZone: 'UTC', selected: true },
        { id: 'cal-2', summary: 'Work', summaryOverride: 'Work Cal', accessRole: 'reader', timeZone: 'Europe/Berlin' },
      ],
      nextPageToken: 'tok-1',
    }))
    const client = new GoogleCalendarClient({ lookupImpl: publicLookup, accessToken: testToken, fetchImpl })

    const result = await client.listCalendars({ pageSize: 500 })

    expect(result.items[0]).toMatchObject({ id: 'user@gmail.test', summary: 'user@gmail.test', accessRole: 'owner', primary: true })
    expect(result.items[1]).toMatchObject({ id: 'cal-2', summaryOverride: 'Work Cal', accessRole: 'reader' })
    expect(result.nextPageToken).toBe('tok-1')
    const [url] = fetchImpl.mock.calls[0] as unknown as [URL]
    const parsed = new URL(String(url))
    expect(parsed.pathname).toBe('/calendar/v3/users/me/calendarList')
    expect(parsed.searchParams.get('maxResults')).toBe('100')
    expect(parsed.searchParams.get('fields')).toContain('nextPageToken')
  })

  it('lists events with clamped page size, encoded calendar ids, and expanded single events', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      items: [
        {
          id: 'evt_1', status: 'confirmed', summary: 'Standup', location: 'Room 4',
          creator: { email: 'alice@gmail.test', displayName: 'Alice' },
          organizer: { email: 'alice@gmail.test' },
          start: { dateTime: '2026-10-06T09:00:00+08:00', timeZone: 'Asia/Shanghai' },
          end: { dateTime: '2026-10-06T09:15:00+08:00', timeZone: 'Asia/Shanghai' },
          attendees: [{ email: 'alice@gmail.test', responseStatus: 'accepted', organizer: true }],
        },
        { id: 'evt_2', status: 'confirmed', summary: 'All-day', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } },
      ],
      nextPageToken: 'tok-9',
    }))
    const client = new GoogleCalendarClient({ lookupImpl: publicLookup, accessToken: testToken, fetchImpl })

    const result = await client.listEvents({ calendarId: 'cal/1', pageSize: 500 })

    expect(result.calendarId).toBe('cal/1')
    expect(result.items[0]).toMatchObject({
      id: 'evt_1', summary: 'Standup', location: 'Room 4',
      creatorEmail: 'alice@gmail.test', organizerEmail: 'alice@gmail.test',
      start: { dateTime: '2026-10-06T09:00:00+08:00', timeZone: 'Asia/Shanghai' },
      attendeeCount: 1,
    })
    expect(result.items[1].start).toMatchObject({ date: '2026-10-07', dateTime: '' })
    expect(result.nextPageToken).toBe('tok-9')

    const [defaultUrl] = fetchImpl.mock.calls[0] as unknown as [URL]
    const parsed = new URL(String(defaultUrl))
    expect(parsed.origin + parsed.pathname).toBe('https://www.googleapis.com/calendar/v3/calendars/cal%2F1/events')
    expect(parsed.searchParams.get('maxResults')).toBe('100')
    expect(parsed.searchParams.get('singleEvents')).toBe('true')
    expect(parsed.searchParams.get('orderBy')).toBe('startDateTime')

    await client.listEvents()
    const [secondUrl] = fetchImpl.mock.calls[1] as unknown as [URL]
    expect(new URL(String(secondUrl)).pathname).toBe('/calendar/v3/calendars/primary/events')
  })

  it('searches events by free-text query and rejects empty queries', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      items: [{ id: 'evt_3', status: 'confirmed', summary: 'Quarterly review', start: { dateTime: '2026-10-10T14:00:00Z' }, end: { dateTime: '2026-10-10T15:00:00Z' } }],
      nextPageToken: '',
    }))
    const client = new GoogleCalendarClient({ lookupImpl: publicLookup, accessToken: testToken, fetchImpl })

    const result = await client.searchEvents({ query: '  quarterly  ', timeMin: '2026-10-01T00:00:00Z', pageSize: 5 })

    expect(result.items[0]).toMatchObject({ id: 'evt_3', summary: 'Quarterly review' })
    expect(result.nextPageToken).toBe('')
    const [url] = fetchImpl.mock.calls[0] as unknown as [URL]
    const parsed = new URL(String(url))
    expect(parsed.searchParams.get('q')).toBe('quarterly')
    expect(parsed.searchParams.get('timeMin')).toBe('2026-10-01T00:00:00Z')
    expect(parsed.searchParams.get('maxResults')).toBe('5')
    await expect(client.searchEvents({ query: '   ' })).rejects.toThrow('query is required')
  })

  it('reads one event by id and rejects empty ids', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      id: 'evt_1', status: 'confirmed', summary: 'Standup',
      description: 'x'.repeat(600),
      start: { dateTime: '2026-10-06T09:00:00Z' }, end: { dateTime: '2026-10-06T09:15:00Z' },
      attendees: Array.from({ length: 60 }, (_, index) => ({ email: `u${index}@gmail.test` })),
    }))
    const client = new GoogleCalendarClient({ lookupImpl: publicLookup, accessToken: testToken, fetchImpl })

    const event = await client.getEvent('primary', 'evt_1')

    expect(event).toMatchObject({ id: 'evt_1', summary: 'Standup', descriptionTruncated: true, attendeeCount: 60 })
    expect(event.attendees).toHaveLength(50)
    expect(event.description).toHaveLength(500)
    const [url] = fetchImpl.mock.calls[0] as unknown as [URL]
    expect(new URL(String(url)).pathname).toBe('/calendar/v3/calendars/primary/events/evt_1')

    await expect(client.getEvent('primary', '  ')).rejects.toThrow('Event id is required')
    await expect(client.getEvent('  ', 'evt_1')).rejects.toThrow('Calendar id is required')
  })

  it('maps Google error payloads into GoogleCalendarError', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: 404, message: 'Not Found' } }, 404))
    const error = await new GoogleCalendarClient({ lookupImpl: publicLookup, accessToken: testToken, fetchImpl })
      .getEvent('primary', 'missing')
      .then(() => undefined, (thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(GoogleCalendarError)
    const calendarError = error as GoogleCalendarError
    expect(calendarError.code).toBe(404)
    expect(calendarError.message).toContain('HTTP 404')
  })

  it('rejects special-purpose addresses in the endpoint guard without real DNS', async () => {
    const blockedLookup = async () => [{ address: '127.0.0.1', family: 4 as const }]
    const client = new GoogleCalendarClient({ lookupImpl: blockedLookup, accessToken: testToken, fetchImpl: vi.fn() })
    await expect(client.listEvents()).rejects.toThrow('rejected by host safety policy')
    expect(client.hasCredentials()).toBe(true)
  })
})
