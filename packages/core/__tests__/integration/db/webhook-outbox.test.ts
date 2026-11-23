/**
 * Integration test: outgoing webhooks end to end on a real PostgreSQL.
 * An event is queued in webhook_outbox, the dispatcher sends it with
 * omniwebhook to a local receiver that verifies the Standard Webhooks
 * signature, and each attempt lands in omniwebhook_attempts.
 *
 * Requires: pnpm db:test:up (Postgres de test en localhost:5433)
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Webhook } from 'standardwebhooks'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cleanupTestPool,
  dropAllTables,
  getTestPool,
  runAllMigrations,
  testDBAvailable,
} from './test-db-helper'

// The repositories use the app pool; point it at the test database.
vi.mock('../../../src/db/pool', async (importOriginal) => {
  const helper = await import('./test-db-helper')
  return { ...(await importOriginal<object>()), pool: helper.getTestPool() }
})

const outbox = await import('../../../src/db/repositories/webhook-outbox.repository')
const service = await import('../../../src/services/outgoing-webhook.service')
const settings = await import('../../../src/db/repositories/setting.repository')

// Synthetic secret, only for this test.
const SECRET = 'whsec_dGFpYS13ZWJob29rLXNhbGllbnRlLXNpbnRldGljby0wMQ=='

describe.skipIf(!testDBAvailable)('outgoing webhooks (integration)', () => {
  let server: Server
  let port = 0
  let answer = 200
  const received: Array<{ verified: boolean; body: string }> = []

  beforeAll(async () => {
    await dropAllTables()
    await runAllMigrations()
    await getTestPool().query(
      `INSERT INTO workspaces (id, name, slug) VALUES ('ws-1', 'Webhooks', 'webhooks')`,
    )
    server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        let verified = true
        try {
          new Webhook(SECRET).verify(body, request.headers as Record<string, string>)
        } catch {
          verified = false
        }
        received.push({ verified, body })
        response.writeHead(answer).end()
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  beforeEach(async () => {
    received.length = 0
    answer = 200
    await getTestPool().query('DELETE FROM webhook_outbox')
    await getTestPool().query('DELETE FROM omniwebhook_attempts')
    await settings.setSetting(
      'webhooks.outgoing.ws-1.endpoints',
      JSON.stringify([{ id: 'local', url: `http://127.0.0.1:${port}/hook`, secret: SECRET }]),
    )
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
    await dropAllTables()
    await cleanupTestPool()
  })

  const event = {
    type: 'task:moved',
    actor: 'web-ui',
    timestamp: Date.now(),
    payload: { task: { id: 'task-1', workspace_id: 'ws-1' } },
  }
  const loopbackOnly = () => service.nodeSenderFactory(['127.0.0.0/8'])

  it('queues an event, delivers it signed and records the attempt', async () => {
    expect(await service.handleOutgoingWebhookEvent(event)).toBe(1)

    expect(await service.dispatchDueWebhooks(loopbackOnly())).toBe(1)

    expect(received).toEqual([{ verified: true, body: expect.stringContaining('task:moved') }])
    const diagnostics = await service.listOutgoingWebhookDiagnostics('ws-1')
    expect(diagnostics.deliveries).toEqual([
      expect.objectContaining({
        status: 'delivered',
        lastStatus: 200,
        attempts: [expect.objectContaining({ attempt: 1, state: 'delivered', status: 200 })],
      }),
    ])
  })

  it('without an allowed network, a loopback receiver is blocked and never called', async () => {
    await service.handleOutgoingWebhookEvent(event)

    await service.dispatchDueWebhooks(service.nodeSenderFactory([]))

    expect(received).toHaveLength(0)
    const [delivery] = (await service.listOutgoingWebhookDiagnostics('ws-1')).deliveries
    expect(delivery).toMatchObject({ status: 'failed', lastResult: 'blocked:blocked_address' })
  })

  it('a 503 leaves it pending for later, and it is not taken again before then', async () => {
    answer = 503
    await service.handleOutgoingWebhookEvent(event)

    await service.dispatchDueWebhooks(loopbackOnly())

    const [delivery] = (await service.listOutgoingWebhookDiagnostics('ws-1')).deliveries
    expect(delivery).toMatchObject({ status: 'pending', attempt: 2, lastStatus: 503 })
    expect(new Date(delivery!.nextAttemptAt!).getTime()).toBeGreaterThan(Date.now())
    expect(await service.dispatchDueWebhooks(loopbackOnly())).toBe(0)
  })

  it('two dispatchers never take the same message', async () => {
    await outbox.enqueueOutboxMessages(
      Array.from({ length: 25 }, (_, i) => ({
        workspaceId: 'ws-1',
        endpointId: 'local',
        messageId: `msg_${i}`,
        event: 'task:moved',
        payload: '{}',
      })),
    )

    const [a, b, c] = await Promise.all([
      outbox.claimDueOutboxMessages(10, 60),
      outbox.claimDueOutboxMessages(10, 60),
      outbox.claimDueOutboxMessages(10, 60),
    ])

    const ids = [...a, ...b, ...c].map((message) => message.messageId)
    expect(ids).toHaveLength(25)
    expect(new Set(ids).size).toBe(25)
  })

  it('a failed delivery can be replayed with the same message id', async () => {
    answer = 400
    await service.handleOutgoingWebhookEvent(event)
    await service.dispatchDueWebhooks(loopbackOnly())
    const [failed] = (await service.listOutgoingWebhookDiagnostics('ws-1')).deliveries
    expect(failed).toMatchObject({ status: 'failed', lastResult: 'rejected' })

    answer = 200
    const replay = await service.replayOutgoingWebhookDelivery({
      workspaceId: 'ws-1',
      deliveryId: failed!.id,
    })
    await service.dispatchDueWebhooks(loopbackOnly())

    expect(replay.replayed).toBe(true)
    const [delivered] = (await service.listOutgoingWebhookDiagnostics('ws-1')).deliveries
    expect(delivered).toMatchObject({ id: failed!.id, status: 'delivered', replays: 1 })
    expect(delivered!.attempts.map((attempt) => attempt.state)).toEqual(['rejected', 'delivered'])
  })
})
