import { create } from 'zustand'
import type { Store } from './types'
import { createTaskSlice } from './slices/task-slice'
import { createDataSlice } from './slices/data-slice'
import { createBoardSlice } from './slices/board-slice'
import { createFeatureSlice } from './slices/feature-slice'
import { createWorkspaceSlice } from './slices/workspace-slice'
import { createUserSlice } from './slices/user-slice'

export type { GroupBy } from './types'

export const useStore = create<Store>((set, get) => ({
  ...createTaskSlice(set, get),
  ...createDataSlice(set, get),
  ...createBoardSlice(set, get),
  ...createFeatureSlice(set, get),
  ...createWorkspaceSlice(set, get),
  ...createUserSlice(set, get),

  refresh: async () => {
    await Promise.all([
      get().fetchTasks(),
      get().fetchAgents(),
      get().fetchActivities(),
      get().fetchColumnSettings(),
      get().fetchProjects(),
      get().fetchTagColors(),
      get().fetchSavedFilters(),
      get().fetchBoardColumns(),
      get().fetchWorkspaces(),
    ])
  },
}))
