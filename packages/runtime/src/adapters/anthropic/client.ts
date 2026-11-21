// AnthropicClient — wraps @anthropic-ai/sdk and orchestrates the streaming
// tool loop over a RuntimeSessionStore.
//
// Stateless from the adapter's perspective: every method reads/writes via
// the injected store. Two adapter instances pointing at the same store
// (e.g. across server restarts) see the same conversations.

import Anthropic from '@anthropic-ai/sdk'
import type {
  AgentLifecyclePayload,
  AnthropicAdapterOptions,
  ApprovalRequestPayload,
  ApprovalStore,
  ChatDeltaPayload,
  RuntimeSessionStore,
  ToolExecutor,
} from './types'
import { fromRuntimeMessages } from './mappers'
import { buildServerTools, filterTools, MEMORY_TOOL_DEFINITION, TAIA_TOOLS } from './tools'
import { DEFAULT_CLAUDE_MODEL, supportsAdaptiveThinking } from '../../models'
import type { RuntimeConnectionTest } from '../../types'

const DEFAULT_MAX_TOKENS = 16_000
const DEFAULT_MAX_TOOL_ITERATIONS = 10

/**
 * Build the `system` parameter for an Anthropic request from either:
 *  - a plain string (callback returns systemPrompt) — wrapped in a
 *    single ephemeral-cached block, or
 *  - a pre-built TextBlockParam[] (AnthropicContextRenderer produces
 *    multiple cacheable blocks, one per stable bundle layer).
 *
 * The minimum cacheable prefix is ~1024 tokens (~4096 on Opus 4.x); shorter
 * prefixes silently don't cache — usage.cache_creation_input_tokens stays 0
 * and we behave like before.
 *
 * When TextBlockParam[] is passed, it is forwarded verbatim — the renderer
 * is responsible for placing cache_control on the right blocks.
 */
function buildCachedSystem(
  system: string | Anthropic.TextBlockParam[] | undefined,
): Anthropic.TextBlockParam[] | undefined {
  if (!system) return undefined
  if (typeof system === 'string') {
    return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
  }
  return system.length > 0 ? system : undefined
}

/**
 * Apply cache_control: ephemeral to the last tool definition. Tools render
 * BEFORE system in the cache prefix, so caching the last tool effectively
 * caches the entire tool array. Returns a fresh array — never mutates the
 * shared TAIA_TOOLS list.
 */
function withCachedTools(tools: Anthropic.Tool[]): Anthropic.Tool[] {
  if (tools.length === 0) return tools
  const out = tools.slice()
  const last = out[out.length - 1]
  out[out.length - 1] = { ...last, cache_control: { type: 'ephemeral' } }
  return out
}

export interface CallMessagesOptions {
  sessionKey: string
  agentId: string
  runId: string
  /** Plain system prompt (flat-prompt path — single cached block). */
  systemPrompt?: string
  /**
   * Pre-built system blocks from an AgentContextRenderer (typed-bundle path —
   * multiple cacheable blocks). Wins over `systemPrompt` when both are set.
   */
  systemBlocks?: Anthropic.TextBlockParam[]
  /**
   * Allowlist of tool names this session can use. When present, `this.tools`
   * is filtered down to the named subset before being sent. Resolved by the
   * adapter from `bundle.agent.capabilities` via the capabilities map.
   */
  toolAllowlist?: string[]
  maxTokens?: number
  model?: string
}

/** Hooks the adapter passes in to receive streaming progress. */
export interface SessionLoopHooks {
  emitChat: (payload: ChatDeltaPayload) => void
  emitLifecycle: (payload: AgentLifecyclePayload) => void
  emitApproval: (payload: ApprovalRequestPayload) => void
}

const DEFAULT_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Map an Anthropic SDK exception to a stable stopReason string. SDK 0.88
 * has typed subclasses for 400/401/403/404/409/422/429/5xx; for 413
 * (request_too_large) and 529 (overloaded) we fall back to status checks
 * on the base APIError. Categorisation lets dashboards distinguish "user
 * needs to wait" from "user needs to fix the prompt" without parsing
 * message text.
 */
function categoriseSdkError(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) return 'rate_limited'
  if (err instanceof Anthropic.AuthenticationError) return 'auth_failed'
  if (err instanceof Anthropic.PermissionDeniedError) return 'permission_denied'
  if (err instanceof Anthropic.BadRequestError) return 'bad_request'
  if (err instanceof Anthropic.NotFoundError) return 'not_found'
  if (err instanceof Anthropic.InternalServerError) return 'internal_error'
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529) return 'overloaded'
    if (err.status === 413) return 'request_too_large'
    return `api_error_${err.status}`
  }
  return 'unknown_error'
}

