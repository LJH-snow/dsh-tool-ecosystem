/** Minimal AWS Signature Version 4 request signing for AWS Query/JSON APIs. */

export interface SigV4Params {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region: string
  service: string
  host: string
  method: string
  canonicalUri: string
  query: Record<string, string>
  headers: Record<string, string>
  body: string
  now?: Date
}

/**
 * Sign a request with AWS Signature Version 4. Returns the headers to send,
 * including `Authorization`, `X-Amz-Date`, and (optionally) `X-Amz-Security-Token`.
 *
 * The payload is form-urlencoded (the AWS Query API body); the body hash is
 * computed over the raw request body string.
 */
export async function signRequest(params: SigV4Params): Promise<Record<string, string>> {
  const crypto = globalThis.crypto
  const encoder = new TextEncoder()
  const now = params.now ?? new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
    const keyBuf = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer
    const imported = await crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', imported, encoder.encode(data))
    return new Uint8Array(sig)
  }

  async function hmacHex(key: Uint8Array, data: string): Promise<string> {
    const out = await hmac(key, data)
    return Array.from(out).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  async function sha256Hex(data: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(data))
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  const canonicalHeaders: Record<string, string> = { ...params.headers, 'host': params.host, 'x-amz-date': amzDate }
  if (params.sessionToken) canonicalHeaders['x-amz-security-token'] = params.sessionToken

  const sortedKeys = Object.keys(canonicalHeaders).sort()
  const canonicalHeadersString = sortedKeys.map(k => `${k}:${canonicalHeaders[k].trim()}`).join('\n')
  const signedHeaders = sortedKeys.join(';')

  const payloadHash = await sha256Hex(params.body)
  const canonicalRequest = [
    params.method,
    params.canonicalUri,
    new URLSearchParams(params.query).toString(),
    canonicalHeadersString,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const scope = `${dateStamp}/${params.region}/${params.service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  const kDate = await hmac(encoder.encode(`AWS4${params.secretAccessKey}`), dateStamp)
  const kRegion = await hmac(kDate, params.region)
  const kService = await hmac(kRegion, params.service)
  const kSigning = await hmac(kService, 'aws4_request')
  const signature = await hmacHex(kSigning, stringToSign)

  const result: Record<string, string> = { ...canonicalHeaders, 'authorization': `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` }
  delete result['host']
  return result
}