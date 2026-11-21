// Domain types — single source of truth for all entities
// Consolidates types/index.ts + lib/db/index.ts duplicates

// === Agent ===

export type AgentStatus = 'IDLE' | 'WORKING' | 'BLOCKED' | 'OFFLINE'
export type AgentLiveStatus = 'live' | 'idle' | 'offline'
export type AgentType = 'cron' | 'api' | 'human' | 'orchestrator'

export interface Agent {
  id: string
  name: string
  role?: string
  status: AgentStatus
  avatar: string
  type?: AgentType
  enabled?: boolean
  currentTask?: string
  configured?: boolean
  config?: Record<string, unknown>
  nextRunIn?: string
  nextRunAtMs?: number
}

export interface AgentRecord {
  id: string
  name: string
  role?: string
  avatar?: string
  enabled: number | boolean
  type: AgentType
  config?: string
  sort_order: number
  /** FK to projects(id) when the agent has been assigned to one. */
  project_id?: string | null
  created_at: string
  updated_at: string
}

export interface AgentLiveData {
  agentId: string
  status: AgentLiveStatus
  sessionId?: string
  sessionKey?: string
  label?: string
  model?: string
  lastActivity?: number
  entries: TranscriptEntry[]
}

export interface TranscriptEntry {
  id: string
  role: 'user' | 'assistant'
  text?: string
  parts?: TranscriptPart[]
  model?: string
  timestamp?: string
}

export interface TranscriptPart {
  type: 'thinking' | 'text' | 'tool'
  text?: string
  name?: string
  preview?: string
}

// === Project ===

export interface Project {
  id: string
  name: string
  description?: string
  created_at: string
  updated_at: string
}

// === Repository ===

export interface Repository {
  id: string
  project_id: string
  name: string
  url: string
  is_primary: boolean
  created_at: string
}

// === Task ===

export type TaskStatus = string
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type Confidence = 'auto-merge' | 'notify-only' | 'needs-approval'

export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  confidence: Confidence
  assigned_to?: string
  created_by: string
  project?: string
  project_id?: string
  workspace_id?: string
  repo_url?: string
  primary_repo_url?: string
  session_key?: string
  tags?: string[]
  created_at: string
  updated_at: string
  started_at?: string | null
  completed_at?: string | null
  time_spent_minutes?: number
  due_date?: string
  estimated_minutes?: number
}

// === Message ===

export interface Message {
  id: string
  task_id: string
  from_agent_id: string
  content: string
  mentions?: string[]
  created_at: string
}

// === Task Trajectory ===

export interface TaskTrajectory {
  id: string
  workspace_id: string
  task_id: string
  actor: string
  decision: string
  reasoning?: string | null
  outcome?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
}

// === Subtask ===

export interface Subtask {
  id: string
  task_id: string
  title: string
  completed: boolean
  position: number
  created_at: string
}

// === Activity ===

export type ActivityType =
  // Tasks
  | 'task_created'
  | 'task_updated'
  | 'task_assigned'
  | 'task_moved'
  | 'task_completed'
  | 'task_deleted'
  | 'task_tagged'
  | 'task_untagged'
  // Subtasks
  | 'subtask_created'
  | 'subtask_completed'
  | 'subtask_deleted'
  // Projects
  | 'project_created'
  | 'project_updated'
  | 'project_deleted'
  // Messages & Agents
  | 'message_sent'
  | 'agent_started'
  | 'agent_finished'
  | 'agent_updated'
  | 'agent_triggered'
  // Dependencies
  | 'dependency_added'
  | 'dependency_removed'
  // Worktrees
  | 'worktree_created'
  | 'worktree_merged'
  | 'worktree_failed'
  // Other
  | 'mention'
  | 'consolidation'
  | 'alert'
  | 'retention_cleanup'

export interface Activity {
  id: string
  type: ActivityType
  agent_id?: string
  task_id?: string
  message: string
  metadata?: Record<string, unknown>
  created_at: string
}

// === Notification ===

export interface Notification {
  id: string
  idempotency_key: string
  mentioned_agent_id: string
  from_agent_id?: string
  task_id?: string
  source_message_id?: string
  content: string
  status: 'pending' | 'delivered' | 'failed'
  attempts: number
  last_attempt_at?: string
  next_retry_at?: string
  created_at: string
}

// === Column Settings ===

export interface ColumnSetting {
  id: string
  column_name: string
  wip_limit: number | null
  created_at: string
  updated_at: string
}

// === Settings ===

export interface Setting {
  key: string
  value: string
  created_at: string
  updated_at: string
}

// === Task Template ===

export interface TaskTemplate {
  id: string
  name: string
  description?: string
  default_status: TaskStatus
  default_priority: TaskPriority
  default_project?: string
  default_assigned_to?: string
  default_tags: string[]
  is_default: boolean
  created_at: string
  updated_at: string
}

// === Session Cost ===