export class AnthropicClient {
  private readonly sdk: Anthropic
  private readonly defaultModel: string
  private readonly defaultMaxTokens: number
  private readonly maxToolIterations: number
  private readonly store: RuntimeSessionStore
  private readonly executeTool: ToolExecutor
  private readonly tools: Anthropic.Tool[]
  /** Explicit thinking toggle; undefined means decide per request from the model. */
  private readonly enableThinking: boolean | undefined
  private readonly enableMemory: boolean
  private readonly needsApprovalTools: Set<string>
  private readonly approvalStore: ApprovalStore | null
  private readonly approvalTimeoutMs: number

  constructor(options: AnthropicAdapterOptions) {
    this.sdk = new Anthropic({ apiKey: options.apiKey })
    this.defaultModel = options.defaultModel || DEFAULT_CLAUDE_MODEL
    this.defaultMaxTokens = options.defaultMaxTokens || DEFAULT_MAX_TOKENS
    this.maxToolIterations = options.maxToolIterations || DEFAULT_MAX_TOOL_ITERATIONS
    this.store = options.store
    this.executeTool = options.executeTool

    // Build the static tool list. Order: TAIA-native tools, then optional
    // Anthropic-hosted server-side tools, then memory tool when enabled.
    // Cache breakpoint applies to the LAST entry at request time — we keep
    // the most stable definitions (Anthropic-managed schemas) at the tail.
    const taiaTools = filterTools(TAIA_TOOLS, options.allowedTools)
    const serverTools = buildServerTools(options.enabledServerTools)
    this.enableMemory = options.enableMemory === true
    this.tools = [
      ...taiaTools,
      ...serverTools,
      ...(this.enableMemory ? [MEMORY_TOOL_DEFINITION] : []),
    ]

    this.enableThinking = options.enableThinking

    // Approvals: opt-in. needsApprovalTools is consulted by the tool loop
    // before invoking executeTool — see `runSessionLoop` below.
    this.needsApprovalTools = new Set(
      options.enableApprovals ? options.needsApprovalTools || [] : [],
    )
    this.approvalStore = options.enableApprovals ? options.approvalStore || null : null
    this.approvalTimeoutMs = options.approvalTimeoutMs || DEFAULT_APPROVAL_TIMEOUT_MS
  }

  /**
   * Pre-flight token estimate for a set of messages. Useful for cost
   * dashboards and budget enforcement before spending real tokens. Returns
   * 0 on error rather than throwing — callers should treat the result as
   * a hint, not a hard ceiling.
   */
  async estimateTokens(messages: Anthropic.MessageParam[]): Promise<number> {
    try {
      const result = await this.sdk.messages.countTokens({
        model: this.defaultModel,
        messages,
      })
      return result.input_tokens || 0
    } catch {
      return 0
    }
  }

  /**
   * Cheap health probe — retrieves the default model. Returns false (not throw)
   * on any error so the adapter's getHealth() never crashes.
   */
  async ping(): Promise<{ ok: boolean; model?: string }> {
    try {
      const model = await this.sdk.models.retrieve(this.defaultModel)
      return { ok: true, model: model.id }
    } catch {
      return { ok: false }
    }
  }

  /**
   * Validate the API key by retrieving the default model. Never throws.
   */
  async testConnection(): Promise<RuntimeConnectionTest> {
    try {
      const model = await this.sdk.models.retrieve(this.defaultModel)
      return { ok: true, details: { model: model.id } }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (
        err instanceof Anthropic.AuthenticationError ||
        err instanceof Anthropic.PermissionDeniedError
      ) {
        return { ok: false, error: message, reason: 'unauthorized' }
      }
      if (err instanceof Anthropic.NotFoundError) {
        return {
          ok: false,
          error: message,
          reason: 'not_found',
          details: { model: this.defaultModel },
        }
      }
      if (err instanceof Anthropic.APIConnectionError) {
        return { ok: false, error: message, reason: 'unreachable' }
      }
      return { ok: false, error: message, reason: 'unknown' }
    }
  }

  getDefaultModel(): string {
    return this.defaultModel
  }

