// agent_context — one row per agent, holding pointers to the currently
// active version of each mutable bundle layer (identity, project, user).
//
// Writes are append-only at the version tables; this row is updated to flip
// the pointer when a new version becomes active. NULL pointers are valid —
// the context.service falls back to deriving the context when a
// layer has no version yet.

import { pool } from '../pool'

export interface AgentContextRow {
  agent_id: string
  agent_identity_version_id: string | null
  project_context_version_id: string | null
  user_profile_version_id: string | null
  updated_at: string
}

export async function getAgentContext(agentId: string): Promise<AgentContextRow | null> {
  const res = await pool.query<AgentContextRow>(`SELECT * FROM agent_context WHERE agent_id = $1`, [
    agentId,
  ])
  return res.rows[0] ?? null
}

/**
 * Create the row if it doesn't exist. Idempotent — used by the lazy backfill
 * path on first read of an agent created before context versioning.
 */
export async function ensureAgentContextRow(agentId: string): Promise<void> {
  await pool.query(
    `INSERT INTO agent_context (agent_id) VALUES ($1)
     ON CONFLICT (agent_id) DO NOTHING`,
    [agentId],
  )
}

export async function setActiveAgentIdentityVersion(
  agentId: string,
  versionId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO agent_context (agent_id, agent_identity_version_id)
     VALUES ($1, $2)
     ON CONFLICT (agent_id) DO UPDATE
       SET agent_identity_version_id = EXCLUDED.agent_identity_version_id`,
    [agentId, versionId],
  )
}

export async function setActiveProjectContextVersion(
  agentId: string,
  versionId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO agent_context (agent_id, project_context_version_id)
     VALUES ($1, $2)
     ON CONFLICT (agent_id) DO UPDATE
       SET project_context_version_id = EXCLUDED.project_context_version_id`,
    [agentId, versionId],
  )
}

export async function setActiveUserProfileVersion(
  agentId: string,
  versionId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO agent_context (agent_id, user_profile_version_id)
     VALUES ($1, $2)
     ON CONFLICT (agent_id) DO UPDATE
       SET user_profile_version_id = EXCLUDED.user_profile_version_id`,
    [agentId, versionId],
  )
}
