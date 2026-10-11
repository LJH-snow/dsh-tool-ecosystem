import OpenAI, { APIError } from 'openai'

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
export const DEFAULT_TIMEOUT_MS = 30_000
export const DEFAULT_MAX_INPUT_CHARS = 16_000
export const DEFAULT_MAX_OUTPUT_CHARS = 20_000
export const MAX_MODELS = 50

export interface OpenAIModelSummary {
  id: string
  ownedBy: string
}

export interface OpenAIUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface OpenAIResponseResult {
  id: string
  model: string
  outputText: string
  truncated: boolean
  usage?: OpenAIUsage
}

export interface OpenAIModelListResponse {
  data?: Array<{ id?: unknown; owned_by?: unknown }>
}

export interface OpenAIResponseRequest {
  model: string
  input: string
  instructions?: string
  max_output_tokens?: number
  store: false
}

export interface OpenAIResponseApiResult {
  id?: unknown
  model?: unknown
  output_text?: unknown
  usage?: {
    input_tokens?: unknown
    output_tokens?: unknown
    total_tokens?: unknown
  } | null
}

export interface OpenAIRequestOptions {
  signal?: AbortSignal
}

/** A small transport boundary that keeps tests off the real OpenAI network. */
export interface OpenAITransport {
  modelsList(options?: OpenAIRequestOptions): Promise<OpenAIModelListResponse>
  responsesCreate(params: OpenAIResponseRequest, options?: OpenAIRequestOptions): Promise<OpenAIResponseApiResult>
}

export interface OpenAIClientOptions {
  apiKey?: string
  baseUrl?: string
  timeoutMs?: number
  maxInputChars?: number
  maxOutputChars?: number
  /** Test or host supplied transport. The default uses the official OpenAI SDK. */
  transport?: OpenAITransport
}

export class OpenAIClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly requestId?: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'OpenAIClientError'
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
  const raw = value ?? DEFAULT_OPENAI_BASE_URL
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new OpenAIClientError('OpenAI base URL is invalid.', 400, undefined, 'INVALID_ENDPOINT')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new OpenAIClientError('OpenAI base URL must use HTTPS without credentials, query, or fragment.', 400, undefined, 'INVALID_ENDPOINT')
  }
  if (url.hostname.toLowerCase() !== 'api.openai.com') {
    throw new OpenAIClientError('OpenAI base URL must use the official api.openai.com endpoint.', 400, undefined, 'INVALID_ENDPOINT')
  }
  if (url.port && url.port !== '443') {
    throw new OpenAIClientError('OpenAI base URL must use the default HTTPS port.', 400, undefined, 'INVALID_ENDPOINT')
  }
  if (url.pathname.replace(/\/+$/, '') !== '/v1') {
    throw new OpenAIClientError('OpenAI base URL must end at /v1.', 400, undefined, 'INVALID_ENDPOINT')
  }
  url.pathname = '/v1'
  url.port = ''
  return url.toString().replace(/\/$/, '')
}

function safeErrorMessage(error: unknown, secret: string): string {
  const raw = error instanceof Error ? error.message : 'OpenAI request failed.'
  const withoutSecret = secret ? raw.split(secret).join('[redacted]') : raw
  return withoutSecret.replace(/authorization\s*:\s*bearer\s+[^\s,;]+/gi, 'Authorization: Bearer [redacted]').slice(0, 500)
}

function toClientError(error: unknown, secret: string): OpenAIClientError {
  if (error instanceof OpenAIClientError) return error
  if (error instanceof APIError) {
    const status = typeof error.status === 'number' ? error.status : undefined
    const requestId = typeof error.requestID === 'string' ? error.requestID.slice(0, 120) : undefined
    return new OpenAIClientError('OpenAI API request failed.', status, requestId, error.code ?? undefined)
  }
  const value = record(error)
  const status = typeof value.status === 'number' ? value.status : undefined
  const requestIdValue = value.requestID ?? value.requestId
  const requestId = typeof requestIdValue === 'string' ? requestIdValue.slice(0, 120) : undefined
  if (value.name === 'AbortError' || /timed out/i.test(String(value.message ?? ''))) {
    return new OpenAIClientError('OpenAI request timed out.', status, requestId, 'TIMEOUT')
  }
  return new OpenAIClientError(safeErrorMessage(error, secret), status, requestId)
}

