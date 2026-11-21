import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetWorkspace = vi.fn()
const mockUpdateExistingWorkspace = vi.fn()
const mockDeleteExistingWorkspace = vi.fn()

vi.mock('@taia/core/services/workspace.service', () => ({
  getWorkspace: (...args: any[]) => mockGetWorkspace(...args),
  updateExistingWorkspace: (...args: any[]) => mockUpdateExistingWorkspace(...args),
  deleteExistingWorkspace: (...args: any[]) => mockDeleteExistingWorkspace(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import { GET, PUT, DELETE } from '@/app/api/workspaces/[workspaceId]/route'

const mockParams = (workspaceId: string) => ({
  params: Promise.resolve({ workspaceId }),
})

describe('GET /api/workspaces/[workspaceId]', () => {
  it('returns workspace when found', async () => {
    const workspace = { id: 'ws-1', name: 'Default', slug: 'default' }
    mockGetWorkspace.mockResolvedValue(workspace)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1')
    const res = await GET(req, mockParams('ws-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.workspace.id).toBe('ws-1')
  })

  it('returns 404 when workspace not found', async () => {
    mockGetWorkspace.mockResolvedValue(undefined)

    const req = new NextRequest('http://localhost/api/workspaces/unknown')
    const res = await GET(req, mockParams('unknown') as any)

    expect(res.status).toBe(404)
  })
})

describe('PUT /api/workspaces/[workspaceId]', () => {
  it('updates workspace', async () => {
    const updated = { id: 'ws-1', name: 'Updated', slug: 'updated' }
    mockUpdateExistingWorkspace.mockResolvedValue(updated)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated' }),
    })
    const res = await PUT(req, mockParams('ws-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.workspace.name).toBe('Updated')
  })

  it('returns 404 when workspace not found', async () => {
    mockUpdateExistingWorkspace.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/workspaces/unknown', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Test' }),
    })
    const res = await PUT(req, mockParams('unknown') as any)

    expect(res.status).toBe(404)
  })

  it('updates description and color', async () => {
    const updated = { id: 'ws-1', name: 'WS', description: 'New desc', color: '#ff0000' }
    mockUpdateExistingWorkspace.mockResolvedValue(updated)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1', {
      method: 'PUT',
      body: JSON.stringify({ description: 'New desc', color: '#ff0000' }),
    })
    const res = await PUT(req, mockParams('ws-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.workspace.description).toBe('New desc')
  })
})

describe('DELETE /api/workspaces/[workspaceId]', () => {
  it('deletes workspace', async () => {
    mockDeleteExistingWorkspace.mockResolvedValue(true)

    const req = new NextRequest('http://localhost/api/workspaces/ws-1', { method: 'DELETE' })
    const res = await DELETE(req, mockParams('ws-1') as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.deleted).toBe(true)
  })

  it('returns 404 when workspace not found or is default', async () => {
    mockDeleteExistingWorkspace.mockResolvedValue(false)

    const req = new NextRequest('http://localhost/api/workspaces/unknown', { method: 'DELETE' })
    const res = await DELETE(req, mockParams('unknown') as any)

    expect(res.status).toBe(404)
  })
})
