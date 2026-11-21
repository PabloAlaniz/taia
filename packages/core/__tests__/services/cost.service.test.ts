import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks (must be declared before vi.mock calls) ---

const mockListSessions = vi.fn()

vi.mock('@taia/core/runtime', () => {
  const adapter = () =>
    Promise.resolve({
      id: 'openclaw',
      capabilities: { has: () => true, list: () => [] },
      listSessions: mockListSessions,
    })
  return {
    // One instance; the fan-out contract is covered in runtime.test.ts.
    forEachRuntime: async (fn: (a: unknown, id: string) => Promise<unknown>) => ({
      results: [{ instanceId: 'gw', value: await fn(await adapter(), 'gw') }],
      failures: [],
    }),
    getRuntimeAdapterForAgent: vi.fn(adapter),
  }
})

const mockUpsertSessionCost = vi.fn()
const mockGetTaskCost = vi.fn()
const mockGetTaskSessionCosts = vi.fn()
const mockGetAgentCostSummary = vi.fn()
const mockGetCostDashboard = vi.fn()

vi.mock('@taia/core/db', () => ({
  upsertSessionCost: (...args: any[]) => mockUpsertSessionCost(...args),
  getTaskCost: (...args: any[]) => mockGetTaskCost(...args),
  getTaskSessionCosts: (...args: any[]) => mockGetTaskSessionCosts(...args),
  getAgentCostSummary: (...args: any[]) => mockGetAgentCostSummary(...args),
  getCostDashboard: (...args: any[]) => mockGetCostDashboard(...args),
}))

import {
  getModelPricing,
  calculateCost,
  formatCost,
  formatTokens,
  syncAllCosts,
  getTaskCostBreakdown,
  getDashboardMetrics,
  syncAgentCosts,
  getAgentCostSummary,
} from '@taia/core/services/cost.service'

beforeEach(() => {
  vi.clearAllMocks()
})

// ===================================================================
// Pure functions — no mocks needed
// ===================================================================

