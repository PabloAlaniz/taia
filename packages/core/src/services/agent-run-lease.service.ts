// One live heartbeat run per agent.
//
// A trigger takes the agent's lease before it spawns a run. If another run
// holds a live lease, the trigger is coalesced into it: no new run starts and
// the caller gets the running session instead, as Temporal's UseExisting and
// Paperclip's coalesce_if_active do. `force` starts a run anyway and takes the
// lease over; the run it displaces keeps going to its own end.
//
// The lease is released when the run reports it finished, and expires on its
// own after the run's timeout plus a margin, so a run that dies silently never
// blocks its agent for longer than that.
//
// TAIA_AGENT_RUN_LOCK picks the mode:
//   shadow  (default) take leases and log what would be coalesced, but start
//           every run, to see the effect before enforcing it
//   enforce coalesce triggers into the running session
//   off     no leases at all

import { randomUUID } from 'node:crypto'
import {
  acquireAgentRunLease,
  attachAgentRunSession,
  releaseAgentRunLease,
  type AgentRunLease,
} from '../db/repositories/agent-run-lease.repository'

export type AgentRunLockMode = 'shadow' | 'enforce' | 'off'

/** Seconds a lease outlives the run's own timeout before it expires. */
export const AGENT_RUN_LEASE_MARGIN_SECONDS = 60

export function agentRunLockMode(
  env: Record<string, string | undefined> = process.env,
): AgentRunLockMode {
  const value = env.TAIA_AGENT_RUN_LOCK?.trim().toLowerCase()
  return value === 'enforce' || value === 'off' ? value : 'shadow'
}

/** What a trigger may do: start a run (holding `leaseId`, if any) or join `running`. */
export type AgentRunClaim =
  | { start: true; leaseId: string | null }
  | { start: false; running: AgentRunLease }

/**
 * Claim the agent's next run. A database error never blocks a trigger: it is
 * logged and the run starts without a lease.
 */
export async function claimAgentRun(
  agentId: string,
  options: { runTimeoutSeconds: number; force?: boolean; mode?: AgentRunLockMode },
): Promise<AgentRunClaim> {
  const mode = options.mode ?? agentRunLockMode()
  if (mode === 'off') return { start: true, leaseId: null }
  const leaseId = randomUUID()
  let result: Awaited<ReturnType<typeof acquireAgentRunLease>>
  try {
    result = await acquireAgentRunLease(
      agentId,
      leaseId,
      options.runTimeoutSeconds + AGENT_RUN_LEASE_MARGIN_SECONDS,
      options.force ?? false,
    )
  } catch (error) {
    console.warn(
      `[agent-run-lease] could not take the lease of ${agentId}, starting without one:`,
      error instanceof Error ? error.message : error,
    )
    return { start: true, leaseId: null }
  }
  if (result.acquired) return { start: true, leaseId }
  // A lease that vanished between the two queries is not in the way.
  if (!result.lease) return { start: true, leaseId: null }
  if (mode === 'shadow') {
    console.warn(
      `[agent-run-lease] shadow: would coalesce the trigger of ${agentId} into its running ` +
        `session ${result.lease.sessionKey ?? '(starting)'}; set TAIA_AGENT_RUN_LOCK=enforce to do it`,
    )
    return { start: true, leaseId: null }
  }
  return { start: false, running: result.lease }
}

/**
 * Tie a started run to its lease, and give the lease back once the run ends.
 * `awaitEnd` resolves (or rejects) when the run is over; without one the lease
 * simply expires. Nothing here throws.
 */
export async function trackAgentRun(
  agentId: string,
  leaseId: string,
  run: { sessionKey: string; runId: string },
  awaitEnd?: () => Promise<void>,
): Promise<void> {
  await attachAgentRunSession(agentId, leaseId, run.sessionKey, run.runId).catch(() => {})
  if (!awaitEnd) return
  void awaitEnd()
    .catch(() => {})
    .then(() => releaseAgentRunLease(agentId, leaseId))
    .catch(() => {})
}

/** Give back a lease whose run never started. Nothing here throws. */
export async function abandonAgentRun(agentId: string, leaseId: string): Promise<void> {
  await releaseAgentRunLease(agentId, leaseId).catch(() => {})
}
