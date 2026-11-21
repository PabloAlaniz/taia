import { describe, it, expect } from 'vitest'
import {
  defaultStatusOnCreate,
  defaultStatusOnAssign,
  activityTypeForMove,
} from '@taia/domain/domain/task/task.rules'

describe('defaultStatusOnCreate', () => {
  it('returns explicit status when provided', () => {
    expect(defaultStatusOnCreate('IN_PROGRESS', 'agent-1')).toBe('IN_PROGRESS')
  })

  it('returns ASSIGNED when assigned_to is set and no explicit status', () => {
    expect(defaultStatusOnCreate(undefined, 'agent-1')).toBe('ASSIGNED')
  })

  it('returns INBOX when no assigned_to and no explicit status', () => {
    expect(defaultStatusOnCreate(undefined, undefined)).toBe('INBOX')
  })
})

describe('defaultStatusOnAssign', () => {
  it('returns ASSIGNED when assigning to INBOX task without explicit status', () => {
    expect(defaultStatusOnAssign('INBOX', 'agent-1', undefined)).toBe('ASSIGNED')
  })

  it('returns undefined when task is not in INBOX', () => {
    expect(defaultStatusOnAssign('IN_PROGRESS', 'agent-1', undefined)).toBeUndefined()
  })

  it('returns undefined when explicit new status is provided', () => {
    expect(defaultStatusOnAssign('INBOX', 'agent-1', 'IN_PROGRESS')).toBeUndefined()
  })

  it('returns undefined when no new assigned_to', () => {
    expect(defaultStatusOnAssign('INBOX', undefined, undefined)).toBeUndefined()
  })
})

describe('activityTypeForMove', () => {
  it('returns task_completed for DONE', () => {
    expect(activityTypeForMove('DONE')).toBe('task_completed')
  })

  it('returns task_moved for other statuses', () => {
    expect(activityTypeForMove('IN_PROGRESS')).toBe('task_moved')
    expect(activityTypeForMove('REVIEW')).toBe('task_moved')
    expect(activityTypeForMove('INBOX')).toBe('task_moved')
  })
})