describe('getModelPricing', () => {
  it('returns exact match for claude-opus-4', () => {
    const pricing = getModelPricing('claude-opus-4')
    expect(pricing.model).toBe('claude-opus-4')
    expect(pricing.inputPer1M).toBe(15)
    expect(pricing.outputPer1M).toBe(75)
    expect(pricing.blendedPer1M).toBe(30)
  })

  it('returns exact match for claude-sonnet-4', () => {
    const pricing = getModelPricing('claude-sonnet-4')
    expect(pricing.model).toBe('claude-sonnet-4')
    expect(pricing.inputPer1M).toBe(3)
    expect(pricing.outputPer1M).toBe(15)
    expect(pricing.blendedPer1M).toBe(6)
  })

  it('returns exact match for claude-3-5-haiku', () => {
    const pricing = getModelPricing('claude-3-5-haiku')
    expect(pricing.model).toBe('claude-3-5-haiku')
    expect(pricing.inputPer1M).toBe(0.8)
    expect(pricing.outputPer1M).toBe(4)
    expect(pricing.blendedPer1M).toBe(1.6)
  })

  it('fuzzy matches model variant with date suffix', () => {
    const pricing = getModelPricing('claude-opus-4-20250514')
    expect(pricing.blendedPer1M).toBe(30)
    expect(pricing.model).toBe('claude-opus-4')
  })

  it('fuzzy matches claude-sonnet-4 with extra suffix', () => {
    const pricing = getModelPricing('claude-sonnet-4-20260101-v2')
    expect(pricing.blendedPer1M).toBe(6)
    expect(pricing.model).toBe('claude-sonnet-4')
  })

  it('handles case-insensitive input', () => {
    const pricing = getModelPricing('Claude-Opus-4')
    expect(pricing.blendedPer1M).toBe(30)
  })

  it('trims whitespace from input', () => {
    const pricing = getModelPricing('  claude-sonnet-4  ')
    expect(pricing.blendedPer1M).toBe(6)
  })

  it('returns default pricing for unknown model', () => {
    const pricing = getModelPricing('gpt-4-turbo')
    expect(pricing.model).toBe('unknown')
    expect(pricing.inputPer1M).toBe(3)
    expect(pricing.outputPer1M).toBe(15)
    expect(pricing.blendedPer1M).toBe(6)
  })

  it('returns default pricing for empty string', () => {
    const pricing = getModelPricing('')
    expect(pricing.model).toBe('unknown')
  })

  it('returns exact match for claude-opus-5-5', () => {
    const pricing = getModelPricing('claude-opus-5-5')
    expect(pricing.model).toBe('claude-opus-5-5')
    expect(pricing.inputPer1M).toBe(4)
    expect(pricing.outputPer1M).toBe(20)
    expect(pricing.cacheReadPer1M).toBe(0.2)
  })

  it('does not resolve claude-opus-5-5 to claude-opus-5', () => {
    expect(getModelPricing('claude-opus-5-5').model).toBe('claude-opus-5-5')
    expect(getModelPricing('claude-opus-5').model).toBe('claude-opus-5')
  })

  it('returns exact match for claude-sonnet-5-5 and claude-haiku-5-5', () => {
    expect(getModelPricing('claude-sonnet-5-5')).toMatchObject({ inputPer1M: 2, outputPer1M: 10 })
    expect(getModelPricing('claude-haiku-5-5')).toMatchObject({ inputPer1M: 0.1, outputPer1M: 0.5 })
  })

  it('strips provider prefixes via fuzzy match', () => {
    expect(getModelPricing('anthropic/claude-opus-5-5').model).toBe('claude-opus-5-5')
  })

  it('returns exact match for claude-sonnet-4-5', () => {
    const pricing = getModelPricing('claude-sonnet-4-5')
    expect(pricing.model).toBe('claude-sonnet-4-5')
    expect(pricing.blendedPer1M).toBe(6)
  })

  it('returns exact match for claude-haiku-4', () => {
    const pricing = getModelPricing('claude-haiku-4')
    expect(pricing.model).toBe('claude-haiku-4')
    expect(pricing.blendedPer1M).toBe(1.6)
  })
})

