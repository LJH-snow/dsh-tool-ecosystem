/** Google Drive API client with injected fetch for testability. */

import { assertSafeUrl, EndpointSecurityError, normalizeBaseUrl, type LookupImpl } from './url-security.js'

export interface GoogleDriveClientOptions {
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

export class GoogleDriveError extends Error {
  constructor(
    message: string,
    public readonly code: number,
  ) {
    super(message)
    this.name = 'GoogleDriveError'
  }
}

interface TokenCache {
  token: string
  expiresAt: number
}

export interface DriveFileOwner {
  displayName: string
  emailAddress: string
}

export interface DriveFileInfo {
  id: string
  name: string
  mimeType: string
  kind: string
  description: string
  iconLink: string
  webViewLink: string
  webContentLink: string
  size: string
  starred: boolean
  trashed: boolean
  modifiedTime: string
  createdTime: string
  driveId: string
  parents: string[]
  owners: DriveFileOwner[]
}

export interface DrivePermissionInfo {
  id: string
  type: string
  kind: string
  role: string
  emailAddress: string
  displayName: string
  allowFileDiscovery: boolean
  expirationTime: string
  deleted: boolean
  permissionDetails: string
}

export interface DriveRevisionInfo {
  id: string
  mimeType: string
  modifiedTime: string
  keepForever: boolean
  published: boolean
  publishAuto: boolean
  publishedOutsideDomain: boolean
  size: string
  originalFilename: string
  md5Checksum: string
  downloadUrl: string
  exportLinks: string
}

export interface SharedDriveInfo {
  id: string
  name: string
  colorRgb: string
  backgroundImageLink: string
  createdTime: string
  hidden: boolean
  themeId: string
  capabilities: string
  restrictions: string
}

export interface GoogleDocTabInfo {
  tabId: string
  title: string
  index: number
  textLength: number
}

export interface GoogleDocumentInfo {
  documentId: string
  title: string
  revisionId: string
  text: string
  tabCount: number
  tabs: GoogleDocTabInfo[]
  contentLength: number
  truncated: boolean
}

export interface GoogleSheetPropertiesInfo {
  sheetId: number
  title: string
  index: number
  sheetType: string
  rowCount: number
  columnCount: number
  frozenRowCount: number
}

export interface GoogleSpreadsheetInfo {
  spreadsheetId: string
  title: string
  spreadsheetUrl: string
  locale: string
  timeZone: string
  sheetCount: number
  sheets: GoogleSheetPropertiesInfo[]
}

export interface GoogleSheetValuesInfo {
  spreadsheetId: string
  range: string
  majorDimension: string
  rowCount: number
  columnCount: number
  values: string[][]
  contentLength: number
  truncated: boolean
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

function toJson(value: unknown): string {
  try { return JSON.stringify(value ?? {}) } catch { return '{}' }
}

function clampBytes(value: number | undefined, fallback = 1024 * 1024, maximum = 10 * 1024 * 1024): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(maximum, Math.trunc(value as number)))
}

function clampCount(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(maximum, Math.trunc(value as number)))
}

function limitUtf8(value: string, maxBytes: number): { value: string; contentLength: number; truncated: boolean } {
  const source = Buffer.from(value, 'utf8')
  if (source.byteLength <= maxBytes) return { value, contentLength: source.byteLength, truncated: false }
  const limited = source.subarray(0, maxBytes).toString('utf8')
  return { value: limited, contentLength: Buffer.byteLength(limited, 'utf8'), truncated: true }
}

function mapOwners(value: unknown): DriveFileOwner[] {
  return asArray(value).map(item => {
    const record = asRecord(item)
    return {
      displayName: asString(record, 'displayName') || asString(record, 'display_name'),
      emailAddress: asString(record, 'emailAddress') || asString(record, 'email_address'),
    }
  })
}

