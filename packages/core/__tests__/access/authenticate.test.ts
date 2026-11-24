import { beforeEach, describe, expect, it, vi } from 'vitest'

const verify = vi.fn()
vi.mock('@taia/core/services/access-token.service', () => ({
  verifyAccessToken: (...args: unknown[]) => verify(...args),
}))

const { sessionCookieValue } = await import('@taia/core/auth')
const { actorFromPrincipal, authenticate, principalLabel, requiresAdmin } = await import(
  '@taia/core/access/authenticate'
)

const ROOT = 'a-test-root-token-0123456789'
const ON = { TAIA_API_TOKEN: ROOT }
const DB_TOKEN = `taia_abcdefgh_${'a'.repeat(43)}`

beforeEach(() => {
  verify.mockReset().mockResolvedValue(null)
})

describe('authenticate', () => {
  it('accepts the root token as admin without asking the database', async () => {
    expect(await authenticate({ authorization: `Bearer ${ROOT}` }, ON)).toEqual({
      kind: 'root',
      scope: 'admin',
    })
    expect(verify).not.toHaveBeenCalled()
  })

  it('accepts the session cookie as admin', async () => {
    const session = await sessionCookieValue(ROOT)
    expect(await authenticate({ session }, ON)).toEqual({ kind: 'session', scope: 'admin' })
  })

  it.each([
    ['a bearer token', { authorization: `Bearer ${DB_TOKEN}` }],
    ['an API key', { apiKey: DB_TOKEN }],
  ])('accepts a database token sent as %s, with its scope', async (_name, credentials) => {
    verify.mockResolvedValue({ id: 'abcdefgh', scope: 'agent' })
    expect(await authenticate(credentials, ON)).toEqual({
      kind: 'token',
      scope: 'agent',
      tokenId: 'abcdefgh',
    })
    expect(verify).toHaveBeenCalledWith(DB_TOKEN)
  })

  it('refuses unknown credentials', async () => {
    expect(await authenticate({ authorization: 'Bearer nope' }, ON)).toBeNull()
    expect(await authenticate({ session: 'forged' }, ON)).toBeNull()
    expect(await authenticate({}, ON)).toBeNull()
  })

  it('accepts database tokens even without a root token', async () => {
    verify.mockResolvedValue({ id: 'abcdefgh', scope: 'admin' })
    expect(await authenticate({ apiKey: DB_TOKEN }, {})).toMatchObject({ kind: 'token' })
  })
})

describe('requiresAdmin', () => {
  it.each([
    ['GET', '/api/access/tokens', ''],
    ['POST', '/api/access/tokens', ''],
    ['DELETE', '/api/access/tokens/abc', ''],
    ['PUT', '/api/settings', ''],
    ['DELETE', '/api/settings', ''],
    ['GET', '/api/settings', '?reveal=anthropic.api_key'],
  ])('%s %s%s needs admin', (method, path, search) => {
    expect(requiresAdmin(method, path, search)).toBe(true)
  })

  it.each([
    ['GET', '/api/settings', '?prefix=runtime.'],
    ['GET', '/api/tasks', ''],
    ['POST', '/api/tasks', ''],
    ['GET', '/api/accessx', ''],
    ['GET', '/api/settings/audit', ''],
  ])('%s %s%s does not', (method, path, search) => {
    expect(requiresAdmin(method, path, search)).toBe(false)
  })
})

describe('principal labels', () => {
  it('round-trips to an audit actor', () => {
    expect(
      actorFromPrincipal(principalLabel({ kind: 'token', scope: 'agent', tokenId: 'abc' })),
    ).toBe('token:abc')
    expect(actorFromPrincipal(principalLabel({ kind: 'root', scope: 'admin' }))).toBe('root-token')
    expect(actorFromPrincipal(principalLabel({ kind: 'session', scope: 'admin' }))).toBe('web-ui')
    expect(actorFromPrincipal(null)).toBe('web-ui')
  })
})
