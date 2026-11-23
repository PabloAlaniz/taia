// The reservations every incoming webhook goes through: the omniwebhook_events
// table that migration 0005_omniwebhook_events.sql creates. A delivery is
// reserved before it is processed and marked done after, in one statement
// each, so two processes (or a sender's retry racing the first attempt) never
// apply the same event twice.

import { PostgresIdempotencyStore } from 'omniwebhook'
import { pool } from './db/pool'

let store: PostgresIdempotencyStore | null = null

/** The shared reservations store, created on first use. */
export function incomingWebhookStore(): PostgresIdempotencyStore {
  store ??= new PostgresIdempotencyStore(pool)
  return store
}

/** How often expired reservations are deleted. */
export const WEBHOOK_EVENTS_PURGE_INTERVAL_MS = 60 * 60 * 1000

/**
 * Delete expired reservations now and then every hour. Expired rows no longer
 * block anything, so this only keeps the table small. The timer does not keep
 * the process alive, and a failed round is logged and retried next time.
 */
export function startWebhookEventPurge(
  target: Pick<PostgresIdempotencyStore, 'purgeExpired'> = incomingWebhookStore(),
  now: () => number = () => Math.floor(Date.now() / 1000),
): () => void {
  const run = () => {
    target.purgeExpired(now()).catch((error: unknown) => {
      console.warn(
        '[webhooks] purging expired reservations failed:',
        error instanceof Error ? error.message : error,
      )
    })
  }
  run()
  const timer = setInterval(run, WEBHOOK_EVENTS_PURGE_INTERVAL_MS)
  timer.unref?.()
  return () => clearInterval(timer)
}