function mapFile(data: unknown): DriveFileInfo {
  const r = asRecord(data)
  return {
    id: asString(r, 'id'),
    name: asString(r, 'name'),
    mimeType: asString(r, 'mimeType'),
    kind: asString(r, 'kind'),
    description: asString(r, 'description'),
    iconLink: asString(r, 'iconLink'),
    webViewLink: asString(r, 'webViewLink'),
    webContentLink: asString(r, 'webContentLink'),
    size: asString(r, 'size'),
    starred: asBoolean(r, 'starred'),
    trashed: asBoolean(r, 'trashed'),
    modifiedTime: asString(r, 'modifiedTime'),
    createdTime: asString(r, 'createdTime'),
    driveId: asString(r, 'driveId'),
    parents: asArray(r.parents).map(v => String(v)),
    owners: mapOwners(r.owners),
  }
}

function mapPermission(data: unknown): DrivePermissionInfo {
  const r = asRecord(data)
  return {
    id: asString(r, 'id'),
    type: asString(r, 'type'),
    kind: asString(r, 'kind'),
    role: asString(r, 'role'),
    emailAddress: asString(r, 'emailAddress'),
    displayName: asString(r, 'displayName'),
    allowFileDiscovery: asBoolean(r, 'allowFileDiscovery'),
    expirationTime: asString(r, 'expirationTime'),
    deleted: asBoolean(r, 'deleted'),
    permissionDetails: toJson(r.permissionDetails),
  }
}

function mapRevision(data: unknown): DriveRevisionInfo {
  const r = asRecord(data)
  return {
    id: asString(r, 'id'),
    mimeType: asString(r, 'mimeType'),
    modifiedTime: asString(r, 'modifiedTime'),
    keepForever: asBoolean(r, 'keepForever'),
    published: asBoolean(r, 'published'),
    publishAuto: asBoolean(r, 'publishAuto'),
    publishedOutsideDomain: asBoolean(r, 'publishedOutsideDomain'),
    size: asString(r, 'size'),
    originalFilename: asString(r, 'originalFilename'),
    md5Checksum: asString(r, 'md5Checksum'),
    downloadUrl: asString(r, 'downloadUrl'),
    exportLinks: toJson(r.exportLinks),
  }
}

function mapSharedDrive(data: unknown): SharedDriveInfo {
  const r = asRecord(data)
  return {
    id: asString(r, 'id'),
    name: asString(r, 'name'),
    colorRgb: asString(r, 'colorRgb'),
    backgroundImageLink: asString(r, 'backgroundImageLink'),
    createdTime: asString(r, 'createdTime'),
    hidden: asBoolean(r, 'hidden'),
    themeId: asString(r, 'themeId'),
    capabilities: toJson(r.capabilities),
    restrictions: toJson(r.restrictions),
  }
}

function mapSheetProperties(data: unknown): GoogleSheetPropertiesInfo {
  const r = asRecord(data)
  return {
    sheetId: asNumber(r, 'sheetId'),
    title: asString(r, 'title'),
    index: asNumber(r, 'index'),
    sheetType: asString(r, 'sheetType'),
    rowCount: asNumber(asRecord(r.gridProperties), 'rowCount'),
    columnCount: asNumber(asRecord(r.gridProperties), 'columnCount'),
    frozenRowCount: asNumber(asRecord(r.gridProperties), 'frozenRowCount'),
  }
}

function extractTextFromElement(element: unknown): string {
  const r = asRecord(element)
  const textRun = asRecord(r.textRun)
  if (Object.keys(textRun).length) return asString(textRun, 'content')

  const paragraph = asRecord(r.paragraph)
  if (Object.keys(paragraph).length) {
    return asArray(paragraph.elements).map(extractTextFromElement).join('') + '\n'
  }

  const table = asRecord(r.table)
  if (Object.keys(table).length) {
    return asArray(table.tableRows).map(row => {
      const rowRecord = asRecord(row)
      return asArray(rowRecord.tableCells).map(cell => {
        const cellRecord = asRecord(cell)
        return asArray(cellRecord.content).map(extractTextFromElement).join('').trimEnd()
      }).join('\t')
    }).join('\n') + '\n'
  }

  const tableCell = asRecord(r.tableCell)
  if (Object.keys(tableCell).length) {
    return asArray(tableCell.content).map(extractTextFromElement).join('')
  }

  return ''
}

