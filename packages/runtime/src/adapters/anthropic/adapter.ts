// AnthropicAdapter — implements AgentRuntimeAdapter against the Anthropic
// Messages API (streaming). Persists conversations via a RuntimeSessionStore
// (DB-backed in production, in-memory in tests) and emits live events that
// match the SSE route's expectations.

import type { AgentContextBundle } from '@taia/types'

import type { AgentRuntimeAdapter } from '../../adapter'
import { CapabilitySet, RuntimeCapability } from '../../capabilities'
import type {
  AwaitSessionMatcher,
  AwaitSessionOptions,
  ListSessionsOptions,
  RuntimeAgent,
  RuntimeConnectionState,
  RuntimeConnectionTest,
  RuntimeEventHandler,
  RuntimeEventName,
  RuntimeHealth,
  RuntimeMessage,
  RuntimeProviderDefaults,
  RuntimeSession,
  SendResult,
  SessionHistoryOptions,
  SpawnOptions,
  SpawnResult,
} from '../../types'
import { AnthropicClient } from './client'
import { AnthropicContextRenderer, type RenderedAnthropicContext } from './context-renderer'
import { toRuntimeSession, toSpawnResult } from './mappers'
import type {
  AgentContextResolver,
  AgentLifecyclePayload,
  AnthropicAdapterOptions,
  ApprovalRequestPayload,
  ChatDeltaPayload,
  RuntimeSessionStore,
} from './types'

const PROVIDER = 'anthropic'

type ListenerSet = Set<RuntimeEventHandler>

export class AnthropicAdapter implements AgentRuntimeAdapter {
  readonly id = PROVIDER
  readonly capabilities: CapabilitySet
  private readonly client: AnthropicClient
  private readonly store: RuntimeSessionStore
  private state: RuntimeConnectionState = 'disconnected'
  private readonly stateListeners = new Set<(s: RuntimeConnectionState) => void>()
  private readonly listeners = new Map<RuntimeEventName, ListenerSet>()
  private readonly systemPrompt?: string
  private readonly defaultMaxTokens: number
  private readonly getAgentContext?: AgentContextResolver
  private readonly contextRenderer = new AnthropicContextRenderer()

  constructor(options: AnthropicAdapterOptions & { systemPrompt?: string }) {
    this.client = new AnthropicClient(options)
    this.store = options.store
    this.systemPrompt = options.systemPrompt
    this.defaultMaxTokens = options.defaultMaxTokens || 16_000
    this.getAgentContext = options.getAgentContext

    // LiveEvents always declared (real implementation backed by
    // the Anthropic SDK's streaming API).
    // Approvals declared opt-in (enableApprovals=true). The
    // executor wiring lives in core/anthropic-wiring.ts; the capability flag
    // tells UI consumers whether to render approval controls.
    const caps: RuntimeCapability[] = [
      RuntimeCapability.Sessions,
      RuntimeCapability.Transcripts,
      RuntimeCapability.LiveEvents,
      RuntimeCapability.Health,
    ]
    if (options.enableApprovals) caps.push(RuntimeCapability.Approvals)
    this.capabilities = new CapabilitySet(caps)
  }

  // --- Lifecycle ---

  async isAvailable(): Promise<boolean> {
    this.setState('connecting')
    const result = await this.client.ping()
    this.setState(result.ok ? 'connected' : 'disconnected')
    return result.ok
  }

  getConnectionState(): RuntimeConnectionState {
    return this.state
  }

  onConnectionStateChange(handler: (state: RuntimeConnectionState) => void): () => void {
    this.stateListeners.add(handler)
    return () => this.stateListeners.delete(handler)
  }

  // --- Required ---

  async listAgents(): Promise<RuntimeAgent[]> {
    const sessions = await this.store.listSessions({ limit: 500 })
    const ids = new Set<string>()
    for (const s of sessions) ids.add(s.agentId)
    return Array.from(ids).map((id) => ({ id, configured: true }))
  }

  testConnection(): Promise<RuntimeConnectionTest> {
    return this.client.testConnection()
  }

  async getHealth(): Promise<RuntimeHealth> {
    const result = await this.client.ping()
    return { ok: result.ok }
  }

  getProviderDefaults(): RuntimeProviderDefaults {
    return { workspaceRoot: '/tmp/taia-anthropic', configFilename: 'anthropic.json' }
  }

  // --- Sessions ---

