import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockReorderColumns = vi.fn()
const mockGetColumnsForWorkspace = vi.fn()

vi.mock('@taia/core/db', () => ({
  reorderColumns: (...args: any[]) => mockReorderColumns(...args),
  getColumnsForWorkspace: (...args: any[]) => mockGetColumnsForWorkspace(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import { POST } from '@/app/api/workspaces/[workspaceId]/columns/reorder/route'

const mockParams = (workspaceId: string) => ({
  params: Promise.resolve({ workspaceId }),
})

describe('POST /api/workspaces/[workspaceId]/columns/reorder', () => {
  it('reorders columns and returns updated list', async () => {
    mockReorderColumns.mockResolvedValue(undefined)
    const columns = [
      { id: 'col-b', slug: 'IN_PROGRESS', position: 0 },
      { id: 'col-a', slug: 'INBOX', position: 1 },
      { id: 'col-c', slug: 'DONE', position: 2 },
    ]
    mockGetColumnsForWorkspace.mockResolvedValue(columns)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1/columns/reorder', {
      method: 'POST',
      body: JSON.stringify({ column_ids: ['col-b', 'col-a', 'col-c'] }),
    })
    const res = await POST(req, mockParams('ws-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.columns).toHaveLength(3)
    expect(mockReorderColumns).toHaveBeenCalledWith('ws-1', ['col-b', 'col-a', 'col-c'])
    expect(mockGetColumnsForWorkspace).toHaveBeenCalledWith('ws-1')
  })

  it('returns 400 for empty order array', async () => {
    const req = new NextRequest('http://localhost/api/workspaces/ws-1/columns/reorder', {
      method: 'POST',
      body: JSON.stringify({ column_ids: [] }),
    })
    const res = await POST(req, mockParams('ws-1') as any)

    expect(res.status).toBe(400)
  })

  it('returns 400 when order is missing', async () => {
    const req = new NextRequest('http://localhost/api/workspaces/ws-1/columns/reorder', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req, mockParams('ws-1') as any)

    expect(res.status).toBe(400)
  })
})
