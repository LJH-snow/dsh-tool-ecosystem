import { describe, expect, it } from 'vitest'
import { createTools } from '../src/index.ts'
import { AnthropicClient, type AnthropicTransport } from '../src/client.ts'

const transport: AnthropicTransport = {
  modelsList: async () => ({ data: [{ id: 'claude-test', display_name: 'Claude Test', created_at: '2026-01-01' }] }),
  messagesCreate: async () => ({ id: 'msg_test', model: 'claude-test', content: [{ type: 'text', text: 'hello' }], usage: { input_tokens: 1, output_tokens: 1 } }),
}

describe('dsh-tool-anthropic tools', () => {
  it('registers the MVP tool set and safe call kinds', () => {
    const tools = createTools(new AnthropicClient({ transport }))
    expect(tools.map(tool => tool.name)).toEqual(['anthropic_auth_test', 'anthropic_models_list', 'anthropic_messages_create'])
    expect(tools[0].presentCall({})).toMatchObject({ kind: 'read' })
    expect(tools[1].presentCall({})).toMatchObject({ kind: 'read' })
    expect(tools[2].presentCall({ model: 'claude-test', input: 'hello' })).toMatchObject({ kind: 'edit' })
  })

  it('renders bounded model and message output without credentials', () => {
    const tools = createTools(new AnthropicClient({ apiKey: 'sk-ant-secret', transport }))
    const models = tools.find(tool => tool.name === 'anthropic_models_list')!
    const modelView = models.output.render({}, { ok: true, models: [{ id: 'claude-test', displayName: 'Claude Test' }] }) as Array<{ text: string }>
    expect(modelView[0].text).toContain('claude-test')
    const message = tools.find(tool => tool.name === 'anthropic_messages_create')!
    const messageView = message.output.render({}, { ok: true, id: 'msg_test', model: 'claude-test', outputText: 'hello', truncated: false }) as Array<{ text: string }>
    expect(messageView[0].text).toContain('model=claude-test')
    expect(messageView[0].text).toContain('hello')
    expect(messageView[0].text).not.toContain('sk-ant-secret')
  })

  it('executes auth, model, and message tools end to end', async () => {
    const tools = createTools(new AnthropicClient({ transport }))
    expect(await tools[0].execute({})).toMatchObject({ ok: true })
    expect(await tools[1].execute({})).toMatchObject({ ok: true, models: [{ id: 'claude-test' }] })
    expect(await tools[2].execute({ model: 'claude-test', input: 'hello' })).toMatchObject({ ok: true, outputText: 'hello' })
  })
})
