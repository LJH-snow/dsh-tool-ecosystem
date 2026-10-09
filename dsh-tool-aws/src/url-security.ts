import type { LookupAddress, LookupAllOptions } from 'node:dns'
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { URL } from 'node:url'

export type LookupImpl = (hostname: string, options: LookupAllOptions) => Promise<LookupAddress[]>

const ENDPOINT_ERROR = 'AWS endpoint is invalid or not allowed.'
const NETWORK_ERROR = 'AWS endpoint is not allowed for network access.'

export class UrlSecurityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UrlSecurityError'
  }
}

const ipv4BlockedRanges: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // unspecified and "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1 documentation
  ['192.31.196.0', 24], // AS112 service
  ['192.52.193.0', 24], // AMT service
  ['192.88.99.0', 24], // deprecated 6to4 anycast
  ['192.168.0.0', 16], // private
  ['192.175.48.0', 24], // AS112 service
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2 documentation
  ['203.0.113.0', 24], // TEST-NET-3 documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved/future use
]

const ipv6BlockedRanges: ReadonlyArray<readonly [string, number]> = [
  ['::', 96], // unspecified, loopback, and IPv4-compatible addresses
  ['::ffff:0:0', 96], // IPv4-mapped addresses
  ['64:ff9b::', 96], // well-known IPv4/IPv6 translation prefix
  ['64:ff9b:1::', 48], // local-use IPv4/IPv6 translation prefix
  ['100::', 64], // discard-only prefix
  ['100:0:0:1::', 64], // dummy IPv6 prefix (RFC 9780)
  ['2001::', 23], // IETF protocol assignments: Teredo, AMT, AS112-v6, benchmarking, ORCHID/ORCHIDv2, DRiP
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 transition addresses
  ['2620:4f:8000::', 48], // direct delegation AS112 service
  ['3fff::', 20], // documentation (RFC 9637)
  ['5f00::', 16], // segment routing (SRv6) SIDs
  ['fc00::', 7], // unique local addresses
  ['fe80::', 10], // link-local
  ['fec0::', 10], // deprecated site-local addresses
  ['ff00::', 8], // multicast
]

function invalidEndpoint(): never {
  throw new UrlSecurityError(ENDPOINT_ERROR)
}

function unsafeNetworkAddress(): never {
  throw new UrlSecurityError(NETWORK_ERROR)
}

function hostWithoutBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
}

function parseIpv4(address: string): bigint | null {
  const parts = address.split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return null
  let value = 0n
  for (const part of parts) {
    const octet = Number(part)
    if (octet > 255) return null
    value = (value << 8n) | BigInt(octet)
  }
  return value
}

function parseIpv6(address: string): bigint | null {
  const normalized = address.toLowerCase()
  if (normalized.includes('%')) return null
  const sections = normalized.split('::')
  if (sections.length > 2) return null

  const parseSection = (section: string): string[] | null => {
    if (!section) return []
    const parts = section.split(':')
    const result: string[] = []
    for (const [index, part] of parts.entries()) {
      if (part.includes('.')) {
        if (index !== parts.length - 1) return null
        const ipv4 = parseIpv4(part)
        if (ipv4 === null) return null
        result.push((ipv4 >> 16n).toString(16), (ipv4 & 0xffffn).toString(16))
      } else if (/^[0-9a-f]{1,4}$/.test(part)) {
        result.push(part)
      } else {
        return null
      }
    }
    return result
  }

  const head = parseSection(sections[0])
  const tail = sections.length === 2 ? parseSection(sections[1]) : []
  if (!head || !tail) return null

  const parts = [...head, ...tail]
  if (sections.length === 1) {
    if (parts.length !== 8) return null
  } else {
    const zeroCount = 8 - parts.length
    if (zeroCount < 1) return null
    parts.splice(head.length, 0, ...Array.from({ length: zeroCount }, () => '0'))
  }
  if (parts.length !== 8) return null

  let value = 0n
  for (const part of parts) value = (value << 16n) | BigInt(Number.parseInt(part, 16))
  return value
}

function ipv4InRange(address: bigint, network: bigint, prefix: number): boolean {
  const mask = prefix === 0 ? 0n : ((1n << 32n) - 1n) ^ ((1n << BigInt(32 - prefix)) - 1n)
  return (address & mask) === (network & mask)
}

function ipv6InRange(address: bigint, network: bigint, prefix: number): boolean {
  const mask = prefix === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - prefix)) - 1n)
  return (address & mask) === (network & mask)
}