  /**
   * Run the agent loop for the given session via streaming. Sends the current
   * history to Anthropic, emits chat deltas as text/thinking arrive, executes
   * any tool calls, appends results, repeats until end_turn or the iteration
   * cap is hit. Persists every turn to the store.
   *
   * Stop reasons handled:
   * - end_turn         → loop ends, status='idle'
   * - tool_use         → execute tools, continue
   * - max_tokens       → loop ends with truncated output, status='idle'
   * - refusal          → loop ends, status='failed', emit lifecycle 'refused'
   * - pause_turn       → loop ends, status='idle' (caller resumes via sendToSession)
   */
  async runSessionLoop(
    opts: CallMessagesOptions,
    hooks: SessionLoopHooks,
  ): Promise<{
    stopReason: string
    iterations: number
  }> {
    const sessionKey = opts.sessionKey
    const runId = opts.runId
    const agentId = opts.agentId
    const model = opts.model || this.defaultModel
    const maxTokens = opts.maxTokens || this.defaultMaxTokens
    // Adaptive thinking with display: 'summarized' so transcripts show
    // reasoning blocks. Gated on the session's model (not the adapter default)
    // because pre-4.6 models reject the adaptive type.
    const useThinking = this.enableThinking ?? supportsAdaptiveThinking(model)

    let totalIn = 0
    let totalOut = 0
    let totalCacheCreation = 0
    let totalCacheRead = 0
    let lastStopReason = 'unknown'
    let finalStatus: 'idle' | 'failed' = 'idle'
    let iterations = 0
    const startedAt = Date.now()

    hooks.emitLifecycle({
      agentId,
      sessionKey,
      runId,
      stream: 'lifecycle',
      data: { status: 'started' },
    })

    for (let iter = 0; iter < this.maxToolIterations; iter++) {
      iterations = iter + 1
      const stored = await this.store.getMessages(sessionKey)
      const messages = fromRuntimeMessages(stored)

      // Build the request payload. Compaction + cache_control + adaptive
      // thinking all live behind their respective beta gates that the SDK
      // forwards via the `betas` field. We type-cast to Beta params because
      // the GA Messages stream type doesn't yet have context_management.
      //
      // When the adapter passed `systemBlocks` (rendered from a
      // bundle), use those verbatim; otherwise fall back to wrapping the
      // flat `systemPrompt` string in a single cached block. When the
      // bundle declared capabilities, only the matching tools are sent —
      // see `toolAllowlist` below.
      const sessionTools = opts.toolAllowlist
        ? this.tools.filter((t) => opts.toolAllowlist!.includes(t.name))
        : this.tools
      const params = {
        model,
        max_tokens: maxTokens,
        // Wrap system + tools with cache_control so the static prefix
        // (tools + system) is cached across turns. Anthropic returns
        // cache_creation_input_tokens on the first request and
        // cache_read_input_tokens on subsequent ones — both flow through
        // to the session row via response.usage below.
        system: buildCachedSystem(opts.systemBlocks ?? opts.systemPrompt),
        tools: sessionTools.length > 0 ? withCachedTools(sessionTools) : undefined,
        messages,
        ...(useThinking ? { thinking: { type: 'adaptive', display: 'summarized' } } : {}),
        // Server-side compaction. When the conversation approaches
        // the model's context window, Anthropic summarises earlier turns
        // into a `compaction` content block — we preserve it on the next
        // request automatically because we persist response.content verbatim.
        context_management: { edits: [{ type: 'compact_20260112' }] },
        betas: ['compact-2026-01-12'],
      }
      const stream = this.sdk.beta.messages.stream(
        params as unknown as Anthropic.Beta.MessageCreateParamsStreaming,
      )

      // Emit deltas as they arrive. The SDK's `text` event fires for each
      // text_delta; for thinking we tap content_block_delta directly to also
      // surface reasoning when `display: summarized` is on.
      stream.on('text', (delta: string) => {
        hooks.emitChat({
          sessionKey,
          runId,
          state: 'delta',
          message: { content: delta },
        })
      })

      stream.on('streamEvent', (event: Anthropic.Beta.BetaRawMessageStreamEvent) => {
        if (event.type === 'content_block_delta' && event.delta.type === 'thinking_delta') {
          hooks.emitChat({
            sessionKey,
            runId,
            state: 'delta',
            message: { content: event.delta.thinking },
          })
        }
      })

      // Anthropic SDK retries 429/5xx automatically (max_retries=2 by
      // default). Anything that escapes is a permanent failure for this
      // turn — categorise it so the lifecycle event surfaces a useful
      // stopReason instead of an opaque error string.
      let response: Anthropic.Beta.BetaMessage
      try {
        response = await stream.finalMessage()
      } catch (err) {
        const stopReason = categoriseSdkError(err)
        await this.store.updateSession(sessionKey, {
          status: 'failed',
          stopReason,
          inputTokens: totalIn,
          outputTokens: totalOut,
          totalTokens: totalIn + totalOut,
          cacheCreationInputTokens: totalCacheCreation,
          cacheReadInputTokens: totalCacheRead,
          durationMs: Date.now() - startedAt,
        })
        hooks.emitLifecycle({
          agentId,
          sessionKey,
          runId,
          stream: 'lifecycle',
          data: { status: 'failed', stopReason },
        })
        return { stopReason, iterations }
      }

      // Accumulate usage.
      totalIn += response.usage.input_tokens
      totalOut += response.usage.output_tokens
      totalCacheCreation += response.usage.cache_creation_input_tokens || 0
      totalCacheRead += response.usage.cache_read_input_tokens || 0
      lastStopReason = response.stop_reason || 'unknown'

      // Persist the assistant message exactly as Claude returned it. The
      // content array preserves tool_use blocks needed for the next turn.
      await this.store.appendMessage({
        sessionKey,
        role: 'assistant',
        content: response.content,
        model: response.model,
        stopReason: response.stop_reason || undefined,
      })

      // Emit final chat event for this turn so awaitSessionComplete (and the
      // SSE consumer) knows the model is done streaming text/thinking for now.
      const assistantText = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')

      hooks.emitChat({
        sessionKey,
        runId,
        state: 'final',
        message: { content: assistantText },
      })

      if (response.stop_reason === 'tool_use') {
        hooks.emitLifecycle({
          agentId,
          sessionKey,
          runId,
          stream: 'lifecycle',
          data: { status: 'tool_use' },
        })

        // Execute every tool_use block, append a single user message containing
        // all tool_result blocks (one round trip per turn even with multiple tools).
        const toolUses = response.content.filter(
          (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
        )

        const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = []
        for (const tu of toolUses) {
          let resultContent: string
          let isError = false

          // Approval gate: if this tool is in the allowlist, persist a
          // pending approval_request, emit `agent` event with stream='approval'
          // and block until decided. Rejection short-circuits with an
          // is_error tool_result the model can react to.
          if (this.needsApprovalTools.has(tu.name) && this.approvalStore) {
            try {
              const { id: approvalId } = await this.approvalStore.createPending({
                sessionKey,
                agentId,
                toolName: tu.name,
                toolUseId: tu.id,
                toolInput: tu.input as Record<string, unknown>,
              })
              hooks.emitApproval({
                agentId,
                sessionKey,
                runId,
                stream: 'approval',
                approvalId,
                toolName: tu.name,
                toolUseId: tu.id,
                toolInput: tu.input as Record<string, unknown>,
              })
              const decision = await this.approvalStore.untilDecided(approvalId, {
                timeoutMs: this.approvalTimeoutMs,
              })
              if (decision.decision !== 'approved') {
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: tu.id,
                  content: JSON.stringify({
                    error: `tool ${decision.decision}`,
                    reason: decision.reason,
                  }),
                  is_error: true,
                })
                continue
              }
            } catch (err) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: JSON.stringify({
                  error: 'approval_failed',
                  detail: err instanceof Error ? err.message : String(err),
                }),
                is_error: true,
              })
              continue
            }
          }

