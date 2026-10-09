import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallView } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { GoogleDriveClient, GoogleDriveError } from './client.js'

export const name = 'dsh-tool-google-drive'
export const inject = ['tools']

export interface GoogleDrivePluginConfig {
  accessToken?: string
  clientId?: string
  clientSecret?: string
  refreshToken?: string
  baseUrl?: string
  tokenUrl?: string
  timeoutMs?: number
}

export type { DrivePermissionInfo, DriveRevisionInfo } from './client.js'

export function apply(ctx: Context, config: GoogleDrivePluginConfig = {}) {
  const client = new GoogleDriveClient(config)
  for (const tool of createTools(client)) ctx.tools.register(tool)
}

function unavailable(reason: string) {
  return { found: false, reason }
}

function text(value: string) {
  return [{ type: 'text' as const, text: value }]
}

function fileProperties() {
  return {
    id: { type: 'string' }, name: { type: 'string' }, mimeType: { type: 'string' }, kind: { type: 'string' },
    description: { type: 'string' }, iconLink: { type: 'string' }, webViewLink: { type: 'string' }, webContentLink: { type: 'string' },
    size: { type: 'string' }, starred: { type: 'boolean' }, trashed: { type: 'boolean' }, modifiedTime: { type: 'string' },
    createdTime: { type: 'string' }, driveId: { type: 'string' }, parents: { type: 'array', items: { type: 'string' } },
    owners: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      displayName: { type: 'string' }, emailAddress: { type: 'string' },
    } } },
  } as const
}

function driveProperties() {
  return {
    id: { type: 'string' }, name: { type: 'string' }, colorRgb: { type: 'string' }, backgroundImageLink: { type: 'string' },
    createdTime: { type: 'string' }, hidden: { type: 'boolean' }, themeId: { type: 'string' },
    capabilities: { type: 'string' }, restrictions: { type: 'string' },
  } as const
}

function renderFiles(items: Array<{ name?: string; id?: string; mimeType?: string; modifiedTime?: string }>) {
  if (!items.length) return text('No Google Drive files found.')
  return text(items.map(file => `${file.name ?? ''} (${file.id ?? ''}) ${file.mimeType ?? ''} ${file.modifiedTime ?? ''}`).join('\n'))
}

function renderFile(file: { name?: string; id?: string; mimeType?: string; modifiedTime?: string; webViewLink?: string; description?: string }) {
  return text([
    `${file.name ?? ''} (${file.id ?? ''})`,
    `mimeType=${file.mimeType ?? ''}`,
    `modified=${file.modifiedTime ?? ''}`,
    `link=${file.webViewLink ?? ''}`,
    file.description ? `description=${file.description}` : '',
  ].filter(Boolean).join('\n'))
}

function renderPermissions(items: Array<{ id?: string; type?: string; role?: string; emailAddress?: string; displayName?: string; deleted?: boolean }>) {
  if (!items.length) return text('No Google Drive permissions found.')
  return text(items.map(permission => {
    const subject = permission.displayName || permission.emailAddress || permission.id || ''
    return subject + ' (' + (permission.type ?? '') + ') role=' + (permission.role ?? '') + (permission.deleted ? ' deleted' : '')
  }).join('\\n'))
}

function renderRevisions(items: Array<{ id?: string; mimeType?: string; modifiedTime?: string; size?: string; keepForever?: boolean; published?: boolean }>) {
  if (!items.length) return text('No Google Drive revisions found.')
  return text(items.map(revision => [
    revision.id ?? '', revision.modifiedTime ?? '', revision.mimeType ? 'mimeType=' + revision.mimeType : '',
    revision.size ? 'size=' + revision.size : '', revision.keepForever ? 'keepForever' : '', revision.published ? 'published' : '',
  ].filter(Boolean).join(' ')).join('\\n'))
}

function renderDrives(items: Array<{ name?: string; id?: string; createdTime?: string }>) {
  if (!items.length) return text('No shared drives found.')
  return text(items.map(drive => `${drive.name ?? ''} (${drive.id ?? ''}) ${drive.createdTime ?? ''}`).join('\n'))
}

function renderDocument(doc: { title?: string; documentId?: string; revisionId?: string; text?: string; tabCount?: number }) {
  return text([
    `${doc.title ?? ''} (${doc.documentId ?? ''})`,
    `revision=${doc.revisionId ?? ''} tabs=${doc.tabCount ?? 0}`,
    (doc.text ?? '').slice(0, 4000),
  ].filter(Boolean).join('\n'))
}

