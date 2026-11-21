import { clientKey } from 'omnilimit/ip'

/**
 * How many reverse proxies of your own sit in front of the app
 * (`TAIA_TRUSTED_PROXIES`). Each one has to append the address it received the
 * request from to `X-Forwarded-For`, as Caddy does.
 */
function trustedProxies(env: Record<string, string | undefined>): number {
  const value = Number(env.TAIA_TRUSTED_PROXIES)
  return Number.isInteger(value) && value > 0 ? value : 0
}

/**
 * The bucket a request counts against in a rate limit: the client address when
 * a trusted proxy reports it, otherwise one bucket shared by everybody. A route
 * handler cannot see the TCP peer, and without a proxy of ours
 * `X-Forwarded-For` is whatever the client typed.
 */
export function clientBucket(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
): string {
  const proxies = trustedProxies(env)
  if (proxies === 0) return 'shared'
  return clientKey({ headers }, { xff: { hops: proxies - 1 } }) ?? 'shared'
}
