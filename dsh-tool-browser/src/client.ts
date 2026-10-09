import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve } from 'node:path'
import { chromium, firefox, webkit, type Browser, type BrowserContext, type BrowserType, type Locator, type Page } from 'playwright'

export type BrowserKind = 'chromium' | 'firefox' | 'webkit'

export interface BrowserPluginConfig {
  browserType?: BrowserKind
  /** Optional system/browser binary path; useful when Playwright-managed binaries are unavailable. */
  executablePath?: string
  headless?: boolean
  timeoutMs?: number
  maxSessions?: number
  maxTextBytes?: number
  saveDir?: string
  /** Exact origins, host wildcards, or a port wildcard such as http://localhost:*. * allows all origins. */
  allowedOrigins?: string[]
}

export interface BrowserLaunchOptions { headless?: boolean; timeout?: number; executablePath?: string }
export interface BrowserLauncher { launch(options?: BrowserLaunchOptions): Promise<Browser> }
export interface BrowserSessionInfo { sessionId: string; url: string; title: string }

interface OriginRule { protocol: string; host: string; subdomains: boolean; port: string | undefined }
interface BrowserSession { id: string; owner: string; context: BrowserContext; page: Page }

const DEFAULT_ORIGINS = ['http://localhost:*', 'http://127.0.0.1:*']
const browserTypes: Record<BrowserKind, BrowserType> = { chromium, firefox, webkit }

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Browser operation aborted.')
}

function truncateUtf8(value: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(value, 'utf8')
  return bytes.byteLength <= maxBytes
    ? { text: value, truncated: false }
    : { text: bytes.subarray(0, maxBytes).toString('utf8'), truncated: true }
}

function parseOriginRule(value: string): OriginRule {
  const match = /^(https?):\/\/((\*\.)?[^/:]+)(?::(\*|\d+))?$/.exec(value)
  if (!match) throw new Error('Invalid allowed origin: ' + JSON.stringify(value))
  return { protocol: match[1] + ':', host: (match[3] ? match[2].slice(2) : match[2]).toLowerCase(), subdomains: Boolean(match[3]), port: match[4] }
}

function isAllowedByRule(url: URL, rule: OriginRule): boolean {
  if (url.protocol !== rule.protocol) return false
  const hostname = url.hostname.toLowerCase()
  const hostMatches = rule.subdomains ? hostname.endsWith('.' + rule.host) && hostname !== rule.host : hostname === rule.host
  if (!hostMatches) return false
  if (rule.port === '*') return true
  return rule.port === undefined ? url.port === '' : url.port === rule.port
}

export class BrowserClient {
  private readonly config: { headless: boolean; executablePath: string | undefined; timeoutMs: number; maxSessions: number; maxTextBytes: number; saveDir: string }
  private readonly launcher: BrowserLauncher
  private readonly originRules: OriginRule[] | '*'
  private browserPromise: Promise<Browser> | undefined
  private readonly sessions = new Map<string, BrowserSession>()

  constructor(config: BrowserPluginConfig = {}, launcher?: BrowserLauncher) {
    const timeoutMs = config.timeoutMs ?? 30_000
    const maxSessions = config.maxSessions ?? 4
    const maxTextBytes = config.maxTextBytes ?? 12_000
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be a positive finite number.')
    if (!Number.isInteger(maxSessions) || maxSessions <= 0) throw new Error('maxSessions must be a positive integer.')
    if (!Number.isInteger(maxTextBytes) || maxTextBytes <= 0) throw new Error('maxTextBytes must be a positive integer.')
    this.config = { headless: config.headless ?? true, executablePath: config.executablePath, timeoutMs, maxSessions, maxTextBytes, saveDir: resolve(config.saveDir ?? resolve(process.cwd(), '.dsh-browser')) }
    const origins = config.allowedOrigins ?? DEFAULT_ORIGINS
    this.originRules = origins.includes('*') ? '*' : origins.map(parseOriginRule)
    this.launcher = launcher ?? browserTypes[config.browserType ?? 'chromium']
  }

  async open(owner: string, rawUrl: string, signal: AbortSignal): Promise<BrowserSessionInfo> {
    const url = this.assertAllowedUrl(rawUrl)
    if (this.sessions.size >= this.config.maxSessions) throw new Error('Maximum browser session count reached.')
    const browser = await this.withSignal(signal, () => this.getBrowser())
    const context = await this.withSignal(signal, () => browser.newContext())
    try {
      context.setDefaultTimeout(this.config.timeoutMs)
      await context.route('**/*', async route => {
        if (this.isAllowedUrl(route.request().url())) await route.continue()
        else await route.abort('blockedbyclient')
      })
      const page = await this.withSignal(signal, () => context.newPage())
      const session: BrowserSession = { id: randomUUID(), owner, context, page }
      this.sessions.set(session.id, session)
      try {
        await this.navigatePage(session, url.toString(), signal)
        return await this.info(session)
      } catch (error) {
        this.sessions.delete(session.id)
        await context.close()
        throw error
      }
    } catch (error) {
      await context.close().catch(() => undefined)
      throw error
    }
  }

  async navigate(owner: string, sessionId: string, rawUrl: string, signal: AbortSignal): Promise<BrowserSessionInfo> {
    const session = this.getSession(owner, sessionId)
    const url = this.assertAllowedUrl(rawUrl)
    await this.navigatePage(session, url.toString(), signal)
    return this.info(session)
  }

  async snapshot(owner: string, sessionId: string, selector: string | undefined, signal: AbortSignal): Promise<BrowserSessionInfo & { text: string; truncated: boolean }> {
    const session = this.getSession(owner, sessionId)
    const locator = selector ? session.page.locator(selector) : session.page.locator('body')
    const text = await this.withSessionSignal(session, signal, () => locator.innerText({ timeout: this.config.timeoutMs, signal }))
    const bounded = truncateUtf8(text, this.config.maxTextBytes)
    return { ...(await this.info(session)), text: bounded.text, truncated: bounded.truncated }
  }

