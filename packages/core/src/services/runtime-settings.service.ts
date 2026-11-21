// Runtime settings service — the provider-agnostic view of how the runtime
// runs each agent (model, denied tools, workspace), read through the
// adapter's RuntimeSettingsRead capability. Core never parses a runtime's
// native config (ADR-005).

import type { ModelSelection } from '@taia/types'
import {
  RuntimeCapability,
  type AgentRuntimeAdapter,
  type RuntimeSettingsSnapshot,
} from '@taia/runtime'

import { forEachRuntime, type RuntimeFanOut } from '../runtime'

export interface RuntimeSettingsView {
  provider: string
  /** False when the runtime does not publish its settings. */
  supported: boolean
  settings?: RuntimeSettingsSnapshot
}

/** Settings a runtime reports, or `supported: false`. */
export async function getRuntimeSettings(
  adapter: AgentRuntimeAdapter,
): Promise<RuntimeSettingsView> {
  if (
    !adapter.capabilities.has(RuntimeCapability.RuntimeSettingsRead) ||
    !adapter.getRuntimeSettings
  ) {
    return { provider: adapter.id, supported: false }
  }
  return { provider: adapter.id, supported: true, settings: await adapter.getRuntimeSettings() }
}

/** Settings of every instance, default first. */
export function listRuntimeSettings(): Promise<RuntimeFanOut<RuntimeSettingsView>> {
  return forEachRuntime(getRuntimeSettings)
}

/** The model an agent runs with: its own selection, else the runtime default. */
export function effectiveModel(
  snapshot: RuntimeSettingsSnapshot,
  agentId: string,
): ModelSelection | undefined {
  return snapshot.agents[agentId]?.model ?? snapshot.defaults.model
}
