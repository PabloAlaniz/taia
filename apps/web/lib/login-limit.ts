import { createLimiter, createLockout, type Attempt } from 'omnilimit'
import { rateLimitStore } from '@taia/core/rate-limit'
import { clientBucket } from '@/lib/client-bucket'

// Brake on wrong access tokens at /api/auth/login.
//
// Only failed attempts count: 10 can be spent at once and one more comes back
// every 90 seconds. While the budget is spent the route answers 429 without
// checking the token, so a correct one is refused too. That is what makes
// guessing useless.
//
// The count lives in Postgres (see @taia/core/rate-limit), so a restart does
// not hand out a fresh budget.

export const LOGIN_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 } as const

const limiter = createLimiter({
  store: rateLimitStore(),
  scope: 'login-failures',
  ...LOGIN_LIMIT,
  // A credential check must not go uncounted: if the database cannot count the
  // attempt, refuse it (503). TAIA does not work without the database anyway.
  onStoreError: 'closed',
  headers: 'none',
})

/** The bucket a login attempt counts against: see `clientBucket`. */
export const loginBucket = clientBucket

// Reserve mode counts the attempt before the token is checked and gives it back
// when the token is right, so attempts sent all at once can never check more
// tokens than the budget has left.
//
// A right token does not clear the count: with one bucket shared by everybody,
// the owner signing in must not hand a guesser a fresh budget.
const lockout = createLockout({
  limits: [{ limiter, resetOnSuccess: false }],
  mode: 'reserve',
})

/**
 * Run `verify` unless the bucket has failed too often. A false result counts as
 * one failed attempt. When the database cannot count, the attempt is refused
 * and `decision.reason` is `store_error`.
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
