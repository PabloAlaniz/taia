import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiTokenRecord } from '@taia/core/db/repositories/api-token.repository'

const rows = new Map<string, ApiTokenRecord>()
const touch = vi.fn()
const audit = vi.fn()

vi.mock('@taia/core/db/repositories/api-token.repository', () => ({
  insertApiToken: vi.fn(async (input) => {
    const record: ApiTokenRecord = {
      ...input,
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    }
    rows.set(input.id, record)
    return record
  }),
  findApiToken: vi.fn(async (id: string) => rows.get(id) ?? null),
  listApiTokens: vi.fn(async () => [...rows.values()]),
  revokeApiToken: vi.fn(async (id: string) => {
    const row = rows.get(id)
    if (!row || row.revokedAt) return false
    rows.set(id, { ...row, revokedAt: new Date() })
    return true
  }),
  touchApiToken: (...args: unknown[]) => touch(...args),
}))

vi.mock('@taia/core/services/settings-audit.service', () => ({
  recordSettingsAuditEvent: (...args: unknown[]) => audit(...args),
}))

const service = await import('@taia/core/services/access-token.service')

beforeEach(() => {
  rows.clear()
  touch.mockReset().mockResolvedValue(undefined)
  audit.mockReset().mockResolvedValue({})
  service.clearAccessTokenCache()
  vi.useRealTimers()
})

describe('createAccessToken', () => {
  it('returns the token once and stores only its hash', async () => {
    const { token, record } = await service.createAccessToken(
      { name: ' laptop ', scope: 'agent', expiresInDays: 30 },
      { actor: 'web-ui' },
    )
    const stored = rows.get(record.id)!
    expect(token.startsWith(`taia_${record.id}_`)).toBe(true)
    expect(stored.tokenHash).not.toContain(token.split('_')[2])
    expect(record).toMatchObject({ name: 'laptop', scope: 'agent', status: 'active' })
    expect(record).not.toHaveProperty('tokenHash')
    expect(new Date(record.expiresAt!).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ settingKey: `access_token.${record.id}`, operation: 'create' }),
    )
  })

  it('accepts no expiry', async () => {
    const { record } = await service.createAccessToken({
      name: 'ci',
      scope: 'admin',
      expiresInDays: null,
    })
    expect(record.expiresAt).toBeNull()
  })

  it.each([
    [{ name: '', scope: 'agent' }],
    [{ name: 'x'.repeat(81), scope: 'agent' }],
    [{ name: 'x', scope: 'root' }],
    [{ name: 'x', scope: 'agent', expiresInDays: 7 }],
  ])('rejects %j', async (input) => {
    await expect(service.createAccessToken(input)).rejects.toMatchObject({ statusCode: 400 })
    expect(rows.size).toBe(0)
  })
})

describe('verifyAccessToken', () => {
  it('answers the id and scope of an active token and records its use', async () => {
    const { token, record } = await service.createAccessToken({ name: 'a', scope: 'agent' })
    expect(await service.verifyAccessToken(token)).toEqual({ id: record.id, scope: 'agent' })
    expect(touch).toHaveBeenCalledWith(record.id)
  })

  it('writes last_used_at at most once a minute', async () => {
    const { token } = await service.createAccessToken({ name: 'a', scope: 'agent' })
    await service.verifyAccessToken(token)
    await service.verifyAccessToken(token)
    expect(touch).toHaveBeenCalledTimes(1)
  })

  it('refuses a wrong secret for an existing id, cached or not', async () => {
    const { token } = await service.createAccessToken({ name: 'a', scope: 'agent' })
    const forged = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA')
    expect(await service.verifyAccessToken(forged)).toBeNull()
    await service.verifyAccessToken(token)
    expect(await service.verifyAccessToken(forged)).toBeNull()
  })

  it('refuses malformed and unknown tokens', async () => {
    expect(await service.verifyAccessToken('nope')).toBeNull()
    expect(await service.verifyAccessToken(`taia_abcdefgh_${'a'.repeat(43)}`)).toBeNull()
  })

  it('refuses a revoked token at once in the revoking process', async () => {
    const { token, record } = await service.createAccessToken({ name: 'a', scope: 'agent' })
    expect(await service.verifyAccessToken(token)).not.toBeNull()
    await service.revokeAccessToken(record.id)
    expect(await service.verifyAccessToken(token)).toBeNull()
  })

  it('refuses an expired token', async () => {
    const { token, record } = await service.createAccessToken({ name: 'a', scope: 'agent' })
    rows.set(record.id, { ...rows.get(record.id)!, expiresAt: new Date(Date.now() - 1000) })
    expect(await service.verifyAccessToken(token)).toBeNull()
  })

  it('trusts the cache for 30 seconds, then asks the database again', async () => {
    vi.useFakeTimers()
    const { token, record } = await service.createAccessToken({ name: 'a', scope: 'agent' })
    await service.verifyAccessToken(token)
    // Revoked by another process: this one still has it cached.
    rows.set(record.id, { ...rows.get(record.id)!, revokedAt: new Date() })
    expect(await service.verifyAccessToken(token)).not.toBeNull()
    vi.advanceTimersByTime(30_001)
    expect(await service.verifyAccessToken(token)).toBeNull()
  })
})

describe('revokeAccessToken', () => {
  it('revokes once and audits it', async () => {
    const { record } = await service.createAccessToken({ name: 'a', scope: 'agent' })
    const revoked = await service.revokeAccessToken(record.id, { actor: 'token:x' })
    expect(revoked.status).toBe('revoked')
    expect(audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ operation: 'revoke', actor: 'token:x' }),
    )
    await expect(service.revokeAccessToken(record.id)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('answers 404 for an unknown token', async () => {
    await expect(service.revokeAccessToken('missing1')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('listAccessTokens', () => {
  it('shows status and never the hash', async () => {
    const { record } = await service.createAccessToken({ name: 'a', scope: 'admin' })
    await service.revokeAccessToken(record.id)
    const [view] = await service.listAccessTokens()
    expect(view).toMatchObject({ id: record.id, status: 'revoked', masked: `taia_${record.id}_…` })
    expect(JSON.stringify(view)).not.toContain(rows.get(record.id)!.tokenHash)
  })
})
