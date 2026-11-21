// OpenClawAdapter — implements AgentRuntimeAdapter for the OpenClaw gateway.
// Wraps the underlying OpenClawClient and maps every wire-format payload to
// the canonical runtime types declared by @taia/runtime.

import type { AgentContextBundle, AgentRuntimeSettingsUpdate, RuntimeDefaults } from '@taia/types'

import type { AgentRuntimeAdapter } from '../../adapter'
import { CapabilitySet, RuntimeCapability } from '../../capabilities'
import { HEARTBEAT_OK } from '../../context-markdown'
import type {
  AgentContextProjection,
  ContextSyncOutcome,
  ContextSyncRequest,
} from '../../context-sync'
import type {
  AwaitSessionMatcher,
  AwaitSessionOptions,
  ChannelMessage,
  CronAction,
  ListSessionsOptions,
  ProvisionOutcome,
  RuntimeAgent,
  RuntimeAgentSpec,
  RuntimeConnectionState,
  RuntimeCronJob,
  RuntimeEventHandler,
  RuntimeConnectionFailure,
  RuntimeConnectionTest,
  RuntimeEventName,
  RuntimeHealth,
  RuntimeMessage,
  RuntimeProviderDefaults,
  RuntimeSession,
  RuntimeSettingsSnapshot,
  NativeConfigDocument,
  SendResult,
  SessionHistoryOptions,
  SpawnOptions,
  SpawnResult,
} from '../../types'
import {
  type GatewayConfigResult,
  OpenClawClient,
  OpenClawConfigConflictError,
  OpenClawFileConflictError,
  OpenClawGatewayError,
  OpenClawPairingRequiredError,
} from './client'
import { OpenClawContextRenderer } from './context-renderer'
import type { OpenClawCredentialStore } from './types'
import {
  type GatewayConfigPatch,
  findAgentEntry,
  toAgentSettingsPatch,
  toDefaultsPatch,
  toRuntimeAgent,
  toRuntimeCronJob,
  toRuntimeHealth,
  toRuntimeMessage,
  toRuntimeSession,
  toRuntimeSettingsSnapshot,
  toRuntimeSpawnResult,
} from './mappers'

export interface OpenClawAdapterOptions {
  url: string
  token?: string
  /** Persists the paired device identity; without it pairing repeats on restart. */
  credentialStore?: OpenClawCredentialStore
  reconnect?: boolean
  rpcTimeoutMs?: number
  /** Public URL of TAIA; agents use it to reach the board over HTTP. */
  taiaBaseUrl?: string
  /**
   * How agents get their context: `push` (default) writes the rendered files
   * to the agent workspace; `pull` has the agent fetch them from TAIA.
   */
  contextSync?: 'push' | 'pull'
}

const OPENCLAW_CAPABILITIES = [
  RuntimeCapability.Sessions,
  RuntimeCapability.Transcripts,
  RuntimeCapability.Cron,
  RuntimeCapability.Approvals,
  RuntimeCapability.LiveEvents,
  RuntimeCapability.Health,
  RuntimeCapability.Messaging,
  RuntimeCapability.ContextSync,
  RuntimeCapability.RuntimeSettingsRead,
  RuntimeCapability.AgentProvisioning,
  RuntimeCapability.NativeConfig,
] as const

function classifyGatewayError(err: unknown): RuntimeConnectionFailure {
  if (err instanceof OpenClawPairingRequiredError) return 'pairing_required'
  const code = err instanceof OpenClawGatewayError ? err.code : undefined
  const message = err instanceof Error ? err.message : String(err)
  if (code && /^(AUTH_|DEVICE_AUTH_)/.test(code)) return 'unauthorized'
  if (/unauthorized|token mismatch|invalid token/i.test(message)) return 'unauthorized'
  if (
    /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|timeout|socket hang up|closed/i.test(message)
  ) {
    return 'unreachable'
  }
  return 'unknown'
}

export class OpenClawAdapter implements AgentRuntimeAdapter {
  readonly id = 'openclaw'
  readonly capabilities = new CapabilitySet(OPENCLAW_CAPABILITIES)

  private readonly renderer: OpenClawContextRenderer

  constructor(
    private readonly client: OpenClawClient,
    private readonly options: Pick<OpenClawAdapterOptions, 'taiaBaseUrl' | 'contextSync'> = {},
  ) {
    this.renderer = new OpenClawContextRenderer({ taiaBaseUrl: options.taiaBaseUrl })
  }

