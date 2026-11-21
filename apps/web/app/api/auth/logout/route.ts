import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@taia/core/auth'

export const dynamic = 'force-dynamic'

/** POST /api/auth/logout — forgets the session cookie. */
export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return response
}