describe('calculateCost', () => {
  it('uses blended rate when only totalTokens provided', () => {
    const cost = calculateCost(100_000, 'claude-sonnet-4')
    // (100000 * 6) / 1_000_000 = 0.6
    expect(cost).toBeCloseTo(0.6, 6)
  })

  it('uses blended rate for opus model', () => {
    const cost = calculateCost(100_000, 'claude-opus-4')
    // (100000 * 30) / 1_000_000 = 3.0
    expect(cost).toBeCloseTo(3.0, 6)
  })

  it('uses exact split when input + output tokens provided', () => {
    const cost = calculateCost(100_000, 'claude-opus-4', 50_000, 50_000)
    // (50000 * 15 + 50000 * 75) / 1_000_000 = (750000 + 3750000) / 1_000_000 = 4.5
    expect(cost).toBeCloseTo(4.5, 6)
  })

  it('uses exact split favoring input-heavy usage', () => {
    const cost = calculateCost(100_000, 'claude-opus-4', 90_000, 10_000)
    // (90000 * 15 + 10000 * 75) / 1_000_000 = (1350000 + 750000) / 1_000_000 = 2.1
    expect(cost).toBeCloseTo(2.1, 6)
  })

  it('uses exact split favoring output-heavy usage', () => {
    const cost = calculateCost(100_000, 'claude-opus-4', 10_000, 90_000)
    // (10000 * 15 + 90000 * 75) / 1_000_000 = (150000 + 6750000) / 1_000_000 = 6.9
    expect(cost).toBeCloseTo(6.9, 6)
  })

  it('returns 0 for zero total tokens with blended rate', () => {
    const cost = calculateCost(0, 'claude-opus-4')
    expect(cost).toBe(0)
  })

  it('returns 0 when input and output are both zero', () => {
    // When input + output = 0, should fall through to blended rate with totalTokens=0
    const cost = calculateCost(0, 'claude-opus-4', 0, 0)
    expect(cost).toBe(0)
  })

  it('uses blended rate when input/output are undefined', () => {
    const cost = calculateCost(1_000_000, 'claude-3-5-haiku')
    // (1_000_000 * 1.60) / 1_000_000 = 1.60
    expect(cost).toBeCloseTo(1.6, 6)
  })

  it('uses blended rate when only inputTokens is provided (outputTokens undefined)', () => {
    const cost = calculateCost(100_000, 'claude-sonnet-4', 50_000)
    // outputTokens is undefined → blended rate
    // (100000 * 6) / 1_000_000 = 0.6
    expect(cost).toBeCloseTo(0.6, 6)
  })

  it('handles unknown model with default pricing', () => {
    const cost = calculateCost(1_000_000, 'unknown-model')
    // default blended = 6 → (1_000_000 * 6) / 1_000_000 = 6.0
    expect(cost).toBeCloseTo(6.0, 6)
  })

  // --- prompt caching pricing ---

  it('applies cache write multiplier (1.25×) to cache_creation_input_tokens', () => {
    // claude-opus-4-7: input $5/M. 1M cache-creation tokens = 5 × 1.25 = $6.25
    const cost = calculateCost(1_000_000, 'claude-opus-4-7', 0, 0, 1_000_000, 0)
    expect(cost).toBeCloseTo(6.25, 4)
  })

  it('applies cache read multiplier (0.1×) to cache_read_input_tokens', () => {
    // claude-opus-4-7: input $5/M. 1M cache-read tokens = 5 × 0.1 = $0.50
    const cost = calculateCost(1_000_000, 'claude-opus-4-7', 0, 0, 0, 1_000_000)
    expect(cost).toBeCloseTo(0.5, 4)
  })

  it('combines uncached input + cache write + cache read + output correctly', () => {
    // claude-opus-4-7: input $5/M, output $25/M
    // 100K standard input    →  100000 × 5  = 500000
    // 200K cache-write       →  200000 × 5 × 1.25 = 1250000
    // 500K cache-read        →  500000 × 5 × 0.1  = 250000
    // 50K output             →  50000 × 25 = 1250000
    // total = 3,250,000 / 1M = $3.25
    const cost = calculateCost(850_000, 'claude-opus-4-7', 100_000, 50_000, 200_000, 500_000)
    expect(cost).toBeCloseTo(3.25, 4)
  })

  it('treats undefined cache fields as zero (backwards compatible)', () => {
    // 100K input, 50K output on opus-4-7 with no cache fields
    // 100000 × 5 + 50000 × 25 = 500000 + 1250000 = 1750000 / 1M = $1.75
    const noCache = calculateCost(150_000, 'claude-opus-4-7', 100_000, 50_000)
    const explicitZero = calculateCost(150_000, 'claude-opus-4-7', 100_000, 50_000, 0, 0)
    expect(noCache).toBeCloseTo(1.75, 4)
    expect(explicitZero).toBeCloseTo(noCache, 6)
  })

  it('uses the model-specific cache read rate when the registry overrides it', () => {
    // claude-opus-5-5: cache reads $0.20/M (0.05× input). 1M cache-read tokens = $0.20
    const cost = calculateCost(1_000_000, 'claude-opus-5-5', 0, 0, 0, 1_000_000)
    expect(cost).toBeCloseTo(0.2, 4)
  })

  it('falls back to blended rate when input/output are not provided (cache fields ignored)', () => {
    // No input/output split → blended path, ignoring cache args
    const cost = calculateCost(1_000_000, 'claude-opus-4-7', undefined, undefined, 500_000, 100_000)
    expect(cost).toBeCloseTo(10.0, 4) // opus-4-7 blended = 10
  })
})

