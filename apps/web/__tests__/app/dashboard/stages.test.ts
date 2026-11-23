import { describe, it, expect } from 'vitest'
import { boardStages, isOpen, isStale, stageCounts } from '@/lib/dashboard-utils'
import type { Task } from '@taia/types'

const column = (slug: string, position: number, done = false, initial = false) => ({
  workspace_id: 'ws',
  slug,
  position,
  is_done_state: done,
  is_initial_state: initial,
})

// A board whose "assigned" column is called TODO, as the demo board has it.
const stages = boardStages([
  column('INBOX', 0, false, true),
  column('TODO', 1),
  column('IN_PROGRESS', 2),
  column('REVIEW', 3),
  column('DONE', 4, true),
])

const now = new Date('2026-06-02T12:00:00Z')
const dayAgo = '2026-06-01T10:00:00Z'

function task(status: string, overrides: Partial<Task> = {}): Task {
  return {
    id: status,
    title: status,
    status,
    workspace_id: 'ws',
    assigned_to: 'someone',
    created_at: dayAgo,
    updated_at: dayAgo,
    ...overrides,
  } as Task
}

describe('dashboard stages', () => {
  it('counts in progress and review by column, as the team page does', () => {
    const counts = stageCounts(
      [task('TODO'), task('IN_PROGRESS'), task('IN_PROGRESS'), task('REVIEW'), task('DONE')],
      stages,
    )
    expect(counts).toEqual({ todo: 1, in_progress: 2, review: 1, done: 1 })
  })

  it('open is every task not in a done column', () => {
    expect(isOpen(task('INBOX'), stages)).toBe(true)
    expect(isOpen(task('REVIEW'), stages)).toBe(true)
    expect(isOpen(task('DONE'), stages)).toBe(false)
  })

  it('reads the status name when the columns are unknown', () => {
    const none = boardStages(null)
    expect(isOpen(task('REJECTED'), none)).toBe(false)
    expect(stageCounts([task('IN_PROGRESS'), task('ASSIGNED')], none)).toMatchObject({
      in_progress: 1,
      todo: 1,
    })
  })

  it('stale is held, not started and untouched for a day', () => {
    expect(isStale(task('TODO'), stages, now)).toBe(true)
    expect(isStale(task('TODO', { assigned_to: undefined }), stages, now)).toBe(false)
    expect(isStale(task('IN_PROGRESS'), stages, now)).toBe(false)
    expect(isStale(task('TODO', { updated_at: '2026-06-02T11:00:00Z' }), stages, now)).toBe(false)
  })
})