function extractDocumentContent(data: unknown): { text: string; tabs: GoogleDocTabInfo[] } {
  const r = asRecord(data)
  const tabs = asArray(r.tabs)
  if (tabs.length) {
    const mapped = tabs.map(tab => {
      const tabRecord = asRecord(tab)
      const tabProps = asRecord(tabRecord.tabProperties)
      const docTab = asRecord(tabRecord.documentTab)
      const body = asRecord(docTab.body)
      const text = asArray(body.content).map(extractTextFromElement).join('').trim()
      return {
        tabId: asString(tabProps, 'tabId'),
        title: asString(tabProps, 'title'),
        index: asNumber(tabProps, 'index'),
        textLength: text.length,
        text,
      }
    })
    return {
      text: mapped.map(t => t.text).filter(Boolean).join('\n').trim(),
      tabs: mapped.map(({ text, ...rest }) => rest),
    }
  }

  const body = asRecord(r.body)
  const text = asArray(body.content).map(extractTextFromElement).join('').trim()
  return { text, tabs: [] }
}

function mapSpreadsheet(data: unknown): GoogleSpreadsheetInfo {
  const r = asRecord(data)
  const props = asRecord(r.properties)
  return {
    spreadsheetId: asString(r, 'spreadsheetId') || asString(r, 'spreadsheet_id'),
    title: asString(props, 'title') || asString(r, 'title'),
    spreadsheetUrl: asString(r, 'spreadsheetUrl'),
    locale: asString(props, 'locale'),
    timeZone: asString(props, 'timeZone'),
    sheetCount: asArray(r.sheets).length,
    sheets: asArray(r.sheets).map(item => mapSheetProperties(asRecord(item).properties ?? item)),
  }
}

function mapSheetValues(data: unknown, spreadsheetId: string, fallbackRange = '', options: { maxRows?: number; maxColumns?: number; maxCells?: number } = {}): GoogleSheetValuesInfo {
  const r = asRecord(data)
  const maxRows = clampCount(options.maxRows, 1000, 10000)
  const maxColumns = clampCount(options.maxColumns, 100, 1000)
  const maxCells = clampCount(options.maxCells, 100000, 1000000)
  const rawValues = asArray(r.values)
  let truncated = rawValues.length > maxRows
  let remaining = maxCells
  const values: string[][] = []
  for (const row of rawValues.slice(0, maxRows)) {
    const rawRow = asArray(row)
    if (rawRow.length > maxColumns || rawRow.length > remaining) truncated = true
    const limitedRow = rawRow.slice(0, Math.min(maxColumns, remaining)).map(cell => cell == null ? '' : String(cell))
    values.push(limitedRow)
    remaining -= limitedRow.length
    if (remaining <= 0 && values.length < rawValues.length) {
      truncated = true
      break
    }
  }
  return {
    spreadsheetId,
    range: asString(r, 'range') || fallbackRange,
    majorDimension: asString(r, 'majorDimension') || 'ROWS',
    rowCount: values.length,
    columnCount: values.reduce((max, row) => Math.max(max, row.length), 0),
    values,
    contentLength: values.reduce((total, row) => total + row.length, 0),
    truncated,
  }
}

export class GoogleDriveClient {
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

  constructor(options: GoogleDriveClientOptions = {}) {
    this.staticToken = options.accessToken ?? ''
    this.clientId = options.clientId ?? ''
    this.clientSecret = options.clientSecret ?? ''
    this.refreshToken = options.refreshToken ?? ''
    try {
      this.baseUrl = normalizeBaseUrl(options.baseUrl, 'https://www.googleapis.com/drive/v3')
    } catch (error) {
      if (error instanceof EndpointSecurityError) throw new GoogleDriveError(error.message, 400)
      throw error
    }
    try {
      this.tokenUrl = normalizeBaseUrl(options.tokenUrl, 'https://oauth2.googleapis.com/token')
    } catch (error) {
      if (error instanceof EndpointSecurityError) throw new GoogleDriveError(error.message, 400)
      throw error
    }
    this.timeoutMs = options.timeoutMs ?? 15000
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.lookupImpl = options.lookupImpl
  }

