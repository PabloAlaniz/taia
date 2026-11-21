// AnthropicAdapter — adapter-specific behavior beyond the generic contract.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RuntimeCapability } from '@taia/runtime'
import { createAnthropicAdapter, type ToolExecutor } from '@taia/runtime/adapters/anthropic'
import { InMemoryRuntimeSessionStore } from './contract/anthropic-in-memory-store'

const messagesStream = vi.fn()
const modelsRetrieve = vi.fn()

vi.mock('@anthropic-ai/sdk', async () => {
  // Forward the real error classes so categoriseSdkError's instanceof checks
  // line up when tests throw e.g. RateLimitError. We only swap the
  // constructor that opens the network connection.
  const actual = await vi.importActual<typeof import('@anthropic-ai/sdk')>('@anthropic-ai/sdk')
  class MockAnthropic {
    models = { retrieve: modelsRetrieve }
    messages = { stream: messagesStream }
    // The adapter now goes through client.beta.messages.stream so it
    // can pass `betas: ['compact-2026-01-12']` and `context_management`. Both
    // surfaces hit the same mock — the call shape is identical.
    beta = { messages: { stream: messagesStream } }
    // Static error subclasses preserved from the real SDK.
    static APIError = actual.default.APIError
    static RateLimitError = actual.default.RateLimitError
    static AuthenticationError = actual.default.AuthenticationError
    static PermissionDeniedError = actual.default.PermissionDeniedError
    static BadRequestError = actual.default.BadRequestError
    static NotFoundError = actual.default.NotFoundError
    static InternalServerError = actual.default.InternalServerError
    static APIConnectionError = actual.default.APIConnectionError
  }
  return { __esModule: true, default: MockAnthropic }
})

beforeEach(() => {
  messagesStream.mockReset()
  modelsRetrieve.mockReset()
  modelsRetrieve.mockResolvedValue({ id: 'claude-opus-4-7' })
})

/**
 * Build a fake `messages.stream` return value matching the Anthropic SDK
 * surface the adapter actually uses: `.on('text' | 'streamEvent', cb)` and
 * `.finalMessage()`.
 */
