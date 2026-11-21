// Capability assertion helpers — services that strictly need a capability call
// these instead of writing defensive `if (!adapter.x) return []` chains. The
// thrown error reaches the API layer with a clear message identifying the
// runtime and the missing capability.

import type { AgentRuntimeAdapter } from './adapter'
import type { RuntimeCapability } from './capabilities'
import { RuntimeCapabilityError } from './errors'

export function requireCapability(
  adapter: AgentRuntimeAdapter,
  capability: RuntimeCapability,
): void {
  if (!adapter.capabilities.has(capability)) {
    throw new RuntimeCapabilityError(adapter.id, capability)
  }
}

/**
 * Asserts both the capability and that the adapter actually exposes the
 * named method. Useful when capability presence is necessary but not
 * sufficient (the type system lets adapters skip optional methods).
 */
export function requireCapabilityMethod<A extends AgentRuntimeAdapter, K extends keyof A>(
  adapter: A,
  capability: RuntimeCapability,
  method: K,
): NonNullable<A[K]> {
  requireCapability(adapter, capability)
  const fn = adapter[method]
  if (fn === undefined || fn === null) {
    throw new RuntimeCapabilityError(adapter.id, capability)
  }
  // Bind so class-based adapters keep `this` when the method is called detached.
  return (typeof fn === 'function' ? fn.bind(adapter) : fn) as NonNullable<A[K]>
}
