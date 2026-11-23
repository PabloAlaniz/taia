import {
  ConfigurationError,
  MemoryDeliveryLedger,
  SendWebhook,
  type TransportRequest,
  type TransportResponse,
} from 'omniwebhook'
import { standardSigner } from 'omniwebhook/standard'
import { Webhook } from 'standardwebhooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testWebhookSecret } from '../helpers/webhook-secret'
import type { OutboxMessage } from '@taia/core/db/repositories/webhook-outbox.repository'
import type { DomainEvent } from '@taia/core/events/event-bus'
import {
  dispatchDueWebhooks,
  handleOutgoingWebhookEvent,
  listOutgoingWebhookDiagnostics,
  OutgoingWebhookReplayError,
  outgoingEndpointsProblem,
  PRIVATE_NETWORKS,
  replayOutgoingWebhookDelivery,
  type SenderFactory,
  startWebhookDispatcher,
  WEBHOOK_DISPATCH_INTERVAL_MS,
  webhookAllowedNetworks,
} from '@taia/core/services/outgoing-webhook.service'

const mockGetSetting = vi.fn()
const mockSetSetting = vi.fn()
const mockLogActivity = vi.fn()
const outbox = {
  enqueue: vi.fn(),
  claim: vi.fn(),
  settle: vi.fn(),
  find: vi.fn(),
  requeue: vi.fn(),
  list: vi.fn(),
  attempts: vi.fn(),
}

vi.mock('@taia/core/db/repositories/setting.repository', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  setSetting: (...args: unknown[]) => mockSetSetting(...args),
}))

vi.mock('@taia/core/db', () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}))

vi.mock('@taia/core/db/repositories/webhook-outbox.repository', () => ({
  enqueueOutboxMessages: (...args: unknown[]) => outbox.enqueue(...args),
  claimDueOutboxMessages: (...args: unknown[]) => outbox.claim(...args),
  settleOutboxMessage: (...args: unknown[]) => outbox.settle(...args),
  findOutboxMessage: (...args: unknown[]) => outbox.find(...args),
  requeueOutboxMessage: (...args: unknown[]) => outbox.requeue(...args),
  listOutboxMessages: (...args: unknown[]) => outbox.list(...args),
  listOutboxAttempts: (...args: unknown[]) => outbox.attempts(...args),
  purgeSettledOutboxMessages: vi.fn(),
}))

// Synthetic secret, only for these tests.
const SECRET = testWebhookSecret()
const NOW = 1_800_000_000
const PUBLIC = '93.184.216.34'

const endpoint = {
  id: 'ci',
  url: 'https://hooks.example.test/taia',
  secret: SECRET,
  active: true,
}

const event: DomainEvent = {
  type: 'task:updated',
  actor: 'web-ui',
  timestamp: NOW * 1000,
  payload: { task: { id: 'task-1', workspace_id: 'ws-1', title: 'Task 1' } },
}

function setEndpoints(endpoints: unknown[]) {
  mockGetSetting.mockImplementation(async (key: string) =>
    key === 'webhooks.outgoing.ws-1.endpoints' ? JSON.stringify(endpoints) : null,
  )
}

function message(overrides: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    id: 7,
    workspaceId: 'ws-1',
    endpointId: 'ci',
    messageId: 'msg_abc',
    event: 'task:updated',
    payload: '{"type":"task:updated"}',
    attempt: 1,
    state: 'pending',
    nextAt: new Date(NOW * 1000),
    lastResult: null,
    lastStatus: null,
    replays: 0,
    createdAt: new Date(NOW * 1000),
    updatedAt: new Date(NOW * 1000),
    ...overrides,
  }
}

/** A real omniwebhook sender over a fake network: what it sends is captured. */
function fakeSender(
  response: TransportResponse,
  addresses: readonly string[] = [PUBLIC],
  options: { allowedNetworks?: string[] } = {},
) {
  const sent: TransportRequest[] = []
  const senderFor: SenderFactory = (secret) =>
    new SendWebhook({
      signer: standardSigner({ secrets: [secret] }),
      transport: {
        post: async (request) => {
          sent.push(request)
          return response
        },
      },
      resolver: { resolve: async () => addresses },
      ledger: new MemoryDeliveryLedger(),
      clock: { now: () => NOW },
      timer: { nowMs: () => 0 },
      random: { next: () => 0 },
      allowHttp: true,
      ...(options.allowedNetworks ? { allowedNetworks: options.allowedNetworks } : {}),
    })
  return { senderFor, sent }
}

