import { api } from '@/lib/api'
import type { FeatureSlice, SliceCreator } from '../types'

export const createFeatureSlice: SliceCreator<FeatureSlice> = (set, get) => ({
  // --- Cost ---
  costDashboard: null,

  fetchCostDashboard: async (period) => {
    try {
      const data = await api.cost.dashboard(period)
      set({ costDashboard: data.metrics || null })
    } catch (error) {
      console.error('Failed to fetch cost dashboard:', error)
    }
  },

  syncCosts: async () => {
    try {
      await api.cost.sync()
      get().fetchCostDashboard()
    } catch (error) {
      console.error('Failed to sync costs:', error)
    }
  },

  // --- Worktrees ---
  activeWorktree: null,
  worktreeDiff: null,

  fetchWorktreeForTask: async (taskId) => {
    try {
      const data = await api.worktrees.list(taskId)
      const active = (data.worktrees || []).find(
        (w) => !['merged', 'failed', 'cleanup'].includes(w.status),
      )
      set({ activeWorktree: active || null, worktreeDiff: null })
    } catch {
      set({ activeWorktree: null })
    }
  },

  createWorktreeForTask: async (taskId) => {
    try {
      const data = await api.worktrees.create({ task_id: taskId })
      if (data.worktree) {
        set({ activeWorktree: data.worktree })
      }
    } catch (error) {
      console.error('Failed to create worktree:', error)
    }
  },

  performWorktreeAction: async (worktreeId, action, strategy) => {
    try {
      const data = await api.worktrees.action(worktreeId, action, strategy)
      if (data.worktree) {
        const isTerminal = ['merged', 'failed', 'cleanup'].includes(data.worktree.status)
        set({ activeWorktree: isTerminal ? null : data.worktree })
      }
    } catch (error) {
      console.error('Failed to perform worktree action:', error)
    }
  },

  fetchWorktreeDiff: async (worktreeId) => {
    try {
      const data = await api.worktrees.diff(worktreeId)
      set({ worktreeDiff: data.diff || null })
    } catch (error) {
      console.error('Failed to fetch worktree diff:', error)
    }
  },

  // --- Saved Filters ---
  savedFilters: [],
  activeFilterId: null,

  fetchSavedFilters: async () => {
    try {
      const data = await api.filters.list()
      set({ savedFilters: data.filters || [] })
    } catch {
      set({ savedFilters: [] })
    }
  },

  setActiveFilter: (filterId) => {
    set({ activeFilterId: filterId })
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (filterId) {
        url.searchParams.set('filter', filterId)
      } else {
        url.searchParams.delete('filter')
      }
      window.history.replaceState({}, '', url.toString())
    }
  },

  createSavedFilter: async (data) => {
    try {
      await api.filters.create(data)
      get().fetchSavedFilters()
    } catch (error) {
      console.error('Failed to create filter:', error)
    }
  },

  deleteSavedFilter: async (filterId) => {
    try {
      await api.filters.delete(filterId)
      if (get().activeFilterId === filterId) {
        set({ activeFilterId: null })
      }
      get().fetchSavedFilters()
    } catch (error) {
      console.error('Failed to delete filter:', error)
    }
  },

  // --- Dependencies ---
  taskBlockers: [],
  taskDependents: [],

  fetchDependencies: async (taskId) => {
    try {
      const data = await api.dependencies.list(taskId)
      set({
        taskBlockers: data.blockers || [],
        taskDependents: data.dependents || [],
      })
    } catch {
      set({ taskBlockers: [], taskDependents: [] })
    }
  },

  addDependency: async (taskId, dependsOnTaskId) => {
    try {
      const data = await api.dependencies.add(taskId, dependsOnTaskId)
      if (data.ok) {
        get().fetchDependencies(taskId)
        return { ok: true }
      }
      return { ok: false, error: 'Failed to add dependency' }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to add dependency',
      }
    }
  },

  removeDependency: async (taskId, dependsOnTaskId) => {
    try {
      const data = await api.dependencies.remove(taskId, dependsOnTaskId)
      if (data.ok) {
        get().fetchDependencies(taskId)
        return { ok: true }
      }
      return { ok: false, error: 'Failed to remove dependency' }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to remove dependency',
      }
    }
  },
})
