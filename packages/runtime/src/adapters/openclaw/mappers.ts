// Bidirectional translation between OpenClaw wire-format types and the
// canonical runtime types declared by @taia/runtime.

import type { AgentRuntimeSettingsUpdate, ModelSelection, RuntimeDefaults } from '@taia/types'

import type {
  RuntimeAgent,
  RuntimeCronJob,
  RuntimeHealth,
  RuntimeMessage,
  RuntimeSession,
  RuntimeSettingsSnapshot,
  SpawnResult,
} from '../../types'
import type {
  OCAgent,
  OCAgentEntry,
  OCChatMessage,
  OCCronJob,
  OCGatewayConfig,
  OCHealthStatus,
  OCSession,
  OCSessionCreateResult,
} from './types'
import type { GatewayConfigResult } from './client'

export function toRuntimeAgent(oc: OCAgent): RuntimeAgent {
  return {
    id: oc.id,
    name: oc.name ?? oc.id,
    configured: true,
  }
}

/** OpenClaw session keys look like `agent:<agentId>:<name>`. */
export function agentIdFromSessionKey(key: string): string | undefined {
  return key.match(/^agent:([^:]+):/)?.[1]
}

export function toRuntimeSession(oc: OCSession): RuntimeSession {
  return {
    key: oc.key,
    agentId: oc.agentId ?? agentIdFromSessionKey(oc.key),
    kind: oc.kind,
    channel: oc.channel,
    sessionId: oc.sessionId,
    updatedAt: oc.updatedAt,
    label: oc.label ?? oc.displayName,
    model: oc.model,
    totalTokens: oc.totalTokens,
    inputTokens: oc.inputTokens,
    outputTokens: oc.outputTokens,
    durationMs: oc.runtimeMs,
  }
}

function toRuntimeRole(role: string): RuntimeMessage['role'] {
  return role === 'user' || role === 'assistant' ? role : 'tool'
}

export function toRuntimeMessage(oc: OCChatMessage): RuntimeMessage {
  return {
    id: oc.__openclaw?.id,
    role: toRuntimeRole(oc.role),
    content: oc.content,
    timestamp: typeof oc.timestamp === 'number' ? new Date(oc.timestamp).toISOString() : undefined,
    model: oc.model,
    stopReason: oc.stopReason,
  }
}

export function toRuntimeCronJob(oc: OCCronJob): RuntimeCronJob {
  return {
    id: oc.id,
    agentId: oc.agentId ?? '',
    name: oc.name,
    enabled: oc.enabled,
    managedByRuntime: Boolean(oc.declarationKey),
    schedule: oc.schedule,
    payload: oc.payload,
    state: oc.state,
  }
}

/** OpenClaw accepts a model as `provider/model` or `{ primary, fallbacks }`. */
function toModelSelection(
  model: string | { primary?: string; fallbacks?: string[] } | undefined,
): ModelSelection | undefined {
  if (!model) return undefined
  if (typeof model === 'string') return { primary: model, fallbacks: [] }
  if (!model.primary) return undefined
  return { primary: model.primary, fallbacks: model.fallbacks ?? [] }
}

/**
 * The neutral view of the gateway config: defaults and per-agent settings.
 * Reads `agents.entries` (current schema) or `agents.list` (≤ 2026.5).
 * The config hash is the revision, usable as a write precondition.
 */
/** The gateway's own entry for an agent, in either config schema. */
export function findAgentEntry(config: OCGatewayConfig, agentId: string): OCAgentEntry | undefined {
  const agents = config.agents
  return agents?.entries ? agents.entries[agentId] : agents?.list?.find((e) => e.id === agentId)
}

