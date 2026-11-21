// Trigger service — starts an agent heartbeat run via its runtime adapter.
// Core only gathers the context bundle and says why the run starts; the
// adapter phrases the kickoff message from both (ADR-005).

import { RuntimeCapability, requireCapabilityMethod } from '@taia/runtime'
import { getRuntimeAdapterForAgent } from '../runtime'
import { logAgentTriggered } from './activity.service'
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
  error?: string
}

/** Kickoff for agents without a typed context bundle; adapters use it verbatim. */
const HEARTBEAT_FALLBACK = 'Heartbeat: check your assigned tasks and continue your work.'

export async function triggerAgentHeartbeat(agentId: string): Promise<TriggerResult> {
  try {
    const adapter = await getRuntimeAdapterForAgent(agentId)
    const spawnSession = requireCapabilityMethod(
      adapter,
      RuntimeCapability.Sessions,
      'spawnSession',
    )

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
      runTimeoutSeconds: 300,
      ...(model ? { model } : {}),
      trigger: { kind: 'heartbeat' },
      context: bundle ?? undefined,
      bundleVersionIds:
        bundleVersionIds && Object.keys(bundleVersionIds).length > 0 ? bundleVersionIds : undefined,
    })

    await logAgentTriggered(agentId, agentId)

    return {
      ok: true,
      agentId,
      message: `Heartbeat triggered for ${agentId}`,
      sessionKey: result.sessionKey,
      runId: result.runId,
    }
  } catch (err) {
    return {
      ok: false,
      agentId,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
