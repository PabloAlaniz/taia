// Runtime instances — the named runtimes agents run on.
//
// An instance is a provider plus its settings: non-secret fields in
// `runtime_instances.config`, secrets and runtime-issued state in settings
// under `runtime.instances.<id>.*`. Each agent runs on its assigned
// instance, or on the default one (`runtime.default_instance`); no default
// means standalone mode.

import { existsSync } from 'fs'
import {
  deleteSetting,
  getAgentRuntimeInstanceId,
  getRuntimeInstance,
  getSetting,
  listAgentRuntimeInstanceIds,
  listRuntimeInstances,
  setSetting,
  upsertRuntimeInstance,
  type RuntimeInstanceRow,
} from './db/index'
import {
  findRuntimeProvider,
  STANDALONE_PROVIDER,
  type ProviderRequirement,
  type RuntimeProviderConfig,
  type RuntimeProviderName,
} from '@taia/runtime'
import { resolveCliCommand, resolveCliCwd } from './command-policy'

const isDocker = existsSync('/.dockerenv')

export function resolveUrl(url: string | null): string | null {
  if (!url || !isDocker) return url
  return url.replace(/localhost|127\.0\.0\.1/, 'host.docker.internal')
}

export const DEFAULT_INSTANCE_KEY = 'runtime.default_instance'

/** Provider fields kept in `runtime_instances.config`; any other field is a setting. */
export const INSTANCE_CONFIG_FIELDS = [
  'url',
  'model',
  'command',
  'cwd',
  'promptMode',
  'context_sync',
  'enabled',
  'taia_base_url',
] as const

/** Settings key for an instance's secret or runtime-issued value. */
export function instanceSettingKey(instanceId: string, field: string): string {
  return `runtime.instances.${instanceId}.${field}`
}

export interface RuntimeInstanceConfig {
  /** Null in standalone mode (no default instance). */
  instanceId: string | null
  provider: RuntimeProviderName
  label: string
  url: string | null
  token: string
  command: string | null
  cwd: string | null
  promptMode: 'arg' | 'stdin'
  configured: boolean
}

/** The config of an instance that exists (it always has an id). */
export type StoredInstanceConfig = RuntimeInstanceConfig & { instanceId: string }

const STANDALONE: RuntimeInstanceConfig = {
  instanceId: null,
  provider: STANDALONE_PROVIDER,
  label: STANDALONE_PROVIDER,
  url: null,
  token: '',
  command: null,
  cwd: null,
  promptMode: 'arg',
  configured: false,
}

// What a provider needs before it counts as "configured" comes from the
// bundled provider table (@taia/runtime/providers). Unknown (third-party)
// providers default to requiring a URL.
export function requirementFor(provider: RuntimeProviderName): ProviderRequirement {
  return findRuntimeProvider(provider)?.requirement ?? 'url'
}

function meetsRequirement(
  requirement: ProviderRequirement,
  values: { url: string | null; token: string; command: string | null },
): boolean {
  switch (requirement) {
    case 'none':
      return false
    case 'token':
      return !!values.token
    case 'command':
      return !!values.command
    case 'url':
      return !!values.url
  }
}

async function toInstanceConfig(row: RuntimeInstanceRow): Promise<StoredInstanceConfig> {
  const field = (name: string) => row.config[name] || null
  const url = field('url')
  const token = (await getSetting(instanceSettingKey(row.id, 'token'))) || ''
  const isCli = findRuntimeProvider(row.provider)?.fields.includes('command') ?? false
  // CLI binaries are restricted by policy (command-policy.ts): a stored
  // command outside it is treated as unset, so the instance is unconfigured.
  const command = isCli ? resolveCliCommand(row.provider, field('command')).command : null
  // CLI providers are opt-in: they run only once explicitly enabled.
  const enabled = !findRuntimeProvider(row.provider)?.usesEnabledFlag || field('enabled') === 'true'
  return {
    instanceId: row.id,
    provider: row.provider,
    label: row.label,
    url: resolveUrl(url),
    token,
    command,
    cwd: isCli ? resolveCliCwd(field('cwd')) : null,
    promptMode: field('promptMode') === 'stdin' ? 'stdin' : 'arg',
    configured: enabled && meetsRequirement(requirementFor(row.provider), { url, token, command }),
  }
}

/** Id of the default instance, or null in standalone mode. */
export async function getDefaultInstanceId(): Promise<string | null> {
  return (await getSetting(DEFAULT_INSTANCE_KEY)) || null
}

