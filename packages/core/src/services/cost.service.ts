// Cost service — pricing, sync from the active runtime, dashboard metrics.

import { forEachRuntime, getRuntimeAdapterForAgent } from '../runtime'
import { findClaudeModel, RuntimeCapability } from '@taia/runtime'
import {
  upsertSessionCost,
  getTaskCost,
  getTaskSessionCosts,
  getAgentCostSummary as getAgentCostSummaryFromDb,
  getCostDashboard as getCostDashboardFromDb,
} from '../db/index'
import type { TaskCostBreakdown, CostDashboardMetrics } from '@taia/types'

// --- Pricing (per 1M tokens) ---
// Rates come from the Claude model registry in @taia/runtime/models.

interface ModelPricing {
  model: string
  inputPer1M: number
  outputPer1M: number
  blendedPer1M: number
  cacheReadPer1M: number
  cacheWritePer1M: number
}

// Anthropic prompt-caching pricing multipliers (5-minute TTL — the default).
// Cache writes cost ~1.25× the standard input price; cache reads cost ~0.1×.
// Models with a different cache-read rate override it in the registry.
const CACHE_WRITE_MULTIPLIER = 1.25
const CACHE_READ_MULTIPLIER = 0.1

function toPricing(
  model: string,
  inputPer1M: number,
  outputPer1M: number,
  cacheReadPer1M?: number,
  cacheWritePer1M?: number,
): ModelPricing {
  return {
    model,
    inputPer1M,
    outputPer1M,
    // Blended rate assumes the typical agent input-heavy mix (≈2× input).
    blendedPer1M: inputPer1M * 2,
    cacheReadPer1M: cacheReadPer1M ?? inputPer1M * CACHE_READ_MULTIPLIER,
    cacheWritePer1M: cacheWritePer1M ?? inputPer1M * CACHE_WRITE_MULTIPLIER,
  }
}

// Default if model not recognized
const DEFAULT_PRICING: ModelPricing = toPricing('unknown', 3, 15)

/** Get pricing for a model. Uses fuzzy matching for model variants. */
export function getModelPricing(model: string): ModelPricing {
  const info = findClaudeModel(model)
  if (!info) return DEFAULT_PRICING
  return toPricing(
    info.id,
    info.inputPer1M,
    info.outputPer1M,
    info.cacheReadPer1M,
    info.cacheWritePer1M,
  )
}

/**
 * Calculate cost for a session given token counts and model.
 *
 * When `cacheCreationInputTokens` and `cacheReadInputTokens` are provided
 * (Anthropic prompt caching), they're priced at the cached multipliers
 * instead of the flat input rate. `inputTokens` represents the uncached
 * remainder only, matching the `usage.input_tokens` Anthropic returns.
 *
 * Adapters that don't use caching (OpenClaw today) leave the cache fields
 * at 0 and the calculation falls back to the standard input/output split.
 */
export function calculateCost(
  totalTokens: number,
  model: string,
  inputTokens?: number,
  outputTokens?: number,
  cacheCreationInputTokens?: number,
  cacheReadInputTokens?: number,
): number {
  const pricing = getModelPricing(model)
  const cacheCreate = cacheCreationInputTokens || 0
  const cacheRead = cacheReadInputTokens || 0

  // Exact split path: take it whenever the caller knows the input/output (or
  // cache) breakdown — even if input+output is zero, a cache-only turn still
  // needs per-multiplier pricing rather than blended.
  if (
    inputTokens !== undefined &&
    outputTokens !== undefined &&
    inputTokens + outputTokens + cacheCreate + cacheRead > 0
  ) {
    const standardInput = inputTokens * pricing.inputPer1M
    const cacheWrite = cacheCreate * pricing.cacheWritePer1M
    const cacheReadCost = cacheRead * pricing.cacheReadPer1M
    const output = outputTokens * pricing.outputPer1M
    return (standardInput + cacheWrite + cacheReadCost + output) / 1_000_000
  }

  return (totalTokens * pricing.blendedPer1M) / 1_000_000
}

/** Format cost in USD */
export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

/** Format token count with K/M suffixes */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}

// --- Sync from the runtime ---

