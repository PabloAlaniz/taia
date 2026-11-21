// Fake runtime pool for service tests. Register fake adapters per instance;
// `module` stands in for `@taia/core/runtime` with the real fan-out contract:
//
//   vi.mock('@taia/core/runtime', async () =>
//     (await import('../helpers/fake-runtime-pool')).fakeRuntimePool.module)

import type { AgentRuntimeAdapter } from '@taia/runtime'
import type { InstanceResult, RuntimeFanOut } from '@taia/core/runtime'

type Adapter = Partial<AgentRuntimeAdapter> & Record<string, unknown>

/** Instances in fan-out order (default first). */
const adapters = new Map<string, Adapter>()
/** Agent → the instance it runs on; unlisted agents run on the default. */
const assignments = new Map<string, string>()

function adapterOf(instanceId: string): Adapter {
  const adapter = adapters.get(instanceId)
  if (!adapter) throw new Error(`no fake adapter for instance ${instanceId}`)
  return adapter
}

const defaultInstance = () => adapters.keys().next().value ?? null

export const fakeRuntimePool = {
  /** Replace the instances: `{ id: adapter }`, the first one is the default. */
  set(instances: Record<string, Adapter>, agentInstances: Record<string, string> = {}) {
    adapters.clear()
    assignments.clear()
    for (const [id, adapter] of Object.entries(instances)) adapters.set(id, adapter)
    for (const [agent, id] of Object.entries(agentInstances)) assignments.set(agent, id)
  },

  module: {
    async forEachRuntime<T>(
      fn: (adapter: AgentRuntimeAdapter, instanceId: string) => Promise<T>,
    ): Promise<RuntimeFanOut<T>> {
      const fanOut: RuntimeFanOut<T> = { results: [], failures: [] }
      for (const [instanceId, adapter] of adapters) {
        try {
          fanOut.results.push({
            instanceId,
            value: await fn(adapter as AgentRuntimeAdapter, instanceId),
          })
        } catch (err) {
          fanOut.failures.push({ instanceId, error: String(err) })
        }
      }
      return fanOut
    },

    async mergeAgentListings<T>(
      results: InstanceResult<T[]>[],
      agentIdOf: (item: T) => string,
    ): Promise<InstanceResult<T>[]> {
      const merged = new Map<string, InstanceResult<T>>()
      for (const { instanceId, value } of results) {
        for (const item of value) {
          const agentId = agentIdOf(item)
          const owner = assignments.get(agentId) ?? defaultInstance()
          if (!merged.has(agentId) || instanceId === owner) {
            merged.set(agentId, { instanceId, value: item })
          }
        }
      }
      return Array.from(merged.values())
    },

    async getRuntimeAdapter(instanceId: string) {
      return adapterOf(instanceId)
    },

    async getDefaultRuntimeAdapter() {
      return adapterOf(defaultInstance() as string)
    },

    async getRuntimeAdapterForAgent(agentId: string) {
      return adapterOf(assignments.get(agentId) ?? (defaultInstance() as string))
    },
  },
}
