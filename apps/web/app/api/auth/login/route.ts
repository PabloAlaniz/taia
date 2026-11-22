import { NextRequest, NextResponse } from 'next/server'
import {
  apiToken,
  safeEqual,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieValue,
} from '@taia/core/auth'
import { attemptLogin, loginBucket, retryAfterSeconds } from '@/lib/login-limit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/login  { token }
 * Exchanges the access token for the session cookie the browser uses.
 * After too many wrong tokens it answers 429 until the budget recovers, even
 * to the right one, and 503 when the attempt cannot be counted (see
 * lib/login-limit).
 */
export async function POST(request: NextRequest) {
  const token = apiToken()
  if (!token) {
    return NextResponse.json({ ok: true, enabled: false })
  }

  const attempt = await attemptLogin(loginBucket(request.headers), async () => {
    const body = await request.json().catch(() => ({}))
    const presented = typeof body?.token === 'string' ? body.token.trim() : ''
    return presented !== '' && safeEqual(presented, token)
  })
  if (!attempt.allowed && attempt.decision.reason === 'store_error') {
    return NextResponse.json(
      { ok: false, code: 'LOGIN_UNAVAILABLE', error: 'Sign-in is unavailable, try again shortly' },
      { status: 503, headers: { 'Retry-After': String(retryAfterSeconds(attempt)) } },
    )
  }
  if (!attempt.allowed) {
    return NextResponse.json(
      { ok: false, code: 'TOO_MANY_ATTEMPTS', error: 'Too many failed attempts, try again later' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds(attempt)) } },
    )
  }
  if (!attempt.verified) {
    return NextResponse.json(
      { ok: false, code: 'UNAUTHORIZED', error: 'Invalid access token' },
      { status: 401 },
    )
  }

  const response = NextResponse.json({ ok: true, enabled: true })
  response.cookies.set(SESSION_COOKIE, await sessionCookieValue(token), {
    httpOnly: true,
    sameSite: 'lax',
    // Behind a TLS proxy the request arrives as http; trust what it forwards.
    secure:
      request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return response
}
