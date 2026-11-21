import { api } from '@/lib/api'
import type { BoardSlice, GroupBy, SliceCreator } from '../types'

export const createBoardSlice: SliceCreator<BoardSlice> = (set, get) => ({
  activeFilterConfig: {},
  setFilterField: (key, value) =>
    set((state) => {
      const next = { ...state.activeFilterConfig }
      if (
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
      ) {
        delete (next as Record<string, unknown>)[key as string]
      } else {
        ;(next as Record<string, unknown>)[key as string] = value
      }
      return { activeFilterConfig: next, activeFilterId: null }
    }),
  clearFilters: () => set({ activeFilterConfig: {}, activeFilterId: null }),
  loadSavedFilter: (filter) =>
    set({
      activeFilterConfig: { ...filter.filter_config },
      activeFilterId: filter.id,
    }),

  selectedProjectId: null,
  setSelectedProject: (id) => set({ selectedProjectId: id }),

  groupBy:
    (typeof window !== 'undefined' ? (localStorage.getItem('taia-group-by') as GroupBy) : null) ||
    'none',
  setGroupBy: (groupBy) => {
    if (typeof window !== 'undefined') localStorage.setItem('taia-group-by', groupBy)
    set({ groupBy })
  },

  columnSettings: {},
  tagColors: {},

  fetchColumnSettings: async () => {
    try {
      const data = await api.columns.list()
      set({ columnSettings: data.settings || {} })
    } catch (error) {
      console.error('Failed to fetch column settings:', error)
    }
  },

  setColumnWipLimit: async (columnName, wipLimit) => {
    set((state) => ({
      columnSettings: { ...state.columnSettings, [columnName]: wipLimit },
    }))
    try {
      await api.columns.setWipLimit(columnName, wipLimit)
    } catch (error) {
      console.error('Failed to set WIP limit:', error)
      get().fetchColumnSettings()
    }
  },

  fetchTagColors: async () => {
    try {
      const data = await api.tagColors.list()
      set({ tagColors: data.colors || {} })
    } catch (error) {
      console.error('Failed to fetch tag colors:', error)
    }
  },

  setTagColor: async (tag, color) => {
    set((state) => {
      const tagColors = { ...state.tagColors }
      if (color === null) {
        delete tagColors[tag]
      } else {
        tagColors[tag] = color
      }
      return { tagColors }
    })
    try {
      const data = await api.tagColors.set(tag, color)
      set({ tagColors: data.colors || {} })
    } catch (error) {
      console.error('Failed to set tag color:', error)
      get().fetchTagColors()
    }
  },
})
