import Anthropic, { APIError } from '@anthropic-ai/sdk'

export const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'
export const DEFAULT_TIMEOUT_MS = 30_000
export const DEFAULT_MAX_INPUT_CHARS = 16_000
export const DEFAULT_MAX_OUTPUT_CHARS = 20_000
export const DEFAULT_MAX_OUTPUT_TOKENS = 1_024
export const MAX_MODELS = 50

export interface AnthropicModelSummary {
  id: string
  displayName: string
  createdAt?: string
}

export interface AnthropicUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface AnthropicMessageResult {
  id: string
  model: string
  outputText: string
  truncated: boolean
  stopReason?: string
  usage?: AnthropicUsage
}

export interface AnthropicModelListResponse {
  data?: Array<{ id?: unknown; display_name?: unknown; created_at?: unknown }>
  request_id?: unknown
}

export interface AnthropicMessageRequest {
  model: string
  max_tokens: number
  system?: string
  messages: Array<{ role: 'user'; content: string }>
}

export interface AnthropicContentBlock {
  type?: unknown
  text?: unknown
}

export interface AnthropicMessageApiResult {
  id?: unknown
  model?: unknown
  content?: AnthropicContentBlock[]
  stop_reason?: unknown
  usage?: { input_tokens?: unknown; output_tokens?: unknown } | null
  request_id?: unknown
}

export interface AnthropicRequestOptions { signal?: AbortSignal }

/** Transport boundary used by tests and hosts that provide their own HTTP adapter. */
export interface AnthropicTransport {
  modelsList(options?: AnthropicRequestOptions): Promise<AnthropicModelListResponse>
  messagesCreate(params: AnthropicMessageRequest, options?: AnthropicRequestOptions): Promise<AnthropicMessageApiResult>
}

export interface AnthropicClientOptions {
  apiKey?: string
  baseUrl?: string
  timeoutMs?: number
  maxInputChars?: number
  maxOutputChars?: number
  transport?: AnthropicTransport
}

export class AnthropicClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly requestId?: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'AnthropicClientError'
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown, max = 240): string {
  if (typeof value !== 'string') return value == null ? '' : String(value).slice(0, max)
  return value.slice(0, max)
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value as number))) : fallback
}

function normalizeBaseUrl(value?: string): string {
  const raw = value ?? DEFAULT_ANTHROPIC_BASE_URL
  let url: URL
  try { url = new URL(raw) } catch { throw new AnthropicClientError('Anthropic base URL is invalid.', 400, undefined, 'INVALID_ENDPOINT') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new AnthropicClientError('Anthropic base URL must use HTTPS without credentials, query, or fragment.', 400, undefined, 'INVALID_ENDPOINT')
  }
  if (url.hostname.toLowerCase() !== 'api.anthropic.com') {
    throw new AnthropicClientError('Anthropic base URL must use the official api.anthropic.com endpoint.', 400, undefined, 'INVALID_ENDPOINT')
  }
  if (url.port && url.port !== '443') throw new AnthropicClientError('Anthropic base URL must use the default HTTPS port.', 400, undefined, 'INVALID_ENDPOINT')
  if (url.pathname.replace(/\/+$/, '') !== '/v1') throw new AnthropicClientError('Anthropic base URL must end at /v1.', 400, undefined, 'INVALID_ENDPOINT')
  url.pathname = '/v1'
  url.port = ''
  return url.toString().replace(/\/$/, '')
}

function safeErrorMessage(error: unknown, secret: string): string {
  const raw = error instanceof Error ? error.message : 'Anthropic request failed.'
  const withoutSecret = secret ? raw.split(secret).join('[redacted]') : raw
  return withoutSecret.replace(/(?:x-api-key|authorization)\s*:\s*(?:bearer\s+)?[^\s,;]+/gi, '[credential redacted]').slice(0, 500)
}

function toClientError(error: unknown, secret: string): AnthropicClientError {
  if (error instanceof AnthropicClientError) return error
  if (error instanceof APIError) {
    const status = typeof error.status === 'number' ? error.status : undefined
    const requestId = typeof error.requestID === 'string' ? error.requestID.slice(0, 120) : undefined
    return new AnthropicClientError('Anthropic API request failed.', status, requestId, error.type ?? undefined)
  }
  const value = record(error)
  const status = typeof value.status === 'number' ? value.status : undefined
  const requestIdValue = value.requestID ?? value.requestId
  const requestId = typeof requestIdValue === 'string' ? requestIdValue.slice(0, 120) : undefined
  if (value.name === 'AbortError' || /timed out/i.test(String(value.message ?? ''))) return new AnthropicClientError('Anthropic request timed out.', status, requestId, 'TIMEOUT')
  return new AnthropicClientError(safeErrorMessage(error, secret), status, requestId)
}

function defaultTransport(apiKey: string, baseUrl: string, timeoutMs: number): AnthropicTransport {
  let sdk: Anthropic | undefined
  const getSdk = () => sdk ??= new Anthropic({ apiKey: apiKey || undefined, baseURL: baseUrl, timeout: timeoutMs, maxRetries: 0 })
  return {
    async modelsList(options) {
      const page = await getSdk().models.list({}, { signal: options?.signal })
      return { data: page.data.map(model => ({ id: model.id, display_name: model.display_name, created_at: model.created_at })), request_id: (page as unknown as { _request_id?: string })._request_id }
    },
    async messagesCreate(params, options) {
      const response = await getSdk().messages.create({
        model: params.model,
        max_tokens: params.max_tokens,
        system: params.system,
        messages: params.messages,
      }, { signal: options?.signal })
      if ('content' in response) return {
        id: response.id,
        model: response.model,
        content: response.content.map(block => ({ type: block.type, text: 'text' in block ? block.text : undefined })),
        stop_reason: response.stop_reason,
        usage: response.usage ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens } : undefined,
        request_id: (response as unknown as { _request_id?: string })._request_id,
      }
      return response as unknown as AnthropicMessageApiResult
    },
  }
}

