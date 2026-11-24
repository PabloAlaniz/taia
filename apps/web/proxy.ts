import { NextResponse, type NextRequest } from 'next/server'
import { authEnabled, SESSION_COOKIE } from '@taia/core/auth'
import {
  authenticate,
  principalLabel,
  PRINCIPAL_HEADER,
  requiresAdmin,
} from '@taia/core/access/authenticate'

// Gate in front of every page and API route. It does nothing unless
// TAIA_API_TOKEN is set (see @taia/core/auth); then it accepts that token,
// the session cookie, or an access token from the database, and tells route
// handlers who is calling in PRINCIPAL_HEADER.

/** Paths reachable without the token. */
function isPublic(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    // Liveness probe (Docker healthcheck, load balancers).
    pathname === '/api/health' ||
    // Signed with the per-workspace webhook secret instead.
    pathname === '/api/webhooks/incoming'
  )
}

export async function proxy(request: NextRequest) {
  // Never trust a principal the client claims to be.
  const headers = new Headers(request.headers)
  headers.delete(PRINCIPAL_HEADER)
  const pass = () => NextResponse.next({ request: { headers } })

  if (!authEnabled()) return pass()

  const { pathname, search } = request.nextUrl
  if (isPublic(pathname)) return pass()

  let principal
  try {
    principal = await authenticate({
      authorization: request.headers.get('authorization'),
      apiKey: request.headers.get('x-api-key'),
      session: request.cookies.get(SESSION_COOKIE)?.value,
    })
  } catch (error) {
    console.error('[TAIA] Could not verify credentials:', error)
    return NextResponse.json(
      { ok: false, code: 'AUTH_UNAVAILABLE', error: 'Could not verify the access token' },
      { status: 503 },
    )
  }

  if (principal) {
    if (principal.scope !== 'admin' && requiresAdmin(request.method, pathname, search)) {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN', error: 'This token lacks the admin scope' },
        { status: 403 },
      )
    }
    headers.set(PRINCIPAL_HEADER, principalLabel(principal))
    return pass()
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { ok: false, code: 'UNAUTHORIZED', error: 'Missing or invalid access token' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="TAIA"' } },
    )
  }

  const login = request.nextUrl.clone()
  login.pathname = '/login'
  login.search = ''
  if (pathname !== '/') login.searchParams.set('next', pathname + search)
  return NextResponse.redirect(login)
}

export const config = {
  // Everything except Next's own assets and static files.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)',
  ],
}