  async click(owner: string, sessionId: string, selector: string | undefined, role: string | undefined, name: string | undefined, signal: AbortSignal): Promise<BrowserSessionInfo> {
    const session = this.getSession(owner, sessionId)
    const locator = this.resolveLocator(session.page, selector, role, name)
    await this.withSessionSignal(session, signal, () => locator.click({ timeout: this.config.timeoutMs, signal }))
    return this.info(session)
  }

  async fill(owner: string, sessionId: string, selector: string, text: string, signal: AbortSignal): Promise<BrowserSessionInfo> {
    const session = this.getSession(owner, sessionId)
    await this.withSessionSignal(session, signal, () => session.page.locator(selector).fill(text, { timeout: this.config.timeoutMs, signal }))
    return this.info(session)
  }

  async screenshot(owner: string, sessionId: string, fileName: string | undefined, fullPage: boolean, format: 'png' | 'jpeg', signal: AbortSignal): Promise<{ sessionId: string; path: string; bytes: number; format: 'png' | 'jpeg'; url: string }> {
    const session = this.getSession(owner, sessionId)
    const safeName = this.safeFileName(fileName ?? sessionId + '-' + Date.now() + '.' + format)
    await mkdir(this.config.saveDir, { recursive: true })
    const target = resolve(this.config.saveDir, safeName)
    const image = await this.withSessionSignal(session, signal, () => session.page.screenshot({ type: format, fullPage }))
    await writeFile(target, image)
    return { sessionId, path: target, bytes: image.byteLength, format, url: session.page.url() }
  }

  async close(owner: string, sessionId: string): Promise<{ sessionId: string; closed: boolean }> {
    const session = this.getSession(owner, sessionId)
    this.sessions.delete(sessionId)
    await session.context.close()
    return { sessionId, closed: true }
  }

  async dispose(): Promise<void> {
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    await Promise.allSettled(sessions.map(session => session.context.close()))
    const browser = this.browserPromise
    this.browserPromise = undefined
    if (browser) await browser.then(value => value.close()).catch(() => undefined)
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = this.launcher.launch({ headless: this.config.headless, timeout: this.config.timeoutMs, executablePath: this.config.executablePath }).catch(error => {
        this.browserPromise = undefined
        throw error
      })
    }
    return this.browserPromise
  }

  private async navigatePage(session: BrowserSession, url: string, signal: AbortSignal): Promise<void> {
    await this.withSessionSignal(session, signal, () => session.page.goto(url, { timeout: this.config.timeoutMs, waitUntil: 'domcontentloaded', signal }))
    this.assertAllowedUrl(session.page.url())
  }

  private async info(session: BrowserSession): Promise<BrowserSessionInfo> {
    return { sessionId: session.id, url: session.page.url(), title: await session.page.title() }
  }

  private getSession(owner: string, sessionId: string): BrowserSession {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Browser session not found: ' + sessionId)
    if (session.owner !== owner) throw new Error('Browser session belongs to another agent.')
    return session
  }

  private resolveLocator(page: Page, selector: string | undefined, role: string | undefined, name: string | undefined): Locator {
    if (selector && (role || name)) throw new Error('Provide selector or role/name, not both.')
    if (selector) return page.locator(selector).first()
    if (!role || !name) throw new Error('Click requires selector or both role and name.')
    return page.getByRole(role as Parameters<Page['getByRole']>[0], { name }).first()
  }

  private safeFileName(value: string): string {
    if (value !== basename(value) || value === '.' || value === '..' || isAbsolute(value)) throw new Error('Screenshot fileName must be a simple file name.')
    const target = resolve(this.config.saveDir, value)
    const rel = relative(this.config.saveDir, target)
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Screenshot path escapes saveDir.')
    return value
  }

  private assertAllowedUrl(rawUrl: string): URL {
    let url: URL
    try { url = new URL(rawUrl) } catch { throw new Error('Invalid browser URL: ' + JSON.stringify(rawUrl)) }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Browser URLs must use http or https.')
    if (url.username || url.password) throw new Error('Browser URLs must not contain credentials.')
    if (!this.isAllowedUrl(url.toString())) throw new Error('Browser origin is not allowlisted: ' + url.origin)
    return url
  }

  private isAllowedUrl(rawUrl: string): boolean {
    let url: URL
    try { url = new URL(rawUrl) } catch { return false }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return this.originRules === '*' || this.originRules.some(rule => isAllowedByRule(url, rule))
  }

  private async withSessionSignal<T>(session: BrowserSession, signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    return this.withSignal(signal, operation, async () => {
      this.sessions.delete(session.id)
      await session.context.close().catch(() => undefined)
    })
  }

  private async withSignal<T>(signal: AbortSignal, operation: () => Promise<T>, cleanup?: () => Promise<void>): Promise<T> {
    throwIfAborted(signal)
    const pending = operation()
    pending.catch(() => undefined)
    let abortHandler: (() => void) | undefined
    const aborted = new Promise<never>((_, reject) => {
      abortHandler = () => {
        void (async () => {
          try { await cleanup?.() } finally {
            await pending.catch(() => undefined)
            reject(signal.reason instanceof Error ? signal.reason : new Error('Browser operation aborted.'))
          }
        })()
      }
      signal.addEventListener('abort', abortHandler, { once: true })
    })
    if (signal.aborted) abortHandler?.()
    try { return await Promise.race([pending, aborted]) } finally {
      if (abortHandler) signal.removeEventListener('abort', abortHandler)
    }
  }
}
