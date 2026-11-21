import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockUpdateColumn = vi.fn()
const mockDeleteColumn = vi.fn()
const mockGetColumnById = vi.fn()

vi.mock('@taia/core/db', () => ({
  updateColumn: (...args: any[]) => mockUpdateColumn(...args),
  deleteColumn: (...args: any[]) => mockDeleteColumn(...args),
  getColumnById: (...args: any[]) => mockGetColumnById(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import { PUT, DELETE } from '@/app/api/workspaces/[workspaceId]/columns/[columnId]/route'

const mockParams = (workspaceId: string, columnId: string) => ({
  params: Promise.resolve({ workspaceId, columnId }),
})

describe('PUT /api/workspaces/[workspaceId]/columns/[columnId]', () => {
  it('updates column', async () => {
    const updated = { id: 'col-1', slug: 'INBOX', label: 'New Label', position: 0 }
    mockUpdateColumn.mockResolvedValue(updated)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1/columns/col-1', {
      method: 'PUT',
      body: JSON.stringify({ label: 'New Label' }),
    })
    const res = await PUT(req, mockParams('ws-1', 'col-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.column.label).toBe('New Label')
    expect(mockUpdateColumn).toHaveBeenCalledWith(
      'col-1',
      expect.objectContaining({
        label: 'New Label',
      }),
    )
  })

  it('returns 404 when column not found', async () => {
    mockUpdateColumn.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1/columns/unknown', {
      method: 'PUT',
      body: JSON.stringify({ label: 'Test' }),
    })
    const res = await PUT(req, mockParams('ws-1', 'unknown') as any)

    expect(res.status).toBe(404)
  })

  it('updates multiple fields', async () => {
    const updated = {
      id: 'col-1',
      slug: 'DONE',
      label: 'Completed',
      is_done_state: true,
      color: '#22c55e',
    }
    mockUpdateColumn.mockResolvedValue(updated)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1/columns/col-1', {
      method: 'PUT',
      body: JSON.stringify({ label: 'Completed', is_done_state: true, color: '#22c55e' }),
    })
    const res = await PUT(req, mockParams('ws-1', 'col-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.column.is_done_state).toBe(true)
  })
})

describe('DELETE /api/workspaces/[workspaceId]/columns/[columnId]', () => {
  it('deletes column', async () => {
    mockDeleteColumn.mockResolvedValue(true)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1/columns/col-1', {
      method: 'DELETE',
    })
    const res = await DELETE(req, mockParams('ws-1', 'col-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.deleted).toBe(true)
  })

  it('returns 404 when column not found', async () => {
    mockDeleteColumn.mockResolvedValue(false)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1/columns/unknown', {
      method: 'DELETE',
    })
    const res = await DELETE(req, mockParams('ws-1', 'unknown') as any)

    expect(res.status).toBe(404)
  })
})
