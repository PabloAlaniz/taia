// Runtime connection test — probes a provider with a runtime instance's
// stored settings plus unsaved overrides from the UI, using a throwaway
// adapter so the pooled adapters are never touched.

import type {
  AgentRuntimeAdapter,
  RuntimeConnectionTest,
  RuntimeProviderConfig,
  RuntimeProviderName,
} from '@taia/runtime'
import { getRuntimeInstance, setSetting } from '../db/index'
import { createProviderAdapter } from '../runtime'
import {
  getInstanceConfig,
  instanceSettingKey,
  requirementFor,
  resolveUrl,
} from '../runtime-instances'
import { cliCommandEnvKey, resolveCliCommand, resolveCliCwd } from '../command-policy'

export interface ConnectionOverrides {
  url?: string
  token?: string
  model?: string
  command?: string
  cwd?: string
}

const REQUIREMENT_MESSAGES = {
  url: 'Falta la URL del runtime.',
  token: 'Falta la API key o token.',
  command: 'Falta el comando a ejecutar.',
  none: 'El modo standalone no tiene un runtime para probar.',
} as const

async function buildProviderConfig(
  provider: RuntimeProviderName,
  instanceId: string,
  overrides: ConnectionOverrides,
): Promise<RuntimeProviderConfig> {
  // An instance of another provider has no settings that apply here.
  const row = await getRuntimeInstance(instanceId)
  const stored = row?.provider === provider ? await getInstanceConfig(instanceId) : null
  const cli = resolveCliCommand(provider, overrides.command ?? stored?.command)
  return {
    provider,
    instanceId,
    url: resolveUrl(overrides.url ?? null) ?? stored?.url ?? undefined,
    token: overrides.token ?? stored?.token,
    command: cli.command ?? undefined,
    cwd: resolveCliCwd(overrides.cwd ?? stored?.cwd) ?? undefined,
    promptMode: stored?.promptMode ?? 'arg',
    model: overrides.model ?? (stored && row?.config.model) ?? undefined,
  }
}

function missingRequirement(config: RuntimeProviderConfig): string | null {
  const requirement = requirementFor(config.provider)
  switch (requirement) {
    case 'none':
      return REQUIREMENT_MESSAGES.none
    case 'url':
      return config.url ? null : REQUIREMENT_MESSAGES.url
    case 'token':
      return config.token ? null : REQUIREMENT_MESSAGES.token
    case 'command':
      return config.command ? null : REQUIREMENT_MESSAGES.command
  }
}

async function probe(adapter: AgentRuntimeAdapter): Promise<RuntimeConnectionTest> {
  if (adapter.testConnection) return adapter.testConnection()
  try {
    const health = await adapter.getHealth()
    return health.ok
      ? { ok: true, agents: health.agents }
      : { ok: false, reason: 'unreachable', error: 'El runtime no respondió al health check.' }
  } catch (err) {
    return { ok: false, reason: 'unknown', error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Test `provider` with the settings of instance `instanceId` (unsaved
 * `overrides` win) and record the outcome in
 * `runtime.instances.<id>.connection_verified` / `.last_verified_at`.
 */
export async function testRuntimeConnection(
  target: { provider: RuntimeProviderName; instanceId: string },
  overrides: ConnectionOverrides = {},
): Promise<RuntimeConnectionTest> {
  const { provider, instanceId } = target
  if (overrides.command && resolveCliCommand(provider, overrides.command).rejected) {
    return {
      ok: false,
      reason: 'misconfigured',
      error: `Comando no permitido. Usá el binario del runtime o definí ${cliCommandEnvKey(provider)} en el servidor.`,
    }
  }
  const config = await buildProviderConfig(provider, instanceId, overrides)
  const missing = missingRequirement(config)
  if (missing) return { ok: false, reason: 'misconfigured', error: missing }

  let adapter: AgentRuntimeAdapter
  try {
    adapter = createProviderAdapter(config)
  } catch (err) {
    return {
      ok: false,
      reason: 'misconfigured',
      error: err instanceof Error ? err.message : String(err),
    }
  }

  try {
    const result = await probe(adapter)
    // Recorded on the instance being tested; a provider tried out before it
    // has an instance of its own has nowhere to record it.
    if ((await getRuntimeInstance(instanceId))?.provider === provider) {
      await setSetting(instanceSettingKey(instanceId, 'connection_verified'), String(result.ok))
      if (result.ok) {
        await setSetting(
          instanceSettingKey(instanceId, 'last_verified_at'),
          new Date().toISOString(),
        )
      }
    }
    return result
  } finally {
    adapter.disconnect?.()
  }
}
