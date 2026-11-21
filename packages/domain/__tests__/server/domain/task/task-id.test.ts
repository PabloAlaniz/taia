import { describe, expect, it } from 'vitest'
import { shortTaskId } from '@taia/domain/domain/task/task-id'

describe('shortTaskId', () => {
  it('uses the random suffix of a generated id', () => {
    expect(shortTaskId('1794965172338-jutxin')).toBe('jutxin')
  })

  it('tells apart tasks created in the same minute', () => {
    expect(shortTaskId('1794965172338-jutxin')).not.toBe(shortTaskId('1794965172061-em0v94'))
  })

  it('cuts any other id to its first 8 characters', () => {
    expect(shortTaskId('3f2b8c1e-9a4d-4c1b-8f6e-123456789abc')).toBe('3f2b8c1e')
    expect(shortTaskId('task-1')).toBe('task-1')
    expect(shortTaskId('github-issue-42')).toBe('github-i')
  })
})
