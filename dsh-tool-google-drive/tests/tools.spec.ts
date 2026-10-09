import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { GoogleDriveClient } from '../src/client.ts'
import { createTools } from '../src/index.ts'

/** Deterministic DNS so the suite never depends on resolution. */
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 as const }]

const testToken = process.env.GDRIVE_TEST_TOKEN ?? `gdrive-test-${randomUUID()}`
const refreshedToken = process.env.GDRIVE_TEST_REFRESHED ?? `gdrive-refreshed-${randomUUID()}`


function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function exec(): ToolRunContext {
  return { signal: new AbortController().signal } as unknown as ToolRunContext
}

function tools(client = new GoogleDriveClient({ lookupImpl: publicLookup, fetchImpl: globalThis.fetch })) {
  return Object.fromEntries(createTools(client).map(tool => [tool.name, tool]))
}

function expectValidOutput(tool: ReturnType<typeof createTools>[number], value: unknown) {
  expect(validateJsonSchemaValue(tool.output.schema as any, value as any, 'value')).toEqual([])
}

describe('tool definitions', () => {
  it('registers the Google Drive tool set', () => {
    expect(Object.keys(tools()).sort()).toEqual([
      'gdocs_get_document',
      'gdrive_auth_test',
      'gdrive_export_file',
      'gdrive_get_file',
      'gdrive_get_shared_drive',
      'gdrive_list_files',
      'gdrive_list_permissions',
      'gdrive_list_revisions',
      'gdrive_list_shared_drives',
      'gsheets_get_spreadsheet',
      'gsheets_get_values',
    ])
  })

  it('auth test takes no model-visible parameters', () => {
    expect(tools().gdrive_auth_test.parameters).toEqual({ type: 'object', properties: {} })
  })

  it('returns business values without credentials', async () => {
    const map = tools()
    expect(await map.gdrive_auth_test.execute({}, exec())).toMatchObject({ ok: false })
    expect(await map.gdrive_list_files.execute({}, exec())).toMatchObject({ found: false })
    expect(await map.gdrive_get_file.execute({ fileId: 'file_1' }, exec())).toMatchObject({ found: false })
    expect(await map.gdrive_list_permissions.execute({ fileId: 'file_1' }, exec())).toMatchObject({ found: false })
    expect(await map.gdrive_list_revisions.execute({ fileId: 'file_1' }, exec())).toMatchObject({ found: false })
    expect(await map.gdrive_export_file.execute({ fileId: 'doc_1' }, exec())).toMatchObject({ found: false })
    expect(await map.gdrive_list_shared_drives.execute({}, exec())).toMatchObject({ found: false })
    expect(await map.gdrive_get_shared_drive.execute({ driveId: 'drive_1' }, exec())).toMatchObject({ found: false })
    expect(await map.gdocs_get_document.execute({ documentId: 'doc_1' }, exec())).toMatchObject({ found: false })
    expect(await map.gsheets_get_spreadsheet.execute({ spreadsheetId: 'sheet_1' }, exec())).toMatchObject({ found: false })
    expect(await map.gsheets_get_values.execute({ spreadsheetId: 'sheet_1', range: 'Sheet1!A1:B2' }, exec())).toMatchObject({ found: false })
  })

  it('validates and renders successful list output', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      files: [{ id: 'file_1', name: 'Report', mimeType: 'application/pdf', modifiedTime: '2026-08-01T00:00:00Z' }],
      nextPageToken: '',
    }))
    const map = tools(new GoogleDriveClient({ lookupImpl: publicLookup, accessToken: testToken, fetchImpl }))
    const result = await map.gdrive_list_files.execute({ query: "name contains 'Report'" }, exec())

    expect(result).toMatchObject({ found: true })
    expectValidOutput(map.gdrive_list_files, result)
    expect((map.gdrive_list_files.output.render({}, result as any) as any[])[0]?.text).toContain('Report')
  })

  it('executes auth and metadata tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: refreshedToken, expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'file_1', name: 'Report', mimeType: 'application/pdf', description: 'Quarterly report',
        webViewLink: 'https://drive.google.com/file/d/file_1/view', parents: ['root'], owners: [],
      }))
    const map = tools(new GoogleDriveClient({ lookupImpl: publicLookup, clientId: 'cid', clientSecret: 'csecret', refreshToken: 'rtok', fetchImpl }))

    const auth = await map.gdrive_auth_test.execute({}, exec())
    expect(auth).toMatchObject({ ok: true, authMethod: 'refresh_token' })
    const file = await map.gdrive_get_file.execute({ fileId: 'file_1' }, exec())
    expect(file).toMatchObject({ found: true, id: 'file_1', name: 'Report' })
    expectValidOutput(map.gdrive_get_file, file)
    expect((map.gdrive_get_file.output.render({}, file as any) as any[])[0]?.text).toContain('Quarterly report')
    expect(fetchImpl.mock.calls.length).toBe(2)
  })

  it('executes permission and revision listings with pagination and rendering', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ permissions: [{ id: 'perm_1', type: 'user', role: 'reader', displayName: 'Alice', emailAddress: 'alice@example.com', deleted: false }], nextPageToken: 'perm_next' }))
      .mockResolvedValueOnce(jsonResponse({ revisions: [{ id: 'rev_1', mimeType: 'application/pdf', modifiedTime: '2026-08-02T00:00:00Z', keepForever: true, size: '1234', originalFilename: 'report.pdf' }], nextPageToken: 'rev_next' }))
    const map = tools(new GoogleDriveClient({ lookupImpl: publicLookup, accessToken: testToken, fetchImpl }))

    const permissions = await map.gdrive_list_permissions.execute({ fileId: 'file_1', pageSize: 10, pageToken: 'perm_prev' }, exec())
    const revisions = await map.gdrive_list_revisions.execute({ fileId: 'file_1', pageSize: 5, pageToken: 'rev_prev' }, exec())
    expect(permissions).toMatchObject({ found: true, fileId: 'file_1', nextPageToken: 'perm_next', items: [{ role: 'reader', displayName: 'Alice' }] })
    expect(revisions).toMatchObject({ found: true, fileId: 'file_1', nextPageToken: 'rev_next', items: [{ id: 'rev_1', keepForever: true }] })
    expectValidOutput(map.gdrive_list_permissions, permissions)
    expectValidOutput(map.gdrive_list_revisions, revisions)
    expect((map.gdrive_list_permissions.output.render({}, permissions as any) as any[])[0]?.text).toContain('Alice')
    expect((map.gdrive_list_revisions.output.render({}, revisions as any) as any[])[0]?.text).toContain('rev_1')
    expect(String(fetchImpl.mock.calls[0][0])).toContain('pageToken=perm_prev')
    expect(String(fetchImpl.mock.calls[1][0])).toContain('pageToken=rev_prev')
    expect(map.gdrive_list_permissions.presentCall!({ fileId: 'file_1' })).toMatchObject({ card: 'generic', kind: 'search' })
    expect(map.gdrive_list_revisions.presentCall!({ fileId: 'file_1' })).toMatchObject({ card: 'generic', kind: 'search' })
  })

  it('executes export, shared drive, docs, and sheets tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('hello export', { status: 200, headers: { 'content-type': 'text/plain' } }))
      .mockResolvedValueOnce(jsonResponse({ drives: [{ id: 'drive_1', name: 'Team Drive', createdTime: '2026-08-01T00:00:00Z' }], nextPageToken: '' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'drive_1', name: 'Team Drive', createdTime: '2026-08-01T00:00:00Z' }))
      .mockResolvedValueOnce(jsonResponse({
        documentId: 'doc_1', title: 'Doc Title', revisionId: 'rev_1',
        tabs: [{ tabProperties: { tabId: 'tab_1', title: 'Tab 1', index: 0 }, documentTab: { body: { content: [{ paragraph: { elements: [{ textRun: { content: 'Hello doc\n' } }] } }] } } }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        spreadsheetId: 'sheet_1', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_1',
        properties: { title: 'Budget', locale: 'en_US', timeZone: 'Etc/UTC' },
        sheets: [{ properties: { sheetId: 0, title: 'Sheet1', index: 0, sheetType: 'GRID', gridProperties: { rowCount: 100, columnCount: 20, frozenRowCount: 1 } } }],
      }))
      .mockResolvedValueOnce(jsonResponse({ range: 'Sheet1!A1:B2', majorDimension: 'ROWS', values: [['Name', 'Cost'], ['Server', '100']] }))
    const map = tools(new GoogleDriveClient({ lookupImpl: publicLookup, accessToken: testToken, fetchImpl }))

    const exported = await map.gdrive_export_file.execute({ fileId: 'doc_1' }, exec())
    expect(exported).toMatchObject({ found: true, encoding: 'text', content: 'hello export', contentLength: 12 })
    expectValidOutput(map.gdrive_export_file, exported)
    const drives = await map.gdrive_list_shared_drives.execute({}, exec())
    expect(drives).toMatchObject({ found: true })
    expect((drives as any).items[0]).toMatchObject({ id: 'drive_1', name: 'Team Drive' })
    expectValidOutput(map.gdrive_list_shared_drives, drives)
    const drive = await map.gdrive_get_shared_drive.execute({ driveId: 'drive_1' }, exec())
    expect(drive).toMatchObject({ found: true, id: 'drive_1', name: 'Team Drive' })
    expectValidOutput(map.gdrive_get_shared_drive, drive)
    const doc = await map.gdocs_get_document.execute({ documentId: 'doc_1' }, exec())
    expect(doc).toMatchObject({ found: true, documentId: 'doc_1', title: 'Doc Title', text: 'Hello doc' })
    expectValidOutput(map.gdocs_get_document, doc)
    expect((map.gdocs_get_document.output.render({}, doc as any) as any[])[0]?.text).toContain('Hello doc')
    const spreadsheet = await map.gsheets_get_spreadsheet.execute({ spreadsheetId: 'sheet_1' }, exec())
    expect(spreadsheet).toMatchObject({ found: true, spreadsheetId: 'sheet_1', title: 'Budget' })
    expectValidOutput(map.gsheets_get_spreadsheet, spreadsheet)
    const values = await map.gsheets_get_values.execute({ spreadsheetId: 'sheet_1', range: 'Sheet1!A1:B2' }, exec())
    expect(values).toMatchObject({ found: true, rowCount: 2, columnCount: 2 })
    expectValidOutput(map.gsheets_get_values, values)
    expect((map.gsheets_get_values.output.render({}, values as any) as any[])[0]?.text).toContain('Server')
    expect(fetchImpl.mock.calls.length).toBe(6)
  })
})
