import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { sessionCookieValue, SESSION_COOKIE } from '@taia/core/auth'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as logout } from '@/app/api/auth/logout/route'
import { attemptLogin, LOGIN_LIMIT, resetLoginLimit } from '@/lib/login-limit'

// The Postgres store is covered by the core integration tests; here the same
// limiter counts in memory. `down` makes every store call fail.
const store = vi.hoisted(() => ({ down: false }))
vi.mock('@taia/core/rate-limit', async () => {
  const { memoryStore } = await import('omnilimit')
  const memory = memoryStore()
  const guard =
    <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
    (...args: A) =>
      store.down ? Promise.reject(new Error('db down')) : call(...args)
  return {
    rateLimitStore: () => ({
      tier: memory.tier,
      hit: guard(memory.hit.bind(memory)),
      peek: guard(memory.peek!.bind(memory)),
      reset: guard(memory.reset!.bind(memory)),
      refund: guard(memory.refund!.bind(memory)),
    }),
  }
})

const TOKEN = 'a-test-token-0123456789'

function loginRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

beforeEach(async () => {
  for (const bucket of ['shared', '203.0.113.7', '203.0.113.8']) await resetLoginLimit(bucket)
})

afterEach(() => {
  store.down = false
  delete process.env.TAIA_API_TOKEN
  delete process.env.TAIA_TRUSTED_PROXIES
  vi.useRealTimers()
})

describe('POST /api/auth/login', () => {
  it('sets the session cookie for the right token', async () => {
    process.env.TAIA_API_TOKEN = TOKEN

    const response = await login(loginRequest({ token: ` ${TOKEN} ` }))

    expect(response.status).toBe(200)
    const cookie = response.cookies.get(SESSION_COOKIE)
    expect(cookie?.value).toBe(await sessionCookieValue(TOKEN))
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
    // Never the token itself.
    expect(response.headers.get('set-cookie')).not.toContain(TOKEN)
  })

  it('marks the cookie secure behind a TLS proxy', async () => {
    process.env.TAIA_API_TOKEN = TOKEN

    const response = await login(loginRequest({ token: TOKEN }, { 'x-forwarded-proto': 'https' }))

    expect(response.cookies.get(SESSION_COOKIE)?.secure).toBe(true)
  })

  it.each([{ token: 'wrong-token-wrong-token' }, { token: '' }, {}, { token: 42 }])(
    'refuses %j without setting a cookie',
    async (body) => {
      process.env.TAIA_API_TOKEN = TOKEN

      const response = await login(loginRequest(body))

      expect(response.status).toBe(401)
      expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined()
    },
  )

  it('says authentication is off when no token is configured', async () => {
    const response = await login(loginRequest({ token: 'anything' }))

    expect(await response.json()).toEqual({ ok: true, enabled: false })
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined()
  })
})

describe('POST /api/auth/login: failed attempts', () => {
  const wrong = (headers: Record<string, string> = {}) =>
    login(loginRequest({ token: 'wrong-token-wrong-token' }, headers))

  async function spend(headers: Record<string, string> = {}) {
    for (let i = 0; i < LOGIN_LIMIT.limit; i++) expect((await wrong(headers)).status).toBe(401)
  }

  it('answers 429 with Retry-After once the budget is spent, even to the right token', async () => {
    process.env.TAIA_API_TOKEN = TOKEN
    await spend()

    const refused = await login(loginRequest({ token: TOKEN }))

    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ ok: false, code: 'TOO_MANY_ATTEMPTS' })
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(refused.cookies.get(SESSION_COOKIE)).toBeUndefined()
  })

  it('does not count successful logins', async () => {
    process.env.TAIA_API_TOKEN = TOKEN

    for (let i = 0; i < LOGIN_LIMIT.limit * 2; i++) {
      expect((await login(loginRequest({ token: TOKEN }))).status).toBe(200)
    }
  })

  it('gives back one attempt at a time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    process.env.TAIA_API_TOKEN = TOKEN
    await spend()
    expect((await wrong()).status).toBe(429)

    vi.advanceTimersByTime(LOGIN_LIMIT.windowMs / LOGIN_LIMIT.limit)

    expect((await login(loginRequest({ token: TOKEN }))).status).toBe(200)
    expect((await wrong()).status).toBe(401)
    expect((await wrong()).status).toBe(429)
  })

  it('shares one budget when no proxy is trusted, whatever X-Forwarded-For says', async () => {
    process.env.TAIA_API_TOKEN = TOKEN
    for (let i = 0; i < LOGIN_LIMIT.limit; i++) {
      expect((await wrong({ 'x-forwarded-for': `198.51.100.${i}` })).status).toBe(401)
    }

    expect((await wrong({ 'x-forwarded-for': '198.51.100.200' })).status).toBe(429)
  })

  it('counts per client behind a trusted proxy, reading the address it appended', async () => {
    process.env.TAIA_API_TOKEN = TOKEN
    process.env.TAIA_TRUSTED_PROXIES = '1'
    // The client can prepend anything; the proxy appends the real address.
    for (let i = 0; i < LOGIN_LIMIT.limit; i++) {
      expect((await wrong({ 'x-forwarded-for': `198.51.100.${i}, 203.0.113.7` })).status).toBe(401)
    }

    expect((await wrong({ 'x-forwarded-for': '198.51.100.200, 203.0.113.7' })).status).toBe(429)
    expect((await wrong({ 'x-forwarded-for': '203.0.113.8' })).status).toBe(401)
  })
})

describe('login limit: reserve mode and store failures', () => {
  it('never checks more tokens at once than the budget has left', async () => {
    let checked = 0
    const slowWrong = async () => {
      checked++
      await new Promise((resolve) => setTimeout(resolve, 5))
      return false
    }

    const attempts = await Promise.all(
      Array.from({ length: LOGIN_LIMIT.limit * 3 }, () => attemptLogin('shared', slowWrong)),
    )

    expect(checked).toBe(LOGIN_LIMIT.limit)
    expect(attempts.filter((a) => a.allowed)).toHaveLength(LOGIN_LIMIT.limit)
  })

  it('answers 503 without checking the token when the database cannot count', async () => {
    process.env.TAIA_API_TOKEN = TOKEN
    store.down = true

    const response = await login(loginRequest({ token: TOKEN }))

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ ok: false, code: 'LOGIN_UNAVAILABLE' })
    expect(response.headers.get('retry-after')).toBe('1')
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined()
  })
})

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const response = await logout()

    expect(response.cookies.get(SESSION_COOKIE)).toMatchObject({ value: '', maxAge: 0 })
  })
})
