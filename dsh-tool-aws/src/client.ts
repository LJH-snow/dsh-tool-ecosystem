/** AWS read-only client with SigV4 signing and injected fetch for testability. */

import { assertSafeUrl, normalizeEndpoint, type LookupImpl, UrlSecurityError } from './url-security.js'
import { signRequest } from './signer.js'

export interface AwsClientOptions {
  /** AWS region, e.g. us-east-1. */
  region?: string
  /** AWS access key id. */
  accessKeyId?: string
  /** AWS secret access key. */
  secretAccessKey?: string
  /** Session token for temporary credentials. */
  sessionToken?: string
  /** Custom endpoint origin; must be a public HTTP(S) root URL. */
  endpoint?: string
  /** Request timeout in milliseconds. 0 disables the timeout. */
  timeoutMs?: number
  /** Fixed clock for deterministic signature tests. */
  now?: Date
  fetchImpl?: typeof fetch
  /** Test-only DNS lookup override; production uses node:dns/promises. */
  lookupImpl?: LookupImpl
}

export class AwsError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string | null = null) {
    super(message)
    this.name = 'AwsError'
  }
}

export interface Ec2InstanceInfo {
  instanceId: string
  instanceType: string
  state: string
  az: string
  privateIp: string
  publicIp: string
  keyName: string
  tags: string
  launchTime: string
  vpcId: string
  subnetId: string
  securityGroups: string
  monitoring: string
}

export interface S3BucketInfo {
  name: string
  creationDate: string
  region: string
}

export interface LambdaFunctionInfo {
  name: string
  runtime: string
  handler: string
  description: string
  role: string
  lastModified: string
  memorySize: number
  timeout: number
  codeSize: number
  state: string
  updateStatus: string
}

export interface CloudWatchLogGroupInfo {
  name: string
  creationTime: string
  retentionDays: number
  storedBytes: number
}

export interface CloudWatchLogEventInfo {
  timestamp: string
  message: string
  logStreamName: string
}

export interface CloudWatchMetricInfo {
  namespace: string
  name: string
  dimensions: string
}

export interface StsIdentityInfo {
  userId: string
  account: string
  arn: string
}

export interface EcrRepositoryInfo {
  registryId: string
  name: string
  arn: string
  uri: string
  createdAt: string
  tagMutability: string
  scanOnPush: boolean
}

export interface EcrImageIdInfo {
  tag: string
  digest: string
}

export interface EcrImageInfo {
  digest: string
  tags: string
  sizeBytes: number
  pushedAt: string
  scanStatus: string
  criticalCount: number
  highCount: number
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
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

type XmlNode = {
  name: string
  text: string
  children: XmlNode[]
}

const xmlArrayChildNames = new Set(['item', 'member', 'Bucket', 'logGroup', 'event'])

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/g, '&')
}

function stripXmlNamespace(name: string): string {
  const separator = name.lastIndexOf(':')
  return separator >= 0 ? name.slice(separator + 1) : name
}

function xmlNodeValue(node: XmlNode): unknown {
  if (!node.children.length) return decodeXmlText(node.text.trim())
  const childNames = node.children.map(child => child.name)
  if (childNames.every(name => name === childNames[0]) && xmlArrayChildNames.has(childNames[0])) {
    return node.children.map(xmlNodeValue)
  }
  const result: Record<string, unknown> = {}
  for (const child of node.children) {
    const value = xmlNodeValue(child)
    if (Object.hasOwn(result, child.name)) {
      const previous = result[child.name]
      result[child.name] = Array.isArray(previous) ? [...previous, value] : [previous, value]
    } else {
      result[child.name] = value
    }
  }
  return result
}

function parseXml(xml: string): Record<string, unknown> {
  const stack: XmlNode[] = []
  let root: XmlNode | null = null
  const tokenPattern = /<[^>]+>|[^<]+/g
  for (const token of xml.match(tokenPattern) ?? []) {
    if (!token) continue
    if (token.startsWith('<')) {
      if (token.startsWith('<?') || token.startsWith('<!')) continue
      if (token.startsWith('</')) {
        stack.pop()
        continue
      }
      const tagMatch = token.match(/^<\\s*([^\\s/>]+)/)
      if (!tagMatch) continue
      const node: XmlNode = { name: stripXmlNamespace(tagMatch[1]), text: '', children: [] }
      const parent = stack[stack.length - 1]
      if (parent) parent.children.push(node)
      else root = node
      if (!token.endsWith('/>')) stack.push(node)
    } else if (stack.length) {
      stack[stack.length - 1].text += token
    }
  }
  if (!root) return {}
  return { [root.name]: xmlNodeValue(root) }
}

