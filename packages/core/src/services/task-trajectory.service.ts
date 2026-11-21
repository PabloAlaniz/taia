import { pool } from '../db/pool'
import { logActivity } from '../db/repositories/activity.repository'

export interface TaskTrajectory {
  id: string
  workspace_id: string
  task_id: string
  actor: string
  decision: string
  reasoning: string | null
  outcome: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface RecordTaskTrajectoryInput {
  workspaceId: string
  taskId: string
  actor?: string
  decision: string
  reasoning?: string | null
  outcome?: string | null
  metadata?: Record<string, unknown> | null
}

const MAX_PAGE_SIZE = 200
const SECRET_KEY_PATTERN = /(api[_-]?key|token|secret|password|authorization|cookie)/i

export function sanitizeTrajectoryMetadata(
  metadata?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!metadata) return null
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      sanitized[key] = '[redacted]'
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeTrajectoryMetadata(value as Record<string, unknown>)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

export async function ensureTaskTrajectoriesTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_trajectories (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      actor TEXT NOT NULL DEFAULT 'unknown',
      decision TEXT NOT NULL,
      reasoning TEXT,
      outcome TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query('ALTER TABLE task_trajectories ADD COLUMN IF NOT EXISTS actor TEXT')
  await pool.query(
    "UPDATE task_trajectories SET actor = COALESCE(actor, source_agent_id, 'unknown') WHERE actor IS NULL",
  )
  await pool.query("ALTER TABLE task_trajectories ALTER COLUMN actor SET DEFAULT 'unknown'")
  await pool.query('ALTER TABLE task_trajectories ALTER COLUMN actor SET NOT NULL')
  await pool.query('ALTER TABLE task_trajectories ADD COLUMN IF NOT EXISTS metadata JSONB')
  await pool.query('ALTER TABLE task_trajectories ALTER COLUMN reasoning DROP NOT NULL')
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_task_trajectories_workspace_task_created ON task_trajectories(workspace_id, task_id, created_at ASC, id ASC)',
  )
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_task_trajectories_workspace_created ON task_trajectories(workspace_id, created_at DESC)',
  )
}

async function getTaskWorkspace(taskId: string): Promise<string | null> {
  const result = await pool.query('SELECT workspace_id FROM tasks WHERE id = $1', [taskId])
  return result.rows[0]?.workspace_id ?? null
}

export async function recordTaskTrajectory(
  input: RecordTaskTrajectoryInput,
): Promise<TaskTrajectory> {
  await ensureTaskTrajectoriesTable()
  const taskWorkspace = await getTaskWorkspace(input.taskId)
  if (!taskWorkspace) {
    throw new Error(`Task not found: ${input.taskId}`)
  }
  if (taskWorkspace !== input.workspaceId) {
    throw new Error('Task does not belong to requested workspace')
  }

  const id = `trajectory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const metadata = sanitizeTrajectoryMetadata(input.metadata)
  const result = await pool.query(
    `
      INSERT INTO task_trajectories (
        id, workspace_id, task_id, actor, decision, reasoning, outcome, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      id,
      input.workspaceId,
      input.taskId,
      input.actor || 'unknown',
      input.decision,
      input.reasoning || null,
      input.outcome || null,
      metadata ? JSON.stringify(metadata) : null,
    ],
  )

  const trajectory = result.rows[0]
  await logActivity({
    type: 'agent_triggered',
    workspace_id: input.workspaceId,
    task_id: input.taskId,
    agent_id: input.actor || 'unknown',
    message: `Trajectory decision recorded: ${input.decision}`,
    metadata: { trajectory_id: id, outcome: input.outcome || null },
  })
  return trajectory
}

export async function listTaskTrajectories(input: {
  workspaceId: string
  taskId: string
  limit?: number
  offset?: number
}): Promise<{ trajectories: TaskTrajectory[]; total: number; limit: number; offset: number }> {
  await ensureTaskTrajectoriesTable()
  const limit = Math.min(Math.max(input.limit ?? 50, 1), MAX_PAGE_SIZE)
  const offset = Math.max(input.offset ?? 0, 0)
  const countResult = await pool.query(
    'SELECT COUNT(*)::int AS count FROM task_trajectories WHERE workspace_id = $1 AND task_id = $2',
    [input.workspaceId, input.taskId],
  )
  const rowsResult = await pool.query(
    `
      SELECT * FROM task_trajectories
      WHERE workspace_id = $1 AND task_id = $2
      ORDER BY created_at ASC, id ASC
      LIMIT $3 OFFSET $4
    `,
    [input.workspaceId, input.taskId, limit, offset],
  )
  return {
    trajectories: rowsResult.rows,
    total: countResult.rows[0]?.count ?? 0,
    limit,
    offset,
  }
}

export async function deleteTaskTrajectoriesForTask(input: {
  workspaceId: string
  taskId: string
}): Promise<number> {
  await ensureTaskTrajectoriesTable()
  const result = await pool.query(
    'DELETE FROM task_trajectories WHERE workspace_id = $1 AND task_id = $2',
    [input.workspaceId, input.taskId],
  )
  return result.rowCount ?? 0
}
