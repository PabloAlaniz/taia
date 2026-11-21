// Claude Code runtime adapter — wraps the local `claude` CLI with the shared
// GenericCliProtocol process/session layer. This is intentionally a thin
// adapter: Claude Code owns execution; TAIA maps process lifecycle and
// transcripts to canonical RuntimeSession / RuntimeMessage shapes.

import type { AgentRuntimeAdapter } from '../../adapter'
import { CapabilitySet, RuntimeCapability } from '../../capabilities'
import { registerRuntimeFactory, type RuntimeProviderConfig } from '../../registry'
import type {
  AwaitSessionMatcher,
  AwaitSessionOptions,
  ListSessionsOptions,
  RuntimeAgent,
  RuntimeConnectionState,
  RuntimeHealth,
  RuntimeMessage,
  RuntimeProviderDefaults,
  RuntimeSession,
  SendResult,
  SessionHistoryOptions,
  SpawnOptions,
  SpawnResult,
} from '../../types'
import { renderCliPrompt } from '../cli/context-prompt'
import { GenericCliProtocol, type GenericCliSession } from '../cli'

export interface ClaudeCodeAdapterOptions {
  /** Public URL of TAIA, rendered into the prompt so the agent can reach the board. */
  taiaBaseUrl?: string
  /** CLI binary to execute. Defaults to `claude`. */
  command?: string
  /** Args used to verify local availability. Defaults to `--version`. */
  availabilityArgs?: string[]
  /** Args always prepended to spawned sessions. Defaults to `--print`. */
  defaultArgs?: string[]
  /** Optional working directory for CLI sessions. */
  cwd?: string
  /** Extra environment variables for CLI sessions. */
  env?: Record<string, string>
  /** Session id prefix used by GenericCliProtocol. */
  sessionIdPrefix?: string
  /**
   * How to pass the initial task to Claude Code. The real CLI supports prompt
   * as an argv argument with `--print`, which avoids stdin EOF coordination.
   */
  promptMode?: 'arg' | 'stdin'
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? value
    : undefined
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== 'string') return undefined
    out[key] = entry
  }
  return out
}

function sessionKey(sessionId: string): string {
  return `agent:claude-code:${sessionId}`
}

function sessionIdFromKey(key: string): string {
  return key.startsWith('agent:claude-code:') ? key.slice('agent:claude-code:'.length) : key
}

interface SessionMeta {
  label?: string
  agentId?: string
}

function toRuntimeSession(session: GenericCliSession, meta: SessionMeta = {}): RuntimeSession {
  return {
    key: sessionKey(session.id),
    kind: 'agent',
    sessionId: session.id,
    updatedAt: session.updatedAt,
    label: meta.label,
    agentId: meta.agentId,
  }
}

export class ClaudeCodeRuntimeAdapter implements AgentRuntimeAdapter {
  readonly id = 'claude-code'
  readonly capabilities = new CapabilitySet([
    RuntimeCapability.Sessions,
    RuntimeCapability.Transcripts,
    RuntimeCapability.Health,
  ])

  private readonly protocol: GenericCliProtocol
  private readonly command: string
  private readonly cwd?: string
  private readonly promptMode: 'arg' | 'stdin'
  private readonly sessionMeta = new Map<string, SessionMeta>()
  private state: RuntimeConnectionState = 'disconnected'
  private readonly stateHandlers = new Set<(state: RuntimeConnectionState) => void>()

  private readonly taiaBaseUrl?: string

  constructor(options: ClaudeCodeAdapterOptions = {}) {
    this.taiaBaseUrl = options.taiaBaseUrl
    this.command = options.command ?? 'claude'
    this.cwd = options.cwd
    this.promptMode = options.promptMode ?? 'arg'
    this.protocol = new GenericCliProtocol({
      command: this.command,
      defaultArgs: options.defaultArgs ?? ['--print'],
      defaultCwd: options.cwd,
      defaultEnv: options.env,
      availabilityArgs: options.availabilityArgs ?? ['--version'],
      sessionIdPrefix: options.sessionIdPrefix ?? 'claude-code',
    })
  }

  async isAvailable(): Promise<boolean> {
    this.setState('connecting')
    const available = await this.protocol.isAvailable()
    this.setState(available ? 'connected' : 'disconnected')
    return available
  }

  getConnectionState(): RuntimeConnectionState {
    return this.state
  }

  onConnectionStateChange(handler: (state: RuntimeConnectionState) => void): () => void {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }

  disconnect(): void {
    for (const session of this.protocol.listSessions()) {
      if (session.status === 'running') this.protocol.kill(session.id)
    }
    this.setState('disconnected')
  }

  async listAgents(): Promise<RuntimeAgent[]> {
    return [{ id: 'claude-code', name: 'Claude Code', configured: await this.isAvailable() }]
  }

  async getHealth(): Promise<RuntimeHealth> {
    const ok = await this.isAvailable().catch(() => false)
    return { ok, agents: ok ? 1 : 0 }
  }

