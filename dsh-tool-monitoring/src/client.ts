/** Minimal Prometheus, Alertmanager, Loki, and Grafana HTTP clients with injected fetch for testability. */

export interface MonitoringClientOptions {
  /** Prometheus HTTP API base URL, default http://localhost:9090. */
  prometheusBaseUrl?: string
  /** Prometheus bearer token. Used directly when the value already starts with "Bearer ". */
  prometheusToken?: string
  prometheusUsername?: string
  prometheusPassword?: string
  /** Alertmanager HTTP API base URL, default http://localhost:9093. */
  alertmanagerBaseUrl?: string
  /** Alertmanager bearer token. Used directly when the value already starts with "Bearer ". */
  alertmanagerToken?: string
  alertmanagerUsername?: string
  alertmanagerPassword?: string
  /** Loki HTTP API base URL, default http://localhost:3100. */
  lokiBaseUrl?: string
  /** Loki bearer token. Used directly when the value already starts with "Bearer ". */
  lokiToken?: string
  lokiUsername?: string
  lokiPassword?: string
  /** Optional Loki tenant ID for multi-tenant deployments. */
  lokiTenantId?: string
  /** Grafana HTTP API base URL, default http://localhost:3000. */
  grafanaBaseUrl?: string
  /** Grafana bearer token. Used directly when the value already starts with "Bearer ". */
  grafanaToken?: string
  grafanaUsername?: string
  grafanaPassword?: string
  /** Request timeout in milliseconds. 0 disables the timeout. */
  timeoutMs?: number
  /** Permit non-local HTTP endpoints. Local HTTP (localhost, .local, and single-label service names) remains available for development. */
  allowInsecureHttp?: boolean
  /** Maximum UTF-8 bytes returned in raw JSON/YAML output fields. */
  maxOutputBytes?: number
  /** Write tools stay disabled unless this is true. */
  allowWrite?: boolean
  fetchImpl?: typeof fetch
}

export interface PrometheusQueryData {
  connected: boolean
  resultType: string
  seriesCount: number
  resultJson: string
}

export interface PrometheusTargetItem {
  scrapeUrl: string
  health: string
  lastError: string
  labelsJson: string
}

export interface PrometheusTargetData {
  connected: boolean
  activeCount: number
  droppedCount: number
  items: PrometheusTargetItem[]
}

export interface PrometheusAlertItem {
  state: string
  value: string
  activeAt: string
  labelsJson: string
  annotationsJson: string
}

export interface PrometheusRuleItem {
  name: string
  type: string
  health: string
  query: string
  duration: string
  labelsJson: string
  activeAlertCount: number
}

export interface PrometheusSeriesItem {
  labelsJson: string
}

export interface PrometheusLabelData {
  connected: boolean
  items: string[]
}

export interface PrometheusTsdbData {
  connected: boolean
  headSeriesCount: number
  statsJson: string
}

export interface PrometheusBuildInfoData {
  connected: boolean
  version: string
  revision: string
  branch: string
  goVersion: string
  buildUser: string
  buildDate: string
  infoJson: string
}

export interface PrometheusRuntimeInfoData {
  connected: boolean
  startTime: string
  cwd: string
  reloadConfigSuccess: boolean
  lastConfigTime: string
  goroutineCount: number
  timeSeriesCount: number
  runtimeJson: string
}

export interface PrometheusFlagsData {
  connected: boolean
  count: number
  flagsJson: string
}

export interface PrometheusMetadataItem {
  metric: string
  type: string
  help: string
  unit: string
}

export interface PrometheusMetadataData {
  connected: boolean
  count: number
  items: PrometheusMetadataItem[]
  metadataJson: string
}

export interface PrometheusAlertmanagerItem {
  url: string
  state: string
  labelsJson: string
}

export interface PrometheusAlertmanagersData {
  connected: boolean
  activeCount: number
  droppedCount: number
  activeItems: PrometheusAlertmanagerItem[]
  droppedItems: PrometheusAlertmanagerItem[]
}

export interface PrometheusConfigData {
  connected: boolean
  configYaml: string
  length: number
}

export interface LokiQueryData {
  connected: boolean
  resultType: string
  seriesCount: number
  entryCount: number
  resultJson: string
}

export interface LokiLabelData {
  connected: boolean
  items: string[]
}

export interface LokiSeriesItem {
  labelsJson: string
}

export interface LokiIndexStats {
  connected: boolean
  streams: number
  chunks: number
  entries: number
  bytes: number
  statsJson: string
}

export interface LokiStatusData {
  connected: boolean
  version: string
  revision: string
  branch: string
  buildDate: string
  goVersion: string
  statusJson: string
}

export interface LokiRuleGroupData {
  connected: boolean
  ruleGroupsYaml: string
}

export interface LokiRuleItem {
  group: string
  file: string
  name: string
  type: string
  health: string
  lastError: string
  query: string
  duration: string
  labelsJson: string
  annotationsJson: string
  activeAlertCount: number
}

export interface LokiAlertItem {
  state: string
  value: string
  activeAt: string
  labelsJson: string
  annotationsJson: string
}

export interface LokiVolumeData {
  connected: boolean
  resultType: string
  seriesCount: number
  totalBytes: number
  resultJson: string
}

export interface LokiPatternItem {
  pattern: string
  sampleCount: number
  totalCount: number
  samplesJson: string
}

export interface LokiDetectedFieldItem {
  label: string
  type: string
  cardinality: number
  parsersJson: string
  jsonPath: string
}

export interface GrafanaHealthData {
  connected: boolean
  database: string
  version: string
  commit: string
  statusJson: string
}

export interface GrafanaDatasourceItem {
  id: number
  uid: string
  name: string
  type: string
  url: string
  access: string
  isDefault: boolean
  basicAuth: boolean
  withCredentials: boolean
  database: string
  user: string
  settingsJson?: string
}

export interface GrafanaDashboardSummaryItem {
  id: number
  uid: string
  title: string
  url: string
  type: string
  tags: string[]
  isStarred: boolean
  folderUid: string
  folderTitle: string
}

export interface GrafanaDashboardData {
  connected: boolean
  uid: string
  title: string
  url: string
  panelCount: number
  dashboardJson: string
  metaJson: string
}

export interface GrafanaFolderItem {
  id: number
  uid: string
  title: string
  url: string
}

export interface GrafanaAnnotationItem {
  id: number
  alertId: number
  dashboardUid: string
  panelId: number
  userName: string
  newState: string
  prevState: string
  time: number
  timeEnd: number
  text: string
  tagsJson: string
  dataJson: string
}

export interface GrafanaAlertInstanceItem {
  fingerprint: string
  startsAt: string
  endsAt: string
  statusJson: string
  labelsJson: string
  annotationsJson: string
  receiversJson: string
}

export interface GrafanaAlertRuleItem {
  uid: string
  title: string
  folderUid: string
  namespaceUid: string
  dashboardUid: string
  panelId: number
  ruleGroup: string
  condition: string
  dataJson: string
  noDataState: string
  execErrState: string
  duration: string
  intervalSeconds: number
  paused: boolean
  updated: string
  version: number
  labelsJson: string
  annotationsJson: string
  ruleJson: string
}

export interface GrafanaContactPointItem {
  uid: string
  name: string
  type: string
  settingsJson: string
  disableResolveMessage: boolean
}

export interface GrafanaNotificationPolicyData {
  connected: boolean
  receiver: string
  groupByJson: string
  groupWait: string
  groupInterval: string
  repeatInterval: string
  policyJson: string
}

export interface GrafanaTeamItem {
  id: number
  orgId: number
  name: string
  email: string
  avatarUrl: string
  memberCount: number
  permission: number
  created: string
  updated: string
}

export interface GrafanaTeamData {
  connected: boolean
  totalCount: number
  page: number
  perPage: number
  items: GrafanaTeamItem[]
}

export interface GrafanaTeamMemberItem {
  orgId: number
  teamId: number
  userId: number
  email: string
  login: string
  name: string
  avatarUrl: string
}

export interface GrafanaOrgUserItem {
  orgId: number
  userId: number
  email: string
  login: string
  name: string
  role: string
  isExternal: boolean
  lastSeenAt: string
  lastSeenAtAge: string
}

export interface GrafanaOrgItem {
  id: number
  name: string
  createdAt: string
  updatedAt: string
}

export interface GrafanaOrgListData {
  connected: boolean
  totalCount: number
  items: GrafanaOrgItem[]
}

export interface GrafanaOrgDetailData {
  connected: boolean
  id: number
  name: string
  addressJson: string
  createdAt: string
  updatedAt: string
  orgJson: string
}

export interface GrafanaServiceAccountItem {
  id: number
  name: string
  login: string
  orgId: number
  isDisabled: boolean
  role: string
  tokens: number
  avatarUrl: string
  accessControlJson: string
}

export interface GrafanaServiceAccountData {
  connected: boolean
  totalCount: number
  page: number
  perPage: number
  items: GrafanaServiceAccountItem[]
}

export interface GrafanaServiceAccountTokenItem {
  id: number
  name: string
  role: string
  created: string
  expiration: string
  secondsUntilExpiration: number
  hasExpired: boolean
}

export interface GrafanaOrgQuotaItem {
  orgId: number
  target: string
  limit: number
  used: number
}

export interface GrafanaFolderPermissionItem {
  id: number
  folderId: number
  role: string
  permission: number
  permissionName: string
  userId: number
  userLogin: string
  userEmail: string
  teamId: number
  team: string
}

export interface GrafanaDatasourcePermissionItem {
  id: number
  roleName: string
  isManaged: boolean
  isInherited: boolean
  isServiceAccount: boolean
  userId: number
  userLogin: string
  userAvatarUrl: string
  teamId: number
  team: string
  teamAvatarUrl: string
  builtInRole: string
  actionsJson: string
  permission: string
}

export interface GrafanaDashboardPermissionItem {
  id: number
  dashboardId: number
  created: string
  updated: string
  userId: number
  userLogin: string
  userEmail: string
  teamId: number
  team: string
  role: string
  permission: number
  permissionName: string
  uid: string
  title: string
  slug: string
  isFolder: boolean
  url: string
}

export interface GrafanaAccessControlRoleItem {
  version: number
  uid: string
  name: string
  displayName: string
  description: string
  group: string
  hidden: boolean
  updated: string
  created: string
  global: boolean
  permissionsJson: string
}

export interface GrafanaBuiltinRoleItem {
  role: string
  permissionsJson: string
}

export interface GrafanaAdminStatsData {
  connected: boolean
  users: number
  orgs: number
  dashboards: number
  snapshots: number
  tags: number
  datasources: number
  playlists: number
  stars: number
  alerts: number
  activeAdmins: number
  activeEditors: number
  activeViewers: number
  activeUsers: number
  activeSessions: number
  statsJson: string
}

export interface GrafanaPluginItem {
  id: string
  type: string
  name: string
  version: string
  enabled: boolean
  pinned: boolean
  hasUpdate: boolean
  state: string
  signature: string
  infoJson: string
}

export interface GrafanaDashboardVersionItem {
  id: number
  dashboardId: number
  version: number
  parentVersion: number
  description: string
  message: string
  created: string
  updated: string
  createdBy: string
  updatedBy: string
}

export interface GrafanaDashboardSnapshotItem {
  id: number
  name: string
  key: string
  orgId: number
  userId: number
  external: boolean
  externalUrl: string
  expires: string
  createdAt: string
  updatedAt: string
}

export interface GrafanaAccessControlPermissionItem {
  action: string
  scope: string
}

export interface GrafanaOrgPreferencesData {
  connected: boolean
  theme: string
  homeDashboardUid: string
  timezone: string
  weekStart: string
  prefsJson: string
}

export interface GrafanaCurrentUserData {
  connected: boolean
  id: number
  login: string
  email: string
  name: string
  orgId: number
  isGrafanaAdmin: boolean
  isDisabled: boolean
  isExternal: boolean
  updatedAt: string
  createdAt: string
  theme: string
  authLabelsJson: string
  userJson: string
}

export interface GrafanaUserOrgItem {
  orgId: number
  name: string
  role: string
}

export interface GrafanaLibraryElementItem {
  id: number
  orgId: number
  folderId: number
  uid: string
  name: string
  kind: number
  type: string
  description: string
  version: number
  created: string
  updated: string
  modelJson: string
  metaJson: string
}

export interface GrafanaLibraryElementData {
  connected: boolean
  totalCount: number
  page: number
  perPage: number
  items: GrafanaLibraryElementItem[]
}

