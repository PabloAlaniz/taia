// Who is making a request, for the web proxy and the MCP server.
//
// Three kinds of credentials are accepted while TAIA_API_TOKEN is set:
// - the root token itself (Bearer / X-API-Key), with admin scope;
// - the browser session cookie derived from it, with admin scope;
// - an access token from the database (`taia_<id>_<secret>`), with its scope.
//
// Unlike ../auth.ts this module reads the database, so it only runs in Node.

import { apiToken, presentedToken, safeEqual, sessionCookieValue, type Credentials } from '../auth'
import { verifyAccessToken, type ApiTokenScope } from '../services/access-token.service'

export type Principal =
  | { kind: 'root'; scope: 'admin' }
  | { kind: 'session'; scope: 'admin' }
  | { kind: 'token'; scope: ApiTokenScope; tokenId: string }

/** Header the proxy sets for route handlers (any value a client sends is dropped). */
export const PRINCIPAL_HEADER = 'x-taia-principal'

export async function authenticate(
  credentials: Credentials,
  env: Record<string, string | undefined> = process.env,
): Promise<Principal | null> {
  const root = apiToken(env)
  const presented = presentedToken(credentials)

  if (presented) {
    if (root && safeEqual(presented, root)) return { kind: 'root', scope: 'admin' }
    const verified = await verifyAccessToken(presented)
    if (verified) return { kind: 'token', scope: verified.scope, tokenId: verified.id }
  }

  const session = credentials.session?.trim()
  if (root && session && safeEqual(session, await sessionCookieValue(root))) {
    return { kind: 'session', scope: 'admin' }
  }
  return null
}

/** The value of PRINCIPAL_HEADER: `root`, `session` or `token:<id>:<scope>`. */
export function principalLabel(principal: Principal): string {
  return principal.kind === 'token'
    ? `token:${principal.tokenId}:${principal.scope}`
    : principal.kind
}

/**
 * Whether a request needs admin scope: managing access tokens, or touching
 * credentials in the settings (writing them, or revealing a stored one).
 */
export function requiresAdmin(method: string, pathname: string, search = ''): boolean {
  if (pathname === '/api/access' || pathname.startsWith('/api/access/')) return true
  if (pathname === '/api/settings') {
    return method.toUpperCase() !== 'GET' || new URLSearchParams(search).has('reveal')
  }
  return false
}

/** Who to name in the audit log for a request the proxy let through. */
export function actorFromPrincipal(label: string | null | undefined): string {
  if (!label || label === 'session') return 'web-ui'
  if (label === 'root') return 'root-token'
  const [kind, id] = label.split(':')
  return kind === 'token' && id ? `token:${id}` : 'web-ui'
}
