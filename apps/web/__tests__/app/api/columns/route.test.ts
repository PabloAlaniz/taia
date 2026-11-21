import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/columns/route'

vi.mock('@taia/core/db', () => ({
  getColumnSettings: vi.fn(() => [
    { column_name: 'IN_PROGRESS', wip_limit: 3 },
    { column_name: 'REVIEW', wip_limit: 5 },
    { column_name: 'INBOX', wip_limit: null },
  ]),
}))

describe('GET /api/columns', () => {
  it('returns column settings as map', async () => {
    const req = new NextRequest('http://localhost/api/columns')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.settings).toBeDefined()
    expect(data.settings.IN_PROGRESS).toBe(3)
    expect(data.settings.REVIEW).toBe(5)
    expect(data.settings.INBOX).toBe(null)
  })
})
