import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetSavedFilterById = vi.fn()
const mockUpdateSavedFilter = vi.fn()
const mockDeleteSavedFilter = vi.fn()

vi.mock('@taia/core/db', () => ({
  getSavedFilterById: (...args: any[]) => mockGetSavedFilterById(...args),
  updateSavedFilter: (...args: any[]) => mockUpdateSavedFilter(...args),
  deleteSavedFilter: (...args: any[]) => mockDeleteSavedFilter(...args),
}))

import { GET, PUT, DELETE } from '@/app/api/filters/[filterId]/route'

beforeEach(() => vi.clearAllMocks())

const makeContext = (filterId: string) => ({
  params: Promise.resolve({ filterId }),
})

describe('GET /api/filters/[filterId]', () => {
  it('returns filter by id', async () => {
    const filter = { id: 'f1', name: 'My Filter', filter_config: { priority: 'HIGH' } }
    mockGetSavedFilterById.mockResolvedValue(filter)

    const req = new NextRequest('http://localhost/api/filters/f1')
    const res = await GET(req, makeContext('f1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.filter.name).toBe('My Filter')
  })

  it('returns 404 when filter not found', async () => {
    mockGetSavedFilterById.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/filters/nope')
    const res = await GET(req, makeContext('nope'))

    expect(res.status).toBe(404)
  })
})

describe('PUT /api/filters/[filterId]', () => {
  it('updates a filter', async () => {
    const updated = { id: 'f1', name: 'Updated', filter_config: { status: 'DONE' } }
    mockUpdateSavedFilter.mockResolvedValue(updated)

    const req = new NextRequest('http://localhost/api/filters/f1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated', filter_config: { status: 'DONE' } }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeContext('f1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.filter.name).toBe('Updated')
  })

  it('returns 404 when filter to update not found', async () => {
    mockUpdateSavedFilter.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/filters/nope', {
      method: 'PUT',
      body: JSON.stringify({ name: 'X' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeContext('nope'))

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/filters/[filterId]', () => {
  it('deletes a filter', async () => {
    mockDeleteSavedFilter.mockResolvedValue(true)

    const req = new NextRequest('http://localhost/api/filters/f1', { method: 'DELETE' })
    const res = await DELETE(req, makeContext('f1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.deleted).toBe(true)
  })

  it('returns 404 when filter to delete not found', async () => {
    mockDeleteSavedFilter.mockResolvedValue(false)

    const req = new NextRequest('http://localhost/api/filters/nope', { method: 'DELETE' })
    const res = await DELETE(req, makeContext('nope'))

    expect(res.status).toBe(404)
  })
})
