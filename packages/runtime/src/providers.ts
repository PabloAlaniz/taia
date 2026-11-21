// Bundled runtime providers — what each one needs to be configured. Pure data
// (no runtime deps) so the settings UI can import it via
// `@taia/runtime/providers`. Settings live under `runtime.providers.<id>.<field>`.

export type ProviderField =
  | 'url'
  | 'token'
  | 'model'
  | 'command'
  | 'cwd'
  | 'promptMode'
  /** Base URL the Anthropic adapter's tools use to call back into TAIA. */
  | 'taia_base_url'
  /** How file-based runtimes get the agent context: `pull` or `push` (ADR-005). */
  | 'context_sync'

/** The field that must be set before a provider counts as configured. */
export type ProviderRequirement = 'url' | 'token' | 'command' | 'none'

export interface RuntimeProviderInfo {
  id: string
  requirement: ProviderRequirement
  /** Editable settings, in display order. */
  fields: ProviderField[]
  /** CLI providers are opt-in via `runtime.providers.<id>.enabled = 'true'`. */
  usesEnabledFlag: boolean
  /** The runtime hosts its own roster of agents (its agent count is meaningful). */
  hostsAgents: boolean
  /** Prefilled values for a fresh configuration. */
  defaults: Partial<Record<ProviderField, string>>
  /**
   * CLI providers: the binary names they may run (bare or as an absolute
   * path). Auth is optional, so anything else needs an operator env override.
   */
  commands?: readonly string[]
}

export const STANDALONE_PROVIDER = 'none'

export const RUNTIME_PROVIDERS: readonly RuntimeProviderInfo[] = [
  {
    id: STANDALONE_PROVIDER,
    requirement: 'none',
    fields: [],
    hostsAgents: false,
    usesEnabledFlag: false,
    defaults: {},
  },
  {
    id: 'anthropic',
    requirement: 'token',
    fields: ['token', 'model', 'taia_base_url'],
    hostsAgents: false,
    usesEnabledFlag: false,
    defaults: {},
  },
  {
    id: 'openclaw',
    requirement: 'url',
    fields: ['url', 'token', 'context_sync'],
    hostsAgents: true,
    usesEnabledFlag: false,
    defaults: { url: 'http://localhost:18789', context_sync: 'push' },
  },
  {
    id: 'claude-code',
    requirement: 'command',
    fields: ['command', 'cwd', 'promptMode'],
    hostsAgents: false,
    usesEnabledFlag: true,
    defaults: { command: 'claude', promptMode: 'arg' },
    commands: ['claude'],
  },
  {
    id: 'aider',
    requirement: 'command',
    fields: ['command', 'cwd', 'promptMode'],
    hostsAgents: false,
    usesEnabledFlag: true,
    defaults: { command: 'aider', promptMode: 'arg' },
    commands: ['aider'],
  },
  {
    id: 'cursor',
    requirement: 'command',
    fields: ['command', 'cwd', 'promptMode'],
    hostsAgents: false,
    usesEnabledFlag: true,
    defaults: { command: 'cursor', promptMode: 'arg' },
    commands: ['cursor', 'cursor-agent'],
  },
]

/** Fields that hold secrets and are masked when read back. */
export const SECRET_PROVIDER_FIELDS: readonly ProviderField[] = ['token']

export function findRuntimeProvider(id: string): RuntimeProviderInfo | undefined {
  return RUNTIME_PROVIDERS.find((p) => p.id === id)
}

export function providerSettingKey(provider: string, field: ProviderField | 'enabled'): string {
  return `runtime.providers.${provider}.${field}`
}
