// OpenClaw Gateway wire-format types (protocol v4). Only the fields TAIA
// reads are declared; the gateway returns more. The adapter maps these to
// the canonical runtime types declared in @taia/runtime.

// === Device identity ===

/** Ed25519 identity the gateway pairs with (deviceId = sha256(raw public key)). */
export interface OpenClawDeviceIdentity {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}

export interface OpenClawDeviceToken {
  token: string
  scopes: string[]
}

/**
 * Persistence for the device identity and the device token the gateway issues
 * after pairing. Injected by the host (TAIA core stores it in settings); the
 * adapter never touches the database. Without a store the identity is
 * ephemeral and the gateway asks for pairing again after every restart.
 */
export interface OpenClawCredentialStore {
  loadIdentity(): Promise<OpenClawDeviceIdentity | null>
  saveIdentity(identity: OpenClawDeviceIdentity): Promise<void>
  loadDeviceToken(role: string): Promise<OpenClawDeviceToken | null>
  saveDeviceToken(role: string, token: OpenClawDeviceToken): Promise<void>
  clearDeviceToken(role: string): Promise<void>
}

// === Agents (agents.list) ===

export interface OCAgent {
  id: string
  name?: string
  workspace?: string
  model?: { primary?: string; fallbacks?: string[] }
}

// === Sessions (sessions.list / chat.history) ===

/** A bootstrap workspace file as `agents.files.get` / `.set` return it. */
export interface OCAgentFile {
  name: string
  path: string
  missing: boolean
  /** sha256 hex of the on-disk bytes; absent when the file is missing. */
  hash?: string
  content?: string
  size?: number
  updatedAtMs?: number
}

/** Precondition for `agents.files.set`: the file must still be as last read. */
export type OCAgentFilePrecondition = { expectedHash: string } | { expectedMissing: true }

export interface OCSession {
  key: string
  agentId?: string
  kind: string
  channel?: string
  sessionId: string
  updatedAt: number
  label?: string
  displayName?: string
  model?: string
  modelProvider?: string
  totalTokens?: number
  inputTokens?: number
  outputTokens?: number
  hasActiveRun?: boolean
  runtimeMs?: number
}

export interface OCChatMessage {
  role: string
  content: unknown
  /** Epoch ms. */
  timestamp?: number
  model?: string
  stopReason?: string
  __openclaw?: { id?: string }
}

export interface ListSessionsOptions {
  kinds?: string[]
  limit?: number
  activeMinutes?: number
  agentId?: string
}

export interface SessionHistoryOptions {
  limit?: number
  includeTools?: boolean
}

// === Session control (sessions.create / chat.send / agent.wait) ===

export interface SpawnOptions {
  label?: string
  agentId?: string
  model?: string
  runTimeoutSeconds?: number
}

export interface OCSessionCreateResult {
  key: string
  sessionId?: string
  runId?: string
  runStarted?: boolean
  runError?: string
  status?: string
}

export interface OCChatSendResult {
  runId?: string
  status?: string
}

/** `agent.wait` result; `status` is `timeout` while the run is still going. */
export interface OCAgentWaitResult {
  runId: string
  status: string
  error?: string
}

// === Cron (cron.*) ===

export interface OCCronJob {
  id: string
  /** Set on jobs declared by config or plugins (e.g. `heartbeat:main`). */
  declarationKey?: string
  agentId?: string
  name?: string
  enabled: boolean
  schedule: { kind: string; expr?: string; everyMs?: number; tz?: string; at?: string }
  payload?: { kind?: string; timeoutSeconds?: number }
  state?: {
    nextRunAtMs?: number
    lastRunAtMs?: number
    lastStatus?: string
    lastError?: string
    lastDurationMs?: number
  }
}

export type CronAction = 'status' | 'list' | 'add' | 'update' | 'remove' | 'run' | 'runs' | 'wake'

// === Config (config.get / config.patch) ===

export interface OCAgentEntry {
  id?: string
  name?: string
  model?: string | { primary?: string; fallbacks?: string[] }
  tools?: { deny?: string[] }
  workspace?: string
}

/** `agents.create` params; the gateway derives the agent id from `name`. */
export interface OCAgentCreateParams {
  name: string
  workspace?: string
  model?: string
}

export interface OCAgentCreateResult {
  agentId: string
  name: string
  workspace: string
  model?: string
}

/** `agents.update` params; `model: null` clears the agent's own model. */
export interface OCAgentUpdateParams {
  agentId: string
  name?: string
  workspace?: string
  model?: string | null
}

export interface OCGatewayConfig {
  agents?: {
    defaults?: {
      model?: string | { primary?: string; fallbacks?: string[] }
      workspace?: string
    }
    /** Current schema: entries keyed by agent id. */
    entries?: Record<string, OCAgentEntry>
    /** Legacy schema (≤ 2026.5). */
    list?: OCAgentEntry[]
  }
  [key: string]: unknown
}

// === Health ===

export interface OCHealthStatus {
  ok: boolean
  uptime?: number
  agents?: number
  stateVersion?: number
}

// === Connection ===

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
