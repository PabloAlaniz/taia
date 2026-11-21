import type { RuntimeCapability } from './capabilities'

export class RuntimeCapabilityError extends Error {
  readonly runtimeId: string
  readonly capability: RuntimeCapability

  constructor(runtimeId: string, capability: RuntimeCapability) {
    super(`Runtime "${runtimeId}" does not support capability "${capability}"`)
    this.name = 'RuntimeCapabilityError'
    this.runtimeId = runtimeId
    this.capability = capability
  }
}

export class RuntimeNotConfiguredError extends Error {
  constructor(message = 'No runtime adapter configured') {
    super(message)
    this.name = 'RuntimeNotConfiguredError'
  }
}