  getProviderDefaults(): RuntimeProviderDefaults {
    return { workspaceRoot: this.cwd, command: this.command, configFilename: 'CLAUDE.md' }
  }

  async spawnSession(task: string, options?: SpawnOptions): Promise<SpawnResult> {
    const prompt = renderCliPrompt(task, options, this.taiaBaseUrl)
    const args = this.promptMode === 'arg' ? [prompt] : []
    const input = this.promptMode === 'stdin' ? prompt : ''
    const session = this.protocol.spawn(input, {
      args,
      cwd: this.cwd,
      closeStdinAfterInput: this.promptMode === 'stdin',
      runTimeoutMs: options?.runTimeoutSeconds ? options.runTimeoutSeconds * 1000 : undefined,
    })
    this.sessionMeta.set(session.id, { label: options?.label, agentId: options?.agentId })
    this.setState('connected')
    return { status: 'accepted', runId: session.id, sessionKey: sessionKey(session.id) }
  }

  async sendToSession(sessionKeyValue: string, message: string): Promise<SendResult> {
    const id = sessionIdFromKey(sessionKeyValue)
    this.protocol.send(id, message)
    return { status: 'accepted', runId: id }
  }

  async listSessions(options: ListSessionsOptions = {}): Promise<RuntimeSession[]> {
    let sessions = this.protocol
      .listSessions()
      .map((session) => toRuntimeSession(session, this.sessionMeta.get(session.id)))
      .sort((a, b) => b.updatedAt - a.updatedAt)

    if (options.kinds?.length) {
      sessions = sessions.filter((session) => options.kinds?.includes(session.kind))
    }
    if (typeof options.activeMinutes === 'number') {
      const cutoff = Date.now() - options.activeMinutes * 60_000
      sessions = sessions.filter((session) => session.updatedAt >= cutoff)
    }
    if (typeof options.limit === 'number') sessions = sessions.slice(0, options.limit)
    return sessions
  }

  async awaitSessionComplete(
    matcher: AwaitSessionMatcher,
    options: AwaitSessionOptions,
  ): Promise<void> {
    const id =
      matcher.runId ?? (matcher.sessionKey ? sessionIdFromKey(matcher.sessionKey) : undefined)
    if (!id) throw new Error('Claude Code awaitSessionComplete requires runId or sessionKey')

    const started = Date.now()
    const pollMs = options.fallbackPollIntervalMs ?? 100
    while (Date.now() - started <= options.timeoutMs) {
      const session = this.protocol.status(id)
      if (!session) throw new Error(`Unknown Claude Code session: ${id}`)
      if (session.status !== 'running') return
      await new Promise((resolve) => setTimeout(resolve, pollMs))
    }
    this.protocol.kill(id, 'SIGTERM')
    throw new Error(`Timed out waiting for Claude Code session: ${id}`)
  }

  async getSessionHistory(
    sessionKeyValue: string,
    options: SessionHistoryOptions = {},
  ): Promise<RuntimeMessage[]> {
    const id = sessionIdFromKey(sessionKeyValue)
    let messages = this.protocol.getTranscript(id).map<RuntimeMessage>((entry) => ({
      role: entry.stream === 'stdout' ? 'assistant' : entry.stream === 'stdin' ? 'user' : 'tool',
      content: entry.content,
      timestamp: entry.timestamp,
    }))

    if (!options.includeTools) messages = messages.filter((message) => message.role !== 'tool')
    if (typeof options.limit === 'number') messages = messages.slice(-options.limit)
    return messages
  }

  private setState(state: RuntimeConnectionState): void {
    if (this.state === state) return
    this.state = state
    this.stateHandlers.forEach((handler) => handler(state))
  }
}

export function createClaudeCodeAdapter(
  options: ClaudeCodeAdapterOptions = {},
): ClaudeCodeRuntimeAdapter {
  return new ClaudeCodeRuntimeAdapter(options)
}

export function createClaudeCodeAdapterFromConfig(
  config: RuntimeProviderConfig = { provider: 'claude-code' },
): ClaudeCodeRuntimeAdapter {
  return createClaudeCodeAdapter({
    command: typeof config.command === 'string' ? config.command : undefined,
    availabilityArgs: asStringArray(config.availabilityArgs),
    defaultArgs: asStringArray(config.defaultArgs),
    cwd: typeof config.cwd === 'string' ? config.cwd : undefined,
    env: asStringRecord(config.env),
    sessionIdPrefix:
      typeof config.sessionIdPrefix === 'string' ? config.sessionIdPrefix : undefined,
    promptMode: config.promptMode === 'stdin' ? 'stdin' : 'arg',
    taiaBaseUrl: config.taiaBaseUrl,
  })
}

let registered = false

export function ensureClaudeCodeFactoryRegistered(): void {
  if (registered) return
  registered = true
  registerRuntimeFactory('claude-code', createClaudeCodeAdapterFromConfig)
}

ensureClaudeCodeFactoryRegistered()
