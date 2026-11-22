// The store every omnilimit limiter in TAIA counts in: the omnilimit_state
// table that migration 0002_omnilimit.sql creates. It lives in Postgres, so
// the web app and the MCP server share one count, and a restart forgets
// nothing.

import { postgresStore, type PostgresStore } from 'omnilimit/postgres'
import { pool } from './db/pool'

let store: PostgresStore | null = null

/** The shared rate limit store, created on first use. */
export function rateLimitStore(): PostgresStore {
  store ??= postgresStore(pool)
  return store
}

/** How often expired rate limit rows are deleted. */
export const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000

/**
 * Delete expired rate limit rows now and then every hour. Expired rows already
 * count as empty, so this only keeps the table small. The timer does not keep
 * the process alive, and a failed round is logged and retried next time.
 */
export function startRateLimitCleanup(
  target: Pick<PostgresStore, 'cleanup'> = rateLimitStore(),
): () => void {
  const run = () => {
    target.cleanup().catch((error: unknown) => {
      console.warn('[rate-limit] cleanup failed:', error instanceof Error ? error.message : error)
    })
  }
  run()
  const timer = setInterval(run, RATE_LIMIT_CLEANUP_INTERVAL_MS)
  timer.unref?.()
  return () => clearInterval(timer)
}
