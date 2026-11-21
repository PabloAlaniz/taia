// Trigger service — starts an agent heartbeat run via its runtime adapter.
// Core only gathers the context bundle and says why the run starts; the
// adapter phrases the kickoff message from both (ADR-005).

import { RuntimeCapability, requireCapabilityMethod } from '@taia/runtime'
import { getRuntimeAdapterForAgent } from '../runtime'
import { logAgentTriggered } from './activity.service'
import { abandonAgentRun, claimAgentRun, trackAgentRun } from './agent-run-lease.service'
import { getActiveBundleVersionIds } from './agent-context.service'
import { getAgentRuntimeSettings } from './agent-runtime-settings.service'
import { loadAgentContextBundle } from './context.service'
import { ensureAgentContextSynced } from './context-sync.service'

export interface TriggerResult {
  ok: boolean
  agentId: string
  message?: string
  sessionKey?: string
  runId?: string
  /** No run started: the trigger joined the agent's running session. */
  coalesced?: boolean
  error?: string
}

export interface TriggerOptions {
  /** Start a run even if the agent has one running (see agent-run-lease.service). */
  force?: boolean
}

/** How long a manual heartbeat run may take. */
const HEARTBEAT_RUN_TIMEOUT_SECONDS = 300

/** Kickoff for agents without a typed context bundle; adapters use it verbatim. */
const HEARTBEAT_FALLBACK = 'Heartbeat: check your assigned tasks and continue your work.'

export async function triggerAgentHeartbeat(
  agentId: string,
  options: TriggerOptions = {},
): Promise<TriggerResult> {
  let leaseId: string | null = null
  try {
    const adapter = await getRuntimeAdapterForAgent(agentId)
    const spawnSession = requireCapabilityMethod(
      adapter,
      RuntimeCapability.Sessions,
      'spawnSession',
    )

    const claim = await claimAgentRun(agentId, {
      runTimeoutSeconds: HEARTBEAT_RUN_TIMEOUT_SECONDS,
      force: options.force,
    })
    if (!claim.start) {
      return {
        ok: true,
        agentId,
        coalesced: true,
        message: `${agentId} already has a run in progress; no new run started`,
        sessionKey: claim.running.sessionKey ?? undefined,
        runId: claim.running.runId ?? undefined,
      }
    }
    leaseId = claim.leaseId

    // The typed context bundle, plus the audit trail of which version of
    // each layer was active, so the spawn row records what the model saw.
    const bundle = await loadAgentContextBundle(agentId).catch((err) => {
      console.warn(
        `[trigger] failed to load context bundle for ${agentId}:`,
        err instanceof Error ? err.message : err,
      )
      return null
    })
    const bundleVersionIds = bundle
      ? await getActiveBundleVersionIds(agentId).catch(() => ({}))
      : undefined
    // Runtimes that keep context as files must hold the current version.
    if (bundle) await ensureAgentContextSynced(agentId)
    // Runtimes with their own per-agent settings already hold the model.
    const model = adapter.capabilities.has(RuntimeCapability.AgentProvisioning)
      ? undefined
      : (await getAgentRuntimeSettings(agentId)).model?.primary

    const result = await spawnSession(HEARTBEAT_FALLBACK, {
      agentId,
      label: `heartbeat-manual-${Date.now()}`,
      runTimeoutSeconds: HEARTBEAT_RUN_TIMEOUT_SECONDS,
      ...(model ? { model } : {}),
      trigger: { kind: 'heartbeat' },
      context: bundle ?? undefined,
      bundleVersionIds:
        bundleVersionIds && Object.keys(bundleVersionIds).length > 0 ? bundleVersionIds : undefined,
    })

    if (leaseId) {
      const awaitSessionComplete = adapter.awaitSessionComplete?.bind(adapter)
      await trackAgentRun(
        agentId,
        leaseId,
        result,
        awaitSessionComplete
          ? () =>
              awaitSessionComplete(result, {
                timeoutMs: HEARTBEAT_RUN_TIMEOUT_SECONDS * 1000,
                fallbackPollIntervalMs: 5_000,
              })
          : undefined,
      )
      // The run started: its lease is now released by its end, not by an error below.
      leaseId = null
    }

    await logAgentTriggered(agentId, agentId)

    return {
      ok: true,
      agentId,
      message: `Heartbeat triggered for ${agentId}`,
      sessionKey: result.sessionKey,
      runId: result.runId,
    }
  } catch (err) {
    if (leaseId) await abandonAgentRun(agentId, leaseId)
    return {
      ok: false,
      agentId,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
