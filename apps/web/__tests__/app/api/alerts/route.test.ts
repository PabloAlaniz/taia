import { describe, it, expect, vi } from 'vitest'
import { GET, POST } from '@/app/api/alerts/route'

vi.mock('@taia/core/db', () => ({
  // No columns known: statuses are read by their names.
  getColumnStates: async () => [],
  getAllTasks: vi.fn(() => [
    {
      id: '1',
      title: 'Blocked Task',
      status: 'IN_PROGRESS',
      tags: ['blocked'],
      updated_at: '2026-01-01T00:00:00Z',
    },
    { id: '2', title: 'Review Task', status: 'REVIEW', updated_at: '2026-01-01T00:00:00Z' },
    { id: '3', title: 'Done Task', status: 'DONE', completed_at: new Date().toISOString() },
  ]),
  getActivities: vi.fn(() => []),
}))

vi.mock('@taia/core/alerts', () => ({
  checkAndAlert: vi.fn(() => ['🚫 1 blocked task']),
  sendAlert: vi.fn(() => Promise.resolve(true)),
  generateDailySummary: vi.fn(() => '📊 Daily Summary\n✅ 1 completed'),
}))

describe('GET /api/alerts', () => {
  it('returns alerts without sending (dry run)', async () => {
    const req = new Request('http://localhost/api/alerts')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.alerts).toBeDefined()
    expect(data.sent).toBe(false)
  })

  it('sends alerts when send=true', async () => {
    const req = new Request('http://localhost/api/alerts?send=true')
    const res = await GET(req)
    const data = await res.json()

    expect(data.ok).toBe(true)
    expect(data.sent).toBe(true)
  })

  it('generates summary when summary=true', async () => {
    const req = new Request('http://localhost/api/alerts?summary=true')
    const res = await GET(req)
    const data = await res.json()

    expect(data.ok).toBe(true)
    expect(data.summary).toContain('Daily Summary')
  })

  it('sends summary when summary=true and send=true', async () => {
    const req = new Request('http://localhost/api/alerts?summary=true&send=true')
    const res = await GET(req)
    const data = await res.json()

    expect(data.ok).toBe(true)
    expect(data.sent).toBe(true)
  })
})

describe('POST /api/alerts', () => {
  it('sends custom alert message', async () => {
    const req = new Request('http://localhost/api/alerts', {
      method: 'POST',
      body: JSON.stringify({ message: '🚨 Custom alert!' }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.sent).toBe(true)
  })

  it('returns 400 if message missing', async () => {
    const req = new Request('http://localhost/api/alerts', {
      method: 'POST',
      body: JSON.stringify({}),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
