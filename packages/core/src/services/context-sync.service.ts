// Context sync service — keeps runtimes that store the agent context as
// native files (capability ContextSync, e.g. OpenClaw workspaces) in step
// with the typed context. The adapter renders and writes; this service
// loads the bundle, hands the adapter the last known state and records the
// outcome in the agent_context_sync ledger (ADR-005).

import { RuntimeCapability, type ContextSyncOutcome, type ContextSyncState } from '@taia/runtime'

import { getAgentContextSync, upsertAgentContextSync, type AgentContextSyncRow } from '../db/index'
import { getRuntimeAdapterForAgent } from '../runtime'
import { loadAgentContextBundle } from './context.service'

export interface SyncAgentContextOptions {
  /** Overwrite files edited in the runtime since the last sync. */
  force?: boolean
}

function toState(row: AgentContextSyncRow | null): ContextSyncState | null {
  if (!row) return null
  return { mode: row.mode, fingerprint: row.fingerprint, remoteHashes: row.remote_hashes }
}

/**
 * Sync one agent's context to its runtime. Returns null when there is
 * nothing to sync: the runtime does not keep context as files, or the agent
 * has no typed identity. Failures are recorded in the ledger and rethrown.
 */
export async function syncAgentContext(
  agentId: string,
  options: SyncAgentContextOptions = {},
): Promise<ContextSyncOutcome | null> {
  const adapter = await getRuntimeAdapterForAgent(agentId)
  if (!adapter.capabilities.has(RuntimeCapability.ContextSync) || !adapter.syncAgentContext) {
    return null
  }
  const bundle = await loadAgentContextBundle(agentId)
  if (!bundle) return null

  const previousRow = await getAgentContextSync(agentId, adapter.id)
  let outcome: ContextSyncOutcome
  try {
    outcome = await adapter.syncAgentContext({
      agentId,
      bundle,
      previous: toState(previousRow),
      force: options.force,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await upsertAgentContextSync(agentId, adapter.id, {
      mode: previousRow?.mode ?? 'push',
      status: 'error',
      fingerprint: previousRow?.fingerprint ?? '',
      remoteHashes: previousRow?.remote_hashes ?? {},
      lastError: message,
      synced: false,
    })
    throw err
  }

  await upsertAgentContextSync(agentId, adapter.id, {
    mode: outcome.state.mode,
    status: outcome.status,
    fingerprint: outcome.state.fingerprint,
    remoteHashes: outcome.state.remoteHashes,
    conflicts: outcome.status === 'conflict' ? outcome.conflicts : [],
    lastError: null,
    synced: outcome.status === 'pushed' || outcome.status === 'unchanged',
  })
  return outcome
}

/**
 * Best-effort sync before a run starts, so the agent never wakes up with a
 * stale workspace. Never throws: a failed sync is logged and recorded, and
 * the run goes ahead with whatever the runtime holds.
 */
export async function ensureAgentContextSynced(agentId: string): Promise<void> {
  try {
    const outcome = await syncAgentContext(agentId)
    if (outcome?.status === 'conflict') {
      console.warn(
        `[context-sync] ${agentId}: edited in the runtime, not overwritten: ` +
          outcome.conflicts.map((c) => c.path).join(', '),
      )
    }
  } catch (err) {
    console.warn(
      `[context-sync] ${agentId}: sync failed:`,
      err instanceof Error ? err.message : err,
    )
  }
}

/** Ledger row for the agent on its current runtime, if it has synced before. */
export async function getAgentContextSyncStatus(
  agentId: string,
): Promise<AgentContextSyncRow | null> {
  const adapter = await getRuntimeAdapterForAgent(agentId)
  return getAgentContextSync(agentId, adapter.id)
}
