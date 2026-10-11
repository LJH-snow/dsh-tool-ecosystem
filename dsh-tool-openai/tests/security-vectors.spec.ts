import { describe, expect, it } from 'vitest'
import { OpenAIClient, OpenAIClientError } from '../src/client.ts'

describe('OpenAI endpoint security', () => {
  it('rejects credentials, query, fragments, insecure and non-OpenAI endpoints', () => {
    for (const baseUrl of [
      'http://api.openai.com/v1',
      'https://user:secret@api.openai.com/v1',
      'https://api.openai.com/v1?token=secret',
      'https://api.openai.com/v1#fragment',
      'https://localhost/v1',
      'https://127.0.0.1/v1',
      'https://10.0.0.1/v1',
      'https://example.com/v1',
    ]) {
      expect(() => new OpenAIClient({ baseUrl, transport: { modelsList: async () => ({}), responsesCreate: async () => ({}) } })).toThrow(OpenAIClientError)
    }
  })

  it('accepts the official OpenAI API endpoint and normalizes a trailing slash', () => {
    const client = new OpenAIClient({ baseUrl: 'https://api.openai.com/v1/', transport: { modelsList: async () => ({}), responsesCreate: async () => ({}) } })
    expect(client.getBaseUrl()).toBe('https://api.openai.com/v1')
  })
})