beforeEach(() => {
  vi.clearAllMocks()
  setEndpoints([endpoint])
})

describe('handleOutgoingWebhookEvent', () => {
  it('queues one message per endpoint that wants the event, without sending anything', async () => {
    setEndpoints([
      endpoint,
      { ...endpoint, id: 'off', active: false },
      { ...endpoint, id: 'other-events', events: ['task:created'] },
      { ...endpoint, id: 'all', events: ['*'] },
      { id: 'broken' },
    ])

    const queued = await handleOutgoingWebhookEvent(event)

    expect(queued).toBe(2)
    const [rows] = outbox.enqueue.mock.calls[0] as [Array<Record<string, string>>]
    expect(rows.map((row) => row.endpointId)).toEqual(['ci', 'all'])
    expect(new Set(rows.map((row) => row.messageId)).size).toBe(2)
    expect(JSON.parse(rows[0]!.payload)).toEqual({
      type: 'task:updated',
      timestamp: new Date(NOW * 1000).toISOString(),
      workspace_id: 'ws-1',
      actor: 'web-ui',
      data: event.payload,
    })
  })

  it('an event without a workspace queues nothing', async () => {
    expect(await handleOutgoingWebhookEvent({ ...event, payload: {} })).toBe(0)
    expect(outbox.enqueue).not.toHaveBeenCalled()
  })
})

