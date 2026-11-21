// Public API of @taia/runtime.

export type { AgentRuntimeAdapter } from './adapter'
export type { AgentContextRenderer, RenderOptions } from './context-renderer'
export type {
  AgentContextProjection,
  ContextSyncOutcome,
  ContextSyncRequest,
  ContextSyncState,
  ProjectedFile,
} from './context-sync'
export { CapabilitySet, RuntimeCapability } from './capabilities'
export { RuntimeCapabilityError, RuntimeNotConfiguredError } from './errors'
export { requireCapability, requireCapabilityMethod } from './require-capability'
export {
  CLAUDE_MODELS,
  CURRENT_CLAUDE_MODELS,
  DEFAULT_CLAUDE_MODEL,
  findClaudeModel,
  suggestFallbackChain,
  supportsAdaptiveThinking,
} from './models'
export type { ClaudeModelInfo } from './models'
export {
  RUNTIME_PROVIDERS,
  SECRET_PROVIDER_FIELDS,
  STANDALONE_PROVIDER,
  findRuntimeProvider,
  providerSettingKey,
} from './providers'
export type { ProviderField, ProviderRequirement, RuntimeProviderInfo } from './providers'
export {
  createRuntimeAdapter,
  instanceIdOf,
  listRegisteredProviders,
  registerRuntimeFactory,
  unregisterRuntimeFactory,
} from './registry'
export type {
  RuntimeAdapterFactory,
  RuntimeProviderConfig,
  RuntimeProviderName,
} from './registry'
export type {
  AwaitSessionMatcher,
  AwaitSessionOptions,
  ChannelMessage,
  CronAction,
  ListSessionsOptions,
  NativeConfigDocument,
  ProvisionOutcome,
  RuntimeAgent,
  RuntimeConnectionFailure,
  RuntimeConnectionTest,
  RuntimeConnectionState,
  RuntimeCronJob,
  RuntimeEventHandler,
  RuntimeEventName,
  RuntimeHealth,
  RuntimeImageAttachment,
  RuntimeMessage,
  RuntimeAgentSpec,
  RuntimeProviderDefaults,
  RuntimeSettingsSnapshot,
  RuntimeSession,
  SendResult,
  SessionHistoryOptions,
  SpawnOptions,
  SpawnResult,
  SpawnTrigger,
} from './types'
