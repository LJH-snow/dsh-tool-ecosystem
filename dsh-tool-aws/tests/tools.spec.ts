import { describe, expect, it, vi } from 'vitest'
import { AwsClient, type AwsClientOptions } from '../src/client.ts'
import { createTools } from '../src/index.ts'

const stablePublicLookup: NonNullable<AwsClientOptions['lookupImpl']> = async () => [{ address: '93.184.216.34', family: 4 }]

function makeClient(fetchImpl: typeof fetch = async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })) {
  return new AwsClient({ region: 'us-east-1', accessKeyId: 'k', secretAccessKey: 's', fetchImpl, lookupImpl: stablePublicLookup })
}

function tool(name: string) {
  return createTools(makeClient()).find(t => t.name === name)
}

describe('dsh-tool-aws tools', () => {
  it('registers ten read-only tools', () => {
    const names = createTools(makeClient()).map(t => t.name)
    expect(names).toEqual([
      'aws_sts_get_caller_identity',
      'aws_list_ec2_instances',
      'aws_list_s3_buckets',
      'aws_list_lambda_functions',
      'aws_list_cloudwatch_log_groups',
      'aws_get_cloudwatch_log_events',
      'aws_list_cloudwatch_metrics',
      'aws_ecr_list_repositories',
      'aws_ecr_list_images',
      'aws_ecr_describe_images',
    ])
  })

  it('reports missing credentials for identity', async () => {
    const client = new AwsClient({ region: 'us-east-1' })
    const t = createTools(client).find(x => x.name === 'aws_sts_get_caller_identity')!
    const result = await (t.execute as (a: Record<string, unknown>, e: { signal?: AbortSignal }) => Promise<unknown>)({}, {})
    expect(result).toMatchObject({ found: false, reason: 'AWS accessKeyId/secretAccessKey is not configured.' })
  })

  it('reports missing credentials for list tools', async () => {
    const client = new AwsClient({ region: 'us-east-1' })
    const t = createTools(client).find(x => x.name === 'aws_list_ec2_instances')!
    const result = await (t.execute as (a: Record<string, unknown>, e: { signal?: AbortSignal }) => Promise<unknown>)({}, {})
    expect(result).toMatchObject({ found: false, items: [], reason: 'AWS accessKeyId/secretAccessKey is not configured.' })
  })

  it('renders STS identity output', async () => {
    const t = tool('aws_sts_get_caller_identity')!
    const view = t.output.render({}, { found: true, account: '123', userId: 'u1', arn: 'arn:aws:iam::123:user/a' })
    const blocks = view as Array<{ type: string; text: string }>
    expect(blocks[0].text).toContain('account: 123')
    expect(blocks[0].text).toContain('arn: arn:aws:iam::123:user/a')
  })

  it('renders EC2 instance list output', async () => {
    const t = tool('aws_list_ec2_instances')!
    const view = t.output.render({}, {
      found: true,
      items: [{ instanceId: 'i-1', instanceType: 't3.micro', state: 'running', privateIp: '10.0.0.5', tags: 'Name=web' }],
    })
    const blocks = view as Array<{ type: string; text: string }>
    expect(blocks[0].text).toContain('state=running')
    expect(blocks[0].text).toContain('private=10.0.0.5')
    expect(blocks[0].text).toContain('Name=web')
  })

  it('renders empty list as a no-results message', async () => {
    const t = tool('aws_list_s3_buckets')!
    const view = t.output.render({}, { found: true, items: [] })
    const blocks = view as Array<{ type: string; text: string }>
    expect(blocks[0].text).toBe('No S3 buckets found.')
  })

  it('maps an AWS error to an unavailable result', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ __type: 'ThrottlingException' }), { status: 429, headers: { 'content-type': 'application/json' } }))
    const client = makeClient(fetchImpl)
    const t = createTools(client).find(x => x.name === 'aws_list_lambda_functions')!
    const result = await (t.execute as (a: Record<string, unknown>, e: { signal?: AbortSignal }) => Promise<unknown>)({}, {})
    expect(result).toMatchObject({ found: false, items: [] })
  })
})