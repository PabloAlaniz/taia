// OpenClaw Client — gateway protocol v4 over the official
// @openclaw/gateway-client (challenge handshake, device identity, reconnect,
// tick watchdog). Pure transport layer: knows nothing about TAIA's database;
// device credentials are persisted through an injected OpenClawCredentialStore.

import crypto from 'node:crypto'
import { GatewayClient, type GatewayClientOptions } from '@openclaw/gateway-client'
import type {
  ConnectionState,
  CronAction,
  ListSessionsOptions,
  OCAgent,
  OCAgentCreateParams,
  OCAgentCreateResult,
  OCAgentFile,
  OCAgentFilePrecondition,
  OCAgentUpdateParams,
  OCAgentWaitResult,
  OCChatMessage,
  OCChatSendResult,
  OCCronJob,
  OCGatewayConfig,
  OCHealthStatus,
  OCSession,
  OCSessionCreateResult,
  OpenClawCredentialStore,
  OpenClawDeviceIdentity,
  OpenClawDeviceToken,
  SessionHistoryOptions,
  SpawnOptions,
} from './types'

export interface GatewayConfigResult {
  config: OCGatewayConfig
  hash?: string
}

export interface OpenClawClientOptions {
  url: string
  token?: string
  /** Persists the device identity and issued device token across restarts. */
  credentialStore?: OpenClawCredentialStore
  reconnect?: boolean
  rpcTimeoutMs?: number
  /** Test seam: build the underlying gateway client. */
  createGatewayClient?: (options: GatewayClientOptions) => GatewayTransport
}

/** The subset of GatewayClient this client uses. */
export interface GatewayTransport {
  start(): void
  stop(): void
  request<T = Record<string, unknown>>(
    method: string,
    params?: unknown,
    opts?: { timeoutMs?: number | null },
  ): Promise<T>
}

type EventHandler = (payload: unknown) => void

/** Gateway refused the device until an operator approves the pairing request. */
export class OpenClawPairingRequiredError extends Error {
  readonly code = 'PAIRING_REQUIRED'
  constructor(
    message: string,
    readonly requestId?: string,
    readonly deviceId?: string,
  ) {
    super(message)
    this.name = 'OpenClawPairingRequiredError'
  }
}

/** Error returned by the gateway for an RPC or the connect handshake. */
export class OpenClawGatewayError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'OpenClawGatewayError'
  }
}

/** `agents.files.set` refused: the file changed since it was read. */
export class OpenClawFileConflictError extends OpenClawGatewayError {
  constructor(
    readonly fileName: string,
    readonly currentHash?: string,
  ) {
    super(`${fileName} changed in the agent workspace`, 'AGENT_FILE_CONFLICT', {
      type: 'agent_file_conflict',
      ...(currentHash ? { currentHash } : {}),
    })
    this.name = 'OpenClawFileConflictError'
  }
}

/** `config.patch` refused: the config changed since `baseHash` was read. */
export class OpenClawConfigConflictError extends OpenClawGatewayError {
  constructor(message: string) {
    super(message, 'CONFIG_CONFLICT')
    this.name = 'OpenClawConfigConflictError'
  }
}

// The gateway reports these as INVALID_REQUEST with no structured detail,
// so the message is the only signal.
const CONFIG_CONFLICT_MESSAGE = /config changed since last load/i
const AGENT_EXISTS_MESSAGE = /already exists/i
const AGENT_NOT_FOUND_MESSAGE = /not found/i

const AGENT_CREATE_TIMEOUT_MS = 60_000

const PROTOCOL_VERSION = 4
const OPERATOR_ROLE = 'operator'
const OPERATOR_SCOPES = ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals']
const DEFAULT_HEARTBEAT_PROMPT =
  'Heartbeat from TAIA: review your assigned tasks and continue your work.'
const TERMINAL_CHAT_STATES = new Set(['final', 'aborted', 'error'])

const CRON_METHODS: Record<CronAction, string> = {
  status: 'cron.status',
  list: 'cron.list',
  add: 'cron.add',
  update: 'cron.update',
  remove: 'cron.remove',
  run: 'cron.run',
  runs: 'cron.runs',
  wake: 'wake',
}

// === Device identity (Ed25519; deviceId = sha256 of the raw public key) ===

function rawPublicKey(publicKeyPem: string): Buffer {
  return crypto.createPublicKey(publicKeyPem).export({ format: 'der', type: 'spki' }).subarray(-32)
}

