import { describe, expect, it } from 'vitest'
import { createTools } from '../src/index.ts'
import { OpenAIClient, type OpenAITransport } from '../src/client.ts'

const transport: OpenAITransport = {
  modelsList: async () => ({ data: [{ id: 'gpt-test', owned_by: 'openai' }] }),
  responsesCreate: async () => ({ id: 'resp_test', model: 'gpt-test', output_text: 'hello', usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }),
}

describe('dsh-tool-openai tools', () => {
  it('registers the MVP tool set and safe call kinds', () => {
    const tools = createTools(new OpenAIClient({ transport }))
    expect(tools.map(tool => tool.name)).toEqual(['openai_auth_test', 'openai_models_list', 'openai_responses_create'])
    expect(tools[0].presentCall({})).toMatchObject({ kind: 'read' })
    expect(tools[1].presentCall({})).toMatchObject({ kind: 'read' })
    expect(tools[2].presentCall({ model: 'gpt-test', input: 'hello' })).toMatchObject({ kind: 'edit' })
  })

  it('renders bounded model and response output without credentials', () => {
    const tools = createTools(new OpenAIClient({ apiKey: 'sk-secret', transport }))
    const models = tools.find(tool => tool.name === 'openai_models_list')!
    const modelView = models.output.render({}, { ok: true, models: [{ id: 'gpt-test', ownedBy: 'openai' }] }) as Array<{ text: string }>
    expect(modelView[0].text).toContain('gpt-test')
    const response = tools.find(tool => tool.name === 'openai_responses_create')!
    const responseView = response.output.render({}, { ok: true, id: 'resp_test', model: 'gpt-test', outputText: 'hello', truncated: false }) as Array<{ text: string }>
    expect(responseView[0].text).toContain('model=gpt-test')
    expect(responseView[0].text).toContain('hello')
    expect(responseView[0].text).not.toContain('sk-secret')
  })

  it('executes auth, model, and response tools end to end', async () => {
    const tools = createTools(new OpenAIClient({ transport }))
    expect(await tools[0].execute({})).toMatchObject({ ok: true })
    expect(await tools[1].execute({})).toMatchObject({ ok: true, models: [{ id: 'gpt-test' }] })
    expect(await tools[2].execute({ model: 'gpt-test', input: 'hello' })).toMatchObject({ ok: true, outputText: 'hello' })
  })
})