describe('dispatchDueWebhooks', () => {
  it('delivers with a Standard Webhooks signature the receiver can verify', async () => {
    outbox.claim.mockResolvedValue([message()])
    const { senderFor, sent } = fakeSender({ status: 200, retryAfter: null })

    expect(await dispatchDueWebhooks(senderFor)).toBe(1)

    const [request] = sent
    expect(request).toMatchObject({ url: endpoint.url, address: PUBLIC })
    const headers = request!.headers
    expect(headers['webhook-id']).toBe('msg_abc')
    // The receiver checks the signed timestamp against its own clock.
    vi.useFakeTimers({ toFake: ['Date'], now: NOW * 1000 })
    expect(() =>
      new Webhook(SECRET).verify(new TextDecoder().decode(request!.body), {
        'webhook-id': headers['webhook-id']!,
        'webhook-timestamp': headers['webhook-timestamp']!,
        'webhook-signature': headers['webhook-signature']!,
      }),
    ).not.toThrow()
    vi.useRealTimers()
    expect(outbox.settle).toHaveBeenCalledWith(7, {
      state: 'delivered',
      result: 'delivered',
      status: 200,
    })
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'webhook.outgoing.delivered' }),
    )
  })

  it('a retryable failure goes back to pending for the time omniwebhook gives', async () => {
    outbox.claim.mockResolvedValue([message({ attempt: 2 })])
    const { senderFor } = fakeSender({ status: 503, retryAfter: '900' })

    await dispatchDueWebhooks(senderFor)

    expect(outbox.settle).toHaveBeenCalledWith(7, {
      state: 'pending',
      result: 'pending',
      status: 503,
      attempt: 3,
      // The schedule says 300 s after the second attempt; the receiver asked for more.
      nextAt: new Date((NOW + 900) * 1000),
    })
    expect(mockLogActivity).not.toHaveBeenCalled()
  })

  it('410 Gone fails the message and disables the endpoint', async () => {
    outbox.claim.mockResolvedValue([message()])
    const { senderFor } = fakeSender({ status: 410, retryAfter: null })

    await dispatchDueWebhooks(senderFor)

    expect(outbox.settle).toHaveBeenCalledWith(7, { state: 'failed', result: 'gone', status: 410 })
    expect(mockSetSetting).toHaveBeenCalledWith(
      'webhooks.outgoing.ws-1.endpoints',
      JSON.stringify([{ ...endpoint, active: false }]),
    )
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'webhook.outgoing.endpoint_disabled' }),
    )
  })

  it('a name that resolves to a private address is blocked without sending', async () => {
    outbox.claim.mockResolvedValue([message()])
    const { senderFor, sent } = fakeSender({ status: 200, retryAfter: null }, ['10.0.0.5'])

    await dispatchDueWebhooks(senderFor)

    expect(sent).toHaveLength(0)
    expect(outbox.settle).toHaveBeenCalledWith(7, {
      state: 'failed',
      result: 'blocked:blocked_address',
      status: null,
    })
  })

  it('an allowed private network is delivered to', async () => {
    outbox.claim.mockResolvedValue([message()])
    const { senderFor, sent } = fakeSender({ status: 204, retryAfter: null }, ['192.168.1.20'], {
      allowedNetworks: [...PRIVATE_NETWORKS],
    })

    await dispatchDueWebhooks(senderFor)

    expect(sent[0]?.address).toBe('192.168.1.20')
    expect(outbox.settle).toHaveBeenCalledWith(7, expect.objectContaining({ state: 'delivered' }))
  })

  it('a message whose endpoint is gone or inactive fails without sending', async () => {
    setEndpoints([{ ...endpoint, id: 'off', active: false }])
    outbox.claim.mockResolvedValue([
      message({ id: 1, endpointId: 'removed' }),
      message({ id: 2, endpointId: 'off' }),
    ])
    const { senderFor, sent } = fakeSender({ status: 200, retryAfter: null })

    await dispatchDueWebhooks(senderFor)

    expect(sent).toHaveLength(0)
    expect(outbox.settle).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ result: 'endpoint_missing' }),
    )
    expect(outbox.settle).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ result: 'endpoint_inactive' }),
    )
  })

  it('a secret that cannot sign fails the message as misconfigured', async () => {
    outbox.claim.mockResolvedValue([message()])
    const senderFor: SenderFactory = () =>
      ({
        execute: async () => {
          throw new ConfigurationError('no se puede firmar el mensaje: unconfigured')
        },
      }) as unknown as SendWebhook

    await dispatchDueWebhooks(senderFor)

    expect(outbox.settle).toHaveBeenCalledWith(7, {
      state: 'failed',
      result: 'misconfigured',
      status: null,
    })
  })

  it('an unexpected error leaves the message locked for a later round', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    outbox.claim.mockResolvedValue([message()])
    const senderFor: SenderFactory = () =>
      ({
        execute: async () => {
          throw new Error('db down')
        },
      }) as unknown as SendWebhook

    await dispatchDueWebhooks(senderFor)

    expect(outbox.settle).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('nothing due, nothing done', async () => {
    outbox.claim.mockResolvedValue([])

    const { senderFor } = fakeSender({ status: 200, retryAfter: null })
    expect(await dispatchDueWebhooks(senderFor)).toBe(0)
    expect(mockGetSetting).not.toHaveBeenCalled()
  })
})

describe('startWebhookDispatcher', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs a round at once and then every interval, never two at a time', async () => {
    vi.useFakeTimers()
    let release: () => void = () => {}
    const round = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          release = () => resolve(0)
        }),
    )

    const stop = startWebhookDispatcher(round)
    await vi.advanceTimersByTimeAsync(WEBHOOK_DISPATCH_INTERVAL_MS * 3)
    expect(round).toHaveBeenCalledTimes(1)

    release()
    await vi.advanceTimersByTimeAsync(WEBHOOK_DISPATCH_INTERVAL_MS)
    expect(round).toHaveBeenCalledTimes(2)
    stop()
  })
})

describe('outgoingEndpointsProblem', () => {
  it('accepts well-formed endpoints', () => {
    expect(outgoingEndpointsProblem(JSON.stringify([endpoint]))).toBeNull()
    expect(
      outgoingEndpointsProblem(
        JSON.stringify([{ ...endpoint, url: 'http://192.168.1.20:5678/hook', events: ['*'] }]),
      ),
    ).toBeNull()
  })

  it.each([
    ['not JSON', '{'],
    ['an object, not an array', JSON.stringify(endpoint)],
    ['no secret', JSON.stringify([{ ...endpoint, secret: undefined }])],
    ['a secret that is not whsec_', JSON.stringify([{ ...endpoint, secret: 'hunter2' }])],
    ['credentials in the URL', JSON.stringify([{ ...endpoint, url: 'https://a:b@hooks.test/' }])],
    ['another scheme', JSON.stringify([{ ...endpoint, url: 'ftp://hooks.test/' }])],
    ['a short-form IP', JSON.stringify([{ ...endpoint, url: 'https://127.1/' }])],
    ['a slash in the id', JSON.stringify([{ ...endpoint, id: 'a/b' }])],
    ['repeated ids', JSON.stringify([endpoint, endpoint])],
  ])('refuses %s', (_name, value) => {
    expect(outgoingEndpointsProblem(value)).toEqual(expect.any(String))
  })
})

