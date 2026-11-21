import { createLimiter, createLockout, memoryStore, type Attempt } from 'omnilimit'
import { clientKey } from 'omnilimit/ip'

// Brake on wrong access tokens at /api/auth/login.
//
// Only failed attempts count: 10 can be spent at once and one more comes back
// every 90 seconds. While the budget is spent the route answers 429 without
// checking the token, so a correct one is refused too. That is what makes
// guessing useless.
//
// The count lives in this process. TAIA runs as one app container, so that is
// exact there and is lost on a restart.

export const LOGIN_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 } as const

const limiter = createLimiter({
  store: memoryStore(),
  scope: 'login-failures',
  ...LOGIN_LIMIT,
  // The memory store cannot fail; a remote one must not lock everybody out.
  onStoreError: 'open',
  headers: 'none',
})

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
 * The bucket a login attempt counts against: the client address when a trusted
 * proxy reports it, otherwise one bucket shared by everybody. A route handler
 * cannot see the TCP peer, and without a proxy of ours `X-Forwarded-For` is
 * whatever the client typed.
 */
export function loginBucket(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
): string {
  const proxies = trustedProxies(env)
  if (proxies === 0) return 'shared'
  return clientKey({ headers }, { xff: { hops: proxies - 1 } }) ?? 'shared'
}

// A right token does not clear the count: with one bucket shared by everybody,
// the owner signing in must not hand a guesser a fresh budget.
const lockout = createLockout({ limiter, resetOnSuccess: false })

/**
 * Run `verify` unless the bucket has failed too often. A false result counts as
 * one failed attempt.
 */
export function attemptLogin(
  bucket: string,
  verify: () => boolean | Promise<boolean>,
): Promise<Attempt> {
  return lockout.attempt(bucket, verify)
}

/** The `Retry-After` of a refused attempt, in seconds. */
export function retryAfterSeconds(attempt: Attempt): number {
  return Math.max(1, Math.ceil((attempt.decision.retryAfterMs ?? LOGIN_LIMIT.windowMs) / 1000))
}

/** Tests only: forget every failed attempt. */
export async function resetLoginLimit(bucket: string): Promise<void> {
  await limiter.reset(bucket)
}
