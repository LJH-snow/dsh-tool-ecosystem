import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallView } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { AwsClient, AwsError } from './client.js'

export const name = 'dsh-tool-aws'
export const inject = ['tools']

export interface AwsPluginConfig {
  region?: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
  endpoint?: string
  timeoutMs?: number
}

export function apply(ctx: Context, config: AwsPluginConfig = {}) {
  const client = new AwsClient(config)
  for (const tool of createTools(client)) {
    ctx.tools.register(tool)
  }
}

function unavailable(reason: string) {
  return { found: false, items: [], reason }
}

function text(value: string) {
  return [{ type: 'text' as const, text: value }]
}

function renderInstances(items: Array<{ instanceId?: string; instanceType?: string; state?: string; az?: string; privateIp?: string; publicIp?: string; tags?: string }>) {
  if (!items.length) return text('No EC2 instances found.')
  return text(items.map(i => `${i.instanceId ?? ''} ${i.instanceType ?? ''} state=${i.state ?? ''} az=${i.az ?? ''} private=${i.privateIp ?? ''} public=${i.publicIp ?? ''} [${i.tags ?? ''}]`).join('\n'))
}

function renderBuckets(items: Array<{ name?: string; creationDate?: string; region?: string }>) {
  if (!items.length) return text('No S3 buckets found.')
  return text(items.map(b => `${b.name ?? ''} created=${b.creationDate ?? ''} ${b.region ?? ''}`).join('\n'))
}

function renderFunctions(items: Array<{ name?: string; runtime?: string; handler?: string; memorySize?: number; timeout?: number; state?: string; lastModified?: string }>) {
  if (!items.length) return text('No Lambda functions found.')
  return text(items.map(f => `${f.name ?? ''} ${f.runtime ?? ''} ${f.handler ?? ''} mem=${f.memorySize ?? 0} timeout=${f.timeout ?? 0}s state=${f.state ?? ''} ${f.lastModified ?? ''}`).join('\n'))
}

function renderLogGroups(items: Array<{ name?: string; creationTime?: string; retentionDays?: number; storedBytes?: number }>) {
  if (!items.length) return text('No CloudWatch log groups found.')
  return text(items.map(g => `${g.name ?? ''} retention=${g.retentionDays ?? 0}d stored=${g.storedBytes ?? 0}B`).join('\n'))
}

function renderLogEvents(items: Array<{ timestamp?: string; logStreamName?: string; message?: string }>) {
  if (!items.length) return text('No log events found.')
  return text(items.map(e => `[${e.timestamp ?? ''}] ${e.logStreamName ?? ''}: ${(e.message ?? '').slice(0, 300)}`).join('\n'))
}

function renderMetrics(items: Array<{ namespace?: string; name?: string; dimensions?: string }>) {
  if (!items.length) return text('No CloudWatch metrics found.')
  return text(items.map(m => `${m.namespace ?? ''}/${m.name ?? ''} dims=[${m.dimensions ?? ''}]`).join('\n'))
}

function renderEcrRepositories(items: Array<{ name?: string; registryId?: string; uri?: string; tagMutability?: string; scanOnPush?: boolean; createdAt?: string }>) {
  if (!items.length) return text('No ECR repositories found.')
  return text(items.map(r => `${r.name ?? ''} registry=${r.registryId ?? ''} scanOnPush=${r.scanOnPush ? 'yes' : 'no'} tags=${r.tagMutability ?? ''} created=${r.createdAt ?? ''}\n  ${r.uri ?? ''}`).join('\n'))
}

function renderEcrImageIds(items: Array<{ tag?: string; digest?: string }>) {
  if (!items.length) return text('No ECR images found.')
  return text(items.map(i => `${i.tag || '(untagged)'} ${i.digest ?? ''}`).join('\n'))
}

function renderEcrImages(items: Array<{ digest?: string; tags?: string; sizeBytes?: number; pushedAt?: string; scanStatus?: string; criticalCount?: number; highCount?: number }>) {
  if (!items.length) return text('No ECR image details found.')
  return text(items.map(i => `${(i.digest ?? '').slice(0, 32)}… tags=[${i.tags ?? ''}] size=${i.sizeBytes ?? 0}B pushed=${i.pushedAt ?? ''} scan=${i.scanStatus ?? 'n/a'} critical=${i.criticalCount ?? 0} high=${i.highCount ?? 0}`).join('\n'))
}