describe('formatCost', () => {
  it('formats sub-cent values with 4 decimal places', () => {
    expect(formatCost(0.001)).toBe('$0.0010')
  })

  it('formats very small values with 4 decimals', () => {
    expect(formatCost(0.0001)).toBe('$0.0001')
  })

  it('formats sub-dollar values with 3 decimal places', () => {
    expect(formatCost(0.45)).toBe('$0.450')
  })

  it('formats 0.999 with 3 decimal places', () => {
    expect(formatCost(0.999)).toBe('$0.999')
  })

  it('formats dollar values with 2 decimal places', () => {
    expect(formatCost(12.5)).toBe('$12.50')
  })

  it('formats exactly $1.00', () => {
    expect(formatCost(1.0)).toBe('$1.00')
  })

  it('formats zero', () => {
    expect(formatCost(0)).toBe('$0.0000')
  })

  it('formats large values', () => {
    expect(formatCost(1234.567)).toBe('$1234.57')
  })

  it('formats boundary value 0.01 with 3 decimals', () => {
    expect(formatCost(0.01)).toBe('$0.010')
  })
})

describe('formatTokens', () => {
  it('formats millions', () => {
    expect(formatTokens(1_500_000)).toBe('1.5M')
  })

  it('formats exactly 1M', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M')
  })

  it('formats thousands', () => {
    expect(formatTokens(45_000)).toBe('45.0K')
  })

  it('formats exactly 1K', () => {
    expect(formatTokens(1_000)).toBe('1.0K')
  })

  it('formats small numbers as-is', () => {
    expect(formatTokens(500)).toBe('500')
  })

  it('formats zero', () => {
    expect(formatTokens(0)).toBe('0')
  })

  it('formats 999 without suffix', () => {
    expect(formatTokens(999)).toBe('999')
  })

  it('formats large millions', () => {
    expect(formatTokens(12_345_678)).toBe('12.3M')
  })
})

// ===================================================================
// Async functions — mocked dependencies
// ===================================================================

