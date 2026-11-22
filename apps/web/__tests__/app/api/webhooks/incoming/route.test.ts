import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const handleIncomingWebhook = vi.fn(async () => ({ ok: true, duplicate: false }))
vi.mock('@taia/core/services/incoming-webhook.service', () => ({
  handleIncomingWebhook: (...args: unknown[]) => handleIncomingWebhook(...(args as [])),
}))

import { POST } from '@/app/api/webhooks/incoming/route'
import { DEFAULT_WEBHOOK_LIMIT, resetWebhookLimit, webhookPolicy } from '@/lib/webhook-limit'

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
