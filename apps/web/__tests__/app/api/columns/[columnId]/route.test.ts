import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetColumnSetting = vi.fn()
const mockSetColumnWipLimit = vi.fn()
const mockDeleteColumnSetting = vi.fn()

vi.mock('@taia/core/db', () => ({
  getColumnSetting: (...args: any[]) => mockGetColumnSetting(...args),
  setColumnWipLimit: (...args: any[]) => mockSetColumnWipLimit(...args),
  deleteColumnSetting: (...args: any[]) => mockDeleteColumnSetting(...args),
}))

import { GET, PUT, DELETE } from '@/app/api/columns/[columnId]/route'

beforeEach(() => vi.clearAllMocks())

const makeContext = (columnId: string) => ({
  params: Promise.resolve({ columnId }),
})

describe('GET /api/columns/[columnId]', () => {
  it('returns column setting when it exists', async () => {
    const setting = { column_name: 'IN_PROGRESS', wip_limit: 3 }
    mockGetColumnSetting.mockResolvedValue(setting)

    const req = new NextRequest('http://localhost/api/columns/IN_PROGRESS')
    const res = await GET(req, makeContext('IN_PROGRESS'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.wip_limit).toBe(3)
  })

  it('returns default with null wip_limit when no setting exists', async () => {
    mockGetColumnSetting.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/columns/INBOX')
    const res = await GET(req, makeContext('INBOX'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.column_name).toBe('INBOX')
    expect(data.wip_limit).toBeNull()
  })
})

describe('PUT /api/columns/[columnId]', () => {
  it('sets wip limit', async () => {
    const setting = { column_name: 'IN_PROGRESS', wip_limit: 5 }
    mockSetColumnWipLimit.mockResolvedValue(setting)

    const req = new NextRequest('http://localhost/api/columns/IN_PROGRESS', {
      method: 'PUT',
      body: JSON.stringify({ wip_limit: 5 }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeContext('IN_PROGRESS'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.setting.wip_limit).toBe(5)
  })

  it('returns 400 for invalid wip_limit', async () => {
    const req = new NextRequest('http://localhost/api/columns/IN_PROGRESS', {
      method: 'PUT',
      body: JSON.stringify({ wip_limit: 'abc' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeContext('IN_PROGRESS'))

    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/columns/[columnId]', () => {
  it('deletes column setting', async () => {
    mockDeleteColumnSetting.mockResolvedValue(true)

    const req = new NextRequest('http://localhost/api/columns/IN_PROGRESS', { method: 'DELETE' })
    const res = await DELETE(req, makeContext('IN_PROGRESS'))
    const data = await res.json()

    expect(data.ok).toBe(true)
  })
})
