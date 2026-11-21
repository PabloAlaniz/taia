import { NextResponse, type NextRequest } from 'next/server'
import { authEnabled, isAuthorized, SESSION_COOKIE } from '@taia/core/auth'

// Gate in front of every page and API route. It does nothing unless
// TAIA_API_TOKEN is set (see @taia/core/auth).

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
  if (!authEnabled()) return NextResponse.next()

  const { pathname, search } = request.nextUrl
  if (isPublic(pathname)) return NextResponse.next()

  const authorized = await isAuthorized({
    authorization: request.headers.get('authorization'),
    apiKey: request.headers.get('x-api-key'),
    session: request.cookies.get(SESSION_COOKIE)?.value,
  })
  if (authorized) return NextResponse.next()

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
