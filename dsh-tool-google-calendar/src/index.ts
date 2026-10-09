import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallView } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  GoogleCalendarClient,
  GoogleCalendarError,
  type GoogleCalendarClientOptions,
} from './client.js'

export { GoogleCalendarClient, GoogleCalendarError }
export type {
  CalendarListEntryInfo,
  EventAttendeeInfo,
  EventDateTimeInfo,
  EventInfo,
  GoogleCalendarClientOptions,
} from './client.js'

export const name = 'dsh-tool-google-calendar'
export const inject = ['tools']
export interface GoogleCalendarPluginConfig extends GoogleCalendarClientOptions {}

function text(value: string) { return [{ type: 'text' as const, text: value }] }
function unavailable(reason: string) { return { found: false, reason } }
function readKind(title: string, kind: 'read' | 'search' = 'read'): ToolCallView { return { card: 'generic', title, kind } }
function failure(error: unknown): { found: false; reason: string } {
  return { found: false, reason: error instanceof Error ? error.message : 'Google Calendar request failed.' }
}

const calendarProperties = {
  id: { type: 'string' }, summary: { type: 'string' }, summaryOverride: { type: 'string' }, description: { type: 'string' },
  location: { type: 'string' }, timeZone: { type: 'string' }, colorId: { type: 'string' }, backgroundColor: { type: 'string' },
  foregroundColor: { type: 'string' }, hidden: { type: 'boolean' }, selected: { type: 'boolean' }, accessRole: { type: 'string' },
  primary: { type: 'boolean' },
} as const

const eventDateTimeProperties = {
  date: { type: 'string' }, dateTime: { type: 'string' }, timeZone: { type: 'string' },
} as const

const eventProperties = {
  id: { type: 'string' }, status: { type: 'string' }, htmlLink: { type: 'string' }, summary: { type: 'string' },
  description: { type: 'string' }, descriptionTruncated: { type: 'boolean' }, location: { type: 'string' },
  creatorEmail: { type: 'string' }, creatorName: { type: 'string' }, organizerEmail: { type: 'string' }, organizerName: { type: 'string' },
  start: { type: 'object', additionalProperties: false, properties: eventDateTimeProperties },
  end: { type: 'object', additionalProperties: false, properties: eventDateTimeProperties },
  attendees: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
    email: { type: 'string' }, displayName: { type: 'string' }, responseStatus: { type: 'string' },
    organizer: { type: 'boolean' }, self: { type: 'boolean' },
  } } },
  attendeeCount: { type: 'integer' }, recurringEventId: { type: 'string' }, visibility: { type: 'string' },
  iCalUID: { type: 'string' }, created: { type: 'string' }, updated: { type: 'string' },
} as const

function renderCalendars(items: Array<{ summary?: string; id?: string; accessRole?: string; primary?: boolean; timeZone?: string }>) {
  if (!items.length) return text('No Google calendars found.')
  return text(items.map(cal =>
    `${cal.primary ? '[primary] ' : ''}${cal.summary || cal.id || ''} (${cal.id ?? ''}) role=${cal.accessRole || 'unknown'} tz=${cal.timeZone || 'unknown'}`,
  ).join('\n'))
}

function formatEventTime(value: { date?: string; dateTime?: string; timeZone?: string }) {
  const raw = value.dateTime || value.date || 'unknown'
  return value.timeZone && value.dateTime ? `${raw} (${value.timeZone})` : raw
}

function renderEvents(items: Array<{ summary?: string; id?: string; start?: { date?: string; dateTime?: string; timeZone?: string }; end?: { date?: string; dateTime?: string; timeZone?: string }; location?: string }>, nextPageToken = '') {
  if (!items.length) return text('No Google Calendar events found.')
  const lines = items.map(event =>
    `${event.summary || '(no title)'} (${event.id ?? ''}) ${formatEventTime(event.start ?? {})} -> ${formatEventTime(event.end ?? {})}${event.location ? ' @ ' + event.location : ''}`,
  )
  return text(lines.concat(nextPageToken ? `nextPageToken=${nextPageToken}` : []).join('\n'))
}

function renderEvent(event: { summary?: string; id?: string; status?: string; description?: string; location?: string; creatorEmail?: string; organizerEmail?: string; attendeeCount?: number; htmlLink?: string } & { start?: { date?: string; dateTime?: string; timeZone?: string }; end?: { date?: string; dateTime?: string; timeZone?: string } }) {
  return text([
    `${event.summary || '(no title)'} (${event.id ?? ''}) status=${event.status || 'unknown'}`,
    `${formatEventTime(event.start ?? {})} -> ${formatEventTime(event.end ?? {})}`,
    event.location ? `location=${event.location}` : '',
    event.organizerEmail ? `organizer=${event.organizerEmail}` : '',
    event.attendeeCount ? `attendees=${event.attendeeCount}` : '',
    event.description ? `description=${event.description}` : '',
    event.htmlLink ? `link=${event.htmlLink}` : '',
  ].filter(Boolean).join('\n'))
}