export interface SessionCost {
  id: string
  session_key: string
  agent_id: string
  task_id?: string
  model: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  /** Anthropic prompt caching: tokens written to cache (billed ~1.25× input). */
  cache_creation_input_tokens: number
  /** Anthropic prompt caching: tokens served from cache (billed ~0.1× input). */
  cache_read_input_tokens: number
  estimated_cost_usd: number
  session_updated_at: number
  created_at: string
  updated_at: string
}

export interface CostSummary {
  total_tokens: number
  total_cost_usd: number
  session_count: number
  /**
   * Cache hit rate across the period — cache_read / (input + cache_read + cache_creation).
   * 0 when no cached tokens were observed (default for adapters without caching).
   */
  cache_hit_rate?: number
}

export interface AgentCostSummary extends CostSummary {
  agent_id: string
  by_model: { model: string; tokens: number; cost_usd: number }[]
}

export interface TaskCostBreakdown extends CostSummary {
  task_id: string
  sessions: SessionCost[]
}

export interface CostDashboardMetrics {
  totals: CostSummary
  by_model: { model: string; tokens: number; cost_usd: number }[]
  by_agent: AgentCostSummary[]
  daily_trend: { date: string; tokens: number; cost_usd: number }[]
}

// === Task Dependency ===

export interface TaskDependency {
  id: string
  task_id: string
  depends_on_task_id: string
  created_at: string
}

export interface TaskDependencyDetail extends TaskDependency {
  depends_on_title?: string
  depends_on_status?: TaskStatus
  task_title?: string
  task_status?: TaskStatus
}

// === Saved Filter ===

export interface SavedFilterConfig {
  status?: string
  priority?: string
  assigned_to?: string
  project_id?: string
  tags?: string[]
  q?: string
  assigned?: boolean // true = my tasks (current user)
  unassigned?: boolean // true = only unassigned
  due?: 'today' | 'overdue' | 'this-week'
  has_blockers?: boolean // true = tasks with unresolved blockers
}

export interface SavedFilter {
  id: string
  name: string
  icon?: string
  filter_config: SavedFilterConfig
  is_predefined: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// === Worktree ===

export type WorktreeStatus =
  | 'creating'
  | 'active'
  | 'reviewing'
  | 'merging'
  | 'merged'
  | 'failed'
  | 'cleanup'
export type MergeStrategy = 'merge' | 'squash' | 'rebase'

export interface Worktree {
  id: string
  task_id: string
  repository_id: string
  branch_name: string
  base_branch: string
  worktree_path?: string
  status: WorktreeStatus
  created_by?: string
  merge_strategy: MergeStrategy
  diff_stats?: DiffStats
  error_message?: string
  created_at: string
  updated_at: string
}

export interface DiffStats {
  files_changed: number
  insertions: number
  deletions: number
  files: DiffFileStat[]
}

export interface DiffFileStat {
  path: string
  insertions: number
  deletions: number
  status: 'added' | 'modified' | 'deleted' | 'renamed'
}

export interface DiffResult {
  stats: DiffStats
  unified_diff: string
  commits: DiffCommit[]
}

export interface DiffCommit {
  hash: string
  short_hash: string
  message: string
  author: string
  date: string
}

// === Workspace ===

export interface Workspace {
  id: string
  name: string
  slug: string
  description?: string
  icon?: string
  color?: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface BoardColumn {
  id: string
  workspace_id: string
  slug: string
  label: string
  icon?: string
  position: number
  is_done_state: boolean
  is_initial_state: boolean
  color?: string
  created_at?: string
  updated_at?: string
}

export interface WorkspacePreset {
  id: string
  name: string
  description?: string
  icon?: string
  columns: WorkspacePresetColumn[]
}

export interface WorkspacePresetColumn {
  slug: string
  label: string
  icon?: string
  is_done_state: boolean
  is_initial_state: boolean
}

// === Session ===

export interface SessionListItem {
  key: string
  sessionId: string
  /** Runtime instance the session lives on. */
  instanceId: string
  agentId: string
  agentName?: string
  agentAvatar?: string
  label?: string
  model?: string
  status: AgentLiveStatus
  totalTokens?: number
  inputTokens?: number
  outputTokens?: number
  estimatedCostUsd?: number
  updatedAt: number
  lastActivityAgo: string
  messageCount?: number
}

export interface ActiveSession extends SessionListItem {
  currentAction?: string
  recentTools: string[]
  messagePreview?: string
}

export interface SessionDetail {
  key: string
  sessionId: string
  /** Runtime instance the session lives on. */
  instanceId: string
  agentId: string
  agentName?: string
  model?: string
  label?: string
  status: AgentLiveStatus
  messages: TranscriptEntry[]
  totalTokens?: number
  estimatedCostUsd?: number
}

// === WebSocket ===

export type WSEventType =
  | 'connected'
  | 'task:created'
  | 'task:updated'
  | 'task:moved'
  | 'task:deleted'
  | 'agent:status'
  | 'activity:new'
  | 'worktree:created'
  | 'worktree:updated'
  | 'worktree:merged'
  | 'dependency:added'
  | 'dependency:removed'

export interface WSMessage {
  type: WSEventType
  payload: Record<string, unknown>
  timestamp: number
}