function defaultTransport(apiKey: string, baseUrl: string, timeoutMs: number): OpenAITransport {
  let sdk: OpenAI | undefined
  const getSdk = () => sdk ??= new OpenAI({ apiKey: apiKey || undefined, baseURL: baseUrl, timeout: timeoutMs, maxRetries: 0 })
  return {
    async modelsList(options) {
      const page = await getSdk().models.list({ signal: options?.signal })
      return { data: page.data.map(model => ({ id: model.id, owned_by: model.owned_by })) }
    },
    async responsesCreate(params, options) {
      const response = await getSdk().responses.create({
        model: params.model,
        input: params.input,
        instructions: params.instructions,
        max_output_tokens: params.max_output_tokens,
        store: false,
      }, { signal: options?.signal })
      if ('output_text' in response) {
        return {
          id: response.id,
          model: response.model,
          output_text: response.output_text,
          usage: response.usage ? {
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
            total_tokens: response.usage.total_tokens,
          } : undefined,
        }
      }
      return response as unknown as OpenAIResponseApiResult
    },
  }
}

export class OpenAIClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly maxInputChars: number
  private readonly maxOutputChars: number
  private readonly transport: OpenAITransport
  private readonly injectedTransport: boolean

  constructor(options: OpenAIClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? ''
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

  async authTest(signal?: AbortSignal): Promise<{ ok: true; status: string; requestId?: string }>
  {
    if (!this.hasCredentials() && !this.injectedTransport) {
      throw new OpenAIClientError('OPENAI_API_KEY is not configured.', undefined, undefined, 'MISSING_API_KEY')
    }
    const result = await this.run('modelsList', requestSignal => this.transport.modelsList({ signal: requestSignal }), signal)
    const requestId = record(result).request_id
    return { ok: true, status: 'authenticated', requestId: typeof requestId === 'string' ? requestId.slice(0, 120) : undefined }
  }

  async listModels(signal?: AbortSignal): Promise<OpenAIModelSummary[]> {
    if (!this.hasCredentials() && !this.injectedTransport) {
      throw new OpenAIClientError('OPENAI_API_KEY is not configured.', undefined, undefined, 'MISSING_API_KEY')
    }
    const result = await this.run('modelsList', requestSignal => this.transport.modelsList({ signal: requestSignal }), signal)
    return (Array.isArray(result.data) ? result.data : []).slice(0, MAX_MODELS).map(item => ({
      id: stringValue(item.id, 160),
      ownedBy: stringValue(item.owned_by, 120),
    })).filter(item => item.id.length > 0)
  }

  async createResponse(input: { model: string; input: string; instructions?: string; maxOutputTokens?: number }, signal?: AbortSignal): Promise<OpenAIResponseResult> {
    const model = input.model.trim()
    if (!model) throw new OpenAIClientError('model is required.', 400, undefined, 'INVALID_ARGUMENT')
    if (typeof input.input !== 'string' || input.input.trim().length === 0) throw new OpenAIClientError('input is required.', 400, undefined, 'INVALID_ARGUMENT')
    const prompt = input.input.slice(0, this.maxInputChars)
    const instructions = typeof input.instructions === 'string' ? input.instructions.slice(0, this.maxInputChars) : undefined
    const maxOutputTokens = input.maxOutputTokens === undefined ? undefined : clamp(input.maxOutputTokens, 1, 1_000_000, 1)
    const result = await this.run('responsesCreate', requestSignal => this.transport.responsesCreate({ model, input: prompt, instructions, max_output_tokens: maxOutputTokens, store: false }, { signal: requestSignal }), signal)
    const raw = record(result)
    const output = stringValue(raw.output_text)
    const truncated = output.length > this.maxOutputChars
    const usage = record(raw.usage)
    return {
      id: stringValue(raw.id, 160),
      model: stringValue(raw.model, 160) || model,
      outputText: output.slice(0, this.maxOutputChars),
      truncated,
      usage: raw.usage ? {
        inputTokens: numberValue(usage.input_tokens),
        outputTokens: numberValue(usage.output_tokens),
        totalTokens: numberValue(usage.total_tokens),
      } : undefined,
    }
  }

  private async run<T>(operation: string, work: (signal: AbortSignal) => Promise<T>, callerSignal?: AbortSignal): Promise<T> {
    const controller = new AbortController()
    const onCallerAbort = () => controller.abort(callerSignal?.reason ?? new Error('OpenAI request aborted.'))
    if (callerSignal) {
      if (callerSignal.aborted) onCallerAbort()
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true })
    }
    const timer = setTimeout(() => controller.abort(new Error('OpenAI request timed out.')), this.timeoutMs)
    try {
      return await workWithSignal(work, controller.signal)
    } catch (error) {
      throw toClientError(error, this.apiKey)
    } finally {
      clearTimeout(timer)
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort)
      void operation
    }
  }
}

async function workWithSignal<T>(work: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
  return await Promise.race([work(signal), new Promise<T>((_, reject) => {
    if (signal.aborted) reject(signal.reason ?? new Error('OpenAI request timed out.'))
    else signal.addEventListener('abort', () => reject(signal.reason ?? new Error('OpenAI request timed out.')), { once: true })
  })])
}

export { normalizeBaseUrl }
