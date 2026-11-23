/**
 * Integration test: omniwebhook's reservations on the schema TAIA migrates.
 *
 * Two receivers on two pools stand for the web app and a second replica:
 * when the same signed delivery reaches both at once, only one processes it.
 *
 * Requires: pnpm db:test:up (Postgres de test en localhost:5433)
 */

import { Pool } from 'pg'
import { createReceiver, PostgresIdempotencyStore } from 'omniwebhook'
import { standardScheme } from 'omniwebhook/standard'
import { Webhook } from 'standardwebhooks'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testWebhookSecret } from '../../helpers/webhook-secret'

import {
  cleanupTestPool,
  dropAllTables,
  getTestPool,
  runAllMigrations,
  testDBAvailable,
} from './test-db-helper'

// Synthetic secret, only for this test.
const SECRET = testWebhookSecret()

function signed(id: string) {
  const body = '{"type":"task.updated"}'
  const now = new Date()
  return {
    headers: [
      ['webhook-id', id],
      ['webhook-timestamp', String(Math.floor(now.getTime() / 1000))],
      ['webhook-signature', new Webhook(SECRET).sign(id, now, body)],
    ] as [string, string][],
    query: [],
    body: new TextEncoder().encode(body),
  }
}

describe.skipIf(!testDBAvailable)('omniwebhook reservations (integration)', () => {
  let other: Pool

  beforeAll(async () => {
    await dropAllTables()
    await runAllMigrations()
    other = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL || 'postgresql://taia_test:test@localhost:5433/taia_test',
    })
  })

  afterAll(async () => {
    await other.end()
    await dropAllTables()
    await cleanupTestPool()
  })

  function receiver(pool: Pool) {
    return createReceiver({
      verifier: standardScheme({ secrets: [SECRET] }),
      store: new PostgresIdempotencyStore(pool),
      eventKey: (event) => `ws-1:${event.eventKey}`,
    })
  }

  it('the same delivery reaching two processes at once is processed once', async () => {
    let processed = 0
    const slow = async () => {
      processed += 1
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const request = signed('msg_concurrente')

    const outcomes = await Promise.all([
      ...Array.from({ length: 5 }, () => receiver(getTestPool()).execute(request, slow)),
      ...Array.from({ length: 5 }, () => receiver(other).execute(request, slow)),
    ])

    expect(processed).toBe(1)
    expect(outcomes.filter((r) => r.outcome === 'ok')).toHaveLength(1)
    expect(outcomes.every((r) => ['ok', 'in_progress', 'duplicate'].includes(r.outcome))).toBe(true)
    expect((await receiver(other).execute(request, slow)).outcome).toBe('duplicate')
  })

  it('a failed delivery frees the event for the retry', async () => {
    const request = signed('msg_falla')

    const failed = await receiver(getTestPool()).execute(request, () => {
      throw new Error('boom')
    })
    const retried = await receiver(other).execute(request, () => {})

    expect(failed.outcome).toBe('failed')
    expect(retried.outcome).toBe('ok')
  })
})