export interface GrafanaPlaylistItem {
  id: number
  uid: string
  name: string
  interval: string
  createdAt: string
  updatedAt: string
}

export interface GrafanaPlaylistDetailItem extends GrafanaPlaylistItem {
  itemsJson: string
}

export interface GrafanaPlaylistDetailData {
  connected: boolean
  item: GrafanaPlaylistDetailItem
}

export interface GrafanaCurrentOrgData {
  connected: boolean
  id: number
  name: string
  addressJson: string
  orgJson: string
}

export interface AlertmanagerAlertItem {
  fingerprint: string
  startsAt: string
  endsAt: string
  statusJson: string
  labelsJson: string
  annotationsJson: string
  receiversJson: string
}

export interface AlertmanagerGroupItem {
  receiver: string
  labelsJson: string
  alertCount: number
  alertsJson: string
}

export interface AlertmanagerSilenceItem {
  id: string
  createdBy: string
  comment: string
  startsAt: string
  endsAt: string
  matchersJson: string
  statusJson: string
}

export interface AlertmanagerReceiverItem {
  name: string
}

export interface MonitoringWriteResult {
  ok: boolean
  reason?: string
  id?: string
}

export class MonitoringError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'MonitoringError'
  }
}

type Component = 'prometheus' | 'alertmanager' | 'loki' | 'grafana'
type HttpMethod = 'GET' | 'POST' | 'DELETE'

interface ComponentOptions {
  baseUrl: string
  token?: string
  username?: string
  password?: string
  tenantId?: string
}

interface PrometheusData {
  resultType?: string
  result?: unknown
  activeTargets?: unknown
  droppedTargets?: unknown
  alerts?: unknown
  groups?: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function asNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  return typeof value === 'number' ? value : 0
}

function asNumericValue(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function asBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true
}

const DEFAULT_OUTPUT_MAX_BYTES = 128 * 1024
const SENSITIVE_KEY = /(?:credential|password|passwd|secret|token|bearer|authorization|webhook|api[_-]?key|access[_-]?key|basic[_-]?auth|client[_-]?(?:secret|certificate|cert|key)|private[_-]?(?:key|certificate|cert)|tls[_-]?(?:auth|certificate|cert|key)|http[_-]?header[_-]?value|secure[_-]?json(?:data|fields)?|oauth[_-]?(?:token|secret|client)|sigv4|azure[_-]?(?:client|secret|token)|gcp[_-]?(?:client|secret|token))/i

function redactSensitiveText(value: string): string {
  let text = value
  text = text.replace(/(\bBearer\s+)[^\s,;"'}]+/gi, '$1[REDACTED]')
  const lines = text.split(/\r?\n/)
  let sensitiveBlockIndent = -1
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const indent = line.match(/^\s*/)?.[0].length ?? 0
    if (sensitiveBlockIndent >= 0) {
      if (!line.trim()) continue
      if (indent > sensitiveBlockIndent) {
        lines[index] = line.slice(0, indent) + '[REDACTED]'
        continue
      }
      sensitiveBlockIndent = -1
    }
    const blockKey = line.match(/^(\s*)(?:-\s*)?["']?secure[_-]?json(?:data|fields)?["']?\s*:/i)
    if (!blockKey) continue
    const colon = line.indexOf(':')
    const valuePart = line.slice(colon + 1).trim()
    lines[index] = line.slice(0, colon + 1) + ' [REDACTED]'
    if (!valuePart || /^[|>]/.test(valuePart)) {
      sensitiveBlockIndent = blockKey[1].length
    } else if ((valuePart.startsWith('{') && !valuePart.includes('}')) || (valuePart.startsWith('[') && !valuePart.includes(']'))) {
      sensitiveBlockIndent = blockKey[1].length
    }
  }
  text = lines.join('\n')
  const keyValue = /((?:^|[,{\s])["']?(?:credential|password|passwd|secret|token|bearer(?:[_-]?token)?|authorization|webhook|api[_-]?key|access[_-]?key|basic[_-]?auth|client[_-]?(?:secret|certificate|cert|key)|private[_-]?(?:key|certificate|cert)|tls[_-]?(?:auth|certificate|cert|key)|http[_-]?header[_-]?value\d*|secure[_-]?json(?:data|fields)?|oauth[_-]?(?:token|secret|client)|sigv4|azure[_-]?(?:client|secret|token)|gcp[_-]?(?:client|secret|token))["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s,;}\]]+)/gi
  text = text.replace(keyValue, '$1[REDACTED]')
  text = text.replace(/([?&](?:credential|password|passwd|secret|token|bearer(?:[_-]?token)?|authorization|webhook|api[_-]?key|access[_-]?key|basic[_-]?auth|client[_-]?(?:secret|certificate|cert|key)|private[_-]?(?:key|certificate|cert)|tls[_-]?(?:auth|certificate|cert|key)|http[_-]?header[_-]?value\d*|secure[_-]?json(?:data|fields)?|oauth[_-]?(?:token|secret|client)|sigv4|azure[_-]?(?:client|secret|token)|gcp[_-]?(?:client|secret|token))=)[^&#\s]+/gi, '$1[REDACTED]')
  text = text.replace(/(\b[a-z][a-z\d+.-]*:\/\/)[^/\s:@]+:[^@\s/]+@/gi, '$1[REDACTED]:[REDACTED]@')
  return text
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY.test(key)) return '[REDACTED]'
  if (typeof value === 'string') return redactSensitiveText(value)
  if (Array.isArray(value)) return value.map(item => sanitizeValue(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
      childKey,
      sanitizeValue(childValue, childKey),
    ]))
  }
  return value
}

function truncateUtf8(value: string, maxBytes = DEFAULT_OUTPUT_MAX_BYTES): string {
  const limit = Number.isFinite(maxBytes) ? Math.max(1, Math.floor(maxBytes)) : DEFAULT_OUTPUT_MAX_BYTES
  if (Buffer.byteLength(value, 'utf8') <= limit) return value
  let result = Buffer.from(value, 'utf8').subarray(0, limit).toString('utf8')
  while (result && Buffer.byteLength(result, 'utf8') > limit) result = result.slice(0, -1)
  return result
}

function safeJson(value: unknown, maxBytes = DEFAULT_OUTPUT_MAX_BYTES): string {
  try {
    return truncateUtf8(JSON.stringify(sanitizeValue(value) ?? {}) ?? '{}', maxBytes)
  } catch {
    return '[UNAVAILABLE]'
  }
}

function toJson(value: unknown, maxBytes = DEFAULT_OUTPUT_MAX_BYTES): string {
  return safeJson(value ?? {}, maxBytes)
}

function isInfrastructureError(error: unknown): boolean {
  return error instanceof MonitoringError
    && (error.status === 401 || error.status === 403 || error.status === 429 || error.status >= 500)
}

function normalizeOutputLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return DEFAULT_OUTPUT_MAX_BYTES
  return Math.max(1, Math.floor(value))
}

function isLocalHttpHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === '::1' || host.endsWith('.local') || !host.includes('.')
}

function endpointSecurityError(baseUrl: string, component: Component, allowInsecureHttp: boolean): MonitoringError | undefined {
  if (!baseUrl) return undefined
  try {
    const url = new URL(baseUrl)
    if (url.protocol === 'https:' || (url.protocol === 'http:' && (allowInsecureHttp || isLocalHttpHost(url.hostname)))) return undefined
    if (url.protocol !== 'http:') return new MonitoringError(component + ' endpoint must use HTTPS.', 400)
    return new MonitoringError(component + ' endpoint uses HTTP. Set allowInsecureHttp: true only for a trusted local network.', 400)
  } catch {
    return new MonitoringError(component + ' endpoint URL is invalid.', 400)
  }
}

function writeDisabledReason(): string {
  return 'Write operations are disabled. Set allowWrite: true in the plugin config.'
}

function mapQueryData(data: unknown, maxBytes = DEFAULT_OUTPUT_MAX_BYTES): PrometheusQueryData {
  const record = asRecord(data)
  const result = asArray(record.result)
  return {
    connected: true,
    resultType: asString(record, 'resultType'),
    seriesCount: result.length,
    resultJson: safeJson(result, maxBytes),
  }
}

function mapStringItems(data: unknown): string[] {
  return asArray(data).map(value => typeof value === 'string' ? redactSensitiveText(value) : String(value ?? ''))
}

function mapLokiQueryData(data: unknown, maxBytes = DEFAULT_OUTPUT_MAX_BYTES): LokiQueryData {
  const record = asRecord(data)
  const result = asArray(record.result)
  const entryCount = result.reduce((count: number, rawItem) => {
    const item = asRecord(rawItem)
    return count + asArray(item.values).length
  }, 0)
  return {
    connected: true,
    resultType: asString(record, 'resultType'),
    seriesCount: result.length,
    entryCount,
    resultJson: safeJson(result, maxBytes),
  }
}

function mapLokiVolumeData(data: unknown, maxBytes = DEFAULT_OUTPUT_MAX_BYTES): LokiVolumeData {
  const record = asRecord(data)
  const result = asArray(record.result)
  let totalBytes = 0
  for (const rawItem of result) {
    const item = asRecord(rawItem)
    const values = asArray(item.values)
    const value = asArray(item.value)
    const samples = values.length > 0 ? values : value.length > 0 ? [value] : []
    for (const sample of samples) {
      const tuple = asArray(sample)
      if (tuple.length >= 2) totalBytes += asNumericValue(tuple[tuple.length - 1])
    }
  }
  return {
    connected: true,
    resultType: asString(record, 'resultType'),
    seriesCount: result.length,
    totalBytes,
    resultJson: safeJson(result, maxBytes),
  }
}

function mapLokiPatterns(data: unknown, maxBytes = DEFAULT_OUTPUT_MAX_BYTES): LokiPatternItem[] {
  return asArray(data).map(rawItem => {
    const record = asRecord(rawItem)
    const samples = asArray(record.samples)
    const totalCount = samples.reduce((sum: number, sample) => {
      const tuple = asArray(sample)
      return sum + (tuple.length >= 2 ? asNumericValue(tuple[tuple.length - 1]) : 0)
    }, 0)
    return {
      pattern: asString(record, 'pattern'),
      sampleCount: samples.length,
      totalCount,
      samplesJson: safeJson(samples, maxBytes),
    }
  })
}

function mapGrafanaDatasource(data: unknown, maxBytes = DEFAULT_OUTPUT_MAX_BYTES): GrafanaDatasourceItem {
  const record = asRecord(data)
  return {
    id: asNumber(record, 'id'),
    uid: asString(record, 'uid'),
    name: asString(record, 'name'),
    type: asString(record, 'type'),
    url: redactSensitiveText(asString(record, 'url')),
    access: asString(record, 'access'),
    isDefault: asBoolean(record, 'isDefault'),
    basicAuth: asBoolean(record, 'basicAuth'),
    withCredentials: asBoolean(record, 'withCredentials'),
    database: asString(record, 'database'),
    user: asString(record, 'user'),
    settingsJson: toJson(record.secureJsonData ?? record.jsonData ?? record.settings, maxBytes),
  }
}

function mapGrafanaDashboardSummary(data: unknown): GrafanaDashboardSummaryItem {
  const record = asRecord(data)
  return {
    id: asNumber(record, 'id'),
    uid: asString(record, 'uid'),
    title: asString(record, 'title'),
    url: redactSensitiveText(asString(record, 'url')),
    type: asString(record, 'type'),
    tags: asArray(record.tags).map(tag => typeof tag === 'string' ? tag : String(tag ?? '')),
    isStarred: asBoolean(record, 'isStarred'),
    folderUid: asString(record, 'folderUid'),
    folderTitle: asString(record, 'folderTitle'),
  }
}

function mapGrafanaFolder(data: unknown): GrafanaFolderItem {
  const record = asRecord(data)
  return {
    id: asNumber(record, 'id'),
    uid: asString(record, 'uid'),
    title: asString(record, 'title'),
    url: asString(record, 'url'),
  }
}

function mapLokiDetectedField(data: unknown): LokiDetectedFieldItem {
  const record = asRecord(data)
  return {
    label: asString(record, 'label'),
    type: asString(record, 'type'),
    cardinality: asNumber(record, 'cardinality'),
    parsersJson: safeJson(asArray(record.parsers)),
    jsonPath: asString(record, 'jsonPath'),
  }
}

