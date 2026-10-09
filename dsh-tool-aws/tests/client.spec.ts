import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { AwsClient, AwsError, type AwsClientOptions } from '../src/client.ts'

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z')
const stablePublicLookup: NonNullable<AwsClientOptions['lookupImpl']> = async () => [{ address: '93.184.216.34', family: 4 }]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function requestInit(fetchImpl: ReturnType<typeof vi.fn>, callIndex = 0): RequestInit {
  return (fetchImpl.mock.calls[callIndex] as [string, RequestInit])[1]
}

// Test-only fake credentials for SigV4 math; never real AWS credentials.
const creds = { accessKeyId: 'EXAMPLEKEYIDFORTESTS', secretAccessKey: 'example-secret-key-for-sigv4-tests-only' }

describe('AwsClient', () => {
  it('returns caller identity from STS', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      GetCallerIdentityResponse: {
        GetCallerIdentityResult: {
          UserId: 'AIDAJQABLZS4A3QDU576Q',
          Account: '123456789012',
          Arn: 'arn:aws:iam::123456789012:user/Alice',
        },
      },
    }))
    const client = new AwsClient({ ...creds, region: 'us-east-1', now: FIXED_NOW, fetchImpl, lookupImpl: stablePublicLookup })
    const identity = await client.stsGetCallerIdentity()

    expect(identity).toMatchObject({ account: '123456789012', userId: 'AIDAJQABLZS4A3QDU576Q', arn: 'arn:aws:iam::123456789012:user/Alice' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://sts.us-east-1.amazonaws.com/')
    expect(init.method).toBe('POST')
    expect(init.body).toContain('Action=GetCallerIdentity')
    expect(init.body).toContain('Version=2011-06-15')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toContain('AWS4-HMAC-SHA256 Credential=EXAMPLEKEYIDFORTESTS/')
    expect(headers.authorization).toContain('/sts/aws4_request')
    expect(headers['x-amz-date']).toBe('20260101T000000Z')
  })

  it('lists EC2 instances and maps tags, filters, and pagination', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      DescribeInstancesResponse: {
        reservationSet: [
          {
            instancesSet: [
              {
                instanceId: 'i-0abc123',
                instanceType: 't3.micro',
                instanceState: { name: 'running' },
                placement: { availabilityZone: 'us-east-1a' },
                privateIpAddress: '10.0.0.5',
                ipAddress: '54.1.2.3',
                tagSet: [{ key: 'Name', value: 'web-1' }, { key: 'Env', value: 'prod' }],
                groupSet: [{ groupId: 'sg-123' }],
              },
            ],
          },
        ],
        nextToken: 'tok2',
      },
    }))
    const client = new AwsClient({ ...creds, region: 'us-east-1', fetchImpl, lookupImpl: stablePublicLookup })
    const result = await client.listEc2Instances({ filters: { 'tag:Name': 'web' } })

    expect(result.items[0]).toMatchObject({
      instanceId: 'i-0abc123',
      instanceType: 't3.micro',
      state: 'running',
      az: 'us-east-1a',
      privateIp: '10.0.0.5',
      publicIp: '54.1.2.3',
      tags: 'Name=web-1, Env=prod',
      securityGroups: 'sg-123',
    })
    expect(result.nextToken).toBe('tok2')
    const body = String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body)
    expect(body).toContain('Action=DescribeInstances')
    expect(body).toContain('Filter.1.Name=tag%3AName')
    expect(body).toContain('Filter.1.Value.1=web')
  })

  it('parses S3 bucket list from XML', async () => {
    const xml = '<?xml version="1.0"?><ListAllMyBucketsResult><Buckets><Bucket><Name>my-bucket</Name><CreationDate>2025-01-02T03:04:05.000Z</CreationDate></Bucket></Buckets></ListAllMyBucketsResult>'
    const fetchImpl = vi.fn(async () => new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } }))
    const client = new AwsClient({ ...creds, region: 'us-east-1', fetchImpl, lookupImpl: stablePublicLookup })
    const result = await client.listS3Buckets()

    expect(result.items).toEqual([{ name: 'my-bucket', creationDate: '2025-01-02T03:04:05.000Z', region: '' }])
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://s3.amazonaws.com/')
    expect(init.method).toBe('GET')
  })

  it('lists Lambda functions with pagination', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      Functions: [
        { FunctionName: 'my-fn', Runtime: 'nodejs20.x', Handler: 'index.handler', Role: 'arn:aws:iam::1:role/r', LastModified: '2025-01-01', MemorySize: 256, Timeout: 30, CodeSize: 1234, State: 'Active' },
      ],
      NextMarker: 'marker2',
    }))
    const client = new AwsClient({ ...creds, region: 'us-east-1', fetchImpl, lookupImpl: stablePublicLookup })
    const result = await client.listLambdaFunctions({ marker: 'marker1' })

    expect(result.items[0]).toMatchObject({ name: 'my-fn', runtime: 'nodejs20.x', handler: 'index.handler', memorySize: 256, timeout: 30, state: 'Active' })
    expect(result.nextMarker).toBe('marker2')
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/2015-03-31/functions')
    expect(url).toContain('Marker=marker1')
  })

  it('lists CloudWatch log groups', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      DescribeLogGroupsResponse: { logGroups: [{ logGroupName: '/aws/lambda/my-fn', retentionInDays: 14, storedBytes: 1000 }] },
    }))
    const client = new AwsClient({ ...creds, region: 'us-east-1', fetchImpl, lookupImpl: stablePublicLookup })
    const result = await client.listCloudWatchLogGroups({ prefix: '/aws/lambda' })

    expect(result.items[0]).toMatchObject({ name: '/aws/lambda/my-fn', retentionDays: 14, storedBytes: 1000 })
    const body = String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body)
    expect(body).toContain('Action=DescribeLogGroups')
    expect(body).toContain('logGroupNamePrefix=%2Faws%2Flambda')
  })

  it('filters log events by time range and stream', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      FilterLogEventsResponse: { events: [{ timestamp: '1735689600000', logStreamName: 'stream-1', message: 'hello world' }] },
    }))
    const client = new AwsClient({ ...creds, region: 'us-east-1', fetchImpl, lookupImpl: stablePublicLookup })
    const result = await client.getCloudWatchLogEvents({ logGroupName: '/aws/lambda/my-fn', logStreamName: 'stream-1', startTime: 1735689600000, endTime: 1735776000000 })

    expect(result.items[0]).toMatchObject({ timestamp: '1735689600000', logStreamName: 'stream-1', message: 'hello world' })
    const body = String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body)
    expect(body).toContain('Action=FilterLogEvents')
    expect(body).toContain('logStreamNames.member.1=stream-1')
    expect(body).toContain('startTime=1735689600000')
  })

  it('lists CloudWatch metrics', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      ListMetricsResponse: { metrics: [{ Namespace: 'AWS/EC2', MetricName: 'CPUUtilization', Dimensions: [{ Name: 'InstanceId', Value: 'i-123' }] }] },
    }))
    const client = new AwsClient({ ...creds, region: 'us-east-1', fetchImpl, lookupImpl: stablePublicLookup })
    const result = await client.listCloudWatchMetrics({ namespace: 'AWS/EC2' })

    expect(result.items[0]).toMatchObject({ namespace: 'AWS/EC2', name: 'CPUUtilization', dimensions: 'InstanceId=i-123' })
    const body = String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body)
    expect(body).toContain('Action=ListMetrics')
    expect(body).toContain('Namespace=AWS%2FEC2')
  })

  it('uses a custom root endpoint for every service path', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ Functions: [] }))
    const client = new AwsClient({ ...creds, region: 'us-east-1', endpoint: 'https://aws-api.example.test/', fetchImpl, lookupImpl: stablePublicLookup })
    await client.listLambdaFunctions()

    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://aws-api.example.test/2015-03-31/functions')
  })

  it('rejects unsafe custom endpoint URLs during construction', () => {
    for (const endpoint of [
      'aws-api.example.test',
      'ftp://aws-api.example.test/',
      'https://user:secret@aws-api.example.test/',
      'https://aws-api.example.test/api',
      'https://aws-api.example.test/?token=secret',
      'https://aws-api.example.test/#fragment',
    ]) {
      expect(() => new AwsClient({ endpoint })).toThrow(AwsError)
    }
  })

  it('rejects literal local, private, and reserved endpoint addresses before fetch', async () => {
    for (const address of [
      'localhost',
      '127.0.0.1',
      '10.0.0.1',
      '100.64.0.1',
      '169.254.169.254',
      '192.0.2.1',
      '198.18.0.1',
      '224.0.0.1',
      '[::1]',
      '[fc00::1]',
      '[fe80::1]',
      '[2001:db8::1]',
      '[ff02::1]',
      // IANA special-purpose blocks that previously slipped through.
      '192.175.48.1',
      '[fec0::1]',
      '[2001:3::1]',
      '[2001:4:112::1]',
      '[2001:20::1]',
      '[2001:30::1]',
      '[5f00::1]',
      '[100:0:0:1::1]',
      '[2620:4f:8000::1]',
    ]) {
      const fetchImpl = vi.fn()
      const client = new AwsClient({ ...creds, endpoint: `https://${address}/`, fetchImpl })
      await expect(client.stsGetCallerIdentity()).rejects.toMatchObject({ name: 'AwsError', code: 'UnsafeEndpoint' })
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('fails closed when DNS resolves to a private address or fails', async () => {
    const privateFetch = vi.fn()
    const privateLookup: NonNullable<AwsClientOptions['lookupImpl']> = async () => [{ address: '192.168.1.10', family: 4 }]
    const privateClient = new AwsClient({ ...creds, endpoint: 'https://private.example.test/', fetchImpl: privateFetch, lookupImpl: privateLookup })
    await expect(privateClient.stsGetCallerIdentity()).rejects.toThrow(AwsError)
    expect(privateFetch).not.toHaveBeenCalled()

    const failingFetch = vi.fn()
    const failingLookup: NonNullable<AwsClientOptions['lookupImpl']> = async () => { throw new Error('DNS failure') }
    const failingClient = new AwsClient({ ...creds, endpoint: 'https://unresolvable.example.test/', fetchImpl: failingFetch, lookupImpl: failingLookup })
    await expect(failingClient.stsGetCallerIdentity()).rejects.toThrow(AwsError)
    expect(failingFetch).not.toHaveBeenCalled()
  })

  it('throws AwsError without credentials', async () => {
    const fetchImpl = vi.fn()
    const client = new AwsClient({ region: 'us-east-1', fetchImpl, lookupImpl: stablePublicLookup })
    await expect(client.stsGetCallerIdentity()).rejects.toThrow(AwsError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('throws AwsError on non-OK HTTP response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ __type: 'AccessDeniedException' }, 403))
    const client = new AwsClient({ ...creds, region: 'us-east-1', fetchImpl, lookupImpl: stablePublicLookup })
    await expect(client.listLambdaFunctions()).rejects.toThrow(AwsError)
  })

  it('lists ECR repositories via the x-amz-json protocol', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      repositories: [{
        repositoryName: 'app', repositoryArn: 'arn:aws:ecr:us-east-1:123456789012:repository/app', registryId: '123456789012',
        repositoryUri: '123456789012.dkr.ecr.us-east-1.amazonaws.com/app', createdAt: '2026-01-01T00:00:00Z',
        imageTagMutability: 'MUTABLE', imageScanningConfiguration: { scanOnPush: true },
      }],
      nextToken: 'tok2',
    }))
    const client = new AwsClient({ ...creds, region: 'us-east-1', fetchImpl, lookupImpl: stablePublicLookup })
    const result = await client.listEcrRepositories({ nextToken: 'tok1' })

    expect(result.items[0]).toMatchObject({ name: 'app', registryId: '123456789012', tagMutability: 'MUTABLE', scanOnPush: true })
    expect(result.nextToken).toBe('tok2')
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.ecr.us-east-1.amazonaws.com/')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['content-type']).toBe('application/x-amz-json-1.1')
    expect(headers['x-amz-target']).toBe('AmazonEC2ContainerRegistry_V20150921.DescribeRepositories')
    expect(String(init.body)).toContain('"nextToken":"tok1"')
  })

  it('lists ECR image ids with a tag-status filter', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ imageIds: [{ imageDigest: 'sha256:abc', imageTag: 'v1' }, { imageDigest: 'sha256:def' }], nextToken: 'tok2' }))
    const client = new AwsClient({ ...creds, region: 'us-east-1', fetchImpl, lookupImpl: stablePublicLookup })
    const result = await client.listEcrImages({ repositoryName: 'app', tagStatus: 'ANY' })

    expect(result.items[0]).toMatchObject({ tag: 'v1', digest: 'sha256:abc' })
    expect(result.items[1]).toMatchObject({ tag: '', digest: 'sha256:def' })
    expect(result.nextToken).toBe('tok2')
    const body = String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body)
    expect(body).toContain('"repositoryName":"app"')
    expect(body).toContain('"tagStatus":"ANY"')
  })

  it('describes ECR images with scan severity counts', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      imageDetails: [{
        repositoryName: 'app', imageDigest: 'sha256:abc', imageTags: ['v1', 'latest'], imageSizeInBytes: 4096,
        imagePushedAt: '2026-01-02T00:00:00Z', imageScanStatus: { status: 'COMPLETE' },
        imageScanFindingsSummary: { findingSeverityCounts: { CRITICAL: 2, HIGH: 5 } },
      }],
    }))
    const client = new AwsClient({ ...creds, region: 'us-east-1', fetchImpl, lookupImpl: stablePublicLookup })
    const result = await client.describeEcrImages({ repositoryName: 'app', imageTag: 'v1' })

    expect(result.items[0]).toMatchObject({ digest: 'sha256:abc', tags: 'v1, latest', sizeBytes: 4096, scanStatus: 'COMPLETE', criticalCount: 2, highCount: 5 })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.ecr.us-east-1.amazonaws.com/')
    expect(String(init.body)).toContain('"imageTag":"v1"')
    const headers = init.headers as Record<string, string>
    expect(headers['x-amz-target']).toBe('AmazonEC2ContainerRegistry_V20150921.DescribeImages')
  })

  it('signs with a deterministic authorization header for a fixed time', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}))
    const client = new AwsClient({ ...creds, region: 'us-east-1', now: FIXED_NOW, fetchImpl, lookupImpl: stablePublicLookup })
    await client.stsGetCallerIdentity()

    const headers = (fetchImpl.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>
    expect(headers['x-amz-date']).toBe('20260101T000000Z')
    // Cross-check the Signature against an independent HMAC-SHA256 implementation.
    expect(headers.authorization).toBe(
      `AWS4-HMAC-SHA256 Credential=EXAMPLEKEYIDFORTESTS/20260101/us-east-1/sts/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=${sigV4Signature()}`,
    )
  })
})

function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmacHex(key: string, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex')
}

/** Independent SigV4 signature for the exact STS GetCallerIdentity request. */
function sigV4Signature(): string {
  const body = 'Action=GetCallerIdentity&Version=2011-06-15'
  const amzDate = '20260101T000000Z'
  const dateStamp = '20260101'
  const region = 'us-east-1'
  const service = 'sts'
  const host = 'sts.us-east-1.amazonaws.com'
  const payloadHash = sha256Hex(body)
  const canonicalRequest = [
    'POST',
    '/',
    '',
    `content-type:application/x-www-form-urlencoded; charset=utf-8\nhost:${host}\nx-amz-date:${amzDate}`,
    'content-type;host;x-amz-date',
    payloadHash,
  ].join('\n')
  const scope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
  const kDate = hmacHex(`AWS4${creds.secretAccessKey}`, dateStamp)
  const kRegion = hmacHex(hexToBytes(kDate), region)
  const kService = hmacHex(hexToBytes(kRegion), service)
  const kSigning = hmacHex(hexToBytes(kService), 'aws4_request')
  return hmacHex(hexToBytes(kSigning), stringToSign)
}

function hexToBytes(hex: string): Buffer {
  return Buffer.from(hex, 'hex')
}