  // --- Lifecycle ---

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.connect()
      return this.client.getState() === 'connected'
    } catch {
      return false
    }
  }

  getConnectionState(): RuntimeConnectionState {
    return this.client.getState()
  }

  onConnectionStateChange(handler: (state: RuntimeConnectionState) => void): () => void {
    return this.client.onStateChange(handler)
  }

  disconnect(): void {
    this.client.disconnect()
  }

  // --- Required ---

  async listAgents(): Promise<RuntimeAgent[]> {
    const agents = await this.client.listAgents()
    return agents.map(toRuntimeAgent)
  }

  async testConnection(): Promise<RuntimeConnectionTest> {
    try {
      await this.client.connect()
      const agents = await this.client.listAgents()
      const info = this.client.getConnectionInfo()
      return { ok: true, agents: agents.length, details: { ...info } }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const details =
        err instanceof OpenClawPairingRequiredError
          ? { requestId: err.requestId, deviceId: err.deviceId }
          : undefined
      return {
        ok: false,
        error: message,
        reason: classifyGatewayError(err),
        ...(details ? { details } : {}),
      }
    }
  }

  // --- Messaging ---

  sendChannelMessage(message: ChannelMessage): Promise<void> {
    return this.client.sendChannelMessage(message.channel, message.target, message.text)
  }

  async getHealth(): Promise<RuntimeHealth> {
    try {
      return toRuntimeHealth(await this.client.getHealth())
    } catch {
      return { ok: false }
    }
  }

  // --- Provider metadata ---

  getProviderDefaults(): RuntimeProviderDefaults {
    return {
      workspaceRoot: '/home/node/.openclaw/workspace',
      configFilename: 'openclaw.json',
    }
  }

  // --- Sessions ---

  async spawnSession(task: string, options?: SpawnOptions): Promise<SpawnResult> {
    const message = options?.context ? this.kickoffMessage(options.context, options, task) : task
    const result = await this.client.spawnSession(message, options)
    return toRuntimeSpawnResult(result)
  }

  // --- Context sync ---

  projectAgentContext(bundle: AgentContextBundle): AgentContextProjection {
    return this.renderer.project(bundle)
  }

  /**
   * Write the rendered files to the agent workspace (`push`), or report
   * that the agent fetches them itself (`pull`).
   *
   * Each write carries the hash last read as a precondition. A file whose
   * remote hash differs from the one TAIA last wrote was edited in the
   * workspace: it is reported as a conflict and left alone unless `force`.
   */
  async syncAgentContext(request: ContextSyncRequest): Promise<ContextSyncOutcome> {
    const projection = this.renderer.project(request.bundle)
    if (this.options.contextSync === 'pull') {
      return {
        status: 'pull_only',
        state: { mode: 'pull', fingerprint: projection.fingerprint, remoteHashes: {} },
      }
    }

    const previous = request.previous?.mode === 'push' ? request.previous : null
    if (previous && previous.fingerprint === projection.fingerprint && !request.force) {
      return { status: 'unchanged', state: previous }
    }

    const agentId = request.agentId
    const remoteHashes: Record<string, string> = {}
    const conflicts: Array<{ path: string; remoteHash: string }> = []
    const changedPaths: string[] = []

    for (const file of projection.files) {
      const remote = await this.client.getAgentFile(agentId, file.path)
      const remoteHash = remote.missing ? undefined : remote.hash
      if (remoteHash === file.sha256) {
        remoteHashes[file.path] = file.sha256
        continue
      }
      const lastWritten = previous?.remoteHashes[file.path]
      if (remoteHash && lastWritten && remoteHash !== lastWritten && !request.force) {
        conflicts.push({ path: file.path, remoteHash })
        remoteHashes[file.path] = lastWritten
        continue
      }
      try {
        const written = await this.client.setAgentFile(
          agentId,
          file.path,
          file.content,
          remoteHash ? { expectedHash: remoteHash } : { expectedMissing: true },
        )
        remoteHashes[file.path] = written.hash ?? file.sha256
        changedPaths.push(file.path)
      } catch (err) {
        if (!(err instanceof OpenClawFileConflictError)) throw err
        // Edited between our read and write.
        conflicts.push({ path: file.path, remoteHash: err.currentHash ?? remoteHash ?? '' })
        if (lastWritten) remoteHashes[file.path] = lastWritten
      }
    }

    if (conflicts.length > 0) {
      return {
        status: 'conflict',
        // Keep the old fingerprint so the next sync retries the whole set.
        state: { mode: 'push', fingerprint: previous?.fingerprint ?? '', remoteHashes },
        conflicts,
      }
    }
    const state = { mode: 'push' as const, fingerprint: projection.fingerprint, remoteHashes }
    return changedPaths.length > 0
      ? { status: 'pushed', state, changedPaths }
      : { status: 'unchanged', state }
  }

  /**
   * The session's first message. In `pull` mode the workspace files are not
   * TAIA's, so the agent is told where to read its context from.
   */
  private kickoffMessage(bundle: AgentContextBundle, options: SpawnOptions, task: string): string {
    const kickoff = this.renderer.kickoff(bundle, options.trigger, task)
    const pointer = this.contextPointer(bundle.agent.id)
    return pointer ? `${pointer}\n\n${kickoff}` : kickoff
  }

  private contextPointer(agentId: string): string | null {
    if (this.options.contextSync !== 'pull') return null
    const base = this.options.taiaBaseUrl?.replace(/\/+$/, '')
    if (!base) return null
    return (
      `Your identity, instructions and the TAIA API are at ` +
      `GET ${base}/api/agents/${agentId}/files — read them before you start.`
    )
  }

  /** Message for scheduled heartbeat runs, which start without a bundle. */
  private heartbeatMessage(agentId: string | undefined): string | undefined {
    const pointer = agentId ? this.contextPointer(agentId) : null
    if (!pointer) return undefined
    return (
      `Heartbeat from TAIA. ${pointer} Then check your assigned tasks and continue your work. ` +
      `If there is nothing to do, reply ${HEARTBEAT_OK}.`
    )
  }

  async sendToSession(
    sessionKey: string,
    message: string,
    timeoutSeconds?: number,
  ): Promise<SendResult> {
    const result = await this.client.sendToSession(sessionKey, message, timeoutSeconds)
    return { status: 'accepted', runId: result.runId }
  }

  async listSessions(options?: ListSessionsOptions): Promise<RuntimeSession[]> {
    const sessions = await this.client.listSessions(options)
    return sessions.map(toRuntimeSession)
  }

  async awaitSessionComplete(
    matcher: AwaitSessionMatcher,
    options: AwaitSessionOptions,
  ): Promise<void> {
    return this.client.awaitSessionComplete(matcher, options)
  }

  // --- Transcripts ---

  async getSessionHistory(
    sessionKey: string,
    options?: SessionHistoryOptions,
  ): Promise<RuntimeMessage[]> {
    const messages = await this.client.getSessionHistory(sessionKey, options)
    return messages.map(toRuntimeMessage)
  }

  // --- Cron ---

  async listCrons(includeDisabled?: boolean): Promise<RuntimeCronJob[]> {
    const jobs = await this.client.listCrons(includeDisabled)
    return jobs.map(toRuntimeCronJob)
  }

  async cronAction(action: CronAction, params?: Record<string, unknown>): Promise<unknown> {
    if (action === 'add' && params && !('message' in params)) {
      const message = this.heartbeatMessage(params.agentId as string | undefined)
      if (message) return this.client.cronAction(action, { ...params, message })
    }
    return this.client.cronAction(action, params)
  }

  // --- Runtime settings ---

  async getRuntimeSettings(): Promise<RuntimeSettingsSnapshot> {
    return toRuntimeSettingsSnapshot(await this.client.getGatewayConfig())
  }

  // --- Agent provisioning ---

  /**
   * `agents.create` seeds the workspace and its bootstrap files; the gateway
   * derives the agent id from the name, so the agent is created under its
   * id and renamed afterwards. Fallbacks and denied tools have no
   * `agents.create` parameter and go through a config patch.
   */
  async provisionAgent(spec: RuntimeAgentSpec): Promise<ProvisionOutcome> {
    try {
      const existing = (await this.getRuntimeSettings()).agents[spec.id]
      if (existing) return { status: 'exists', effective: existing }

      const { model, workspace, deniedTools } = spec.settings
      const created = await this.client.createAgent({
        name: spec.id,
        ...(workspace ? { workspace } : {}),
        ...(model ? { model: model.primary } : {}),
      })
      if (!created) {
        const effective = (await this.getRuntimeSettings()).agents[spec.id]
        return { status: 'exists', ...(effective ? { effective } : {}) }
      }
      if (created.agentId !== spec.id) {
        await this.client.deleteAgent(created.agentId, true)
        return this.provisionFailure(
          spec,
          `OpenClaw derived the id "${created.agentId}" instead of "${spec.id}"`,
        )
      }
      if (spec.name !== spec.id) {
        await this.client.updateAgent({ agentId: spec.id, name: spec.name })
      }

      const rest: AgentRuntimeSettingsUpdate = {
        ...(model?.fallbacks.length ? { model } : {}),
        ...(deniedTools?.length ? { deniedTools } : {}),
      }
      if (Object.keys(rest).length === 0) {
        const effective = (await this.getRuntimeSettings()).agents[spec.id]
        return { status: 'created', ...(effective ? { effective } : {}) }
      }
      const outcome = await this.updateAgentSettings(spec.id, rest)
      return outcome.status === 'failed' ? outcome : { ...outcome, status: 'created' }
    } catch (err) {
      return this.provisionFailure(spec, err instanceof Error ? err.message : String(err))
    }
  }

  async updateAgentSettings(
    agentId: string,
    update: AgentRuntimeSettingsUpdate,
  ): Promise<ProvisionOutcome> {
    try {
      const result = await this.patchGatewayConfig(({ config }) => {
        const entry = findAgentEntry(config, agentId)
        if (!entry) throw new Error(`Agent "${agentId}" does not exist in OpenClaw`)
        return toAgentSettingsPatch(agentId, update, entry)
      })
      const effective = toRuntimeSettingsSnapshot(result).agents[agentId]
      return { status: 'updated', ...(effective ? { effective } : {}) }
    } catch (err) {
      return { status: 'failed', error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Keeps the workspace and sessions on disk, so the agent can be restored. */
  async deprovisionAgent(agentId: string): Promise<void> {
    await this.client.deleteAgent(agentId, false)
  }

  async setRuntimeDefaults(
    defaults: RuntimeDefaults,
    options: { expectedRevision?: string } = {},
  ): Promise<void> {
    const change = toDefaultsPatch(defaults)
    if (options.expectedRevision) {
      if (Object.keys(change.patch).length === 0) return
      await this.client.configPatch(change.patch, options.expectedRevision, change.replacePaths)
      return
    }
    await this.patchGatewayConfig(() => change)
  }

  /**
   * Read-modify-write on the gateway config, guarded by its hash. When
   * another writer got in between, re-read once and retry.
   */
  private async patchGatewayConfig(
    build: (current: GatewayConfigResult) => GatewayConfigPatch,
  ): Promise<GatewayConfigResult> {
    for (let attempt = 0; ; attempt++) {
      const current = await this.client.getGatewayConfig()
      const change = build(current)
      if (Object.keys(change.patch).length === 0) return current
      try {
        return await this.client.configPatch(change.patch, current.hash, change.replacePaths)
      } catch (err) {
        if (err instanceof OpenClawConfigConflictError && attempt === 0) continue
        throw err
      }
    }
  }

  private provisionFailure(spec: RuntimeAgentSpec, error: string): ProvisionOutcome {
    const model = spec.settings.model ? ` --model ${spec.settings.model.primary}` : ''
    return {
      status: 'failed',
      error,
      manualHint: `On the OpenClaw host run: openclaw agents add ${spec.id}${model}`,
    }
  }

  // --- Native config (openclaw.json as the gateway serves it) ---

  async getNativeConfig(): Promise<NativeConfigDocument> {
    const { config, hash } = await this.client.getGatewayConfig()
    return { document: config, ...(hash ? { revision: hash } : {}) }
  }

  /** Merge-patch the gateway config, as-is; `expectedRevision` is the config hash. */
  async patchNativeConfig(
    patch: Record<string, unknown>,
    expectedRevision?: string,
  ): Promise<unknown> {
    return this.client.configPatch(patch, expectedRevision)
  }

  // --- Live events ---

  on(event: RuntimeEventName, handler: RuntimeEventHandler): () => void {
    return this.client.on(event, handler)
  }
}

export function createOpenClawAdapter(options: OpenClawAdapterOptions): OpenClawAdapter {
  const client = new OpenClawClient(options)
  return new OpenClawAdapter(client, {
    taiaBaseUrl: options.taiaBaseUrl,
    contextSync: options.contextSync,
  })
}
