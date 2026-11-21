// Desired runtime settings per agent — what TAIA wants the runtime to run
// each agent with (ADR-005). NULL columns inherit the
// runtime default.

import type { AgentRuntimeSettings, ModelSelection } from '@taia/types'

import { pool } from '../pool'

export interface AgentRuntimeSettingsRow {
  agent_id: string
  model: ModelSelection | null
  denied_tools: string[] | null
  workspace: string | null
  /** Runtime instance the agent runs on; NULL = the default instance. */
  runtime_instance_id: string | null
  updated_at: string
}

export async function getAgentRuntimeSettingsRow(
  agentId: string,
): Promise<AgentRuntimeSettingsRow | null> {
  const res = await pool.query<AgentRuntimeSettingsRow>(
    'SELECT * FROM agent_runtime_settings WHERE agent_id = $1',
    [agentId],
  )
  return res.rows[0] ?? null
}

/** Replace the agent's desired settings; omitted fields are stored as NULL. */
export async function upsertAgentRuntimeSettings(
  agentId: string,
  settings: AgentRuntimeSettings,
): Promise<AgentRuntimeSettingsRow> {
  const res = await pool.query<AgentRuntimeSettingsRow>(
    `INSERT INTO agent_runtime_settings (agent_id, model, denied_tools, workspace, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (agent_id) DO UPDATE
       SET model = EXCLUDED.model,
           denied_tools = EXCLUDED.denied_tools,
           workspace = EXCLUDED.workspace,
           updated_at = NOW()
     RETURNING *`,
    [
      agentId,
      settings.model ? JSON.stringify(settings.model) : null,
      settings.deniedTools ? JSON.stringify(settings.deniedTools) : null,
      settings.workspace ?? null,
    ],
  )
  return res.rows[0]
}

/** The instance the agent is assigned to, or null for the default instance. */
export async function getAgentRuntimeInstanceId(agentId: string): Promise<string | null> {
  const res = await pool.query<{ runtime_instance_id: string | null }>(
    'SELECT runtime_instance_id FROM agent_runtime_settings WHERE agent_id = $1',
    [agentId],
  )
  return res.rows[0]?.runtime_instance_id ?? null
}

/** Every explicit assignment, as agent id → instance id (agents on the default are absent). */
export async function listAgentRuntimeInstanceIds(): Promise<Map<string, string>> {
  const res = await pool.query<{ agent_id: string; runtime_instance_id: string }>(
    'SELECT agent_id, runtime_instance_id FROM agent_runtime_settings WHERE runtime_instance_id IS NOT NULL',
  )
  return new Map(res.rows.map((r) => [r.agent_id, r.runtime_instance_id]))
}

/** Assign the agent to an instance; null puts it back on the default. */
export async function setAgentRuntimeInstanceId(
  agentId: string,
  instanceId: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO agent_runtime_settings (agent_id, runtime_instance_id, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (agent_id) DO UPDATE
       SET runtime_instance_id = EXCLUDED.runtime_instance_id,
           updated_at = NOW()`,
    [agentId, instanceId],
  )
}
