// Zod schemas for API request validation

import { z } from 'zod'

// === Shared enums ===

// Statuses are the slugs of the workspace's columns (dynamic per preset);
// task.service checks that the slug exists in the task's workspace.
const TaskStatusEnum = z.string().trim().min(1).max(100)

const TaskPriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])

const ConfidenceEnum = z.enum(['auto-merge', 'notify-only', 'needs-approval'])

const AgentTypeEnum = z.enum(['cron', 'api', 'human', 'orchestrator'])

// === Task schemas ===

export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(5000).optional(),
  status: TaskStatusEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  confidence: ConfidenceEnum.optional(),
  project: z.string().max(200).optional(),
  project_id: z.string().max(200).optional(),
  repo_url: z.string().url().optional().or(z.literal('')),
  tags: z.array(z.string().max(50)).optional(),
  assigned_to: z.string().max(50).optional(),
  created_by: z.string().min(1).max(100),
  workspace_id: z.string().optional(),
})

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  status: TaskStatusEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  confidence: ConfidenceEnum.optional(),
  project: z.string().max(200).optional(),
  project_id: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  repo_url: z
    .string()
    .url()
    .optional()
    .or(z.literal(''))
    .or(z.null())
    .transform((v) => v ?? undefined),
  assigned_to: z.string().max(50).optional(),
  session_key: z.string().optional(),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  time_spent_minutes: z.number().min(0).optional(),
  due_date: z.string().optional(),
  estimated_minutes: z.number().min(0).optional(),
  tags: z.array(z.string().max(50)).optional(),
  workspace_id: z.string().optional(),
})

export const MoveTaskSchema = z.object({
  action: z.literal('move'),
  taskId: z.string().min(1),
  status: TaskStatusEnum,
  agentId: z.string().optional(),
})

export const TaskActionSchema = z.discriminatedUnion('action', [
  MoveTaskSchema,
  z.object({
    action: z.literal('create'),
    task: CreateTaskSchema,
  }),
  z.object({
    action: z.literal('update'),
    taskId: z.string().min(1),
    updates: UpdateTaskSchema,
  }),
])

// === Message schemas ===

// Used by nested route /api/tasks/[taskId]/messages - task_id comes from URL params
export const CreateMessageSchema = z
  .object({
    from_agent_id: z.string().min(1).optional(),
    fromAgentId: z.string().min(1).optional(),
    content: z.string().min(1, 'Content is required').max(10000),
  })
  .refine((data) => data.from_agent_id || data.fromAgentId, {
    message: 'from_agent_id is required',
    path: ['from_agent_id'],
  })

// === Agent schemas ===

export const CreateAgentSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(100),
  role: z.string().max(200).optional(),
  avatar: z.string().max(10).optional(),
  type: AgentTypeEnum.optional(),
})

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.string().max(200).optional(),
  avatar: z.string().max(10).optional(),
  enabled: z.union([z.boolean(), z.number()]).optional(),
  type: AgentTypeEnum.optional(),
  config: z.string().optional(),
  sort_order: z.number().optional(),
})

// === Subtask schemas ===

export const CreateSubtaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
})

export const UpdateSubtaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  completed: z.boolean().optional(),
  position: z.number().min(0).optional(),
})

export const ReorderSubtasksSchema = z.object({
  order: z.array(z.string().min(1)).min(1, 'Order array is required'),
})

// === Column settings ===

export const SetWipLimitSchema = z.object({
  wip_limit: z.number().int().min(1).nullable(),
})

// === Notification schemas ===

export const NotificationActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('deliver'),
    notificationId: z.string().min(1),
  }),
  z.object({
    action: z.literal('fail'),
    notificationId: z.string().min(1),
    attempts: z.number().optional(),
  }),
  z.object({
    action: z.literal('retry'),
    notificationId: z.string().min(1),
    attempts: z.number(),
    nextRetryAt: z.string(),
  }),
  z.object({
    action: z.literal('create'),
    mentioned_agent_id: z.string().min(1),
    from_agent_id: z.string().optional(),
    task_id: z.string().optional(),
    content: z.string().min(1, 'Content is required'),
  }),
])

// === Task assign ===

export const AssignTaskSchema = z.object({
  taskId: z.string().min(1, 'taskId is required'),
  agentId: z.string().min(1, 'agentId is required'),
})

// === Tags ===

export const TaskTagsSchema = z.object({
  tags: z.array(z.string().max(50)).min(1),
})

// === Task template schemas ===

export const CreateTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(5000).optional(),
  default_status: TaskStatusEnum.optional(),
  default_priority: TaskPriorityEnum.optional(),
  default_project: z.string().max(200).optional(),
  default_assigned_to: z.string().max(50).optional(),
  default_tags: z.array(z.string().max(50)).optional(),
})

export const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z
    .string()
    .max(5000)
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  default_status: TaskStatusEnum.optional(),
  default_priority: TaskPriorityEnum.optional(),
  default_project: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  default_assigned_to: z
    .string()
    .max(50)
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  default_tags: z.array(z.string().max(50)).optional(),
})

// === Agent reorder ===

export const ReorderAgentsSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
})

// === Project schemas ===

export const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional(),
})

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z
    .string()
    .max(1000)
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
})

// === Cron schemas ===

