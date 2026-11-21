// Session cost repository — stores per-session cost data from the active runtime adapter

import { pool, generateId } from '../pool'
import type { SessionCost, CostSummary, AgentCostSummary, CostDashboardMetrics } from '@taia/types'

/** Upsert a session cost record (INSERT ON CONFLICT UPDATE) */
export async function upsertSessionCost(data: {
  session_key: string
  agent_id: string
  task_id?: string
  model: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  estimated_cost_usd: number
  session_updated_at: number
}): Promise<SessionCost> {
  const id = generateId()
  const res = await pool.query(
    `INSERT INTO session_costs (id, session_key, agent_id, task_id, model,
       input_tokens, output_tokens, total_tokens,
       cache_creation_input_tokens, cache_read_input_tokens,
       estimated_cost_usd, session_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (session_key) DO UPDATE SET
       agent_id = EXCLUDED.agent_id,
       task_id = COALESCE(EXCLUDED.task_id, session_costs.task_id),
       model = EXCLUDED.model,
       input_tokens = EXCLUDED.input_tokens,
       output_tokens = EXCLUDED.output_tokens,
       total_tokens = EXCLUDED.total_tokens,
       cache_creation_input_tokens = EXCLUDED.cache_creation_input_tokens,
       cache_read_input_tokens = EXCLUDED.cache_read_input_tokens,
       estimated_cost_usd = EXCLUDED.estimated_cost_usd,
       session_updated_at = EXCLUDED.session_updated_at
     RETURNING *`,
    [
      id,
      data.session_key,
      data.agent_id,
      data.task_id || null,
      data.model,
      data.input_tokens,
      data.output_tokens,
      data.total_tokens,
      data.cache_creation_input_tokens || 0,
      data.cache_read_input_tokens || 0,
      data.estimated_cost_usd,
      data.session_updated_at,
    ],
  )
  return res.rows[0]
}

/** Get cost for a single session */
export async function getSessionCost(sessionKey: string): Promise<SessionCost | null> {
  const res = await pool.query('SELECT * FROM session_costs WHERE session_key = $1', [sessionKey])
  return res.rows[0] ?? null
}

/** Get total cost for a task (SUM across all sessions) */
export async function getTaskCost(taskId: string): Promise<CostSummary> {
  const res = await pool.query(
    `SELECT COALESCE(SUM(total_tokens), 0) as total_tokens,
            COALESCE(SUM(estimated_cost_usd), 0) as total_cost_usd,
            COUNT(*) as session_count
     FROM session_costs WHERE task_id = $1`,
    [taskId],
  )
  const row = res.rows[0]
  return {
    total_tokens: Number(row.total_tokens),
    total_cost_usd: Number(row.total_cost_usd),
    session_count: Number(row.session_count),
  }
}

/** Get all session costs for a task */
export async function getTaskSessionCosts(taskId: string): Promise<SessionCost[]> {
  const res = await pool.query(
    'SELECT * FROM session_costs WHERE task_id = $1 ORDER BY created_at DESC',
    [taskId],
  )
  return res.rows
}

/** Get cost summary for an agent, optionally since a date */
export async function getAgentCostSummary(
  agentId: string,
  since?: Date,
): Promise<AgentCostSummary> {
  const params: unknown[] = [agentId]
  let whereClause = 'WHERE agent_id = $1'
  if (since) {
    whereClause += ' AND created_at >= $2'
    params.push(since.toISOString())
  }

  const totalsRes = await pool.query(
    `SELECT COALESCE(SUM(total_tokens), 0) as total_tokens,
            COALESCE(SUM(estimated_cost_usd), 0) as total_cost_usd,
            COALESCE(SUM(input_tokens), 0) as input_tokens,
            COALESCE(SUM(cache_creation_input_tokens), 0) as cache_creation,
            COALESCE(SUM(cache_read_input_tokens), 0) as cache_read,
            COUNT(*) as session_count
     FROM session_costs ${whereClause}`,
    params,
  )

  const byModelRes = await pool.query(
    `SELECT model, SUM(total_tokens) as tokens, SUM(estimated_cost_usd) as cost_usd
     FROM session_costs ${whereClause}
     GROUP BY model ORDER BY cost_usd DESC`,
    params,
  )

  const row = totalsRes.rows[0]
  const inputSum = Number(row.input_tokens) || 0
  const cacheReadSum = Number(row.cache_read) || 0
  const cacheCreationSum = Number(row.cache_creation) || 0
  const cacheableTotal = inputSum + cacheReadSum + cacheCreationSum
  const cacheHitRate = cacheableTotal > 0 ? cacheReadSum / cacheableTotal : 0

  return {
    agent_id: agentId,
    total_tokens: Number(row.total_tokens),
    total_cost_usd: Number(row.total_cost_usd),
    session_count: Number(row.session_count),
    cache_hit_rate: cacheHitRate,
    by_model: byModelRes.rows.map((r) => ({
      model: r.model,
      tokens: Number(r.tokens),
      cost_usd: Number(r.cost_usd),
    })),
  }
}

