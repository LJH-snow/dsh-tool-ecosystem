import { describe, expect, it } from 'vitest'
import { BrowserClient, apply, createTools } from '../src/index.js'

function exec(agentId = 'agent-a') {
  return { agent: { id: agentId }, signal: new AbortController().signal } as never
}

describe('browser tools', () => {
  it('registers the complete MVP tool set with replay presenters', () => {
    const client = new BrowserClient({ allowedOrigins: ['http://localhost:*'] }, { launch: async () => { throw new Error('not called') } })
    const tools = createTools(client)
    expect(tools.map(tool => tool.name)).toEqual([
      'browser_open',
      'browser_navigate',
      'browser_snapshot',
      'browser_click',
      'browser_fill',
      'browser_screenshot',
      'browser_close',
    ])
    const open = tools[0]
    expect(open.presentCall?.({ url: 'http://localhost:3000' })).toMatchObject({ card: 'generic', kind: 'read' })
    expect(open.output.schema).toMatchObject({ type: 'object', additionalProperties: false })
  })

  it('passes the owning agent id into session operations', async () => {
    const calls: string[] = []
    const client = { open: async (owner: string) => { calls.push(owner); return { sessionId: 's', url: 'http://localhost:3000', title: 'test' } } } as unknown as BrowserClient
    const open = createTools(client)[0]
    const result = await open.execute({ url: 'http://localhost:3000' }, exec('owner-1'))
    expect(result).toEqual({ sessionId: 's', url: 'http://localhost:3000', title: 'test' })
    expect(calls).toEqual(['owner-1'])
  })

  it('registers tools through the Cordis effect lifecycle', async () => {
    const registered: string[] = []
    let cleanup: (() => unknown) | undefined
    const ctx = {
      tools: { register: (tool: { name: string }) => { registered.push(tool.name); return () => undefined } },
      effect: (factory: () => unknown) => { cleanup = factory() as (() => unknown); return () => undefined },
    }
    apply(ctx as never, { allowedOrigins: ['http://localhost:*'] })
    expect(registered).toHaveLength(7)
    await cleanup?.()
  })
})
