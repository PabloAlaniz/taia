// Canonical runtime types — agnostic of any specific runtime implementation.
// Adapters translate from their native shapes to these types.

import type { AgentContextBundle, AgentRuntimeSettings, RuntimeDefaults } from '@taia/types'

export type RuntimeConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface RuntimeAgent {
  id: string
  name?: string
  configured?: boolean
}

export interface RuntimeSession {
  key: string
  /** TAIA agent the session belongs to, when the runtime knows it. */
  agentId?: string
  kind: string
  channel?: string
  sessionId: string
  updatedAt: number
  label?: string
  model?: string
  totalTokens?: number
  inputTokens?: number
  outputTokens?: number
  /** Anthropic prompt caching: tokens written to cache (billed ~1.25× input). */
  cacheCreationInputTokens?: number
  /** Anthropic prompt caching: tokens served from cache (billed ~0.1× input). */
  cacheReadInputTokens?: number
  /** Wall-clock duration in ms; undefined while still running. */
  durationMs?: number
  messages?: RuntimeMessage[]
}

export interface RuntimeMessage {
  id?: string
  role: 'user' | 'assistant' | 'tool'
  content: unknown
  timestamp?: string
  model?: string
  stopReason?: string
}

export interface ListSessionsOptions {
  kinds?: string[]
  limit?: number
  activeMinutes?: number
  messageLimit?: number
}

export interface SessionHistoryOptions {
  limit?: number
  includeTools?: boolean
}

/**
 * Optional image attachment passed alongside a spawn task. Mirrors the
 * Anthropic image content block shape; adapters that don't support vision
 * can ignore the field. Source can be a URL or base64 (small files only —
 * for large attachments the Files API is not supported yet).
 */
export interface RuntimeImageAttachment {
  type: 'image'
  source:
    | { type: 'url'; url: string }
    | {
        type: 'base64'
        media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
        data: string
      }
}

/** Why a session is being started, so the adapter can phrase the kickoff. */
export type SpawnTrigger =
  | { kind: 'heartbeat' }
  | { kind: 'task'; taskId: string }
  | { kind: 'prompt' }

export interface SpawnOptions {
  label?: string
  agentId?: string
  model?: string
  runTimeoutSeconds?: number
  cleanup?: boolean
  /** Image attachments included with the spawn task (vision-capable adapters only). */
  attachments?: RuntimeImageAttachment[]
  /**
   * Per-agent context bundle. When provided, the adapter renders it into
   * its native shape (system blocks for Anthropic, a single prompt for CLI
   * agents, workspace files plus a kickoff for OpenClaw) instead of using
   * its global default. See ADR-003, ADR-005 and apps/docs/src/content/docs/arquitectura/modelo-de-contexto.md.
   */
  context?: AgentContextBundle
  /**
   * Audit trail for the spawn — which version of each bundle layer was
   * active when this session was created. Persisted as
   * runtime_sessions.bundle_version_ids so a misbehaving run can be
   * correlated with the exact identity / project / user version it
   * consumed. Produced by core/services/agent-context.service.
   * Shape: { agent_identity: 'v_xxx', project_context: 'v_yyy', ... }.
   */
  bundleVersionIds?: Record<string, string>
  /**
   * Why the session starts. With a context bundle, adapters build the first
   * message from it and treat the `task` string as a neutral fallback.
   */
  trigger?: SpawnTrigger
}

export interface SpawnResult {
  status: 'accepted'
  runId: string
  sessionKey: string
}

export interface SendResult {
  status: 'accepted' | 'ok'
  runId?: string
  reply?: string
}

export interface AwaitSessionOptions {
  timeoutMs: number
  fallbackPollIntervalMs?: number
}

export interface AwaitSessionMatcher {
  runId?: string
  sessionKey?: string
}

export interface RuntimeCronJob {
  id: string
  agentId: string
  name?: string
  enabled: boolean
  /** Declared by the runtime itself (config/plugins); TAIA must not edit it. */
  managedByRuntime?: boolean
  schedule: { kind: string; expr?: string; everyMs?: number; tz?: string }
  payload?: { timeoutSeconds?: number }
  state?: {
    nextRunAtMs?: number
    lastRunAtMs?: number
    lastStatus?: string
    lastError?: string
    lastDurationMs?: number
  }
}

export type CronAction = 'status' | 'list' | 'add' | 'update' | 'remove' | 'run' | 'runs' | 'wake'

export interface RuntimeHealth {
  ok: boolean
  uptime?: number
  agents?: number
  stateVersion?: number
}

/** A message delivered through the runtime's own channel integrations. */
export interface ChannelMessage {
  /** Channel id as the runtime names it, e.g. `telegram`. */
  channel: string
  /** Recipient within the channel (chat id, handle…). */
  target: string
  text: string
}

/** Why a connection test failed, so the UI can show a targeted hint. */
export type RuntimeConnectionFailure =
  | 'unreachable'
  | 'unauthorized'
  /** The runtime knows the client but an operator must approve it first. */
  | 'pairing_required'
  | 'not_found'
  | 'misconfigured'
  | 'unknown'

/** Result of probing a runtime with the credentials it was built with. */
export interface RuntimeConnectionTest {
  ok: boolean
  /** Agents the runtime reports, for runtimes that host agents. */
  agents?: number
  /** Human-readable failure message. */
  error?: string
  reason?: RuntimeConnectionFailure
  /** Provider-specific facts worth showing (model id, protocol version…). */
  details?: Record<string, unknown>
}

export type RuntimeEventName =
  | 'agent'
  | 'chat'
  | 'presence'
  | 'tick'
  | 'health'
  | 'heartbeat'
  | 'shutdown'
  | 'exec.approval.requested'
  | string

export type RuntimeEventHandler = (payload: unknown) => void

/**
 * Provider-specific defaults that the core can read to avoid hardcoding
 * runtime-shaped values (e.g. workspace paths). Each adapter decides what
 * to expose.
 */
export interface RuntimeProviderDefaults {
  workspaceRoot?: string
  configFilename?: string
  [key: string]: unknown
}

// === Runtime settings & provisioning (ADR-005) ===

/** Settings the runtime reports for its agents, in neutral form. */
export interface RuntimeSettingsSnapshot {
  defaults: RuntimeDefaults
  agents: Record<string, AgentRuntimeSettings & { name?: string }>
  /** Config revision, usable as a precondition for writes. */
  revision?: string
}

/** An agent as TAIA wants it to exist in the runtime. */
export interface RuntimeAgentSpec {
  id: string
  name: string
  settings: AgentRuntimeSettings
}

export interface ProvisionOutcome {
  status: 'created' | 'exists' | 'updated' | 'failed'
  effective?: AgentRuntimeSettings
  error?: string
  /** Manual steps when the runtime can't be changed automatically. */
  manualHint?: string
}

/** The runtime's own config document, opaque to TAIA. */
export interface NativeConfigDocument {
  document: unknown
  revision?: string
}
