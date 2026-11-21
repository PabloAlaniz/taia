import type {
  Agent,
  Task,
  TaskStatus,
  Message,
  Activity,
  Project,
  CostDashboardMetrics,
  Worktree,
  DiffResult,
  TaskDependencyDetail,
  SavedFilter,
  SavedFilterConfig,
  Workspace,
  BoardColumn,
} from '@taia/types'

export type GroupBy = 'none' | 'agent' | 'project' | 'priority'

// --- Slice interfaces ---

export interface TaskSlice {
  tasks: Task[]
  loading: boolean
  error: string | null
  fetchTasks: () => Promise<void>
  addTask: (task: Partial<Task>) => Promise<void>
  moveTask: (taskId: string, newStatus: TaskStatus) => Promise<void>
  deleteTask: (taskId: string) => Promise<{ ok: boolean; error?: string }>
  assignTask: (taskId: string, agentId: string) => Promise<{ ok: boolean; error?: string }>
}

export interface DataSlice {
  agents: Agent[]
  activities: Activity[]
  projects: Project[]
  selectedTaskId: string | null
  selectedTaskMessages: Message[]
  fetchAgents: () => Promise<void>
  fetchActivities: () => Promise<void>
  fetchProjects: () => Promise<void>
  selectTask: (taskId: string | null) => void
  fetchMessages: (taskId: string) => Promise<void>
  sendMessage: (taskId: string, fromAgentId: string, content: string) => Promise<void>
}

export interface BoardSlice {
  activeFilterConfig: SavedFilterConfig
  setFilterField: <K extends keyof SavedFilterConfig>(key: K, value: SavedFilterConfig[K]) => void
  clearFilters: () => void
  loadSavedFilter: (filter: SavedFilter) => void
  selectedProjectId: string | null
  setSelectedProject: (id: string | null) => void
  groupBy: GroupBy
  setGroupBy: (groupBy: GroupBy) => void
  columnSettings: Record<string, number | null>
  tagColors: Record<string, string>
  fetchColumnSettings: () => Promise<void>
  setColumnWipLimit: (columnName: string, wipLimit: number | null) => Promise<void>
  fetchTagColors: () => Promise<void>
  setTagColor: (tag: string, color: string | null) => Promise<void>
}

export interface FeatureSlice {
  costDashboard: CostDashboardMetrics | null
  fetchCostDashboard: (period?: string) => Promise<void>
  syncCosts: () => Promise<void>
  activeWorktree: Worktree | null
  worktreeDiff: DiffResult | null
  fetchWorktreeForTask: (taskId: string) => Promise<void>
  createWorktreeForTask: (taskId: string) => Promise<void>
  performWorktreeAction: (worktreeId: string, action: string, strategy?: string) => Promise<void>
  fetchWorktreeDiff: (worktreeId: string) => Promise<void>
  savedFilters: SavedFilter[]
  activeFilterId: string | null
  fetchSavedFilters: () => Promise<void>
  setActiveFilter: (filterId: string | null) => void
  createSavedFilter: (data: {
    name: string
    icon?: string
    filter_config: SavedFilterConfig
  }) => Promise<void>
  deleteSavedFilter: (filterId: string) => Promise<void>
  taskBlockers: TaskDependencyDetail[]
  taskDependents: TaskDependencyDetail[]
  fetchDependencies: (taskId: string) => Promise<void>
  addDependency: (
    taskId: string,
    dependsOnTaskId: string,
  ) => Promise<{ ok: boolean; error?: string }>
  removeDependency: (
    taskId: string,
    dependsOnTaskId: string,
  ) => Promise<{ ok: boolean; error?: string }>
}

export interface WorkspaceSlice {
  workspaces: Workspace[]
  activeWorkspaceId: string
  boardColumns: BoardColumn[]
  fetchWorkspaces: () => Promise<void>
  setActiveWorkspace: (id: string) => void
  fetchBoardColumns: () => Promise<void>
  createWorkspace: (data: {
    name: string
    description?: string
    icon?: string
    color?: string
    preset_id?: string
  }) => Promise<Workspace>
}

export interface UserSlice {
  currentUserId: string | null
  setCurrentUser: (agentId: string | null) => void
}

export interface RefreshSlice {
  refresh: () => Promise<void>
}

export type Store = TaskSlice &
  DataSlice &
  BoardSlice &
  FeatureSlice &
  WorkspaceSlice &
  UserSlice &
  RefreshSlice

// Zustand slice creator type
export type SliceCreator<T> = (
  set: (partial: Partial<Store> | ((state: Store) => Partial<Store>)) => void,
  get: () => Store,
) => T
