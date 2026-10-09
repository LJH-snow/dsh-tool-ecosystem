/** Google Calendar API client with injected fetch for testability. */

import { assertSafeUrl, EndpointSecurityError, normalizeBaseUrl, type LookupImpl } from './url-security.js'

export interface GoogleCalendarClientOptions {
  accessToken?: string
  clientId?: string
  clientSecret?: string
  refreshToken?: string
  baseUrl?: string
  tokenUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /** Test-only DNS lookup override; production uses node:dns/promises. */
  lookupImpl?: LookupImpl
}

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    public readonly code: number,
  ) {
    super(message)
    this.name = 'GoogleCalendarError'
  }
}

interface TokenCache {
  token: string
  expiresAt: number
}

export interface CalendarListEntryInfo {
  id: string
  summary: string
  summaryOverride: string
  description: string
  location: string
  timeZone: string
  colorId: string
  backgroundColor: string
  foregroundColor: string
  hidden: boolean
  selected: boolean
  accessRole: string
  primary: boolean
}

export interface EventDateTimeInfo {
  date: string
  dateTime: string
  timeZone: string
}

export interface EventAttendeeInfo {
  email: string
  displayName: string
  responseStatus: string
  organizer: boolean
  self: boolean
}

export interface EventInfo {
  id: string
  status: string
  htmlLink: string
  summary: string
  description: string
  descriptionTruncated: boolean
  location: string
  creatorEmail: string
  creatorName: string
  organizerEmail: string
  organizerName: string
  start: EventDateTimeInfo
  end: EventDateTimeInfo
  attendees: EventAttendeeInfo[]
  attendeeCount: number
  recurringEventId: string
  visibility: string
  iCalUID: string
  created: string
  updated: string
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
  return typeof value === 'number' ? value : Number(value ?? 0) || 0
}

function asBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  return typeof value === 'boolean' ? value : false
}

function clampCount(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(maximum, Math.trunc(value as number)))
}

function limitChars(value: string, maxChars: number): { value: string; truncated: boolean } {
  if (value.length <= maxChars) return { value, truncated: false }
  return { value: value.slice(0, maxChars), truncated: true }
}

function mapEventDateTime(value: unknown): EventDateTimeInfo {
  const r = asRecord(value)
  return {
    date: asString(r, 'date'),
    dateTime: asString(r, 'dateTime'),
    timeZone: asString(r, 'timeZone'),
  }
}

function mapAttendees(value: unknown, cap: number): { attendees: EventAttendeeInfo[]; attendeeCount: number } {
  const all = asArray(value)
  return {
    attendees: all.slice(0, cap).map(item => {
      const r = asRecord(item)
      return {
        email: asString(r, 'email'),
        displayName: asString(r, 'displayName'),
        responseStatus: asString(r, 'responseStatus'),
        organizer: asBoolean(r, 'organizer'),
        self: asBoolean(r, 'self'),
      }
    }),
    attendeeCount: all.length,
  }
}

function mapEvent(data: unknown): EventInfo {
  const r = asRecord(data)
  const description = limitChars(asString(r, 'description'), 500)
  const person = (value: unknown) => {
    const p = asRecord(value)
    return { email: asString(p, 'email'), displayName: asString(p, 'displayName') }
  }
  const attendees = mapAttendees(r.attendees, 50)
  return {
    id: asString(r, 'id'),
    status: asString(r, 'status'),
    htmlLink: asString(r, 'htmlLink'),
    summary: asString(r, 'summary'),
    description: description.value,
    descriptionTruncated: description.truncated,
    location: limitChars(asString(r, 'location'), 200).value,
    creatorEmail: person(r.creator).email,
    creatorName: person(r.creator).displayName,
    organizerEmail: person(r.organizer).email,
    organizerName: person(r.organizer).displayName,
    start: mapEventDateTime(r.start),
    end: mapEventDateTime(r.end),
    attendees: attendees.attendees,
    attendeeCount: attendees.attendeeCount,
    recurringEventId: asString(r, 'recurringEventId'),
    visibility: asString(r, 'visibility'),
    iCalUID: asString(r, 'iCalUID'),
    created: asString(r, 'created'),
    updated: asString(r, 'updated'),
  }
}

const EVENT_FIELDS = 'nextPageToken,items(id,status,htmlLink,summary,description,location,creator(email,displayName),organizer(email,displayName),start,end,attendees(email,displayName,responseStatus,organizer,self),recurringEventId,visibility,created,updated,iCalUID)'
const SINGLE_EVENT_FIELDS = 'id,status,htmlLink,summary,description,location,creator(email,displayName),organizer(email,displayName),start,end,attendees(email,displayName,responseStatus,organizer,self),recurringEventId,visibility,created,updated,iCalUID'

