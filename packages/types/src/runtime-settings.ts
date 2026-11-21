// Runtime settings — the provider-agnostic view of how a runtime runs each
// agent (model, denied tools, workspace). TAIA stores the desired values;
// each adapter maps them to and from its native config.
//
// Justification: docs/adr/005-runtime-owned-context-and-settings.md

/** Canonical model reference: `provider/model` (e.g. `anthropic/claude-opus-5-5`). */
export type ModelRef = string

export interface ModelSelection {
  primary: ModelRef
  /** Tried in order when the primary model fails. */
  fallbacks: ModelRef[]
}

/** Per-agent settings. An omitted field inherits the runtime default. */
export interface AgentRuntimeSettings {
  model?: ModelSelection
  /** Runtime-native tool names the agent must not use. */
  deniedTools?: string[]
  /** Working directory or workspace path; the adapter derives one when omitted. */
  workspace?: string
}

/**
 * A change to an agent's settings: a value sets the field, `null` resets it
 * to the runtime default, an omitted field is left as it is.
 */
export type AgentRuntimeSettingsUpdate = {
  [K in keyof AgentRuntimeSettings]?: AgentRuntimeSettings[K] | null
}

/** Settings that apply to every agent unless overridden. */
export interface RuntimeDefaults {
  model?: ModelSelection
  workspaceRoot?: string
}

/** Where an effective setting comes from. */
export type SettingSource = 'taia' | 'runtime' | 'default'

export interface EffectiveAgentRuntimeSettings {
  agentId: string
  settings: AgentRuntimeSettings
  source: Partial<Record<keyof AgentRuntimeSettings, SettingSource>>
}
