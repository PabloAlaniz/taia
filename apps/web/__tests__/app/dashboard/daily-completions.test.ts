import { describe, it, expect } from 'vitest'
import { computeDailyCompletions, getAgentColor, AGENT_COLORS } from '@/lib/dashboard-utils'
import type { Task } from '@taia/types'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test task',
    status: 'DONE',
    priority: 'MEDIUM',
    confidence: 'notify-only',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    assigned_to: 'agent-a',
    ...overrides,
  }
}

describe('computeDailyCompletions', () => {
  it('returns 30 entries with total 0 when no tasks provided', () => {
    const result = computeDailyCompletions([])
    expect(result).toHaveLength(30)
    result.forEach((day) => {
      expect(day.total).toBe(0)
      expect(day.byAgent).toEqual([])
    })
  })

  it('returns the requested number of days', () => {
    const result = computeDailyCompletions([], 7)
    expect(result).toHaveLength(7)
  })

  it('counts tasks completed today', () => {
    const tasks = [
      makeTask({ id: '1', assigned_to: 'agent-a' }),
      makeTask({ id: '2', assigned_to: 'agent-a' }),
      makeTask({ id: '3', assigned_to: 'agent-b' }),
    ]

    const result = computeDailyCompletions(tasks)
    const today = result[result.length - 1]

    expect(today.total).toBe(3)
    expect(today.byAgent).toHaveLength(2)
  })

  it('breaks down by agent within each day', () => {
    const tasks = [
      makeTask({ id: '1', assigned_to: 'agent-a' }),
      makeTask({ id: '2', assigned_to: 'agent-a' }),
      makeTask({ id: '3', assigned_to: 'agent-b' }),
    ]

    const result = computeDailyCompletions(tasks)
    const today = result[result.length - 1]

    const agentA = today.byAgent.find((a) => a.agentId === 'agent-a')
    const agentB = today.byAgent.find((a) => a.agentId === 'agent-b')
    expect(agentA?.count).toBe(2)
    expect(agentB?.count).toBe(1)
  })

  it('sorts byAgent by count descending', () => {
    const tasks = [
      makeTask({ id: '1', assigned_to: 'agent-b' }),
      makeTask({ id: '2', assigned_to: 'agent-a' }),
      makeTask({ id: '3', assigned_to: 'agent-a' }),
      makeTask({ id: '4', assigned_to: 'agent-a' }),
    ]

    const result = computeDailyCompletions(tasks)
    const today = result[result.length - 1]

    expect(today.byAgent[0].agentId).toBe('agent-a')
    expect(today.byAgent[0].count).toBe(3)
    expect(today.byAgent[1].agentId).toBe('agent-b')
    expect(today.byAgent[1].count).toBe(1)
  })

  it('ignores tasks older than the requested days', () => {
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 31)

    const tasks = [makeTask({ id: '1', completed_at: oldDate.toISOString() })]

    const result = computeDailyCompletions(tasks)
    const totalAll = result.reduce((s, d) => s + d.total, 0)
    expect(totalAll).toBe(0)
  })

  it('only counts DONE tasks (not REJECTED or other statuses)', () => {
    const tasks = [
      makeTask({ id: '1', status: 'DONE' }),
      makeTask({ id: '2', status: 'REJECTED' }),
      makeTask({ id: '3', status: 'IN_PROGRESS' }),
      makeTask({ id: '4', status: 'REVIEW' }),
    ]

    const result = computeDailyCompletions(tasks)
    const totalAll = result.reduce((s, d) => s + d.total, 0)
    expect(totalAll).toBe(1)
  })

  it('uses "unassigned" for tasks without assigned_to', () => {
    const tasks = [makeTask({ id: '1', assigned_to: undefined })]

    const result = computeDailyCompletions(tasks)
    const today = result[result.length - 1]
    expect(today.byAgent[0].agentId).toBe('unassigned')
  })

  it('places tasks on the correct day', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const tasks = [makeTask({ id: '1', completed_at: yesterday.toISOString() })]

    const result = computeDailyCompletions(tasks)
    const todayEntry = result[result.length - 1]
    const yesterdayEntry = result[result.length - 2]

    expect(todayEntry.total).toBe(0)
    expect(yesterdayEntry.total).toBe(1)
  })

  it('dates are in YYYY-MM-DD format', () => {
    const result = computeDailyCompletions([])
    result.forEach((day) => {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })
})

describe('getAgentColor', () => {
  it('assigns colors consistently regardless of input order', () => {
    const ids1 = ['zeta', 'alpha', 'mango']
    const ids2 = ['mango', 'zeta', 'alpha']

    expect(getAgentColor('alpha', ids1)).toBe(getAgentColor('alpha', ids2))
    expect(getAgentColor('zeta', ids1)).toBe(getAgentColor('zeta', ids2))
    expect(getAgentColor('mango', ids1)).toBe(getAgentColor('mango', ids2))
  })

  it('returns a valid color from AGENT_COLORS', () => {
    const ids = ['a', 'b', 'c']
    ids.forEach((id) => {
      expect(AGENT_COLORS).toContain(getAgentColor(id, ids))
    })
  })

  it('wraps around when more agents than colors', () => {
    const ids = Array.from(
      { length: AGENT_COLORS.length + 2 },
      (_, i) => `agent-${String(i).padStart(2, '0')}`,
    )
    // Should not throw
    ids.forEach((id) => {
      const color = getAgentColor(id, ids)
      expect(AGENT_COLORS).toContain(color)
    })
  })

  it('alphabetical sorting determines index', () => {
    const ids = ['charlie', 'alpha', 'bravo']
    // sorted: alpha, bravo, charlie → indices 0, 1, 2
    expect(getAgentColor('alpha', ids)).toBe(AGENT_COLORS[0])
    expect(getAgentColor('bravo', ids)).toBe(AGENT_COLORS[1])
    expect(getAgentColor('charlie', ids)).toBe(AGENT_COLORS[2])
  })
})
