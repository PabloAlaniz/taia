import { describe, expect, it } from 'vitest'
import {
  githubOriginTag,
  planGitHubIssueSync,
  planIncrementalGitHubIssueSync,
} from '@taia/core/services/github-import.service'
import type { Task } from '@taia/types'

const baseOptions = {
  workspace_id: 'ws-a',
  repository: { owner: 'acme', name: 'roadmap', url: 'https://github.com/acme/roadmap' },
  issues: [
    {
      number: 42,
      title: 'Add import preview',
      body: 'Preview changes before writing tasks',
      html_url: 'https://github.com/acme/roadmap/issues/42',
      labels: ['enhancement', { name: 'Good First Issue' }],
      updated_at: '2026-09-23T19:00:00Z',
    },
  ],
}

function task(overrides: Partial<Task>): Task {
  return {
    id: 'task-1',
    title: 'Add import preview',
    description:
      'Preview changes before writing tasks\n---\nGitHub: https://github.com/acme/roadmap/issues/42\nOrigen: acme/roadmap#42\nGitHub updated_at: 2026-09-23T19:00:00Z',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    confidence: 'needs-approval',
    created_by: 'system',
    created_at: '2026-09-23T19:01:00Z',
    updated_at: '2026-09-23T19:01:00Z',
    workspace_id: 'ws-a',
    repo_url: 'https://github.com/acme/roadmap',
    tags: [
      'github-import',
      'source:github',
      'github-repo:acme/roadmap',
      'github:acme/roadmap#42',
      'enhancement',
      'good-first-issue',
    ],
    ...overrides,
  }
}

describe('github import planning', () => {
  it('plans creates with stable per-issue origin tags', () => {
    const { operations } = planGitHubIssueSync([], baseOptions)

    expect(operations).toEqual([
      expect.objectContaining({
        action: 'create',
        issue_number: 42,
        origin_tag: 'github:acme/roadmap#42',
        changes: ['new'],
      }),
    ])
    expect(githubOriginTag(baseOptions.repository, 42)).toBe('github:acme/roadmap#42')
  })

  it('plans unchanged on idempotent re-runs when the origin tag and materialized fields match', () => {
    const { operations } = planGitHubIssueSync([task({})], baseOptions)

    expect(operations).toEqual([
      expect.objectContaining({ action: 'unchanged', task_id: 'task-1', changes: [] }),
    ])
  })

  it('plans updates for relevant GitHub issue changes without resetting task workflow state', () => {
    const { operations, plannedByIssue } = planGitHubIssueSync(
      [task({ title: 'Old title', status: 'REVIEW', priority: 'LOW' })],
      baseOptions,
    )

    expect(operations[0]).toEqual(
      expect.objectContaining({ action: 'update', task_id: 'task-1', changes: ['title'] }),
    )
    expect(plannedByIssue.get(42)).toEqual(expect.objectContaining({ priority: 'MEDIUM' }))
    expect(plannedByIssue.get(42)).not.toHaveProperty('status')
    expect(
      planGitHubIssueSync([], { ...baseOptions, default_status: 'TODO' }).plannedByIssue.get(42),
    ).toEqual(expect.objectContaining({ status: 'TODO' }))
  })

  it('does not dedupe across workspaces when an issue lacks the workspace-local origin tag', () => {
    const sameIssueInAnotherWorkspace = task({
      id: 'task-other',
      workspace_id: 'ws-b',
      tags: ['github-import', 'source:github', 'github:other/repo#42'],
    })

    const { operations } = planGitHubIssueSync([sameIssueInAnotherWorkspace], baseOptions)

    expect(operations[0].action).toBe('create')
  })

  it('filters incremental runs by cursor and reports skipped issues plus the next cursor', () => {
    const { operations, consideredIssues, skippedByCursor, cursor_before, cursor_after } =
      planIncrementalGitHubIssueSync([], {
        ...baseOptions,
        cursor: '2026-09-23T19:30:00Z',
        issues: [
          ...baseOptions.issues,
          {
            number: 43,
            title: 'Newer issue',
            body: null,
            html_url: 'https://github.com/acme/roadmap/issues/43',
            labels: [],
            updated_at: '2026-09-23T20:00:00Z',
          },
        ],
      })

    expect(cursor_before).toBe('2026-09-23T19:30:00Z')
    expect(skippedByCursor).toBe(1)
    expect(consideredIssues.map((issue) => issue.number)).toEqual([43])
    expect(cursor_after).toBe('2026-09-23T20:00:00Z')
    expect(operations).toEqual([
      expect.objectContaining({ action: 'create', issue_number: 43, changes: ['new'] }),
    ])
  })

  it('keeps issues without updated_at in incremental runs so they are not silently lost', () => {
    const { consideredIssues, skippedByCursor, cursor_after } = planIncrementalGitHubIssueSync([], {
      ...baseOptions,
      cursor: '2026-09-23T19:30:00Z',
      issues: [
        ...baseOptions.issues,
        {
          number: 44,
          title: 'Issue without timestamp',
          body: null,
          html_url: 'https://github.com/acme/roadmap/issues/44',
          labels: [],
          updated_at: null,
        },
      ],
    })

    expect(skippedByCursor).toBe(1)
    expect(consideredIssues.map((issue) => issue.number)).toEqual([44])
    expect(cursor_after).toBe('2026-09-23T19:30:00Z')
  })
})
