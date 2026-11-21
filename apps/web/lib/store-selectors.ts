// Granular store selectors — prevent unnecessary re-renders
// Use these instead of accessing the full store when you only need a slice

import { useStore } from './store'
import { useShallow } from 'zustand/react/shallow'
import type { TaskStatus } from '@taia/types'

// === Data selectors ===

export const useAgents = () => useStore((s) => s.agents)
export const useTasks = () => useStore((s) => s.tasks)
export const useActivities = () => useStore((s) => s.activities)
export const useLoading = () => useStore((s) => s.loading)
export const useError = () => useStore((s) => s.error)
export const useColumnSettings = () => useStore((s) => s.columnSettings)
export const useActiveFilterConfig = () => useStore((s) => s.activeFilterConfig)
export const useSetFilterField = () => useStore((s) => s.setFilterField)
export const useClearFilters = () => useStore((s) => s.clearFilters)
export const useLoadSavedFilter = () => useStore((s) => s.loadSavedFilter)
export const useProjects = () => useStore((s) => s.projects)
export const useSelectedProjectId = () => useStore((s) => s.selectedProjectId)
export const useSetSelectedProject = () => useStore((s) => s.setSelectedProject)

export const useCostDashboard = () => useStore((s) => s.costDashboard)

export const useActiveWorktree = () => useStore((s) => s.activeWorktree)
export const useWorktreeDiff = () => useStore((s) => s.worktreeDiff)

// === Computed selectors ===

export const useTasksByStatus = (status: TaskStatus) =>
  useStore((s) => s.tasks.filter((t) => t.status === status))

export const useTaskById = (id: string | null) =>
  useStore((s) => (id ? s.tasks.find((t) => t.id === id) : undefined))

export const useAgentById = (id: string | null) =>
  useStore((s) => (id ? s.agents.find((a) => a.id === id) : undefined))

export const useSelectedTask = () =>
  useStore((s) => ({
    taskId: s.selectedTaskId,
    messages: s.selectedTaskMessages,
  }))

// === Workspace selectors ===

export const useWorkspaces = () => useStore((s) => s.workspaces)
export const useActiveWorkspaceId = () => useStore((s) => s.activeWorkspaceId)
export const useActiveWorkspace = () =>
  useStore((s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId))
export const useBoardColumns = () => useStore((s) => s.boardColumns)
export const useDoneColumnSlugs = () =>
  useStore((s) => s.boardColumns.filter((c) => c.is_done_state).map((c) => c.slug))
export const useInitialColumnSlug = () =>
  useStore((s) => s.boardColumns.find((c) => c.is_initial_state)?.slug || 'INBOX')
export const useSetActiveWorkspace = () => useStore((s) => s.setActiveWorkspace)

// === User selectors ===

export const useCurrentUserId = () => useStore((s) => s.currentUserId)
export const useSetCurrentUser = () => useStore((s) => s.setCurrentUser)
export const useCurrentUserAgent = () =>
  useStore((s) => (s.currentUserId ? s.agents.find((a) => a.id === s.currentUserId) : undefined))
export const useHumanAgents = () =>
  useStore(useShallow((s) => s.agents.filter((a) => a.type === 'human')))

// === Action selectors (stable references, won't cause re-renders) ===

export const useStoreActions = () =>
  useStore((s) => ({
    fetchTasks: s.fetchTasks,
    fetchAgents: s.fetchAgents,
    fetchActivities: s.fetchActivities,
    fetchProjects: s.fetchProjects,
    addTask: s.addTask,
    moveTask: s.moveTask,
    deleteTask: s.deleteTask,
    assignTask: s.assignTask,
    refresh: s.refresh,
    selectTask: s.selectTask,
    fetchMessages: s.fetchMessages,
    sendMessage: s.sendMessage,
    fetchColumnSettings: s.fetchColumnSettings,
    setColumnWipLimit: s.setColumnWipLimit,
  }))
