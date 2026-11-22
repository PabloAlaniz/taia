// Agent run leases — one live heartbeat run per agent (migration 0003).

import { pool } from '../pool'

export interface AgentRunLease {
  agentId: string
  leaseId: string
  sessionKey: string | null
  runId: string | null
  expiresAt: Date
}

interface LeaseRow {
  agent_id: string
  lease_id: string
  session_key: string | null
  run_id: string | null
  expires_at: Date
}

const toLease = (row: LeaseRow): AgentRunLease => ({
  agentId: row.agent_id,
  leaseId: row.lease_id,
  sessionKey: row.session_key,
  runId: row.run_id,
  expiresAt: row.expires_at,
})

/**
 * Take the agent's lease for `ttlSeconds` if nobody holds a live one, or
 * whatever holds it with `force`. In one statement, so two triggers at once
 * cannot both win. Answers the lease taken, or the live one in the way.
 */
export async function acquireAgentRunLease(
  agentId: string,
  leaseId: string,
  ttlSeconds: number,
  force: boolean,
): Promise<
  { acquired: true; lease: AgentRunLease } | { acquired: false; lease: AgentRunLease | null }
> {
  const taken = await pool.query<LeaseRow>(
    `
    INSERT INTO agent_run_leases (agent_id, lease_id, expires_at)
    VALUES ($1, $2, now() + make_interval(secs => $3))
    ON CONFLICT (agent_id) DO UPDATE
      SET lease_id = EXCLUDED.lease_id, session_key = NULL, run_id = NULL,
          acquired_at = now(), expires_at = EXCLUDED.expires_at
      WHERE agent_run_leases.expires_at <= now() OR $4
    RETURNING agent_id, lease_id, session_key, run_id, expires_at
  `,
    [agentId, leaseId, ttlSeconds, force],
  )
  if (taken.rows[0]) return { acquired: true, lease: toLease(taken.rows[0]) }
  const held = await pool.query<LeaseRow>(
    'SELECT agent_id, lease_id, session_key, run_id, expires_at FROM agent_run_leases WHERE agent_id = $1',
    [agentId],
  )
  return { acquired: false, lease: held.rows[0] ? toLease(held.rows[0]) : null }
}

/** Record which session a lease's run became. No-op if the lease changed hands. */
export async function attachAgentRunSession(
  agentId: string,
  leaseId: string,
  sessionKey: string,
  runId: string,
): Promise<void> {
  await pool.query(
    'UPDATE agent_run_leases SET session_key = $3, run_id = $4 WHERE agent_id = $1 AND lease_id = $2',
    [agentId, leaseId, sessionKey, runId],
  )
}

/** Give the lease back. Only its holder can: a lease taken over since is left alone. */
export async function releaseAgentRunLease(agentId: string, leaseId: string): Promise<void> {
  await pool.query('DELETE FROM agent_run_leases WHERE agent_id = $1 AND lease_id = $2', [
    agentId,
    leaseId,
  ])
}
