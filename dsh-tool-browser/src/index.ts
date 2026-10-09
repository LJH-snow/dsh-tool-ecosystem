import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { BrowserClient, type BrowserPluginConfig } from './client.js'

export { BrowserClient }
export type { BrowserKind, BrowserLaunchOptions, BrowserLauncher, BrowserPluginConfig, BrowserSessionInfo } from './client.js'

export const name = 'dsh-tool-browser'
export const inject = ['tools']

function ownerOf(exec: { agent?: { id?: unknown } }): string {
  return typeof exec.agent?.id === 'string' ? exec.agent.id : 'anonymous'
}

function sessionTitle(sessionId: string, url: string): ToolResultView {
  return { card: 'generic', title: sessionId.slice(0, 8) + ' · ' + url }
}

const sessionOutput = {
  schema: { type: 'object', additionalProperties: false, properties: { sessionId: { type: 'string' }, url: { type: 'string' }, title: { type: 'string' } } } as const,
  render: (_args: never, value: { sessionId: string; url: string; title: string }) => [{ type: 'text' as const, text: 'Page: ' + value.url + '\ntitle: ' + value.title + '\nsession: ' + value.sessionId }],
} as const

/** Build browser tools for a client. Exported so tests can inject a fake Playwright launcher. */
export function createTools(client: BrowserClient) {
  return [
    defineTool({
      name: 'browser_open',
      description: 'Open an allowlisted URL in a new isolated browser session and return its opaque session id.',
      parameters: { url: { type: 'string', required: true, description: 'HTTP or HTTPS URL allowed by the plugin origin allowlist.' } },
      output: sessionOutput,
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Open ' + args.url, kind: 'read' } },
      presentResult(_args, result): ToolResultView | undefined { const value = result as unknown as { sessionId: string; url: string }; return sessionTitle(value.sessionId, value.url) },
      execute(args, exec) { return client.open(ownerOf(exec), args.url, exec.signal) },
    }),
    defineTool({
      name: 'browser_navigate',
      description: 'Navigate an existing browser session to another allowlisted URL.',
      parameters: {
        sessionId: { type: 'string', required: true, description: 'Opaque id returned by browser_open.' },
        url: { type: 'string', required: true, description: 'HTTP or HTTPS URL allowed by the plugin origin allowlist.' },
      },
      output: sessionOutput,
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Navigate ' + args.url, kind: 'read' } },
      presentResult(_args, result): ToolResultView | undefined { const value = result as unknown as { sessionId: string; url: string }; return sessionTitle(value.sessionId, value.url) },
      execute(args, exec) { return client.navigate(ownerOf(exec), args.sessionId, args.url, exec.signal) },
    }),
    defineTool({
      name: 'browser_snapshot',
      description: 'Read bounded visible text from the page body or a CSS-selected region.',
      parameters: {
        sessionId: { type: 'string', required: true, description: 'Opaque id returned by browser_open.' },
        selector: { type: 'string', description: 'Optional CSS selector for a region; defaults to body.' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { sessionId: { type: 'string' }, url: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' }, truncated: { type: 'boolean' } } } as const,
        render: (_args, value) => [{ type: 'text', text: value.title + '\n' + value.url + '\n\n' + value.text + (value.truncated ? '\n[truncated]' : '') }],
      },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Read page ' + args.sessionId.slice(0, 8), kind: 'read' } },
      presentResult(_args, result): ToolResultView | undefined { const value = result as unknown as { title: string; text: string }; return { card: 'generic', title: value.title, content: [{ type: 'text', text: value.text }] } },
      execute(args, exec) { return client.snapshot(ownerOf(exec), args.sessionId, args.selector, exec.signal) },
    }),
    defineTool({
      name: 'browser_click',
      description: 'Click a CSS selector or an accessible role/name target in an existing browser session.',
      parameters: {
        sessionId: { type: 'string', required: true, description: 'Opaque id returned by browser_open.' },
        selector: { type: 'string', description: 'CSS selector; do not combine with role or name.' },
        role: { type: 'string', description: 'Accessible role such as button or link; combine with name.' },
        name: { type: 'string', description: 'Accessible name used with role.' },
      },
      output: sessionOutput,
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Click ' + (args.selector ?? String(args.role) + ':' + String(args.name)), kind: 'edit' } },
      presentResult(_args, result): ToolResultView | undefined { const value = result as unknown as { sessionId: string; url: string }; return sessionTitle(value.sessionId, value.url) },
      execute(args, exec) { return client.click(ownerOf(exec), args.sessionId, args.selector, args.role, args.name, exec.signal) },
    }),
    defineTool({
      name: 'browser_fill',
      description: 'Fill a CSS-selected input or textarea in an existing browser session.',
      parameters: {
        sessionId: { type: 'string', required: true, description: 'Opaque id returned by browser_open.' },
        selector: { type: 'string', required: true, description: 'CSS selector for an input, textarea, or contenteditable element.' },
        text: { type: 'string', required: true, description: 'Text to enter.' },
      },
      output: sessionOutput,
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Fill ' + args.selector, kind: 'edit' } },
      presentResult(_args, result): ToolResultView | undefined { const value = result as unknown as { sessionId: string; url: string }; return sessionTitle(value.sessionId, value.url) },
      execute(args, exec) { return client.fill(ownerOf(exec), args.sessionId, args.selector, args.text, exec.signal) },
    }),
    defineTool({
      name: 'browser_screenshot',
      description: 'Capture the current page to a PNG or JPEG file under the configured screenshot directory.',
      parameters: {
        sessionId: { type: 'string', required: true, description: 'Opaque id returned by browser_open.' },
        fileName: { type: 'string', description: 'Simple file name, without path separators; a timestamped name is generated when omitted.' },
        fullPage: { type: 'boolean', description: 'Capture the full scrollable page (default false).' },
        format: { type: 'string', enum: ['png', 'jpeg'], description: 'Image format (default png).' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { sessionId: { type: 'string' }, path: { type: 'string' }, bytes: { type: 'integer' }, format: { type: 'string' }, url: { type: 'string' } } } as const,
        render: (_args, value) => [{ type: 'text', text: 'Screenshot saved: ' + value.path + '\n' + value.bytes + ' bytes' }],
      },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Screenshot ' + args.sessionId.slice(0, 8), kind: 'read' } },
      presentResult(_args, result): ToolResultView | undefined { const value = result as unknown as { bytes: number; path: string }; return { card: 'generic', title: 'Screenshot · ' + value.bytes + ' bytes', content: [{ type: 'text', text: value.path }] } },
      execute(args, exec) { return client.screenshot(ownerOf(exec), args.sessionId, args.fileName, args.fullPage ?? false, args.format ?? 'png', exec.signal) },
    }),
    defineTool({
      name: 'browser_close',
      description: 'Close an existing browser session and release its isolated context.',
      parameters: { sessionId: { type: 'string', required: true, description: 'Opaque id returned by browser_open.' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { sessionId: { type: 'string' }, closed: { type: 'boolean' } } } as const,
        render: (_args, value) => [{ type: 'text', text: value.closed ? 'Closed browser session ' + value.sessionId + '.' : 'Browser session was not closed.' }],
      },
      presentCall(args): ToolCallView { return { card: 'generic', title: 'Close ' + args.sessionId.slice(0, 8), kind: 'edit' } },
      presentResult(_args, result): ToolResultView | undefined { const value = result as unknown as { closed: boolean }; return { card: 'generic', title: value.closed ? 'Browser session closed' : 'Browser session not closed' } },
      execute(args, exec) { return client.close(ownerOf(exec), args.sessionId) },
    }),
  ]
}

export function apply(ctx: Context, config: BrowserPluginConfig = {}): void {
  const client = new BrowserClient(config)
  for (const tool of createTools(client)) ctx.tools.register(tool)
  ctx.effect(() => async () => { await client.dispose() }, 'dsh-tool-browser: close browser sessions')
}
