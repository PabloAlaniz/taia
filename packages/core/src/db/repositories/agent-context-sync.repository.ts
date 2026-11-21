// Agent context sync ledger — what was last pushed to a runtime that keeps
// the agent's context as native files, and how the last attempt went.
// One row per agent and provider (ADR-005).

import { pool } from '../pool'

export type AgentContextSyncStatus = 'pushed' | 'unchanged' | 'pull_only' | 'conflict' | 'error'

export interface AgentContextSyncRow {
  agent_id: string
  provider: string
  mode: 'push' | 'pull'
  status: AgentContextSyncStatus
  fingerprint: string
  remote_hashes: Record<string, string>
  conflicts: Array<{ path: string; remoteHash: string }>
  last_error: string | null
  synced_at: string | null
  updated_at: string
}

export async function getAgentContextSync(
  agentId: string,
  provider: string,
): Promise<AgentContextSyncRow | null> {
  const res = await pool.query<AgentContextSyncRow>(
    'SELECT * FROM agent_context_sync WHERE agent_id = $1 AND provider = $2',
    [agentId, provider],
  )
  return res.rows[0] ?? null
}

export interface AgentContextSyncWrite {
  mode: 'push' | 'pull'
  status: AgentContextSyncStatus
  fingerprint: string
  remoteHashes: Record<string, string>
  conflicts?: Array<{ path: string; remoteHash: string }>
  lastError?: string | null
  /** True when the runtime now holds the files TAIA rendered. */
  synced: boolean
}

export async function upsertAgentContextSync(
  agentId: string,
  provider: string,
  write: AgentContextSyncWrite,
): Promise<AgentContextSyncRow> {
  const res = await pool.query<AgentContextSyncRow>(
    `INSERT INTO agent_context_sync
       (agent_id, provider, mode, status, fingerprint, remote_hashes, conflicts, last_error,
        synced_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $9 THEN NOW() END, NOW())
     ON CONFLICT (agent_id, provider) DO UPDATE
       SET mode = EXCLUDED.mode,
           status = EXCLUDED.status,
           fingerprint = EXCLUDED.fingerprint,
           remote_hashes = EXCLUDED.remote_hashes,
           conflicts = EXCLUDED.conflicts,
           last_error = EXCLUDED.last_error,
           synced_at = COALESCE(EXCLUDED.synced_at, agent_context_sync.synced_at),
           updated_at = NOW()
     RETURNING *`,
    [
      agentId,
      provider,
      write.mode,
      write.status,
      write.fingerprint,
      JSON.stringify(write.remoteHashes),
      JSON.stringify(write.conflicts ?? []),
      write.lastError ?? null,
      write.synced,
    ],
  )
  return res.rows[0]
}
