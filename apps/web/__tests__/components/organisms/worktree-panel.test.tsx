// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { WorktreePanel } from '@/components/organisms/worktree-panel'

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key
    t.rich = (key: string) => key
    t.has = () => false
    return t
  },
}))

const fetchMock = vi.fn()

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

const base = {
  id: 'wt-1',
  task_id: 't-1',
  repository_id: 'r-1',
  branch_name: 'taia/t-1',
  base_branch: 'main',
  merge_strategy: 'merge',
  created_at: '',
  updated_at: '',
}

function calls(urlPart: string, method = 'POST') {
  return fetchMock.mock.calls.filter(
    ([url, opts]) => String(url).includes(urlPart) && (opts?.method ?? 'GET') === method,
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WorktreePanel', () => {
  it('does not offer merge until the worktree is in review', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true, worktrees: [{ ...base, status: 'active' }] }))
    render(<WorktreePanel taskId="t-1" />)

    expect(await screen.findByText('review')).toBeInTheDocument()
    expect(screen.queryByText('merge')).not.toBeInTheDocument()
    expect(screen.getByText('mergeNeedsReview')).toBeInTheDocument()
  })

  it('asks for confirmation before merging and shows the files that land', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ ok: true, worktrees: [{ ...base, status: 'reviewing' }] }))
      .mockResolvedValueOnce(
        json({
          ok: true,
          diff: {
            stats: {
              files_changed: 1,
              insertions: 3,
              deletions: 1,
              files: [{ path: 'src/a.ts', insertions: 3, deletions: 1 }],
            },
            unified_diff: '',
            commits: [],
          },
        }),
      )
      .mockResolvedValueOnce(json({ ok: true, worktree: { ...base, status: 'merged' } }))

    render(<WorktreePanel taskId="t-1" />)
    fireEvent.click(await screen.findByText('merge'))

    expect(await screen.findByText('src/a.ts')).toBeInTheDocument()
    expect(calls('/api/worktrees/wt-1')).toHaveLength(0)

    fireEvent.click(screen.getByText('confirmMerge.action {"base":"main"}'))

    await waitFor(() => expect(calls('/api/worktrees/wt-1')).toHaveLength(1))
    expect(JSON.parse(calls('/api/worktrees/wt-1')[0][1].body)).toMatchObject({ action: 'merge' })
    expect(await screen.findByRole('status')).toHaveTextContent('merged {"base":"main"}')
  })

  it('shows the server error inline when the merge fails', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ ok: true, worktrees: [{ ...base, status: 'reviewing' }] }))
      .mockResolvedValueOnce(json({ ok: false, error: 'diff failed' }))
      .mockResolvedValueOnce(json({ ok: false, error: 'Merge conflict in src/a.ts' }))

    render(<WorktreePanel taskId="t-1" />)
    fireEvent.click(await screen.findByText('merge'))
    expect(await screen.findByText('errors.diff')).toBeInTheDocument()
    // Without the diff, merging is demoted and says so; a retry is offered.
    expect(screen.getByText('retryDiff')).toBeInTheDocument()
    expect(screen.queryByText('confirmMerge.action {"base":"main"}')).not.toBeInTheDocument()

    // Merging blind takes opening it and typing the target branch.
    fireEvent.click(screen.getByText('confirmMerge.blindLink'))
    const blind = screen.getByText('confirmMerge.blind {"base":"main"}')
    expect(blind.closest('button')).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'main' } })
    expect(blind.closest('button')).not.toBeDisabled()
    fireEvent.click(blind)

    expect(await screen.findByText('Merge conflict in src/a.ts')).toBeInTheDocument()
  })

  it('makes Cancelar the primary action when git is missing on the server', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ ok: true, worktrees: [{ ...base, status: 'reviewing' }] }))
      .mockResolvedValueOnce(json({ ok: false, error: 'git diff failed: spawn git ENOENT' }))

    render(<WorktreePanel taskId="t-1" />)
    fireEvent.click(await screen.findByText('merge'))
    expect(await screen.findByText('errors.gitMissing')).toBeInTheDocument()

    // A retry can't fix a missing binary: leaving is the highlighted step.
    expect(screen.getByText('cancel').closest('button')).toHaveClass('bg-foreground')
    expect(screen.getByText('retryDiff').closest('button')).not.toHaveClass('bg-foreground')
  })

  it('cancelling the discard dialog does not call the API', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true, worktrees: [{ ...base, status: 'active' }] }))
    render(<WorktreePanel taskId="t-1" />)

    fireEvent.click(await screen.findByText('discard'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByText('cancel'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calls('/api/worktrees/wt-1')).toHaveLength(0)
  })
})