export function generateDeviceIdentity(): OpenClawDeviceIdentity {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString()
  return {
    deviceId: crypto.createHash('sha256').update(rawPublicKey(publicKeyPem)).digest('hex'),
    publicKeyPem,
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  }
}

function signDevicePayload(privateKeyPem: string, payload: string): string {
  return crypto
    .sign(null, Buffer.from(payload), crypto.createPrivateKey(privateKeyPem))
    .toString('base64url')
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
}

function toGatewayError(err: unknown): Error {
  if (err instanceof OpenClawGatewayError || err instanceof OpenClawPairingRequiredError) return err
  const e = err as { message?: string; code?: string; gatewayCode?: string; details?: unknown }
  const details = asRecord(e?.details)
  const code = (details?.code as string | undefined) ?? e?.gatewayCode ?? e?.code
  const message = e?.message ?? String(err)
  if (code === 'PAIRING_REQUIRED') {
    return new OpenClawPairingRequiredError(
      message,
      details?.requestId as string | undefined,
      details?.deviceId as string | undefined,
    )
  }
  return new OpenClawGatewayError(message, code, details)
}

// === Client ===

export class OpenClawClient {
  private readonly url: string
  private readonly token: string
  private readonly store?: OpenClawCredentialStore
  private readonly reconnect: boolean
  private readonly rpcTimeoutMs: number
  private readonly createGatewayClient: (options: GatewayClientOptions) => GatewayTransport

  private gateway: GatewayTransport | null = null
  private connecting: Promise<void> | null = null
  private state: ConnectionState = 'disconnected'
  private identity: OpenClawDeviceIdentity | null = null
  private hello: Record<string, unknown> | null = null
  private listeners = new Map<string, Set<EventHandler>>()
  private stateListeners = new Set<(state: ConnectionState) => void>()

  constructor(options: OpenClawClientOptions) {
    this.url = options.url.replace(/^http/, 'ws')
    this.token = options.token || ''
    this.store = options.credentialStore
    this.reconnect = options.reconnect ?? true
    this.rpcTimeoutMs = options.rpcTimeoutMs ?? 30_000
    this.createGatewayClient =
      options.createGatewayClient ?? ((opts) => new GatewayClient(opts) as GatewayTransport)
  }

  // --- Connection lifecycle ---

  /**
   * Open the gateway connection (idempotent). Resolves after `hello-ok`;
   * rejects with OpenClawPairingRequiredError when the device still has to be
   * approved, or OpenClawGatewayError for any other connect failure.
   */
  connect(): Promise<void> {
    if (this.state === 'connected') return Promise.resolve()
    if (!this.connecting) {
      this.connecting = this.openConnection().finally(() => {
        this.connecting = null
      })
    }
    return this.connecting
  }

  private async loadIdentity(): Promise<OpenClawDeviceIdentity> {
    if (this.identity) return this.identity
    let identity = (await this.store?.loadIdentity()) ?? null
    if (!identity) {
      identity = generateDeviceIdentity()
      await this.store?.saveIdentity(identity)
    }
    this.identity = identity
    return identity
  }

