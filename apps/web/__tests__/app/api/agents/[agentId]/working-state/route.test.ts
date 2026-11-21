import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetAgentById = vi.fn()
const mockGetAgentWorkingState = vi.fn()
const mockUpsertAgentWorkingState = vi.fn()

vi.mock('@taia/core/db', () => ({
  getAgentById: (...args: unknown[]) => mockGetAgentById(...args),
  getAgentWorkingState: (...args: unknown[]) => mockGetAgentWorkingState(...args),
  upsertAgentWorkingState: (...args: unknown[]) => mockUpsertAgentWorkingState(...args),
}))

import { GET, PUT } from '@/app/api/agents/[agentId]/working-state/route'

const params = (agentId: string) => ({ params: Promise.resolve({ agentId }) })
const row = {
  agent_id: 'alex',
  task_id: 't1',
  content: 'notes',
  updated_by: 'alex',
  updated_at: '2026-10-26T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAgentById.mockResolvedValue({ id: 'alex' })
})

describe('GET /api/agents/[agentId]/working-state', () => {
  it('returns the stored notes', async () => {
    mockGetAgentWorkingState.mockResolvedValue(row)
    const data = await (await GET(new NextRequest('http://localhost/x'), params('alex'))).json()
    expect(data).toEqual({
      agentId: 'alex',
      content: 'notes',
      taskId: 't1',
      updatedBy: 'alex',
      updatedAt: row.updated_at,
    })
  })

  it('returns empty content when there are none yet, and 404 for unknown agents', async () => {
    mockGetAgentWorkingState.mockResolvedValue(null)
    const data = await (await GET(new NextRequest('http://localhost/x'), params('alex'))).json()
    expect(data.content).toBe('')

    mockGetAgentById.mockResolvedValueOnce(undefined)
    expect((await GET(new NextRequest('http://localhost/x'), params('ghost'))).status).toBe(404)
  })
})

describe('PUT /api/agents/[agentId]/working-state', () => {
  it('upserts the notes', async () => {
    mockUpsertAgentWorkingState.mockResolvedValue(row)
    const req = new NextRequest('http://localhost/x', {
      method: 'PUT',
      body: JSON.stringify({ content: 'notes', taskId: 't1', updatedBy: 'alex' }),
    })
    const res = await PUT(req, params('alex'))
    expect(res.status).toBe(200)
    expect(mockUpsertAgentWorkingState).toHaveBeenCalledWith('alex', 'notes', {
      taskId: 't1',
      updatedBy: 'alex',
    })
  })

  it('requires string content', async () => {
    const req = new NextRequest('http://localhost/x', { method: 'PUT', body: '{}' })
    expect((await PUT(req, params('alex'))).status).toBe(400)
  })
})
