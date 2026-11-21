// Workspace-Agent junction repository — many-to-many assignments

import type { AgentRecord } from '@taia/types'
import { pool, normalizeAgent } from '../pool'

export async function getAgentsForWorkspace(workspaceId: string): Promise<AgentRecord[]> {
  const res = await pool.query(
    `SELECT a.* FROM agents a
     INNER JOIN workspace_agents wa ON wa.agent_id = a.id
     WHERE wa.workspace_id = $1
     ORDER BY a.sort_order ASC`,
    [workspaceId],
  )
  return res.rows.map(normalizeAgent)
}

export async function getWorkspacesForAgent(agentId: string): Promise<string[]> {
  const res = await pool.query('SELECT workspace_id FROM workspace_agents WHERE agent_id = $1', [
    agentId,
  ])
  return res.rows.map((r: { workspace_id: string }) => r.workspace_id)
}

export async function addAgentToWorkspace(workspaceId: string, agentId: string): Promise<void> {
  await pool.query(
    'INSERT INTO workspace_agents (workspace_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [workspaceId, agentId],
  )
}

export async function removeAgentFromWorkspace(
  workspaceId: string,
  agentId: string,
): Promise<boolean> {
  const res = await pool.query(
    'DELETE FROM workspace_agents WHERE workspace_id = $1 AND agent_id = $2',
    [workspaceId, agentId],
  )
  return (res.rowCount ?? 0) > 0
}

export async function setWorkspaceAgents(workspaceId: string, agentIds: string[]): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM workspace_agents WHERE workspace_id = $1', [workspaceId])
    for (const agentId of agentIds) {
      await client.query('INSERT INTO workspace_agents (workspace_id, agent_id) VALUES ($1, $2)', [
        workspaceId,
        agentId,
      ])
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