function renderSpreadsheet(sheet: { title?: string; spreadsheetId?: string; spreadsheetUrl?: string; sheetCount?: number; sheets?: Array<{ title?: string; rowCount?: number; columnCount?: number }> }) {
  const tabs = (sheet.sheets ?? []).map(s => `${s.title ?? ''} ${s.rowCount ?? 0}x${s.columnCount ?? 0}`).join('\n')
  return text([
    `${sheet.title ?? ''} (${sheet.spreadsheetId ?? ''})`,
    `sheets=${sheet.sheetCount ?? 0}`,
    `url=${sheet.spreadsheetUrl ?? ''}`,
    tabs,
  ].filter(Boolean).join('\n'))
}

function renderValues(value: { range?: string; rowCount?: number; columnCount?: number; values?: string[][] }) {
  const rows = (value.values ?? []).slice(0, 20).map(row => row.join('\t')).join('\n')
  return text([`${value.range ?? ''} rows=${value.rowCount ?? 0} columns=${value.columnCount ?? 0}`, rows].filter(Boolean).join('\n'))
}

export function createTools(client: GoogleDriveClient) {
  return [
    defineTool({
      name: 'gdrive_auth_test',
      description: 'Verify Google Drive credentials without returning token material.',
      parameters: {},
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: { ok: { type: 'boolean' }, reason: { type: 'string' }, authMethod: { type: 'string' } },
        },
        render: (_args, value) => value.ok ? text('authMethod: ' + value.authMethod) : text('Google Drive auth failed: ' + value.reason),
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Verify Google Drive credentials', kind: 'read' } },
      async execute(_args, exec) {
        if (!client.hasCredentials()) return { ok: false, reason: 'Google Drive accessToken or refresh token credentials are not configured.' }
        try { return await client.authTest(exec.signal) } catch (error) {
          if (error instanceof GoogleDriveError) return { ok: false, reason: error.message }
          throw error
        }
      },
    }),
    defineTool({
      name: 'gdrive_list_files',
      description: 'List or search Google Drive files by query and pagination.',
      parameters: {
        query: { type: 'string', description: 'Optional Drive query string, such as name contains "report" and trashed = false' },
        pageSize: { type: 'integer', description: 'Maximum results per page, 1-1000 (default 100)' }, pageToken: { type: 'string', description: 'Opaque cursor from a previous response' },
        orderBy: { type: 'string', description: 'Sort order, such as modifiedTime desc or name' }, spaces: { type: 'string', description: 'Drive space, usually drive' },
        corpora: { type: 'string', description: 'Corpora selector: user, domain, drive, or allDrives' }, driveId: { type: 'string', description: 'Shared drive ID when corpora=drive' },
        includeItemsFromAllDrives: { type: 'boolean', description: 'Include My Drive and shared drive items' }, supportsAllDrives: { type: 'boolean', description: 'Enable shared drive support' },
      },
      output: { schema: { type: 'object', additionalProperties: false, properties: {
        found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: fileProperties() } },
        nextPageToken: { type: 'string' }, incompleteSearch: { type: 'boolean' },
      } }, render: (_args, value) => value.found ? renderFiles(value.items ?? []) : text(value.reason ?? 'Google Drive is not configured.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: `Google Drive files ${args.query ?? ''}`.trim(), kind: 'search' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Google Drive accessToken or refresh token credentials are not configured.')
        try {
          return { found: true, ...await client.listFiles({ query: args.query as string, pageSize: args.pageSize as number, pageToken: args.pageToken as string, orderBy: args.orderBy as string, spaces: args.spaces as string, corpora: args.corpora as string, driveId: args.driveId as string, includeItemsFromAllDrives: args.includeItemsFromAllDrives as boolean, supportsAllDrives: args.supportsAllDrives as boolean, signal: exec.signal }) }
        } catch (error) { if (error instanceof GoogleDriveError) return unavailable(error.message); throw error }
      },
    }),
    defineTool({
      name: 'gdrive_get_file',
      description: 'Get one Google Drive file metadata by file ID.',
      parameters: { fileId: { type: 'string', required: true, description: 'Google Drive file ID' }, fields: { type: 'string', description: 'Optional Drive fields selector' }, supportsAllDrives: { type: 'boolean', description: 'Enable shared drive support' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, ...fileProperties() } }, render: (_args, value) => value.found ? renderFile(value) : text(value.reason ?? 'Google Drive is not configured.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: `Google Drive file ${args.fileId ?? ''}`, kind: 'read' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return { found: false, reason: 'Google Drive accessToken or refresh token credentials are not configured.' }
        try { return { found: true, ...await client.getFile(args.fileId as string, { fields: args.fields as string, supportsAllDrives: args.supportsAllDrives as boolean, signal: exec.signal }) } } catch (error) {
          if (error instanceof GoogleDriveError) return { found: false, reason: error.message }
          throw error
        }
      },
    }),
    defineTool({
      name: 'gdrive_list_permissions',
      description: 'List sharing permissions for one Google Drive file, folder, or shared drive with pagination.',
      parameters: {
        fileId: { type: 'string', required: true, description: 'Google Drive file, folder, or shared drive ID' },
        pageSize: { type: 'integer', description: 'Maximum permissions per page' },
        pageToken: { type: 'string', description: 'Opaque cursor from a previous response' },
        supportsAllDrives: { type: 'boolean', description: 'Enable My Drive and shared drive support' },
        useDomainAdminAccess: { type: 'boolean', description: 'Use domain administrator access for shared drives when allowed' },
        includePermissionsForView: { type: 'string', description: 'Additional permission view, currently published' },
        fields: { type: 'string', description: 'Optional Drive fields selector' },
      },
      output: { schema: { type: 'object', additionalProperties: false, properties: {
        found: { type: 'boolean' }, reason: { type: 'string' }, fileId: { type: 'string' }, nextPageToken: { type: 'string' },
        items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
          id: { type: 'string' }, type: { type: 'string' }, kind: { type: 'string' }, role: { type: 'string' }, emailAddress: { type: 'string' }, displayName: { type: 'string' }, allowFileDiscovery: { type: 'boolean' }, expirationTime: { type: 'string' }, deleted: { type: 'boolean' }, permissionDetails: { type: 'string' },
        } } },
      } }, render: (_args, value) => value.found ? renderPermissions(value.items ?? []) : text(value.reason ?? 'Google Drive is not configured.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Google Drive permissions ' + (args.fileId ?? ''), kind: 'search' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Google Drive accessToken or refresh token credentials are not configured.')
        try {
          return { found: true, ...await client.listPermissions(args.fileId as string, { pageSize: args.pageSize as number, pageToken: args.pageToken as string, supportsAllDrives: args.supportsAllDrives as boolean, useDomainAdminAccess: args.useDomainAdminAccess as boolean, includePermissionsForView: args.includePermissionsForView as string, fields: args.fields as string, signal: exec.signal }) }
        } catch (error) { if (error instanceof GoogleDriveError) return unavailable(error.message); throw error }
      },
    }),
    defineTool({
      name: 'gdrive_list_revisions',
      description: 'List revisions for one Google Drive file with pagination.',
      parameters: {
        fileId: { type: 'string', required: true, description: 'Google Drive file ID' },
        pageSize: { type: 'integer', description: 'Maximum revisions per page' },
        pageToken: { type: 'string', description: 'Opaque cursor from a previous response' },
        fields: { type: 'string', description: 'Optional Drive fields selector' },
      },
      output: { schema: { type: 'object', additionalProperties: false, properties: {
        found: { type: 'boolean' }, reason: { type: 'string' }, fileId: { type: 'string' }, nextPageToken: { type: 'string' },
        items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
          id: { type: 'string' }, mimeType: { type: 'string' }, modifiedTime: { type: 'string' }, keepForever: { type: 'boolean' }, published: { type: 'boolean' }, publishAuto: { type: 'boolean' }, publishedOutsideDomain: { type: 'boolean' }, size: { type: 'string' }, originalFilename: { type: 'string' }, md5Checksum: { type: 'string' }, downloadUrl: { type: 'string' }, exportLinks: { type: 'string' },
        } } },
      } }, render: (_args, value) => value.found ? renderRevisions(value.items ?? []) : text(value.reason ?? 'Google Drive is not configured.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Google Drive revisions ' + (args.fileId ?? ''), kind: 'search' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Google Drive accessToken or refresh token credentials are not configured.')
        try {
          return { found: true, ...await client.listRevisions(args.fileId as string, { pageSize: args.pageSize as number, pageToken: args.pageToken as string, fields: args.fields as string, signal: exec.signal }) }
        } catch (error) { if (error instanceof GoogleDriveError) return unavailable(error.message); throw error }
      },
    }),
    defineTool({
      name: 'gdrive_export_file',
      description: 'Export a Google Workspace file to text or another MIME type. Read-only operation.',
      parameters: { fileId: { type: 'string', required: true, description: 'Google Drive file ID' }, exportMimeType: { type: 'string', description: 'Export MIME type, default text/plain' }, responseEncoding: { type: 'string', description: 'Output encoding: text or base64 (default text)' }, maxBytes: { type: 'integer', description: 'Maximum source bytes to return, default 1 MiB, capped at 10 MiB' }, supportsAllDrives: { type: 'boolean', description: 'Enable shared drive support' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, fileId: { type: 'string' }, exportMimeType: { type: 'string' }, encoding: { type: 'string' }, content: { type: 'string' }, contentLength: { type: 'number' }, truncated: { type: 'boolean' } } }, render: (_args, value) => value.found ? text((value.content ?? '').slice(0, 4000) + (value.truncated ? '\n[content truncated by maxBytes]' : '')) : text(value.reason ?? 'Google Drive is not configured.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: `Export Google Drive file ${args.fileId ?? ''}`, kind: 'read' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Google Drive accessToken or refresh token credentials are not configured.')
        try { return { found: true, ...await client.exportFile(args.fileId as string, { exportMimeType: args.exportMimeType as string, responseEncoding: args.responseEncoding as 'text' | 'base64', maxBytes: args.maxBytes as number, supportsAllDrives: args.supportsAllDrives as boolean, signal: exec.signal }) } } catch (error) {
          if (error instanceof GoogleDriveError) return unavailable(error.message)
          throw error
        }
      },
    }),
    defineTool({
      name: 'gdrive_list_shared_drives',
      description: 'List shared drives accessible to the user with pagination.',
      parameters: { pageSize: { type: 'integer', description: 'Maximum results per page' }, pageToken: { type: 'string', description: 'Opaque cursor from previous response' }, query: { type: 'string', description: 'Optional shared drive query' }, useDomainAdminAccess: { type: 'boolean', description: 'Issue request as domain admin when allowed' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: driveProperties() } }, nextPageToken: { type: 'string' }, incompleteSearch: { type: 'boolean' } } }, render: (_args, value) => value.found ? renderDrives(value.items ?? []) : text(value.reason ?? 'Google Drive is not configured.') },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Google shared drives', kind: 'search' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Google Drive accessToken or refresh token credentials are not configured.')
        try { return { found: true, ...await client.listSharedDrives({ pageSize: args.pageSize as number, pageToken: args.pageToken as string, query: args.query as string, useDomainAdminAccess: args.useDomainAdminAccess as boolean, signal: exec.signal }) } } catch (error) {
          if (error instanceof GoogleDriveError) return unavailable(error.message)
          throw error
        }
      },
    }),
    defineTool({
      name: 'gdrive_get_shared_drive',
      description: 'Get one shared drive metadata record by shared drive ID.',
      parameters: { driveId: { type: 'string', required: true, description: 'Google shared drive ID' }, useDomainAdminAccess: { type: 'boolean', description: 'Issue request as domain admin when allowed' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, ...driveProperties() } }, render: (_args, value) => value.found ? renderDrives([value]) : text(value.reason ?? 'Google Drive is not configured.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: `Google shared drive ${args.driveId ?? ''}`, kind: 'read' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Google Drive accessToken or refresh token credentials are not configured.')
        try { return { found: true, ...await client.getSharedDrive(args.driveId as string, { useDomainAdminAccess: args.useDomainAdminAccess as boolean, signal: exec.signal }) } } catch (error) {
          if (error instanceof GoogleDriveError) return unavailable(error.message)
          throw error
        }
      },
    }),
    defineTool({
      name: 'gdocs_get_document',
      description: 'Read a Google Docs document structure and extracted text by document ID.',
      parameters: { documentId: { type: 'string', required: true, description: 'Google Docs document ID' }, includeTabsContent: { type: 'boolean', description: 'Include tab content, default true' }, maxBytes: { type: 'integer', description: 'Maximum UTF-8 document bytes, default 1 MiB, capped at 10 MiB' }, maxTabs: { type: 'integer', description: 'Maximum tab metadata records, default 100' }, suggestionsViewMode: { type: 'string', description: 'Optional suggestions view mode' }, commentsViewMode: { type: 'string', description: 'Optional comments view mode' }, fields: { type: 'string', description: 'Optional field mask' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, documentId: { type: 'string' }, title: { type: 'string' }, revisionId: { type: 'string' }, text: { type: 'string' }, contentLength: { type: 'number' }, truncated: { type: 'boolean' }, tabCount: { type: 'number' }, tabs: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { tabId: { type: 'string' }, title: { type: 'string' }, index: { type: 'number' }, textLength: { type: 'number' } } } } } }, render: (_args, value) => value.found ? renderDocument(value) : text(value.reason ?? 'Google Docs is not configured.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: `Google Doc ${args.documentId ?? ''}`, kind: 'read' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Google Drive accessToken or refresh token credentials are not configured.')
        try { return { found: true, ...await client.getDocument(args.documentId as string, { includeTabsContent: args.includeTabsContent as boolean, maxBytes: args.maxBytes as number, maxTabs: args.maxTabs as number, suggestionsViewMode: args.suggestionsViewMode as string, commentsViewMode: args.commentsViewMode as string, fields: args.fields as string, signal: exec.signal }) } } catch (error) {
          if (error instanceof GoogleDriveError) return unavailable(error.message)
          throw error
        }
      },
    }),
    defineTool({
      name: 'gsheets_get_spreadsheet',
      description: 'Read Google Sheets spreadsheet metadata and sheet properties.',
      parameters: { spreadsheetId: { type: 'string', required: true, description: 'Google Sheets spreadsheet ID' }, ranges: { type: 'array', items: { type: 'string' }, description: 'Optional A1 ranges' }, includeGridData: { type: 'boolean', description: 'Include grid data' }, excludeTablesInBandedRanges: { type: 'boolean', description: 'Exclude tables in banded ranges' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, spreadsheetId: { type: 'string' }, title: { type: 'string' }, spreadsheetUrl: { type: 'string' }, locale: { type: 'string' }, timeZone: { type: 'string' }, sheetCount: { type: 'number' }, sheets: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { sheetId: { type: 'number' }, title: { type: 'string' }, index: { type: 'number' }, sheetType: { type: 'string' }, rowCount: { type: 'number' }, columnCount: { type: 'number' }, frozenRowCount: { type: 'number' } } } } } }, render: (_args, value) => value.found ? renderSpreadsheet(value) : text(value.reason ?? 'Google Sheets is not configured.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: `Google Sheet ${args.spreadsheetId ?? ''}`, kind: 'read' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Google Drive accessToken or refresh token credentials are not configured.')
        try { return { found: true, ...await client.getSpreadsheet(args.spreadsheetId as string, { ranges: args.ranges as string[], includeGridData: args.includeGridData as boolean, excludeTablesInBandedRanges: args.excludeTablesInBandedRanges as boolean, signal: exec.signal }) } } catch (error) {
          if (error instanceof GoogleDriveError) return unavailable(error.message)
          throw error
        }
      },
    }),
    defineTool({
      name: 'gsheets_get_values',
      description: 'Read values from one Google Sheets A1 range.',
      parameters: { spreadsheetId: { type: 'string', required: true, description: 'Google Sheets spreadsheet ID' }, range: { type: 'string', required: true, description: 'A1 notation range, e.g. Sheet1!A1:D20' }, valueRenderOption: { type: 'string', description: 'FORMATTED_VALUE, UNFORMATTED_VALUE, or FORMULA' }, dateTimeRenderOption: { type: 'string', description: 'SERIAL_NUMBER or FORMATTED_STRING' }, majorDimension: { type: 'string', description: 'ROWS or COLUMNS' }, maxRows: { type: 'integer', description: 'Maximum rows, default 1000' }, maxColumns: { type: 'integer', description: 'Maximum columns, default 100' }, maxCells: { type: 'integer', description: 'Maximum cells, default 100000' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { found: { type: 'boolean' }, reason: { type: 'string' }, spreadsheetId: { type: 'string' }, range: { type: 'string' }, majorDimension: { type: 'string' }, rowCount: { type: 'number' }, columnCount: { type: 'number' }, contentLength: { type: 'number' }, truncated: { type: 'boolean' }, values: { type: 'array', items: { type: 'array', items: { type: 'string' } } } } }, render: (_args, value) => value.found ? renderValues(value) : text(value.reason ?? 'Google Sheets is not configured.') },
      presentCall(args): ToolCallView { return { card: 'generic', title: `Google Sheet values ${args.range ?? ''}`, kind: 'read' } },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('Google Drive accessToken or refresh token credentials are not configured.')
        try { return { found: true, ...await client.getSheetValues(args.spreadsheetId as string, args.range as string, { valueRenderOption: args.valueRenderOption as string, dateTimeRenderOption: args.dateTimeRenderOption as string, majorDimension: args.majorDimension as string, maxRows: args.maxRows as number, maxColumns: args.maxColumns as number, maxCells: args.maxCells as number, signal: exec.signal }) } } catch (error) {
          if (error instanceof GoogleDriveError) return unavailable(error.message)
          throw error
        }
      },
    }),
  ]
}