/** The instance `agentId` runs on: its assigned one, else the default. */
export async function getAgentInstanceId(agentId: string): Promise<string | null> {
  return (await getAgentRuntimeInstanceId(agentId)) ?? (await getDefaultInstanceId())
}

/**
 * Resolve many agents' instances with two queries: returns `agentId` → its
 * assigned instance, else the default (null in standalone mode).
 */
export async function loadAgentInstanceResolver(): Promise<(agentId: string) => string | null> {
  const [assigned, defaultId] = await Promise.all([
    listAgentRuntimeInstanceIds(),
    getDefaultInstanceId(),
  ])
  return (agentId) => assigned.get(agentId) ?? defaultId
}

/** An instance's config, or null when there is no such instance. */
export async function getInstanceConfig(instanceId: string): Promise<StoredInstanceConfig | null> {
  const row = await getRuntimeInstance(instanceId)
  return row ? toInstanceConfig(row) : null
}

/** Config of the default instance; the standalone shape when there is none. */
export async function getDefaultInstanceConfig(): Promise<RuntimeInstanceConfig> {
  const id = await getDefaultInstanceId()
  return (id && (await getInstanceConfig(id))) || STANDALONE
}

/** Every configured instance, default first. */
export async function listConfiguredInstances(): Promise<StoredInstanceConfig[]> {
  const defaultId = await getDefaultInstanceId()
  const configs = await Promise.all((await listRuntimeInstances()).map(toInstanceConfig))
  return configs
    .filter((c) => c.configured)
    .sort((a, b) => Number(b.instanceId === defaultId) - Number(a.instanceId === defaultId))
}

/**
 * Adapter construction config for an instance, or null when it does not
 * exist or is not configured.
 */
export async function getInstanceAdapterConfig(
  instanceId: string,
): Promise<RuntimeProviderConfig | null> {
  const row = await getRuntimeInstance(instanceId)
  if (!row) return null
  const cfg = await toInstanceConfig(row)
  if (!cfg.configured) return null
  const model = row.config.model || undefined
  const taiaBaseUrl = row.config.taia_base_url?.trim() || undefined
  return {
    provider: cfg.provider,
    instanceId,
    url: cfg.url ?? undefined,
    token: cfg.token,
    command: cfg.command ?? undefined,
    cwd: cfg.cwd ?? undefined,
    promptMode: cfg.promptMode,
    // Anthropic reads `model` as its default model; gateway providers ignore it.
    ...(model ? { model } : {}),
    // How file-based runtimes get the agent context (ADR-005): `push` writes
    // the workspace files (default), `pull` has the agent fetch them.
    ...(row.config.context_sync === 'pull' ? { contextSync: 'pull' } : {}),
    ...(taiaBaseUrl ? { taiaBaseUrl } : {}),
  }
}

// --- Provider settings bridge (until E3) ---
//
// The settings UI still edits one runtime per provider through
// `runtime.providers.<provider>.*` and `runtime.default_provider`. Each write
// is applied to the instance named after the provider, so the runtime only
// ever reads instances. E3 replaces the UI and removes this bridge.

const LEGACY_DEFAULT_PROVIDER_KEY = 'runtime.default_provider'
const LEGACY_PROVIDER_KEY = /^runtime\.providers\.([a-z0-9][a-z0-9_-]*)\.(.+)$/

async function ensureInstance(provider: string, config: Record<string, string | null> = {}) {
  await upsertRuntimeInstance({ id: provider, provider, label: provider, config })
}

/**
 * Apply a write (`value`) or delete (`null`) of a provider-scoped setting to
 * the matching instance. Returns false for keys that are not provider-scoped.
 */
export async function applyProviderSetting(key: string, value: string | null): Promise<boolean> {
  if (key === LEGACY_DEFAULT_PROVIDER_KEY) {
    if (!value || value === STANDALONE_PROVIDER) {
      await deleteSetting(DEFAULT_INSTANCE_KEY)
    } else {
      await ensureInstance(value)
      await setSetting(DEFAULT_INSTANCE_KEY, value)
    }
    return true
  }

  const match = LEGACY_PROVIDER_KEY.exec(key)
  if (!match) return false
  const [, provider, field] = match
  if ((INSTANCE_CONFIG_FIELDS as readonly string[]).includes(field)) {
    await ensureInstance(provider, { [field]: value || null })
  } else if (value === null) {
    await deleteSetting(instanceSettingKey(provider, field))
  } else {
    await ensureInstance(provider)
    await setSetting(instanceSettingKey(provider, field), value)
  }
  return true
}