  async spawnSession(task: string, options?: SpawnOptions): Promise<SpawnResult> {
    const agentId = options?.agentId || 'unknown'
    const runId = `run-${Date.now().toString(36)}-${randomSuffix()}`
    const sessionKey = `anthropic:${agentId}:${runId}`
    const model = options?.model || this.client.getDefaultModel()

    await this.store.createSession({
      sessionKey,
      agentId,
      runId,
      model,
      label: options?.label,
      bundleVersionIds: options?.bundleVersionIds,
    })

    // Resolve context BEFORE persisting the first message so that, when a
    // bundle is provided, we can replace the `task` string with the
    // renderer's kickoff (phrased from `options.trigger`) as the first user
    // message. The bundle's identity/project/user layers go into the system
    // prompt; the task layer goes into the kickoff.
    const resolved = await this.resolveAgentContext(agentId, options?.context)
    const rendered = resolved.bundle
      ? this.contextRenderer.render(resolved.bundle, { trigger: options?.trigger, prompt: task })
      : undefined
    const taskText = rendered ? rendered.taskMessage : task

    // Vision support. When attachments are passed, the first user
    // message becomes a content array combining image blocks with the text
    // task. Adapters/runtimes that don't support vision can ignore the
    // attachments field — the option is opt-in.
    const initialContent =
      options?.attachments && options.attachments.length > 0
        ? [...options.attachments, { type: 'text' as const, text: taskText }]
        : taskText

    await this.store.appendMessage({
      sessionKey,
      role: 'user',
      content: initialContent,
    })

    void this.runLoopWithDeadline(sessionKey, agentId, runId, options?.runTimeoutSeconds, {
      systemPrompt: resolved.systemPrompt,
      rendered,
      model,
    })

    return toSpawnResult(sessionKey, runId)
  }

  async sendToSession(
    sessionKey: string,
    message: string,
    timeoutSeconds?: number,
  ): Promise<SendResult> {
    const session = await this.store.getSession(sessionKey)
    if (!session) throw new Error(`Session not found: ${sessionKey}`)

    await this.store.appendMessage({ sessionKey, role: 'user', content: message })
    await this.store.updateSession(sessionKey, { status: 'running' })
    // sendToSession has no SpawnOptions — context (if any) must come from the
    // resolver callback. Re-resolving each turn lets the wiring stream a
    // fresh bundle (e.g. when SOUL.md was just edited).
    const resolved = await this.resolveAgentContext(session.agentId)
    const rendered = resolved.bundle ? this.contextRenderer.render(resolved.bundle) : undefined
    void this.runLoopWithDeadline(sessionKey, session.agentId, session.runId, timeoutSeconds, {
      systemPrompt: resolved.systemPrompt,
      rendered,
      model: session.model ?? undefined,
    })
    return { status: 'accepted' }
  }

  async listSessions(options?: ListSessionsOptions): Promise<RuntimeSession[]> {
    const records = await this.store.listSessions({
      limit: options?.limit,
      activeMinutes: options?.activeMinutes,
    })
    return records.map(toRuntimeSession)
  }