  private async openConnection(): Promise<void> {
    const identity = await this.loadIdentity()
    const store = this.store
    let cachedToken: OpenClawDeviceToken | null =
      (await store?.loadDeviceToken(OPERATOR_ROLE)) ?? null
    this.setState('connecting')

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const gateway = this.createGatewayClient({
        url: this.url,
        token: this.token || undefined,
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        clientName: 'gateway-client',
        clientDisplayName: 'TAIA',
        clientVersion: '1.0.0',
        mode: 'backend',
        role: OPERATOR_ROLE,
        scopes: OPERATOR_SCOPES,
        requestTimeoutMs: this.rpcTimeoutMs,
        deviceIdentity: identity,
        hostDeps: {
          signDevicePayload,
          publicKeyRawBase64UrlFromPem: (pem) => rawPublicKey(pem).toString('base64url'),
          loadDeviceAuthToken: () => cachedToken,
          storeDeviceAuthToken: async ({ token, scopes }) => {
            cachedToken = { token, scopes }
            await store?.saveDeviceToken(OPERATOR_ROLE, cachedToken)
          },
          clearDeviceAuthToken: async () => {
            cachedToken = null
            await store?.clearDeviceToken(OPERATOR_ROLE)
          },
        },
        onHelloOk: (hello) => {
          this.hello = hello as unknown as Record<string, unknown>
          this.setState('connected')
          if (!settled) {
            settled = true
            resolve()
          }
        },
        onConnectError: (err) => {
          const error = toGatewayError(err)
          if (!settled) {
            settled = true
            // Pairing and auth failures don't heal by retrying; stop until the
            // next connect() so we don't flood the gateway with requests.
            this.teardown()
            reject(error)
          }
        },
        onClose: () => {
          if (this.state === 'connected') {
            this.setState(this.reconnect ? 'reconnecting' : 'disconnected')
          }
          if (!this.reconnect) this.teardown()
        },
        onEvent: (frame) => this.dispatch(frame.event, frame.payload),
      })
      this.gateway = gateway
      gateway.start()
    })
  }

  private teardown(): void {
    const gateway = this.gateway
    this.gateway = null
    this.hello = null
    gateway?.stop()
    this.setState('disconnected')
  }

  disconnect(): void {
    this.teardown()
  }

  getState(): ConnectionState {
    return this.state
  }

  onStateChange(handler: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(handler)
    return () => this.stateListeners.delete(handler)
  }

  on(event: string, handler: EventHandler): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler)
    return () => set?.delete(handler)
  }

  private dispatch(event: string, payload: unknown): void {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(payload)
      } catch (err) {
        console.warn(`[openclaw-client] ${event} handler failed:`, (err as Error).message)
      }
    })
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return
    this.state = state
    this.stateListeners.forEach((handler) => handler(state))
  }

  private async rpc<T>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs?: number,
  ): Promise<T> {
    await this.connect()
    const gateway = this.gateway
    if (!gateway) throw new OpenClawGatewayError('OpenClaw gateway not connected', 'NOT_CONNECTED')
    try {
      return await (timeoutMs
        ? gateway.request<T>(method, params, { timeoutMs })
        : gateway.request<T>(method, params))
    } catch (err) {
      throw toGatewayError(err)
    }
  }

  // --- Agents ---

  async listAgents(): Promise<OCAgent[]> {
    const result = await this.rpc<{ agents?: OCAgent[] }>('agents.list')
    return result?.agents ?? []
  }

  /**
   * Create an agent with its workspace and bootstrap files. Resolves to
   * `null` when an agent with the derived id already exists.
   */
  async createAgent(params: OCAgentCreateParams): Promise<OCAgentCreateResult | null> {
    try {
      // Seeding the workspace (bootstrap files, git init) outlasts a normal RPC.
      const timeoutMs = Math.max(this.rpcTimeoutMs, AGENT_CREATE_TIMEOUT_MS)
      return await this.rpc<OCAgentCreateResult>('agents.create', { ...params }, timeoutMs)
    } catch (err) {
      if (err instanceof OpenClawGatewayError && AGENT_EXISTS_MESSAGE.test(err.message)) return null
      throw err
    }
  }

  async updateAgent(params: OCAgentUpdateParams): Promise<void> {
    await this.rpc('agents.update', { ...params })
  }

  /**
   * Remove an agent from the gateway config. With `deleteFiles` its
   * workspace and sessions go to the trash. Resolves to `false` when the
   * agent does not exist.
   */
  async deleteAgent(agentId: string, deleteFiles = false): Promise<boolean> {
    try {
      await this.rpc('agents.delete', { agentId, deleteFiles })
      return true
    } catch (err) {
      if (err instanceof OpenClawGatewayError && AGENT_NOT_FOUND_MESSAGE.test(err.message)) {
        return false
      }
      throw err
    }
  }

  /** Read one bootstrap file of an agent workspace. */
  async getAgentFile(agentId: string, name: string): Promise<OCAgentFile> {
    const result = await this.rpc<{ file: OCAgentFile }>('agents.files.get', { agentId, name })
    return result.file
  }

  /**
   * Write one bootstrap file. With a precondition the gateway refuses the
   * write when the file changed since it was read; that surfaces as
   * {@link OpenClawFileConflictError}.
   */
  async setAgentFile(
    agentId: string,
    name: string,
    content: string,
    precondition?: OCAgentFilePrecondition,
  ): Promise<OCAgentFile> {
    try {
      const result = await this.rpc<{ file: OCAgentFile }>('agents.files.set', {
        agentId,
        name,
        content,
        ...precondition,
      })
      return result.file
    } catch (err) {
      if (err instanceof OpenClawGatewayError && err.details?.type === 'agent_file_conflict') {
        const current = err.details.currentHash
        throw new OpenClawFileConflictError(name, typeof current === 'string' ? current : undefined)
      }
      throw err
    }
  }

  // --- Sessions ---

  async listSessions(options: ListSessionsOptions = {}): Promise<OCSession[]> {
    const params: Record<string, unknown> = {}
    if (options.limit) params.limit = options.limit
    if (options.activeMinutes) params.activeMinutes = options.activeMinutes
    if (options.agentId) params.agentId = options.agentId
    const result = await this.rpc<{ sessions?: OCSession[] }>('sessions.list', params)
    const sessions = result?.sessions ?? []
    return options.kinds?.length
      ? sessions.filter((s) => options.kinds?.includes(s.kind))
      : sessions
  }

  async getSessionHistory(
    sessionKey: string,
    options: SessionHistoryOptions = {},
  ): Promise<OCChatMessage[]> {
    const params: Record<string, unknown> = { sessionKey }
    if (options.limit) params.limit = options.limit
    const result = await this.rpc<{ messages?: OCChatMessage[] }>('chat.history', params)
    const messages = result?.messages ?? []
    return options.includeTools === false
      ? messages.filter((m) => m.role === 'user' || m.role === 'assistant')
      : messages
  }

  /** Create a session and start its first turn with `task`. */
  async spawnSession(task: string, options: SpawnOptions = {}): Promise<OCSessionCreateResult> {
    const params: Record<string, unknown> = { message: task, idempotencyKey: crypto.randomUUID() }
    if (options.agentId) params.agentId = options.agentId
    if (options.label) params.label = options.label
    if (options.model) params.model = options.model
    if (options.runTimeoutSeconds) params.timeoutMs = options.runTimeoutSeconds * 1000
    const result = await this.rpc<OCSessionCreateResult>('sessions.create', params)
    if (result.runStarted === false) {
      throw new OpenClawGatewayError(
        `OpenClaw created session ${result.key} but could not start it: ${result.runError ?? 'unknown error'}`,
        'RUN_NOT_STARTED',
      )
    }
    return result
  }

  async sendToSession(
    sessionKey: string,
    message: string,
    timeoutSeconds?: number,
  ): Promise<OCChatSendResult> {
    const params: Record<string, unknown> = {
      sessionKey,
      message,
      idempotencyKey: crypto.randomUUID(),
    }
    if (timeoutSeconds) params.timeoutMs = timeoutSeconds * 1000
    return this.rpc<OCChatSendResult>('chat.send', params)
  }

  /**
   * Wait for a run (by `runId`, via `agent.wait`) or a session's current turn
   * (by `sessionKey`, via terminal `chat` events) to finish. Rejects on
   * timeout or when the run ends in error.
   */
  async awaitSessionComplete(
    matcher: { runId?: string; sessionKey?: string },
    options: { timeoutMs: number },
  ): Promise<void> {
    if (matcher.runId) return this.waitForRun(matcher.runId, options.timeoutMs)
    if (matcher.sessionKey) return this.waitForSessionTurn(matcher.sessionKey, options.timeoutMs)
    throw new Error('awaitSessionComplete requires runId or sessionKey')
  }

  private async waitForRun(runId: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error('awaitSessionComplete: timeout')
      const result = await this.rpc<OCAgentWaitResult>('agent.wait', {
        runId,
        timeoutMs: Math.min(remaining, 60_000),
      })
      if (result.status === 'timeout') continue
      if (result.status === 'error' || result.status === 'aborted') {
        throw new Error(`OpenClaw run ${result.status}${result.error ? `: ${result.error}` : ''}`)
      }
      return
    }
  }

  private waitForSessionTurn(sessionKey: string, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const unsubscribe = this.on('chat', (payload) => {
        const p = asRecord(payload)
        if (p?.sessionKey !== sessionKey || !TERMINAL_CHAT_STATES.has(String(p.state))) return
        clearTimeout(timer)
        unsubscribe()
        if (p.state === 'final') resolve()
        else reject(new Error(`OpenClaw turn ${String(p.state)}`))
      })
      const timer = setTimeout(() => {
        unsubscribe()
        reject(new Error('awaitSessionComplete: timeout'))
      }, timeoutMs)
    })
  }

  // --- Cron ---

  async listCrons(includeDisabled = true): Promise<OCCronJob[]> {
    const result = await this.rpc<{ jobs?: OCCronJob[] }>('cron.list', { includeDisabled })
    return result?.jobs ?? []
  }

  /**
   * Run a cron action. `add` and `update` accept TAIA's simplified shape
   * (`{ agentId, schedule, enabled?, payload?: { timeoutSeconds } }` /
   * `{ id, enabled?, schedule?, payload? }`) and are translated to the
   * gateway's job schema.
   */
  async cronAction(action: CronAction, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.rpc(CRON_METHODS[action], toCronParams(action, params))
  }

  // --- Config ---

  async getGatewayConfig(): Promise<GatewayConfigResult> {
    const result = await this.rpc<{ config?: OCGatewayConfig; hash?: string }>('config.get')
    return { config: result?.config ?? {}, hash: result?.hash }
  }

  /**
   * Merge-patch the gateway config. Arrays the patch shortens or removes must
   * be listed in `replacePaths`. A stale `baseHash` rejects with
   * {@link OpenClawConfigConflictError}.
   */
  async configPatch(
    patch: Record<string, unknown>,
    baseHash?: string,
    replacePaths?: string[],
  ): Promise<GatewayConfigResult> {
    const params: Record<string, unknown> = { raw: JSON.stringify(patch) }
    if (baseHash) params.baseHash = baseHash
    if (replacePaths?.length) params.replacePaths = replacePaths
    try {
      const result = await this.rpc<{ config?: OCGatewayConfig; hash?: string }>(
        'config.patch',
        params,
      )
      return { config: result?.config ?? {}, hash: result?.hash }
    } catch (err) {
      if (err instanceof OpenClawGatewayError && CONFIG_CONFLICT_MESSAGE.test(err.message)) {
        throw new OpenClawConfigConflictError(err.message)
      }
      throw err
    }
  }

  // --- Health / messaging ---

  async getHealth(): Promise<OCHealthStatus> {
    const health = await this.rpc<{ ok?: boolean; agents?: unknown[] }>('health')
    const snapshot = asRecord(this.hello?.snapshot)
    return {
      ok: health?.ok ?? true,
      agents: Array.isArray(health?.agents) ? health.agents.length : undefined,
      uptime: typeof snapshot?.uptimeMs === 'number' ? snapshot.uptimeMs : undefined,
      stateVersion: typeof snapshot?.stateVersion === 'number' ? snapshot.stateVersion : undefined,
    }
  }

  /** Facts from the last `hello-ok` (protocol version, granted scopes). */
  getConnectionInfo(): { protocol?: number; scopes?: string[]; deviceId?: string } {
    const auth = asRecord(this.hello?.auth)
    return {
      protocol: typeof this.hello?.protocol === 'number' ? this.hello.protocol : undefined,
      scopes: Array.isArray(auth?.scopes) ? (auth.scopes as string[]) : undefined,
      deviceId: this.identity?.deviceId,
    }
  }

  /** Send a message through one of the gateway's channel integrations. */
  async sendChannelMessage(channel: string, target: string, message: string): Promise<void> {
    await this.rpc('send', { channel, to: target, message, idempotencyKey: crypto.randomUUID() })
  }
}

