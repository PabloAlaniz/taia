import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetAllSavedFilters = vi.fn()
const mockCreateSavedFilter = vi.fn()

vi.mock('@taia/core/db', () => ({
  getAllSavedFilters: (...args: any[]) => mockGetAllSavedFilters(...args),
  createSavedFilter: (...args: any[]) => mockCreateSavedFilter(...args),
}))

import { GET, POST } from '@/app/api/filters/route'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/filters', () => {
  it('lists every workspace when none is given', async () => {
    mockGetAllSavedFilters.mockResolvedValue([])

    await GET(new NextRequest('http://localhost/api/filters'), { params: Promise.resolve({}) })

    expect(mockGetAllSavedFilters).toHaveBeenLastCalledWith(undefined)
  })

  it('scopes the list to the x-workspace-id header', async () => {
    mockGetAllSavedFilters.mockResolvedValue([])

    await GET(
      new NextRequest('http://localhost/api/filters', { headers: { 'x-workspace-id': 'ws-a' } }),
      { params: Promise.resolve({}) },
    )

    expect(mockGetAllSavedFilters).toHaveBeenLastCalledWith('ws-a')
  })

  it('prefers the workspace_id query parameter over the header', async () => {
    mockGetAllSavedFilters.mockResolvedValue([])

    await GET(
      new NextRequest('http://localhost/api/filters?workspace_id=ws-b', {
        headers: { 'x-workspace-id': 'ws-a' },
      }),
      { params: Promise.resolve({}) },
    )

    expect(mockGetAllSavedFilters).toHaveBeenLastCalledWith('ws-b')
  })

  it('returns all saved filters', async () => {
    mockGetAllSavedFilters.mockResolvedValue([
      {
        id: 'filter-1',
        name: 'My Tasks',
        icon: '👤',
        filter_config: { assigned: true },
        is_predefined: true,
        sort_order: 0,
      },
      {
        id: 'filter-2',
        name: 'Overdue',
        icon: '⏰',
        filter_config: { due: 'overdue' },
        is_predefined: true,
        sort_order: 2,
      },
    ])

    const res = await GET(new NextRequest('http://localhost/api/filters'), {
      params: Promise.resolve({}),
    })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.filters).toHaveLength(2)
    expect(data.filters[0].name).toBe('My Tasks')
  })
})

describe('POST /api/filters', () => {
  it('creates a custom filter', async () => {
    mockCreateSavedFilter.mockResolvedValue({
      id: 'filter-custom-1',
      name: 'High Priority',
      icon: '🔥',
      filter_config: { priority: 'HIGH' },
      is_predefined: false,
      sort_order: 5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const req = new NextRequest('http://localhost/api/filters', {
      method: 'POST',
      body: JSON.stringify({
        name: 'High Priority',
        icon: '🔥',
        filter_config: { priority: 'HIGH' },
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.ok).toBe(true)
    expect(data.filter.name).toBe('High Priority')
    expect(data.filter.is_predefined).toBe(false)
  })

  it('returns 400 for missing name', async () => {
    const req = new NextRequest('http://localhost/api/filters', {
      method: 'POST',
      body: JSON.stringify({ filter_config: {} }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
