import { afterEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { sessionCookieValue, SESSION_COOKIE } from '@taia/core/auth'
import { proxy } from '../proxy'

const TOKEN = 'a-test-token-0123456789'

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { headers })
}

/** `NextResponse.next()` marks the response instead of carrying a status. */
function passedThrough(response: Response) {
  return response.headers.get('x-middleware-next') === '1'
}

afterEach(() => {
  delete process.env.TAIA_API_TOKEN
})

describe('proxy without TAIA_API_TOKEN', () => {
  it('lets every request through', async () => {
    expect(passedThrough(await proxy(request('/api/tasks')))).toBe(true)
    expect(passedThrough(await proxy(request('/')))).toBe(true)
  })
})

describe('proxy with TAIA_API_TOKEN', () => {
  const protect = () => {
    process.env.TAIA_API_TOKEN = TOKEN
  }

  it('answers 401 to an API call without credentials', async () => {
    protect()
    const response = await proxy(request('/api/settings?reveal=runtime.instances.default.token'))

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ ok: false, code: 'UNAUTHORIZED' })
  })

  it('answers 401 to a wrong token', async () => {
    protect()
    const response = await proxy(
      request('/api/tasks', { authorization: 'Bearer not-the-token-at-all' }),
    )

    expect(response.status).toBe(401)
  })

  it.each([
    ['a bearer token', { authorization: `Bearer ${TOKEN}` }],
    ['an API key', { 'x-api-key': TOKEN }],
  ])('lets an API call through with %s', async (_name, headers) => {
    protect()
    expect(passedThrough(await proxy(request('/api/tasks', headers)))).toBe(true)
  })

  it('lets a browser through with the session cookie', async () => {
    protect()
    const cookie = `${SESSION_COOKIE}=${await sessionCookieValue(TOKEN)}`

    expect(passedThrough(await proxy(request('/settings', { cookie })))).toBe(true)
    expect(passedThrough(await proxy(request('/api/tasks', { cookie })))).toBe(true)
  })

  it('sends a page request without a session to the login screen', async () => {
    protect()
    const response = await proxy(request('/settings/runtime?tab=x'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('next')).toBe('/settings/runtime?tab=x')
  })

  it.each(['/login', '/api/auth/login', '/api/health', '/api/webhooks/incoming'])(
    'keeps %s reachable without credentials',
    async (path) => {
      protect()
      expect(passedThrough(await proxy(request(path)))).toBe(true)
    },
  )

  it.each(['/api/health/migrations', '/api/webhooks/outgoing', '/api/authx'])(
    'protects %s',
    async (path) => {
      protect()
      expect((await proxy(request(path))).status).toBe(401)
    },
  )
})
