// Agent runtime settings service — what TAIA wants each agent to run with
// (model, denied tools, workspace) and how it reaches the runtime. Runtimes
// with AgentProvisioning keep per-agent settings in their own config and
// receive every change; the others get the model when a session starts.
// Core never writes a runtime's native config (ADR-005).

import type {
  AgentRuntimeSettings,
  AgentRuntimeSettingsUpdate,
  EffectiveAgentRuntimeSettings,
  SettingSource,
} from '@taia/types'
import {
  RuntimeCapability,
  suggestFallbackChain,
  type AgentRuntimeAdapter,
  type ProvisionOutcome,
} from '@taia/runtime'

import {
  getAgentRuntimeSettingsRow,
  upsertAgentRuntimeSettings,
  type AgentRuntimeSettingsRow,
} from '../db'
import { getRuntimeAdapter, getRuntimeAdapterForAgent } from '../runtime'
import { getAgentInstanceId, loadAgentInstanceResolver } from '../runtime-instances'
import { getRuntimeSettings } from './runtime-settings.service'

const SETTING_KEYS = ['model', 'deniedTools', 'workspace'] as const

function toSettings(row: AgentRuntimeSettingsRow | null): AgentRuntimeSettings {
  if (!row) return {}
  return {
    ...(row.model ? { model: row.model } : {}),
    ...(row.denied_tools?.length ? { deniedTools: row.denied_tools } : {}),
    ...(row.workspace ? { workspace: row.workspace } : {}),
  }
}

/** A value sets the field, `null` drops it, an omitted field stays. */
function applyUpdate(
  current: AgentRuntimeSettings,
  update: AgentRuntimeSettingsUpdate,
): AgentRuntimeSettings {
  const next: Record<string, unknown> = { ...current }
  for (const key of SETTING_KEYS) {
    if (!(key in update)) continue
    const value = update[key]
    const empty = value === null || (Array.isArray(value) && value.length === 0)
    if (empty) delete next[key]
    else if (value !== undefined) next[key] = value
  }
  return next as AgentRuntimeSettings
}

function supportsProvisioning(adapter: AgentRuntimeAdapter): boolean {
  return adapter.capabilities.has(RuntimeCapability.AgentProvisioning)
}

/** TAIA's desired settings for the agent; empty when it inherits everything. */
export async function getAgentRuntimeSettings(agentId: string): Promise<AgentRuntimeSettings> {
  return toSettings(await getAgentRuntimeSettingsRow(agentId))
}

export interface AgentRuntimeSettingsChange {
  settings: AgentRuntimeSettings
  /**
   * How the runtime took the change; null when the runtime has no per-agent
   * settings and the change applies from the next session on.
   */
  runtime: ProvisionOutcome | null
}

/** Store the change and push it to a runtime that keeps per-agent settings. */
export async function updateAgentRuntimeSettings(
  agentId: string,
  update: AgentRuntimeSettingsUpdate,
): Promise<AgentRuntimeSettingsChange> {
  const settings = applyUpdate(await getAgentRuntimeSettings(agentId), update)
  await upsertAgentRuntimeSettings(agentId, settings)

  const adapter = await getRuntimeAdapterForAgent(agentId)
  if (!supportsProvisioning(adapter) || !adapter.updateAgentSettings) {
    return { settings, runtime: null }
  }
  return {
    settings,
    runtime: await adapter.updateAgentSettings(agentId, update),
  }
}

export interface EffectiveAgentRuntimeSettingsView extends EffectiveAgentRuntimeSettings {
  provider: string
  /** What TAIA asks for, before runtime values and defaults are merged in. */
  desired: AgentRuntimeSettings
}

/**
 * The settings the agent runs with and where each one comes from: TAIA's
 * own choice, the runtime's per-agent config, or the runtime default.
 */
export async function getEffectiveAgentRuntimeSettings(
  agentId: string,
): Promise<EffectiveAgentRuntimeSettingsView> {
  const [desired, view] = await Promise.all([
    getAgentRuntimeSettings(agentId),
    getRuntimeAdapterForAgent(agentId).then(getRuntimeSettings),
  ])
  const reported = view.settings?.agents[agentId]
  const defaults: AgentRuntimeSettings = view.settings?.defaults.model
    ? { model: view.settings.defaults.model }
    : {}

  const settings: Record<string, unknown> = {}
  const source: Partial<Record<keyof AgentRuntimeSettings, SettingSource>> = {}
  for (const key of SETTING_KEYS) {
    const layers: Array<[SettingSource, AgentRuntimeSettings]> = [
      ['taia', desired],
      ['runtime', reported ?? {}],
      ['default', defaults],
    ]
    const hit = layers.find(([, layer]) => layer[key] !== undefined)
    if (!hit) continue
    settings[key] = hit[1][key]
    source[key] = hit[0]
  }

  return {
    agentId,
    provider: view.provider,
    desired,
    settings: settings as AgentRuntimeSettings,
    source,
  }
}

