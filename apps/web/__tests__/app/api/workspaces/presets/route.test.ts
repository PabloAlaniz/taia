import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockListPresets = vi.fn()

vi.mock('@taia/core/services/workspace.service', () => ({
  listPresets: (...args: any[]) => mockListPresets(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

import { GET } from '@/app/api/workspaces/presets/route'

describe('GET /api/workspaces/presets', () => {
  it('returns all presets', async () => {
    const presets = [
      {
        id: 'p1',
        name: 'Software Dev',
        icon: '💻',
        columns: [{ slug: 'INBOX' }, { slug: 'DONE' }],
      },
      { id: 'p2', name: 'Ventas', icon: '💰', columns: [{ slug: 'LEAD' }, { slug: 'WON' }] },
    ]
    mockListPresets.mockResolvedValue(presets)

    const req = new NextRequest('http://localhost/api/workspaces/presets')
    const res = await GET(req, { params: Promise.resolve({}) } as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.presets).toHaveLength(2)
    expect(data.presets[0].name).toBe('Software Dev')
  })

  it('returns empty array when no presets', async () => {
    mockListPresets.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/workspaces/presets')
    const res = await GET(req, { params: Promise.resolve({}) } as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.presets).toEqual([])
  })

  it('handles service error gracefully', async () => {
    mockListPresets.mockRejectedValue(new Error('DB connection failed'))

    const req = new NextRequest('http://localhost/api/workspaces/presets')
    const res = await GET(req, { params: Promise.resolve({}) } as any)
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data.ok).toBe(false)
  })
})
