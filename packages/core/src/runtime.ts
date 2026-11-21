// Runtime adapter pool for TAIA core: one adapter per runtime instance
// (runtime-instances.ts), built through the @taia/runtime registry and
// rebuilt when the instance's config changes.
//
// Adapters self-register when imported. Every bundled adapter is imported
// here, plus the Noop adapter used in standalone mode, so they are available
// to the registry before the first adapter is built.

import {
  createRuntimeAdapter,
  type AgentRuntimeAdapter,
  type RuntimeProviderConfig,
} from '@taia/runtime'
import '@taia/runtime/adapters/openclaw'
import '@taia/runtime/adapters/noop'
import '@taia/runtime/adapters/claude-code'
import '@taia/runtime/adapters/cursor'
import '@taia/runtime/adapters/aider'
import './anthropic-wiring' // registers the Anthropic factory with the runtime registry
import './openclaw-wiring' // re-registers OpenClaw with a settings-backed credential store
import {
  getAgentInstanceId,
  getDefaultInstanceId,
  getInstanceAdapterConfig,
  listConfiguredInstances,
  loadAgentInstanceResolver,
} from './runtime-instances'
import { config } from './config'

interface PoolEntry {
  adapter: AgentRuntimeAdapter
  configKey: string
}

const pool = new Map<string, PoolEntry>()
let standaloneAdapter: AgentRuntimeAdapter | null = null

function configKeyOf(providerConfig: RuntimeProviderConfig | null): string {
  if (!providerConfig) return 'unconfigured'
  return JSON.stringify({
    ...providerConfig,
    token: providerConfig.token ? '<set>' : '<empty>',
  })
}

/**
 * Build a standalone adapter for an explicit provider config without touching
 * the pool (e.g. to test settings before saving them). The caller owns it and
 * should call `disconnect()` when done.
 */
export function createProviderAdapter(providerConfig: RuntimeProviderConfig): AgentRuntimeAdapter {
  // Agents without native TAIA tools reach the board over HTTP at this URL.
  return createRuntimeAdapter({ taiaBaseUrl: config.taia.url, ...providerConfig })
}

// Standalone mode: no runtime to run on. The noop adapter gives callers a
// structured no-capability response instead of a connection error; services
// with hard requirements still throw RuntimeCapabilityError, which surfaces a
// clear message in the API layer.
function getStandaloneAdapter(): AgentRuntimeAdapter {
  standaloneAdapter ??= createProviderAdapter({ provider: 'none' })
  return standaloneAdapter
}

/**
 * The adapter of a runtime instance. An instance that does not exist or is
 * not configured gets the noop adapter.
 */
export async function getRuntimeAdapter(instanceId: string): Promise<AgentRuntimeAdapter> {
  const providerConfig = await getInstanceAdapterConfig(instanceId)
  const configKey = configKeyOf(providerConfig)
  const cached = pool.get(instanceId)
  if (cached?.configKey === configKey) return cached.adapter

  // No await between the lookup above and the swap below: concurrent callers
  // either see the cached entry or build the same one.
  cached?.adapter.disconnect?.()
  const adapter = providerConfig
    ? createProviderAdapter(providerConfig)
    : createProviderAdapter({ provider: 'none', instanceId })
  pool.set(instanceId, { adapter, configKey })

  // Connect eagerly so live-event consumers receive updates right away.
  // Failures are non-fatal: the adapter reports them through its connection
  // state.
  try {
    await adapter.isAvailable()
  } catch {
    // Logged inside the adapter; the HTTP path keeps working.
  }
  return adapter
}

/** The default instance's adapter; the noop adapter in standalone mode. */
export async function getDefaultRuntimeAdapter(): Promise<AgentRuntimeAdapter> {
  const instanceId = await getDefaultInstanceId()
  return instanceId ? getRuntimeAdapter(instanceId) : getStandaloneAdapter()
}

/** The adapter that runs `agentId`: its assigned instance, else the default. */
export async function getRuntimeAdapterForAgent(agentId: string): Promise<AgentRuntimeAdapter> {
  const instanceId = await getAgentInstanceId(agentId)
  return instanceId ? getRuntimeAdapter(instanceId) : getStandaloneAdapter()
}

// --- Fan-out over every instance ---

/** What one instance answered in a fan-out. */
export interface InstanceResult<T> {
  instanceId: string
  value: T
}

export interface InstanceFailure {
  instanceId: string
  error: string
}

export interface RuntimeFanOut<T> {
  /** One entry per instance that answered, default first. */
  results: InstanceResult<T>[]
  /** Instances that threw or did not answer in time. */
  failures: InstanceFailure[]
}

/** How long one instance gets to answer a fan-out before it counts as failed. */
export const FAN_OUT_TIMEOUT_MS = 10_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Run `fn` on every configured instance in parallel. An instance that throws
 * or does not answer within `timeoutMs` lands in `failures` without holding
 * up the others, so one runtime that is down never blanks the board.
 */
export async function forEachRuntime<T>(
  fn: (adapter: AgentRuntimeAdapter, instanceId: string) => Promise<T>,
  { timeoutMs = FAN_OUT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<RuntimeFanOut<T>> {
  const instances = await listConfiguredInstances()
  const settled = await Promise.allSettled(
    instances.map(({ instanceId }) =>
      withTimeout(
        getRuntimeAdapter(instanceId).then((adapter) => fn(adapter, instanceId)),
        timeoutMs,
      ),
    ),
  )

  const fanOut: RuntimeFanOut<T> = { results: [], failures: [] }
  settled.forEach((outcome, i) => {
    const { instanceId } = instances[i]
    if (outcome.status === 'fulfilled') {
      fanOut.results.push({ instanceId, value: outcome.value })
      return
    }
    const error = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
    console.warn(`[runtime] instance ${instanceId} failed: ${error}`)
    fanOut.failures.push({ instanceId, error })
  })
  return fanOut
}

/**
 * Merge per-instance agent listings into one entry per agent. An agent that
 * several instances report is taken from the instance it runs on; otherwise
 * from the first that reports it (default first).
 */
export async function mergeAgentListings<T>(
  results: InstanceResult<T[]>[],
  agentIdOf: (item: T) => string,
): Promise<InstanceResult<T>[]> {
  const instanceOf = await loadAgentInstanceResolver()
  const merged = new Map<string, InstanceResult<T>>()
  for (const { instanceId, value } of results) {
    for (const item of value) {
      const agentId = agentIdOf(item)
      const current = merged.get(agentId)
      if (!current || (instanceId === instanceOf(agentId) && current.instanceId !== instanceId)) {
        merged.set(agentId, { instanceId, value: item })
      }
    }
  }
  return Array.from(merged.values())
}

/** The pooled adapter of an instance, without building one. */
export function peekRuntimeAdapter(instanceId: string): AgentRuntimeAdapter | null {
  return pool.get(instanceId)?.adapter ?? null
}

/** Disconnect and drop one instance's adapter, or every adapter. */
export function disposeRuntimeAdapter(instanceId?: string): void {
  const ids = instanceId ? [instanceId] : Array.from(pool.keys())
  for (const id of ids) {
    pool.get(id)?.adapter.disconnect?.()
    pool.delete(id)
  }
}
