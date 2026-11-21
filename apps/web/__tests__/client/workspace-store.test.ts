import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/lib/store'

const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock localStorage for Node environment
const localStorageMap = new Map<string, string>()
const mockLocalStorage = {
  getItem: (key: string) => localStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageMap.set(key, value),
  removeItem: (key: string) => localStorageMap.delete(key),
  clear: () => localStorageMap.clear(),
}

// Store original globals for cleanup
const originalWindow = globalThis.window
const originalLocalStorage = globalThis.localStorage

beforeAll(() => {
  // Define window and localStorage globals for the workspace slice guards
  ;(globalThis as any).window = globalThis
  ;(globalThis as any).localStorage = mockLocalStorage
})

afterAll(() => {
  // Restore original globals
  if (originalWindow === undefined) {
    delete (globalThis as any).window
  } else {
    ;(globalThis as any).window = originalWindow
  }
  if (originalLocalStorage === undefined) {
    delete (globalThis as any).localStorage
  } else {
    ;(globalThis as any).localStorage = originalLocalStorage
  }
})

function mockJsonResponse(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => data,
  })
}

/**
 * Mock enough fetch responses for the refresh() call.
 * refresh() calls 9 fetches in parallel:
 *   fetchTasks, fetchAgents, fetchActivities, fetchColumnSettings,
 *   fetchProjects, fetchTagColors, fetchSavedFilters, fetchBoardColumns, fetchWorkspaces
 */
function mockRefreshResponses() {
  mockJsonResponse({ tasks: [] })
  mockJsonResponse({ agents: [] })
  mockJsonResponse({ activities: [] })
  mockJsonResponse({ settings: {} })
  mockJsonResponse({ projects: [] })
  mockJsonResponse({ colors: {} })
  mockJsonResponse({ filters: [] })
  mockJsonResponse({ columns: [] })
  mockJsonResponse({ workspaces: [] })
}

const resetStore = () => {
  useStore.setState({
    workspaces: [],
    activeWorkspaceId: 'ws-default',
    boardColumns: [],
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

describe('workspace store slice', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
    localStorageMap.clear()
  })

  describe('activeWorkspaceId default', () => {
    it('defaults to ws-default', () => {
      expect(useStore.getState().activeWorkspaceId).toBe('ws-default')
    })
  })

  describe('fetchWorkspaces', () => {
    it('sets workspaces from API response', async () => {
      mockJsonResponse({
        workspaces: [
          { id: 'ws-1', name: 'Workspace 1' },
          { id: 'ws-2', name: 'Workspace 2' },
        ],
      })

      await useStore.getState().fetchWorkspaces()

      expect(useStore.getState().workspaces).toHaveLength(2)
      expect(useStore.getState().workspaces[0].id).toBe('ws-1')
      expect(useStore.getState().workspaces[1].id).toBe('ws-2')
    })

    it('handles API error gracefully (empty array stays)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network down'))

      await useStore.getState().fetchWorkspaces()

      expect(useStore.getState().workspaces).toEqual([])
    })
  })

  describe('setActiveWorkspace', () => {
    it('updates activeWorkspaceId and saves to localStorage', () => {
      mockRefreshResponses()

      useStore.getState().setActiveWorkspace('ws-custom')

      expect(useStore.getState().activeWorkspaceId).toBe('ws-custom')
      expect(mockLocalStorage.getItem('taia-workspace')).toBe('ws-custom')
    })

    it('calls refresh', async () => {
      mockRefreshResponses()

      useStore.getState().setActiveWorkspace('ws-new')

      // refresh() triggers 9 fetch calls in parallel
      // Wait for all promises to settle
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(9)
      })
    })
  })

  describe('fetchBoardColumns', () => {
    it('uses activeWorkspaceId and sets boardColumns', async () => {
      useStore.setState({ activeWorkspaceId: 'ws-project' })

      mockJsonResponse({
        columns: [
          { id: 'col-1', slug: 'TODO', label: 'To Do', position: 0 },
          { id: 'col-2', slug: 'DONE', label: 'Done', position: 1 },
        ],
      })

      await useStore.getState().fetchBoardColumns()

      expect(useStore.getState().boardColumns).toHaveLength(2)
      expect(useStore.getState().boardColumns[0].slug).toBe('TODO')
      expect(useStore.getState().boardColumns[1].slug).toBe('DONE')

      // Verify the fetch URL includes the active workspace ID
      const fetchUrl = mockFetch.mock.calls[0][0]
      expect(fetchUrl).toContain('ws-project')
    })

    it('handles API error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('server error'))

      await useStore.getState().fetchBoardColumns()

      expect(useStore.getState().boardColumns).toEqual([])
    })
  })

  describe('createWorkspace', () => {
    it('calls API and refreshes workspaces list', async () => {
      // First call: api.workspaces.create
      mockJsonResponse({
        ok: true,
        workspace: { id: 'ws-new', name: 'New Workspace' },
      })
      // Second call: fetchWorkspaces (triggered by createWorkspace internally)
      mockJsonResponse({
        workspaces: [
          { id: 'ws-default', name: 'Default' },
          { id: 'ws-new', name: 'New Workspace' },
        ],
      })

      const workspace = await useStore.getState().createWorkspace({
        name: 'New Workspace',
        description: 'A test workspace',
        icon: '🚀',
      })

      expect(workspace.id).toBe('ws-new')
      expect(workspace.name).toBe('New Workspace')

      // Verify workspaces were refreshed
      expect(useStore.getState().workspaces).toHaveLength(2)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})
