import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { applyFilterConfig, applyFilterConfigDirect, applyAllFilters } from '../../lib/filter-utils'
import type { Task, SavedFilter, SavedFilterConfig, BoardColumn } from '@taia/types'

// --- Factories ---

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Task',
    status: 'INBOX',
    priority: 'MEDIUM',
    confidence: 'notify-only',
    created_by: 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Task
}

function makeFilter(
  config: Partial<SavedFilter['filter_config']>,
  extra: Partial<SavedFilter> = {},
): SavedFilter {
  return {
    id: 'filter-test',
    name: 'Test Filter',
    filter_config: config,
    is_predefined: false,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...extra,
  } as SavedFilter
}

function makeColumn(overrides: Partial<BoardColumn> = {}): BoardColumn {
  return {
    id: 'col-1',
    slug: 'TODO',
    label: 'To Do',
    icon: '📋',
    position: 0,
    is_initial_state: false,
    is_done_state: false,
    ...overrides,
  } as BoardColumn
}

// --- Tests ---

describe('applyFilterConfig (SavedFilter wrapper)', () => {
  const columns: BoardColumn[] = []

  it('returns all tasks when no filter is provided', () => {
    const tasks = [makeTask(), makeTask(), makeTask()]
    expect(applyFilterConfig(tasks, undefined, columns)).toHaveLength(3)
  })

  describe('basic field filters', () => {
    it('filters by status', () => {
      const tasks = [
        makeTask({ id: 't1', status: 'INBOX' }),
        makeTask({ id: 't2', status: 'DOING' }),
        makeTask({ id: 't3', status: 'INBOX' }),
      ]
      const result = applyFilterConfig(tasks, makeFilter({ status: 'INBOX' }), columns)
      expect(result).toHaveLength(2)
      expect(result.every((t) => t.status === 'INBOX')).toBe(true)
    })

    it('filters by priority', () => {
      const tasks = [
        makeTask({ id: 't1', priority: 'HIGH' }),
        makeTask({ id: 't2', priority: 'LOW' }),
        makeTask({ id: 't3', priority: 'HIGH' }),
      ]
      const result = applyFilterConfig(tasks, makeFilter({ priority: 'HIGH' }), columns)
      expect(result).toHaveLength(2)
      expect(result.every((t) => t.priority === 'HIGH')).toBe(true)
    })

    it('filters by assigned_to (specific agent)', () => {
      const tasks = [
        makeTask({ id: 't1', assigned_to: 'agent-1' }),
        makeTask({ id: 't2', assigned_to: 'agent-2' }),
        makeTask({ id: 't3' }),
      ]
      const result = applyFilterConfig(tasks, makeFilter({ assigned_to: 'agent-1' }), columns)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('t1')
    })

    it('filters by project_id', () => {
      const tasks = [
        makeTask({ id: 't1', project_id: 'proj-a' }),
        makeTask({ id: 't2', project_id: 'proj-b' }),
        makeTask({ id: 't3' }),
      ]
      const result = applyFilterConfig(tasks, makeFilter({ project_id: 'proj-a' }), columns)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('t1')
    })
  })

  describe('assigned / unassigned filters', () => {
    const tasks = [
      makeTask({ id: 'assigned-1', assigned_to: 'agent-1' }),
      makeTask({ id: 'assigned-2', assigned_to: 'agent-2' }),
      makeTask({ id: 'unassigned-1' }),
    ]

    it('assigned: true → only tasks WITH an assigned agent', () => {
      const result = applyFilterConfig(tasks, makeFilter({ assigned: true }), columns)
      expect(result).toHaveLength(2)
      expect(result.every((t) => !!t.assigned_to)).toBe(true)
    })

    it('unassigned: true → only tasks WITHOUT an assigned agent', () => {
      const result = applyFilterConfig(tasks, makeFilter({ unassigned: true }), columns)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('unassigned-1')
    })

    it('assigned + priority → AND logic', () => {
      const tasksWithPriority = [
        makeTask({ id: 't1', assigned_to: 'agent-1', priority: 'HIGH' }),
        makeTask({ id: 't2', assigned_to: 'agent-2', priority: 'LOW' }),
        makeTask({ id: 't3', priority: 'HIGH' }),
      ]
      const result = applyFilterConfig(
        tasksWithPriority,
        makeFilter({ assigned: true, priority: 'HIGH' }),
        columns,
      )
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('t1')
    })
  })

  describe('text search (q)', () => {
    const tasks = [
      makeTask({ id: 't1', title: 'Fix login bug', description: 'Auth issue' }),
      makeTask({ id: 't2', title: 'Update docs', description: 'README update' }),
      makeTask({ id: 't3', title: 'Refactor UI', description: 'Login form redesign' }),
    ]

    it('searches in title (case-insensitive)', () => {
      const result = applyFilterConfig(tasks, makeFilter({ q: 'LOGIN' }), columns)
      expect(result).toHaveLength(2)
      expect(result.map((t) => t.id).sort()).toEqual(['t1', 't3'])
    })

    it('searches in description', () => {
      const result = applyFilterConfig(tasks, makeFilter({ q: 'auth' }), columns)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('t1')
    })

    it('empty q does not filter', () => {
      const result = applyFilterConfig(tasks, makeFilter({ q: '' }), columns)
      expect(result).toHaveLength(3)
    })
  })

  describe('tag filters', () => {
    const tasks = [
      makeTask({ id: 't1', tags: ['bug', 'urgent'] }),
      makeTask({ id: 't2', tags: ['feature'] }),
      makeTask({ id: 't3', tags: ['bug', 'docs'] }),
      makeTask({ id: 't4' }),
    ]

    it('filters tasks matching a single tag', () => {
      const result = applyFilterConfig(tasks, makeFilter({ tags: ['bug'] }), columns)
      expect(result).toHaveLength(2)
      expect(result.map((t) => t.id).sort()).toEqual(['t1', 't3'])
    })

    it('uses OR logic for multiple tags', () => {
      const result = applyFilterConfig(tasks, makeFilter({ tags: ['bug', 'feature'] }), columns)
      expect(result).toHaveLength(3)
    })

    it('empty tags array does not filter', () => {
      const result = applyFilterConfig(tasks, makeFilter({ tags: [] }), columns)
      expect(result).toHaveLength(4)
    })
  })

  describe('date filters', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('due: today → only tasks due today', () => {
      const tasks = [
        makeTask({ id: 'today', due_date: '2026-03-26T18:00:00Z' }),
        makeTask({ id: 'tomorrow', due_date: '2026-03-27T10:00:00Z' }),
        makeTask({ id: 'no-date' }),
      ]
      const result = applyFilterConfig(tasks, makeFilter({ due: 'today' }), columns)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('today')
    })

    it('due: overdue → past due tasks NOT in done state', () => {
      const boardCols = [
        makeColumn({ slug: 'INBOX', is_done_state: false }),
        makeColumn({ slug: 'DONE', is_done_state: true }),
      ]
      const tasks = [
        makeTask({ id: 'overdue-active', due_date: '2026-03-20T10:00:00Z', status: 'INBOX' }),
        makeTask({ id: 'overdue-done', due_date: '2026-03-20T10:00:00Z', status: 'DONE' }),
        makeTask({ id: 'future', due_date: '2026-04-01T10:00:00Z', status: 'INBOX' }),
      ]
      const result = applyFilterConfig(tasks, makeFilter({ due: 'overdue' }), boardCols)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('overdue-active')
    })

    it('due: this-week → tasks due before end of week', () => {
      // 2026-03-26 is Thursday. End of week (Sunday) = 2026-03-29
      const tasks = [
        makeTask({ id: 'this-week', due_date: '2026-03-28T10:00:00Z' }),
        makeTask({ id: 'next-week', due_date: '2026-04-02T10:00:00Z' }),
      ]
      const result = applyFilterConfig(tasks, makeFilter({ due: 'this-week' }), columns)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('this-week')
    })
  })

  describe('blockers filter', () => {
    it('has_blockers: true → only tasks with "blocked" tag', () => {
      const tasks = [
        makeTask({ id: 't1', tags: ['blocked'] }),
        makeTask({ id: 't2', tags: ['urgent'] }),
        makeTask({ id: 't3', tags: ['blocked', 'critical'] }),
      ]
      const result = applyFilterConfig(tasks, makeFilter({ has_blockers: true }), columns)
      expect(result).toHaveLength(2)
      expect(result.map((t) => t.id).sort()).toEqual(['t1', 't3'])
    })
  })

  describe('combined filters (AND logic)', () => {
    it('status + priority + assigned', () => {
      const tasks = [
        makeTask({ id: 'match', status: 'INBOX', priority: 'HIGH', assigned_to: 'a1' }),
        makeTask({ id: 'wrong-status', status: 'DONE', priority: 'HIGH', assigned_to: 'a1' }),
        makeTask({ id: 'wrong-priority', status: 'INBOX', priority: 'LOW', assigned_to: 'a1' }),
        makeTask({ id: 'not-assigned', status: 'INBOX', priority: 'HIGH' }),
      ]
      const result = applyFilterConfig(
        tasks,
        makeFilter({ status: 'INBOX', priority: 'HIGH', assigned: true }),
        columns,
      )
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('match')
    })
  })
})