export function createTools(client: AwsClient) {
  return [
    defineTool({
      name: 'aws_sts_get_caller_identity',
      description: 'Verify AWS credentials and return the current caller identity (account, ARN, user ID).',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            userId: { type: 'string' },
            account: { type: 'string' },
            arn: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'AWS is not configured.')
          return text(`account: ${value.account}\nuserId: ${value.userId}\narn: ${value.arn}`)
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'AWS caller identity', kind: 'read' }
      },
      async execute(_args, exec) {
        if (!client.hasCredentials()) return { found: false, reason: 'AWS accessKeyId/secretAccessKey is not configured.' }
        try {
          return { found: true, ...await client.stsGetCallerIdentity(exec.signal) }
        } catch (error) {
          if (error instanceof AwsError) return { found: false, reason: error.message }
          throw error
        }
      },
    }),

    defineTool({
      name: 'aws_list_ec2_instances',
      description: 'List EC2 instances with optional filters and pagination.',
      parameters: {
        instanceIds: { type: 'array', items: { type: 'string' }, description: 'Filter to specific instance IDs' },
        filtersJson: { type: 'string', description: 'JSON object of EC2 filter name to value, e.g. {"tag:Name":"prod"}' },
        nextToken: { type: 'string', description: 'Opaque cursor from a previous response' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              instanceId: { type: 'string' }, instanceType: { type: 'string' }, state: { type: 'string' },
              az: { type: 'string' }, privateIp: { type: 'string' }, publicIp: { type: 'string' },
              keyName: { type: 'string' }, tags: { type: 'string' }, launchTime: { type: 'string' },
              vpcId: { type: 'string' }, subnetId: { type: 'string' }, securityGroups: { type: 'string' },
              monitoring: { type: 'string' },
            }}},
            nextToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'AWS is not configured.')
          return renderInstances(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'EC2 instances', kind: 'search' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('AWS accessKeyId/secretAccessKey is not configured.')
        let filters: Record<string, string> | undefined
        if (args.filtersJson) {
          try {
            filters = JSON.parse(args.filtersJson as string) as Record<string, string>
          } catch {
            return unavailable('filtersJson must be a valid JSON object.')
          }
        }
        try {
          const result = await client.listEc2Instances({
            instanceIds: args.instanceIds as string[],
            filters,
            nextToken: args.nextToken as string,
            signal: exec.signal,
          })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof AwsError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'aws_list_s3_buckets',
      description: 'List all S3 buckets in the account.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              name: { type: 'string' }, creationDate: { type: 'string' }, region: { type: 'string' },
            }}},
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'AWS is not configured.')
          return renderBuckets(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'S3 buckets', kind: 'search' }
      },
      async execute(_args, exec) {
        if (!client.hasCredentials()) return unavailable('AWS accessKeyId/secretAccessKey is not configured.')
        try {
          const result = await client.listS3Buckets(exec.signal)
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof AwsError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'aws_list_lambda_functions',
      description: 'List Lambda functions in the region with pagination.',
      parameters: {
        marker: { type: 'string', description: 'Opaque cursor from a previous response' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              name: { type: 'string' }, runtime: { type: 'string' }, handler: { type: 'string' },
              description: { type: 'string' }, role: { type: 'string' }, lastModified: { type: 'string' },
              memorySize: { type: 'number' }, timeout: { type: 'number' }, codeSize: { type: 'number' },
              state: { type: 'string' }, updateStatus: { type: 'string' },
            }}},
            nextMarker: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'AWS is not configured.')
          return renderFunctions(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Lambda functions', kind: 'search' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('AWS accessKeyId/secretAccessKey is not configured.')
        try {
          const result = await client.listLambdaFunctions({ marker: args.marker as string, signal: exec.signal })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof AwsError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'aws_list_cloudwatch_log_groups',
      description: 'List CloudWatch log groups with optional prefix and pagination.',
      parameters: {
        prefix: { type: 'string', description: 'Filter log groups by name prefix' },
        nextToken: { type: 'string', description: 'Opaque cursor from a previous response' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              name: { type: 'string' }, creationTime: { type: 'string' }, retentionDays: { type: 'number' }, storedBytes: { type: 'number' },
            }}},
            nextToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'AWS is not configured.')
          return renderLogGroups(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'CloudWatch log groups', kind: 'search' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('AWS accessKeyId/secretAccessKey is not configured.')
        try {
          const result = await client.listCloudWatchLogGroups({ prefix: args.prefix as string, nextToken: args.nextToken as string, signal: exec.signal })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof AwsError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'aws_get_cloudwatch_log_events',
      description: 'Get CloudWatch log events from a log group, optionally filtered by stream and time range.',
      parameters: {
        logGroupName: { type: 'string', required: true, description: 'CloudWatch log group name' },
        logStreamName: { type: 'string', description: 'Filter to one log stream' },
        startTime: { type: 'number', description: 'Start time as Unix epoch milliseconds' },
        endTime: { type: 'number', description: 'End time as Unix epoch milliseconds' },
        limit: { type: 'integer', description: 'Maximum results, 1-10000 (default 50)' },
        nextToken: { type: 'string', description: 'Opaque cursor from a previous response' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              timestamp: { type: 'string' }, logStreamName: { type: 'string' }, message: { type: 'string' },
            }}},
            nextForwardToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'AWS is not configured.')
          return renderLogEvents(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `CloudWatch log events ${args.logGroupName ?? ''}`, kind: 'read' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('AWS accessKeyId/secretAccessKey is not configured.')
        if (!args.logGroupName) return unavailable('logGroupName is required.')
        try {
          const result = await client.getCloudWatchLogEvents({
            logGroupName: args.logGroupName as string,
            logStreamName: args.logStreamName as string,
            startTime: args.startTime as number,
            endTime: args.endTime as number,
            limit: args.limit as number,
            nextToken: args.nextToken as string,
            signal: exec.signal,
          })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof AwsError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'aws_list_cloudwatch_metrics',
      description: 'List CloudWatch metrics, optionally filtered by namespace or metric name.',
      parameters: {
        namespace: { type: 'string', description: 'Metric namespace, e.g. AWS/EC2' },
        metricName: { type: 'string', description: 'Metric name, e.g. CPUUtilization' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              namespace: { type: 'string' }, name: { type: 'string' }, dimensions: { type: 'string' },
            }}},
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'AWS is not configured.')
          return renderMetrics(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'CloudWatch metrics', kind: 'search' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('AWS accessKeyId/secretAccessKey is not configured.')
        try {
          const result = await client.listCloudWatchMetrics({ namespace: args.namespace as string, metricName: args.metricName as string, signal: exec.signal })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof AwsError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'aws_ecr_list_repositories',
      description: 'List ECR repositories in the region with pagination.',
      parameters: {
        nextToken: { type: 'string', description: 'Opaque cursor from a previous response' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              registryId: { type: 'string' }, name: { type: 'string' }, arn: { type: 'string' }, uri: { type: 'string' },
              createdAt: { type: 'string' }, tagMutability: { type: 'string' }, scanOnPush: { type: 'boolean' },
            }}},
            nextToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'AWS is not configured.')
          return renderEcrRepositories(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'ECR repositories', kind: 'search' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('AWS accessKeyId/secretAccessKey is not configured.')
        try {
          const result = await client.listEcrRepositories({ nextToken: args.nextToken as string, signal: exec.signal })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof AwsError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'aws_ecr_list_images',
      description: 'List image tags and digests in one ECR repository, optionally filtered by tag status.',
      parameters: {
        repositoryName: { type: 'string', required: true, description: 'ECR repository name' },
        tagStatus: { type: 'string', description: 'TAGGED, UNTAGGED, or ANY (default ANY)' },
        nextToken: { type: 'string', description: 'Opaque cursor from a previous response' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              tag: { type: 'string' }, digest: { type: 'string' },
            }}},
            nextToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'AWS is not configured.')
          return renderEcrImageIds(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `ECR images ${args.repositoryName ?? ''}`, kind: 'search' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('AWS accessKeyId/secretAccessKey is not configured.')
        if (!args.repositoryName) return unavailable('repositoryName is required.')
        try {
          const result = await client.listEcrImages({ repositoryName: args.repositoryName as string, tagStatus: args.tagStatus as string, nextToken: args.nextToken as string, signal: exec.signal })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof AwsError) return unavailable(error.message)
          throw error
        }
      },
    }),

    defineTool({
      name: 'aws_ecr_describe_images',
      description: 'Describe ECR images with size, push time, scan status, and vulnerability severity counts.',
      parameters: {
        repositoryName: { type: 'string', required: true, description: 'ECR repository name' },
        imageTag: { type: 'string', description: 'Describe a single image by tag' },
        nextToken: { type: 'string', description: 'Opaque cursor from a previous response' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
              digest: { type: 'string' }, tags: { type: 'string' }, sizeBytes: { type: 'number' },
              pushedAt: { type: 'string' }, scanStatus: { type: 'string' },
              criticalCount: { type: 'number' }, highCount: { type: 'number' },
            }}},
            nextToken: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return text(value.reason ?? 'AWS is not configured.')
          return renderEcrImages(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `ECR image details ${args.repositoryName ?? ''}`, kind: 'read' }
      },
      async execute(args, exec) {
        if (!client.hasCredentials()) return unavailable('AWS accessKeyId/secretAccessKey is not configured.')
        if (!args.repositoryName) return unavailable('repositoryName is required.')
        try {
          const result = await client.describeEcrImages({ repositoryName: args.repositoryName as string, imageTag: args.imageTag as string, nextToken: args.nextToken as string, signal: exec.signal })
          return { found: true, ...result }
        } catch (error) {
          if (error instanceof AwsError) return unavailable(error.message)
          throw error
        }
      },
    }),
  ]
}