import { api } from '@/lib/api'
import type { WorkspaceSlice, SliceCreator } from '../types'

function getStoredWorkspaceId(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('taia-workspace') || 'ws-default'
  }
  return 'ws-default'
}

export const createWorkspaceSlice: SliceCreator<WorkspaceSlice> = (set, get) => ({
  workspaces: [],
  activeWorkspaceId: getStoredWorkspaceId(),
  boardColumns: [],

  fetchWorkspaces: async () => {
    try {
      const data = await api.workspaces.list()
      set({ workspaces: data.workspaces || [] })
    } catch (error) {
      console.error('Failed to fetch workspaces:', error)
    }
  },

  setActiveWorkspace: (id: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('taia-workspace', id)
    }
    set({ activeWorkspaceId: id })
    // Trigger full refresh to reload all data for the new workspace
    get().refresh()
  },

  fetchBoardColumns: async () => {
    try {
      const wsId = get().activeWorkspaceId
      const data = await api.workspaces.columns.list(wsId)
      set({ boardColumns: data.columns || [] })
    } catch (error) {
      console.error('Failed to fetch board columns:', error)
    }
  },

  createWorkspace: async (data) => {
    const result = await api.workspaces.create(data)
    const workspace = result.workspace
    await get().fetchWorkspaces()
    return workspace
  },
})