describe('applyFilterConfigDirect', () => {
  const columns: BoardColumn[] = []

  it('applies filter config directly without SavedFilter wrapper', () => {
    const tasks = [
      makeTask({ id: 't1', assigned_to: 'agent-1', priority: 'HIGH' }),
      makeTask({ id: 't2', assigned_to: 'agent-2', priority: 'HIGH' }),
      makeTask({ id: 't3', priority: 'LOW' }),
    ]
    const config: SavedFilterConfig = { assigned_to: 'agent-1', priority: 'HIGH' }
    const result = applyFilterConfigDirect(tasks, config, columns)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t1')
  })

  it('empty config returns all tasks', () => {
    const tasks = [makeTask(), makeTask(), makeTask()]
    const result = applyFilterConfigDirect(tasks, {}, columns)
    expect(result).toHaveLength(3)
  })
})

describe('applyAllFilters (unified config)', () => {
  const columns: BoardColumn[] = []

  it('applies config with assigned_to + selectedProjectId', () => {
    const tasks = [
      makeTask({ id: 't1', assigned_to: 'agent-1', project_id: 'proj-1' }),
      makeTask({ id: 't2', assigned_to: 'agent-1', project_id: 'proj-2' }),
      makeTask({ id: 't3', assigned_to: 'agent-2', project_id: 'proj-1' }),
    ]
    const config: SavedFilterConfig = { assigned_to: 'agent-1' }
    const result = applyAllFilters(tasks, config, columns, 'proj-1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t1')
  })

  it('applies config with due filter + project', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))

    const tasks = [
      makeTask({
        id: 't1',
        due_date: '2026-03-20T10:00:00Z',
        project_id: 'proj-1',
        status: 'INBOX',
      }),
      makeTask({
        id: 't2',
        due_date: '2026-03-20T10:00:00Z',
        project_id: 'proj-2',
        status: 'INBOX',
      }),
    ]
    const boardCols = [makeColumn({ slug: 'INBOX', is_done_state: false })]
    const config: SavedFilterConfig = { due: 'overdue' }
    const result = applyAllFilters(tasks, config, boardCols, 'proj-1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t1')

    vi.useRealTimers()
  })

  it('empty config + no project → returns all tasks', () => {
    const tasks = [makeTask(), makeTask(), makeTask()]
    const result = applyAllFilters(tasks, {}, columns, null)
    expect(result).toHaveLength(3)
  })

  it('applies tags filter via config', () => {
    const tasks = [
      makeTask({ id: 't1', tags: ['bug'] }),
      makeTask({ id: 't2', tags: ['feature'] }),
      makeTask({ id: 't3' }),
    ]
    const config: SavedFilterConfig = { tags: ['bug'] }
    const result = applyAllFilters(tasks, config, columns, null)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t1')
  })

  it('applies has_blockers via config', () => {
    const tasks = [
      makeTask({ id: 't1', tags: ['blocked'] }),
      makeTask({ id: 't2', tags: ['feature'] }),
    ]
    const config: SavedFilterConfig = { has_blockers: true }
    const result = applyAllFilters(tasks, config, columns, null)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t1')
  })

  it('applies unassigned via config', () => {
    const tasks = [makeTask({ id: 't1', assigned_to: 'agent-1' }), makeTask({ id: 't2' })]
    const config: SavedFilterConfig = { unassigned: true }
    const result = applyAllFilters(tasks, config, columns, null)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t2')
  })
})
