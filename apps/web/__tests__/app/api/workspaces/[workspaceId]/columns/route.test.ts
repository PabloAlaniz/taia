import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetColumnsForWorkspace = vi.fn()
const mockCreateColumn = vi.fn()

vi.mock('@taia/core/db', () => ({
  getColumnsForWorkspace: (...args: any[]) => mockGetColumnsForWorkspace(...args),
  createColumn: (...args: any[]) => mockCreateColumn(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import { GET, POST } from '@/app/api/workspaces/[workspaceId]/columns/route'

const mockParams = (workspaceId: string) => ({
  params: Promise.resolve({ workspaceId }),
})

describe('GET /api/workspaces/[workspaceId]/columns', () => {
  it('returns columns for workspace', async () => {
    const columns = [
      { id: 'col-1', slug: 'INBOX', label: 'Inbox', position: 0 },
      { id: 'col-2', slug: 'DONE', label: 'Done', position: 1 },
    ]
    mockGetColumnsForWorkspace.mockResolvedValue(columns)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1/columns')
    const res = await GET(req, mockParams('ws-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.columns).toHaveLength(2)
    expect(mockGetColumnsForWorkspace).toHaveBeenCalledWith('ws-1')
  })

  it('returns empty array when no columns', async () => {
    mockGetColumnsForWorkspace.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/workspaces/ws-1/columns')
    const res = await GET(req, mockParams('ws-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.columns).toEqual([])
  })
})

describe('POST /api/workspaces/[workspaceId]/columns', () => {
  it('creates column with valid data', async () => {
    const column = { id: 'col-new', slug: 'REVIEW', label: 'Review', position: 2 }
    mockCreateColumn.mockResolvedValue(column)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1/columns', {
      method: 'POST',
      body: JSON.stringify({ slug: 'REVIEW', label: 'Review' }),
    })
    const res = await POST(req, mockParams('ws-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.column.slug).toBe('REVIEW')
    expect(mockCreateColumn).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        slug: 'REVIEW',
        label: 'Review',
      }),
    )
  })

  it('returns 400 for empty slug', async () => {
    const req = new NextRequest('http://localhost/api/workspaces/ws-1/columns', {
      method: 'POST',
      body: JSON.stringify({ slug: '', label: 'Test' }),
    })
    const res = await POST(req, mockParams('ws-1') as any)

    expect(res.status).toBe(400)
  })

  it('returns 400 when missing required fields', async () => {
    const req = new NextRequest('http://localhost/api/workspaces/ws-1/columns', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req, mockParams('ws-1') as any)

    expect(res.status).toBe(400)
  })

  it('creates column with optional fields', async () => {
    const column = { id: 'col-new', slug: 'DONE', label: 'Done', is_done_state: true, icon: '✅' }
    mockCreateColumn.mockResolvedValue(column)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1/columns', {
      method: 'POST',
      body: JSON.stringify({
        slug: 'DONE',
        label: 'Done',
        icon: '✅',
        is_done_state: true,
        is_initial_state: false,
      }),
    })
    const res = await POST(req, mockParams('ws-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.column.is_done_state).toBe(true)
  })
})
