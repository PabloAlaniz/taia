// Database facade — re-exports from repositories
// All consumers import from here. Function names unchanged = zero breakage.

// Types (re-exported for backward compatibility)
export type {
  Task,
  TaskStatus,
  TaskPriority,
  Confidence,
  Message,
  AgentRecord,
  AgentType,
  Activity,
  Notification,
  Subtask,
  ColumnSetting,
  Setting,
  Project,
  Repository,
  TaskDependency,
  TaskDependencyDetail,
  SavedFilter,
  SavedFilterConfig,
} from '@taia/types'

// Pool (for direct access if needed)
export { pool } from './pool'

// Tasks
export {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  assignTask,
  moveTask,
} from './repositories/task.repository'

// Agents
export {
  getAllAgents,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent,
  reorderAgents,
} from './repositories/agent.repository'

// Messages
export {
  getMessagesForTask,
  createMessage,
} from './repositories/message.repository'

// Activities
export {
  getActivities,
  getBoardActivities,
  logActivity,
} from './repositories/activity.repository'

// Notifications
export {
  getUndeliveredNotifications,
  getNotificationsForAgent,
  markNotificationDelivered,
  markNotificationFailed,
  incrementNotificationAttempt,
  createNotification,
} from './repositories/notification.repository'

// Subtasks
export {
  getSubtasksForTask,
  getSubtaskById,
  createSubtask,
  updateSubtask,
  deleteSubtask,
  reorderSubtasks,
} from './repositories/subtask.repository'

// Column Settings
export {
  getColumnSettings,
  getColumnSetting,
  setColumnWipLimit,
  deleteColumnSetting,
} from './repositories/column-setting.repository'

// Settings
export {
  getSetting,
  getSettings,
  setSetting,
  deleteSetting,
} from './repositories/setting.repository'

// Projects
export {
  getAllProjects,
  getProjectById,
  getProjectByIdFull,
  createProject,
  updateProject,
  updateProjectKnowledge,
  deleteProject,
  getProjectSummaries,
} from './repositories/project.repository'
export type { ProjectRow, ProjectSummary } from './repositories/project.repository'

// Agent context (typed bundle persistence)
export {
  getAgentContext,
  ensureAgentContextRow,
  setActiveAgentIdentityVersion,
  setActiveProjectContextVersion,
  setActiveUserProfileVersion,
} from './repositories/agent-context.repository'
export type { AgentContextRow } from './repositories/agent-context.repository'

export {
  insertAgentIdentityVersion,
  getAgentIdentityVersion,
  listAgentIdentityVersions,
  insertProjectContextVersion,
  getProjectContextVersion,
  listProjectContextVersions,
  getLatestProjectContextVersion,
  insertUserProfileVersion,
  getUserProfileVersion,
  getLatestUserProfileVersion,
  listUserProfileVersions,
} from './repositories/agent-context-version.repository'
export type {
  AgentIdentityVersionRow,
  ProjectContextVersionRow,
  UserProfileVersionRow,
} from './repositories/agent-context-version.repository'

// Repositories
export {
  getRepositoriesForProject,
  getRepositoryById,
  getPrimaryRepository,
  createRepository,
  updateRepository,
  deleteRepository,
} from './repositories/repository.repository'

// Tag Colors
export {
  getAllTagColors,
  getTagColor,
  setTagColor,
  deleteTagColor,
  setTagColors,
} from './repositories/tag-color.repository'

