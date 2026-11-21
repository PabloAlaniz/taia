import { api } from '@/lib/api'
import { getFallbackAgents } from '@taia/core/agents/metadata'
import type { DataSlice, SliceCreator } from '../types'

export const createDataSlice: SliceCreator<DataSlice> = (set, get) => ({
  agents: [],
  activities: [],
  projects: [],
  selectedTaskId: null,
  selectedTaskMessages: [],

  fetchAgents: async () => {
    try {
      const data = await api.agents.list()
      set({ agents: data.agents || [] })
    } catch {
      set({ agents: getFallbackAgents() })
    }
  },

  fetchActivities: async () => {
    try {
      const data = await api.activities.list()
      set({ activities: data.activities || [] })
    } catch (error) {
      console.error('Failed to fetch activities:', error)
    }
  },

  fetchProjects: async () => {
    try {
      const data = await api.projects.list()
      set({ projects: data.projects || [] })
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    }
  },

  selectTask: (taskId) => {
    set({ selectedTaskId: taskId, selectedTaskMessages: [] })
    if (taskId) {
      get().fetchMessages(taskId)
    }
  },

  fetchMessages: async (taskId) => {
    try {
      const data = await api.messages.list(taskId)
      set({ selectedTaskMessages: data.messages || [] })
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    }
  },

  sendMessage: async (taskId, fromAgentId, content) => {
    try {
      const data = await api.messages.create(taskId, fromAgentId, content)
      if (data.message) {
        set((state) => ({
          selectedTaskMessages: [...state.selectedTaskMessages, data.message],
        }))
        get().fetchActivities()
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  },
})
