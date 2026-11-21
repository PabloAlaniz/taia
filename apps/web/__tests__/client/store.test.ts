import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/lib/store'
import type { Task, Agent, Message } from '@taia/types'

const mockFetch = vi.fn()
global.fetch = mockFetch

function mockJsonResponse(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => data,
  })
}

// Minimal mock factories — only required fields
function mockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'default',
    title: 'Default',
    status: 'INBOX',
    priority: 'MEDIUM',
    confidence: 'notify-only',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function mockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'default',
    name: 'Default Agent',
    avatar: '',
    status: 'IDLE',
    ...overrides,
  }
}

// Helper to reset zustand store between tests
const resetStore = () => {
  useStore.setState({
    agents: [],
    tasks: [],
    activities: [],
    loading: false,
    error: null,
    selectedTaskId: null,
    selectedTaskMessages: [],
    columnSettings: {},
  })
}

describe('useStore', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
  })

  describe('fetchAgents', () => {
    it('falls back to empty agents if API call fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network down'))

      await useStore.getState().fetchAgents()

      const agents = useStore.getState().agents
      expect(agents).toHaveLength(0)
    })

    it('sets agents from API response', async () => {
      mockJsonResponse({ agents: [{ id: 'agent-1', name: 'Agent 1' }] })

      await useStore.getState().fetchAgents()

      expect(useStore.getState().agents).toHaveLength(1)
      expect(useStore.getState().agents[0].id).toBe('agent-1')
    })
  })

  describe('selectTask', () => {
    it('sets selectedTaskId and clears selectedTaskMessages', () => {
      useStore.setState({
        selectedTaskId: 'old',
        selectedTaskMessages: [
          {
            id: 'm1',
            task_id: 'old',
            from_agent_id: 'agent-1',
            content: 'hello',
            created_at: new Date().toISOString(),
          } as Message,
        ],
      })

      // Prevent real fetch from fetchMessages
      mockJsonResponse({ messages: [] })

      useStore.getState().selectTask('t-123')

      expect(useStore.getState().selectedTaskId).toBe('t-123')
      expect(useStore.getState().selectedTaskMessages).toEqual([])
    })

    it('clears selection without fetching messages when null', () => {
      useStore.setState({ selectedTaskId: 't1' })

      useStore.getState().selectTask(null)

      expect(useStore.getState().selectedTaskId).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('addTask', () => {
    it('sets loading flags and appends returned task', async () => {
      mockJsonResponse({ task: { id: 't1', title: 'New', status: 'INBOX' } })
      // For fetchActivities call
      mockJsonResponse({ activities: [] })

      const p = useStore.getState().addTask({ title: 'New' })
      expect(useStore.getState().loading).toBe(true)

      await p

      expect(useStore.getState().loading).toBe(false)
      expect(useStore.getState().tasks.map((t) => t.id)).toEqual(['t1'])
    })

    it('does not duplicate a task the list already has', async () => {
      // A `task:created` broadcast refreshed the list before the response landed.
      useStore.setState({ tasks: [{ id: 't1', title: 'New', status: 'INBOX' } as never] })
      mockJsonResponse({ task: { id: 't1', title: 'New', status: 'INBOX' } })
      mockJsonResponse({ activities: [] })

      await useStore.getState().addTask({ title: 'New' })

      expect(useStore.getState().tasks.map((t) => t.id)).toEqual(['t1'])
    })

    it('sets error on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('server error'))

      await useStore.getState().addTask({ title: 'Fail' })

      expect(useStore.getState().error).toBe('server error')
      expect(useStore.getState().loading).toBe(false)
    })
  })

  describe('assignTask', () => {
    it('updates task + agent status and returns ok=true on success', async () => {
      useStore.setState({
        tasks: [mockTask({ id: 't1', title: 'A', status: 'INBOX' })],
        agents: [mockAgent({ id: 'agent-1', name: 'Agent 1', status: 'IDLE' })],
      })

      mockJsonResponse({
        ok: true,
        task: { id: 't1', title: 'A', status: 'ASSIGNED', assigned_to: 'agent-1' },
      })
      // For fetchActivities call
      mockJsonResponse({ activities: [] })

      const res = await useStore.getState().assignTask('t1', 'agent-1')
      expect(res.ok).toBe(true)

      const task = useStore.getState().tasks.find((t) => t.id === 't1')
      expect(task!.status).toBe('ASSIGNED')

      const agent = useStore.getState().agents.find((a) => a.id === 'agent-1')
      expect(agent!.status).toBe('WORKING')
    })

    it('returns error when API responds with ok=false', async () => {
      useStore.setState({
        tasks: [mockTask({ id: 't1', status: 'INBOX' })],
      })

      mockJsonResponse({ ok: false, error: 'Agent busy' })

      const res = await useStore.getState().assignTask('t1', 'agent-1')

      expect(res.ok).toBe(false)
      expect(res.error).toBe('Agent busy')
      expect(useStore.getState().loading).toBe(false)
    })

    it('returns error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('timeout'))

      const res = await useStore.getState().assignTask('t1', 'agent-1')

      expect(res.ok).toBe(false)
      expect(res.error).toBe('timeout')
      expect(useStore.getState().loading).toBe(false)
    })
  })

  describe('moveTask', () => {
    it('does optimistic update and on error rolls back and re-throws', async () => {
      useStore.setState({
        tasks: [mockTask({ id: 't1', title: 'A', status: 'INBOX' })],
      })

      // Move API fails
      mockFetch.mockRejectedValueOnce(new Error('down'))

      await expect(useStore.getState().moveTask('t1', 'DONE')).rejects.toThrow('down')

      // Should rollback to original state
      expect(useStore.getState().tasks[0].status).toBe('INBOX')
    })

    it('triggers fetchActivities on success', async () => {
      useStore.setState({
        tasks: [mockTask({ id: 't1', title: 'A', status: 'INBOX' })],
      })

      mockJsonResponse({ task: { id: 't1', status: 'DONE' } })
      // For fetchActivities call
      mockJsonResponse({ activities: [] })

      await useStore.getState().moveTask('t1', 'DONE')

      expect(useStore.getState().tasks[0].status).toBe('DONE')
      // fetchActivities was called (second fetch call)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('fetchTasks', () => {
    it('sets tasks from API response', async () => {
      mockJsonResponse({ tasks: [{ id: 't1' }, { id: 't2' }] })

      await useStore.getState().fetchTasks()

      expect(useStore.getState().tasks).toHaveLength(2)
    })

    it('sets error on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network'))

      await useStore.getState().fetchTasks()

      expect(useStore.getState().error).toBe('network')
    })
  })

  describe('fetchActivities', () => {
    it('sets activities from API', async () => {
      mockJsonResponse({ activities: [{ id: 'a1', action: 'created' }] })

      await useStore.getState().fetchActivities()

      expect(useStore.getState().activities).toHaveLength(1)
    })

    it('silently handles errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'))

      await useStore.getState().fetchActivities()

      expect(useStore.getState().error).toBeNull()
      expect(useStore.getState().activities).toEqual([])
    })
  })

  describe('deleteTask', () => {
    it('optimistically removes task and clears selection if matching', async () => {
      useStore.setState({
        tasks: [mockTask({ id: 't1' }), mockTask({ id: 't2' })],
        selectedTaskId: 't1',
      })

      mockJsonResponse({ ok: true })
      // For fetchActivities call
      mockJsonResponse({ activities: [] })

      const result = await useStore.getState().deleteTask('t1')

      expect(result.ok).toBe(true)
      expect(useStore.getState().tasks).toHaveLength(1)
      expect(useStore.getState().selectedTaskId).toBeNull()
    })

    it('rolls back on API error response', async () => {
      useStore.setState({
        tasks: [mockTask({ id: 't1' })],
      })

      mockJsonResponse({ ok: false, error: 'Not allowed' })
      // For fetchTasks rollback
      mockJsonResponse({ tasks: [{ id: 't1' }] })

      const result = await useStore.getState().deleteTask('t1')

      expect(result.ok).toBe(false)
      expect(result.error).toBe('Not allowed')
    })

    it('rolls back on network error', async () => {
      useStore.setState({
        tasks: [mockTask({ id: 't1' })],
      })

      mockFetch.mockRejectedValueOnce(new Error('network'))
      // For fetchTasks rollback
      mockJsonResponse({ tasks: [{ id: 't1' }] })

      const result = await useStore.getState().deleteTask('t1')

      expect(result.ok).toBe(false)
      expect(result.error).toBe('network')
    })
  })

  describe('fetchMessages', () => {
    it('sets selectedTaskMessages', async () => {
      mockJsonResponse({ messages: [{ id: 'm1', content: 'hi' }] })

      await useStore.getState().fetchMessages('t1')

      expect(useStore.getState().selectedTaskMessages).toHaveLength(1)
    })

    it('handles error silently', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'))

      await useStore.getState().fetchMessages('t1')

      expect(useStore.getState().selectedTaskMessages).toEqual([])
    })
  })

  describe('sendMessage', () => {
    it('appends message and refreshes activities', async () => {
      mockJsonResponse({ message: { id: 'm1', content: 'hello', from_agent_id: 'agent-1' } })
      // For fetchActivities call
      mockJsonResponse({ activities: [] })

      await useStore.getState().sendMessage('t1', 'agent-1', 'hello')

      expect(useStore.getState().selectedTaskMessages).toHaveLength(1)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('handles error silently', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'))

      await useStore.getState().sendMessage('t1', 'agent-1', 'hello')

      expect(useStore.getState().selectedTaskMessages).toEqual([])
    })
  })

  describe('fetchColumnSettings', () => {
    it('sets columnSettings', async () => {
      mockJsonResponse({ settings: { INBOX: 5, DONE: null } })

      await useStore.getState().fetchColumnSettings()

      expect(useStore.getState().columnSettings).toEqual({ INBOX: 5, DONE: null })
    })

    it('handles error silently', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'))

      await useStore.getState().fetchColumnSettings()

      expect(useStore.getState().columnSettings).toEqual({})
    })
  })

  describe('setColumnWipLimit', () => {
    it('optimistically updates and calls API', async () => {
      useStore.setState({ columnSettings: { INBOX: 3 } })

      mockJsonResponse({ ok: true })

      await useStore.getState().setColumnWipLimit('INBOX', 5)

      expect(useStore.getState().columnSettings.INBOX).toBe(5)
    })

    it('triggers rollback on error', async () => {
      useStore.setState({ columnSettings: { INBOX: 3 } })

      mockFetch.mockRejectedValueOnce(new Error('fail'))
      // fetchColumnSettings rollback (not awaited in source)
      mockJsonResponse({ settings: { INBOX: 3 } })

      await useStore.getState().setColumnWipLimit('INBOX', 10)

      // Optimistic update applied immediately
      expect(useStore.getState().columnSettings.INBOX).toBe(10)
      // fetchColumnSettings rollback was triggered (second fetch call)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('refresh', () => {
    it('calls all fetch actions in parallel', async () => {
      // fetchTasks
      mockJsonResponse({ tasks: [{ id: 't1' }] })
      // fetchAgents
      mockJsonResponse({ agents: [{ id: 'agent-1' }] })
      // fetchActivities
      mockJsonResponse({ activities: [] })
      // fetchColumnSettings
      mockJsonResponse({ settings: {} })
      // fetchProjects
      mockJsonResponse({ projects: [] })
      // fetchTagColors
      mockJsonResponse({ colors: {} })
      // fetchSavedFilters
      mockJsonResponse({ filters: [] })
      // fetchBoardColumns
      mockJsonResponse({ columns: [] })
      // fetchWorkspaces
      mockJsonResponse({ workspaces: [] })

      await useStore.getState().refresh()

      expect(mockFetch).toHaveBeenCalledTimes(9)
      expect(useStore.getState().tasks).toHaveLength(1)
    })
  })
})
