import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const handleIncomingWebhook = vi.fn(async () => ({ ok: true, duplicate: false }))
vi.mock('@taia/core/services/incoming-webhook.service', () => ({
  handleIncomingWebhook: (...args: unknown[]) => handleIncomingWebhook(...(args as [])),
}))

import { POST } from '@/app/api/webhooks/incoming/route'
import {
  DEFAULT_WEBHOOK_LIMIT,
  DEFAULT_WEBHOOK_MAX_BYTES,
  resetWebhookLimit,
  webhookMaxBytes,
  webhookPolicy,
} from '@/lib/webhook-limit'

function delivery(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/webhooks/incoming?workspace_id=w1', {
    method: 'POST',
    body: '{}',
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

beforeEach(() => {
  process.env.TAIA_WEBHOOK_RATE_LIMIT = '3/minute'
  resetWebhookLimit()
  handleIncomingWebhook.mockClear()
})

afterEach(() => {
  delete process.env.TAIA_WEBHOOK_RATE_LIMIT
  delete process.env.TAIA_TRUSTED_PROXIES
  resetWebhookLimit()
})

describe('POST /api/webhooks/incoming: rate limit', () => {
  it('answers 429 with Retry-After once the budget is spent, without reaching the handler', async () => {
    for (let i = 0; i < 3; i++) expect((await POST(delivery())).status).toBe(202)

    const refused = await POST(delivery())

    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(handleIncomingWebhook).toHaveBeenCalledTimes(3)
  })

  it('counts per client behind a trusted proxy', async () => {
    process.env.TAIA_TRUSTED_PROXIES = '1'
    for (let i = 0; i < 3; i++) {
      expect((await POST(delivery({ 'x-forwarded-for': '203.0.113.7' }))).status).toBe(202)
    }

    expect((await POST(delivery({ 'x-forwarded-for': '203.0.113.7' }))).status).toBe(429)
    expect((await POST(delivery({ 'x-forwarded-for': '203.0.113.8' }))).status).toBe(202)
  })
})

describe('POST /api/webhooks/incoming: body size', () => {
  afterEach(() => {
    delete process.env.TAIA_WEBHOOK_MAX_BYTES
  })

  it('answers 413 to a body over TAIA_WEBHOOK_MAX_BYTES without reaching the handler', async () => {
    process.env.TAIA_WEBHOOK_MAX_BYTES = '10'

    const declared = await POST(delivery())
    const big = new NextRequest('http://localhost/api/webhooks/incoming?workspace_id=w1', {
      method: 'POST',
      body: JSON.stringify({ padding: 'x'.repeat(50) }),
    })
    const tooLarge = await POST(big)

    expect(declared.status).toBe(202)
    expect(tooLarge.status).toBe(413)
    expect(await tooLarge.json()).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' })
    expect(handleIncomingWebhook).toHaveBeenCalledTimes(1)
  })

  it('counts the bytes of a body that does not declare its length', async () => {
    const { readTextWithin, BodyTooLargeError } = await import('@/lib/read-body')
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('0123456789'))
        controller.enqueue(new TextEncoder().encode('0123456789'))
        controller.close()
      },
    })
    const request = new Request('http://localhost/', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit)

    await expect(readTextWithin(request, 15)).rejects.toBeInstanceOf(BodyTooLargeError)
  })

  it('reads a body within the limit, multi-byte characters included', async () => {
    const { readTextWithin } = await import('@/lib/read-body')
    const request = new Request('http://localhost/', { method: 'POST', body: 'ñandú ✓' })

    expect(await readTextWithin(request, 100)).toBe('ñandú ✓')
  })
})

describe('webhookPolicy', () => {
  it('reads TAIA_WEBHOOK_RATE_LIMIT and falls back to the default on a bad value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(webhookPolicy({ TAIA_WEBHOOK_RATE_LIMIT: '30/minute' })).toEqual({
      limit: 30,
      windowMs: 60_000,
    })
    expect(webhookPolicy({})).toEqual(
      webhookPolicy({ TAIA_WEBHOOK_RATE_LIMIT: DEFAULT_WEBHOOK_LIMIT }),
    )
    expect(webhookPolicy({ TAIA_WEBHOOK_RATE_LIMIT: '30 per minute' })).toEqual(webhookPolicy({}))
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('webhookMaxBytes', () => {
  it('reads TAIA_WEBHOOK_MAX_BYTES and falls back to the default', () => {
    expect(webhookMaxBytes({ TAIA_WEBHOOK_MAX_BYTES: '1024' })).toBe(1024)
    expect(webhookMaxBytes({})).toBe(DEFAULT_WEBHOOK_MAX_BYTES)
    expect(webhookMaxBytes({ TAIA_WEBHOOK_MAX_BYTES: '-1' })).toBe(DEFAULT_WEBHOOK_MAX_BYTES)
  })
})