export function createTools(client: GoogleCalendarClient) {
  return [
    defineTool({
      name: 'gcal_auth_test',
      description: 'Verify Google Calendar credentials and return the primary calendar id, summary, and time zone without exposing the token.',
      parameters: {},
      output: { schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, reason: { type: 'string' }, calendarId: { type: 'string' }, summary: { type: 'string' }, timeZone: { type: 'string' } } } as const, render: (_args, value) => value.ok ? text(`${value.summary || value.calendarId} tz=${value.timeZone}`) : text('Google Calendar auth failed: ' + value.reason) },
      presentCall(): ToolCallView { return readKind('Verify Google Calendar credentials') },
      async execute(_args, exec) {
        if (!client.hasCredentials()) return { ok: false, reason: 'Google Calendar credentials are not configured.' }
        try { return await client.authTest(exec.signal) } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : 'Google Calendar authentication failed.' } }
      },
    }),
    defineTool({
      name: 'gcal_list_calendars',
      description: 'List the calendars in the signed-in user\'s calendar list with bounded page size and an opaque page token.',
      parameters: { pageSize: { type: 'integer', description: 'Results per request, 1-100 (default 50).' }, pageToken: { type: 'string', description: 'Opaque page token from an earlier response.' }, showHidden: { type: 'boolean', description: 'Include hidden calendars.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: calendarProperties } }, nextPageToken: { type: 'string' } } } as const, render: (_args, value) => value.found ? renderCalendars(value.items || []) : text(value.reason || 'Google Calendar is not configured.') },
      presentCall(): ToolCallView { return readKind('Google calendars', 'search') },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Google Calendar credentials are not configured.')
        try {
          const result = await client.listCalendars({ pageSize: args.pageSize as number, pageToken: args.pageToken as string, showHidden: args.showHidden as boolean, signal: exec.signal })
          return { found: true, ...result }
        } catch (error) { return failure(error) }
      },
    }),
    defineTool({
      name: 'gcal_list_events',
      description: 'List events from one Google Calendar in an optional time window with bounded page size, single events expanded, and an opaque page token.',
      parameters: { calendarId: { type: 'string', description: 'Calendar ID; defaults to the primary calendar.' }, timeMin: { type: 'string', description: 'Inclusive lower bound, RFC 3339 timestamp.' }, timeMax: { type: 'string', description: 'Exclusive upper bound, RFC 3339 timestamp.' }, pageSize: { type: 'integer', description: 'Results per request, 1-100 (default 25).' }, pageToken: { type: 'string', description: 'Opaque page token from an earlier response.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, calendarId: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: eventProperties } }, nextPageToken: { type: 'string' } } } as const, render: (_args, value) => value.found ? renderEvents(value.items || [], value.nextPageToken) : text(value.reason || 'Google Calendar is not configured.') },
      presentCall(args): ToolCallView { return readKind('Calendar events' + (args.calendarId ? ': ' + args.calendarId : ''), 'search') },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Google Calendar credentials are not configured.')
        try {
          const result = await client.listEvents({ calendarId: args.calendarId as string, timeMin: args.timeMin as string, timeMax: args.timeMax as string, pageSize: args.pageSize as number, pageToken: args.pageToken as string, signal: exec.signal })
          return { found: true, ...result }
        } catch (error) { return failure(error) }
      },
    }),
    defineTool({
      name: 'gcal_search_events',
      description: 'Search events in one Google Calendar by free-text query with an optional time window, bounded page size, and an opaque page token.',
      parameters: { query: { type: 'string', required: true, description: 'Free-text search query.' }, calendarId: { type: 'string', description: 'Calendar ID; defaults to the primary calendar.' }, timeMin: { type: 'string', description: 'Inclusive lower bound, RFC 3339 timestamp.' }, timeMax: { type: 'string', description: 'Exclusive upper bound, RFC 3339 timestamp.' }, pageSize: { type: 'integer', description: 'Results per request, 1-100 (default 25).' }, pageToken: { type: 'string', description: 'Opaque page token from an earlier response.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, calendarId: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: eventProperties } }, nextPageToken: { type: 'string' } } } as const, render: (_args, value) => value.found ? renderEvents(value.items || [], value.nextPageToken) : text(value.reason || 'Google Calendar is not configured.') },
      presentCall(args): ToolCallView { return readKind('Search calendar events: ' + (args.query || ''), 'search') },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Google Calendar credentials are not configured.')
        try {
          const result = await client.searchEvents({ query: args.query as string, calendarId: args.calendarId as string, timeMin: args.timeMin as string, timeMax: args.timeMax as string, pageSize: args.pageSize as number, pageToken: args.pageToken as string, signal: exec.signal })
          return { found: true, ...result }
        } catch (error) { return failure(error) }
      },
    }),
    defineTool({
      name: 'gcal_get_event',
      description: 'Read one Google Calendar event by ID with safe fields: times, location, organizer, attendee count, and a bounded description. Attachments and conference data are omitted.',
      parameters: { eventId: { type: 'string', required: true, description: 'Google Calendar event ID.' }, calendarId: { type: 'string', description: 'Calendar ID; defaults to the primary calendar.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, ...eventProperties } } as const, render: (_args, value) => value.found ? renderEvent(value) : text(value.reason || 'Google Calendar is not configured.') },
      presentCall(args): ToolCallView { return readKind('Calendar event ' + (args.eventId || '')) },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Google Calendar credentials are not configured.')
        try {
          const result = await client.getEvent(args.calendarId as string, args.eventId as string, { signal: exec.signal })
          return { found: true, ...result }
        } catch (error) { return failure(error) }
      },
    }),
  ]
}

export function apply(ctx: Context, config: GoogleCalendarPluginConfig = {}): void {
  const client = new GoogleCalendarClient(config)
  for (const tool of createTools(client)) ctx.tools.register(tool)
}