function unwrapQueryResponse(value: unknown): Record<string, unknown> {
  const record = asRecord(value)
  const responseKey = Object.keys(record).find(key => key.endsWith('Response'))
  if (responseKey && Object.keys(record).length === 1) return asRecord(record[responseKey])
  return record
}

function mapEc2Instance(data: unknown): Ec2InstanceInfo {
  const r = asRecord(data)
  const placement = asRecord(r.placement)
  const tags = asArray(r.tagSet ?? r.tag_set).map((t: unknown) => {
    const tr = asRecord(t)
    return `${asString(tr, 'key')}=${asString(tr, 'value')}`
  })
  const groups = asArray(r.groupSet ?? r.group_set).map((g: unknown) => asString(asRecord(g), 'groupId') || asString(asRecord(g), 'group_name'))
  const nicSet = asArray(r.networkInterfaceSet)
  const nic = nicSet.length ? asRecord(nicSet[0]) : {}
  return {
    instanceId: asString(r, 'instanceId'),
    instanceType: asString(r, 'instanceType'),
    state: asString(asRecord(r.instanceState), 'name'),
    az: asString(placement, 'availabilityZone'),
    privateIp: asString(r, 'privateIpAddress') || asString(asRecord(r.privateIpAddress), 'value') || asString(nic, 'privateIpAddress'),
    publicIp: asString(r, 'ipAddress') || asString(asRecord(r.ipAddress), 'value') || asString(asRecord(nic.association), 'publicIp'),
    keyName: asString(r, 'keyName'),
    tags: tags.join(', '),
    launchTime: asString(r, 'launchTime'),
    vpcId: asString(r, 'vpcId'),
    subnetId: asString(r, 'subnetId'),
    securityGroups: groups.join(', '),
    monitoring: asString(asRecord(r.monitoring), 'state'),
  }
}

function mapS3Bucket(data: unknown): S3BucketInfo {
  const r = asRecord(data)
  return {
    name: asString(r, 'Name'),
    creationDate: asString(r, 'CreationDate'),
    region: asString(r, 'Region') || '',
  }
}

function mapLambdaFunction(data: unknown): LambdaFunctionInfo {
  const r = asRecord(data)
  return {
    name: asString(r, 'FunctionName'),
    runtime: asString(r, 'Runtime'),
    handler: asString(r, 'Handler'),
    description: asString(r, 'Description'),
    role: asString(r, 'Role'),
    lastModified: asString(r, 'LastModified'),
    memorySize: asNumber(r, 'MemorySize'),
    timeout: asNumber(r, 'Timeout'),
    codeSize: asNumber(r, 'CodeSize'),
    state: asString(r, 'State'),
    updateStatus: asString(r, 'LastUpdateStatus'),
  }
}

function mapLogGroup(data: unknown): CloudWatchLogGroupInfo {
  const r = asRecord(data)
  return {
    name: asString(r, 'logGroupName'),
    creationTime: asString(r, 'creationTime'),
    retentionDays: asNumber(r, 'retentionInDays'),
    storedBytes: asNumber(r, 'storedBytes'),
  }
}

function mapLogEvent(data: unknown): CloudWatchLogEventInfo {
  const r = asRecord(data)
  return {
    timestamp: asString(r, 'timestamp'),
    message: asString(r, 'message'),
    logStreamName: asString(r, 'logStreamName'),
  }
}

function mapMetric(data: unknown): CloudWatchMetricInfo {
  const r = asRecord(data)
  const dims = asArray(r.Dimensions).map((d: unknown) => {
    const dr = asRecord(d)
    return `${asString(dr, 'Name')}=${asString(dr, 'Value')}`
  })
  return {
    namespace: asString(r, 'Namespace'),
    name: asString(r, 'MetricName'),
    dimensions: dims.join(', '),
  }
}

function mapStsIdentity(data: unknown): StsIdentityInfo {
  const r = queryPayload(data)
  const nested = asRecord(r.GetCallerIdentityResult)
  const result = Object.keys(nested).length ? nested : r
  return {
    userId: asString(result, 'UserId'),
    account: asString(result, 'Account'),
    arn: asString(result, 'Arn'),
  }
}

