// AgentRuntimeAdapter — the contract between TAIA core and any runtime that
// hosts AI agents. Adapters declare capabilities; consumers must check them
// before calling optional methods.

import type { AgentContextBundle, AgentRuntimeSettingsUpdate, RuntimeDefaults } from '@taia/types'
import type { CapabilitySet } from './capabilities'
import type { AgentContextProjection, ContextSyncOutcome, ContextSyncRequest } from './context-sync'
import type {
  AwaitSessionMatcher,
  AwaitSessionOptions,
  ChannelMessage,
  CronAction,
  ListSessionsOptions,
  NativeConfigDocument,
  ProvisionOutcome,
  RuntimeAgent,
  RuntimeConnectionState,
  RuntimeCronJob,
  RuntimeEventHandler,
  RuntimeEventName,
  RuntimeConnectionTest,
  RuntimeHealth,
  RuntimeMessage,
  RuntimeAgentSpec,
  RuntimeProviderDefaults,
  RuntimeSettingsSnapshot,
  RuntimeSession,
  SendResult,
  SessionHistoryOptions,
  SpawnOptions,
  SpawnResult,
} from './types'

export interface AgentRuntimeAdapter {
  readonly id: string
  readonly capabilities: CapabilitySet

  // --- Lifecycle ---
  isAvailable(): Promise<boolean>
  getConnectionState(): RuntimeConnectionState
  onConnectionStateChange(handler: (state: RuntimeConnectionState) => void): () => void
  disconnect?(): void

  // --- Required ---
  listAgents(): Promise<RuntimeAgent[]>
  getHealth(): Promise<RuntimeHealth>

  /**
   * Probe the runtime with the credentials the adapter was built with. Never
   * throws. When omitted, callers fall back to `getHealth()`.
   */
  testConnection?(): Promise<RuntimeConnectionTest>

  // --- Provider metadata ---
  getProviderDefaults?(): RuntimeProviderDefaults

  // --- Sessions (capability: Sessions) ---
  spawnSession?(task: string, options?: SpawnOptions): Promise<SpawnResult>
  sendToSession?(sessionKey: string, message: string, timeoutSeconds?: number): Promise<SendResult>
  listSessions?(options?: ListSessionsOptions): Promise<RuntimeSession[]>
  awaitSessionComplete?(matcher: AwaitSessionMatcher, options: AwaitSessionOptions): Promise<void>

  // --- Transcripts (capability: Transcripts) ---
  getSessionHistory?(sessionKey: string, options?: SessionHistoryOptions): Promise<RuntimeMessage[]>

  // --- Cron (capability: Cron) ---
  listCrons?(includeDisabled?: boolean): Promise<RuntimeCronJob[]>
  cronAction?(action: CronAction, params?: Record<string, unknown>): Promise<unknown>

  // --- Context sync (capability: ContextSync) ---
  /** Pure render of the bundle to the runtime's native files. */
  projectAgentContext?(bundle: AgentContextBundle): AgentContextProjection
  /** Push the projection; never overwrites files the agent changed unless `force`. */
  syncAgentContext?(request: ContextSyncRequest): Promise<ContextSyncOutcome>

  // --- Runtime settings (capabilities: RuntimeSettingsRead / AgentProvisioning) ---
  getRuntimeSettings?(): Promise<RuntimeSettingsSnapshot>
  /**
   * Create the agent in the runtime. An agent that already exists is left as
   * it is (`exists`). Never throws: failures come back as `failed`, with a
   * `manualHint` when an operator can do it by hand.
   */
  provisionAgent?(spec: RuntimeAgentSpec): Promise<ProvisionOutcome>
  /** Apply a settings change to an existing agent. Never throws. */
  updateAgentSettings?(
    agentId: string,
    update: AgentRuntimeSettingsUpdate,
  ): Promise<ProvisionOutcome>
  /** Remove the agent from the runtime; its files stay. No-op when absent. */
  deprovisionAgent?(agentId: string): Promise<void>
  setRuntimeDefaults?(
    defaults: RuntimeDefaults,
    options?: { expectedRevision?: string },
  ): Promise<void>

  // --- Native config (capability: NativeConfig) ---
  getNativeConfig?(): Promise<NativeConfigDocument>
  patchNativeConfig?(patch: Record<string, unknown>, expectedRevision?: string): Promise<unknown>

  // --- Messaging (capability: Messaging) ---
  sendChannelMessage?(message: ChannelMessage): Promise<void>

  // --- Live events (capability: LiveEvents) ---
  on?(event: RuntimeEventName, handler: RuntimeEventHandler): () => void
}
