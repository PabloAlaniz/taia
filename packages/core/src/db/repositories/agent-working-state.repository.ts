// Agent working state — the progress notes an agent keeps between runs
// (what used to be WORKING.md). One row per agent.

import { pool } from '../pool'

export interface AgentWorkingStateRow {
  agent_id: string
  task_id: string | null
  content: string
  updated_by: string | null
  updated_at: string
}

export async function getAgentWorkingState(agentId: string): Promise<AgentWorkingStateRow | null> {
  const res = await pool.query<AgentWorkingStateRow>(
    'SELECT * FROM agent_working_state WHERE agent_id = $1',
    [agentId],
  )
  return res.rows[0] ?? null
}

export async function upsertAgentWorkingState(
  agentId: string,
  content: string,
  options: { taskId?: string | null; updatedBy?: string } = {},
): Promise<AgentWorkingStateRow> {
  const res = await pool.query<AgentWorkingStateRow>(
    `INSERT INTO agent_working_state (agent_id, task_id, content, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (agent_id) DO UPDATE
       SET task_id = EXCLUDED.task_id,
           content = EXCLUDED.content,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
     RETURNING *`,
    [agentId, options.taskId ?? null, content, options.updatedBy ?? null],
  )
  return res.rows[0]
}