describe('webhookAllowedNetworks', () => {
  it('is empty by default', () => {
    expect(webhookAllowedNetworks({})).toEqual([])
  })

  it('TAIA_WEBHOOK_ALLOW_PRIVATE=1 opens loopback and private ranges, plus any listed', () => {
    expect(
      webhookAllowedNetworks({
        TAIA_WEBHOOK_ALLOW_PRIVATE: '1',
        TAIA_WEBHOOK_ALLOWED_NETWORKS: ' 100.64.0.0/10 , ',
      }),
    ).toEqual([...PRIVATE_NETWORKS, '100.64.0.0/10'])
  })

  it('a malformed network is a configuration error', () => {
    expect(() => webhookAllowedNetworks({ TAIA_WEBHOOK_ALLOWED_NETWORKS: '10.0.0.1/8' })).toThrow(
      ConfigurationError,
    )
  })
})

describe('diagnostics and replay', () => {
  it('lists deliveries with their attempts, failed ones as dead letters, and never secrets', async () => {
    outbox.list.mockResolvedValue([
      message({ messageId: 'msg_ok', state: 'delivered' }),
      message({ messageId: 'msg_ko', state: 'failed', lastResult: 'exhausted' }),
    ])
    outbox.attempts.mockResolvedValue([
      {
        messageId: 'msg_ko',
        attempt: 1,
        at: new Date(NOW * 1000),
        state: 'exhausted',
        status: 503,
        problem: null,
        durationMs: 12,
      },
    ])

    const diagnostics = await listOutgoingWebhookDiagnostics('ws-1')

    expect(diagnostics.endpoints).toEqual([
      { id: 'ci', url: endpoint.url, active: true, hasSecret: true },
    ])
    expect(JSON.stringify(diagnostics)).not.toContain(SECRET)
    expect(diagnostics.deliveries.map((d) => d.id)).toEqual(['msg_ok', 'msg_ko'])
    expect(diagnostics.deadLetters).toEqual([
      expect.objectContaining({
        id: 'msg_ko',
        attempts: [expect.objectContaining({ attempt: 1, status: 503 })],
      }),
    ])
  })

  it('queues a failed delivery again with the same message id', async () => {
    outbox.find.mockResolvedValue(message({ state: 'failed' }))
    outbox.requeue.mockResolvedValue(true)

    const result = await replayOutgoingWebhookDelivery({
      workspaceId: 'ws-1',
      deliveryId: 'msg_abc',
    })

    expect(result.replayed).toBe(true)
    expect(result.delivery.id).toBe('msg_abc')
    expect(outbox.requeue).toHaveBeenCalledWith(7, 2)
  })

  it('leaves a delivered one alone', async () => {
    outbox.find.mockResolvedValue(message({ state: 'delivered' }))

    const result = await replayOutgoingWebhookDelivery({
      workspaceId: 'ws-1',
      deliveryId: 'msg_abc',
    })

    expect(result.replayed).toBe(false)
    expect(outbox.requeue).not.toHaveBeenCalled()
  })

  it.each([
    ['unknown', null, false, 404],
    ['out of replays', message({ state: 'failed', replays: 2 }), false, 409],
  ])('refuses a delivery that is %s', async (_name, found, requeued, status) => {
    outbox.find.mockResolvedValue(found)
    outbox.requeue.mockResolvedValue(requeued)

    const error = await replayOutgoingWebhookDelivery({
      workspaceId: 'ws-1',
      deliveryId: 'msg_abc',
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(OutgoingWebhookReplayError)
    expect(error).toMatchObject({ status })
  })
})
