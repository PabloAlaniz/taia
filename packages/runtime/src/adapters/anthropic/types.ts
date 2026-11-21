// AnthropicAdapter — internal types.
//
// The adapter does not own its own DB; it gets a RuntimeSessionStore injected.
// This keeps @taia/runtime free of @taia/core/db imports — the concrete store
// is wired in packages/core/src/runtime.ts when the factory builds the adapter.

import type { RuntimeMessage } from '../../types'

export type AnthropicRole = 'user' | 'assistant' | 'tool'

export interface RuntimeSessionRecord {
  sessionKey: string
  agentId: string
  provider: string
  runId: string
  model: string | null
  status: 'running' | 'idle' | 'failed'
  stopReason: string | null
  label: string | null
  totalTokens: number
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  /** Wall-clock duration in ms; null while the session is still running. */
  durationMs: number | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface RuntimeSessionStore {
  createSession(input: {
    sessionKey: string
    agentId: string
    runId: string
    model?: string
    label?: string
    metadata?: Record<string, unknown>
    /** Audit trail — pinned bundle layer versions for this run. */
    bundleVersionIds?: Record<string, string>
  }): Promise<void>

  getSession(sessionKey: string): Promise<RuntimeSessionRecord | null>

  updateSession(
    sessionKey: string,
    updates: {
      status?: 'running' | 'idle' | 'failed'
      stopReason?: string | null
      totalTokens?: number
      inputTokens?: number
      outputTokens?: number
      cacheCreationInputTokens?: number
      cacheReadInputTokens?: number
      durationMs?: number
    },
  ): Promise<void>

  listSessions(options?: {
    agentId?: string
    limit?: number
    activeMinutes?: number
  }): Promise<RuntimeSessionRecord[]>

  appendMessage(input: {
    sessionKey: string
    role: AnthropicRole
    content: unknown
    model?: string
    stopReason?: string
  }): Promise<void>

  getMessages(sessionKey: string, options?: { limit?: number }): Promise<RuntimeMessage[]>
}

/**
 * Function used by the adapter to invoke a TAIA-native tool. The implementation
 * lives in packages/core/src/runtime.ts (because tools call HTTP into TAIA's
 * own REST API, which the runtime package shouldn't know about).
 *
 * Receives a context with the agentId, sessionKey, and runId of the in-flight
 * session — needed for tools whose state is scoped per agent (memory tool)
 * or per session (future).
 *
 * Returns a string that gets sent back to Claude as the tool result content.
 */
export interface ToolExecutorContext {
  agentId: string
  sessionKey: string
  runId: string
}

export type ToolExecutor = (
  toolName: string,
  toolInput: Record<string, unknown>,
  context: ToolExecutorContext,
) => Promise<string>

/**
 * Resolves per-agent context just before spawn (and on every sendToSession).
 *
 * Returns either a flat `{ systemPrompt }` or the full AgentContextBundle,
 * which the adapter feeds to its AgentContextRenderer to produce cacheable
 * system blocks and a scoped tool allowlist.
 *
 * Precedence at spawn time: SpawnOptions.context > resolver.bundle >
 * resolver.systemPrompt > AnthropicAdapterOptions.systemPrompt > undefined.
 *
 * Returning `null` (or `undefined` for both fields) collapses to the
 * adapter-level default — used when an agent has no typed identity yet.
 */
export type AgentContextResolver = (agentId: string) => Promise<{
  /** Flat system prompt. Used when no bundle is available. */
  systemPrompt?: string
  /** Typed bundle. When present, the adapter renders it. */
  bundle?: import('@taia/types').AgentContextBundle
} | null>

/**
 * Approval store — abstracts the approval_requests table so the adapter
 * doesn't depend on @taia/core/db. The concrete implementation lives in
 * core/anthropic-wiring.ts.
 *
 * createPending → adapter polls untilDecided → on approved/rejected,
 * the executor proceeds (or returns the rejection back to the model as an
 * is_error tool_result).
 */
export type ApprovalDecision = 'approved' | 'rejected' | 'timed_out'

export interface ApprovalStore {
  createPending(input: {
    sessionKey: string
    agentId: string
    toolName: string
    toolUseId: string
    toolInput: Record<string, unknown>
  }): Promise<{ id: string }>

