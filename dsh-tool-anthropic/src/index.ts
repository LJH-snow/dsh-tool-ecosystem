import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallView, ToolResult, ToolResultView } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  AnthropicClient,
  AnthropicClientError,
  type AnthropicClientOptions,
} from './client.js'

export { AnthropicClient, AnthropicClientError }
export type {
  AnthropicClientOptions,
  AnthropicTransport,
  AnthropicModelSummary,
  AnthropicMessageResult,
  AnthropicUsage,
} from './client.js'

export const name = 'dsh-tool-anthropic'
export const inject = ['tools']

export interface AnthropicPluginConfig extends AnthropicClientOptions {}

function text(value: string) { return [{ type: 'text' as const, text: value }] }
function signalOf(exec: { signal?: AbortSignal } | undefined): AbortSignal | undefined { return exec?.signal }
function errorResult(error: unknown): { ok: false; reason: string; status?: number; requestId?: string } {
  if (error instanceof AnthropicClientError) return { ok: false, reason: error.message, status: error.status, requestId: error.requestId }
  return { ok: false, reason: 'Anthropic request failed.' }
}

export function apply(ctx: Context, config: AnthropicPluginConfig = {}) {
  const client = new AnthropicClient(config)
  for (const tool of createTools(client)) ctx.tools.register(tool)
}

/** Build the Anthropic MVP tool definitions for a client. */
export function createTools(client: AnthropicClient) {
  return [
    defineTool({
      name: 'anthropic_auth_test',
      description: 'Verify Anthropic API access without exposing the API key or response body.',
      parameters: {},
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ok: { type: 'boolean' }, configured: { type: 'boolean' }, reason: { type: 'string' },
            status: { type: 'string' }, requestId: { type: 'string' },
          },
        } as const,
        render: (_args, value) => {
          const v = value as { ok?: boolean; configured?: boolean; reason?: string; status?: string; requestId?: string }
          return text(v.ok ? 'Anthropic authentication succeeded (' + (v.status ?? 'authenticated') + ').' : 'Anthropic authentication failed: ' + (v.reason ?? 'not configured.'))
        },
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Verify Anthropic API key', kind: 'read' } },
      presentResult(_args, result: ToolResult): ToolResultView { return { card: 'generic', title: result.isError ? 'Anthropic authentication failed' : 'Anthropic authenticated' } },
      async execute(_args, exec) {
        try {
          return { ...await client.authTest(signalOf(exec)), configured: client.hasCredentials() }
        } catch (error) {
          const failed = errorResult(error)
          return { ...failed, configured: client.hasCredentials(), status: failed.status === undefined ? undefined : String(failed.status) }
        }
      },
    }),
    defineTool({
      name: 'anthropic_models_list',
      description: 'List a bounded set of Anthropic Claude model identifiers and display names.',
      parameters: {},
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ok: { type: 'boolean' }, reason: { type: 'string' }, status: { type: 'integer' }, requestId: { type: 'string' },
            models: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, displayName: { type: 'string' }, createdAt: { type: 'string' } } } },
          },
        } as const,
        render: (_args, value) => {
          const v = value as { ok?: boolean; models?: Array<{ id: string; displayName: string; createdAt?: string }>; reason?: string }
          if (!v.ok) return text('Anthropic model list failed: ' + (v.reason ?? 'request failed.'))
          return text((v.models ?? []).map(model => model.id + ' (' + (model.displayName || 'unknown') + ')').join('\n') || 'No Anthropic models returned.')
        },
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'List Anthropic models', kind: 'read' } },
      presentResult(_args, result: ToolResult): ToolResultView { return { card: 'generic', title: result.isError ? 'Anthropic model list failed' : 'Anthropic models' } },
      async execute(_args, exec) {
        try {
          return { ok: true, models: await client.listModels(signalOf(exec)) }
        } catch (error) {
          return errorResult(error)
        }
      },
    }),
    defineTool({
      name: 'anthropic_messages_create',
      description: 'Create a bounded text response with the Anthropic Messages API. Only one text user message is accepted.',
      parameters: {
        model: { type: 'string', required: true, description: 'Anthropic Claude model identifier, for example claude-3-5-sonnet-latest.' },
        input: { type: 'string', required: true, description: 'Text prompt. The client applies an input character limit.' },
        system: { type: 'string', description: 'Optional system instruction. Also subject to the input limit.' },
        maxOutputTokens: { type: 'integer', description: 'Optional output token cap, from 1 to 100000.' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ok: { type: 'boolean' }, reason: { type: 'string' }, status: { type: 'integer' }, requestId: { type: 'string' },
            id: { type: 'string' }, model: { type: 'string' }, outputText: { type: 'string' }, truncated: { type: 'boolean' }, stopReason: { type: 'string' },
            usage: { type: 'object', additionalProperties: false, properties: { inputTokens: { type: 'integer' }, outputTokens: { type: 'integer' }, totalTokens: { type: 'integer' } } },
          },
        } as const,
        render: (_args, value) => {
          const v = value as { ok?: boolean; model?: string; outputText?: string; truncated?: boolean; stopReason?: string; usage?: { inputTokens: number; outputTokens: number; totalTokens: number }; reason?: string }
          if (!v.ok) return text('Anthropic message failed: ' + (v.reason ?? 'request failed.'))
          const usage = v.usage ? '\nusage=' + v.usage.inputTokens + '/' + v.usage.outputTokens + '/' + v.usage.totalTokens : ''
          return text('model=' + (v.model ?? '') + (v.truncated ? ' [truncated]' : '') + (v.stopReason ? ' stop=' + v.stopReason : '') + usage + '\n' + (v.outputText ?? ''))
        },
      },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Create Anthropic message: ' + String(args.model ?? 'model'), kind: 'edit' } },
      presentResult(_args, result: ToolResult): ToolResultView { return { card: 'generic', title: result.isError ? 'Anthropic message failed' : 'Anthropic message' } },
      async execute(args, exec) {
        try {
          return { ok: true, ...await client.createMessage({ model: args.model, input: args.input, system: args.system, maxOutputTokens: args.maxOutputTokens }, signalOf(exec)) }
        } catch (error) {
          return errorResult(error)
        }
      },
    }),
  ]
}
