import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/db', () => ({ getColumnStates: vi.fn() }))

import { isCompleted, isFinished, type ColumnStates } from '../../src/services/task-outcome'

const states: ColumnStates = new Map([
  [
    'ws-content',
    { known: new Set(['IDEA', 'BORRADOR', 'PUBLICADO']), done: new Set(['PUBLICADO']) },
  ],
  [
    'ws-dev',
    { known: new Set(['INBOX', 'DONE', 'REJECTED']), done: new Set(['DONE', 'REJECTED']) },
  ],
])

describe('task outcome', () => {
  it('a preset done column counts as finished and completed', () => {
    const task = { status: 'PUBLICADO', workspace_id: 'ws-content' }
    expect(isFinished(task, states)).toBe(true)
    expect(isCompleted(task, states)).toBe(true)
  })

  it('rejected is finished but not completed', () => {
    const task = { status: 'REJECTED', workspace_id: 'ws-dev' }
    expect(isFinished(task, states)).toBe(true)
    expect(isCompleted(task, states)).toBe(false)
  })

  it('an open column is neither', () => {
    expect(isFinished({ status: 'BORRADOR', workspace_id: 'ws-content' }, states)).toBe(false)
  })

  it('falls back to DONE / REJECTED when the column is unknown', () => {
    expect(isCompleted({ status: 'DONE', workspace_id: 'ws-gone' }, states)).toBe(true)
    expect(isFinished({ status: 'PUBLICADO', workspace_id: 'ws-gone' }, states)).toBe(false)
  })
})
