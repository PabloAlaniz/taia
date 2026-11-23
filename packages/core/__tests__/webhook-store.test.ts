import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { postgresLedgerSchema, postgresStoreSchema } from 'omniwebhook'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startWebhookEventPurge, WEBHOOK_EVENTS_PURGE_INTERVAL_MS } from '../src/webhook-store'

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations')

describe('omniwebhook events migration', () => {
  it('the latest omniwebhook_events migration holds the schema of the installed omniwebhook', () => {
    // When an omniwebhook upgrade changes postgresStoreSchema(), add a new
    // NNNN_omniwebhook_events_*.sql: an applied migration must never change.
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => /^\d{4}_omniwebhook_events.*\.sql$/.test(name))
      .sort()
    expect(files.length).toBeGreaterThan(0)
    const latest = readFileSync(join(MIGRATIONS_DIR, files.at(-1)!), 'utf8')
    expect(latest).toContain(postgresStoreSchema())
  })
})

describe('omniwebhook attempts migration', () => {
  it('the latest omniwebhook_attempts migration holds the schema of the installed omniwebhook', () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => /^\d{4}_omniwebhook_attempts.*\.sql$/.test(name))
      .sort()
    expect(files.length).toBeGreaterThan(0)
    const latest = readFileSync(join(MIGRATIONS_DIR, files.at(-1)!), 'utf8')
    expect(latest).toContain(postgresLedgerSchema())
  })
})

describe('startWebhookEventPurge', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('purges what expired by now, at once and then every interval, until stopped', async () => {
    vi.useFakeTimers()
    const purgeExpired = vi.fn(async (_now: number) => 0)

    const stop = startWebhookEventPurge(
      { purgeExpired },
      () => 1_800_000_000,
      async () => {},
    )
    expect(purgeExpired).toHaveBeenCalledWith(1_800_000_000)

    await vi.advanceTimersByTimeAsync(WEBHOOK_EVENTS_PURGE_INTERVAL_MS)
    expect(purgeExpired).toHaveBeenCalledTimes(2)

    stop()
    await vi.advanceTimersByTimeAsync(WEBHOOK_EVENTS_PURGE_INTERVAL_MS)
    expect(purgeExpired).toHaveBeenCalledTimes(2)
  })

  it('logs a failed round and keeps going', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const purgeExpired = vi.fn(async () => {
      throw new Error('db down')
    })

    const stop = startWebhookEventPurge({ purgeExpired }, undefined, async () => {})
    await vi.advanceTimersByTimeAsync(WEBHOOK_EVENTS_PURGE_INTERVAL_MS)

    expect(purgeExpired).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith('[webhooks] purging expired reservations failed:', 'db down')
    stop()
  })
})