  hasCredentials(): boolean {
    return Boolean(this.staticToken || (this.clientId && this.clientSecret && this.refreshToken))
  }

  private buildUrl(urlOrPath: string, params?: Record<string, string | boolean | number | string[] | undefined>): string {
    let url = /^https?:\/\//.test(urlOrPath) ? urlOrPath : `${this.baseUrl}${urlOrPath}`
    if (params) {
      const search = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === '') continue
        if (Array.isArray(value)) {
          for (const item of value) search.append(key, String(item))
        } else {
          search.append(key, String(value))
        }
      }
      const qs = search.toString()
      if (qs) url += `${url.includes('?') ? '&' : '?'}${qs}`
    }
    return url
  }

  private async getAccessToken(signal?: AbortSignal): Promise<string> {
    if (this.staticToken) return this.staticToken
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new GoogleDriveError('Google Drive credentials not configured.', 401)
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
        if (error instanceof EndpointSecurityError) throw new GoogleDriveError(error.message, 400)
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
        throw new GoogleDriveError(`Google token endpoint returned HTTP ${response.status}: ${text}`, response.status)
      }
      const json = await response.json() as Record<string, unknown>
      const error = typeof json.error === 'string' ? json.error : ''
      if (error) throw new GoogleDriveError(`Google token endpoint error: ${error}`, 401)
      const token = asString(json, 'access_token')
      const expiresIn = asNumber(json, 'expires_in')
      if (!token) throw new GoogleDriveError('Failed to obtain Google access token.', 401)
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
      body?: unknown
      params?: Record<string, string | boolean | number | string[] | undefined>
      auth?: boolean
      responseType?: 'json' | 'text' | 'arrayBuffer'
      signal?: AbortSignal
    } = {},
  ): Promise<unknown> {
    const { body, params, auth = true, responseType = 'json', signal } = options
    const url = this.buildUrl(urlOrPath, params)
    const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' }
    if (auth) headers.authorization = `Bearer ${await this.getAccessToken(signal)}`
    const controller = new AbortController()
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
    const timer = this.timeoutMs > 0 ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined
    try {
      try {
        await assertSafeUrl(new URL(url), this.lookupImpl)
      } catch (error) {
        if (error instanceof EndpointSecurityError) throw new GoogleDriveError(error.message, 400)
        throw error
      }
      const response = await this.fetchImpl(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: combined,
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new GoogleDriveError(`Google Drive API ${method} ${urlOrPath} returned HTTP ${response.status}: ${text}`, response.status)
      }
      if (responseType === 'text') return await response.text()
      if (responseType === 'arrayBuffer') return await response.arrayBuffer()
      return await response.json()
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async authTest(signal?: AbortSignal): Promise<{ ok: boolean; authMethod: string }> {
    await this.getAccessToken(signal)
    const credentialKind = this.staticToken ? 'access' : 'refresh'
    return { ok: true, authMethod: credentialKind + '_token' }
  }

  async listFiles(options: {
    query?: string
    pageSize?: number
    pageToken?: string
    orderBy?: string
    spaces?: string
    corpora?: string
    driveId?: string
    includeItemsFromAllDrives?: boolean
    supportsAllDrives?: boolean
    signal?: AbortSignal
  } = {}): Promise<{ items: DriveFileInfo[]; nextPageToken: string; incompleteSearch: boolean }> {
    const data = asRecord(await this.request('GET', '/files', {
      params: {
        q: options.query,
        pageSize: options.pageSize,
        pageToken: options.pageToken,
        orderBy: options.orderBy,
        spaces: options.spaces,
        corpora: options.corpora,
        driveId: options.driveId,
        includeItemsFromAllDrives: options.includeItemsFromAllDrives,
        supportsAllDrives: options.supportsAllDrives,
        fields: 'nextPageToken, incompleteSearch, files(id,name,mimeType,kind,description,iconLink,webViewLink,webContentLink,size,starred,trashed,modifiedTime,createdTime,driveId,parents,owners(displayName,emailAddress))',
      },
      signal: options.signal,
    }))
    return {
      items: asArray(data.files).map(mapFile),
      nextPageToken: asString(data, 'nextPageToken'),
      incompleteSearch: asBoolean(data, 'incompleteSearch'),
    }
  }

  async getFile(fileId: string, options: {
    fields?: string
    supportsAllDrives?: boolean
    signal?: AbortSignal
  } = {}): Promise<DriveFileInfo> {
    const data = await this.request('GET', `/files/${encodeURIComponent(fileId)}`, {
      params: {
        fields: options.fields ?? 'id,name,mimeType,kind,description,iconLink,webViewLink,webContentLink,size,starred,trashed,modifiedTime,createdTime,driveId,parents,owners(displayName,emailAddress))',
        supportsAllDrives: options.supportsAllDrives,
      },
      signal: options.signal,
    })
    return mapFile(data)
  }

  async listPermissions(fileId: string, options: {
    pageSize?: number
    pageToken?: string
    supportsAllDrives?: boolean
    useDomainAdminAccess?: boolean
    includePermissionsForView?: string
    fields?: string
    signal?: AbortSignal
  } = {}): Promise<{ fileId: string; items: DrivePermissionInfo[]; nextPageToken: string }> {
    const data = asRecord(await this.request('GET', '/files/' + encodeURIComponent(fileId) + '/permissions', {
      params: {
        pageSize: options.pageSize,
        pageToken: options.pageToken,
        supportsAllDrives: options.supportsAllDrives,
        useDomainAdminAccess: options.useDomainAdminAccess,
        includePermissionsForView: options.includePermissionsForView,
        fields: options.fields ?? 'nextPageToken,permissions(id,type,kind,role,emailAddress,displayName,allowFileDiscovery,expirationTime,deleted,permissionDetails)',
      },
      signal: options.signal,
    }))
    return { fileId, items: asArray(data.permissions).map(mapPermission), nextPageToken: asString(data, 'nextPageToken') }
  }

  async listRevisions(fileId: string, options: {
    pageSize?: number
    pageToken?: string
    fields?: string
    signal?: AbortSignal
  } = {}): Promise<{ fileId: string; items: DriveRevisionInfo[]; nextPageToken: string }> {
    const data = asRecord(await this.request('GET', '/files/' + encodeURIComponent(fileId) + '/revisions', {
      params: {
        pageSize: options.pageSize,
        pageToken: options.pageToken,
        fields: options.fields ?? 'nextPageToken,revisions(id,mimeType,modifiedTime,keepForever,published,publishAuto,publishedOutsideDomain,size,originalFilename,md5Checksum,downloadUrl,exportLinks)',
      },
      signal: options.signal,
    }))
    return { fileId, items: asArray(data.revisions).map(mapRevision), nextPageToken: asString(data, 'nextPageToken') }
  }

  async exportFile(fileId: string, options: {
    exportMimeType?: string
    responseEncoding?: 'text' | 'base64'
    supportsAllDrives?: boolean
    maxBytes?: number
    signal?: AbortSignal
  } = {}): Promise<{ fileId: string; exportMimeType: string; encoding: string; content: string; contentLength: number; truncated: boolean }> {
    const exportMimeType = options.exportMimeType ?? 'text/plain'
    const responseEncoding = options.responseEncoding ?? 'text'
    const raw = await this.request('GET', `/files/${encodeURIComponent(fileId)}/export`, {
      params: {
        mimeType: exportMimeType,
        supportsAllDrives: options.supportsAllDrives,
      },
      responseType: responseEncoding === 'base64' ? 'arrayBuffer' : 'text',
      signal: options.signal,
    })
    const maxBytes = clampBytes(options.maxBytes)
    let content: string
    let truncated = false
    if (responseEncoding === 'base64') {
      const bytes = Buffer.from(raw as ArrayBuffer)
      truncated = bytes.byteLength > maxBytes
      content = bytes.subarray(0, maxBytes).toString('base64')
    } else {
      const limited = limitUtf8(String(raw), maxBytes)
      content = limited.value
      truncated = limited.truncated
    }
    return { fileId, exportMimeType, encoding: responseEncoding, content, contentLength: content.length, truncated }
  }

  async listSharedDrives(options: {
    pageSize?: number
    pageToken?: string
    query?: string
    useDomainAdminAccess?: boolean
    signal?: AbortSignal
  } = {}): Promise<{ items: SharedDriveInfo[]; nextPageToken: string; incompleteSearch: boolean }> {
    const data = asRecord(await this.request('GET', '/drives', {
      params: {
        pageSize: options.pageSize,
        pageToken: options.pageToken,
        q: options.query,
        useDomainAdminAccess: options.useDomainAdminAccess,
        fields: 'nextPageToken, incompleteSearch, drives(id,name,colorRgb,backgroundImageLink,createdTime,hidden,themeId,capabilities,restrictions)',
      },
      signal: options.signal,
    }))
    const rawItems = asArray(data.drives).length ? asArray(data.drives) : asArray(data.items)
    return {
      items: rawItems.map(mapSharedDrive),
      nextPageToken: asString(data, 'nextPageToken'),
      incompleteSearch: asBoolean(data, 'incompleteSearch'),
    }
  }

  async getSharedDrive(driveId: string, options: {
    useDomainAdminAccess?: boolean
    signal?: AbortSignal
  } = {}): Promise<SharedDriveInfo> {
    const data = await this.request('GET', `/drives/${encodeURIComponent(driveId)}`, {
      params: {
        useDomainAdminAccess: options.useDomainAdminAccess,
      },
      signal: options.signal,
    })
    return mapSharedDrive(data)
  }

  async getDocument(documentId: string, options: {
    includeTabsContent?: boolean
    suggestionsViewMode?: string
    commentsViewMode?: string
    fields?: string
    maxBytes?: number
    maxTabs?: number
    signal?: AbortSignal
  } = {}): Promise<GoogleDocumentInfo> {
    const data = await this.request('GET', `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, {
      params: {
        includeTabsContent: options.includeTabsContent !== false,
        suggestionsViewMode: options.suggestionsViewMode,
        commentsViewMode: options.commentsViewMode,
        fields: options.fields ?? 'documentId,title,revisionId,tabs(tabProperties(tabId,title,index),documentTab(body(content(paragraph(elements(textRun(content))),table(tableRows(tableCells(content(paragraph(elements(textRun(content)))))))))))',
      },
      signal: options.signal,
    })
    const extracted = extractDocumentContent(data)
    const limitedText = limitUtf8(extracted.text, clampBytes(options.maxBytes))
    const maxTabs = clampCount(options.maxTabs, 100, 1000)
    const tabs = extracted.tabs.slice(0, maxTabs)
    const r = asRecord(data)
    return {
      documentId: asString(r, 'documentId') || documentId,
      title: asString(r, 'title'),
      revisionId: asString(r, 'revisionId'),
      text: limitedText.value,
      tabCount: extracted.tabs.length,
      tabs,
      contentLength: limitedText.contentLength,
      truncated: limitedText.truncated || extracted.tabs.length > tabs.length,
    }
  }

  async getSpreadsheet(spreadsheetId: string, options: {
    ranges?: string[]
    includeGridData?: boolean
    excludeTablesInBandedRanges?: boolean
    signal?: AbortSignal
  } = {}): Promise<GoogleSpreadsheetInfo> {
    const data = await this.request('GET', `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`, {
      params: {
        ranges: options.ranges,
        includeGridData: options.includeGridData,
        excludeTablesInBandedRanges: options.excludeTablesInBandedRanges,
      },
      signal: options.signal,
    })
    return mapSpreadsheet(data)
  }

  async getSheetValues(spreadsheetId: string, range: string, options: {
    valueRenderOption?: string
    dateTimeRenderOption?: string
    majorDimension?: string
    maxRows?: number
    maxColumns?: number
    maxCells?: number
    signal?: AbortSignal
  } = {}): Promise<GoogleSheetValuesInfo> {
    const data = await this.request('GET', `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`, {
      params: {
        valueRenderOption: options.valueRenderOption,
        dateTimeRenderOption: options.dateTimeRenderOption,
        majorDimension: options.majorDimension,
      },
      signal: options.signal,
    })
    return mapSheetValues(data, spreadsheetId, range, options)
  }
}
