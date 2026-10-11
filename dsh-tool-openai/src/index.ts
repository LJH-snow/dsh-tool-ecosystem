import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallView, ToolResult, ToolResultView } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  OpenAIClient,
  OpenAIClientError,
  type OpenAIClientOptions,
  type OpenAITransport,
} from './client.js'

export { OpenAIClient, OpenAIClientError }
export type { OpenAIClientOptions, OpenAITransport, OpenAIModelSummary, OpenAIResponseResult, OpenAIUsage } from './client.js'

export const name = 'dsh-tool-openai'
export const inject = ['tools']

export interface OpenAIPluginConfig extends OpenAIClientOptions {}

function text(value: string) { return [{ type: 'text' as const, text: value }] }
function signalOf(exec: { signal?: AbortSignal } | undefined): AbortSignal | undefined { return exec?.signal }
function errorResult(error: unknown): { ok: false; reason: string; status?: number; requestId?: string } {
  if (error instanceof OpenAIClientError) return { ok: false, reason: error.message, status: error.status, requestId: error.requestId }
  return { ok: false, reason: 'OpenAI request failed.' }
}

export function apply(ctx: Context, config: OpenAIPluginConfig = {}) {
  const client = new OpenAIClient(config)
  for (const tool of createTools(client)) ctx.tools.register(tool)
}

/** Build the OpenAI MVP tool definitions for a client. */
export function createTools(client: OpenAIClient) {
  return [
    defineTool({
      name: 'openai_auth_test',
      description: 'Verify OpenAI API access without exposing the API key or response body.',
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
          return text(v.ok ? 'OpenAI authentication succeeded (' + (v.status ?? 'authenticated') + ').' : 'OpenAI authentication failed: ' + (v.reason ?? 'not configured.'))
        },
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'Verify OpenAI API key', kind: 'read' } },
      presentResult(_args, result: ToolResult): ToolResultView { return { card: 'generic', title: result.isError ? 'OpenAI authentication failed' : 'OpenAI authenticated' } },
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
      name: 'openai_models_list',
      description: 'List a bounded set of OpenAI model identifiers and owners.',
      parameters: {},
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ok: { type: 'boolean' }, reason: { type: 'string' }, status: { type: 'integer' }, requestId: { type: 'string' },
            models: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, ownedBy: { type: 'string' } } } },
          },
        } as const,
        render: (_args, value) => {
          const v = value as { ok?: boolean; models?: Array<{ id: string; ownedBy: string }>; reason?: string }
          if (!v.ok) return text('OpenAI model list failed: ' + (v.reason ?? 'request failed.'))
          return text((v.models ?? []).map(model => model.id + ' (' + (model.ownedBy || 'unknown') + ')').join('\n') || 'No OpenAI models returned.')
        },
      },
      presentCall(): ToolCallView { return { card: 'generic', title: 'List OpenAI models', kind: 'read' } },
      presentResult(_args, result: ToolResult): ToolResultView { return { card: 'generic', title: result.isError ? 'OpenAI model list failed' : 'OpenAI models' } },
      async execute(_args, exec) {
        try {
          return { ok: true, models: await client.listModels(signalOf(exec)) }
        } catch (error) {
          return errorResult(error)
        }
      },
    }),
    defineTool({
      name: 'openai_responses_create',
      description: 'Create a bounded text response with the OpenAI Responses API. Storage is always disabled and no remote tools or files are accepted.',
      parameters: {
        model: { type: 'string', required: true, description: 'OpenAI model identifier, for example gpt-4.1-mini.' },
        input: { type: 'string', required: true, description: 'Text prompt. The client applies an input character limit.' },
        instructions: { type: 'string', description: 'Optional developer instructions. Also subject to the input limit.' },
        maxOutputTokens: { type: 'integer', description: 'Optional output token cap, from 1 to 1000000.' },
      },
      output: {
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            ok: { type: 'boolean' }, reason: { type: 'string' }, status: { type: 'integer' }, requestId: { type: 'string' },
            id: { type: 'string' }, model: { type: 'string' }, outputText: { type: 'string' }, truncated: { type: 'boolean' },
            usage: { type: 'object', additionalProperties: false, properties: { inputTokens: { type: 'integer' }, outputTokens: { type: 'integer' }, totalTokens: { type: 'integer' } } },
          },
        } as const,
        render: (_args, value) => {
          const v = value as { ok?: boolean; model?: string; outputText?: string; truncated?: boolean; usage?: { inputTokens: number; outputTokens: number; totalTokens: number }; reason?: string }
          if (!v.ok) return text('OpenAI response failed: ' + (v.reason ?? 'request failed.'))
          const usage = v.usage ? '\nusage=' + v.usage.inputTokens + '/' + v.usage.outputTokens + '/' + v.usage.totalTokens : ''
          return text('model=' + (v.model ?? '') + (v.truncated ? ' [truncated]' : '') + usage + '\n' + (v.outputText ?? ''))
        },
      },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Create OpenAI response: ' + String(args.model ?? 'model'), kind: 'edit' } },
      presentResult(_args, result: ToolResult): ToolResultView { return { card: 'generic', title: result.isError ? 'OpenAI response failed' : 'OpenAI response' } },
      async execute(args, exec) {
        try {
          return { ok: true, ...await client.createResponse({ model: args.model, input: args.input, instructions: args.instructions, maxOutputTokens: args.maxOutputTokens }, signalOf(exec)) }
        } catch (error) {
          return errorResult(error)
        }
      },
    }),
  ]
}
