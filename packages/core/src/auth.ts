// Access token — optional authentication for the API, the MCP server and the
// WebSocket.
//
// With `TAIA_API_TOKEN` set in the server environment, every request needs
// it: as `Authorization: Bearer <token>` (or `X-API-Key`) from agents, the CLI
// and scripts, or as the session cookie the browser gets by entering the
// token on /login. Without the variable TAIA stays open, as before.
//
// There are no users: whoever has the token has full access.
//
// Only Web Crypto is used, so this module also loads in Next's proxy.

export const SESSION_COOKIE = 'taia_session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const MIN_TOKEN_LENGTH = 16

// What is stored in the cookie and sent to the WebSocket is derived from the
// token, never the token itself, so neither can be replayed as the other.
const SESSION_CONTEXT = 'taia-session-v1'
const WS_TICKET_CONTEXT = 'taia-ws-v1'

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthConfigError'
  }
}

/** The configured token, or null when authentication is off. */
export function apiToken(env: Record<string, string | undefined> = process.env): string | null {
  const token = env.TAIA_API_TOKEN?.trim()
  if (!token) return null
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new AuthConfigError(
      `TAIA_API_TOKEN must have at least ${MIN_TOKEN_LENGTH} characters (try: openssl rand -hex 32)`,
    )
  }
  return token
}

export function authEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return apiToken(env) !== null
}

async function derive(token: string, context: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(token),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(context))
  return Array.from(new Uint8Array(mac), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The value of the session cookie for `token`. */
export function sessionCookieValue(token: string): Promise<string> {
  return derive(token, SESSION_CONTEXT)
}

/** The ticket a browser passes to the WebSocket server (`?ticket=`). */
export function webSocketTicket(token: string): Promise<string> {
  return derive(token, WS_TICKET_CONTEXT)
}

/** Compares two strings without leaking where they differ. */
export function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  let diff = left.length ^ right.length
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ (right[i % (right.length || 1)] ?? 0)
  return diff === 0
}

export interface Credentials {
  /** The `Authorization` header. */
  authorization?: string | null
  /** The `X-API-Key` header. */
  apiKey?: string | null
  /** The value of the session cookie. */
  session?: string | null
}

/** The token a request presents in its headers, if any. */
export function presentedToken(credentials: Credentials): string | null {
  // `\S` after `\s+`: one place to split, so no backtracking on long runs of spaces.
  const bearer = /^Bearer\s+(\S.*)$/i.exec(credentials.authorization?.trim() ?? '')?.[1]
  return bearer?.trim() || credentials.apiKey?.trim() || null
}

/** Whether a request may proceed. Always true when authentication is off. */
export async function isAuthorized(
  credentials: Credentials,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const token = apiToken(env)
  if (!token) return true

  const presented = presentedToken(credentials)
  if (presented && safeEqual(presented, token)) return true

  const session = credentials.session?.trim()
  return !!session && safeEqual(session, await sessionCookieValue(token))
}

/** Headers for a server-side call to TAIA's own API or broadcast endpoint. */
export function internalAuthHeaders(
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const token = apiToken(env)
  return token ? { Authorization: `Bearer ${token}` } : {}
}
