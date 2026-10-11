import { describe, expect, it } from 'vitest'
import { APIError } from '@anthropic-ai/sdk'
import {
  AnthropicClient,
  AnthropicClientError,
  type AnthropicTransport,
} from '../src/client.ts'

function fakeTransport(overrides: Partial<AnthropicTransport> = {}): AnthropicTransport {
  return {
    modelsList: async () => ({ data: [{ id: 'claude-test', display_name: 'Claude Test', created_at: '2026-01-01T00:00:00Z' }] }),
    messagesCreate: async () => ({
      id: 'msg_test',
      model: 'claude-test',
      content: [{ type: 'text', text: 'hello' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 2, output_tokens: 3 },
    }),
    ...overrides,
  }
}

describe('AnthropicClient', () => {
  it('reports whether an API key is configured without exposing it', () => {
    const key = 'sk-ant-test-secret'
    const client = new AnthropicClient({ apiKey: key, transport: fakeTransport() })
    expect(client.hasCredentials()).toBe(true)
    expect(JSON.stringify({ hasCredentials: client.hasCredentials() })).not.toContain(key)
    expect(new AnthropicClient({ apiKey: '', transport: fakeTransport() }).hasCredentials()).toBe(false)
  })

  it('lists and caps model metadata', async () => {
    const transport = fakeTransport({ modelsList: async () => ({ data: Array.from({ length: 70 }, (_, i) => ({ id: 'model-' + i, display_name: 'Model ' + i, created_at: '2026-01-01' })) }) })
    const models = await new AnthropicClient({ transport }).listModels()
    expect(models).toHaveLength(50)
    expect(models[0]).toEqual({ id: 'model-0', displayName: 'Model 0', createdAt: '2026-01-01' })
  })

  it('creates a text message with system instructions and maps usage', async () => {
    let received: Record<string, unknown> | undefined
    const transport = fakeTransport({ messagesCreate: async params => {
      received = params as unknown as Record<string, unknown>
      return { id: 'msg_1', model: 'claude-test', content: [{ type: 'text', text: 'hello' }, { type: 'tool_use', text: 'ignored' }], stop_reason: 'end_turn', usage: { input_tokens: 2, output_tokens: 3 } }
    } })
    const result = await new AnthropicClient({ transport }).createMessage({ model: 'claude-test', input: 'Say hello', system: 'Be concise', maxOutputTokens: 100 })
    expect(received).toMatchObject({ model: 'claude-test', max_tokens: 100, system: 'Be concise', messages: [{ role: 'user', content: 'Say hello' }] })
    expect(result).toEqual({ id: 'msg_1', model: 'claude-test', outputText: 'hello', truncated: false, stopReason: 'end_turn', usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } })
  })

  it('bounds input and output and rejects an empty model', async () => {
    const transport = fakeTransport({ messagesCreate: async params => ({ id: 'msg_2', model: params.model, content: [{ type: 'text', text: 'x'.repeat(100) }] }) })
    const client = new AnthropicClient({ transport, maxInputChars: 10, maxOutputChars: 20 })
    await expect(client.createMessage({ model: '', input: 'x' })).rejects.toBeInstanceOf(AnthropicClientError)
    let received: Record<string, unknown> | undefined
    const inspecting = new AnthropicClient({ transport: { ...transport, messagesCreate: async params => { received = params as unknown as Record<string, unknown>; return transport.messagesCreate(params) } }, maxInputChars: 10, maxOutputChars: 20 })
    const result = await inspecting.createMessage({ model: 'claude-test', input: '0123456789-more' })
    expect((received?.messages as Array<{ content: string }>)[0].content).toBe('0123456789')
    expect(result.outputText).toHaveLength(20)
    expect(result.truncated).toBe(true)
  })

  it('keeps text blocks intact until the configured output cap', async () => {
    const client = new AnthropicClient({ maxOutputChars: 500, transport: fakeTransport({ messagesCreate: async () => ({ content: [{ type: 'text', text: 'x'.repeat(400) }] }) }) })
    const result = await client.createMessage({ model: 'claude-test', input: 'hello' })
    expect(result.outputText).toHaveLength(400)
    expect(result.truncated).toBe(false)
  })

  it('maps API errors without exposing credentials', async () => {
    const transport = fakeTransport({ modelsList: async () => { throw Object.assign(new Error('bad request sk-ant-secret'), { status: 401, requestID: 'req_123' }) } })
    const error = await new AnthropicClient({ apiKey: 'sk-ant-secret', transport }).listModels().catch(value => value as AnthropicClientError)
    expect(error).toMatchObject({ status: 401, requestId: 'req_123' })
    expect(error.message).not.toContain('sk-ant-secret')
  })

  it('maps SDK APIError status and request id without copying the response body', async () => {
    const transport = fakeTransport({ modelsList: async () => {
      throw new APIError(429, { error: 'sk-ant-secret-response' }, 'rate limited sk-ant-secret-response', new Headers([['request-id', 'req_rate']]), 'rate_limit_error')
    } })
    const error = await new AnthropicClient({ apiKey: 'sk-ant-secret', transport }).listModels().catch(value => value as AnthropicClientError)
    expect(error).toMatchObject({ status: 429, requestId: 'req_rate', code: 'rate_limit_error' })
    expect(error.message).not.toContain('sk-ant-secret')
    expect(error.message).not.toContain('sk-ant-secret-response')
  })

  it('rejects missing credentials for the real transport', async () => {
    await expect(new AnthropicClient({ apiKey: '' }).listModels()).rejects.toMatchObject({ code: 'MISSING_API_KEY' })
    await expect(new AnthropicClient({ apiKey: '' }).createMessage({ model: 'claude-test', input: 'hello' })).rejects.toMatchObject({ code: 'MISSING_API_KEY' })
  })

  it('forwards a cooperative timeout to injected transports', async () => {
    const transport = fakeTransport({ modelsList: async ({ signal } = {}) => await new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true })
    }) })
    await expect(new AnthropicClient({ timeoutMs: 100, transport }).listModels()).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('propagates caller cancellation to injected transports', async () => {
    const transport = fakeTransport({ modelsList: async ({ signal } = {}) => await new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true })
    }) })
    const controller = new AbortController()
    const pending = new AnthropicClient({ timeoutMs: 5_000, transport }).listModels(controller.signal)
    controller.abort(new Error('caller cancelled'))
    await expect(pending).rejects.toMatchObject({ message: 'caller cancelled' })
  })
})