function mapEcrRepository(data: unknown): EcrRepositoryInfo {
  const r = asRecord(data)
  return {
    registryId: asString(r, 'registryId'),
    name: asString(r, 'repositoryName'),
    arn: asString(r, 'repositoryArn'),
    uri: asString(r, 'repositoryUri'),
    createdAt: asString(r, 'createdAt'),
    tagMutability: asString(r, 'imageTagMutability'),
    scanOnPush: asRecord(r.imageScanningConfiguration).scanOnPush === true,
  }
}

function mapEcrImageId(data: unknown): EcrImageIdInfo {
  const r = asRecord(data)
  return { tag: asString(r, 'imageTag'), digest: asString(r, 'imageDigest') }
}

function mapEcrImage(data: unknown): EcrImageInfo {
  const r = asRecord(data)
  const severity = asRecord(asRecord(r.imageScanFindingsSummary).findingSeverityCounts)
  return {
    digest: asString(r, 'imageDigest'),
    tags: asArray(r.imageTags).map(String).join(', '),
    sizeBytes: asNumber(r, 'imageSizeInBytes'),
    pushedAt: asString(r, 'imagePushedAt'),
    scanStatus: asString(asRecord(r.imageScanStatus), 'status'),
    criticalCount: asNumber(severity, 'CRITICAL'),
    highCount: asNumber(severity, 'HIGH'),
  }
}

function queryPayload(data: unknown): Record<string, unknown> {
  const root = asRecord(data)
  const responseKey = Object.keys(root).find(key => key.endsWith('Response'))
  const response = responseKey ? asRecord(root[responseKey]) : root
  const resultKey = Object.keys(response).find(key => key.endsWith('Result'))
  return resultKey ? asRecord(response[resultKey]) : response
}

export class AwsClient {
  private readonly region: string
  private readonly accessKeyId: string
  private readonly secretAccessKey: string
  private readonly sessionToken: string
  private readonly endpoint: string
  private readonly timeoutMs: number
  private readonly now: Date | undefined
  private readonly fetchImpl: typeof fetch
  private readonly lookupImpl: LookupImpl | undefined

  constructor(options: AwsClientOptions = {}) {
    this.region = options.region ?? 'us-east-1'
    this.accessKeyId = options.accessKeyId ?? ''
    this.secretAccessKey = options.secretAccessKey ?? ''
    this.sessionToken = options.sessionToken ?? ''
    try {
      this.endpoint = normalizeEndpoint(options.endpoint)
    } catch (error) {
      if (error instanceof UrlSecurityError) throw new AwsError(error.message, 400, 'InvalidEndpoint')
      throw error
    }
    this.timeoutMs = options.timeoutMs ?? 15000
    this.now = options.now
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.lookupImpl = options.lookupImpl
  }

  hasCredentials(): boolean {
    return Boolean(this.accessKeyId && this.secretAccessKey)
  }

  private queryUrl(service: string): string {
    return this.endpoint ? `${this.endpoint}/` : `https://${service}.${this.region}.amazonaws.com/`
  }