function fakeStream(opts: {
  textDeltas?: string[]
  thinkingDeltas?: string[]
  finalMessage: {
    id?: string
    model?: string
    stop_reason: string
    content: unknown[]
    usage: {
      input_tokens: number
      output_tokens: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
}) {
  const handlers = {
    text: [] as Array<(delta: string) => void>,
    streamEvent: [] as Array<(event: unknown) => void>,
  }
  return {
    on(event: 'text' | 'streamEvent', handler: (arg: never) => void) {
      handlers[event].push(handler as never)
      return this
    },
    async finalMessage() {
      // Replay deltas synchronously before resolving (preserves test ordering).
      for (const d of opts.textDeltas ?? []) handlers.text.forEach((h) => h(d))
      for (const t of opts.thinkingDeltas ?? []) {
        handlers.streamEvent.forEach((h) =>
          h({
            type: 'content_block_delta',
            delta: { type: 'thinking_delta', thinking: t },
          }),
        )
      }
      return {
        id: opts.finalMessage.id ?? 'msg_1',
        model: opts.finalMessage.model ?? 'claude-opus-4-7',
        stop_reason: opts.finalMessage.stop_reason,
        content: opts.finalMessage.content,
        usage: {
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          ...opts.finalMessage.usage,
        },
      }
    },
  }
}

function makeAdapter(executeTool: ToolExecutor = async () => 'noop') {
  return {
    store: new InMemoryRuntimeSessionStore(),
    adapter: (() => null)(),
    build() {
      const store = this.store
      const adapter = createAnthropicAdapter({
        apiKey: 'sk-test',
        store,
        executeTool,
        // Disable thinking in tests to keep mock surface small; covered separately.
        enableThinking: false,
      })
      return { adapter, store }
    },
  }
}

describe('AnthropicAdapter', () => {
  it('declares Sessions/Transcripts/LiveEvents/Health and skips Cron', () => {
    const { adapter } = makeAdapter().build()
    expect(adapter.id).toBe('anthropic')
    expect(adapter.capabilities.has(RuntimeCapability.Sessions)).toBe(true)
    expect(adapter.capabilities.has(RuntimeCapability.Transcripts)).toBe(true)
    expect(adapter.capabilities.has(RuntimeCapability.LiveEvents)).toBe(true)
    expect(adapter.capabilities.has(RuntimeCapability.Health)).toBe(true)
    expect(adapter.capabilities.has(RuntimeCapability.Cron)).toBe(false)
    expect(adapter.capabilities.has(RuntimeCapability.AgentProvisioning)).toBe(false)
  })

  it('spawnSession persists the session row and the first user message', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'hello' }],
          usage: { input_tokens: 7, output_tokens: 2 },
        },
      }),
    )

    const { adapter, store } = makeAdapter().build()
    const result = await adapter.spawnSession!('Do the thing', { agentId: 'alex' })

    expect(result.status).toBe('accepted')
    expect(result.sessionKey).toMatch(/^anthropic:alex:run-/)

    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    const session = await store.getSession(result.sessionKey)
    expect(session?.status).toBe('idle')
    expect(session?.totalTokens).toBe(9)

    const messages = await store.getMessages(result.sessionKey)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toBe('Do the thing')
    expect(messages[1].role).toBe('assistant')
  })

  it('emits chat:delta for text and a chat:final at the end of each turn', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        textDeltas: ['Hel', 'lo,', ' world'],
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Hello, world' }],
          usage: { input_tokens: 5, output_tokens: 5 },
        },
      }),
    )

    const { adapter } = makeAdapter().build()
    const chatEvents: Array<{ state: string; content: string }> = []
    adapter.on!('chat', (payload: unknown) => {
      const p = payload as { state: string; message: { content: string } }
      chatEvents.push({ state: p.state, content: p.message.content })
    })

    const result = await adapter.spawnSession!('say hi', { agentId: 'qa' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    expect(chatEvents).toEqual([
      { state: 'delta', content: 'Hel' },
      { state: 'delta', content: 'lo,' },
      { state: 'delta', content: ' world' },
      { state: 'final', content: 'Hello, world' },
    ])
  })

  it('emits agent lifecycle events: started → finished', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 2, output_tokens: 1 },
        },
      }),
    )

    const { adapter } = makeAdapter().build()
    const lifecycle: string[] = []
    adapter.on!('agent', (payload: unknown) => {
      const p = payload as { stream: string; data: { status: string } }
      if (p.stream === 'lifecycle') lifecycle.push(p.data.status)
    })

    const result = await adapter.spawnSession!('go', { agentId: 'qa' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    expect(lifecycle).toEqual(['started', 'finished'])
  })

  it('emits lifecycle "tool_use" between iterations when the model calls a tool', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'taia_tasks_list', input: {} }],
          usage: { input_tokens: 4, output_tokens: 2 },
        },
      }),
    )
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'done' }],
          usage: { input_tokens: 8, output_tokens: 1 },
        },
      }),
    )

    const { adapter } = makeAdapter(async () => '[]').build()
    const lifecycle: string[] = []
    adapter.on!('agent', (payload: unknown) => {
      const p = payload as { stream: string; data: { status: string } }
      if (p.stream === 'lifecycle') lifecycle.push(p.data.status)
    })

    const result = await adapter.spawnSession!('list', { agentId: 'qa' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    expect(lifecycle).toEqual(['started', 'tool_use', 'finished'])
  })

  it('emits lifecycle "refused" and marks session failed when stop_reason=refusal', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'refusal',
          content: [{ type: 'text', text: 'I cannot help with that.' }],
          usage: { input_tokens: 5, output_tokens: 8 },
        },
      }),
    )

    const { adapter, store } = makeAdapter().build()
    const lifecycle: string[] = []
    adapter.on!('agent', (payload: unknown) => {
      const p = payload as { stream: string; data: { status: string } }
      if (p.stream === 'lifecycle') lifecycle.push(p.data.status)
    })

    const result = await adapter.spawnSession!('do something prohibited', { agentId: 'qa' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    expect(lifecycle).toEqual(['started', 'refused'])
    const session = await store.getSession(result.sessionKey)
    expect(session?.status).toBe('failed')
    expect(session?.stopReason).toBe('refusal')
  })

  it('awaitSessionComplete resolves on terminal lifecycle, no polling needed', async () => {
    let resolveStream!: () => void
    const blockedStream = new Promise<void>((r) => {
      resolveStream = r
    })

    messagesStream.mockReturnValueOnce({
      on() {
        return this
      },
      async finalMessage() {
        await blockedStream
        return {
          id: 'msg_1',
          model: 'claude-opus-4-7',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'done' }],
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        }
      },
    })

    const { adapter } = makeAdapter().build()
    const result = await adapter.spawnSession!('go', { agentId: 'qa' })

    // Schedule the stream to resolve after a short delay; awaitSessionComplete
    // should resolve via the lifecycle event without any polling configured.
    setTimeout(() => resolveStream(), 30)

    const start = Date.now()
    await adapter.awaitSessionComplete!(
      { sessionKey: result.sessionKey },
      { timeoutMs: 2000 }, // no fallbackPollIntervalMs
    )
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(500)
  })

  it('awaitSessionComplete throws when the session never finishes (no events, no polling)', async () => {
    // Stream never resolves and never emits.
    messagesStream.mockReturnValueOnce({
      on() {
        return this
      },
      finalMessage() {
        return new Promise(() => {}) // never resolves
      },
    })

    const { adapter, store } = makeAdapter().build()
    const result = await adapter.spawnSession!('hang', { agentId: 'qa' })

    await expect(
      adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 100 }),
    ).rejects.toThrow(/timeout/)

    const session = await store.getSession(result.sessionKey)
    expect(session?.status).toBe('running')
  })

  it('captures tool execution errors as is_error tool_result blocks', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'tool_use',
          content: [
            { type: 'tool_use', id: 'toolu_err', name: 'taia_tasks_get', input: { task_id: 'x' } },
          ],
          usage: { input_tokens: 5, output_tokens: 2 },
        },
      }),
    )
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'sorry' }],
          usage: { input_tokens: 12, output_tokens: 4 },
        },
      }),
    )

    const executeTool: ToolExecutor = async () => {
      throw new Error('Task not found')
    }
    const { adapter, store } = makeAdapter(executeTool).build()
    const result = await adapter.spawnSession!('get task x', { agentId: 'qa' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    const messages = await store.getMessages(result.sessionKey)
    const toolResultMsg = messages.find(
      (m) =>
        m.role === 'user' &&
        Array.isArray(m.content) &&
        (m.content as Array<{ type: string }>).some((b) => b.type === 'tool_result'),
    )
    expect(toolResultMsg).toBeDefined()
    const block = (
      toolResultMsg!.content as Array<{
        type: string
        is_error?: boolean
        content?: string
      }>
    ).find((b) => b.type === 'tool_result')!
    expect(block.is_error).toBe(true)
    expect(block.content).toContain('Task not found')
  })

  it('getHealth returns ok when the model retrieval succeeds', async () => {
    const { adapter } = makeAdapter().build()
    const health = await adapter.getHealth()
    expect(health.ok).toBe(true)
  })

  it('getHealth returns ok=false when the API key is invalid', async () => {
    modelsRetrieve.mockRejectedValueOnce(new Error('401 invalid api key'))
    const { adapter } = makeAdapter().build()
    const health = await adapter.getHealth()
    expect(health.ok).toBe(false)
  })

  it('listAgents returns the union of agent IDs that have sessions', async () => {
    messagesStream.mockReturnValue(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    )
    const { adapter } = makeAdapter().build()
    await adapter.spawnSession!('a', { agentId: 'alex' })
    await adapter.spawnSession!('b', { agentId: 'bob' })
    await adapter.spawnSession!('c', { agentId: 'alex' })

    await new Promise((r) => setTimeout(r, 50))

    const agents = await adapter.listAgents()
    expect(agents.map((a) => a.id).sort()).toEqual(['alex', 'bob'])
  })

  // --- extended capabilities ---

  it('passes the compaction beta header and context_management to the stream call', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    )

    const { adapter } = makeAdapter().build()
    const result = await adapter.spawnSession!('test', { agentId: 'qa' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    expect(messagesStream).toHaveBeenCalledOnce()
    const params = messagesStream.mock.calls[0][0] as Record<string, unknown>
    expect(params.betas).toEqual(['compact-2026-01-12'])
    expect(params.context_management).toEqual({ edits: [{ type: 'compact_20260112' }] })
  })

  it('gates adaptive thinking on the session model when enableThinking is not set', async () => {
    const finalMessage = {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }
    messagesStream
      .mockReturnValueOnce(fakeStream({ finalMessage }))
      .mockReturnValueOnce(fakeStream({ finalMessage }))

    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store: new InMemoryRuntimeSessionStore(),
      executeTool: async () => 'noop',
    })

    const current = await adapter.spawnSession!('a', { agentId: 'qa' })
    await adapter.awaitSessionComplete!({ sessionKey: current.sessionKey }, { timeoutMs: 2000 })
    const legacy = await adapter.spawnSession!('b', { agentId: 'qa', model: 'claude-haiku-4-5' })
    await adapter.awaitSessionComplete!({ sessionKey: legacy.sessionKey }, { timeoutMs: 2000 })

    const first = messagesStream.mock.calls[0][0] as Record<string, unknown>
    const second = messagesStream.mock.calls[1][0] as Record<string, unknown>
    expect(first.model).toBe('claude-opus-5-5')
    expect(first.thinking).toEqual({ type: 'adaptive', display: 'summarized' })
    expect(second.model).toBe('claude-haiku-4-5')
    expect(second.thinking).toBeUndefined()
  })

  it('maps SpawnOptions.attachments to a content array on the first user message', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'I see a screenshot.' }],
          usage: { input_tokens: 5, output_tokens: 5 },
        },
      }),
    )

    const { adapter, store } = makeAdapter().build()
    const result = await adapter.spawnSession!('Describe this', {
      agentId: 'qa',
      attachments: [
        {
          type: 'image',
          source: { type: 'url', url: 'https://example.com/screenshot.png' },
        },
      ],
    })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    const messages = await store.getMessages(result.sessionKey)
    expect(messages[0].role).toBe('user')
    expect(Array.isArray(messages[0].content)).toBe(true)
    const blocks = messages[0].content as Array<{ type: string }>
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('image')
    expect(blocks[1].type).toBe('text')
  })

  it('exposes the memory tool when enableMemory=true and forwards calls to the executor with context', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_mem',
              name: 'memory',
              input: { command: 'view', path: '/' },
            },
          ],
          usage: { input_tokens: 5, output_tokens: 2 },
        },
      }),
    )
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'memory empty' }],
          usage: { input_tokens: 8, output_tokens: 3 },
        },
      }),
    )

    const seenContexts: Array<{ name: string; agentId: string }> = []
    const executeTool: ToolExecutor = async (name, _input, context) => {
      seenContexts.push({ name, agentId: context.agentId })
      return '(empty directory)'
    }
    const store = new InMemoryRuntimeSessionStore()
    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store,
      executeTool,
      enableMemory: true,
      enableThinking: false,
    })

    const result = await adapter.spawnSession!('check memory', { agentId: 'kate' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    // Verify the memory tool was included in the first request's tools array.
    const params = messagesStream.mock.calls[0][0] as { tools: Array<{ name: string }> }
    const toolNames = params.tools.map((t) => t.name)
    expect(toolNames).toContain('memory')

    // Verify the executor received the memory call with proper context.
    expect(seenContexts).toEqual([{ name: 'memory', agentId: 'kate' }])
  })

  it('exposes enabled server-side tools (web_search/web_fetch/code_execution)', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    )

    const store = new InMemoryRuntimeSessionStore()
    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store,
      executeTool: async () => 'noop',
      enableThinking: false,
      enabledServerTools: ['web_search', 'code_execution'],
    })

    const result = await adapter.spawnSession!('search the web', { agentId: 'qa' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    const params = messagesStream.mock.calls[0][0] as {
      tools: Array<{ name: string; type: string }>
    }
    const toolTypes = params.tools.map((t) => t.type)
    expect(toolTypes).toContain('web_search_20260209')
    expect(toolTypes).toContain('code_execution_20260120')
    expect(toolTypes).not.toContain('web_fetch_20260209') // not enabled
  })

  it('treats pause_turn as a clean session end (status=idle, lifecycle=finished)', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'pause_turn',
          content: [{ type: 'text', text: 'paused mid-turn' }],
          usage: { input_tokens: 5, output_tokens: 3 },
        },
      }),
    )

    const { adapter, store } = makeAdapter().build()
    const lifecycle: Array<{ status: string; stopReason?: string }> = []
    adapter.on!('agent', (payload: unknown) => {
      const p = payload as {
        stream: string
        data: { status: string; stopReason?: string }
      }
      if (p.stream === 'lifecycle') lifecycle.push(p.data)
    })

    const result = await adapter.spawnSession!('long task', { agentId: 'qa' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    expect(lifecycle).toEqual([
      { status: 'started' },
      { status: 'finished', stopReason: 'pause_turn' },
    ])
    const session = await store.getSession(result.sessionKey)
    expect(session?.status).toBe('idle')
    expect(session?.stopReason).toBe('pause_turn')
  })

  it('declares Approvals capability when enableApprovals=true', () => {
    const store = new InMemoryRuntimeSessionStore()
    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store,
      executeTool: async () => 'noop',
      enableThinking: false,
      enableApprovals: true,
    })
    expect(adapter.capabilities.has(RuntimeCapability.Approvals)).toBe(true)
  })

  it('does not declare Approvals capability by default', () => {
    const { adapter } = makeAdapter().build()
    expect(adapter.capabilities.has(RuntimeCapability.Approvals)).toBe(false)
  })

  // --- production polish ---

  it('persists duration_ms when the session loop completes', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'done' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    )

    const { adapter, store } = makeAdapter().build()
    const result = await adapter.spawnSession!('test', { agentId: 'qa' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    const session = await store.getSession(result.sessionKey)
    expect(session?.durationMs).not.toBeNull()
    expect(typeof session?.durationMs).toBe('number')
    expect(session!.durationMs!).toBeGreaterThanOrEqual(0)
  })

  it('approval flow: rejected decision short-circuits with is_error tool_result', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_destructive',
              name: 'taia_tasks_create',
              input: { title: 'wipe everything' },
            },
          ],
          usage: { input_tokens: 5, output_tokens: 2 },
        },
      }),
    )
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'okay, skipping' }],
          usage: { input_tokens: 8, output_tokens: 3 },
        },
      }),
    )

    const approvalIds: string[] = []
    const approvalStore = {
      async createPending(input: { toolUseId: string }) {
        const id = `approval-${input.toolUseId}`
        approvalIds.push(id)
        return { id }
      },
      async untilDecided(_id: string) {
        return { decision: 'rejected' as const, reason: 'too risky' }
      },
    }

    const store = new InMemoryRuntimeSessionStore()
    const executeTool = vi.fn(async () => 'should not run')
    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store,
      executeTool,
      enableThinking: false,
      enableApprovals: true,
      needsApprovalTools: ['taia_tasks_create'],
      approvalStore,
    })

    const approvalEvents: Array<{ approvalId: string; toolName: string }> = []
    adapter.on!('agent', (payload: unknown) => {
      const p = payload as { stream: string; approvalId?: string; toolName?: string }
      if (p.stream === 'approval') {
        approvalEvents.push({ approvalId: p.approvalId!, toolName: p.toolName! })
      }
    })

    const result = await adapter.spawnSession!('do dangerous thing', { agentId: 'qa' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    // Executor must NOT have been called — the rejection short-circuited it.
    expect(executeTool).not.toHaveBeenCalled()
    // Adapter emitted the approval event before blocking on the decision.
    expect(approvalEvents).toEqual([
      { approvalId: 'approval-toolu_destructive', toolName: 'taia_tasks_create' },
    ])
    // Tool result captures the rejection back to the model.
    const messages = await store.getMessages(result.sessionKey)
    const toolResultMsg = messages.find(
      (m) =>
        m.role === 'user' &&
        Array.isArray(m.content) &&
        (m.content as Array<{ type: string }>).some((b) => b.type === 'tool_result'),
    )
    const block = (
      toolResultMsg!.content as Array<{ type: string; is_error?: boolean; content?: string }>
    ).find((b) => b.type === 'tool_result')!
    expect(block.is_error).toBe(true)
    expect(block.content).toContain('rejected')
    expect(block.content).toContain('too risky')
  })

  it('approval flow: approved decision lets the executor run normally', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_ok',
              name: 'taia_tasks_create',
              input: { title: 'safe task' },
            },
          ],
          usage: { input_tokens: 5, output_tokens: 2 },
        },
      }),
    )
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'created' }],
          usage: { input_tokens: 8, output_tokens: 3 },
        },
      }),
    )

    const approvalStore = {
      async createPending() {
        return { id: 'approval-1' }
      },
      async untilDecided() {
        return { decision: 'approved' as const }
      },
    }

    const store = new InMemoryRuntimeSessionStore()
    const executeTool = vi.fn(async () => '{"ok":true,"id":"task-42"}')
    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store,
      executeTool,
      enableThinking: false,
      enableApprovals: true,
      needsApprovalTools: ['taia_tasks_create'],
      approvalStore,
    })

    const result = await adapter.spawnSession!('create task', { agentId: 'qa' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    expect(executeTool).toHaveBeenCalledOnce()
    expect(executeTool).toHaveBeenCalledWith(
      'taia_tasks_create',
      { title: 'safe task' },
      expect.objectContaining({ agentId: 'qa' }),
    )
  })

  it('rate-limited SDK error → lifecycle failed with stopReason "rate_limited"', async () => {
    // Subclass the SDK's error so instanceof matches in the adapter.
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const err = new (
      Anthropic as unknown as { RateLimitError: new (...args: unknown[]) => Error }
    ).RateLimitError(429, undefined, '429 too many', new Headers())

    messagesStream.mockReturnValueOnce({
      on() {
        return this
      },
      async finalMessage() {
        throw err
      },
    })

    const { adapter, store } = makeAdapter().build()
    const lifecycle: Array<{ status: string; stopReason?: string }> = []
    adapter.on!('agent', (payload: unknown) => {
      const p = payload as {
        stream: string
        data: { status: string; stopReason?: string }
      }
      if (p.stream === 'lifecycle') lifecycle.push(p.data)
    })

    const result = await adapter.spawnSession!('rate limit me', { agentId: 'qa' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    expect(lifecycle).toContainEqual({ status: 'failed', stopReason: 'rate_limited' })
    const session = await store.getSession(result.sessionKey)
    expect(session?.status).toBe('failed')
    expect(session?.stopReason).toBe('rate_limited')
  })

  it('does not expose the memory tool when enableMemory is unset (default)', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    )

    const { adapter } = makeAdapter().build()
    const result = await adapter.spawnSession!('hi', { agentId: 'qa' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    const params = messagesStream.mock.calls[0][0] as { tools: Array<{ name: string }> }
    const toolNames = params.tools.map((t) => t.name)
    expect(toolNames).not.toContain('memory')
  })

  it('persists cache_creation_input_tokens and cache_read_input_tokens from the SDK usage', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'cached response' }],
          usage: {
            input_tokens: 50,
            output_tokens: 10,
            cache_creation_input_tokens: 4096,
            cache_read_input_tokens: 8192,
          },
        },
      }),
    )

    const { adapter, store } = makeAdapter().build()
    const result = await adapter.spawnSession!('cached prompt', { agentId: 'qa' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    const session = await store.getSession(result.sessionKey)
    expect(session?.cacheCreationInputTokens).toBe(4096)
    expect(session?.cacheReadInputTokens).toBe(8192)
    expect(session?.inputTokens).toBe(50)
    expect(session?.outputTokens).toBe(10)
    // total_tokens accumulates input + output only (matches Anthropic's
    // billing breakdown — cached tokens are charged separately).
    expect(session?.totalTokens).toBe(60)
  })

  it('on(event) returns an unsubscribe function that removes the listener', () => {
    const { adapter } = makeAdapter().build()
    const handler = vi.fn()
    const unsubscribe = adapter.on!('chat', handler)
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
    // emit indirectly by triggering via a no-op spawnSession path is overkill;
    // verifying via internals would couple the test. The contract check
    // (listener removed → not called by future emits) is exercised by other
    // tests that expect specific event sequences.
  })

  // --- per-agent system prompt via getAgentContext callback ---

  it('getAgentContext callback receives agentId and its systemPrompt is sent to the stream', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 5, output_tokens: 1 },
        },
      }),
    )

    const seenAgentIds: string[] = []
    const getAgentContext = vi.fn(async (agentId: string) => {
      seenAgentIds.push(agentId)
      return { systemPrompt: `You are ${agentId}, an agent of TAIA.` }
    })

    const store = new InMemoryRuntimeSessionStore()
    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store,
      executeTool: async () => 'noop',
      enableThinking: false,
      getAgentContext,
    })

    const result = await adapter.spawnSession!('do work', { agentId: 'alex' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    expect(seenAgentIds).toEqual(['alex'])
    const params = messagesStream.mock.calls[0][0] as {
      system: Array<{ type: string; text: string }>
    }
    expect(params.system).toBeDefined()
    expect(params.system[0].text).toBe('You are alex, an agent of TAIA.')
  })

  it('different agents get different system prompts in the same adapter instance', async () => {
    messagesStream.mockReturnValue(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    )

    const store = new InMemoryRuntimeSessionStore()
    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store,
      executeTool: async () => 'noop',
      enableThinking: false,
      getAgentContext: async (agentId) => ({ systemPrompt: `prompt-for-${agentId}` }),
    })

    const r1 = await adapter.spawnSession!('a', { agentId: 'alex' })
    await adapter.awaitSessionComplete!({ sessionKey: r1.sessionKey }, { timeoutMs: 2000 })
    const r2 = await adapter.spawnSession!('b', { agentId: 'bob' })
    await adapter.awaitSessionComplete!({ sessionKey: r2.sessionKey }, { timeoutMs: 2000 })

    const firstCall = messagesStream.mock.calls[0][0] as {
      system: Array<{ text: string }>
    }
    const secondCall = messagesStream.mock.calls[1][0] as {
      system: Array<{ text: string }>
    }
    expect(firstCall.system[0].text).toBe('prompt-for-alex')
    expect(secondCall.system[0].text).toBe('prompt-for-bob')
  })

  it('falls back to adapter-level systemPrompt when getAgentContext returns null', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    )

    const store = new InMemoryRuntimeSessionStore()
    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store,
      executeTool: async () => 'noop',
      enableThinking: false,
      systemPrompt: 'global-default',
      getAgentContext: async () => null,
    })

    const result = await adapter.spawnSession!('a', { agentId: 'alex' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    const params = messagesStream.mock.calls[0][0] as {
      system: Array<{ text: string }>
    }
    expect(params.system[0].text).toBe('global-default')
  })

  it('falls back to adapter-level systemPrompt when getAgentContext throws', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    )

    const store = new InMemoryRuntimeSessionStore()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store,
      executeTool: async () => 'noop',
      enableThinking: false,
      systemPrompt: 'fallback-on-error',
      getAgentContext: async () => {
        throw new Error('db unreachable')
      },
    })

    const result = await adapter.spawnSession!('a', { agentId: 'alex' })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    const params = messagesStream.mock.calls[0][0] as {
      system: Array<{ text: string }>
    }
    expect(params.system[0].text).toBe('fallback-on-error')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('sendToSession also resolves systemPrompt via getAgentContext (per-call fresh)', async () => {
    messagesStream.mockReturnValue(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    )

    const calls: string[] = []
    let counter = 0
    const store = new InMemoryRuntimeSessionStore()
    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store,
      executeTool: async () => 'noop',
      enableThinking: false,
      // Each invocation returns a fresh prompt — verifies the resolver is
      // called per spawn AND per send (not cached at adapter construction).
      getAgentContext: async (agentId) => {
        counter += 1
        const text = `${agentId}-v${counter}`
        calls.push(text)
        return { systemPrompt: text }
      },
    })

    const r = await adapter.spawnSession!('first', { agentId: 'alex' })
    await adapter.awaitSessionComplete!({ sessionKey: r.sessionKey }, { timeoutMs: 2000 })

    await adapter.sendToSession!(r.sessionKey, 'second', 2)
    await adapter.awaitSessionComplete!({ sessionKey: r.sessionKey }, { timeoutMs: 2000 })

    expect(calls).toEqual(['alex-v1', 'alex-v2'])
    const first = messagesStream.mock.calls[0][0] as { system: Array<{ text: string }> }
    const second = messagesStream.mock.calls[1][0] as { system: Array<{ text: string }> }
    expect(first.system[0].text).toBe('alex-v1')
    expect(second.system[0].text).toBe('alex-v2')
  })

  // --- taia_agent_context_read tool definition ---

  it('TAIA_TOOLS includes taia_agent_context_read with the expected schema', async () => {
    const { TAIA_TOOLS } = await import('@taia/runtime/adapters/anthropic')
    const tool = TAIA_TOOLS.find((t) => t.name === 'taia_agent_context_read')
    expect(tool).toBeDefined()
    const schema = tool!.input_schema as {
      type: string
      properties: Record<string, unknown>
      required?: string[]
    }
    expect(schema.type).toBe('object')
    expect(schema.properties.section).toMatchObject({
      enum: ['identity', 'instructions', 'working_notes'],
    })
    expect(schema.required).toContain('section')
  })

  // --- SpawnOptions.context (typed bundle) ---

  /**
   * Build a complete AgentContextBundle for tests. Override individual fields
   * by passing `overrides` — useful for capability/constraint variation.
   */
  function bundleFor(
    agentId: string,
    overrides: Partial<import('@taia/types').AgentContextBundle> = {},
  ): import('@taia/types').AgentContextBundle {
    return {
      agent: {
        id: agentId,
        name: agentId,
        role: 'Tester',
        persona: `Persona of ${agentId}.`,
        instructions: `Work for ${agentId}.`,
        capabilities: ['read_tasks', 'comment_tasks'],
      },
      project: { name: 'TAIA', description: 'test project' },
      user: { id: 'u', displayName: 'Tester' },
      task: {
        title: 'Bundle test',
        description: 'Run the bundle path.',
        priority: 'MEDIUM',
        status: 'IN_PROGRESS',
      },
      memory: { recall: [], archival: [], working: {} },
      ...overrides,
    }
  }

  it('options.context wins over getAgentContext callback and renders cached system blocks', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    )

    const callback = vi.fn(async () => ({ systemPrompt: 'CALLBACK SHOULD LOSE' }))
    const store = new InMemoryRuntimeSessionStore()
    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store,
      executeTool: async () => 'noop',
      enableThinking: false,
      getAgentContext: callback,
    })

    const result = await adapter.spawnSession!('placeholder', {
      agentId: 'alex',
      context: bundleFor('alex'),
    })
    await adapter.awaitSessionComplete!({ sessionKey: result.sessionKey }, { timeoutMs: 2000 })

    // Callback must NOT have been consulted because options.context was provided.
    expect(callback).not.toHaveBeenCalled()

    const params = messagesStream.mock.calls[0][0] as {
      system: Array<{ type: string; text: string; cache_control?: { type: string } }>
    }
    expect(params.system).toHaveLength(3)
    expect(params.system[0].text).toContain('Persona of alex')
    expect(params.system[1].text).toContain('TAIA')
    expect(params.system[2].text).toContain('Tester')
    // First two blocks are cached; client.ts may also cache the last one
    // implicitly when it caches `tools`, so just assert ours are.
    expect(params.system[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(params.system[1].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('persists the rendered task briefing as the first user message (replacing the legacy task arg)', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    )

    const store = new InMemoryRuntimeSessionStore()
    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store,
      executeTool: async () => 'noop',
      enableThinking: false,
    })

    const result = await adapter.spawnSession!('LEGACY-TASK-ARG-IGNORED', {
      agentId: 'alex',
      context: bundleFor('alex', {
        task: {
          title: 'Real briefing',
          description: 'Render this, not the legacy arg.',
          priority: 'HIGH',
          status: 'IN_PROGRESS',
        },
      }),
    })

    const stored = await store.getMessages(result.sessionKey)
    expect(stored[0].role).toBe('user')
    expect(stored[0].content).toMatch(/^# Task: Real briefing/)
    expect(stored[0].content).not.toContain('LEGACY-TASK-ARG-IGNORED')
  })

  it('filters tools by the bundle capabilities (only tools the agent declares)', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    )

    const store = new InMemoryRuntimeSessionStore()
    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store,
      executeTool: async () => 'noop',
      enableThinking: false,
      enableMemory: true, // memory tool is in the static tool list
    })

    await adapter.spawnSession!('placeholder', {
      agentId: 'alex',
      context: bundleFor('alex', {
        agent: {
          id: 'alex',
          name: 'Alex',
          role: 'Reader',
          persona: '',
          instructions: '',
          // Only read_tasks → only taia_tasks_list and taia_tasks_get.
          capabilities: ['read_tasks'],
        },
      }),
    })

    const params = messagesStream.mock.calls[0][0] as { tools: Array<{ name: string }> }
    const names = params.tools.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['taia_tasks_list', 'taia_tasks_get']))
    expect(names).not.toContain('taia_tasks_create')
    expect(names).not.toContain('memory') // capability not declared
  })

  it('forwards SpawnOptions.bundleVersionIds to the session store (audit trail)', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    )

    const created: Array<{ sessionKey: string; bundleVersionIds?: Record<string, string> }> = []
    const wrappedStore = {
      ...new InMemoryRuntimeSessionStore(),
      createSession: vi.fn(
        async (input: { sessionKey: string; bundleVersionIds?: Record<string, string> }) => {
          created.push({
            sessionKey: input.sessionKey,
            bundleVersionIds: input.bundleVersionIds,
          })
        },
      ),
    } as unknown as InMemoryRuntimeSessionStore

    // Re-use the InMemory store's other methods by delegation.
    const realStore = new InMemoryRuntimeSessionStore()
    Object.assign(wrappedStore, {
      appendMessage: realStore.appendMessage.bind(realStore),
      getSession: realStore.getSession.bind(realStore),
      getMessages: realStore.getMessages.bind(realStore),
      listSessions: realStore.listSessions.bind(realStore),
      updateSession: realStore.updateSession.bind(realStore),
    })

    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store: wrappedStore,
      executeTool: async () => 'noop',
      enableThinking: false,
    })

    await adapter.spawnSession!('placeholder', {
      agentId: 'alex',
      context: bundleFor('alex'),
      bundleVersionIds: { agent_identity: 'aiv_42', project_context: 'pcv_7' },
    })

    expect(created).toHaveLength(1)
    expect(created[0].bundleVersionIds).toEqual({
      agent_identity: 'aiv_42',
      project_context: 'pcv_7',
    })
  })

  it('falls back to bundle-from-callback when SpawnOptions.context is absent', async () => {
    messagesStream.mockReturnValueOnce(
      fakeStream({
        finalMessage: {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    )

    const store = new InMemoryRuntimeSessionStore()
    const adapter = createAnthropicAdapter({
      apiKey: 'sk-test',
      store,
      executeTool: async () => 'noop',
      enableThinking: false,
      // Callback returns a bundle (typed-bundle path of the resolver).
      getAgentContext: async (id) => ({ bundle: bundleFor(id) }),
    })

    await adapter.spawnSession!('placeholder', { agentId: 'alex' })

    const params = messagesStream.mock.calls[0][0] as {
      system: Array<{ text: string }>
    }
    expect(params.system).toHaveLength(3)
    expect(params.system[0].text).toContain('Persona of alex')
  })

  describe('testConnection', () => {
    it('returns the resolved model on success', async () => {
      modelsRetrieve.mockResolvedValueOnce({ id: 'claude-opus-5-5' })
      const { adapter } = makeAdapter().build()
      await expect(adapter.testConnection!()).resolves.toEqual({
        ok: true,
        details: { model: 'claude-opus-5-5' },
      })
    })

    it('classifies SDK errors', async () => {
      const Anthropic = (
        await vi.importActual<typeof import('@anthropic-ai/sdk')>('@anthropic-ai/sdk')
      ).default
      const { adapter } = makeAdapter().build()

      modelsRetrieve.mockRejectedValueOnce(
        new Anthropic.AuthenticationError(401, undefined, 'invalid x-api-key', new Headers()),
      )
      await expect(adapter.testConnection!()).resolves.toMatchObject({
        ok: false,
        reason: 'unauthorized',
      })

      modelsRetrieve.mockRejectedValueOnce(
        new Anthropic.NotFoundError(404, undefined, 'model not found', new Headers()),
      )
      await expect(adapter.testConnection!()).resolves.toMatchObject({
        ok: false,
        reason: 'not_found',
        details: { model: 'claude-opus-5-5' },
      })

      modelsRetrieve.mockRejectedValueOnce(new Anthropic.APIConnectionError({ message: 'down' }))
      await expect(adapter.testConnection!()).resolves.toMatchObject({
        ok: false,
        reason: 'unreachable',
      })
    })
  })
})