/** Get full cost dashboard metrics */
export async function getCostDashboard(since?: Date): Promise<CostDashboardMetrics> {
  const params: unknown[] = []
  let whereClause = ''
  if (since) {
    whereClause = 'WHERE created_at >= $1'
    params.push(since.toISOString())
  }

  // Totals — include cached token sums so we can compute cache hit rate
  // (cache_read / (input + cache_read + cache_creation)). When all sums are
  // zero (older data, adapters without caching), the rate is 0.
  const totalsRes = await pool.query(
    `SELECT COALESCE(SUM(total_tokens), 0) as total_tokens,
            COALESCE(SUM(estimated_cost_usd), 0) as total_cost_usd,
            COALESCE(SUM(input_tokens), 0) as input_tokens,
            COALESCE(SUM(cache_creation_input_tokens), 0) as cache_creation,
            COALESCE(SUM(cache_read_input_tokens), 0) as cache_read,
            COUNT(*) as session_count
     FROM session_costs ${whereClause}`,
    params,
  )

  // By model
  const byModelRes = await pool.query(
    `SELECT model, SUM(total_tokens) as tokens, SUM(estimated_cost_usd) as cost_usd
     FROM session_costs ${whereClause}
     GROUP BY model ORDER BY cost_usd DESC`,
    params,
  )

  // By agent
  const byAgentRes = await pool.query(
    `SELECT agent_id, SUM(total_tokens) as total_tokens, SUM(estimated_cost_usd) as total_cost_usd, COUNT(*) as session_count
     FROM session_costs ${whereClause}
     GROUP BY agent_id ORDER BY total_cost_usd DESC`,
    params,
  )

  // By agent + model (for by_model breakdown per agent)
  const byAgentModelRes = await pool.query(
    `SELECT agent_id, model, SUM(total_tokens) as tokens, SUM(estimated_cost_usd) as cost_usd
     FROM session_costs ${whereClause}
     GROUP BY agent_id, model ORDER BY agent_id, cost_usd DESC`,
    params,
  )

  // Daily trend
  const dailyRes = await pool.query(
    `SELECT DATE(created_at) as date, SUM(total_tokens) as tokens, SUM(estimated_cost_usd) as cost_usd
     FROM session_costs ${whereClause}
     GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30`,
    params,
  )

  const row = totalsRes.rows[0]

  // Build agent model map
  const agentModelMap = new Map<string, { model: string; tokens: number; cost_usd: number }[]>()
  for (const r of byAgentModelRes.rows) {
    if (!agentModelMap.has(r.agent_id)) agentModelMap.set(r.agent_id, [])
    agentModelMap.get(r.agent_id)!.push({
      model: r.model,
      tokens: Number(r.tokens),
      cost_usd: Number(r.cost_usd),
    })
  }

  const inputSum = Number(row.input_tokens) || 0
  const cacheReadSum = Number(row.cache_read) || 0
  const cacheCreationSum = Number(row.cache_creation) || 0
  const cacheableTotal = inputSum + cacheReadSum + cacheCreationSum
  const cacheHitRate = cacheableTotal > 0 ? cacheReadSum / cacheableTotal : 0

  return {
    totals: {
      total_tokens: Number(row.total_tokens),
      total_cost_usd: Number(row.total_cost_usd),
      session_count: Number(row.session_count),
      cache_hit_rate: cacheHitRate,
    },
    by_model: byModelRes.rows.map((r) => ({
      model: r.model,
      tokens: Number(r.tokens),
      cost_usd: Number(r.cost_usd),
    })),
    by_agent: byAgentRes.rows.map((r) => ({
      agent_id: r.agent_id,
      total_tokens: Number(r.total_tokens),
      total_cost_usd: Number(r.total_cost_usd),
      session_count: Number(r.session_count),
      by_model: agentModelMap.get(r.agent_id) || [],
    })),
    daily_trend: dailyRes.rows.map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
      tokens: Number(r.tokens),
      cost_usd: Number(r.cost_usd),
    })),
  }
}

/** Get the most recent session_updated_at across all records */
export async function getLatestSessionUpdatedAt(): Promise<number> {
  const res = await pool.query('SELECT MAX(session_updated_at) as latest FROM session_costs')
  return Number(res.rows[0]?.latest) || 0
}