describe('syncAllCosts', () => {
  it('syncs sessions that have tokens and skips zero-token sessions', async () => {
    mockListSessions.mockResolvedValue([
      {
        key: 'agent-1/session-abc',
        channel: 'agent-1',
        model: 'claude-sonnet-4',
        totalTokens: 50_000,
        inputTokens: 30_000,
        outputTokens: 20_000,
        updatedAt: 1700000000,
      },
      {
        key: 'agent-2/session-def',
        channel: 'agent-2',
        model: 'claude-opus-4',
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        updatedAt: 1700000001,
      },
      {
        key: 'agent-3/session-ghi',
        channel: 'agent-3',
        model: 'claude-3-5-haiku',
        totalTokens: 10_000,
        inputTokens: 0,
        outputTokens: 0,
        updatedAt: 1700000002,
      },
    ])
    mockUpsertSessionCost.mockResolvedValue(undefined)

    const result = await syncAllCosts()

    expect(result.synced).toBe(2)
    expect(result.errors).toBe(0)
    // Verify the zero-token session was skipped
    expect(mockUpsertSessionCost).toHaveBeenCalledTimes(2)
  })

  it('passes correct cost data to upsertSessionCost', async () => {
    mockListSessions.mockResolvedValue([
      {
        key: 'agent-2/sess-1',
        channel: 'agent-2',
        model: 'claude-opus-4',
        totalTokens: 100_000,
        inputTokens: 60_000,
        outputTokens: 40_000,
        updatedAt: 1700000000,
      },
    ])
    mockUpsertSessionCost.mockResolvedValue(undefined)

    await syncAllCosts()

    expect(mockUpsertSessionCost).toHaveBeenCalledWith({
      session_key: 'agent-2/sess-1',
      agent_id: 'agent-2',
      model: 'claude-opus-4',
      input_tokens: 60_000,
      output_tokens: 40_000,
      total_tokens: 100_000,
      // Cache columns are part of the contract; default to 0 for
      // adapters that don't report them.
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      estimated_cost_usd: (60_000 * 15 + 40_000 * 75) / 1_000_000, // 3.9
      session_updated_at: 1700000000,
    })
  })

  it('derives agentId from session key when channel is missing', async () => {
    mockListSessions.mockResolvedValue([
      {
        key: 'agent-5/session-xyz',
        channel: undefined,
        model: 'claude-sonnet-4',
        totalTokens: 5_000,
        inputTokens: 3_000,
        outputTokens: 2_000,
        updatedAt: 1700000000,
      },
    ])
    mockUpsertSessionCost.mockResolvedValue(undefined)

    await syncAllCosts()

    expect(mockUpsertSessionCost).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: 'agent-5' }),
    )
  })

  it('uses default model "unknown" when session.model is missing', async () => {
    mockListSessions.mockResolvedValue([
      {
        key: 'agent-x/sess',
        channel: 'agent-x',
        model: undefined,
        totalTokens: 10_000,
        inputTokens: undefined,
        outputTokens: undefined,
        updatedAt: 1700000000,
      },
    ])
    mockUpsertSessionCost.mockResolvedValue(undefined)

    await syncAllCosts()

    expect(mockUpsertSessionCost).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'unknown',
        input_tokens: 0,
        output_tokens: 0,
      }),
    )
  })

  it('counts errors when upsert fails', async () => {
    mockListSessions.mockResolvedValue([
      {
        key: 'agent-1/sess-1',
        channel: 'agent-1',
        model: 'claude-sonnet-4',
        totalTokens: 10_000,
        inputTokens: 5_000,
        outputTokens: 5_000,
        updatedAt: 1700000000,
      },
      {
        key: 'agent-2/sess-2',
        channel: 'agent-2',
        model: 'claude-opus-4',
        totalTokens: 20_000,
        inputTokens: 10_000,
        outputTokens: 10_000,
        updatedAt: 1700000001,
      },
    ])
    mockUpsertSessionCost
      .mockRejectedValueOnce(new Error('DB connection lost'))
      .mockResolvedValueOnce(undefined)

    const result = await syncAllCosts()

    expect(result.synced).toBe(1)
    expect(result.errors).toBe(1)
  })

  it('returns zeros when no sessions exist', async () => {
    mockListSessions.mockResolvedValue([])

    const result = await syncAllCosts()

    expect(result).toEqual({ synced: 0, errors: 0 })
    expect(mockUpsertSessionCost).not.toHaveBeenCalled()
  })

  it('skips sessions with null totalTokens', async () => {
    mockListSessions.mockResolvedValue([
      {
        key: 'agent-1/sess-1',
        channel: 'agent-1',
        model: 'claude-sonnet-4',
        totalTokens: null,
        inputTokens: 0,
        outputTokens: 0,
        updatedAt: 1700000000,
      },
    ])

    const result = await syncAllCosts()

    expect(result.synced).toBe(0)
    expect(mockUpsertSessionCost).not.toHaveBeenCalled()
  })
})

describe('syncAgentCosts', () => {
  it('only syncs sessions belonging to the specified agent', async () => {
    mockListSessions.mockResolvedValue([
      {
        key: 'agent-1/sess-1',
        channel: 'agent-1',
        model: 'claude-sonnet-4',
        totalTokens: 10_000,
        inputTokens: 5_000,
        outputTokens: 5_000,
        updatedAt: 1700000000,
      },
      {
        key: 'agent-5/sess-2',
        channel: 'agent-5',
        model: 'claude-opus-4',
        totalTokens: 20_000,
        inputTokens: 10_000,
        outputTokens: 10_000,
        updatedAt: 1700000001,
      },
      {
        key: 'agent-1/sess-3',
        channel: 'agent-1',
        model: 'claude-sonnet-4',
        totalTokens: 5_000,
        inputTokens: 3_000,
        outputTokens: 2_000,
        updatedAt: 1700000002,
      },
    ])
    mockUpsertSessionCost.mockResolvedValue(undefined)

    const result = await syncAgentCosts('agent-1')

    expect(result.synced).toBe(2)
    expect(result.errors).toBe(0)
    expect(mockUpsertSessionCost).toHaveBeenCalledTimes(2)
    // Both calls should have agent_id = 'agent-1'
    expect(mockUpsertSessionCost).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: 'agent-1', session_key: 'agent-1/sess-1' }),
    )
    expect(mockUpsertSessionCost).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: 'agent-1', session_key: 'agent-1/sess-3' }),
    )
  })

  it('matches sessions by key prefix when channel differs', async () => {
    mockListSessions.mockResolvedValue([
      {
        key: 'agent-1/some-session',
        channel: 'different-channel',
        model: 'claude-sonnet-4',
        totalTokens: 8_000,
        inputTokens: 4_000,
        outputTokens: 4_000,
        updatedAt: 1700000000,
      },
    ])
    mockUpsertSessionCost.mockResolvedValue(undefined)

    const result = await syncAgentCosts('agent-1')

    expect(result.synced).toBe(1)
  })
})