function toCronParams(
  action: CronAction,
  params: Record<string, unknown>,
): Record<string, unknown> {
  if (action === 'add') {
    const { agentId, schedule, enabled, payload, name, message } = params as {
      agentId?: string
      schedule?: unknown
      enabled?: boolean
      payload?: { timeoutSeconds?: number }
      name?: string
      message?: string
    }
    return {
      name: name ?? `taia-heartbeat-${agentId ?? 'agent'}`,
      ...(agentId ? { agentId } : {}),
      schedule,
      enabled: enabled ?? true,
      // Each run gets a fresh session, like TAIA's own heartbeat spawns
      // (jobs on the `main` session only accept system events).
      sessionTarget: 'isolated',
      wakeMode: 'now',
      payload: {
        kind: 'agentTurn',
        message: message ?? DEFAULT_HEARTBEAT_PROMPT,
        ...(payload?.timeoutSeconds ? { timeoutSeconds: payload.timeoutSeconds } : {}),
      },
    }
  }
  if (action === 'update' && !('patch' in params)) {
    const { id, enabled, schedule, payload } = params as {
      id?: string
      enabled?: boolean
      schedule?: unknown
      payload?: { timeoutSeconds?: number }
    }
    const patch: Record<string, unknown> = {}
    if (typeof enabled === 'boolean') patch.enabled = enabled
    if (schedule) patch.schedule = schedule
    // The gateway merges payload patches, so the job keeps its message
    // (and the context pointer it may carry).
    if (payload?.timeoutSeconds) {
      patch.payload = { kind: 'agentTurn', timeoutSeconds: payload.timeoutSeconds }
    }
    return { id, patch }
  }
  return params
}