export class GoogleCalendarClient {
  private readonly staticToken: string
  private readonly clientId: string
  private readonly clientSecret: string
  private readonly refreshToken: string
  private readonly baseUrl: string
  private readonly tokenUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly lookupImpl: LookupImpl | undefined
  private tokenCache: TokenCache | null = null

  constructor(options: GoogleCalendarClientOptions = {}) {
    this.staticToken = options.accessToken ?? ''
    this.clientId = options.clientId ?? ''
    this.clientSecret = options.clientSecret ?? ''
    this.refreshToken = options.refreshToken ?? ''
    try {
      this.baseUrl = normalizeBaseUrl(options.baseUrl, 'https://www.googleapis.com/calendar/v3')
    } catch (error) {
      if (error instanceof EndpointSecurityError) throw new GoogleCalendarError(error.message, 400)
      throw error
    }
    try {
      this.tokenUrl = normalizeBaseUrl(options.tokenUrl, 'https://oauth2.googleapis.com/token')
    } catch (error) {
      if (error instanceof EndpointSecurityError) throw new GoogleCalendarError(error.message, 400)
      throw error
    }
    this.timeoutMs = options.timeoutMs ?? 15000
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.lookupImpl = options.lookupImpl
  }

  hasCredentials(): boolean {
    return Boolean(this.staticToken || (this.clientId && this.clientSecret && this.refreshToken))
  }