// Task Templates
export {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from './repositories/task-template.repository'

// Session Costs
export {
  upsertSessionCost,
  getSessionCost,
  getTaskCost,
  getTaskCosts,
  getTaskSessionCosts,
  getAgentCostSummary,
  getCostDashboard,
  getLatestSessionUpdatedAt,
} from './repositories/session-cost.repository'

// Runtime Sessions (provider-agnostic conversation storage for stateless adapters)
export {
  createRuntimeSession,
  getRuntimeSession,
  updateRuntimeSession,
  listRuntimeSessions,
  appendRuntimeMessage,
  getRuntimeMessages,
  deleteRuntimeSession,
} from './repositories/runtime-session.repository'
export type {
  RuntimeSessionRow,
  RuntimeMessageRow,
  ListRuntimeSessionsOptions,
  UpdateRuntimeSessionInput,
} from './repositories/runtime-session.repository'

// Agent memory (Anthropic memory tool backing store)
export {
  getAgentMemory,
  listAgentMemories,
  createAgentMemory,
  updateAgentMemoryContent,
  renameAgentMemory,
  deleteAgentMemory,
  upsertAgentMemory,
} from './repositories/agent-memory.repository'
export type { AgentMemoryRow } from './repositories/agent-memory.repository'

// Agent working state (progress notes between runs; formerly WORKING.md)
export {
  getAgentWorkingState,
  upsertAgentWorkingState,
} from './repositories/agent-working-state.repository'
export type { AgentWorkingStateRow } from './repositories/agent-working-state.repository'

// Context sync ledger (what was last pushed to file-based runtimes)
export {
  getAgentContextSync,
  upsertAgentContextSync,
} from './repositories/agent-context-sync.repository'
export type {
  AgentContextSyncRow,
  AgentContextSyncStatus,
  AgentContextSyncWrite,
} from './repositories/agent-context-sync.repository'

// Desired runtime settings per agent (model, denied tools, workspace)
export {
  getAgentRuntimeInstanceId,
  getAgentRuntimeSettingsRow,
  listAgentRuntimeInstanceIds,
  setAgentRuntimeInstanceId,
  upsertAgentRuntimeSettings,
} from './repositories/agent-runtime-settings.repository'
export type { AgentRuntimeSettingsRow } from './repositories/agent-runtime-settings.repository'

// Named runtime instances
export {
  getRuntimeInstance,
  listRuntimeInstances,
  upsertRuntimeInstance,
} from './repositories/runtime-instance.repository'
export type { RuntimeInstanceRow } from './repositories/runtime-instance.repository'

// Approval requests (Approvals capability)
export {
  createApprovalRequest,
  getApprovalRequest,
  getPendingApprovalForToolUse,
  listApprovalRequests,
  decideApproval,
} from './repositories/approval-request.repository'
export type {
  ApprovalRequestRow,
  ApprovalStatus,
} from './repositories/approval-request.repository'

// Worktrees
export {
  getWorktreeById,
  getWorktreesForTask,
  getActiveWorktreeForTask,
  getWorktreesByStatus,
  getAllActiveWorktrees,
  createWorktreeRecord,
  updateWorktreeStatus,
  deleteWorktreeRecord,
} from './repositories/worktree.repository'

// Saved Filters
export {
  getAllSavedFilters,
  getSavedFilterById,
  createSavedFilter,
  updateSavedFilter,
  deleteSavedFilter,
} from './repositories/saved-filter.repository'

// Task Dependencies
export {
  getBlockersForTask,
  getDependentsOfTask,
  addDependency,
  removeDependencyById,
  removeDependency,
  wouldCreateCycle,
  areAllBlockersResolved,
  getUnresolvedBlockerCount,
} from './repositories/task-dependency.repository'

// Workspaces
export {
  getAllWorkspaces,
  getWorkspaceById,
  getWorkspaceBySlug,
  getDefaultWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from './repositories/workspace.repository'

// Workspace Agents
export {
  getAgentsForWorkspace,
  getWorkspacesForAgent,
  addAgentToWorkspace,
  removeAgentFromWorkspace,
  setWorkspaceAgents,
} from './repositories/workspace-agent.repository'

// Board Columns
export {
  getColumnsForWorkspace,
  getColumnById,
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumns,
  getDoneStateSlugs,
  getColumnStates,
  getInitialSlug,
} from './repositories/board-column.repository'
