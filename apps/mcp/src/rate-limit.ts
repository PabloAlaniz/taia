/**
 * Brake on POST /mcp, so an agent or script stuck in a loop cannot hammer the
 * server. It runs before the token check, so a flood of bad tokens is braked
 * too. The count is per client address (the TCP peer: nothing proxies the MCP
 * server) and kept in memory: the MCP server is one process.
 *
 * TAIA_MCP_RATE_LIMIT sets the policy (default `600/minute`), and
 * TAIA_MCP_RATE_LIMIT_MODE picks the mode:
 *   shadow  (default) count, and log each request the limit would refuse, but
 *           let it through
 *   enforce refuse with a JSON-RPC error and HTTP 429
 *   off     no limit
 */

import type express from 'express'
import { createLimiter, memoryStore, parsePolicy, type LimiterEvent } from 'omnilimit'
import { ipKey, rateLimit } from 'omnilimit/express'

export const DEFAULT_MCP_LIMIT = '600/minute'

export type McpRateLimitMode = 'shadow' | 'enforce' | 'off'

export function mcpRateLimitMode(
  env: Record<string, string | undefined> = process.env,
): McpRateLimitMode {
  const value = env.TAIA_MCP_RATE_LIMIT_MODE?.trim().toLowerCase()
  return value === 'enforce' || value === 'off' ? value : 'shadow'
}

/** TAIA_MCP_RATE_LIMIT as a policy; the default if unset or invalid. */
export function mcpPolicy(env: Record<string, string | undefined> = process.env): {
  limit: number
  windowMs: number
} {
  const given = env.TAIA_MCP_RATE_LIMIT?.trim()
  if (given) {
    try {
      return parsePolicy(given)
    } catch {
      console.warn(
        `[mcp] Ignoring TAIA_MCP_RATE_LIMIT=${JSON.stringify(given)}: expected something like ${DEFAULT_MCP_LIMIT}`,
      )
    }
  }
  return parsePolicy(DEFAULT_MCP_LIMIT)
}

function logShadowed(event: LimiterEvent): void {
  if (event.type === 'limited' && event.shadowed) {
    console.warn(
      '[mcp] shadow: a client is over TAIA_MCP_RATE_LIMIT and would be refused; ' +
        'set TAIA_MCP_RATE_LIMIT_MODE=enforce to refuse it',
    )
  }
}

/** The middleware for /mcp, or `null` when the limit is off. */
export function mcpRateLimit(
  env: Record<string, string | undefined> = process.env,
): express.RequestHandler | null {
  const mode = mcpRateLimitMode(env)
  if (mode === 'off') return null
  const limiter = createLimiter({
    ...mcpPolicy(env),
    store: memoryStore(),
    scope: 'mcp',
    // A memory store cannot fail; this only matters if the store changes.
    onStoreError: 'open',
    shadow: mode === 'shadow',
    onEvent: logShadowed,
  })
  return rateLimit({
    limiter,
    key: ipKey({ preset: 'direct' }),
    onMissingKey: 'shared',
    onDenied: (denial, _req, res) => {
      res.status(denial.status).json({
        jsonrpc: '2.0',
        error: { code: -32029, message: 'Too many requests, try again later' },
        id: null,
      })
    },
  }) as express.RequestHandler
}
