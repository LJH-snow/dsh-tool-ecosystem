import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { LookupAddress } from 'node:dns'

export type LookupImpl = (hostname: string, options: { all: true }) => Promise<LookupAddress[]>

const DEFAULT_BASE_URL = 'https://hub.docker.com'

const IPV4_BLOCKED_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.31.196.0', 24],
  ['192.52.193.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['192.175.48.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

const IPV6_BLOCKED_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['::', 96],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['100:0:0:1::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['2620:4f:8000::', 48],
  ['3fff::', 20],
  ['5f00::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
]

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

function inRange(address: bigint, network: bigint, bits: number, width: number): boolean {
  const hostBits = width - bits
  const mask = hostBits === width ? 0n : ((1n << BigInt(width)) - 1n) ^ ((1n << BigInt(hostBits)) - 1n)
  return (address & mask) === (network & mask)
}

function isBlockedIpv4(address: string): boolean {
  const value = parseIpv4(address)
  if (value === null) return true
  return IPV4_BLOCKED_RANGES.some(([network, bits]) => {
    const parsed = parseIpv4(network)
    return parsed !== null && inRange(value, parsed, bits, 32)
  })
}

function isBlockedIpv6(address: string): boolean {
  const value = parseIpv6(address)
  if (value === null) return true
  return IPV6_BLOCKED_RANGES.some(([network, bits]) => {
    const parsed = parseIpv6(network)
    return parsed !== null && inRange(value, parsed, bits, 128)
  })
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return isBlockedIpv4(address)
  if (family === 6) return isBlockedIpv6(address)
  return true
}

function invalidBaseUrl(): never {
  throw new Error('Docker Hub baseUrl is invalid.')
}

function hostnameIsLocal(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.+$/, '')
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === 'localhost.localdomain'
    || normalized.endsWith('.localhost.localdomain')
    || normalized === 'local'
    || normalized.endsWith('.local')
}

export function normalizeBaseUrl(baseUrl?: string): string {
  const value = baseUrl ?? DEFAULT_BASE_URL
  if (typeof value !== 'string' || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) return invalidBaseUrl()

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return invalidBaseUrl()
  }

  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname || url.username || url.password || url.search || url.hash) {
    return invalidBaseUrl()
  }

  const pathPrefix = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${pathPrefix}`
}

export async function assertSafeUrl(url: URL, lookupImpl: LookupImpl = async (hostname, options) => dnsLookup(hostname, options)): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Docker Hub request URL was rejected by host safety policy.')

  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase()
  if (!hostname || hostnameIsLocal(hostname)) throw new Error('Docker Hub request URL was rejected by host safety policy.')

  const literalFamily = isIP(hostname)
  if (literalFamily) {
    if (isBlockedAddress(hostname)) throw new Error('Docker Hub request URL was rejected by host safety policy.')
    return
  }

  let addresses: LookupAddress[]
  try {
    addresses = await lookupImpl(hostname, { all: true })
  } catch {
    throw new Error('Docker Hub request URL was rejected by host safety policy.')
  }
  if (!Array.isArray(addresses) || addresses.length === 0) throw new Error('Docker Hub request URL was rejected by host safety policy.')

  for (const result of addresses) {
    if (!result || (result.family !== 4 && result.family !== 6) || isIP(result.address) !== result.family || isBlockedAddress(result.address)) {
      throw new Error('Docker Hub request URL was rejected by host safety policy.')
    }
  }
}
