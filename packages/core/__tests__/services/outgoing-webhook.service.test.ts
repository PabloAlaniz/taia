import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DomainEvent } from '@taia/core/events/event-bus'
import {
  deliverOutgoingWebhook,
  isRetryableAttempt,
  parseRetryAfter,
  handleOutgoingWebhookEvent,
  listOutgoingWebhookDiagnostics,
  replayOutgoingWebhookDelivery,
} from '@taia/core/services/outgoing-webhook.service'

const mockGetSetting = vi.fn()
const mockSetSetting = vi.fn()
const mockLogActivity = vi.fn()
const mockFetch = vi.fn()

vi.mock('@taia/core/db/repositories/setting.repository', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  setSetting: (...args: unknown[]) => mockSetSetting(...args),
}))

vi.mock('@taia/core/db', () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}))

const event: DomainEvent = {
  type: 'task:updated',
  actor: 'web-ui',
  timestamp: 1_800_000_000_000,
  payload: {
    task: { id: 'task-1', workspace_id: 'ws-1', title: 'Task 1' },
    changes: { title: { from: 'Old', to: 'Task 1' } },
  },
}

describe('outgoing webhook service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-01-15T10:00:00.000Z'))
    vi.clearAllMocks()
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)
    // The fixtures deliver to a loopback receiver.
    process.env.TAIA_WEBHOOK_ALLOW_PRIVATE = '1'
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key.endsWith('.endpoints')) {
        return JSON.stringify([
          { id: 'local', url: 'http://127.0.0.1:59999/hook', events: ['task:updated'] },
        ])
      }
      if (key.endsWith('.deliveries')) return null
      return null
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    delete process.env.TAIA_WEBHOOK_ALLOW_PRIVATE
  })

  it('does not call a private or loopback receiver without the operator opt-in', async () => {
    delete process.env.TAIA_WEBHOOK_ALLOW_PRIVATE

    const pending = deliverOutgoingWebhook({
      workspaceId: 'ws-1',
      endpoint: { id: 'meta', url: 'http://169.254.169.254/latest/meta-data/' },
      event,
    })
    await vi.runAllTimersAsync()
    const delivery = await pending

    expect(mockFetch).not.toHaveBeenCalled()
    expect(delivery.status).toBe('dead_letter')
    expect(delivery.attempts[0].error).toContain('not a public address')
  })

  it('does not follow redirects', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 302 }))

    const pending = deliverOutgoingWebhook({
      workspaceId: 'ws-1',
      endpoint: { id: 'local', url: 'http://127.0.0.1:59999/hook' },
      event,
    })
    await vi.runAllTimersAsync()
    const delivery = await pending

    expect(mockFetch.mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
    expect(delivery.status).toBe('dead_letter')
  })

  it('lists endpoints without their signing secret', async () => {
    mockGetSetting.mockImplementation(async (key: string) =>
      key.endsWith('.endpoints')
        ? JSON.stringify([{ id: 'signed', url: 'https://example.com/hook', secret: 's3cret' }])
        : null,
    )

    const { endpoints } = await listOutgoingWebhookDiagnostics('ws-1')

    expect(endpoints).toEqual([{ id: 'signed', url: 'https://example.com/hook', hasSecret: true }])
    expect(JSON.stringify(endpoints)).not.toContain('s3cret')
  })

  it('posts matching workspace events and persists delivery attempts for diagnostics', async () => {
    const deliveries = await handleOutgoingWebhookEvent(event)

    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]).toMatchObject({
      status: 'success',
      endpointId: 'local',
      attempts: [{ status: 'success', statusCode: 204 }],
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:59999/hook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-taia-event': 'task:updated',
          'x-taia-workspace-id': 'ws-1',
        }),
      }),
    )
    expect(mockSetSetting).toHaveBeenCalledWith(
      'webhooks.outgoing.ws-1.deliveries',
      expect.stringContaining('task:updated'),
    )
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'webhook.outgoing.delivered',
        workspace_id: 'ws-1',
        message: expect.stringContaining('Outgoing webhook success'),
      }),
    )
  })

  it('retries failed HTTP deliveries with bounded attempts and records the final error', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 503 }))

    const deliveryPromise = deliverOutgoingWebhook({
      workspaceId: 'ws-1',
      endpoint: { id: 'local', url: 'http://127.0.0.1:59999/hook' },
      event,
    })
    await vi.runAllTimersAsync()
    const delivery = await deliveryPromise

    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(delivery.status).toBe('dead_letter')
    expect(delivery.deadLetteredAt).toBeDefined()
    expect(delivery.payload).toMatchObject({ id: delivery.id, type: 'task:updated' })
    expect(delivery.attempts).toHaveLength(3)
    expect(delivery.attempts[0]).toMatchObject({
      status: 'failed',
      statusCode: 503,
      error: 'HTTP 503',
    })
    expect(delivery.attempts[2].nextRetryAt).toBeUndefined()
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'webhook.outgoing.failed',
        metadata: expect.objectContaining({ last_error: 'HTTP 503', attempts: 3 }),
      }),
    )
  })

  it('does not retry a failure that will not change, such as a 404', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }))

    const delivery = await deliverOutgoingWebhook({
      workspaceId: 'ws-1',
      endpoint: { id: 'local', url: 'http://127.0.0.1:59999/hook' },
      event,
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(delivery.status).toBe('dead_letter')
    expect(delivery.attempts[0]?.nextRetryAt).toBeUndefined()
  })

  it('waits the Retry-After the receiver asks for, when it is short', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '5' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const deliveryPromise = deliverOutgoingWebhook({
      workspaceId: 'ws-1',
      endpoint: { id: 'local', url: 'http://127.0.0.1:59999/hook' },
      event,
    })
    await vi.advanceTimersByTimeAsync(4_000)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    const delivery = await deliveryPromise

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(delivery.status).toBe('success')
    expect(delivery.attempts[0]).toMatchObject({ statusCode: 429, retryAfterMs: 5_000 })
  })

  it('dead-letters at once when Retry-After is longer than it waits in line, saying when to replay', async () => {
    mockFetch.mockResolvedValue(
      new Response(null, { status: 503, headers: { 'retry-after': '120' } }),
    )

    const delivery = await deliverOutgoingWebhook({
      workspaceId: 'ws-1',
      endpoint: { id: 'local', url: 'http://127.0.0.1:59999/hook' },
      event,
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(delivery.status).toBe('dead_letter')
    const next = new Date(delivery.attempts[0]!.nextRetryAt!).getTime()
    expect(next - Date.now()).toBeGreaterThan(110_000)
  })

  it('exposes configured endpoints and stored deliveries as workspace diagnostics', async () => {
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key.endsWith('.endpoints'))
        return JSON.stringify([{ id: 'local', url: 'http://localhost/hook' }])
      if (key.endsWith('.deliveries')) {
        return JSON.stringify({
          'delivery-1': {
            id: 'delivery-1',
            endpointId: 'local',
            event: 'task:updated',
            workspaceId: 'ws-1',
            url: 'http://localhost/hook',
            payloadHash: 'abc',
            status: 'dead_letter',
            deadLetteredAt: '2027-01-15T09:00:00.000Z',
            createdAt: '2027-01-15T09:00:00.000Z',
            updatedAt: '2027-01-15T09:00:00.000Z',
            attempts: [],
          },
        })
      }
      return null
    })

    await expect(listOutgoingWebhookDiagnostics('ws-1')).resolves.toMatchObject({
      endpoints: [{ id: 'local' }],
      deliveries: [{ id: 'delivery-1', status: 'dead_letter' }],
      deadLetters: [{ id: 'delivery-1', status: 'dead_letter' }],
    })
  })

  it('does not resend an already successful delivery with the same idempotency key', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }))
    const first = await deliverOutgoingWebhook({
      workspaceId: 'ws-1',
      endpoint: { id: 'local', url: 'http://127.0.0.1:59999/hook' },
      event,
    })
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key.endsWith('.deliveries')) return JSON.stringify({ [first.id]: first })
      if (key.endsWith('.endpoints')) return JSON.stringify([])
      return null
    })
    mockFetch.mockClear()

    const second = await deliverOutgoingWebhook({
      workspaceId: 'ws-1',
      endpoint: { id: 'local', url: 'http://127.0.0.1:59999/hook' },
      event,
    })

    expect(second).toEqual(first)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('replays a dead-letter delivery once and records replay activity', async () => {
    const deadLetter = {
      id: 'delivery-1',
      endpointId: 'local',
      event: 'task:updated',
      workspaceId: 'ws-1',
      url: 'http://127.0.0.1:59999/hook',
      payloadHash: 'abc',
      status: 'dead_letter',
      createdAt: '2027-01-15T09:00:00.000Z',
      updatedAt: '2027-01-15T09:00:00.000Z',
      deadLetteredAt: '2027-01-15T09:00:00.000Z',
      replayAttempts: 0,
      payload: { id: 'delivery-1', type: 'task:updated', workspace_id: 'ws-1' },
      attempts: [
        {
          attempt: 1,
          status: 'failed',
          statusCode: 503,
          error: 'HTTP 503',
          attemptedAt: '2027-01-15T09:00:00.000Z',
          durationMs: 1,
        },
      ],
    }
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key.endsWith('.endpoints')) {
        return JSON.stringify([{ id: 'local', url: 'http://127.0.0.1:59999/hook' }])
      }
      if (key.endsWith('.deliveries')) return JSON.stringify({ 'delivery-1': deadLetter })
      return null
    })
    mockFetch.mockResolvedValue(new Response(null, { status: 202 }))

    const result = await replayOutgoingWebhookDelivery({
      workspaceId: 'ws-1',
      deliveryId: 'delivery-1',
    })

    expect(result.replayed).toBe(true)
    expect(result.delivery).toMatchObject({ status: 'success', replayAttempts: 1 })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:59999/hook',
      expect.objectContaining({ body: JSON.stringify(deadLetter.payload) }),
    )
    expect(mockSetSetting).toHaveBeenLastCalledWith(
      'webhooks.outgoing.ws-1.deliveries',
      expect.stringContaining('replayAttempts'),
    )
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'webhook.outgoing.replayed' }),
    )
  })
})

describe('parseRetryAfter and isRetryableAttempt', () => {
  it('parses delta seconds and HTTP dates', () => {
    const now = Date.parse('2026-11-22T12:00:00Z')
    expect(parseRetryAfter('30', now)).toBe(30_000)
    expect(parseRetryAfter('Sun, 22 Nov 2026 12:01:00 GMT', now)).toBe(60_000)
    expect(parseRetryAfter('Sun, 22 Nov 2026 11:00:00 GMT', now)).toBe(0)
    expect(parseRetryAfter('soon', now)).toBeUndefined()
    expect(parseRetryAfter(null, now)).toBeUndefined()
  })

  it('retries network errors, 408, 425, 429 and 5xx only', () => {
    expect(isRetryableAttempt({})).toBe(true)
    for (const code of [408, 425, 429, 500, 503])
      expect(isRetryableAttempt({ statusCode: code })).toBe(true)
    for (const code of [302, 400, 401, 404, 410, 422])
      expect(isRetryableAttempt({ statusCode: code })).toBe(false)
  })
})