export class AnthropicClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly maxInputChars: number
  private readonly maxOutputChars: number
  private readonly transport: AnthropicTransport
  private readonly injectedTransport: boolean

  constructor(options: AnthropicClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? ''
    this.baseUrl = normalizeBaseUrl(options.baseUrl)
    this.timeoutMs = clamp(options.timeoutMs, 100, 120_000, DEFAULT_TIMEOUT_MS)
    this.maxInputChars = clamp(options.maxInputChars, 1, 1_000_000, DEFAULT_MAX_INPUT_CHARS)
    this.maxOutputChars = clamp(options.maxOutputChars, 1, 1_000_000, DEFAULT_MAX_OUTPUT_CHARS)
    this.injectedTransport = Boolean(options.transport)
    this.transport = options.transport ?? defaultTransport(this.apiKey, this.baseUrl, this.timeoutMs)
  }

  hasCredentials(): boolean { return this.apiKey.length > 0 }
  getBaseUrl(): string { return this.baseUrl }
  usesInjectedTransport(): boolean { return this.injectedTransport }

  async authTest(signal?: AbortSignal): Promise<{ ok: true; status: string; requestId?: string }> {
    if (!this.hasCredentials() && !this.injectedTransport) throw new AnthropicClientError('ANTHROPIC_API_KEY is not configured.', undefined, undefined, 'MISSING_API_KEY')
    const result = await this.run('modelsList', requestSignal => this.transport.modelsList({ signal: requestSignal }), signal)
    const requestId = record(result).request_id
    return { ok: true, status: 'authenticated', requestId: typeof requestId === 'string' ? requestId.slice(0, 120) : undefined }
  }

  async listModels(signal?: AbortSignal): Promise<AnthropicModelSummary[]> {
    if (!this.hasCredentials() && !this.injectedTransport) throw new AnthropicClientError('ANTHROPIC_API_KEY is not configured.', undefined, undefined, 'MISSING_API_KEY')
    const result = await this.run('modelsList', requestSignal => this.transport.modelsList({ signal: requestSignal }), signal)
    return (Array.isArray(result.data) ? result.data : []).slice(0, MAX_MODELS).map(item => ({
      id: stringValue(item.id, 160),
      displayName: stringValue(item.display_name, 200),
      createdAt: stringValue(item.created_at, 80) || undefined,
    })).filter(item => item.id.length > 0)
  }

  async createMessage(input: { model: string; input: string; system?: string; maxOutputTokens?: number }, signal?: AbortSignal): Promise<AnthropicMessageResult> {
    if (!this.hasCredentials() && !this.injectedTransport) throw new AnthropicClientError('ANTHROPIC_API_KEY is not configured.', undefined, undefined, 'MISSING_API_KEY')
    const model = input.model.trim()
    if (!model) throw new AnthropicClientError('model is required.', 400, undefined, 'INVALID_ARGUMENT')
    if (typeof input.input !== 'string' || input.input.trim().length === 0) throw new AnthropicClientError('input is required.', 400, undefined, 'INVALID_ARGUMENT')
    const prompt = input.input.slice(0, this.maxInputChars)
    const system = typeof input.system === 'string' ? input.system.slice(0, this.maxInputChars) : undefined
    const maxOutputTokens = clamp(input.maxOutputTokens, 1, 100_000, DEFAULT_MAX_OUTPUT_TOKENS)
    const result = await this.run('messagesCreate', requestSignal => this.transport.messagesCreate({ model, max_tokens: maxOutputTokens, system, messages: [{ role: 'user', content: prompt }] }, { signal: requestSignal }), signal)
    const raw = record(result)
    const blocks = Array.isArray(raw.content) ? raw.content : []
    const output = blocks.filter(block => record(block).type === 'text').map(block => stringValue(record(block).text, this.maxOutputChars + 1)).join('')
    const usage = record(raw.usage)
    const inputTokens = numberValue(usage.input_tokens)
    const outputTokens = numberValue(usage.output_tokens)
    const truncated = output.length > this.maxOutputChars
    return {
      id: stringValue(raw.id, 160),
      model: stringValue(raw.model, 160) || model,
      outputText: output.slice(0, this.maxOutputChars),
      truncated,
      stopReason: stringValue(raw.stop_reason, 80) || undefined,
      usage: raw.usage ? { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } : undefined,
    }
  }

  private async run<T>(operation: string, work: (signal: AbortSignal) => Promise<T>, callerSignal?: AbortSignal): Promise<T> {
    const controller = new AbortController()
    const onCallerAbort = () => controller.abort(callerSignal?.reason ?? new Error('Anthropic request aborted.'))
    if (callerSignal) {
      if (callerSignal.aborted) onCallerAbort()
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true })
    }
    const timer = setTimeout(() => controller.abort(new Error('Anthropic request timed out.')), this.timeoutMs)
    try { return await workWithSignal(work, controller.signal) }
    catch (error) { throw toClientError(error, this.apiKey) }
    finally { clearTimeout(timer); if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort); void operation }
  }
}

async function workWithSignal<T>(work: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
  return await Promise.race([work(signal), new Promise<T>((_, reject) => {
    if (signal.aborted) reject(signal.reason ?? new Error('Anthropic request timed out.'))
    else signal.addEventListener('abort', () => reject(signal.reason ?? new Error('Anthropic request timed out.')), { once: true })
  })])
}

export { normalizeBaseUrl }
