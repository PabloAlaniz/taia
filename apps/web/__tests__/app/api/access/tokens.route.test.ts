import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const create = vi.fn()
const list = vi.fn()
const revoke = vi.fn()

vi.mock('@taia/core/services/access-token.service', () => ({
  createAccessToken: (...args: unknown[]) => create(...args),
  listAccessTokens: (...args: unknown[]) => list(...args),
  revokeAccessToken: (...args: unknown[]) => revoke(...args),
}))

const collection = await import('@/app/api/access/tokens/route')
const item = await import('@/app/api/access/tokens/[tokenId]/route')
const { NotFoundError } = await import('@taia/core/errors')

const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/api/access/tokens', () => {
  it('lists tokens', async () => {
    list.mockResolvedValue([{ id: 'abcdefgh' }])
    const res = await collection.GET(new NextRequest('http://localhost/api/access/tokens'), ctx())
    expect(await res.json()).toEqual({ ok: true, tokens: [{ id: 'abcdefgh' }] })
  })

  it('creates a token and names who did it in the audit', async () => {
    create.mockResolvedValue({ token: 'taia_x', record: { id: 'x' } })
    const res = await collection.POST(
      new NextRequest('http://localhost/api/access/tokens', {
        method: 'POST',
        body: JSON.stringify({ name: 'n', scope: 'agent', expiresInDays: 30 }),
        headers: { 'x-taia-principal': 'token:root0001:admin' },
      }),
      ctx(),
    )
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true, token: 'taia_x', record: { id: 'x' } })
    expect(create).toHaveBeenCalledWith(
      { name: 'n', scope: 'agent', expiresInDays: 30 },
      expect.objectContaining({ actor: 'token:root0001' }),
    )
  })

  it('answers 400 without a JSON body', async () => {
    const res = await collection.POST(
      new NextRequest('http://localhost/api/access/tokens', { method: 'POST', body: 'nope' }),
      ctx(),
    )
    expect(res.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('/api/access/tokens/:id', () => {
  it('revokes a token', async () => {
    revoke.mockResolvedValue({ id: 'abcdefgh', status: 'revoked' })
    const res = await item.DELETE(
      new NextRequest('http://localhost/api/access/tokens/abcdefgh', { method: 'DELETE' }),
      ctx({ tokenId: 'abcdefgh' }),
    )
    expect(await res.json()).toMatchObject({ ok: true, record: { status: 'revoked' } })
    expect(revoke).toHaveBeenCalledWith('abcdefgh', expect.objectContaining({ actor: 'web-ui' }))
  })

  it('answers 404 for an unknown token', async () => {
    revoke.mockRejectedValue(new NotFoundError('Access token', 'nope'))
    const res = await item.DELETE(
      new NextRequest('http://localhost/api/access/tokens/nope', { method: 'DELETE' }),
      ctx({ tokenId: 'nope' }),
    )
    expect(res.status).toBe(404)
  })
})
