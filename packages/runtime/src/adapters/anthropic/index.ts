// Public surface for the AnthropicAdapter.
//
// Auto-registration is intentionally OPT-IN (vs OpenClaw which auto-registers
// on import). Reason: the AnthropicAdapter requires a RuntimeSessionStore +
// ToolExecutor injected at construction time, and those live in @taia/core
// (DB + HTTP into the local TAIA API). Auto-registering with no factory is
// pointless because there's no construction config available at module load.
//
// packages/core/src/runtime.ts wires the factory explicitly when it imports
// this module.

import { registerRuntimeFactory, type RuntimeProviderConfig } from '../../registry'
import { createAnthropicAdapter, AnthropicAdapter } from './adapter'
import type { AnthropicAdapterOptions, RuntimeSessionStore, ToolExecutor } from './types'

export { AnthropicAdapter, createAnthropicAdapter } from './adapter'
export {
  TAIA_TOOLS,
  MEMORY_TOOL_DEFINITION,
  SERVER_TOOL_DEFINITIONS,
  buildServerTools,
  filterTools,
} from './tools'
export type { ServerToolName } from './tools'
export { AnthropicClient } from './client'
export type {
  AgentContextResolver,
  AnthropicAdapterOptions,
  ApprovalStore,
  RuntimeSessionStore,
  RuntimeSessionRecord,
  ToolExecutor,
  ToolExecutorContext,
} from './types'

import type { AgentContextResolver, ApprovalStore } from './types'

export interface AnthropicProviderWiring {
  /** Session store for one runtime instance (its config carries `instanceId`). */
  store: (config: RuntimeProviderConfig) => RuntimeSessionStore
  /** Tool executor for one runtime instance; TAIA tools hit `config.taiaBaseUrl`. */
  executeTool: (config: RuntimeProviderConfig) => ToolExecutor
  /** Optional default system prompt prepended to all sessions. */
  systemPrompt?: string
  /** Default max tokens per turn. */
  defaultMaxTokens?: number
  /** Default model to use. */
  defaultModel?: string
  /** Tools allowed (default: all). */
  allowedTools?: string[]
  /**
   * When true, expose the Anthropic memory tool (memory_20250818) to the
   * model. The injected executeTool must handle the 6 commands. Defaults
   * to false; the core wiring opts in.
   */
  enableMemory?: boolean
  /**
   * Anthropic-hosted server-side tools to enable globally for the adapter.
   * Per-agent enablement (via agents.config) is layered on top.
   */
  enabledServerTools?: Array<'web_search' | 'web_fetch' | 'code_execution'>
  /**
   * When true, the adapter declares the Approvals capability. The executor
   * gate (needsApprovalTools + approvalStore) and the API endpoints use it.
   */
  enableApprovals?: boolean
  /**
   * Tool names that require human approval before executing. Only consulted
   * when enableApprovals=true. Default empty (no tool needs approval).
   */
  needsApprovalTools?: string[]
  /** Backing store for approval requests (required when enableApprovals=true). */
  approvalStore?: ApprovalStore
  /** Wall-clock budget for waiting on an approval decision. */
  approvalTimeoutMs?: number
  /**
   * Resolves per-agent context at spawn time. The core wiring loads the
   * agent's context bundle so each agent arrives at Anthropic with its own
   * identity instead of a shared default.
   */
  getAgentContext?: AgentContextResolver
}

/**
 * Register the Anthropic factory with the runtime registry. Call this once
 * at startup from packages/core/src/runtime.ts after wiring the dependencies.
 */
export function registerAnthropicFactory(wiring: AnthropicProviderWiring): void {
  registerRuntimeFactory('anthropic', (config: RuntimeProviderConfig): AnthropicAdapter => {
    const apiKey = (config.token || (config['apiKey'] as string | undefined) || '').trim()
    if (!apiKey) {
      throw new Error('Anthropic provider requires an API key (the instance token)')
    }
    const configModel =
      typeof config['model'] === 'string' && config['model'].trim()
        ? (config['model'] as string).trim()
        : undefined
    const options: AnthropicAdapterOptions & { systemPrompt?: string } = {
      apiKey,
      defaultModel: configModel || wiring.defaultModel,
      defaultMaxTokens: wiring.defaultMaxTokens,
      store: wiring.store(config),
      executeTool: wiring.executeTool(config),
      allowedTools: wiring.allowedTools,
      enableMemory: wiring.enableMemory,
      enabledServerTools: wiring.enabledServerTools,
      enableApprovals: wiring.enableApprovals,
      needsApprovalTools: wiring.needsApprovalTools,
      approvalStore: wiring.approvalStore,
      approvalTimeoutMs: wiring.approvalTimeoutMs,
      getAgentContext: wiring.getAgentContext,
      systemPrompt: wiring.systemPrompt,
    }
    return createAnthropicAdapter(options)
  })
}