// 5-field cron: minute hour day-of-month month day-of-week
// Each field: * | */N | N | N-N | N,N | N/N or combinations
const CRON_REGEX =
  /^(\*(?:\/\d+)?|[0-9,\-/]+)\s+(\*(?:\/\d+)?|[0-9,\-/]+)\s+(\*(?:\/\d+)?|[0-9,\-/]+)\s+(\*(?:\/\d+)?|[0-9,\-/]+)\s+(\*(?:\/\d+)?|[0-9,\-/]+)$/

export const CronExpressionSchema = z
  .string()
  .regex(CRON_REGEX, 'Invalid cron expression (5 fields required)')

export const CreateCronSchema = z.object({
  schedule: CronExpressionSchema,
  enabled: z.boolean().optional(),
  timeoutSeconds: z.number().int().min(30).max(3600).optional(),
})

export const UpdateCronSchema = z.object({
  enabled: z.boolean().optional(),
  schedule: CronExpressionSchema.optional(),
  timeoutSeconds: z.number().int().min(30).max(3600).optional(),
})

// === Cost schemas ===

export const CostDashboardQuerySchema = z.object({
  period: z.enum(['24h', 'week', 'month', 'all']).optional().default('all'),
})

export const CostSyncSchema = z.object({
  agentId: z.string().min(1).optional(),
})

// === Repository schemas ===

export const CreateRepositorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  url: z.string().url('Must be a valid URL'),
  is_primary: z.boolean().optional(),
})

export const UpdateRepositorySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  url: z.string().url('Must be a valid URL').optional(),
  is_primary: z.boolean().optional(),
})

// === Saved filter schemas ===

const FilterConfigSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  assigned_to: z.string().optional(),
  project_id: z.string().optional(),
  tags: z.array(z.string()).optional(),
  q: z.string().optional(),
  assigned: z.boolean().optional(),
  unassigned: z.boolean().optional(),
  due: z.enum(['today', 'overdue', 'this-week']).optional(),
  has_blockers: z.boolean().optional(),
})

export const CreateSavedFilterSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  icon: z.string().max(10).optional(),
  filter_config: FilterConfigSchema,
})

export const UpdateSavedFilterSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  icon: z.string().max(10).optional(),
  filter_config: FilterConfigSchema.optional(),
})

// === Task dependency schemas ===

export const AddDependencySchema = z.object({
  depends_on_task_id: z.string().min(1, 'depends_on_task_id is required'),
})

// === Session schemas ===

export const SessionListQuerySchema = z.object({
  agent_id: z.string().max(50).optional(),
  status: z.enum(['active', 'recent', 'all']).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
})

export const SessionHistoryQuerySchema = z.object({
  /** Runtime instance that owns the session; looked up when omitted. */
  instance: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  include_tools: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v !== 'false'),
})

// === Worktree schemas ===

export const CreateWorktreeSchema = z.object({
  task_id: z.string().min(1),
  repository_id: z.string().min(1).optional(),
  base_branch: z.string().max(100).optional(),
  merge_strategy: z.enum(['merge', 'squash', 'rebase']).optional(),
})

export const WorktreeActionSchema = z.object({
  action: z.enum(['review', 'merge', 'abort', 'cleanup']),
  strategy: z.enum(['merge', 'squash', 'rebase']).optional(),
})

// === Workspace schemas ===

const ColumnInputSchema = z.object({
  slug: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  icon: z.string().max(10),
  is_initial_state: z.boolean(),
  is_done_state: z.boolean(),
})

const NewAgentInputSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  role: z.string().min(1).max(500),
  avatar: z.string().max(10).optional(),
  type: z.enum(['cron', 'api', 'human', 'orchestrator']).optional(),
  cron_schedule: z.string().max(100).optional(),
})

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  slug: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  icon: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
  preset_id: z.string().optional(),
  columns: z.array(ColumnInputSchema).optional(),
  assign_agent_ids: z.array(z.string()).optional(),
  new_agents: z.array(NewAgentInputSchema).optional(),
})

export const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z
    .string()
    .max(1000)
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  icon: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
})

// === Board column schemas ===

export const CreateBoardColumnSchema = z.object({
  slug: z.string().min(1, 'Slug is required').max(100),
  label: z.string().min(1, 'Label is required').max(200),
  icon: z.string().max(10).optional(),
  is_done_state: z.boolean().default(false),
  is_initial_state: z.boolean().default(false),
  color: z.string().max(20).optional(),
})

export const UpdateBoardColumnSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  icon: z.string().max(10).optional(),
  is_done_state: z.boolean().optional(),
  is_initial_state: z.boolean().optional(),
  color: z.string().max(20).optional(),
  position: z.number().int().min(0).optional(),
})

export const ReorderColumnsSchema = z.object({
  column_ids: z.array(z.string().min(1)).min(1, 'column_ids array is required'),
})

// === Workspace agent schemas ===

export const WorkspaceAgentsSchema = z.object({
  agent_ids: z.array(z.string().min(1)).min(0),
})

// === Agent runtime settings (ADR-005) ===

const ModelRefSchema = z.string().regex(/^[^/\s]+\/\S+$/, 'Model must be provider/model')

/** A value sets the setting, null resets it to the runtime default. */
export const UpdateAgentRuntimeSettingsSchema = z
  .object({
    model: z
      .object({
        primary: ModelRefSchema,
        fallbacks: z.array(ModelRefSchema).max(10).default([]),
      })
      .nullable()
      .optional(),
    deniedTools: z.array(z.string().min(1).max(200)).max(200).nullable().optional(),
    workspace: z.string().min(1).max(1000).nullable().optional(),
  })
  .strict()
