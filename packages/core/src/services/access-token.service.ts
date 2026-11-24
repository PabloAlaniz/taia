// Access tokens: create, list, revoke and verify (see access/token-format.ts
// and migration 0009). The full token exists only in the response that
// creates it; afterwards TAIA keeps its hash.

import { AppError, NotFoundError, ValidationError } from '../errors'
import {
  findApiToken,
  insertApiToken,
  listApiTokens,
  revokeApiToken,
  touchApiToken,
  type ApiTokenRecord,
  type ApiTokenScope,
} from '../db/repositories/api-token.repository'
import {
  generateAccessToken,
  maskedToken,
  parseAccessToken,
  secretMatches,
} from '../access/token-format'
import { recordSettingsAuditEvent } from './settings-audit.service'

export type { ApiTokenScope }

export const TOKEN_SCOPES: readonly ApiTokenScope[] = ['admin', 'agent']
export const TOKEN_EXPIRY_DAYS: readonly number[] = [30, 90, 365]
const MAX_NAME_LENGTH = 80

/** How long a verified token is trusted without asking the database again. */
const CACHE_TTL_MS = 30_000
/** last_used_at is written at most this often per token. */
const TOUCH_INTERVAL_MS = 60_000

export type AccessTokenStatus = 'active' | 'revoked' | 'expired'

/** A token as the UI and API show it: never the hash or the secret. */
export interface AccessTokenView {
  id: string
  name: string
  scope: ApiTokenScope
  masked: string
  status: AccessTokenStatus
  createdBy: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
}

export interface VerifiedToken {
  id: string
  scope: ApiTokenScope
}

interface AuditContext {
  actor?: string
  origin?: string
  workspaceId?: string
}

function statusOf(record: ApiTokenRecord, now = Date.now()): AccessTokenStatus {
  if (record.revokedAt) return 'revoked'
  if (record.expiresAt && record.expiresAt.getTime() <= now) return 'expired'
  return 'active'
}

function toView(record: ApiTokenRecord): AccessTokenView {
  return {
    id: record.id,
    name: record.name,
    scope: record.scope,
    masked: maskedToken(record.id),
    status: statusOf(record),
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
  }
}

function audit(
  id: string,
  operation: 'create' | 'revoke',
  context: AuditContext,
  message?: string,
) {
  return recordSettingsAuditEvent({
    workspaceId: context.workspaceId || 'ws-default',
    // "token" in the key classifies the event as an api_key one.
    settingKey: `access_token.${id}`,
    operation,
    actor: context.actor || 'web-ui',
    origin: context.origin || 'access-api',
    result: 'success',
    message: message ?? null,
  })
}

export async function createAccessToken(
  input: { name: unknown; scope: unknown; expiresInDays?: unknown },
  context: AuditContext = {},
): Promise<{ token: string; record: AccessTokenView }> {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name || name.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`name is required (at most ${MAX_NAME_LENGTH} characters)`)
  }
  if (!TOKEN_SCOPES.includes(input.scope as ApiTokenScope)) {
    throw new ValidationError(`scope must be one of: ${TOKEN_SCOPES.join(', ')}`)
  }
  const days = input.expiresInDays ?? null
  if (days !== null && !TOKEN_EXPIRY_DAYS.includes(days as number)) {
    throw new ValidationError(
      `expiresInDays must be one of ${TOKEN_EXPIRY_DAYS.join(', ')} or null (never)`,
    )
  }

  const { token, id, hash } = generateAccessToken()
  const record = await insertApiToken({
    id,
    name,
    scope: input.scope as ApiTokenScope,
    tokenHash: hash,
    createdBy: context.actor || 'web-ui',
    expiresAt: days === null ? null : new Date(Date.now() + (days as number) * 86_400_000),
  })
  await audit(id, 'create', context, `${record.scope} token "${name}" created`)
  return { token, record: toView(record) }
}

export async function listAccessTokens(): Promise<AccessTokenView[]> {
  return (await listApiTokens()).map(toView)
}

export async function revokeAccessToken(
  id: string,
  context: AuditContext = {},
): Promise<AccessTokenView> {
  const record = await findApiToken(id)
  if (!record) throw new NotFoundError('Access token', id)
  if (record.revokedAt)
    throw new AppError('Access token is already revoked', 409, 'ALREADY_REVOKED')
  await revokeApiToken(id)
  forgetVerifiedToken(id)
  await audit(id, 'revoke', context, `token "${record.name}" revoked`)
  return toView({ ...record, revokedAt: new Date() })
}

// --- Verification -----------------------------------------------------------

interface CacheEntry {
  hash: string
  result: VerifiedToken | null
  until: number
}

// Next bundles the proxy and the route handlers separately, each with its own
// copy of this module. Keeping the cache on globalThis shares it between them,
// so revoking a token in a route handler takes effect in the proxy at once.
interface TokenCacheState {
  cache: Map<string, CacheEntry>
  lastTouched: Map<string, number>
}
const STATE_KEY = Symbol.for('taia.access-token-cache')
const state: TokenCacheState = ((globalThis as Record<symbol, unknown>)[STATE_KEY] ??= {
  cache: new Map(),
  lastTouched: new Map(),
}) as TokenCacheState
const { cache, lastTouched } = state

/** Drops a token from this process's cache (other processes wait out the TTL). */
export function forgetVerifiedToken(id: string): void {
  cache.delete(id)
}

/** For tests. */
export function clearAccessTokenCache(): void {
  cache.clear()
  lastTouched.clear()
}

function touchLater(id: string, now: number): void {
  if (now - (lastTouched.get(id) ?? 0) < TOUCH_INTERVAL_MS) return
  lastTouched.set(id, now)
  touchApiToken(id).catch((error) => console.error('[TAIA] Could not record token use:', error))
}

/**
 * The token's id and scope if `value` is an active token, or null. Results
 * are cached for 30 s per process, so a revoked token can still work for up
 * to that long in a process other than the one that revoked it.
 */
export async function verifyAccessToken(value: string): Promise<VerifiedToken | null> {
  const parsed = parseAccessToken(value)
  if (!parsed) return null
  const now = Date.now()

  const cached = cache.get(parsed.id)
  let result: VerifiedToken | null
  if (cached && cached.until > now) {
    // The cache is keyed by id: the secret must still match what was verified.
    if (!secretMatches(parsed.secret, cached.hash)) return null
    result = cached.result
  } else {
    const record = await findApiToken(parsed.id)
    if (!record || !secretMatches(parsed.secret, record.tokenHash)) return null
    result = statusOf(record, now) === 'active' ? { id: record.id, scope: record.scope } : null
    // Never cache past the token's expiry.
    const until = Math.min(now + CACHE_TTL_MS, record.expiresAt?.getTime() ?? Infinity)
    cache.set(parsed.id, { hash: record.tokenHash, result, until })
  }

  if (result) touchLater(result.id, now)
  return result
}