function mapGrafanaAnnotation(data: unknown): GrafanaAnnotationItem {
  const record = asRecord(data)
  return {
    id: asNumber(record, 'id'),
    alertId: asNumber(record, 'alertId'),
    dashboardUid: asString(record, 'dashboardUID') || asString(record, 'dashboardUid'),
    panelId: asNumber(record, 'panelId'),
    userName: asString(record, 'userName'),
    newState: asString(record, 'newState'),
    prevState: asString(record, 'prevState'),
    time: asNumber(record, 'time'),
    timeEnd: asNumber(record, 'timeEnd'),
    text: asString(record, 'text'),
    tagsJson: toJson(record.tags),
    dataJson: toJson(record.data),
  }
}

function mapGrafanaAlertInstance(data: unknown): GrafanaAlertInstanceItem {
  const record = asRecord(data)
  return {
    fingerprint: asString(record, 'fingerprint'),
    startsAt: asString(record, 'startsAt'),
    endsAt: asString(record, 'endsAt'),
    statusJson: toJson(record.status),
    labelsJson: toJson(record.labels),
    annotationsJson: toJson(record.annotations),
    receiversJson: toJson(record.receivers),
  }
}

function mapGrafanaAlertRule(data: unknown, maxBytes = DEFAULT_OUTPUT_MAX_BYTES): GrafanaAlertRuleItem {
  const record = asRecord(data)
  return {
    uid: asString(record, 'uid'),
    title: asString(record, 'title'),
    folderUid: asString(record, 'folderUID') || asString(record, 'folderUid'),
    namespaceUid: asString(record, 'namespaceUID') || asString(record, 'namespaceUid'),
    dashboardUid: asString(record, 'dashboardUID') || asString(record, 'dashboardUid'),
    panelId: asNumber(record, 'panelID') || asNumber(record, 'panelId'),
    ruleGroup: asString(record, 'ruleGroup') || asString(record, 'rule_group'),
    condition: asString(record, 'condition'),
    dataJson: toJson(record.data, maxBytes),
    noDataState: asString(record, 'noDataState') || asString(record, 'no_data_state'),
    execErrState: asString(record, 'execErrState') || asString(record, 'exec_err_state'),
    duration: asString(record, 'for') || asString(record, 'duration') || asString(record, 'forDuration'),
    intervalSeconds: asNumber(record, 'intervalSeconds') || asNumber(record, 'interval_seconds'),
    paused: asBoolean(record, 'paused'),
    updated: asString(record, 'updated'),
    version: asNumber(record, 'version'),
    labelsJson: toJson(record.labels, maxBytes),
    annotationsJson: toJson(record.annotations, maxBytes),
    ruleJson: safeJson(data ?? {}, maxBytes),
  }
}

function mapGrafanaContactPoint(data: unknown, maxBytes = DEFAULT_OUTPUT_MAX_BYTES): GrafanaContactPointItem {
  const record = asRecord(data)
  return {
    uid: asString(record, 'uid'),
    name: asString(record, 'name'),
    type: asString(record, 'type'),
    settingsJson: toJson(record.settings, maxBytes),
    disableResolveMessage: asBoolean(record, 'disableResolveMessage'),
  }
}

function mapGrafanaNotificationPolicy(data: unknown, maxBytes = DEFAULT_OUTPUT_MAX_BYTES): GrafanaNotificationPolicyData {
  const record = asRecord(data)
  return {
    connected: true,
    receiver: asString(record, 'receiver'),
    groupByJson: toJson(record.group_by, maxBytes),
    groupWait: asString(record, 'group_wait'),
    groupInterval: asString(record, 'group_interval'),
    repeatInterval: asString(record, 'repeat_interval'),
    policyJson: safeJson(data ?? {}, maxBytes),
  }
}

function mapGrafanaTeam(data: unknown): GrafanaTeamItem {
  const record = asRecord(data)
  return {
    id: asNumber(record, 'id'),
    orgId: asNumber(record, 'orgId') || asNumber(record, 'orgID'),
    name: asString(record, 'name'),
    email: asString(record, 'email'),
    avatarUrl: asString(record, 'avatarUrl'),
    memberCount: asNumber(record, 'memberCount'),
    permission: asNumber(record, 'permission'),
    created: asString(record, 'created'),
    updated: asString(record, 'updated'),
  }
}

function mapGrafanaTeamMember(data: unknown): GrafanaTeamMemberItem {
  const record = asRecord(data)
  return {
    orgId: asNumber(record, 'orgId') || asNumber(record, 'orgID'),
    teamId: asNumber(record, 'teamId') || asNumber(record, 'teamID'),
    userId: asNumber(record, 'userId') || asNumber(record, 'userID'),
    email: asString(record, 'email'),
    login: asString(record, 'login'),
    name: asString(record, 'name'),
    avatarUrl: asString(record, 'avatarUrl'),
  }
}

function mapGrafanaOrgUser(data: unknown): GrafanaOrgUserItem {
  const record = asRecord(data)
  return {
    orgId: asNumber(record, 'orgId') || asNumber(record, 'orgID'),
    userId: asNumber(record, 'userId') || asNumber(record, 'userID'),
    email: asString(record, 'email'),
    login: asString(record, 'login'),
    name: asString(record, 'name'),
    role: asString(record, 'role'),
    isExternal: asBoolean(record, 'isExternal') || asBoolean(record, 'is_external'),
    lastSeenAt: asString(record, 'lastSeenAt'),
    lastSeenAtAge: asString(record, 'lastSeenAtAge'),
  }
}

function mapGrafanaOrg(data: unknown): GrafanaOrgItem {
  const record = asRecord(data)
  return {
    id: asNumber(record, 'id'),
    name: asString(record, 'name'),
    createdAt: asString(record, 'createdAt') || asString(record, 'created'),
    updatedAt: asString(record, 'updatedAt') || asString(record, 'updated'),
  }
}

function mapGrafanaServiceAccount(data: unknown): GrafanaServiceAccountItem {
  const record = asRecord(data)
  return {
    id: asNumber(record, 'id'),
    name: asString(record, 'name'),
    login: asString(record, 'login'),
    orgId: asNumber(record, 'orgId') || asNumber(record, 'orgID'),
    isDisabled: asBoolean(record, 'isDisabled'),
    role: asString(record, 'role'),
    tokens: asNumber(record, 'tokens'),
    avatarUrl: asString(record, 'avatarUrl'),
    accessControlJson: toJson(record.accessControl),
  }
}

function mapGrafanaServiceAccountToken(data: unknown): GrafanaServiceAccountTokenItem {
  const record = asRecord(data)
  return {
    id: asNumber(record, 'id'),
    name: asString(record, 'name'),
    role: asString(record, 'role'),
    created: asString(record, 'created'),
    expiration: asString(record, 'expiration'),
    secondsUntilExpiration: asNumber(record, 'secondsUntilExpiration'),
    hasExpired: asBoolean(record, 'hasExpired'),
  }
}

function mapGrafanaOrgQuota(data: unknown): GrafanaOrgQuotaItem {
  const record = asRecord(data)
  return {
    orgId: asNumber(record, 'orgId') || asNumber(record, 'orgID'),
    target: asString(record, 'target'),
    limit: asNumber(record, 'limit'),
    used: asNumber(record, 'used'),
  }
}

function mapGrafanaFolderPermission(data: unknown): GrafanaFolderPermissionItem {
  const record = asRecord(data)
  return {
    id: asNumber(record, 'id'),
    folderId: asNumber(record, 'folderId') || asNumber(record, 'folderID'),
    role: asString(record, 'role'),
    permission: asNumber(record, 'permission'),
    permissionName: asString(record, 'permissionName'),
    userId: asNumber(record, 'userId') || asNumber(record, 'userID'),
    userLogin: asString(record, 'userLogin'),
    userEmail: asString(record, 'userEmail'),
    teamId: asNumber(record, 'teamId') || asNumber(record, 'teamID'),
    team: asString(record, 'team'),
  }
}

function mapGrafanaDatasourcePermission(data: unknown): GrafanaDatasourcePermissionItem {
  const record = asRecord(data)
  return {
    id: asNumber(record, 'id'),
    roleName: asString(record, 'roleName'),
    isManaged: asBoolean(record, 'isManaged'),
    isInherited: asBoolean(record, 'isInherited'),
    isServiceAccount: asBoolean(record, 'isServiceAccount'),
    userId: asNumber(record, 'userId') || asNumber(record, 'userID'),
    userLogin: asString(record, 'userLogin'),
    userAvatarUrl: asString(record, 'userAvatarUrl'),
    teamId: asNumber(record, 'teamId') || asNumber(record, 'teamID'),
    team: asString(record, 'team'),
    teamAvatarUrl: asString(record, 'teamAvatarUrl'),
    builtInRole: asString(record, 'builtInRole'),
    actionsJson: toJson(record.actions),
    permission: asString(record, 'permission'),
  }
}

function mapGrafanaDashboardPermission(data: unknown): GrafanaDashboardPermissionItem {
  const record = asRecord(data)
  return {
    id: asNumber(record, 'id'),
    dashboardId: asNumber(record, 'dashboardId') || asNumber(record, 'dashboardID'),
    created: asString(record, 'created'),
    updated: asString(record, 'updated'),
    userId: asNumber(record, 'userId') || asNumber(record, 'userID'),
    userLogin: asString(record, 'userLogin'),
    userEmail: asString(record, 'userEmail'),
    teamId: asNumber(record, 'teamId') || asNumber(record, 'teamID'),
    team: asString(record, 'team'),
    role: asString(record, 'role'),
    permission: asNumber(record, 'permission'),
    permissionName: asString(record, 'permissionName'),
    uid: asString(record, 'uid'),
    title: asString(record, 'title'),
    slug: asString(record, 'slug'),
    isFolder: asBoolean(record, 'isFolder'),
    url: asString(record, 'url'),
  }
}

function mapGrafanaAccessControlRole(data: unknown): GrafanaAccessControlRoleItem {
  const record = asRecord(data)
  return {
    version: asNumber(record, 'version'),
    uid: asString(record, 'uid'),
    name: asString(record, 'name'),
    displayName: asString(record, 'displayName'),
    description: asString(record, 'description'),
    group: asString(record, 'group'),
    hidden: asBoolean(record, 'hidden'),
    updated: asString(record, 'updated'),
    created: asString(record, 'created'),
    global: asBoolean(record, 'global'),
    permissionsJson: toJson(record.permissions),
  }
}

function mapGrafanaBuiltinRoles(data: unknown): GrafanaBuiltinRoleItem[] {
  const array = asArray(data)
  if (array.length > 0) {
    return array.map(item => {
      const record = asRecord(item)
      return {
        role: asString(record, 'role')
          || asString(record, 'name')
          || asString(record, 'builtInRole')
          || asString(record, 'builtinRole'),
        permissionsJson: toJson(record.permissions ?? []),
      }
    })
  }
  return Object.entries(asRecord(data)).map(([role, value]) => {
    const permissions = value && typeof value === 'object' && !Array.isArray(value)
      ? asRecord(value).permissions ?? value
      : value
    return { role, permissionsJson: toJson(permissions ?? []) }
  })
}

function mapGrafanaPlugin(data: unknown): GrafanaPluginItem {
  const record = asRecord(data)
  return {
    id: asString(record, 'id'),
    type: asString(record, 'type'),
    name: asString(record, 'name'),
    version: asString(record, 'version') || asString(record, 'pluginVersion'),
    enabled: asBoolean(record, 'enabled'),
    pinned: asBoolean(record, 'pinned'),
    hasUpdate: asBoolean(record, 'hasUpdate'),
    state: asString(record, 'state'),
    signature: asString(record, 'signature'),
    infoJson: toJson(record.info),
  }
}

function mapGrafanaDashboardVersion(data: unknown): GrafanaDashboardVersionItem {
  const record = asRecord(data)
  return {
    id: asNumber(record, 'id'),
    dashboardId: asNumber(record, 'dashboardId') || asNumber(record, 'dashboardID'),
    version: asNumber(record, 'version'),
    parentVersion: asNumber(record, 'parentVersion') || asNumber(record, 'parent_version'),
    description: asString(record, 'description'),
    message: asString(record, 'message'),
    created: asString(record, 'created'),
    updated: asString(record, 'updated'),
    createdBy: asString(record, 'createdBy') || asString(record, 'created_by'),
    updatedBy: asString(record, 'updatedBy') || asString(record, 'updated_by'),
  }
}

