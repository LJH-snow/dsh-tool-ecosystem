import { describe, expect, it } from 'vitest'
import { APIError } from 'openai'
import { OpenAIClient, OpenAIClientError, type OpenAITransport } from '../src/client.ts'

function fakeTransport(overrides: Partial<OpenAITransport> = {}): OpenAITransport {
  return {
    modelsList: async () => ({ data: [{ id: 'gpt-test', owned_by: 'openai' }] }),
    responsesCreate: async () => ({ id: 'resp_test', model: 'gpt-test', output_text: 'hello', usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } }),
    ...overrides,
  }
}

describe('OpenAIClient', () => {
  it('reports whether an API key is configured without exposing it', () => {
    const key = 'sk-test-secret'
    const client = new OpenAIClient({ apiKey: key, transport: fakeTransport() })
    expect(client.hasCredentials()).toBe(true)
    expect(JSON.stringify({ hasCredentials: client.hasCredentials() })).not.toContain(key)
    expect(new OpenAIClient({ transport: fakeTransport() }).hasCredentials()).toBe(false)
  })

  it('lists and caps model metadata', async () => {
    const transport = fakeTransport({ modelsList: async () => ({ data: Array.from({ length: 70 }, (_, i) => ({ id: `model-${i}`, owned_by: 'openai', extra: 'ignored' })) }) })
    const models = await new OpenAIClient({ transport }).listModels()
    expect(models).toHaveLength(50)
    expect(models[0]).toEqual({ id: 'model-0', ownedBy: 'openai' })
  })

  it('creates a text response with store disabled and maps output text', async () => {
    let received: Record<string, unknown> | undefined
    const transport = fakeTransport({ responsesCreate: async params => { received = params; return { id: 'resp_1', model: 'gpt-test', output_text: 'hello', usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } } } })
    const result = await new OpenAIClient({ transport }).createResponse({ model: 'gpt-test', input: 'Say hello', instructions: 'Be concise', maxOutputTokens: 100 })
    expect(received).toMatchObject({ model: 'gpt-test', input: 'Say hello', instructions: 'Be concise', max_output_tokens: 100, store: false })
    expect(result).toEqual({ id: 'resp_1', model: 'gpt-test', outputText: 'hello', truncated: false, usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } })
  })

  it('bounds input and output and rejects an empty model', async () => {
    const transport = fakeTransport({ responsesCreate: async params => ({ id: 'resp_2', model: params.model, output_text: 'x'.repeat(100) }) })
    const client = new OpenAIClient({ transport, maxInputChars: 10, maxOutputChars: 20 })
    await expect(client.createResponse({ model: '', input: 'x' })).rejects.toBeInstanceOf(OpenAIClientError)
    const result = await client.createResponse({ model: 'gpt-test', input: '0123456789-more' })
    expect(result.outputText).toHaveLength(20)
    expect(result.truncated).toBe(true)
  })

  it('maps API errors without exposing credentials', async () => {
    const transport = fakeTransport({ modelsList: async () => { throw Object.assign(new Error('bad request'), { status: 401, requestID: 'req_123' }) } })
    await expect(new OpenAIClient({ apiKey: 'sk-secret', transport }).listModels()).rejects.toMatchObject({ status: 401, requestId: 'req_123' })
    await expect(new OpenAIClient({ apiKey: 'sk-secret', transport }).listModels()).rejects.not.toHaveProperty('apiKey')
  })

  it('maps SDK APIError status and request id without copying the response body', async () => {
    const transport = fakeTransport({ modelsList: async () => {
      throw new APIError(429, { error: 'sk-secret-response' }, 'rate limited sk-secret-response', new Headers([['x-request-id', 'req_rate']]))
    } })
    const error = await new OpenAIClient({ apiKey: 'sk-secret', transport }).listModels().catch(value => value as OpenAIClientError)
    expect(error).toMatchObject({ status: 429, requestId: 'req_rate' })
    expect(error.message).not.toContain('sk-secret')
    expect(error.message).not.toContain('sk-secret-response')
  })

  it('forwards a cooperative timeout to injected transports', async () => {
    const transport = fakeTransport({ modelsList: async ({ signal } = {}) => await new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true })
    }) })
    await expect(new OpenAIClient({ timeoutMs: 100, transport }).listModels()).rejects.toMatchObject({ code: 'TIMEOUT' })
  })
})
