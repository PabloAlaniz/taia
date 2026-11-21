// Outbound URL policy — where the server may send requests on behalf of a
// caller. Whoever can use the API can store a URL, and that must not
// turn the server into a way to reach what only the server can reach: its own
// loopback services, the private network around it or a cloud metadata
// endpoint (SSRF).
//
// Applies to outgoing webhooks. Runtime URLs are not filtered: a gateway on
// localhost or the LAN is the normal setup.
//
// `TAIA_WEBHOOK_ALLOW_PRIVATE=1` lets webhooks reach private and loopback
// addresses, for a receiver on the same host or network.

import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

const blocked = new BlockList()
// IPv4
blocked.addSubnet('0.0.0.0', 8) // "this" network
blocked.addSubnet('10.0.0.0', 8) // private
blocked.addSubnet('100.64.0.0', 10) // carrier-grade NAT (also Tailscale)
blocked.addSubnet('127.0.0.0', 8) // loopback
blocked.addSubnet('169.254.0.0', 16) // link-local, cloud metadata
blocked.addSubnet('172.16.0.0', 12) // private
blocked.addSubnet('192.0.0.0', 24) // IETF protocol assignments
blocked.addSubnet('192.168.0.0', 16) // private
blocked.addSubnet('198.18.0.0', 15) // benchmarking
blocked.addSubnet('224.0.0.0', 4) // multicast
blocked.addSubnet('240.0.0.0', 4) // reserved, broadcast
// IPv6
blocked.addAddress('::', 'ipv6') // unspecified
blocked.addAddress('::1', 'ipv6') // loopback
blocked.addSubnet('64:ff9b::', 96, 'ipv6') // NAT64
blocked.addSubnet('fc00::', 7, 'ipv6') // unique local
blocked.addSubnet('fe80::', 10, 'ipv6') // link-local
blocked.addSubnet('ff00::', 8, 'ipv6') // multicast

const IPV4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i

/** Whether `address` (an IP literal) is loopback, private, link-local or otherwise not public. */
export function isNonPublicAddress(address: string): boolean {
  const mapped = IPV4_MAPPED.exec(address)
  if (mapped) return blocked.check(mapped[1], 'ipv4')
  const family = isIP(address)
  if (family === 4) return blocked.check(address, 'ipv4')
  if (family === 6) return blocked.check(address, 'ipv6')
  return true // not an IP address at all
}

export function privateWebhooksAllowed(): boolean {
  return process.env.TAIA_WEBHOOK_ALLOW_PRIVATE === '1'
}

export class OutboundUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OutboundUrlError'
  }
}

type Resolver = (hostname: string) => Promise<string[]>

const resolveAll: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true })).map((entry) => entry.address)

/**
 * Throws OutboundUrlError unless `rawUrl` is an http(s) URL whose host
 * resolves only to public addresses. Every resolved address is checked, so a
 * name that also points at a private address is refused.
 *
 * The check and the request resolve the name separately; a DNS server that
 * answers differently the second time can still get through. Use
 * a network policy on the host when that matters.
 */
export async function assertPublicWebhookUrl(
  rawUrl: string,
  resolve: Resolver = resolveAll,
): Promise<void> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new OutboundUrlError('Webhook URL is not a valid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OutboundUrlError(`Webhook URL must be http or https, not ${url.protocol}`)
  }
  if (privateWebhooksAllowed()) return

  // URL keeps the brackets of an IPv6 literal in `hostname`.
  const host = url.hostname.replace(/^\[|\]$/g, '')
  let addresses: string[]
  if (isIP(host)) {
    addresses = [host]
  } else {
    try {
      addresses = await resolve(host)
    } catch {
      throw new OutboundUrlError(`Webhook host ${host} could not be resolved`)
    }
  }

  if (addresses.length === 0 || addresses.some(isNonPublicAddress)) {
    throw new OutboundUrlError(
      `Webhook host ${host} is not a public address. ` +
        'Set TAIA_WEBHOOK_ALLOW_PRIVATE=1 on the server to allow private and loopback receivers.',
    )
  }
}
