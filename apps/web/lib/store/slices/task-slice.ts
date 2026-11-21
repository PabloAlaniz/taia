import { api } from '@/lib/api'
import type { TaskSlice, SliceCreator } from '../types'

export const createTaskSlice: SliceCreator<TaskSlice> = (set, get) => ({
  tasks: [],
  loading: false,
  error: null,

  fetchTasks: async () => {
    try {
      const data = await api.tasks.list({ done_since_days: '3' })
      set({ tasks: data.tasks || [] })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  addTask: async (taskData) => {
    set({ loading: true })
    try {
      const data = await api.tasks.create({ ...taskData, created_by: 'web-ui' })
      if (data.task) {
        // The `task:created` broadcast can refresh the list before this
        // response lands; replace instead of appending a second copy.
        set((state) => ({
          tasks: [...state.tasks.filter((t) => t.id !== data.task.id), data.task],
        }))
        get().fetchActivities()
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      set({ loading: false })
    }
  },

  moveTask: async (taskId, newStatus) => {
    const prevTasks = get().tasks
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
    }))

    try {
      const result = await api.tasks.move(taskId, newStatus)
      if (result && !('ok' in result && result.ok === false)) {
        get().fetchActivities()
      }
    } catch (error) {
      set({ tasks: prevTasks })
      throw error
    }
  },

  deleteTask: async (taskId) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
      selectedTaskId: state.selectedTaskId === taskId ? null : state.selectedTaskId,
    }))

    try {
      const data = await api.tasks.delete(taskId)
      if (!data.ok) {
        get().fetchTasks()
        return { ok: false, error: data.error }
      }
      get().fetchActivities()
      return { ok: true }
    } catch (error) {
      get().fetchTasks()
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  },

  assignTask: async (taskId, agentId) => {
    set({ loading: true })
    try {
      const data = await api.tasks.assign(taskId, agentId)
      if (data.ok && data.task) {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === taskId ? data.task : t)),
          agents: state.agents.map((a) =>
            a.id === agentId ? { ...a, status: 'WORKING' as const } : a,
          ),
        }))
        get().fetchActivities()
        return { ok: true }
      } else {
        return { ok: false, error: data.error }
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      set({ loading: false })
    }
  },
})