function mapGrafanaDashboardSnapshot(data: unknown): GrafanaDashboardSnapshotItem {
  const record = asRecord(data)
  return {
    id: asNumber(record, 'id'),
    name: asString(record, 'name'),
    key: asString(record, 'key'),
    orgId: asNumber(record, 'orgId') || asNumber(record, 'orgID'),
    userId: asNumber(record, 'userId') || asNumber(record, 'userID'),
    external: asBoolean(record, 'external'),
    externalUrl: asString(record, 'externalUrl'),
    expires: asString(record, 'expires'),
    createdAt: asString(record, 'createdAt'),
    updatedAt: asString(record, 'updatedAt'),
  }
}

function mapGrafanaAccessControlPermission(data: unknown): GrafanaAccessControlPermissionItem {
  const record = asRecord(data)
  return {
    action: asString(record, 'action'),
    scope: asString(record, 'scope'),
  }
}

function mapGrafanaOrgPreferences(data: unknown): GrafanaOrgPreferencesData {
  const record = asRecord(data)
  return {
    connected: true,
    theme: asString(record, 'theme'),
    homeDashboardUid: asString(record, 'homeDashboardUID') || asString(record, 'home_dashboard_uid'),
    timezone: asString(record, 'timezone'),
    weekStart: asString(record, 'weekStart') || asString(record, 'week_start'),
    prefsJson: safeJson(data ?? {}),
  }
}

function mapGrafanaCurrentUser(data: unknown): GrafanaCurrentUserData {
  const record = asRecord(data)
  return {
    connected: true,
    id: asNumber(record, 'id'),
    login: asString(record, 'login'),
    email: asString(record, 'email'),
    name: asString(record, 'name'),
    orgId: asNumber(record, 'orgId') || asNumber(record, 'orgID'),
    isGrafanaAdmin: asBoolean(record, 'isGrafanaAdmin'),
    isDisabled: asBoolean(record, 'isDisabled'),
    isExternal: asBoolean(record, 'isExternal'),
    updatedAt: asString(record, 'updatedAt'),
    createdAt: asString(record, 'createdAt'),
    theme: asString(record, 'theme'),
    authLabelsJson: toJson(record.authLabels),
    userJson: safeJson(data ?? {}),
  }
}

function mapGrafanaUserOrg(data: unknown): GrafanaUserOrgItem {
  const record = asRecord(data)
  return {
    orgId: asNumber(record, 'orgId') || asNumber(record, 'orgID'),
    name: asString(record, 'name'),
    role: asString(record, 'role'),
  }
}

function mapGrafanaLibraryElement(data: unknown): GrafanaLibraryElementItem {
  const record = asRecord(data)
  return {
    id: asNumber(record, 'id'),
    orgId: asNumber(record, 'orgId') || asNumber(record, 'orgID'),
    folderId: asNumber(record, 'folderId') || asNumber(record, 'folderID'),
    uid: asString(record, 'uid'),
    name: asString(record, 'name'),
    kind: asNumber(record, 'kind'),
    type: asString(record, 'type'),
    description: asString(record, 'description'),
    version: asNumber(record, 'version'),
    created: asString(record, 'created') || asString(record, 'createdAt'),
    updated: asString(record, 'updated') || asString(record, 'updatedAt'),
    modelJson: toJson(record.model),
    metaJson: toJson(record.meta),
  }
}

function mapGrafanaPlaylist(data: unknown): GrafanaPlaylistItem {
  const record = asRecord(data)
  return {
    id: asNumber(record, 'id'),
    uid: asString(record, 'uid'),
    name: asString(record, 'name'),
    interval: asString(record, 'interval'),
    createdAt: asString(record, 'createdAt') || asString(record, 'created_at'),
    updatedAt: asString(record, 'updatedAt') || asString(record, 'updated_at'),
  }
}

function mapGrafanaPlaylistDetail(data: unknown): GrafanaPlaylistDetailItem {
  const record = asRecord(data)
  return {
    ...mapGrafanaPlaylist(data),
    itemsJson: toJson(record.items),
  }
}

function countPanels(panels: unknown): number {
  return asArray(panels).reduce((sum: number, rawPanel) => {
    const panel = asRecord(rawPanel)
    return sum + 1 + countPanels(panel.panels)
  }, 0)
}

function mapTarget(data: unknown): PrometheusTargetItem {
  const record = asRecord(data)
  return {
    scrapeUrl: redactSensitiveText(asString(record, 'scrapeUrl')),
    health: asString(record, 'health'),
    lastError: asString(record, 'lastError'),
    labelsJson: toJson(record.labels),
  }
}

function mapPrometheusAlertmanager(data: unknown): PrometheusAlertmanagerItem {
  const record = asRecord(data)
  return {
    url: redactSensitiveText(asString(record, 'url')),
    state: asString(record, 'state'),
    labelsJson: toJson(record.labels),
  }
}

export class MonitoringClient {
  private readonly prometheus: ComponentOptions
  private readonly alertmanager: ComponentOptions
  private readonly loki: ComponentOptions
  private readonly grafana: ComponentOptions
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly allowWrite: boolean
  private readonly allowInsecureHttp: boolean
  private readonly maxOutputBytes: number

  constructor(options: MonitoringClientOptions = {}) {
    this.prometheus = {
      baseUrl: (options.prometheusBaseUrl ?? 'http://localhost:9090').replace(/\/+$/, ''),
      token: options.prometheusToken,
      username: options.prometheusUsername,
      password: options.prometheusPassword,
    }
    this.alertmanager = {
      baseUrl: (options.alertmanagerBaseUrl ?? 'http://localhost:9093').replace(/\/+$/, ''),
      token: options.alertmanagerToken,
      username: options.alertmanagerUsername,
      password: options.alertmanagerPassword,
    }
    this.loki = {
      baseUrl: (options.lokiBaseUrl ?? 'http://localhost:3100').replace(/\/+$/, ''),
      token: options.lokiToken,
      username: options.lokiUsername,
      password: options.lokiPassword,
      tenantId: options.lokiTenantId,
    }
    this.grafana = {
      baseUrl: (options.grafanaBaseUrl ?? 'http://localhost:3000').replace(/\/+$/, ''),
      token: options.grafanaToken,
      username: options.grafanaUsername,
      password: options.grafanaPassword,
    }
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.allowWrite = options.allowWrite ?? false
    this.allowInsecureHttp = options.allowInsecureHttp ?? false
    this.maxOutputBytes = normalizeOutputLimit(options.maxOutputBytes)
  }

  hasPrometheus(): boolean {
    return this.prometheus.baseUrl.length > 0
  }

  hasAlertmanager(): boolean {
    return this.alertmanager.baseUrl.length > 0
  }

  hasLoki(): boolean {
    return this.loki.baseUrl.length > 0
  }

  hasGrafana(): boolean {
    return this.grafana.baseUrl.length > 0
  }

  private combinedSignal(signal?: AbortSignal): AbortSignal | undefined {
    if (this.timeoutMs <= 0) return signal
    const timeout = AbortSignal.timeout(this.timeoutMs)
    return signal ? AbortSignal.any([signal, timeout]) : timeout
  }

