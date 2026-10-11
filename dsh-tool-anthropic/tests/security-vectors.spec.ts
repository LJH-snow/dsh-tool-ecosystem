import { describe, expect, it } from 'vitest'
import { AnthropicClient, AnthropicClientError, type AnthropicTransport } from '../src/client.ts'

const transport: AnthropicTransport = {
  modelsList: async () => ({}),
  messagesCreate: async () => ({}),
}

describe('Anthropic endpoint security', () => {
  it('rejects credentials, query, fragments, insecure and non-Anthropic endpoints', () => {
    for (const baseUrl of [
      'http://api.anthropic.com/v1',
      'https://user:secret@api.anthropic.com/v1',
      'https://api.anthropic.com/v1?token=secret',
      'https://api.anthropic.com/v1#fragment',
      'https://api.anthropic.com:8443/v1',
      'https://localhost/v1',
      'https://127.0.0.1/v1',
      'https://10.0.0.1/v1',
      'https://example.com/v1',
      'https://api.anthropic.com/v2',
    ]) {
      expect(() => new AnthropicClient({ baseUrl, transport })).toThrow(AnthropicClientError)
    }
  })

  it('accepts the official Anthropic API endpoint and normalizes a trailing slash', () => {
    const client = new AnthropicClient({ baseUrl: 'https://api.anthropic.com/v1/', transport })
    expect(client.getBaseUrl()).toBe('https://api.anthropic.com/v1')
  })
})
