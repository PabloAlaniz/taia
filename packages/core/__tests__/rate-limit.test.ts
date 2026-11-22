import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MIGRATION_SQL } from 'omnilimit/postgres'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RATE_LIMIT_CLEANUP_INTERVAL_MS, startRateLimitCleanup } from '../src/rate-limit'

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations')

describe('omnilimit migration', () => {
  it('the latest omnilimit migration holds the MIGRATION_SQL of the installed omnilimit', () => {
    // When an omnilimit upgrade changes its SQL, add a new NNNN_omnilimit_*.sql
    // with the new MIGRATION_SQL: an applied migration must never change.
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => /^\d{4}_omnilimit.*\.sql$/.test(name))
      .sort()
    expect(files.length).toBeGreaterThan(0)
    const latest = readFileSync(join(MIGRATIONS_DIR, files.at(-1)!), 'utf8')
    expect(latest).toContain(MIGRATION_SQL)
  })
})

describe('startRateLimitCleanup', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('cleans up at once and then every interval, until stopped', async () => {
    vi.useFakeTimers()
    const cleanup = vi.fn(async () => 0)

    const stop = startRateLimitCleanup({ cleanup })
    expect(cleanup).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_CLEANUP_INTERVAL_MS)
    expect(cleanup).toHaveBeenCalledTimes(2)

    stop()
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_CLEANUP_INTERVAL_MS)
    expect(cleanup).toHaveBeenCalledTimes(2)
  })

  it('logs a failed round and keeps going', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cleanup = vi.fn(async () => {
      throw new Error('db down')
    })

    const stop = startRateLimitCleanup({ cleanup })
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_CLEANUP_INTERVAL_MS)

    expect(cleanup).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith('[rate-limit] cleanup failed:', 'db down')
    stop()
  })
})