  /**
   * Block until the approval row's status leaves 'pending'. Implementations
   * may poll the DB or subscribe to a notification channel.
   */
  untilDecided(
    approvalId: string,
    options: { timeoutMs: number },
  ): Promise<{
    decision: ApprovalDecision
    reason?: string
  }>
}

export interface AnthropicAdapterOptions {
  apiKey: string
  defaultModel?: string
  defaultMaxTokens?: number
  maxToolIterations?: number
  store: RuntimeSessionStore
  executeTool: ToolExecutor
  /** Tools allowed for this adapter instance. Defaults to all TAIA_TOOLS. */
  allowedTools?: string[]
  /**
   * When true, also enables Anthropic adaptive thinking with `display: 'summarized'`.
   * When omitted, it is enabled per request for models that support adaptive thinking.
   */
  enableThinking?: boolean
  /**
   * When true, the adapter exposes the Anthropic memory tool (memory_20250818)
   * to the model. The injected executeTool must handle commands view/create/
   * str_replace/insert/delete/rename — see packages/core/src/anthropic-wiring.ts
   * for the TAIA implementation backed by the agent_memory table.
   */
  enableMemory?: boolean
  /**
   * Anthropic-hosted server-side tools to enable for this adapter instance.
   * Each runs entirely on Anthropic infrastructure; results come back as
   * server_tool_use / server_tool_result blocks the adapter persists with
   * the rest of the assistant message. No executor wiring required.
   *
   * Charged separately from Messages tokens — be conservative here.
   */
  enabledServerTools?: Array<'web_search' | 'web_fetch' | 'code_execution'>
  /**
   * When true, the adapter declares the Approvals capability and the tool
   * executor blocks before invoking any tool listed in `needsApprovalTools`,
   * persisting an approval_request via `approvalStore` and emitting
   * `exec.approval.requested` until the user decides (or it times out).
   */
  enableApprovals?: boolean
  /**
   * Tool names that require human approval before executing. Only consulted
   * when enableApprovals=true. Default empty (no tool needs approval).
   */
  needsApprovalTools?: string[]
  /** Backing store for approval requests (required when enableApprovals=true). */
  approvalStore?: ApprovalStore
  /**
   * Wall-clock budget for waiting on an approval decision. Defaults to
   * 5 minutes; the executor returns an is_error tool_result on timeout so
   * the model can react.
   */
  approvalTimeoutMs?: number
  /**
   * Resolves per-agent system prompt at spawn time (and on every
   * sendToSession). Typically loads the agent's context bundle so each
   * agent gets its own identity. When absent, all sessions share the
   * adapter-level `systemPrompt` (or none).
   */
  getAgentContext?: AgentContextResolver
}

// --- Live event payloads emitted by the adapter ---
//
// The shape mirrors the SSE route's expectations
// (apps/web/app/api/agents/[agentId]/stream/route.ts).

export interface ChatDeltaPayload {
  sessionKey: string
  runId: string
  state: 'delta' | 'final'
  message: { content: string }
}

export interface AgentLifecyclePayload {
  agentId: string
  sessionKey: string
  runId: string
  stream: 'lifecycle'
  data: {
    status: 'started' | 'tool_use' | 'finished' | 'refused' | 'failed'
    stopReason?: string
  }
}

/**
 * Approval request event — emitted on the `agent` channel with stream='approval'
 * when a tool listed in needsApprovalTools is about to execute. Consumers
 * (UI, automation) decide via the /api/approvals/:id/decide endpoint.
 */
export interface ApprovalRequestPayload {
  agentId: string
  sessionKey: string
  runId: string
  stream: 'approval'
  approvalId: string
  toolName: string
  toolUseId: string
  toolInput: Record<string, unknown>
}
