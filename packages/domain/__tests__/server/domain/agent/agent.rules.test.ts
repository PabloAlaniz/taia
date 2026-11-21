import { describe, it, expect } from 'vitest'
import {
  computeAgentStatuses,
  resolveAgentStatus,
  sortAgents,
  extractMentions,
} from '@taia/domain/domain/agent/agent.rules'
import type { Task } from '@taia/types'

const makeTask = (overrides: Partial<Task>): Task =>
  ({
    id: 'task-1',
    title: 'Test',
    status: 'INBOX',
    priority: 'MEDIUM',
    confidence: 'needs-approval',
    created_at: '',
    updated_at: '',
    tags: [],
    ...overrides,
  }) as Task

describe('computeAgentStatuses', () => {
  it('marks agents as WORKING for ASSIGNED/IN_PROGRESS tasks', () => {
    const tasks = [
      makeTask({ assigned_to: 'agent-a', status: 'ASSIGNED' }),
      makeTask({ assigned_to: 'agent-b', status: 'IN_PROGRESS' }),
    ]

    const result = computeAgentStatuses(tasks)
    expect(result.working.has('agent-a')).toBe(true)
    expect(result.working.has('agent-b')).toBe(true)
  })

  it('marks agents as BLOCKED for tasks with blocked tag', () => {
    const tasks = [makeTask({ assigned_to: 'agent-a', status: 'REVIEW', tags: ['blocked'] })]

    const result = computeAgentStatuses(tasks)
    expect(result.blocked.has('agent-a')).toBe(true)
  })

  it('ignores tasks without assigned_to', () => {
    const tasks = [makeTask({ status: 'IN_PROGRESS' })]
    const result = computeAgentStatuses(tasks)
    expect(result.working.size).toBe(0)
  })
})

describe('resolveAgentStatus', () => {
  it('returns WORKING when agent is in working set', () => {
    const statuses = { working: new Set(['agent-a']), blocked: new Set<string>() }
    expect(resolveAgentStatus('agent-a', statuses)).toBe('WORKING')
  })

  it('returns BLOCKED when agent is in blocked set', () => {
    const statuses = { working: new Set<string>(), blocked: new Set(['agent-a']) }
    expect(resolveAgentStatus('agent-a', statuses)).toBe('BLOCKED')
  })

  it('returns IDLE for unknown agents', () => {
    const statuses = { working: new Set<string>(), blocked: new Set<string>() }
    expect(resolveAgentStatus('agent-a', statuses)).toBe('IDLE')
  })
})

describe('sortAgents', () => {
  it('puts orchestrators first, then alphabetical', () => {
    const agents = [
      { type: 'cron', name: 'Zeta' },
      { type: 'orchestrator', name: 'Orch' },
      { type: 'cron', name: 'Alpha' },
    ]

    const sorted = sortAgents(agents)
    expect(sorted[0].name).toBe('Orch')
    expect(sorted[1].name).toBe('Alpha')
    expect(sorted[2].name).toBe('Zeta')
  })

  it('does not mutate the original array', () => {
    const agents = [
      { type: 'cron', name: 'B' },
      { type: 'cron', name: 'A' },
    ]
    const sorted = sortAgents(agents)
    expect(sorted).not.toBe(agents)
  })
})

describe('extractMentions', () => {
  it('extracts @mentions from content', () => {
    expect(extractMentions('Hey @alice and @bob!')).toEqual(['alice', 'bob'])
  })

  it('returns empty array when no mentions', () => {
    expect(extractMentions('No mentions here')).toEqual([])
  })

  it('lowercases mentions', () => {
    expect(extractMentions('@Alice')).toEqual(['alice'])
  })
})