  /**
   * Resolve when the matched session emits a terminal lifecycle event
   * (finished / refused / failed). Falls back to polling the store status
   * when fallbackPollIntervalMs is supplied.
   *
   * Note: a final chat event ('chat' with state='final') marks one assistant
   * turn done — but a tool_use turn also emits 'final' before the next round.
   * We only resolve on terminal lifecycle so multi-turn loops complete cleanly.
   */
  async awaitSessionComplete(
    matcher: AwaitSessionMatcher,
    options: AwaitSessionOptions,
  ): Promise<void> {
    if (!matcher.sessionKey && !matcher.runId) {
      throw new Error('AnthropicAdapter.awaitSessionComplete requires sessionKey or runId')
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (err?: Error) => {
        if (settled) return
        settled = true
        unsubAgent()
        clearTimeout(timer)
        if (pollTimer) clearInterval(pollTimer)
        if (err) reject(err)
        else resolve()
      }

      const matches = (payload: { sessionKey?: string; runId?: string } | undefined): boolean => {
        if (!payload) return false
        if (matcher.sessionKey && payload.sessionKey !== matcher.sessionKey) return false
        if (matcher.runId && payload.runId !== matcher.runId) return false
        return Boolean(matcher.sessionKey || matcher.runId)
      }

      const unsubAgent = this.on('agent', (payload: unknown) => {
        const p = payload as AgentLifecyclePayload
        if (p?.stream !== 'lifecycle') return
        if (!matches(p)) return
        if (
          p.data.status === 'finished' ||
          p.data.status === 'refused' ||
          p.data.status === 'failed'
        ) {
          finish()
        }
      })

      let pollTimer: ReturnType<typeof setInterval> | null = null
      if (options.fallbackPollIntervalMs && matcher.sessionKey) {
        const sessionKey = matcher.sessionKey
        pollTimer = setInterval(async () => {
          try {
            const session = await this.store.getSession(sessionKey)
            if (session && session.status !== 'running') finish()
          } catch {
            // Ignore — timeout will catch it.
          }
        }, options.fallbackPollIntervalMs)
      }

      const timer = setTimeout(() => {
        finish(new Error('awaitSessionComplete: timeout'))
      }, options.timeoutMs)
    })
  }

  // --- Transcripts ---

  async getSessionHistory(
    sessionKey: string,
    options?: SessionHistoryOptions,
  ): Promise<RuntimeMessage[]> {
    const messages = await this.store.getMessages(sessionKey, { limit: options?.limit })
    if (options?.includeTools === false) {
      return messages.filter((m) => m.role !== 'tool')
    }
    return messages
  }

  // --- Pre-flight estimation ---

  /**
   * Pre-flight token estimate for the current state of a session. Useful
   * for cost dashboards and budget enforcement before spending real tokens
   * on `sendToSession`. Returns 0 on error rather than throwing.
   */
  async estimateSessionTokens(sessionKey: string): Promise<number> {
    const stored = await this.store.getMessages(sessionKey)
    if (stored.length === 0) return 0
    // Reuse the same outbound shape the loop sends to Anthropic.
    const { fromRuntimeMessages } = await import('./mappers')
    return this.client.estimateTokens(fromRuntimeMessages(stored))
  }

  // --- Live events ---

  on(event: RuntimeEventName, handler: RuntimeEventHandler): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
    return () => {
      this.listeners.get(event)?.delete(handler)
    }
  }

  // --- Internal ---

  /**
   * Emit an event to every registered listener. Errors in user handlers are
   * swallowed — one bad subscriber should not poison the loop.
   */
  private emit(event: RuntimeEventName, payload: unknown): void {
    const set = this.listeners.get(event)
    if (!set) return
    set.forEach((handler) => {
      try {
        handler(payload)
      } catch {
        /* swallow */
      }
    })
  }

  /**
   * Resolve the agent's context for the session about to start. Precedence
   * (highest first):
   *   1. `override` (SpawnOptions.context — explicit, end-to-end-typed bundle)
   *   2. resolver callback returning `{ bundle }`
   *   3. resolver callback returning `{ systemPrompt }` (flat-prompt path)
   *   4. adapter-level systemPrompt
   *   5. undefined (adapter sends no system)
   *
   * Resolver errors are non-fatal — they log and degrade to the default so a
   * single broken agent doesn't take down the whole adapter.
   */
  private async resolveAgentContext(
    agentId: string,
    override?: AgentContextBundle,
  ): Promise<{ bundle?: AgentContextBundle; systemPrompt?: string }> {
    if (override) return { bundle: override }
    if (!this.getAgentContext) return { systemPrompt: this.systemPrompt }
    try {
      const ctx = await this.getAgentContext(agentId)
      if (ctx?.bundle) return { bundle: ctx.bundle }
      if (ctx?.systemPrompt) return { systemPrompt: ctx.systemPrompt }
      return { systemPrompt: this.systemPrompt }
    } catch (err) {
      console.warn(
        `[anthropic-adapter] getAgentContext failed for ${agentId}:`,
        err instanceof Error ? err.message : err,
      )
      return { systemPrompt: this.systemPrompt }
    }
  }

  private async runLoopWithDeadline(
    sessionKey: string,
    agentId: string,
    runId: string,
    timeoutSeconds?: number,
    context?: { systemPrompt?: string; rendered?: RenderedAnthropicContext; model?: string },
  ): Promise<void> {
    try {
      const loop = this.client.runSessionLoop(
        {
          sessionKey,
          agentId,
          runId,
          // Bundle path: structured system blocks + scoped tool allowlist.
          // Fallback path: flat system prompt string.
          systemBlocks: context?.rendered?.systemBlocks,
          systemPrompt: context?.rendered
            ? undefined
            : (context?.systemPrompt ?? this.systemPrompt),
          toolAllowlist: context?.rendered?.toolNames,
          // Model chosen at spawn time (persisted on the session row).
          model: context?.model,
          maxTokens: this.defaultMaxTokens,
        },
        {
          emitChat: (payload: ChatDeltaPayload) => this.emit('chat', payload),
          emitLifecycle: (payload: AgentLifecyclePayload) => this.emit('agent', payload),
          // Approval requests share the `agent` channel — consumers branch
          // on `payload.stream === 'approval'` vs 'lifecycle'. Same channel
          // keeps the SSE route simple (one subscription).
          emitApproval: (payload: ApprovalRequestPayload) => this.emit('agent', payload),
        },
      )

      if (timeoutSeconds) {
        await Promise.race([
          loop,
          sleep(timeoutSeconds * 1000).then(() =>
            Promise.reject(new Error('Session run timed out')),
          ),
        ])
      } else {
        await loop
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[anthropic-adapter] Session ${sessionKey} failed:`, message)
      await this.store
        .updateSession(sessionKey, { status: 'failed', stopReason: message })
        .catch(() => {})
      this.emit('agent', {
        agentId,
        sessionKey,
        runId,
        stream: 'lifecycle',
        data: { status: 'failed', stopReason: message },
      } satisfies AgentLifecyclePayload)
    }
  }

  private setState(state: RuntimeConnectionState): void {
    if (this.state === state) return
    this.state = state
    this.stateListeners.forEach((handler) => {
      try {
        handler(state)
      } catch {
        /* ignore handler errors */
      }
    })
  }
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function createAnthropicAdapter(
  options: AnthropicAdapterOptions & { systemPrompt?: string },
): AnthropicAdapter {
  return new AnthropicAdapter(options)
}
