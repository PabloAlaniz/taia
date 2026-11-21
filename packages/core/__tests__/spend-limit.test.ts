import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@taia/core/rate-limit', async () => {
  const { memoryStore } = await import('omnilimit')
  const store = memoryStore()
  return { rateLimitStore: () => store }
})

import {
  resetSpendLimiters,
  SpendLimitError,
  spendLimitMode,
  spendPolicy,
  withSpendLimit,
} from '@taia/core/spend-limit'

let warn: ReturnType<typeof vi.spyOn>
let n = 0
const id = () => `agent-${++n}`

beforeEach(() => {
  process.env.TAIA_AGENT_RUN_LIMIT = '2/hour'
  resetSpendLimiters()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  delete process.env.TAIA_AGENT_RUN_LIMIT
  warn.mockRestore()
})

describe('spendLimitMode and spendPolicy', () => {
  it('defaults to shadow and reads enforce and off', () => {
    expect(spendLimitMode({})).toBe('shadow')
    expect(spendLimitMode({ TAIA_SPEND_LIMITS: 'ENFORCE' })).toBe('enforce')
    expect(spendLimitMode({ TAIA_SPEND_LIMITS: 'off' })).toBe('off')
  })

  it('reads each limit from its variable and falls back to the default on a bad value', () => {
    expect(spendPolicy('planning', { TAIA_PLANNING_LIMIT: '5/minute' })).toEqual({
      limit: 5,
      windowMs: 60_000,
    })
    expect(spendPolicy('planning', {})).toEqual({ limit: 30, windowMs: 3_600_000 })
    expect(spendPolicy('planning', { TAIA_PLANNING_LIMIT: 'lots' })).toEqual({
      limit: 30,
      windowMs: 3_600_000,
    })
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('withSpendLimit', () => {
  it('enforce: refuses with SpendLimitError (429) once the limit is spent, without running the work', async () => {
    const agent = id()
    const work = vi.fn(async () => 'ran')
    await withSpendLimit('agent-run', agent, work, 'enforce')
    await withSpendLimit('agent-run', agent, work, 'enforce')

    const refused = withSpendLimit('agent-run', agent, work, 'enforce')

    await expect(refused).rejects.toBeInstanceOf(SpendLimitError)
    await expect(refused).rejects.toMatchObject({
      statusCode: 429,
      code: 'SPEND_LIMIT_REACHED',
      limit: 'agent-run',
    })
    expect(work).toHaveBeenCalledTimes(2)
  })

  it('counts each agent on its own', async () => {
    const [a, b] = [id(), id()]
    const work = async () => 'ran'
    await withSpendLimit('agent-run', a, work, 'enforce')
    await withSpendLimit('agent-run', a, work, 'enforce')

    await expect(withSpendLimit('agent-run', b, work, 'enforce')).resolves.toBe('ran')
  })

  it('shadow: runs everything and logs what enforce would refuse', async () => {
    const agent = id()
    const work = vi.fn(async () => 'ran')
    for (let i = 0; i < 3; i++) await withSpendLimit('agent-run', agent, work, 'shadow')

    expect(work).toHaveBeenCalledTimes(3)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('spend.agent-run is over its limit'))
  })

  it('gives the unit back when the work fails', async () => {
    const agent = id()
    const fail = async () => {
      throw new Error('runtime down')
    }
    for (let i = 0; i < 3; i++) {
      await expect(withSpendLimit('agent-run', agent, fail, 'enforce')).rejects.toThrow(
        'runtime down',
      )
    }

    await expect(withSpendLimit('agent-run', agent, async () => 'ran', 'enforce')).resolves.toBe(
      'ran',
    )
  })

  it('off: just runs the work', async () => {
    await expect(withSpendLimit('agent-run', id(), async () => 'ran', 'off')).resolves.toBe('ran')
  })
})
