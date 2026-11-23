import { describe, it, expect, vi, beforeEach } from 'vitest'

const getAllTasks = vi.fn()
const getActivities = vi.fn()
const getColumnStates = vi.fn()
vi.mock('../../src/db/index', () => ({
  getAllTasks: (...a: unknown[]) => getAllTasks(...a),
  getActivities: (...a: unknown[]) => getActivities(...a),
  getColumnStates: (...a: unknown[]) => getColumnStates(...a),
}))
vi.mock('../../src/agents/metadata', () => ({ getAgentDisplay: () => ({ name: 'a', emoji: '' }) }))

import { generateStandup } from '../../src/services/standup.service'

beforeEach(() => {
  vi.clearAllMocks()
  getActivities.mockResolvedValue([])
})

describe('generateStandup', () => {
  it("counts a preset board's own columns", async () => {
    getColumnStates.mockResolvedValue([
      {
        workspace_id: 'ws',
        slug: 'LEAD',
        position: 0,
        is_initial_state: true,
        is_done_state: false,
      },
      {
        workspace_id: 'ws',
        slug: 'PROPUESTA',
        position: 1,
        is_initial_state: false,
        is_done_state: false,
      },
      {
        workspace_id: 'ws',
        slug: 'CERRADO_GANADO',
        position: 2,
        is_initial_state: false,
        is_done_state: true,
      },
    ])
    getAllTasks.mockResolvedValue([
      { id: '1', title: 'a', status: 'PROPUESTA', workspace_id: 'ws' },
      { id: '2', title: 'b', status: 'CERRADO_GANADO', workspace_id: 'ws' },
      { id: '3', title: 'c', status: 'LEAD', workspace_id: 'ws' },
    ])
    const { stats } = await generateStandup('ws')
    expect(stats).toMatchObject({ inProgress: 1, done: 1, inbox: 1, review: 0 })
  })

  it('reads statuses by name when there are no columns', async () => {
    getColumnStates.mockResolvedValue([])
    getAllTasks.mockResolvedValue([
      { id: '1', title: 'a', status: 'REVIEW' },
      { id: '2', title: 'b', status: 'REJECTED' },
    ])
    const { stats } = await generateStandup()
    expect(stats).toMatchObject({ review: 1, done: 0 })
  })
})