export function toRuntimeSettingsSnapshot(result: GatewayConfigResult): RuntimeSettingsSnapshot {
  const agentsConfig = result.config.agents ?? {}
  const entries: Array<[string, OCAgentEntry]> = agentsConfig.entries
    ? Object.entries(agentsConfig.entries)
    : (agentsConfig.list ?? []).flatMap((e) => (e.id ? [[e.id, e] as [string, OCAgentEntry]] : []))

  const agents: RuntimeSettingsSnapshot['agents'] = {}
  for (const [id, entry] of entries) {
    const model = toModelSelection(entry.model)
    agents[id] = {
      ...(entry.name ? { name: entry.name } : {}),
      ...(model ? { model } : {}),
      ...(entry.tools?.deny?.length ? { deniedTools: entry.tools.deny } : {}),
      ...(entry.workspace ? { workspace: entry.workspace } : {}),
    }
  }

  const defaultModel = toModelSelection(agentsConfig.defaults?.model)
  return {
    defaults: {
      ...(defaultModel ? { model: defaultModel } : {}),
      ...(agentsConfig.defaults?.workspace
        ? { workspaceRoot: agentsConfig.defaults.workspace }
        : {}),
    },
    agents,
    ...(result.hash ? { revision: result.hash } : {}),
  }
}

/** A `config.patch` request: merge patch plus the arrays it may shorten. */
export interface GatewayConfigPatch {
  patch: Record<string, unknown>
  replacePaths: string[]
}

function toGatewayModel(model: ModelSelection): { primary: string; fallbacks: string[] } {
  return { primary: model.primary, fallbacks: model.fallbacks }
}

/**
 * Patch for one agent entry, given the entry as it is now. `null` removes
 * the agent's own value so it inherits the gateway default. Arrays are
 * listed in `replacePaths` so a shorter list replaces the old one instead
 * of being refused. The gateway always keeps a workspace, so a `null`
 * workspace leaves it unchanged.
 */
export function toAgentSettingsPatch(
  agentId: string,
  update: AgentRuntimeSettingsUpdate,
  current: OCAgentEntry = {},
): GatewayConfigPatch {
  const path = `agents.entries.${agentId}`
  const entry: Record<string, unknown> = {}
  const replacePaths: string[] = []
  if (update.model !== undefined) {
    entry.model = update.model ? toGatewayModel(update.model) : null
    replacePaths.push(`${path}.model.fallbacks`)
  }
  if (update.deniedTools !== undefined) {
    const deny = update.deniedTools?.length ? update.deniedTools : null
    // Drop `tools` altogether when `deny` was all it held.
    const onlyDeny = Object.keys(current.tools ?? {}).every((key) => key === 'deny')
    entry.tools = deny || !onlyDeny ? { deny } : null
    replacePaths.push(`${path}.tools.deny`)
  }
  if (update.workspace) entry.workspace = update.workspace
  if (Object.keys(entry).length === 0) return { patch: {}, replacePaths: [] }
  return { patch: { agents: { entries: { [agentId]: entry } } }, replacePaths }
}

/** Patch for `agents.defaults`; only the fields present are written. */
export function toDefaultsPatch(defaults: RuntimeDefaults): GatewayConfigPatch {
  const entry: Record<string, unknown> = {}
  const replacePaths: string[] = []
  if (defaults.model) {
    entry.model = toGatewayModel(defaults.model)
    replacePaths.push('agents.defaults.model.fallbacks')
  }
  if (defaults.workspaceRoot) entry.workspace = defaults.workspaceRoot
  if (Object.keys(entry).length === 0) return { patch: {}, replacePaths: [] }
  return { patch: { agents: { defaults: entry } }, replacePaths }
}

export function toRuntimeHealth(oc: OCHealthStatus): RuntimeHealth {
  return {
    ok: oc.ok,
    uptime: oc.uptime,
    agents: oc.agents,
    stateVersion: oc.stateVersion,
  }
}

export function toRuntimeSpawnResult(oc: OCSessionCreateResult): SpawnResult {
  return {
    status: 'accepted',
    runId: oc.runId ?? '',
    sessionKey: oc.key,
  }
}
