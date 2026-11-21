// Runtime capability model — declares what an adapter supports.
// Services that depend on a capability must check `adapter.capabilities.has(...)`
// before calling the corresponding method.

export const RuntimeCapability = {
  Sessions: 'sessions',
  Transcripts: 'transcripts',
  Cron: 'cron',
  Approvals: 'approvals',
  LiveEvents: 'live_events',
  Health: 'health',
  /** Deliver messages to external channels (e.g. Telegram) through the runtime. */
  Messaging: 'messaging',
  /** Render the context bundle to native files and push them (ADR-005). */
  ContextSync: 'context_sync',
  /** Report per-agent settings (model, denied tools, workspace) in neutral form. */
  RuntimeSettingsRead: 'runtime_settings_read',
  /** Create and update agents and their settings in the runtime. */
  AgentProvisioning: 'agent_provisioning',
  /** Read and patch the runtime's own config document (opaque escape hatch). */
  NativeConfig: 'native_config',
} as const

export type RuntimeCapability = (typeof RuntimeCapability)[keyof typeof RuntimeCapability]

export class CapabilitySet {
  private readonly caps: Set<RuntimeCapability>

  constructor(caps: readonly RuntimeCapability[]) {
    this.caps = new Set(caps)
  }

  has(cap: RuntimeCapability): boolean {
    return this.caps.has(cap)
  }

  list(): RuntimeCapability[] {
    return Array.from(this.caps)
  }
}