          try {
            resultContent = await this.executeTool(tu.name, tu.input as Record<string, unknown>, {
              agentId,
              sessionKey,
              runId,
            })
          } catch (err) {
            resultContent = err instanceof Error ? err.message : String(err)
            isError = true
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: resultContent,
            is_error: isError,
          })
        }

        await this.store.appendMessage({
          sessionKey,
          role: 'user',
          content: toolResults,
        })
        continue
      }

      // Refusal: persist as-is, mark session failed, emit lifecycle 'refused'.
      if (response.stop_reason === 'refusal') {
        finalStatus = 'failed'
      }

      // Any non-tool_use stop reason: end the loop. end_turn / max_tokens /
      // pause_turn / refusal all break here. The session row's status reflects
      // the outcome (failed for refusal, idle otherwise).
      break
    }

    await this.store.updateSession(sessionKey, {
      status: finalStatus,
      stopReason: lastStopReason,
      inputTokens: totalIn,
      outputTokens: totalOut,
      totalTokens: totalIn + totalOut,
      cacheCreationInputTokens: totalCacheCreation,
      cacheReadInputTokens: totalCacheRead,
      durationMs: Date.now() - startedAt,
    })

    hooks.emitLifecycle({
      agentId,
      sessionKey,
      runId,
      stream: 'lifecycle',
      data: {
        status: lastStopReason === 'refusal' ? 'refused' : 'finished',
        stopReason: lastStopReason,
      },
    })

    return { stopReason: lastStopReason, iterations }
  }
}