export interface InstanceProvisioningReport {
  provider: string
  /** False when the runtime has no agents of its own to create. */
  supported: boolean
  /** True when no agent failed. */
  ok: boolean
  agents: Record<string, ProvisionOutcome>
  error?: string
}

export interface RuntimeProvisioningReport {
  /** True when no instance failed. */
  ok: boolean
  /** One report per instance the agents run on; empty in standalone mode. */
  instances: Record<string, InstanceProvisioningReport>
}

type AgentSpec = { id: string; name: string }

/**
 * Make sure each agent's runtime instance knows it, with TAIA's desired
 * settings. Agents that already exist are left as they are. Never throws.
 */
export async function provisionAgentsInRuntime(
  agents: AgentSpec[],
): Promise<RuntimeProvisioningReport> {
  const instanceOf = await loadAgentInstanceResolver()
  const byInstance = new Map<string, AgentSpec[]>()
  for (const agent of agents) {
    const instanceId = instanceOf(agent.id)
    if (instanceId) byInstance.set(instanceId, [...(byInstance.get(instanceId) ?? []), agent])
  }

  const reports = await Promise.all(
    Array.from(byInstance, async ([instanceId, group]) => {
      const report = await provisionOnInstance(instanceId, group)
      return [instanceId, report] as const
    }),
  )
  return {
    ok: reports.every(([, report]) => report.ok),
    instances: Object.fromEntries(reports),
  }
}

async function provisionOnInstance(
  instanceId: string,
  agents: AgentSpec[],
): Promise<InstanceProvisioningReport> {
  let adapter: AgentRuntimeAdapter
  try {
    adapter = await getRuntimeAdapter(instanceId)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return {
      provider: 'unknown',
      supported: false,
      ok: false,
      agents: {},
      error,
    }
  }
  if (!supportsProvisioning(adapter) || !adapter.provisionAgent) {
    return { provider: adapter.id, supported: false, ok: true, agents: {} }
  }

  // One at a time: each provision is a read-modify-write of the runtime config.
  const outcomes: Record<string, ProvisionOutcome> = {}
  for (const agent of agents) {
    const settings = await getAgentRuntimeSettings(agent.id)
    outcomes[agent.id] = await adapter.provisionAgent({ ...agent, settings })
  }
  await suggestDefaultFallbacks(adapter)

  const failed = Object.entries(outcomes).filter(([, o]) => o.status === 'failed')
  return {
    provider: adapter.id,
    supported: true,
    ok: failed.length === 0,
    agents: outcomes,
    ...(failed.length > 0
      ? { error: `Could not provision ${failed.map(([id]) => id).join(', ')}` }
      : {}),
  }
}

export interface RuntimeDeprovisioningReport {
  /** The instance the agent ran on; null in standalone mode. */
  instanceId: string | null
  /** `unsupported` when the runtime has no agents of its own to remove. */
  status: 'removed' | 'unsupported' | 'failed'
  error?: string
}

/**
 * Remove the agent from its runtime instance; its files stay. Call it before
 * deleting the agent, whose row holds the instance assignment. Never throws.
 */
export async function deprovisionAgentFromRuntime(
  agentId: string,
): Promise<RuntimeDeprovisioningReport> {
  let instanceId: string | null = null
  try {
    instanceId = await getAgentInstanceId(agentId)
    if (!instanceId) return { instanceId, status: 'unsupported' }
    const adapter = await getRuntimeAdapter(instanceId)
    if (!supportsProvisioning(adapter) || !adapter.deprovisionAgent) {
      return { instanceId, status: 'unsupported' }
    }
    await adapter.deprovisionAgent(agentId)
    return { instanceId, status: 'removed' }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { instanceId, status: 'failed', error }
  }
}

/**
 * Give the runtime's default model a failover chain when it has none.
 * Auth failures, rate limits and overloaded providers then fall through to
 * the next model instead of failing the run. Best effort.
 */
async function suggestDefaultFallbacks(adapter: AgentRuntimeAdapter): Promise<void> {
  if (!adapter.getRuntimeSettings || !adapter.setRuntimeDefaults) return
  try {
    const snapshot = await adapter.getRuntimeSettings()
    const model = suggestFallbackChain(snapshot.defaults.model)
    if (!model) return
    await adapter.setRuntimeDefaults({ model }, { expectedRevision: snapshot.revision })
  } catch (err) {
    console.warn(
      '[runtime-settings] could not set default fallbacks:',
      err instanceof Error ? err.message : err,
    )
  }
}