  private headers(component: Component): Record<string, string> {
    const options = component === 'prometheus'
      ? this.prometheus
      : component === 'loki' ? this.loki
        : component === 'grafana' ? this.grafana : this.alertmanager
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': 'dsh-tool-monitoring',
    }
    if (options.token) {
      headers.authorization = options.token.startsWith('Bearer ')
        ? options.token
        : `Bearer ${options.token}`
    } else if (options.username || options.password) {
      headers.authorization = `Basic ${Buffer.from(`${options.username ?? ''}:${options.password ?? ''}`).toString('base64')}`
    }
    if (options.tenantId) headers['x-scope-orgid'] = options.tenantId
    return headers
  }

  private async request(
    component: Component,
    method: HttpMethod,
    path: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const options = component === 'prometheus'
      ? this.prometheus
      : component === 'loki' ? this.loki
        : component === 'grafana' ? this.grafana : this.alertmanager
    const endpointError = endpointSecurityError(options.baseUrl, component, this.allowInsecureHttp)
    if (endpointError) throw endpointError
    const response = await this.fetchImpl(`${options.baseUrl}${path}`, {
      method,
      headers: this.headers(component),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: this.combinedSignal(signal),
    })

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      payload = undefined
    }

    if (!response.ok) {
      const payloadRecord = asRecord(payload)
      const message = asString(payloadRecord, 'message') || asString(payloadRecord, 'error') || `HTTP ${response.status}`
      throw new MonitoringError(message, response.status)
    }
    return payload
  }

  private async prometheusRequest(
    method: HttpMethod,
    path: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const payload = await this.request('prometheus', method, path, body, signal)
    const record = asRecord(payload)
    if (record.status === 'error') {
      const errorType = asString(record, 'errorType')
      const message = asString(record, 'error') || 'Prometheus API error'
      throw new MonitoringError(errorType ? `${errorType}: ${message}` : message, 400)
    }
    if (record.status === 'success' && 'data' in record) return record.data
    return payload
  }

  private async alertmanagerRequest(
    method: HttpMethod,
    path: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.request('alertmanager', method, path, body, signal)
  }

  private async grafanaRequest(
    method: HttpMethod,
    path: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.request('grafana', method, path, undefined, signal)
  }

  private async lokiRequest(
    method: HttpMethod,
    path: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const payload = await this.request('loki', method, path, body, signal)
    const record = asRecord(payload)
    if (record.status === 'error') {
      const errorType = asString(record, 'errorType')
      const message = asString(record, 'error') || asString(record, 'message') || 'Loki API error'
      throw new MonitoringError(errorType ? `${errorType}: ${message}` : message, 400)
    }
    if (record.status === 'success' && 'data' in record) return record.data
    return payload
  }

  private async lokiTextRequest(path: string, signal?: AbortSignal): Promise<string> {
    const endpointError = endpointSecurityError(this.loki.baseUrl, 'loki', this.allowInsecureHttp)
    if (endpointError) throw endpointError
    const headers = this.headers('loki')
    headers.accept = 'application/yaml, text/yaml, text/plain, application/json, */*;q=0.1'
    const response = await this.fetchImpl(`${this.loki.baseUrl}${path}`, {
      method: 'GET',
      headers,
      signal: this.combinedSignal(signal),
    })
    const raw = await response.text()
    if (!response.ok) {
      let message = `HTTP ${response.status}`
      try {
        const payload = asRecord(JSON.parse(raw))
        message = asString(payload, 'message') || asString(payload, 'error') || message
      } catch {
        // Keep the HTTP fallback when the response body is not JSON.
      }
      throw new MonitoringError(message, response.status)
    }
    return truncateUtf8(redactSensitiveText(raw), this.maxOutputBytes)
  }

  async query(
    query: string,
    options: { time?: string; signal?: AbortSignal } = {},
  ): Promise<PrometheusQueryData> {
    const queryPart = `query=${encodeURIComponent(query)}`
    const timePart = options.time ? `&time=${encodeURIComponent(options.time)}` : ''
    const data = await this.prometheusRequest('GET', `/api/v1/query?${queryPart}${timePart}`, undefined, options.signal)
    return mapQueryData(data, this.maxOutputBytes)
  }

  async queryRange(
    query: string,
    options: {
      start: string
      end: string
      step: string
      signal?: AbortSignal
    },
  ): Promise<PrometheusQueryData> {
    const data = await this.prometheusRequest(
      'GET',
      `/api/v1/query_range?query=${encodeURIComponent(query)}&start=${encodeURIComponent(options.start)}&end=${encodeURIComponent(options.end)}&step=${encodeURIComponent(options.step)}`,
      undefined,
      options.signal,
    )
    return mapQueryData(data, this.maxOutputBytes)
  }

  async listTargets(options: { signal?: AbortSignal } = {}): Promise<PrometheusTargetData> {
    const data = asRecord(await this.prometheusRequest('GET', '/api/v1/targets', undefined, options.signal))
    const active = asArray(data.activeTargets)
    const dropped = asArray(data.droppedTargets)
    return {
      connected: true,
      activeCount: active.length,
      droppedCount: dropped.length,
      items: active.map(mapTarget),
    }
  }

  async listAlerts(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: PrometheusAlertItem[]
  }> {
    const data = asRecord(await this.prometheusRequest('GET', '/api/v1/alerts', undefined, options.signal))
    const items = asArray(data.alerts).map(alert => {
      const record = asRecord(alert)
      return {
        state: asString(record, 'state'),
        value: asString(record, 'value'),
        activeAt: asString(record, 'activeAt'),
        labelsJson: toJson(record.labels),
        annotationsJson: toJson(record.annotations),
      }
    })
    return { connected: true, items }
  }

  async listRules(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: PrometheusRuleItem[]
  }> {
    const data = asRecord(await this.prometheusRequest('GET', '/api/v1/rules', undefined, options.signal))
    const items: PrometheusRuleItem[] = []
    for (const rawGroup of asArray(data.groups)) {
      const group = asRecord(rawGroup)
      for (const rawRule of asArray(group.rules)) {
        const rule = asRecord(rawRule)
        const activeAlerts = asArray(rule.alerts)
        items.push({
          name: asString(rule, 'name'),
          type: asString(rule, 'type'),
          health: asString(rule, 'health'),
          query: asString(rule, 'query'),
          duration: asString(rule, 'duration'),
          labelsJson: toJson(rule.labels),
          activeAlertCount: activeAlerts.length,
        })
      }
    }
    return { connected: true, items }
  }

  async listSeries(
    match: string,
    options: { start?: string; end?: string; signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    items: PrometheusSeriesItem[]
  }> {
    let path = `/api/v1/series?match[]=${encodeURIComponent(match)}`
    if (options.start) path += `&start=${encodeURIComponent(options.start)}`
    if (options.end) path += `&end=${encodeURIComponent(options.end)}`
    const data = await this.prometheusRequest('GET', path, undefined, options.signal)
    const items = asArray(data).map(series => ({ labelsJson: toJson(series, this.maxOutputBytes) }))
    return { connected: true, items }
  }

  async listLabels(options: { signal?: AbortSignal } = {}): Promise<PrometheusLabelData> {
    const data = await this.prometheusRequest('GET', '/api/v1/labels', undefined, options.signal)
    return {
      connected: true,
      items: asArray(data).map(value => typeof value === 'string' ? value : String(value ?? '')),
    }
  }

  async getLabelValues(labelName: string, options: { signal?: AbortSignal } = {}): Promise<PrometheusLabelData> {
    const data = await this.prometheusRequest(
      'GET',
      `/api/v1/label/${encodeURIComponent(labelName)}/values`,
      undefined,
      options.signal,
    )
    return {
      connected: true,
      items: asArray(data).map(value => typeof value === 'string' ? value : String(value ?? '')),
    }
  }

  async getTsdbStatus(options: { signal?: AbortSignal } = {}): Promise<PrometheusTsdbData> {
    const data = await this.prometheusRequest('GET', '/api/v1/status/tsdb', undefined, options.signal)
    const record = asRecord(data)
    const headStats = asRecord(record.headStats)
    return {
      connected: true,
      headSeriesCount: asNumber(headStats, 'numSeries'),
      statsJson: safeJson(data ?? {}, this.maxOutputBytes),
    }
  }

  async getBuildInfo(options: { signal?: AbortSignal } = {}): Promise<PrometheusBuildInfoData> {
    const data = asRecord(await this.prometheusRequest(
      'GET',
      '/api/v1/status/buildinfo',
      undefined,
      options.signal,
    ))
    return {
      connected: true,
      version: asString(data, 'version'),
      revision: asString(data, 'revision'),
      branch: asString(data, 'branch'),
      goVersion: asString(data, 'goVersion'),
      buildUser: asString(data, 'buildUser'),
      buildDate: asString(data, 'buildDate'),
      infoJson: safeJson(data ?? {}, this.maxOutputBytes),
    }
  }

  async getRuntimeInfo(options: { signal?: AbortSignal } = {}): Promise<PrometheusRuntimeInfoData> {
    const data = asRecord(await this.prometheusRequest(
      'GET',
      '/api/v1/status/runtimeinfo',
      undefined,
      options.signal,
    ))
    return {
      connected: true,
      startTime: asString(data, 'startTime'),
      cwd: asString(data, 'CWD'),
      reloadConfigSuccess: asBoolean(data, 'reloadConfigSuccess'),
      lastConfigTime: asString(data, 'lastConfigTime'),
      goroutineCount: asNumber(data, 'goroutineCount'),
      timeSeriesCount: asNumber(data, 'timeSeriesCount'),
      runtimeJson: safeJson(data ?? {}, this.maxOutputBytes),
    }
  }

  async getFlags(options: { signal?: AbortSignal } = {}): Promise<PrometheusFlagsData> {
    const data = asRecord(await this.prometheusRequest(
      'GET',
      '/api/v1/status/flags',
      undefined,
      options.signal,
    ))
    return {
      connected: true,
      count: Object.keys(data).length,
      flagsJson: safeJson(data ?? {}, this.maxOutputBytes),
    }
  }

  async getMetadata(
    options: { metric?: string; limit?: number; signal?: AbortSignal } = {},
  ): Promise<PrometheusMetadataData> {
    const params: string[] = []
    if (options.metric) params.push(`metric=${encodeURIComponent(options.metric)}`)
    if (options.limit !== undefined && options.limit > 0) params.push(`limit=${Math.floor(options.limit)}`)
    const suffix = params.length > 0 ? `?${params.join('&')}` : ''
    const data = asRecord(await this.prometheusRequest(
      'GET',
      `/api/v1/metadata${suffix}`,
      undefined,
      options.signal,
    ))
    const items: PrometheusMetadataItem[] = []
    for (const [metric, rawEntries] of Object.entries(data)) {
      for (const rawEntry of asArray(rawEntries)) {
        const entry = asRecord(rawEntry)
        items.push({
          metric,
          type: asString(entry, 'type'),
          help: asString(entry, 'help'),
          unit: asString(entry, 'unit'),
        })
      }
    }
    return {
      connected: true,
      count: items.length,
      items,
      metadataJson: safeJson(data ?? {}, this.maxOutputBytes),
    }
  }

  async listAlertmanagers(options: { signal?: AbortSignal } = {}): Promise<PrometheusAlertmanagersData> {
    const data = asRecord(await this.prometheusRequest(
      'GET',
      '/api/v1/alertmanagers',
      undefined,
      options.signal,
    ))
    const active = asArray(data.activeAlertmanagers).map(mapPrometheusAlertmanager)
    const dropped = asArray(data.droppedAlertmanagers).map(mapPrometheusAlertmanager)
    return {
      connected: true,
      activeCount: active.length,
      droppedCount: dropped.length,
      activeItems: active,
      droppedItems: dropped,
    }
  }

  async getConfig(options: { signal?: AbortSignal } = {}): Promise<PrometheusConfigData> {
    const data = asRecord(await this.prometheusRequest(
      'GET',
      '/api/v1/status/config',
      undefined,
      options.signal,
    ))
    const configYaml = asString(data, 'yaml')
    return {
      connected: true,
      configYaml: truncateUtf8(redactSensitiveText(configYaml), this.maxOutputBytes),
      length: truncateUtf8(redactSensitiveText(configYaml), this.maxOutputBytes).length,
    }
  }

  async lokiQuery(
    query: string,
    options: {
      time?: string
      limit?: number
      direction?: string
      signal?: AbortSignal
    } = {},
  ): Promise<LokiQueryData> {
    const params = [`query=${encodeURIComponent(query)}`]
    if (options.time) params.push(`time=${encodeURIComponent(options.time)}`)
    if (options.limit && options.limit > 0) params.push(`limit=${Math.floor(options.limit)}`)
    if (options.direction) params.push(`direction=${encodeURIComponent(options.direction)}`)
    const data = await this.lokiRequest(
      'GET',
      `/loki/api/v1/query?${params.join('&')}`,
      undefined,
      options.signal,
    )
    return mapLokiQueryData(data, this.maxOutputBytes)
  }

  async lokiQueryRange(
    query: string,
    options: {
      start?: string
      end?: string
      step?: string
      limit?: number
      direction?: string
      interval?: string
      signal?: AbortSignal
    } = {},
  ): Promise<LokiQueryData> {
    const params = [`query=${encodeURIComponent(query)}`]
    if (options.start) params.push(`start=${encodeURIComponent(options.start)}`)
    if (options.end) params.push(`end=${encodeURIComponent(options.end)}`)
    if (options.step) params.push(`step=${encodeURIComponent(options.step)}`)
    if (options.limit && options.limit > 0) params.push(`limit=${Math.floor(options.limit)}`)
    if (options.direction) params.push(`direction=${encodeURIComponent(options.direction)}`)
    if (options.interval) params.push(`interval=${encodeURIComponent(options.interval)}`)
    const data = await this.lokiRequest(
      'GET',
      `/loki/api/v1/query_range?${params.join('&')}`,
      undefined,
      options.signal,
    )
    return mapLokiQueryData(data, this.maxOutputBytes)
  }

  async lokiListLabels(
    options: {
      query?: string
      start?: string
      end?: string
      signal?: AbortSignal
    } = {},
  ): Promise<LokiLabelData> {
    const params: string[] = []
    if (options.query) params.push(`query=${encodeURIComponent(options.query)}`)
    if (options.start) params.push(`start=${encodeURIComponent(options.start)}`)
    if (options.end) params.push(`end=${encodeURIComponent(options.end)}`)
    const suffix = params.length > 0 ? `?${params.join('&')}` : ''
    const data = await this.lokiRequest('GET', `/loki/api/v1/labels${suffix}`, undefined, options.signal)
    return { connected: true, items: mapStringItems(data) }
  }

  async lokiGetLabelValues(
    labelName: string,
    options: {
      query?: string
      start?: string
      end?: string
      signal?: AbortSignal
    } = {},
  ): Promise<LokiLabelData> {
    const params: string[] = []
    if (options.query) params.push(`query=${encodeURIComponent(options.query)}`)
    if (options.start) params.push(`start=${encodeURIComponent(options.start)}`)
    if (options.end) params.push(`end=${encodeURIComponent(options.end)}`)
    const suffix = params.length > 0 ? `?${params.join('&')}` : ''
    const data = await this.lokiRequest(
      'GET',
      `/loki/api/v1/label/${encodeURIComponent(labelName)}/values${suffix}`,
      undefined,
      options.signal,
    )
    return { connected: true, items: mapStringItems(data) }
  }

  async lokiListSeries(
    matches: string[],
    options: {
      start?: string
      end?: string
      signal?: AbortSignal
    } = {},
  ): Promise<{
    connected: boolean
    items: LokiSeriesItem[]
  }> {
    if (matches.length === 0) return { connected: true, items: [] }
    const params = matches.map(match => `match[]=${encodeURIComponent(match)}`)
    if (options.start) params.push(`start=${encodeURIComponent(options.start)}`)
    if (options.end) params.push(`end=${encodeURIComponent(options.end)}`)
    const data = await this.lokiRequest(
      'GET',
      `/loki/api/v1/series?${params.join('&')}`,
      undefined,
      options.signal,
    )
    const items = asArray(data).map(series => ({ labelsJson: toJson(series, this.maxOutputBytes) }))
    return { connected: true, items }
  }

  async lokiGetIndexStats(
    query: string,
    options: {
      start?: string
      end?: string
      signal?: AbortSignal
    } = {},
  ): Promise<LokiIndexStats> {
    const params = [`query=${encodeURIComponent(query)}`]
    if (options.start) params.push(`start=${encodeURIComponent(options.start)}`)
    if (options.end) params.push(`end=${encodeURIComponent(options.end)}`)
    const data = asRecord(await this.lokiRequest(
      'GET',
      `/loki/api/v1/index/stats?${params.join('&')}`,
      undefined,
      options.signal,
    ))
    return {
      connected: true,
      streams: asNumber(data, 'streams'),
      chunks: asNumber(data, 'chunks'),
      entries: asNumber(data, 'entries'),
      bytes: asNumber(data, 'bytes'),
      statsJson: safeJson(data ?? {}, this.maxOutputBytes),
    }
  }

  async lokiGetStatus(options: { signal?: AbortSignal } = {}): Promise<LokiStatusData> {
    const data = asRecord(await this.lokiRequest('GET', '/loki/api/v1/status/buildinfo', undefined, options.signal))
    return {
      connected: true,
      version: asString(data, 'version'),
      revision: asString(data, 'revision'),
      branch: asString(data, 'branch'),
      buildDate: asString(data, 'buildDate'),
      goVersion: asString(data, 'goVersion'),
      statusJson: safeJson(data ?? {}, this.maxOutputBytes),
    }
  }

  async lokiListRuleGroups(options: { signal?: AbortSignal } = {}): Promise<LokiRuleGroupData> {
    const ruleGroupsYaml = await this.lokiTextRequest('/loki/api/v1/rules', options.signal)
    return { connected: true, ruleGroupsYaml }
  }

  async lokiListRules(
    options: {
      type?: string
      file?: string
      ruleGroup?: string
      ruleName?: string
      signal?: AbortSignal
    } = {},
  ): Promise<{
    connected: boolean
    items: LokiRuleItem[]
  }> {
    const params: string[] = []
    if (options.type) params.push(`type=${encodeURIComponent(options.type)}`)
    if (options.file) params.push(`file=${encodeURIComponent(options.file)}`)
    if (options.ruleGroup) params.push(`rule_group=${encodeURIComponent(options.ruleGroup)}`)
    if (options.ruleName) params.push(`rule_name=${encodeURIComponent(options.ruleName)}`)
    const suffix = params.length > 0 ? `?${params.join('&')}` : ''
    const data = asRecord(await this.lokiRequest(
      'GET',
      `/prometheus/api/v1/rules${suffix}`,
      undefined,
      options.signal,
    ))
    const items: LokiRuleItem[] = []
    for (const rawGroup of asArray(data.groups)) {
      const group = asRecord(rawGroup)
      for (const rawRule of asArray(group.rules)) {
        const rule = asRecord(rawRule)
        items.push({
          group: asString(group, 'name'),
          file: asString(group, 'file'),
          name: asString(rule, 'name'),
          type: asString(rule, 'type'),
          health: asString(rule, 'health'),
          lastError: asString(rule, 'lastError'),
          query: asString(rule, 'query'),
          duration: asString(rule, 'duration'),
          labelsJson: toJson(rule.labels),
          annotationsJson: toJson(rule.annotations),
          activeAlertCount: asArray(rule.alerts).length,
        })
      }
    }
    return { connected: true, items }
  }

  async lokiListAlerts(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: LokiAlertItem[]
  }> {
    const data = asRecord(await this.lokiRequest('GET', '/prometheus/api/v1/alerts', undefined, options.signal))
    const items = asArray(data.alerts).map(rawAlert => {
      const alert = asRecord(rawAlert)
      return {
        state: asString(alert, 'state'),
        value: asString(alert, 'value'),
        activeAt: asString(alert, 'activeAt'),
        labelsJson: toJson(alert.labels),
        annotationsJson: toJson(alert.annotations),
      }
    })
    return { connected: true, items }
  }

  async lokiGetIndexVolume(
    query: string,
    options: {
      start: string
      end: string
      limit?: number
      targetLabels?: string
      aggregateBy?: string
      signal?: AbortSignal
    },
  ): Promise<LokiVolumeData> {
    const params = [
      `query=${encodeURIComponent(query)}`,
      `start=${encodeURIComponent(options.start)}`,
      `end=${encodeURIComponent(options.end)}`,
    ]
    if (options.limit && options.limit > 0) params.push(`limit=${Math.floor(options.limit)}`)
    if (options.targetLabels) params.push(`targetLabels=${encodeURIComponent(options.targetLabels)}`)
    if (options.aggregateBy) params.push(`aggregateBy=${encodeURIComponent(options.aggregateBy)}`)
    const data = await this.lokiRequest(
      'GET',
      `/loki/api/v1/index/volume?${params.join('&')}`,
      undefined,
      options.signal,
    )
    return mapLokiVolumeData(data, this.maxOutputBytes)
  }

  async lokiGetIndexVolumeRange(
    query: string,
    options: {
      start: string
      end: string
      step?: string
      limit?: number
      targetLabels?: string
      aggregateBy?: string
      signal?: AbortSignal
    },
  ): Promise<LokiVolumeData> {
    const params = [
      `query=${encodeURIComponent(query)}`,
      `start=${encodeURIComponent(options.start)}`,
      `end=${encodeURIComponent(options.end)}`,
    ]
    if (options.step) params.push(`step=${encodeURIComponent(options.step)}`)
    if (options.limit && options.limit > 0) params.push(`limit=${Math.floor(options.limit)}`)
    if (options.targetLabels) params.push(`targetLabels=${encodeURIComponent(options.targetLabels)}`)
    if (options.aggregateBy) params.push(`aggregateBy=${encodeURIComponent(options.aggregateBy)}`)
    const data = await this.lokiRequest(
      'GET',
      `/loki/api/v1/index/volume_range?${params.join('&')}`,
      undefined,
      options.signal,
    )
    return mapLokiVolumeData(data, this.maxOutputBytes)
  }

  async lokiGetPatterns(
    query: string,
    options: {
      start: string
      end: string
      step?: string
      signal?: AbortSignal
    },
  ): Promise<{
    connected: boolean
    items: LokiPatternItem[]
  }> {
    const params = [
      `query=${encodeURIComponent(query)}`,
      `start=${encodeURIComponent(options.start)}`,
      `end=${encodeURIComponent(options.end)}`,
    ]
    if (options.step) params.push(`step=${encodeURIComponent(options.step)}`)
    const data = await this.lokiRequest(
      'GET',
      `/loki/api/v1/patterns?${params.join('&')}`,
      undefined,
      options.signal,
    )
    return { connected: true, items: mapLokiPatterns(data, this.maxOutputBytes) }
  }

  async lokiGetDetectedFields(
    query: string,
    options: {
      start?: string
      end?: string
      since?: string
      step?: string
      lineLimit?: number
      limit?: number
      signal?: AbortSignal
    } = {},
  ): Promise<{
    connected: boolean
    items: LokiDetectedFieldItem[]
    limit: number
  }> {
    const params = [`query=${encodeURIComponent(query)}`]
    if (options.start) params.push(`start=${encodeURIComponent(options.start)}`)
    if (options.end) params.push(`end=${encodeURIComponent(options.end)}`)
    if (options.since) params.push(`since=${encodeURIComponent(options.since)}`)
    if (options.step) params.push(`step=${encodeURIComponent(options.step)}`)
    if (options.lineLimit && options.lineLimit > 0) {
      params.push(`line_limit=${Math.floor(options.lineLimit)}`)
    }
    if (options.limit && options.limit > 0) params.push(`limit=${Math.floor(options.limit)}`)
    const data = asRecord(await this.lokiRequest(
      'GET',
      `/loki/api/v1/detected_fields?${params.join('&')}`,
      undefined,
      options.signal,
    ))
    const items = asArray(data.fields).map(mapLokiDetectedField)
    return { connected: true, items, limit: asNumber(data, 'limit') }
  }

  async lokiGetDetectedFieldValues(
    fieldName: string,
    query: string,
    options: {
      start?: string
      end?: string
      since?: string
      step?: string
      lineLimit?: number
      limit?: number
      signal?: AbortSignal
    } = {},
  ): Promise<{
    connected: boolean
    items: string[]
    limit: number
  }> {
    const params = [`query=${encodeURIComponent(query)}`]
    if (options.start) params.push(`start=${encodeURIComponent(options.start)}`)
    if (options.end) params.push(`end=${encodeURIComponent(options.end)}`)
    if (options.since) params.push(`since=${encodeURIComponent(options.since)}`)
    if (options.step) params.push(`step=${encodeURIComponent(options.step)}`)
    if (options.lineLimit && options.lineLimit > 0) {
      params.push(`line_limit=${Math.floor(options.lineLimit)}`)
    }
    if (options.limit && options.limit > 0) params.push(`limit=${Math.floor(options.limit)}`)
    const data = asRecord(await this.lokiRequest(
      'GET',
      `/loki/api/v1/detected_field/${encodeURIComponent(fieldName)}/values?${params.join('&')}`,
      undefined,
      options.signal,
    ))
    return {
      connected: true,
      items: mapStringItems(data.values),
      limit: asNumber(data, 'limit'),
    }
  }

  async grafanaGetHealth(options: { signal?: AbortSignal } = {}): Promise<GrafanaHealthData> {
    const data = asRecord(await this.grafanaRequest('GET', '/api/health', options.signal))
    return {
      connected: true,
      database: asString(data, 'database'),
      version: asString(data, 'version'),
      commit: asString(data, 'commit'),
      statusJson: safeJson(data ?? {}, this.maxOutputBytes),
    }
  }

  async grafanaListDatasources(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: GrafanaDatasourceItem[]
  }> {
    const data = await this.grafanaRequest('GET', '/api/datasources', options.signal)
    const items = asArray(data).map(item => mapGrafanaDatasource(item, this.maxOutputBytes))
    return { connected: true, items }
  }

  async grafanaGetDatasource(
    uid: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    item: GrafanaDatasourceItem
  }> {
    const data = await this.grafanaRequest(
      'GET',
      `/api/datasources/uid/${encodeURIComponent(uid)}`,
      options.signal,
    )
    return { connected: true, item: mapGrafanaDatasource(data, this.maxOutputBytes) }
  }

  async grafanaSearchDashboards(
    options: {
      query?: string
      tag?: string
      starred?: boolean
      limit?: number
      page?: number
      signal?: AbortSignal
    } = {},
  ): Promise<{
    connected: boolean
    items: GrafanaDashboardSummaryItem[]
  }> {
    const params = ['type=dash-db']
    if (options.query) params.push(`query=${encodeURIComponent(options.query)}`)
    if (options.tag) params.push(`tag=${encodeURIComponent(options.tag)}`)
    if (options.starred !== undefined) params.push(`starred=${options.starred ? 'true' : 'false'}`)
    if (options.limit && options.limit > 0) params.push(`limit=${Math.floor(options.limit)}`)
    if (options.page && options.page > 0) params.push(`page=${Math.floor(options.page)}`)
    const data = await this.grafanaRequest(
      'GET',
      `/api/search?${params.join('&')}`,
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaDashboardSummary)
    return { connected: true, items }
  }

  async grafanaGetDashboard(
    uid: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<GrafanaDashboardData> {
    const data = asRecord(await this.grafanaRequest(
      'GET',
      `/api/dashboards/uid/${encodeURIComponent(uid)}`,
      options.signal,
    ))
    const dashboard = asRecord(data.dashboard)
    const meta = asRecord(data.meta)
    const panels = asArray(dashboard.panels)
    return {
      connected: true,
      uid: asString(dashboard, 'uid'),
      title: asString(dashboard, 'title'),
      url: redactSensitiveText(asString(dashboard, 'url') || asString(meta, 'url') || `/d/${encodeURIComponent(uid)}`),
      panelCount: countPanels(panels),
      dashboardJson: safeJson(data.dashboard ?? {}, this.maxOutputBytes),
      metaJson: safeJson(data.meta ?? {}, this.maxOutputBytes),
    }
  }

  async grafanaListFolders(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: GrafanaFolderItem[]
  }> {
    const data = await this.grafanaRequest('GET', '/api/folders', options.signal)
    const items = asArray(data).map(mapGrafanaFolder)
    return { connected: true, items }
  }

  async grafanaListAnnotations(
    options: {
      from?: string
      to?: string
      limit?: number
      dashboardUid?: string
      panelId?: number
      type?: string
      tags?: string[]
      signal?: AbortSignal
    } = {},
  ): Promise<{
    connected: boolean
    items: GrafanaAnnotationItem[]
  }> {
    const params: string[] = []
    if (options.from) params.push(`from=${encodeURIComponent(options.from)}`)
    if (options.to) params.push(`to=${encodeURIComponent(options.to)}`)
    if (options.limit && options.limit > 0) params.push(`limit=${Math.floor(options.limit)}`)
    if (options.dashboardUid) params.push(`dashboardUID=${encodeURIComponent(options.dashboardUid)}`)
    if (options.panelId !== undefined) params.push(`panelId=${Math.floor(options.panelId)}`)
    if (options.type) params.push(`type=${encodeURIComponent(options.type)}`)
    for (const tag of options.tags ?? []) {
      if (tag) params.push(`tags=${encodeURIComponent(tag)}`)
    }
    const suffix = params.length > 0 ? `?${params.join('&')}` : ''
    const data = await this.grafanaRequest('GET', `/api/annotations${suffix}`, options.signal)
    const items = asArray(data).map(mapGrafanaAnnotation)
    return { connected: true, items }
  }

  async grafanaListAlertInstances(
    options: {
      active?: boolean
      silenced?: boolean
      inhibited?: boolean
      receiver?: string
      signal?: AbortSignal
    } = {},
  ): Promise<{
    connected: boolean
    items: GrafanaAlertInstanceItem[]
  }> {
    const params: string[] = []
    if (options.active === false) params.push('active=false')
    if (options.silenced === false) params.push('silenced=false')
    if (options.inhibited === false) params.push('inhibited=false')
    if (options.receiver) params.push(`receiver=${encodeURIComponent(options.receiver)}`)
    const suffix = params.length > 0 ? `?${params.join('&')}` : ''
    const data = await this.grafanaRequest(
      'GET',
      `/api/alertmanager/grafana/api/v2/alerts${suffix}`,
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaAlertInstance)
    return { connected: true, items }
  }

  async grafanaListAlertRules(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: GrafanaAlertRuleItem[]
  }> {
    const data = await this.grafanaRequest(
      'GET',
      '/api/v1/provisioning/alert-rules',
      options.signal,
    )
    const items = asArray(data).map(item => mapGrafanaAlertRule(item, this.maxOutputBytes))
    return { connected: true, items }
  }

  async grafanaGetAlertRule(
    uid: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    item: GrafanaAlertRuleItem
  }> {
    const data = await this.grafanaRequest(
      'GET',
      `/api/v1/provisioning/alert-rules/${encodeURIComponent(uid)}`,
      options.signal,
    )
    return { connected: true, item: mapGrafanaAlertRule(data, this.maxOutputBytes) }
  }

  async grafanaListContactPoints(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: GrafanaContactPointItem[]
  }> {
    const data = await this.grafanaRequest(
      'GET',
      '/api/v1/provisioning/contact-points',
      options.signal,
    )
    const items = asArray(data).map(item => mapGrafanaContactPoint(item, this.maxOutputBytes))
    return { connected: true, items }
  }

  async grafanaGetNotificationPolicy(options: { signal?: AbortSignal } = {}): Promise<GrafanaNotificationPolicyData> {
    const data = await this.grafanaRequest(
      'GET',
      '/api/v1/provisioning/policies',
      options.signal,
    )
    return mapGrafanaNotificationPolicy(data, this.maxOutputBytes)
  }

  async grafanaListTeams(
    options: {
      query?: string
      name?: string
      sort?: string
      page?: number
      perPage?: number
      signal?: AbortSignal
    } = {},
  ): Promise<GrafanaTeamData> {
    const params: string[] = []
    if (options.query) params.push(`query=${encodeURIComponent(options.query)}`)
    if (options.name) params.push(`name=${encodeURIComponent(options.name)}`)
    if (options.sort) params.push(`sort=${encodeURIComponent(options.sort)}`)
    if (options.page && options.page > 0) params.push(`page=${Math.floor(options.page)}`)
    if (options.perPage && options.perPage > 0) params.push(`perpage=${Math.floor(options.perPage)}`)
    const suffix = params.length > 0 ? `?${params.join('&')}` : ''
    const data = asRecord(await this.grafanaRequest(
      'GET',
      `/api/teams/search${suffix}`,
      options.signal,
    ))
    return {
      connected: true,
      totalCount: asNumber(data, 'totalCount'),
      page: asNumber(data, 'page') || 1,
      perPage: asNumber(data, 'perPage') || asNumber(data, 'perpage') || 0,
      items: asArray(data.teams).map(mapGrafanaTeam),
    }
  }

  async grafanaGetTeam(
    teamId: string | number,
    options: { signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    item: GrafanaTeamItem
  }> {
    const data = await this.grafanaRequest(
      'GET',
      `/api/teams/${encodeURIComponent(String(teamId))}`,
      options.signal,
    )
    return { connected: true, item: mapGrafanaTeam(data) }
  }

  async grafanaListTeamMembers(
    teamId: string | number,
    options: { signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    items: GrafanaTeamMemberItem[]
  }> {
    const data = await this.grafanaRequest(
      'GET',
      `/api/teams/${encodeURIComponent(String(teamId))}/members`,
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaTeamMember)
    return { connected: true, items }
  }

  async grafanaListOrgUsers(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: GrafanaOrgUserItem[]
  }> {
    const data = await this.grafanaRequest(
      'GET',
      '/api/org/users',
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaOrgUser)
    return { connected: true, items }
  }

  async grafanaListOrgs(options: { signal?: AbortSignal } = {}): Promise<GrafanaOrgListData> {
    const data = await this.grafanaRequest('GET', '/api/orgs', options.signal)
    const items = asArray(data).map(mapGrafanaOrg)
    return { connected: true, totalCount: items.length, items }
  }

  async grafanaGetOrg(
    orgId: string | number,
    options: { signal?: AbortSignal } = {},
  ): Promise<GrafanaOrgDetailData> {
    const data = asRecord(await this.grafanaRequest(
      'GET',
      `/api/orgs/${encodeURIComponent(String(orgId))}`,
      options.signal,
    ))
    return {
      connected: true,
      id: asNumber(data, 'id'),
      name: asString(data, 'name'),
      addressJson: toJson(data.address),
      createdAt: asString(data, 'createdAt') || asString(data, 'created'),
      updatedAt: asString(data, 'updatedAt') || asString(data, 'updated'),
      orgJson: safeJson(data ?? {}, this.maxOutputBytes),
    }
  }

  async grafanaListOrgUsersByOrg(
    orgId: string | number,
    options: { signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    items: GrafanaOrgUserItem[]
  }> {
    const data = await this.grafanaRequest(
      'GET',
      `/api/orgs/${encodeURIComponent(String(orgId))}/users`,
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaOrgUser)
    return { connected: true, items }
  }

  async grafanaListServiceAccounts(
    options: {
      query?: string
      page?: number
      perPage?: number
      signal?: AbortSignal
    } = {},
  ): Promise<GrafanaServiceAccountData> {
    const params: string[] = []
    if (options.query) params.push(`query=${encodeURIComponent(options.query)}`)
    if (options.page && options.page > 0) params.push(`page=${Math.floor(options.page)}`)
    if (options.perPage && options.perPage > 0) params.push(`perpage=${Math.floor(options.perPage)}`)
    const suffix = params.length > 0 ? `?${params.join('&')}` : ''
    const data = asRecord(await this.grafanaRequest(
      'GET',
      `/api/serviceaccounts/search${suffix}`,
      options.signal,
    ))
    return {
      connected: true,
      totalCount: asNumber(data, 'totalCount'),
      page: asNumber(data, 'page') || 1,
      perPage: asNumber(data, 'perPage') || asNumber(data, 'perpage') || 0,
      items: asArray(data.serviceAccounts).map(mapGrafanaServiceAccount),
    }
  }

  async grafanaGetServiceAccount(
    serviceAccountId: string | number,
    options: { signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    item: GrafanaServiceAccountItem
  }> {
    const data = await this.grafanaRequest(
      'GET',
      `/api/serviceaccounts/${encodeURIComponent(String(serviceAccountId))}`,
      options.signal,
    )
    return { connected: true, item: mapGrafanaServiceAccount(data) }
  }

  async grafanaListServiceAccountTokens(
    serviceAccountId: string | number,
    options: { signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    items: GrafanaServiceAccountTokenItem[]
  }> {
    const data = await this.grafanaRequest(
      'GET',
      `/api/serviceaccounts/${encodeURIComponent(String(serviceAccountId))}/tokens`,
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaServiceAccountToken)
    return { connected: true, items }
  }

  async grafanaListOrgQuotas(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: GrafanaOrgQuotaItem[]
  }> {
    const data = await this.grafanaRequest(
      'GET',
      '/api/org/quotas',
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaOrgQuota)
    return { connected: true, items }
  }

  async grafanaListFolderPermissions(
    folderUid: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    items: GrafanaFolderPermissionItem[]
  }> {
    const data = await this.grafanaRequest(
      'GET',
      `/api/folders/${encodeURIComponent(folderUid)}/permissions`,
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaFolderPermission)
    return { connected: true, items }
  }

  async grafanaListDatasourcePermissions(
    datasourceUid: string,
    options: { dsType?: string; signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    items: GrafanaDatasourcePermissionItem[]
  }> {
    const suffix = options.dsType ? `?ds_type=${encodeURIComponent(options.dsType)}` : ''
    const data = await this.grafanaRequest(
      'GET',
      `/api/access-control/datasources/${encodeURIComponent(datasourceUid)}${suffix}`,
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaDatasourcePermission)
    return { connected: true, items }
  }

  async grafanaListDashboardPermissions(
    dashboardUid: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    items: GrafanaDashboardPermissionItem[]
  }> {
    const data = await this.grafanaRequest(
      'GET',
      `/api/dashboards/uid/${encodeURIComponent(dashboardUid)}/permissions`,
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaDashboardPermission)
    return { connected: true, items }
  }

  async grafanaListAccessControlRoles(
    options: { includeHidden?: boolean; signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    items: GrafanaAccessControlRoleItem[]
  }> {
    const suffix = options.includeHidden ? '?includeHidden=true' : ''
    const data = await this.grafanaRequest(
      'GET',
      `/api/access-control/roles${suffix}`,
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaAccessControlRole)
    return { connected: true, items }
  }

  async grafanaGetAccessControlRole(
    roleUid: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    item: GrafanaAccessControlRoleItem
  }> {
    const data = await this.grafanaRequest(
      'GET',
      `/api/access-control/roles/${encodeURIComponent(roleUid)}`,
      options.signal,
    )
    return { connected: true, item: mapGrafanaAccessControlRole(data) }
  }

  async grafanaListBuiltinRoles(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: GrafanaBuiltinRoleItem[]
  }> {
    const data = await this.grafanaRequest(
      'GET',
      '/api/access-control/builtin-roles',
      options.signal,
    )
    return { connected: true, items: mapGrafanaBuiltinRoles(data) }
  }

  async grafanaGetBuiltinRole(
    builtInRole: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    item: GrafanaBuiltinRoleItem
  }> {
    const list = await this.grafanaListBuiltinRoles(options)
    const normalized = builtInRole.trim().toLowerCase()
    const item = list.items.find(role => role.role.toLowerCase() === normalized)
    return { connected: true, item: item ?? { role: builtInRole, permissionsJson: '{}' } }
  }

  async grafanaListUserRoles(
    userId: string | number,
    options: { includeHidden?: boolean; signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    userId: number
    items: GrafanaAccessControlRoleItem[]
  }> {
    const suffix = options.includeHidden ? '?includeHidden=true' : ''
    const data = await this.grafanaRequest(
      'GET',
      `/api/access-control/users/${encodeURIComponent(String(userId))}/roles${suffix}`,
      options.signal,
    )
    const root = asRecord(data)
    const roles = asArray(root.roles).length > 0 ? asArray(root.roles) : asArray(data)
    return {
      connected: true,
      userId: asNumber(root, 'userId') || Number(userId) || 0,
      items: roles.map(mapGrafanaAccessControlRole),
    }
  }

  async grafanaListTeamRoles(
    teamId: string | number,
    options: { includeHidden?: boolean; signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    teamId: number
    items: GrafanaAccessControlRoleItem[]
  }> {
    const suffix = options.includeHidden ? '?includeHidden=true' : ''
    const data = await this.grafanaRequest(
      'GET',
      `/api/access-control/teams/${encodeURIComponent(String(teamId))}/roles${suffix}`,
      options.signal,
    )
    const root = asRecord(data)
    const roles = asArray(root.roles).length > 0 ? asArray(root.roles) : asArray(data)
    return {
      connected: true,
      teamId: asNumber(root, 'teamId') || Number(teamId) || 0,
      items: roles.map(mapGrafanaAccessControlRole),
    }
  }

  async grafanaGetAdminStats(options: { signal?: AbortSignal } = {}): Promise<GrafanaAdminStatsData> {
    const data = asRecord(await this.grafanaRequest('GET', '/api/admin/stats', options.signal))
    return {
      connected: true,
      users: asNumber(data, 'users'),
      orgs: asNumber(data, 'orgs'),
      dashboards: asNumber(data, 'dashboards'),
      snapshots: asNumber(data, 'snapshots'),
      tags: asNumber(data, 'tags'),
      datasources: asNumber(data, 'datasources'),
      playlists: asNumber(data, 'playlists'),
      stars: asNumber(data, 'stars'),
      alerts: asNumber(data, 'alerts'),
      activeAdmins: asNumber(data, 'activeAdmins'),
      activeEditors: asNumber(data, 'activeEditors'),
      activeViewers: asNumber(data, 'activeViewers'),
      activeUsers: asNumber(data, 'activeUsers'),
      activeSessions: asNumber(data, 'activeSessions'),
      statsJson: safeJson(data ?? {}, this.maxOutputBytes),
    }
  }

  async grafanaListPlugins(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: GrafanaPluginItem[]
  }> {
    const data = await this.grafanaRequest(
      'GET',
      '/api/plugins?embedded=true',
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaPlugin)
    return { connected: true, items }
  }

  async grafanaListDashboardVersions(
    uid: string,
    options: { limit?: number; start?: number; signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    items: GrafanaDashboardVersionItem[]
  }> {
    const params: string[] = []
    if (options.limit && options.limit > 0) params.push(`limit=${Math.floor(options.limit)}`)
    if (options.start !== undefined && options.start >= 0) params.push(`start=${Math.floor(options.start)}`)
    const suffix = params.length > 0 ? `?${params.join('&')}` : ''
    const data = await this.grafanaRequest(
      'GET',
      `/api/dashboards/uid/${encodeURIComponent(uid)}/versions${suffix}`,
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaDashboardVersion)
    return { connected: true, items }
  }

  async grafanaListDashboardSnapshots(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: GrafanaDashboardSnapshotItem[]
  }> {
    const data = await this.grafanaRequest(
      'GET',
      '/api/dashboard/snapshots',
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaDashboardSnapshot)
    return { connected: true, items }
  }

  async grafanaListAccessControlUserPermissions(
    userId: string | number,
    options: { scope?: string; signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    items: GrafanaAccessControlPermissionItem[]
  }> {
    const suffix = options.scope ? `?scope=${encodeURIComponent(options.scope)}` : ''
    const data = await this.grafanaRequest(
      'GET',
      `/api/access-control/users/${encodeURIComponent(String(userId))}/permissions${suffix}`,
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaAccessControlPermission)
    return { connected: true, items }
  }

  async grafanaListAccessControlTeamPermissions(
    teamId: string | number,
    options: { scope?: string; signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    items: GrafanaAccessControlPermissionItem[]
  }> {
    const suffix = options.scope ? `?scope=${encodeURIComponent(options.scope)}` : ''
    const data = await this.grafanaRequest(
      'GET',
      `/api/access-control/teams/${encodeURIComponent(String(teamId))}/permissions${suffix}`,
      options.signal,
    )
    const items = asArray(data).map(mapGrafanaAccessControlPermission)
    return { connected: true, items }
  }

  async grafanaGetOrgPreferences(options: { signal?: AbortSignal } = {}): Promise<GrafanaOrgPreferencesData> {
    const data = await this.grafanaRequest('GET', '/api/org/preferences', options.signal)
    return mapGrafanaOrgPreferences(data)
  }

  async grafanaGetCurrentUser(options: { signal?: AbortSignal } = {}): Promise<GrafanaCurrentUserData> {
    const data = await this.grafanaRequest('GET', '/api/user', options.signal)
    return mapGrafanaCurrentUser(data)
  }

  async grafanaListCurrentUserOrgs(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: GrafanaUserOrgItem[]
  }> {
    const data = await this.grafanaRequest('GET', '/api/user/orgs', options.signal)
    const items = asArray(data).map(mapGrafanaUserOrg)
    return { connected: true, items }
  }

  async grafanaListLibraryElements(
    options: {
      searchString?: string
      type?: string
      kind?: string
      perPage?: number
      page?: number
      signal?: AbortSignal
    } = {},
  ): Promise<GrafanaLibraryElementData> {
    const params: string[] = []
    if (options.searchString) params.push(`searchString=${encodeURIComponent(options.searchString)}`)
    if (options.type) params.push(`type=${encodeURIComponent(options.type)}`)
    if (options.kind) params.push(`kind=${encodeURIComponent(options.kind)}`)
    if (options.perPage && options.perPage > 0) params.push(`perPage=${Math.floor(options.perPage)}`)
    if (options.page && options.page > 0) params.push(`page=${Math.floor(options.page)}`)
    const suffix = params.length > 0 ? `?${params.join('&')}` : ''
    const data = await this.grafanaRequest(
      'GET',
      `/api/library-elements/search${suffix}`,
      options.signal,
    )
    const root = asRecord(data)
    const result = asRecord(root.result)
    const resultElements = asArray(result.elements)
    const rootElements = asArray(root.elements)
    const elements = resultElements.length > 0
      ? resultElements
      : rootElements.length > 0 ? rootElements : asArray(data)
    return {
      connected: true,
      totalCount: asNumber(result, 'totalCount')
        || asNumber(root, 'totalCount')
        || elements.length,
      page: asNumber(result, 'page') || asNumber(root, 'page') || 1,
      perPage: asNumber(result, 'perPage')
        || asNumber(root, 'perPage')
        || asNumber(result, 'per_page')
        || 0,
      items: elements.map(mapGrafanaLibraryElement),
    }
  }

  async grafanaGetLibraryElement(
    uid: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    item: GrafanaLibraryElementItem
  }> {
    const data = await this.grafanaRequest(
      'GET',
      `/api/library-elements/${encodeURIComponent(uid)}`,
      options.signal,
    )
    const root = asRecord(data)
    const result = asRecord(root.result)
    const source = asString(result, 'uid') ? result : root
    return { connected: true, item: mapGrafanaLibraryElement(source) }
  }

  async grafanaListPlaylists(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: GrafanaPlaylistItem[]
  }> {
    const data = await this.grafanaRequest('GET', '/api/playlists', options.signal)
    const items = asArray(data).map(mapGrafanaPlaylist)
    return { connected: true, items }
  }

  async grafanaGetPlaylist(
    uid: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<GrafanaPlaylistDetailData> {
    const data = await this.grafanaRequest(
      'GET',
      `/api/playlists/${encodeURIComponent(uid)}`,
      options.signal,
    )
    const root = asRecord(data)
    const result = asRecord(root.result)
    const source = asString(result, 'uid') ? result : root
    return { connected: true, item: mapGrafanaPlaylistDetail(source) }
  }

  async grafanaGetCurrentOrg(options: { signal?: AbortSignal } = {}): Promise<GrafanaCurrentOrgData> {
    const data = asRecord(await this.grafanaRequest('GET', '/api/org', options.signal))
    return {
      connected: true,
      id: asNumber(data, 'id'),
      name: asString(data, 'name'),
      addressJson: toJson(data.address),
      orgJson: safeJson(data ?? {}, this.maxOutputBytes),
    }
  }

  async deleteSeries(
    matchers: string[],
    options: { start?: string; end?: string; signal?: AbortSignal } = {},
  ): Promise<MonitoringWriteResult> {
    if (!this.allowWrite) return { ok: false, reason: writeDisabledReason() }
    try {
      const params = matchers.map(matcher => `match[]=${encodeURIComponent(matcher)}`).join('&')
      let path = `/api/v1/admin/tsdb/delete_series?${params}`
      if (options.start) path += `&start=${encodeURIComponent(options.start)}`
      if (options.end) path += `&end=${encodeURIComponent(options.end)}`
      await this.prometheusRequest('POST', path, undefined, options.signal)
      return { ok: true }
    } catch (error) {
      if (isInfrastructureError(error)) throw error
      return { ok: false, reason: error instanceof MonitoringError ? error.message : 'Could not delete Prometheus series.' }
    }
  }

  async getAlertmanagerStatus(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    uptime: string
    version: string
    statusJson: string
  }> {
    const data = await this.alertmanagerRequest('GET', '/api/v2/status', undefined, options.signal)
    const record = asRecord(data)
    const versionInfo = asRecord(record.versionInfo)
    return {
      connected: true,
      uptime: asString(record, 'uptime'),
      version: asString(versionInfo, 'version'),
      statusJson: safeJson(data ?? {}, this.maxOutputBytes),
    }
  }

  async listAlertmanagerAlerts(
    options: {
      filter?: string
      active?: boolean
      silenced?: boolean
      inhibited?: boolean
      receiver?: string
      signal?: AbortSignal
    } = {},
  ): Promise<{
    connected: boolean
    items: AlertmanagerAlertItem[]
  }> {
    const params: string[] = []
    if (options.filter) params.push(`filter=${encodeURIComponent(options.filter)}`)
    if (options.active === false) params.push('active=false')
    if (options.silenced === false) params.push('silenced=false')
    if (options.inhibited === false) params.push('inhibited=false')
    if (options.receiver) params.push(`receiver=${encodeURIComponent(options.receiver)}`)
    const suffix = params.length > 0 ? `?${params.join('&')}` : ''
    const data = await this.alertmanagerRequest('GET', `/api/v2/alerts${suffix}`, undefined, options.signal)
    const items = asArray(data).map(alert => {
      const record = asRecord(alert)
      return {
        fingerprint: asString(record, 'fingerprint'),
        startsAt: asString(record, 'startsAt'),
        endsAt: asString(record, 'endsAt'),
        statusJson: toJson(record.status),
        labelsJson: toJson(record.labels),
        annotationsJson: toJson(record.annotations),
        receiversJson: toJson(record.receivers),
      }
    })
    return { connected: true, items }
  }

  async listAlertGroups(
    options: { receiver?: string; signal?: AbortSignal } = {},
  ): Promise<{
    connected: boolean
    items: AlertmanagerGroupItem[]
  }> {
    const suffix = options.receiver ? `?receiver=${encodeURIComponent(options.receiver)}` : ''
    const data = await this.alertmanagerRequest('GET', `/api/v2/alerts/groups${suffix}`, undefined, options.signal)
    const items = asArray(data).map(group => {
      const record = asRecord(group)
      const alerts = asArray(record.alerts)
      return {
        receiver: asString(record, 'receiver'),
        labelsJson: toJson(record.labels),
        alertCount: alerts.length,
        alertsJson: safeJson(alerts, this.maxOutputBytes),
      }
    })
    return { connected: true, items }
  }

  async listSilences(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: AlertmanagerSilenceItem[]
  }> {
    const data = await this.alertmanagerRequest('GET', '/api/v2/silences', undefined, options.signal)
    const items = asArray(data).map(silence => {
      const record = asRecord(silence)
      return {
        id: asString(record, 'id'),
        createdBy: asString(record, 'createdBy'),
        comment: asString(record, 'comment'),
        startsAt: asString(record, 'startsAt'),
        endsAt: asString(record, 'endsAt'),
        matchersJson: toJson(record.matchers),
        statusJson: toJson(record.status),
      }
    })
    return { connected: true, items }
  }

  async listReceivers(options: { signal?: AbortSignal } = {}): Promise<{
    connected: boolean
    items: AlertmanagerReceiverItem[]
  }> {
    const data = await this.alertmanagerRequest('GET', '/api/v2/receivers', undefined, options.signal)
    const items = asArray(data).map(receiver => ({ name: asString(asRecord(receiver), 'name') }))
    return { connected: true, items }
  }

  async createSilence(
    input: {
      matchers: unknown[]
      startsAt: string
      endsAt: string
      createdBy: string
      comment: string
      signal?: AbortSignal
    },
  ): Promise<MonitoringWriteResult> {
    if (!this.allowWrite) return { ok: false, reason: writeDisabledReason() }
    try {
      const data = await this.alertmanagerRequest(
        'POST',
        '/api/v2/silences',
        {
          matchers: input.matchers,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          createdBy: input.createdBy,
          comment: input.comment,
        },
        input.signal,
      )
      return { ok: true, id: asString(asRecord(data), 'silenceID') || undefined }
    } catch (error) {
      if (isInfrastructureError(error)) throw error
      return { ok: false, reason: error instanceof MonitoringError ? error.message : 'Could not create Alertmanager silence.' }
    }
  }

  async deleteSilence(silenceId: string, signal?: AbortSignal): Promise<MonitoringWriteResult> {
    if (!this.allowWrite) return { ok: false, reason: writeDisabledReason() }
    try {
      await this.alertmanagerRequest('DELETE', `/api/v2/silence/${encodeURIComponent(silenceId)}`, undefined, signal)
      return { ok: true }
    } catch (error) {
      if (isInfrastructureError(error)) throw error
      return { ok: false, reason: error instanceof MonitoringError ? error.message : 'Could not delete Alertmanager silence.' }
    }
  }

  async sendAlerts(alerts: unknown[], signal?: AbortSignal): Promise<MonitoringWriteResult> {
    if (!this.allowWrite) return { ok: false, reason: writeDisabledReason() }
    try {
      await this.alertmanagerRequest('POST', '/api/v2/alerts', { alerts }, signal)
      return { ok: true }
    } catch (error) {
      if (isInfrastructureError(error)) throw error
      return { ok: false, reason: error instanceof MonitoringError ? error.message : 'Could not send Alertmanager alerts.' }
    }
  }
}