/** Returns true for an invalid or non-publicly-routable IP address. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    const value = parseIpv4(address)
    if (value === null) return true
    return ipv4BlockedRanges.some(([network, prefix]) => {
      const parsedNetwork = parseIpv4(network)
      return parsedNetwork !== null && ipv4InRange(value, parsedNetwork, prefix)
    })
  }
  if (family === 6) {
    const value = parseIpv6(address)
    if (value === null) return true
    return ipv6BlockedRanges.some(([network, prefix]) => {
      const parsedNetwork = parseIpv6(network)
      return parsedNetwork !== null && ipv6InRange(value, parsedNetwork, prefix)
    })
  }
  return true
}

function assertHostnameSyntax(hostname: string): void {
  const host = hostWithoutBrackets(hostname).toLowerCase()
  if (!host || /[\u0000-\u0020\u007f]/.test(host)) invalidEndpoint()

  const family = isIP(host)
  if (family === 4 || family === 6) return
  if (host.includes(':') || host.includes('[') || host.includes(']')) invalidEndpoint()

  const withoutTrailingDot = host.endsWith('.') ? host.slice(0, -1) : host
  if (!withoutTrailingDot || withoutTrailingDot.length > 253) invalidEndpoint()
  const labels = withoutTrailingDot.split('.')
  if (labels.some(label => label.length === 0 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    invalidEndpoint()
  }
}

function isLocalHostname(hostname: string): boolean {
  const host = hostWithoutBrackets(hostname).toLowerCase().replace(/\.+$/, '')
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host === 'localhost.localdomain'
    || host.endsWith('.localhost.localdomain')
    || host === 'ip6-localhost'
    || host === 'ip6-loopback'
    || host === 'ip6-allnodes'
    || host === 'ip6-allrouters'
    || host === 'broadcasthost'
    || host === 'local'
    || host.endsWith('.local')
}

function rawEndpointAuthority(endpoint: string): string | null {
  const schemeEnd = endpoint.indexOf('://')
  if (schemeEnd < 0) return null
  const authorityStart = schemeEnd + 3
  let delimiter = endpoint.length
  for (const marker of ['/', '\\', '?', '#']) {
    const position = endpoint.indexOf(marker, authorityStart)
    if (position >= 0) delimiter = Math.min(delimiter, position)
  }
  return endpoint.slice(authorityStart, delimiter)
}

function rawEndpointHasUserInfo(endpoint: string): boolean {
  const authority = rawEndpointAuthority(endpoint)
  return authority !== null && authority.includes('@')
}

function rawEndpointHasNonRootPath(endpoint: string): boolean {
  const schemeEnd = endpoint.indexOf('://')
  if (schemeEnd < 0) return false
  const authorityStart = schemeEnd + 3
  let delimiter = endpoint.length
  for (const marker of ['/', '\\', '?', '#']) {
    const position = endpoint.indexOf(marker, authorityStart)
    if (position >= 0) delimiter = Math.min(delimiter, position)
  }
  if (delimiter === endpoint.length) return false
  const pathEnd = Math.min(
    ...['?', '#'].map(marker => {
      const position = endpoint.indexOf(marker, delimiter)
      return position >= 0 ? position : endpoint.length
    }),
  )
  const rawPath = endpoint.slice(delimiter, pathEnd)
  return rawPath !== '' && rawPath !== '/'
}

/** Normalize a configured endpoint to its origin, or return an empty string for the AWS default. */
export function normalizeEndpoint(endpoint?: string): string {
  if (endpoint === undefined || endpoint === '') return ''
  if (typeof endpoint !== 'string' || endpoint.trim() !== endpoint || /[\u0000-\u001f\u007f]/.test(endpoint)) invalidEndpoint()
  if (rawEndpointHasUserInfo(endpoint) || /[?#]/.test(endpoint) || rawEndpointHasNonRootPath(endpoint)) invalidEndpoint()

  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    invalidEndpoint()
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:')
    || !url.hostname
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== '/') {
    invalidEndpoint()
  }
  assertHostnameSyntax(url.hostname)
  return url.origin
}

const defaultLookup: LookupImpl = (hostname, options) => dnsLookup(hostname, options)

/** Validate a final request URL immediately before it is handed to fetch. */
export async function assertSafeUrl(input: URL | string, lookupImpl: LookupImpl = defaultLookup): Promise<void> {
  let url: URL
  if (input instanceof URL) {
    url = input
  } else {
    try {
      url = new URL(input)
    } catch {
      unsafeNetworkAddress()
    }
  }

  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || !url.hostname) {
    unsafeNetworkAddress()
  }

  const hostname = hostWithoutBrackets(url.hostname).toLowerCase()
  try {
    assertHostnameSyntax(hostname)
  } catch {
    unsafeNetworkAddress()
  }
  if (isLocalHostname(hostname)) unsafeNetworkAddress()

  const literalFamily = isIP(hostname)
  if (literalFamily) {
    if (isBlockedAddress(hostname)) unsafeNetworkAddress()
    return
  }

  let addresses: LookupAddress[]
  try {
    addresses = await lookupImpl(hostname, { all: true })
  } catch {
    unsafeNetworkAddress()
  }
  if (!Array.isArray(addresses) || addresses.length === 0) unsafeNetworkAddress()

  for (const result of addresses) {
    if (!result || typeof result.address !== 'string' || (result.family !== 4 && result.family !== 6)) unsafeNetworkAddress()
    const family = isIP(result.address)
    if (family !== result.family || isBlockedAddress(result.address)) unsafeNetworkAddress()
  }
}
