import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockListWorkspaces = vi.fn()
const mockCreateWorkspaceFromPreset = vi.fn()
const mockCreateCustomWorkspace = vi.fn()

vi.mock('@taia/core/services/workspace.service', () => ({
  listWorkspaces: (...args: any[]) => mockListWorkspaces(...args),
  createWorkspaceFromPreset: (...args: any[]) => mockCreateWorkspaceFromPreset(...args),
  createCustomWorkspace: (...args: any[]) => mockCreateCustomWorkspace(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import { GET, POST } from '@/app/api/workspaces/route'

describe('GET /api/workspaces', () => {
  it('returns all workspaces', async () => {
    const workspaces = [
      { id: 'ws-1', name: 'Default', slug: 'default' },
      { id: 'ws-2', name: 'Dev', slug: 'dev' },
    ]
    mockListWorkspaces.mockResolvedValue(workspaces)

    const req = new NextRequest('http://localhost/api/workspaces')
    const res = await GET(req, { params: Promise.resolve({}) } as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.workspaces).toHaveLength(2)
  })

  it('returns empty array when no workspaces', async () => {
    mockListWorkspaces.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/workspaces')
    const res = await GET(req, { params: Promise.resolve({}) } as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.workspaces).toEqual([])
  })
})

describe('POST /api/workspaces', () => {
  it('creates workspace from preset when preset_id provided', async () => {
    const workspace = { id: 'ws-new', name: 'My Project', slug: 'my-project' }
    mockCreateWorkspaceFromPreset.mockResolvedValue(workspace)

    const req = new NextRequest('http://localhost/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'My Project', preset_id: 'preset-1' }),
    })
    const res = await POST(req, { params: Promise.resolve({}) } as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.workspace.id).toBe('ws-new')
    expect(mockCreateWorkspaceFromPreset).toHaveBeenCalledWith('My Project', 'preset-1', {
      description: undefined,
      icon: undefined,
      color: undefined,
    })
  })

  it('creates custom workspace when no preset_id', async () => {
    const workspace = { id: 'ws-new', name: 'Custom', slug: 'custom' }
    mockCreateCustomWorkspace.mockResolvedValue(workspace)

    const req = new NextRequest('http://localhost/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'Custom' }),
    })
    const res = await POST(req, { params: Promise.resolve({}) } as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.workspace.id).toBe('ws-new')
    expect(mockCreateCustomWorkspace).toHaveBeenCalled()
  })

  it('returns 400 for invalid body (missing name)', async () => {
    const req = new NextRequest('http://localhost/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req, { params: Promise.resolve({}) } as any)

    expect(res.status).toBe(400)
  })

  it('returns 400 for empty name', async () => {
    const req = new NextRequest('http://localhost/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
    })
    const res = await POST(req, { params: Promise.resolve({}) } as any)

    expect(res.status).toBe(400)
  })
})