  private buildUrl(urlOrPath: string, params?: Record<string, string | boolean | number | undefined>): string {
    let url = /^https?:\/\//.test(urlOrPath) ? urlOrPath : `${this.baseUrl}${urlOrPath}`
    if (params) {
      const search = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === '') continue
        search.append(key, String(value))
      }
      const qs = search.toString()
      if (qs) url += `${url.includes('?') ? '&' : '?'}${qs}`
    }
    return url
  }

  private async getAccessToken(signal?: AbortSignal): Promise<string> {
    if (this.staticToken) return this.staticToken
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new GoogleCalendarError('Google Calendar credentials not configured.', 401)
    }
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) return this.tokenCache.token

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
    })
    const controller = new AbortController()
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
    const timer = this.timeoutMs > 0 ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined
    try {
      try {
        await assertSafeUrl(new URL(this.tokenUrl), this.lookupImpl)
      } catch (error) {
        if (error instanceof EndpointSecurityError) throw new GoogleCalendarError(error.message, 400)
        throw error
      }
      const response = await this.fetchImpl(this.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: combined,
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new GoogleCalendarError(`Google token endpoint returned HTTP ${response.status}: ${text}`, response.status)
      }
      const json = await response.json() as Record<string, unknown>
      const error = typeof json.error === 'string' ? json.error : ''
      if (error) throw new GoogleCalendarError(`Google token endpoint error: ${error}`, 401)
      const token = asString(json, 'access_token')
      const expiresIn = asNumber(json, 'expires_in')
      if (!token) throw new GoogleCalendarError('Failed to obtain Google access token.', 401)
      this.tokenCache = { token, expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000 }
      return token
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private async request(
    method: string,
    urlOrPath: string,
    options: {
      params?: Record<string, string | boolean | number | undefined>
      signal?: AbortSignal
    } = {},
  ): Promise<unknown> {
    const { params, signal } = options
    const url = this.buildUrl(urlOrPath, params)
    const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' }
    headers.authorization = `Bearer ${await this.getAccessToken(signal)}`
    const controller = new AbortController()
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
    const timer = this.timeoutMs > 0 ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined
    try {
      try {
        await assertSafeUrl(new URL(url), this.lookupImpl)
      } catch (error) {
        if (error instanceof EndpointSecurityError) throw new GoogleCalendarError(error.message, 400)
        throw error
      }
      const response = await this.fetchImpl(url, {
        method,
        headers,
        signal: combined,
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new GoogleCalendarError(`Google Calendar API ${method} ${urlOrPath} returned HTTP ${response.status}: ${text}`, response.status)
      }
      return await response.json()
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async authTest(signal?: AbortSignal): Promise<{ ok: boolean; authMethod: string; calendarId: string; summary: string; timeZone: string }> {
    const data = asRecord(await this.request('GET', '/calendars/primary', {
      params: { fields: 'id,summary,timeZone' },
      signal,
    }))
    const credentialKind = this.staticToken ? 'access' : 'refresh'
    return {
      ok: true,
      authMethod: credentialKind + '_token',
      calendarId: asString(data, 'id'),
      summary: asString(data, 'summary'),
      timeZone: asString(data, 'timeZone'),
    }
  }

  async listCalendars(options: {
    pageSize?: number
    pageToken?: string
    showHidden?: boolean
    signal?: AbortSignal
  } = {}): Promise<{ items: CalendarListEntryInfo[]; nextPageToken: string }> {
    const data = asRecord(await this.request('GET', '/users/me/calendarList', {
      params: {
        maxResults: clampCount(options.pageSize, 50, 100),
        pageToken: options.pageToken,
        showHidden: options.showHidden,
        fields: 'nextPageToken,items(id,summary,summaryOverride,description,location,timeZone,colorId,backgroundColor,foregroundColor,hidden,selected,accessRole,primary)',
      },
      signal: options.signal,
    }))
    return {
      items: asArray(data.items).map(item => {
        const r = asRecord(item)
        return {
          id: asString(r, 'id'),
          summary: asString(r, 'summary'),
          summaryOverride: asString(r, 'summaryOverride'),
          description: asString(r, 'description'),
          location: asString(r, 'location'),
          timeZone: asString(r, 'timeZone'),
          colorId: asString(r, 'colorId'),
          backgroundColor: asString(r, 'backgroundColor'),
          foregroundColor: asString(r, 'foregroundColor'),
          hidden: asBoolean(r, 'hidden'),
          selected: asBoolean(r, 'selected'),
          accessRole: asString(r, 'accessRole'),
          primary: asBoolean(r, 'primary'),
        }
      }),
      nextPageToken: asString(data, 'nextPageToken'),
    }
  }

  async listEvents(options: {
    calendarId?: string
    timeMin?: string
    timeMax?: string
    pageSize?: number
    pageToken?: string
    signal?: AbortSignal
  } = {}): Promise<{ calendarId: string; items: EventInfo[]; nextPageToken: string }> {
    const calendarId = (options.calendarId || 'primary').trim()
    if (!calendarId) throw new GoogleCalendarError('Calendar id is required', 400)
    const data = asRecord(await this.request('GET', `/calendars/${encodeURIComponent(calendarId)}/events`, {
      params: {
        timeMin: options.timeMin,
        timeMax: options.timeMax,
        maxResults: clampCount(options.pageSize, 25, 100),
        pageToken: options.pageToken,
        singleEvents: true,
        orderBy: 'startDateTime',
        fields: EVENT_FIELDS,
      },
      signal: options.signal,
    }))
    return {
      calendarId,
      items: asArray(data.items).map(mapEvent),
      nextPageToken: asString(data, 'nextPageToken'),
    }
  }

  async searchEvents(options: {
    query: string
    calendarId?: string
    timeMin?: string
    timeMax?: string
    pageSize?: number
    pageToken?: string
    signal?: AbortSignal
  }): Promise<{ calendarId: string; items: EventInfo[]; nextPageToken: string }> {
    const query = options.query?.trim()
    if (!query) throw new GoogleCalendarError('query is required', 400)
    const calendarId = (options.calendarId || 'primary').trim()
    if (!calendarId) throw new GoogleCalendarError('Calendar id is required', 400)
    const data = asRecord(await this.request('GET', `/calendars/${encodeURIComponent(calendarId)}/events`, {
      params: {
        q: query,
        timeMin: options.timeMin,
        timeMax: options.timeMax,
        maxResults: clampCount(options.pageSize, 25, 100),
        pageToken: options.pageToken,
        singleEvents: true,
        orderBy: 'startDateTime',
        fields: EVENT_FIELDS,
      },
      signal: options.signal,
    }))
    return {
      calendarId,
      items: asArray(data.items).map(mapEvent),
      nextPageToken: asString(data, 'nextPageToken'),
    }
  }

  async getEvent(calendarId: string, eventId: string, options: { signal?: AbortSignal } = {}): Promise<EventInfo> {
    const cal = (calendarId || 'primary').trim()
    if (!cal) throw new GoogleCalendarError('Calendar id is required', 400)
    const id = eventId?.trim()
    if (!id) throw new GoogleCalendarError('Event id is required', 400)
    const data = await this.request('GET', `/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(id)}`, {
      params: { fields: SINGLE_EVENT_FIELDS },
      signal: options.signal,
    })
    return mapEvent(data)
  }
}