describe('getTaskCostBreakdown', () => {
  it('returns combined task cost and session list', async () => {
    const summary = {
      total_tokens: 150_000,
      total_cost_usd: 4.5,
      session_count: 3,
    }
    const sessions = [
      {
        id: 'sc-1',
        session_key: 'agent-1/sess-1',
        agent_id: 'agent-1',
        task_id: 'task-42',
        model: 'claude-opus-4',
        input_tokens: 30_000,
        output_tokens: 20_000,
        total_tokens: 50_000,
        estimated_cost_usd: 1.5,
        session_updated_at: 1700000000,
        created_at: '2025-11-01T00:00:00Z',
        updated_at: '2025-11-01T00:00:00Z',
      },
      {
        id: 'sc-2',
        session_key: 'agent-1/sess-2',
        agent_id: 'agent-1',
        task_id: 'task-42',
        model: 'claude-sonnet-4',
        input_tokens: 60_000,
        output_tokens: 40_000,
        total_tokens: 100_000,
        estimated_cost_usd: 3.0,
        session_updated_at: 1700000001,
        created_at: '2025-11-02T00:00:00Z',
        updated_at: '2025-11-02T00:00:00Z',
      },
    ]

    mockGetTaskCost.mockResolvedValue(summary)
    mockGetTaskSessionCosts.mockResolvedValue(sessions)

    const result = await getTaskCostBreakdown('task-42')

    expect(result.task_id).toBe('task-42')
    expect(result.total_tokens).toBe(150_000)
    expect(result.total_cost_usd).toBe(4.5)
    expect(result.session_count).toBe(3)
    expect(result.sessions).toHaveLength(2)
    expect(result.sessions[0].session_key).toBe('agent-1/sess-1')
    expect(result.sessions[1].session_key).toBe('agent-1/sess-2')
  })

  it('calls both db functions with the correct taskId', async () => {
    mockGetTaskCost.mockResolvedValue({ total_tokens: 0, total_cost_usd: 0, session_count: 0 })
    mockGetTaskSessionCosts.mockResolvedValue([])

    await getTaskCostBreakdown('task-99')

    expect(mockGetTaskCost).toHaveBeenCalledWith('task-99')
    expect(mockGetTaskSessionCosts).toHaveBeenCalledWith('task-99')
  })

  it('returns empty sessions for a task with no costs', async () => {
    mockGetTaskCost.mockResolvedValue({ total_tokens: 0, total_cost_usd: 0, session_count: 0 })
    mockGetTaskSessionCosts.mockResolvedValue([])

    const result = await getTaskCostBreakdown('task-empty')

    expect(result.task_id).toBe('task-empty')
    expect(result.total_tokens).toBe(0)
    expect(result.total_cost_usd).toBe(0)
    expect(result.sessions).toEqual([])
  })
})