  private async query(
    service: string,
    action: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (!this.hasCredentials()) throw new AwsError('AWS credentials not configured.', 401)
    const url = new URL(this.queryUrl(service))
    const versions: Record<string, string> = {
      sts: '2011-06-15',
      ec2: '2016-11-15',
      logs: '2014-03-28',
      monitoring: '2010-08-01',
    }
    const bodyParams: Record<string, string> = { Action: action, Version: versions[service] ?? '2016-11-15' }
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue
      bodyParams[key] = String(value)
    }
    const body = new URLSearchParams(bodyParams).toString()
    const headers = await signRequest({
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      sessionToken: this.sessionToken,
      region: this.region,
      service,
      host: url.host,
      method: 'POST',
      canonicalUri: '/',
      query: {},
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body,
      now: this.now,
    })
    const raw = await this.send(url, 'POST', headers, body, signal)
    return typeof raw === 'string' ? parseXml(raw) : asRecord(raw)
  }

  private async json(
    service: string,
    method: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!this.hasCredentials()) throw new AwsError('AWS credentials not configured.', 401)
    const url = this.endpoint
      ? new URL(path.replace(/^\//, ''), `${this.endpoint}/`)
      : new URL(`https://${service}.${this.region}.amazonaws.com/${path.replace(/^\//, '')}`)
    const headers = await signRequest({
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      sessionToken: this.sessionToken,
      region: this.region,
      service,
      host: url.host,
      method,
      canonicalUri: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: { 'content-type': 'application/json' },
      body: '',
      now: this.now,
    })
    return await this.send(url, method, headers, undefined, signal)
  }

  /** ECR JSON-RPC style call: application/x-amz-json-1.1 with an X-Amz-Target header. */
  private async ecr(action: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (!this.hasCredentials()) throw new AwsError('AWS credentials not configured.', 401)
    const url = this.endpoint ? new URL('/', `${this.endpoint}/`) : new URL(`https://api.ecr.${this.region}.amazonaws.com/`)
    const payload = JSON.stringify(body)
    const headers = await signRequest({
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      sessionToken: this.sessionToken,
      region: this.region,
      service: 'ecr',
      host: url.host,
      method: 'POST',
      canonicalUri: '/',
      query: {},
      headers: {
        'content-type': 'application/x-amz-json-1.1',
        'x-amz-target': `AmazonEC2ContainerRegistry_V20150921.${action}`,
      },
      body: payload,
      now: this.now,
    })
    return asRecord(await this.send(url, 'POST', headers, payload, signal))
  }

  private async send(
    url: URL,
    method: string,
    headers: Record<string, string>,
    body: string | undefined,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const controller = new AbortController()
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
    const timer = this.timeoutMs > 0 ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined
    try {
      try {
        await assertSafeUrl(url, this.lookupImpl)
      } catch (error) {
        if (error instanceof UrlSecurityError) {
          throw new AwsError('AWS endpoint is not allowed for network access.', 400, 'UnsafeEndpoint')
        }
        throw error
      }
      const response = await this.fetchImpl(url.toString(), {
        method,
        headers,
        body,
        signal: combined,
      })
      const text = await response.text()
      if (!response.ok) {
        let code: string | null = null
        try {
          const json = JSON.parse(text) as Record<string, unknown>
          const type = json.__type || (asRecord(json.Error).Code)
          code = typeof type === 'string' ? type : null
        } catch { /* non-json error body */ }
        throw new AwsError(`AWS ${method} ${url.pathname} returned HTTP ${response.status}: ${text.slice(0, 300)}`, response.status, code)
      }
      if (!text) return {}
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('json')) return JSON.parse(text)
      return text
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async stsGetCallerIdentity(signal?: AbortSignal): Promise<StsIdentityInfo> {
    const raw = await this.query('sts', 'GetCallerIdentity', {}, signal)
    return mapStsIdentity(raw)
  }

  async listEc2Instances(options: {
    instanceIds?: string[]
    filters?: Record<string, string>
    nextToken?: string
    signal?: AbortSignal
  } = {}): Promise<{ items: Ec2InstanceInfo[]; nextToken: string }> {
    const params: Record<string, unknown> = {}
    options.instanceIds?.forEach((id, i) => { params[`InstanceId.${i + 1}`] = id })
    const filterEntries = Object.entries(options.filters ?? {})
    filterEntries.forEach(([key, value], i) => {
      params[`Filter.${i + 1}.Name`] = key
      params[`Filter.${i + 1}.Value.1`] = value
    })
    if (options.nextToken) params.NextToken = options.nextToken
    params.MaxResults = 200
    const raw = await this.query('ec2', 'DescribeInstances', params, options.signal)
    const root = queryPayload(raw)
    const reservations = asArray(root.reservationSet)
    const items = reservations.flatMap((res: unknown) => asArray(asRecord(res).instancesSet).map(mapEc2Instance))
    return { items, nextToken: asString(root, 'nextToken') || asString(root, 'NextToken') }
  }

  async listS3Buckets(signal?: AbortSignal): Promise<{ items: S3BucketInfo[] }> {
    // S3 ListBuckets is a REST API over the s3 global endpoint; sign as s3.
    const service = 's3'
    const host = 's3.amazonaws.com'
    const url = new URL(this.endpoint || `https://${host}`)
    const headers = await signRequest({
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      sessionToken: this.sessionToken,
      region: this.region,
      service,
      host: url.host,
      method: 'GET',
      canonicalUri: '/',
      query: {},
      headers: {},
      body: '',
      now: this.now,
    })
    const raw = await this.send(url, 'GET', headers, undefined, signal)
    const xml = typeof raw === 'string' ? raw : ''
    const items = parseS3Buckets(xml)
    return { items }
  }

  async listLambdaFunctions(options: {
    marker?: string
    signal?: AbortSignal
  } = {}): Promise<{ items: LambdaFunctionInfo[]; nextMarker: string }> {
    let path = '/2015-03-31/functions'
    if (options.marker) path += `?Marker=${encodeURIComponent(options.marker)}`
    const raw = await this.json('lambda', 'GET', path, options.signal)
    const record = asRecord(raw)
    return {
      items: asArray(record.Functions).map(mapLambdaFunction),
      nextMarker: asString(record, 'NextMarker'),
    }
  }

  async listCloudWatchLogGroups(options: {
    prefix?: string
    nextToken?: string
    signal?: AbortSignal
  } = {}): Promise<{ items: CloudWatchLogGroupInfo[]; nextToken: string }> {
    const raw = await this.query('logs', 'DescribeLogGroups', {
      'logGroupNamePrefix': options.prefix,
      'nextToken': options.nextToken,
      'limit': 50,
    }, options.signal)
    const root = queryPayload(raw)
    const logGroups = asArray(root.logGroups)
    return { items: logGroups.map(mapLogGroup), nextToken: asString(root, 'nextToken') || asString(root, 'NextToken') }
  }

  async getCloudWatchLogEvents(options: {
    logGroupName: string
    logStreamName?: string
    startTime?: number
    endTime?: number
    limit?: number
    nextToken?: string
    signal?: AbortSignal
  }): Promise<{ items: CloudWatchLogEventInfo[]; nextForwardToken: string }> {
    const raw = await this.query('logs', 'FilterLogEvents', {
      'logGroupName': options.logGroupName,
      'logStreamNames.member.1': options.logStreamName,
      'startTime': options.startTime,
      'endTime': options.endTime,
      'limit': options.limit ?? 50,
      'nextToken': options.nextToken,
    }, options.signal)
    const root = queryPayload(raw)
    const events = asArray(root.events)
    return {
      items: events.map(mapLogEvent),
      nextForwardToken: asString(root, 'nextToken'),
    }
  }

  async listCloudWatchMetrics(options: {
    namespace?: string
    metricName?: string
    signal?: AbortSignal
  } = {}): Promise<{ items: CloudWatchMetricInfo[] }> {
    const raw = await this.query('monitoring', 'ListMetrics', {
      'Namespace': options.namespace,
      'MetricName': options.metricName,
    }, options.signal)
    const root = queryPayload(raw)
    const metrics = asArray(root.metrics)
    return { items: metrics.map(mapMetric) }
  }

  async listEcrRepositories(options: {
    nextToken?: string
    signal?: AbortSignal
  } = {}): Promise<{ items: EcrRepositoryInfo[]; nextToken: string }> {
    const raw = await this.ecr('DescribeRepositories', { maxResults: 100, nextToken: options.nextToken }, options.signal)
    return { items: asArray(raw.repositories).map(mapEcrRepository), nextToken: asString(raw, 'nextToken') }
  }

  async listEcrImages(options: {
    repositoryName: string
    tagStatus?: string
    nextToken?: string
    signal?: AbortSignal
  }): Promise<{ items: EcrImageIdInfo[]; nextToken: string }> {
    const body: Record<string, unknown> = { repositoryName: options.repositoryName, maxResults: 100 }
    if (options.tagStatus) body.filter = { tagStatus: options.tagStatus }
    if (options.nextToken) body.nextToken = options.nextToken
    const raw = await this.ecr('ListImages', body, options.signal)
    return { items: asArray(raw.imageIds).map(mapEcrImageId), nextToken: asString(raw, 'nextToken') }
  }

  async describeEcrImages(options: {
    repositoryName: string
    imageTag?: string
    nextToken?: string
    signal?: AbortSignal
  }): Promise<{ items: EcrImageInfo[]; nextToken: string }> {
    const body: Record<string, unknown> = { repositoryName: options.repositoryName, maxResults: 100 }
    if (options.imageTag) body.imageIds = [{ imageTag: options.imageTag }]
    if (options.nextToken) body.nextToken = options.nextToken
    const raw = await this.ecr('DescribeImages', body, options.signal)
    return { items: asArray(raw.imageDetails).map(mapEcrImage), nextToken: asString(raw, 'nextToken') }
  }
}

function parseS3Buckets(xml: string): S3BucketInfo[] {
  const items: S3BucketInfo[] = []
  const bucketRe = /<Bucket>([\s\S]*?)<\/Bucket>/g
  let match: RegExpExecArray | null
  while ((match = bucketRe.exec(xml)) !== null) {
    const block = match[1]
    const name = /<Name>([^<]*)<\/Name>/.exec(block)?.[1] ?? ''
    const date = /<CreationDate>([^<]*)<\/CreationDate>/.exec(block)?.[1] ?? ''
    items.push({ name, creationDate: date, region: '' })
  }
  return items
}