/** Sync cost data for the sessions of every runtime instance */
export async function syncAllCosts(): Promise<{ synced: number; errors: number }> {
  const { results } = await forEachRuntime(async (adapter) =>
    adapter.capabilities.has(RuntimeCapability.Sessions) && adapter.listSessions
      ? adapter.listSessions({ limit: 500 })
      : [],
  )
  const sessions = results.flatMap((r) => r.value)

  let synced = 0
  let errors = 0

  for (const session of sessions) {
    try {
      if (!session.totalTokens || session.totalTokens === 0) continue

      const model = session.model || 'unknown'
      const inputTokens = session.inputTokens || 0
      const outputTokens = session.outputTokens || 0
      const totalTokens = session.totalTokens
      const cacheCreation = session.cacheCreationInputTokens || 0
      const cacheRead = session.cacheReadInputTokens || 0
      const cost = calculateCost(
        totalTokens,
        model,
        inputTokens || undefined,
        outputTokens || undefined,
        cacheCreation || undefined,
        cacheRead || undefined,
      )

      const agentId = session.channel || session.key.split('/')[0] || 'unknown'

      await upsertSessionCost({
        session_key: session.key,
        agent_id: agentId,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cache_creation_input_tokens: cacheCreation,
        cache_read_input_tokens: cacheRead,
        estimated_cost_usd: cost,
        session_updated_at: session.updatedAt,
      })
      synced++
    } catch {
      errors++
    }
  }

  return { synced, errors }
}

/** Sync cost data for a specific agent */
export async function syncAgentCosts(agentId: string): Promise<{ synced: number; errors: number }> {
  const adapter = await getRuntimeAdapterForAgent(agentId)
  if (!adapter.capabilities.has(RuntimeCapability.Sessions) || !adapter.listSessions) {
    return { synced: 0, errors: 0 }
  }

  const sessions = await adapter.listSessions({ limit: 200 })

  const agentSessions = sessions.filter(
    (s) => s.channel === agentId || s.key.startsWith(`${agentId}/`),
  )

  let synced = 0
  let errors = 0

  for (const session of agentSessions) {
    try {
      if (!session.totalTokens || session.totalTokens === 0) continue

      const model = session.model || 'unknown'
      const inputTokens = session.inputTokens || 0
      const outputTokens = session.outputTokens || 0
      const totalTokens = session.totalTokens
      const cacheCreation = session.cacheCreationInputTokens || 0
      const cacheRead = session.cacheReadInputTokens || 0
      const cost = calculateCost(
        totalTokens,
        model,
        inputTokens || undefined,
        outputTokens || undefined,
        cacheCreation || undefined,
        cacheRead || undefined,
      )

      await upsertSessionCost({
        session_key: session.key,
        agent_id: agentId,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cache_creation_input_tokens: cacheCreation,
        cache_read_input_tokens: cacheRead,
        estimated_cost_usd: cost,
        session_updated_at: session.updatedAt,
      })
      synced++
    } catch {
      errors++
    }
  }

  return { synced, errors }
}

/** Get cost breakdown for a task */
export async function getTaskCostBreakdown(taskId: string): Promise<TaskCostBreakdown> {
  const [summary, sessions] = await Promise.all([getTaskCost(taskId), getTaskSessionCosts(taskId)])

  return {
    task_id: taskId,
    ...summary,
    sessions,
  }
}

const EMPTY_DASHBOARD: CostDashboardMetrics = {
  totals: { total_tokens: 0, total_cost_usd: 0, session_count: 0 },
  by_model: [],
  by_agent: [],
  daily_trend: [],
}

/** Get dashboard metrics for a given period */
export async function getDashboardMetrics(period?: string): Promise<CostDashboardMetrics> {
  let since: Date | undefined
  const now = new Date()

  switch (period) {
    case '24h':
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      break
    case 'week':
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case 'month':
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    default:
      since = undefined
  }

  try {
    return await getCostDashboardFromDb(since)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('relation') && msg.includes('does not exist')) {
      console.warn(
        '[cost] session_costs table not found — returning empty metrics. Run `pnpm migrate`.',
      )
      return EMPTY_DASHBOARD
    }
    throw err
  }
}

/** Get cost summary for an agent */
export async function getAgentCostSummary(agentId: string, period?: string) {
  let since: Date | undefined
  const now = new Date()

  switch (period) {
    case '24h':
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      break
    case 'week':
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case 'month':
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    default:
      since = undefined
  }

  try {
    return await getAgentCostSummaryFromDb(agentId, since)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('relation') && msg.includes('does not exist')) {
      console.warn(
        '[cost] session_costs table not found — returning empty summary. Run `pnpm migrate`.',
      )
      return {
        agent_id: agentId,
        total_tokens: 0,
        total_cost_usd: 0,
        session_count: 0,
        by_model: [],
      }
    }
    throw err
  }
}
