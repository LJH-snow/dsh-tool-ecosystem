import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Browser, BrowserContext, BrowserLauncher, Locator, Page, Route } from 'playwright'
import { BrowserClient } from '../src/client.js'

class FakeLocator {
  constructor(private readonly page: FakePage, private readonly selector: string) {}
  first(): FakeLocator { return this }
  async innerText(): Promise<string> { return this.page.bodyText }
  async click(): Promise<void> { this.page.lastAction = 'click:' + this.selector }
  async fill(text: string): Promise<void> { this.page.lastAction = 'fill:' + this.selector + '=' + text }
}

class FakePage {
  currentUrl = 'about:blank'
  currentTitle = 'Blank'
  bodyText = 'alpha beta gamma delta'
  lastAction = ''
  async goto(url: string): Promise<null> { this.currentUrl = url; this.currentTitle = 'Title for ' + new URL(url).hostname; return null }
  url(): string { return this.currentUrl }
  async title(): Promise<string> { return this.currentTitle }
  locator(selector: string): Locator { return new FakeLocator(this, selector) as unknown as Locator }
  getByRole(role: string, options: { name: string }): Locator { return new FakeLocator(this, role + ':' + options.name) as unknown as Locator }
  async screenshot(): Promise<Buffer> { return Buffer.from('fake-image') }
}

class FakeContext {
  readonly page = new FakePage()
  closed = false
  timeout = 0
  routeHandler: ((route: Route) => Promise<void>) | undefined
  setDefaultTimeout(timeout: number): void { this.timeout = timeout }
  async route(_pattern: string, handler: (route: Route) => Promise<void>): Promise<void> { this.routeHandler = handler }
  async newPage(): Promise<Page> { return this.page as unknown as Page }
  async close(): Promise<void> { this.closed = true }
}

class FakeBrowser {
  readonly contexts: FakeContext[] = []
  closed = false
  async newContext(): Promise<BrowserContext> { const context = new FakeContext(); this.contexts.push(context); return context as unknown as BrowserContext }
  async close(): Promise<void> { this.closed = true }
}

function signal(): AbortSignal { return new AbortController().signal }

async function fixture() {
  const browser = new FakeBrowser()
  const launcher: BrowserLauncher = { launch: vi.fn(async () => browser as unknown as Browser) }
  const saveDir = await mkdtemp(join(tmpdir(), 'dsh-browser-'))
  const client = new BrowserClient({ allowedOrigins: ['http://localhost:*', 'https://*.example.com'], maxTextBytes: 10, saveDir }, launcher)
  return { browser, launcher, saveDir, client }
}

describe('BrowserClient', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => { while (cleanups.length) await cleanups.pop()!() })

  it('enforces URL schemes and the configured origin allowlist before launching', async () => {
    const { client, launcher, saveDir } = await fixture()
    cleanups.push(() => rm(saveDir, { recursive: true, force: true }))
    await expect(client.open('agent-a', 'file:///tmp/secret', signal())).rejects.toThrow('http or https')
    await expect(client.open('agent-a', 'https://outside.test', signal())).rejects.toThrow('not allowlisted')
    expect(launcher.launch).not.toHaveBeenCalled()
  })

  it('opens isolated sessions, reads bounded text, performs actions, and saves screenshots safely', async () => {
    const { client, browser, saveDir } = await fixture()
    cleanups.push(() => rm(saveDir, { recursive: true, force: true }))
    const opened = await client.open('agent-a', 'http://localhost:3000/app', signal())
    expect(opened.url).toBe('http://localhost:3000/app')
    expect(browser.contexts).toHaveLength(1)
    const snapshot = await client.snapshot('agent-a', opened.sessionId, undefined, signal())
    expect(snapshot.text).toBe('alpha beta')
    expect(snapshot.truncated).toBe(true)
    await client.click('agent-a', opened.sessionId, undefined, 'button', 'Save', signal())
    await client.fill('agent-a', opened.sessionId, '#email', 'a@example.com', signal())
    expect(browser.contexts[0].page.lastAction).toBe('fill:#email=a@example.com')
    const shot = await client.screenshot('agent-a', opened.sessionId, 'result.png', false, 'png', signal())
    expect(shot.path).toBe(join(saveDir, 'result.png'))
    expect(await readFile(shot.path)).toEqual(Buffer.from('fake-image'))
    await expect(client.screenshot('agent-a', opened.sessionId, '../escape.png', false, 'png', signal())).rejects.toThrow('simple file name')
    await client.close('agent-a', opened.sessionId)
    expect(browser.contexts[0].closed).toBe(true)
  })

  it('isolates sessions by agent and blocks disallowed routed requests', async () => {
    const { client, browser, saveDir } = await fixture()
    cleanups.push(() => rm(saveDir, { recursive: true, force: true }))
    const opened = await client.open('agent-a', 'http://localhost:3000/app', signal())
    await expect(client.snapshot('agent-b', opened.sessionId, undefined, signal())).rejects.toThrow('another agent')
    const handler = browser.contexts[0].routeHandler!
    const abort = vi.fn(async () => undefined)
    const continueRequest = vi.fn(async () => undefined)
    await handler({ request: () => ({ url: () => 'https://outside.test/script.js' }), abort, continue: continueRequest } as unknown as Route)
    expect(abort).toHaveBeenCalledWith('blockedbyclient')
    expect(continueRequest).not.toHaveBeenCalled()
    await handler({ request: () => ({ url: () => 'https://sub.example.com/script.js' }), abort, continue: continueRequest } as unknown as Route)
    expect(continueRequest).toHaveBeenCalled()
  })

  it('cancels before dispatch and disposes all contexts and the browser', async () => {
    const { client, browser, saveDir } = await fixture()
    cleanups.push(() => rm(saveDir, { recursive: true, force: true }))
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(client.open('agent-a', 'http://localhost:3000/app', controller.signal)).rejects.toThrow('cancelled')
    const opened = await client.open('agent-a', 'http://localhost:3000/app', signal())
    await client.dispose()
    expect(browser.contexts[0].closed).toBe(true)
    expect(browser.closed).toBe(true)
    await expect(client.close('agent-a', opened.sessionId)).rejects.toThrow('not found')
  })
})
