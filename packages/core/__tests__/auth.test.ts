import { describe, expect, it } from 'vitest'
import {
  apiToken,
  authEnabled,
  internalAuthHeaders,
  isAuthorized,
  presentedToken,
  safeEqual,
  sessionCookieValue,
  webSocketTicket,
} from '@taia/core/auth'

const TOKEN = 'a-test-token-0123456789'
const ON = { TAIA_API_TOKEN: TOKEN }

describe('apiToken', () => {
  it('is off without the variable', () => {
    expect(apiToken({})).toBeNull()
    expect(apiToken({ TAIA_API_TOKEN: '  ' })).toBeNull()
    expect(authEnabled({})).toBe(false)
  })

  it('returns the trimmed token', () => {
    expect(apiToken({ TAIA_API_TOKEN: ` ${TOKEN} ` })).toBe(TOKEN)
    expect(authEnabled(ON)).toBe(true)
  })

  it('refuses a token that is too short instead of running half-protected', () => {
    expect(() => apiToken({ TAIA_API_TOKEN: 'short' })).toThrow(/at least 16 characters/)
  })
})

describe('safeEqual', () => {
  it('compares strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('abc', '')).toBe(false)
    expect(safeEqual('', '')).toBe(true)
  })
})

describe('presentedToken', () => {
  it('reads a bearer token or an API key', () => {
    expect(presentedToken({ authorization: `Bearer ${TOKEN}` })).toBe(TOKEN)
    expect(presentedToken({ authorization: `bearer   ${TOKEN}  ` })).toBe(TOKEN)
    expect(presentedToken({ apiKey: TOKEN })).toBe(TOKEN)
    expect(presentedToken({ authorization: 'Basic abc' })).toBeNull()
    expect(presentedToken({})).toBeNull()
  })
})

describe('isAuthorized', () => {
  it('lets everything through when authentication is off', async () => {
    expect(await isAuthorized({}, {})).toBe(true)
  })

  it('accepts the token as bearer or API key', async () => {
    expect(await isAuthorized({ authorization: `Bearer ${TOKEN}` }, ON)).toBe(true)
    expect(await isAuthorized({ apiKey: TOKEN }, ON)).toBe(true)
  })

  it('accepts the session cookie derived from the token', async () => {
    expect(await isAuthorized({ session: await sessionCookieValue(TOKEN) }, ON)).toBe(true)
  })

  it('refuses a request without credentials or with wrong ones', async () => {
    expect(await isAuthorized({}, ON)).toBe(false)
    expect(await isAuthorized({ authorization: 'Bearer nope-nope-nope-nope' }, ON)).toBe(false)
    expect(await isAuthorized({ session: 'deadbeef' }, ON)).toBe(false)
  })

  it('does not accept the raw token as a cookie, nor the cookie as a token', async () => {
    const cookie = await sessionCookieValue(TOKEN)

    expect(await isAuthorized({ session: TOKEN }, ON)).toBe(false)
    expect(await isAuthorized({ authorization: `Bearer ${cookie}` }, ON)).toBe(false)
  })

  it('does not accept the WebSocket ticket as a session', async () => {
    expect(await webSocketTicket(TOKEN)).not.toBe(await sessionCookieValue(TOKEN))
    expect(await isAuthorized({ session: await webSocketTicket(TOKEN) }, ON)).toBe(false)
  })
})

describe('internalAuthHeaders', () => {
  it('carries the token only when authentication is on', () => {
    expect(internalAuthHeaders({})).toEqual({})
    expect(internalAuthHeaders(ON)).toEqual({ Authorization: `Bearer ${TOKEN}` })
  })
})
