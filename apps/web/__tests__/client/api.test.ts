import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '@/lib/api'

const mockFetch = vi.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
})

function mockJsonResponse(data: unknown, ok = true) {
  mockFetch.mockResolvedValueOnce({
    ok,
    json: async () => data,
  })
}

// --- Tasks ---

describe('api.tasks', () => {
  it('list() fetches /api/tasks with no params', async () => {
    mockJsonResponse({ tasks: [{ id: 't1' }], total: 1 })
    const result = await api.tasks.list()

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': 'ws-default' },
      }),
    )
    expect(result.tasks).toHaveLength(1)
  })

  it('list() appends query params', async () => {
    mockJsonResponse({ tasks: [], total: 0 })
    await api.tasks.list({ status: 'INBOX', assigned_to: 'agent-1' })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('status=INBOX')
    expect(url).toContain('assigned_to=agent-1')
  })

  it('get() fetches /api/tasks/:id', async () => {
    mockJsonResponse({ ok: true, task: { id: 't1' } })
    const result = await api.tasks.get('t1')

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks/t1', expect.anything())
    expect(result.task.id).toBe('t1')
  })

  it('create() posts with action=create', async () => {
    mockJsonResponse({ task: { id: 't-new', title: 'Test' } })
    await api.tasks.create({ title: 'Test' } as any)

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/tasks')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ action: 'create', task: { title: 'Test' } })
  })

  it('update() posts with action=update', async () => {
    mockJsonResponse({ task: { id: 't1', title: 'Updated' } })
    await api.tasks.update('t1', { title: 'Updated' } as any)

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).toEqual({ action: 'update', taskId: 't1', updates: { title: 'Updated' } })
  })

  it('move() posts with action=move', async () => {
    mockJsonResponse({ task: { id: 't1', status: 'DONE' } })
    await api.tasks.move('t1', 'DONE')

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).toEqual({ action: 'move', taskId: 't1', status: 'DONE', agentId: undefined })
  })

  it('move() includes agentId when provided', async () => {
    mockJsonResponse({ task: { id: 't1', status: 'ASSIGNED' } })
    await api.tasks.move('t1', 'ASSIGNED', 'agent-1')

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.agentId).toBe('agent-1')
  })

  it('delete() sends DELETE to /api/tasks/:id', async () => {
    mockJsonResponse({ ok: true })
    await api.tasks.delete('t1')

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/tasks/t1')
    expect(opts.method).toBe('DELETE')
  })

  it('assign() posts to /api/tasks/assign', async () => {
    mockJsonResponse({ ok: true, task: { id: 't1' } })
    await api.tasks.assign('t1', 'agent-1')

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/tasks/assign')
    expect(JSON.parse(opts.body)).toEqual({ taskId: 't1', agentId: 'agent-1' })
  })
})

// --- Agents ---

describe('api.agents', () => {
  it('list() fetches /api/agents', async () => {
    mockJsonResponse({ ok: true, agents: [{ id: 'agent-1' }], source: 'api' })
    const result = await api.agents.list()

    expect(mockFetch).toHaveBeenCalledWith('/api/agents', expect.anything())
    expect(result.agents).toHaveLength(1)
  })

  it('list("full") appends ?detail=full', async () => {
    mockJsonResponse({ ok: true, agents: [], source: 'api' })
    await api.agents.list('full')

    expect(mockFetch.mock.calls[0][0]).toBe('/api/agents?detail=full')
  })

  it('get() fetches /api/agents/:id', async () => {
    mockJsonResponse({ ok: true, agent: { id: 'agent-1' } })
    const result = await api.agents.get('agent-1')

    expect(mockFetch).toHaveBeenCalledWith('/api/agents/agent-1', expect.anything())
    expect(result.agent.id).toBe('agent-1')
  })

  it('trigger() posts to /api/agents/:id/trigger', async () => {
    mockJsonResponse({ ok: true, agentId: 'agent-1' })
    await api.agents.trigger('agent-1')

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/agents/agent-1/trigger')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({})
  })
})

// --- Messages ---

describe('api.messages', () => {
  it('list() fetches messages for a task', async () => {
    mockJsonResponse({ messages: [{ id: 'm1' }] })
    const result = await api.messages.list('t1')

    expect(mockFetch.mock.calls[0][0]).toBe('/api/messages?taskId=t1')
    expect(result.messages).toHaveLength(1)
  })

  it('create() posts message with correct fields', async () => {
    mockJsonResponse({ message: { id: 'm-new' } })
    await api.messages.create('t1', 'agent-1', 'Hello')

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).toEqual({
      task_id: 't1',
      from_agent_id: 'agent-1',
      content: 'Hello',
    })
  })
})

// --- Activities ---

describe('api.activities', () => {
  it('list() fetches with default limit=30', async () => {
    mockJsonResponse({ activities: [] })
    await api.activities.list()

    expect(mockFetch.mock.calls[0][0]).toBe('/api/activities?limit=30')
  })

  it('list() uses custom limit', async () => {
    mockJsonResponse({ activities: [] })
    await api.activities.list(10)

    expect(mockFetch.mock.calls[0][0]).toBe('/api/activities?limit=10')
  })
})

// --- Columns ---

describe('api.columns', () => {
  it('list() fetches /api/columns', async () => {
    mockJsonResponse({ settings: { INBOX: 5 } })
    const result = await api.columns.list()

    expect(mockFetch.mock.calls[0][0]).toBe('/api/columns')
    expect(result.settings.INBOX).toBe(5)
  })

  it('setWipLimit() sends PUT with wip_limit', async () => {
    mockJsonResponse({ ok: true })
    await api.columns.setWipLimit('INBOX', 5)

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/columns/INBOX')
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body)).toEqual({ wip_limit: 5 })
  })

  it('setWipLimit() sends null to remove limit', async () => {
    mockJsonResponse({ ok: true })
    await api.columns.setWipLimit('INBOX', null)

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.wip_limit).toBeNull()
  })
})