describe('getDashboardMetrics', () => {
  const mockDashboardData: any = {
    totals: { total_tokens: 500_000, total_cost_usd: 15.0, session_count: 10 },
    by_model: [{ model: 'claude-sonnet-4', tokens: 500_000, cost_usd: 15.0 }],
    by_agent: [],
    daily_trend: [],
  }

  it('passes undefined for no period', async () => {
    mockGetCostDashboard.mockResolvedValue(mockDashboardData)

    const result = await getDashboardMetrics()

    expect(mockGetCostDashboard).toHaveBeenCalledWith(undefined)
    expect(result).toBe(mockDashboardData)
  })

  it('calculates correct date for 24h period', async () => {
    mockGetCostDashboard.mockResolvedValue(mockDashboardData)

    const before = Date.now()
    await getDashboardMetrics('24h')
    const after = Date.now()

    const calledWith = mockGetCostDashboard.mock.calls[0][0] as Date
    expect(calledWith).toBeInstanceOf(Date)
    // The "since" should be ~24h ago
    const expectedApprox = before - 24 * 60 * 60 * 1000
    expect(calledWith.getTime()).toBeGreaterThanOrEqual(expectedApprox - 100)
    expect(calledWith.getTime()).toBeLessThanOrEqual(after - 24 * 60 * 60 * 1000 + 100)
  })

  it('calculates correct date for week period', async () => {
    mockGetCostDashboard.mockResolvedValue(mockDashboardData)

    const before = Date.now()
    await getDashboardMetrics('week')

    const calledWith = mockGetCostDashboard.mock.calls[0][0] as Date
    expect(calledWith).toBeInstanceOf(Date)
    const expectedApprox = before - 7 * 24 * 60 * 60 * 1000
    expect(calledWith.getTime()).toBeGreaterThanOrEqual(expectedApprox - 100)
    expect(calledWith.getTime()).toBeLessThanOrEqual(expectedApprox + 100)
  })

  it('calculates correct date for month period', async () => {
    mockGetCostDashboard.mockResolvedValue(mockDashboardData)

    const before = Date.now()
    await getDashboardMetrics('month')

    const calledWith = mockGetCostDashboard.mock.calls[0][0] as Date
    expect(calledWith).toBeInstanceOf(Date)
    const expectedApprox = before - 30 * 24 * 60 * 60 * 1000
    expect(calledWith.getTime()).toBeGreaterThanOrEqual(expectedApprox - 100)
    expect(calledWith.getTime()).toBeLessThanOrEqual(expectedApprox + 100)
  })

  it('passes undefined for unrecognized period string', async () => {
    mockGetCostDashboard.mockResolvedValue(mockDashboardData)

    await getDashboardMetrics('year')

    expect(mockGetCostDashboard).toHaveBeenCalledWith(undefined)
  })
})

describe('getAgentCostSummary', () => {
  const mockAgentData: any = {
    agent_id: 'agent-1',
    total_tokens: 200_000,
    total_cost_usd: 6.0,
    session_count: 5,
    by_model: [{ model: 'claude-sonnet-4', tokens: 200_000, cost_usd: 6.0 }],
  }

  it('calls db function with agentId and no date when period is undefined', async () => {
    mockGetAgentCostSummary.mockResolvedValue(mockAgentData)

    const result = await getAgentCostSummary('agent-1')

    expect(mockGetAgentCostSummary).toHaveBeenCalledWith('agent-1', undefined)
    expect(result).toBe(mockAgentData)
  })

  it('passes correct date filter for 24h period', async () => {
    mockGetAgentCostSummary.mockResolvedValue(mockAgentData)

    const before = Date.now()
    await getAgentCostSummary('agent-1', '24h')

    const calledWith = mockGetAgentCostSummary.mock.calls[0][1] as Date
    expect(calledWith).toBeInstanceOf(Date)
    const expectedApprox = before - 24 * 60 * 60 * 1000
    expect(calledWith.getTime()).toBeGreaterThanOrEqual(expectedApprox - 100)
    expect(calledWith.getTime()).toBeLessThanOrEqual(expectedApprox + 100)
  })

  it('passes correct date filter for week period', async () => {
    mockGetAgentCostSummary.mockResolvedValue(mockAgentData)

    await getAgentCostSummary('agent-1', 'week')

    const calledWith = mockGetAgentCostSummary.mock.calls[0][1] as Date
    expect(calledWith).toBeInstanceOf(Date)
  })

  it('passes undefined for unrecognized period', async () => {
    mockGetAgentCostSummary.mockResolvedValue(mockAgentData)

    await getAgentCostSummary('agent-1', 'quarter')

    expect(mockGetAgentCostSummary).toHaveBeenCalledWith('agent-1', undefined)
  })
})
