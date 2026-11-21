// Rate limits on the operations that spend money on a model: starting an
// agent run, generating a plan, generating an onboarding setup. They guard
// against a script or an agent stuck in a loop, so they are generous for a
// person and count in Postgres, shared by the web app and the MCP server.
//
// TAIA_SPEND_LIMITS picks the mode:
//   shadow  (default) count, and log each call a limit would refuse, but let
//           it through, to see the effect before enforcing it
//   enforce refuse with SpendLimitError (HTTP 429) once a limit is spent
//   off     no limits
//
// Each limit can be changed with its own variable, in omnilimit's policy
// shorthand such as `20/hour`.

import {
  createLimiter,
  parsePolicy,
  type Decision,
  type Limiter,
  type LimiterEvent,
} from 'omnilimit'
import { AppError } from './errors'
import { rateLimitStore } from './rate-limit'

export type SpendLimitMode = 'shadow' | 'enforce' | 'off'

export const SPEND_LIMITS = {
  /** Agent runs started by hand or by the API, per agent. */
  'agent-run': { env: 'TAIA_AGENT_RUN_LIMIT', fallback: '20/hour' },
  /** Plans generated, for the whole instance. */
  planning: { env: 'TAIA_PLANNING_LIMIT', fallback: '30/hour' },
  /** Onboarding setups generated, for the whole instance. */
  'onboarding-setup': { env: 'TAIA_ONBOARDING_SETUP_LIMIT', fallback: '10/hour' },
} as const

export type SpendLimitName = keyof typeof SPEND_LIMITS

export function spendLimitMode(
  env: Record<string, string | undefined> = process.env,
): SpendLimitMode {
  const value = env.TAIA_SPEND_LIMITS?.trim().toLowerCase()
  return value === 'enforce' || value === 'off' ? value : 'shadow'
}

/** The policy of a limit from its variable, or its default if unset or invalid. */
export function spendPolicy(
  name: SpendLimitName,
  env: Record<string, string | undefined> = process.env,
): { limit: number; windowMs: number } {
  const { env: variable, fallback } = SPEND_LIMITS[name]
  const given = env[variable]?.trim()
  if (given) {
    try {
      return parsePolicy(given)
    } catch {
      console.warn(
        `[spend-limit] Ignoring ${variable}=${JSON.stringify(given)}: expected something like ${fallback}`,
      )
    }
  }
  return parsePolicy(fallback)
}

/** Thrown in enforce mode when a limit is spent: `apiError` answers it with 429 and Retry-After. */
export class SpendLimitError extends AppError {
  constructor(
    readonly limit: SpendLimitName,
    readonly retryAfterSeconds: number,
  ) {
    super(
      `Too many ${limit} requests; try again in ${retryAfterSeconds}s`,
      429,
      'SPEND_LIMIT_REACHED',
    )
    this.name = 'SpendLimitError'
  }
}

function logShadowed(event: LimiterEvent): void {
  if (event.type === 'limited' && event.shadowed) {
    console.warn(
      `[spend-limit] shadow: ${event.scope} is over its limit and would be refused; ` +
        'set TAIA_SPEND_LIMITS=enforce to refuse it',
    )
  }
}

const limiters = new Map<string, Limiter>()

function limiterFor(name: SpendLimitName, mode: SpendLimitMode): Limiter {
  const key = `${name}:${mode}`
  let limiter = limiters.get(key)
  if (!limiter) {
    limiter = createLimiter({
      ...spendPolicy(name),
      store: rateLimitStore(),
      scope: `spend.${name}`,
      // Losing the count must not stop the app: let the call through.
      onStoreError: 'open',
      headers: 'none',
      shadow: mode === 'shadow',
      onEvent: logShadowed,
    })
    limiters.set(key, limiter)
  }
  return limiter
}

/**
 * Count one call against a limit, for `id` (an agent id, or `instance`). Runs
 * `work` unless the limit is spent in enforce mode, and gives the unit back if
 * `work` throws, since nothing was spent.
 */
export async function withSpendLimit<T>(
  name: SpendLimitName,
  id: string,
  work: () => Promise<T>,
  mode: SpendLimitMode = spendLimitMode(),
): Promise<T> {
  if (mode === 'off') return work()
  const limiter = limiterFor(name, mode)
  const { decision, reservation } = await limiter.reserve(id)
  if (!decision.allowed) throw new SpendLimitError(name, retryAfterSeconds(decision))
  try {
    return await work()
  } catch (error) {
    await limiter.refund(reservation)
    throw error
  }
}

function retryAfterSeconds(decision: Decision): number {
  return Math.max(1, Math.ceil((decision.retryAfterMs ?? 60_000) / 1000))
}

/** Tests only: forget the limiters built so far, so they pick up the environment again. */
export function resetSpendLimiters(): void {
  limiters.clear()
}
