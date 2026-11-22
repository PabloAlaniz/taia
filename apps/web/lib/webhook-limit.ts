import { createLimiter, memoryStore, parsePolicy, type Decision, type Limiter } from 'omnilimit'

// Brake on POST /api/webhooks/incoming, the one route open without the access
// token. It runs before the body is read or the database is asked for the
// workspace secret, so a flood costs a counter and not the whole handler.
//
// The count is per client (see `clientBucket`) and kept in memory: only the
// web process serves this route, and a restart forgetting it is harmless.
// Counting in Postgres would cost a write per request, which is what this
// brake is meant to save.

export const DEFAULT_WEBHOOK_LIMIT = '120/minute'

/** `TAIA_WEBHOOK_RATE_LIMIT` as a policy, e.g. `120/minute`; the default if unset or invalid. */
export function webhookPolicy(env: Record<string, string | undefined> = process.env): {
  limit: number
  windowMs: number
} {
  const given = env.TAIA_WEBHOOK_RATE_LIMIT?.trim()
  if (given) {
    try {
      return parsePolicy(given)
    } catch {
      console.warn(
        `[webhooks] Ignoring TAIA_WEBHOOK_RATE_LIMIT=${JSON.stringify(given)}: ` +
          `expected something like ${DEFAULT_WEBHOOK_LIMIT}`,
      )
    }
  }
  return parsePolicy(DEFAULT_WEBHOOK_LIMIT)
}

let limiter: Limiter | null = null

function webhookLimiter(): Limiter {
  limiter ??= createLimiter({
    ...webhookPolicy(),
    store: memoryStore(),
    scope: 'incoming-webhooks',
    // A memory store cannot fail; this only matters if the store changes.
    onStoreError: 'open',
  })
  return limiter
}

/** Count one delivery from `bucket`. A denied one carries its 429 headers. */
export function checkWebhookLimit(bucket: string): Promise<Decision> {
  return webhookLimiter().check(bucket)
}

/** Tests only: start from an empty count with the current environment. */
export function resetWebhookLimit(): void {
  limiter = null
}

/** GitHub caps webhook payloads at 25 MB, so a smaller default would refuse real deliveries. */
export const DEFAULT_WEBHOOK_MAX_BYTES = 25 * 1024 * 1024

/** `TAIA_WEBHOOK_MAX_BYTES`, the largest delivery body accepted; the default if unset or invalid. */
export function webhookMaxBytes(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.TAIA_WEBHOOK_MAX_BYTES)
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_WEBHOOK_MAX_BYTES
}
