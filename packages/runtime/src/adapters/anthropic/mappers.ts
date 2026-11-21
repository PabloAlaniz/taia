// AnthropicAdapter — bidirectional mappers between Anthropic SDK shapes and
// canonical runtime types.

import type Anthropic from '@anthropic-ai/sdk'
import type { RuntimeAgent, RuntimeMessage, RuntimeSession, SpawnResult } from '../../types'
import type { RuntimeSessionRecord } from './types'

// --- Outbound: TAIA → Anthropic SDK ---

/**
 * Convert RuntimeMessage[] (DB rows) into Anthropic.MessageParam[] for the
 * next request. Skips role='tool' rows whose content is already embedded in
 * the previous assistant message — Anthropic expects tool_result blocks in
 * `user` turns, which is how we already store them.
 */
export function fromRuntimeMessages(messages: RuntimeMessage[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = []
  for (const m of messages) {
    if (m.role === 'tool') {
      // Tool results are stored as user-role content blocks already.
      // Skip orphaned 'tool' rows (legacy / safety).
      continue
    }
    result.push({
      role: m.role as 'user' | 'assistant',
      content: m.content as Anthropic.MessageParam['content'],
    })
  }
  return result
}

// --- Inbound: Anthropic SDK → TAIA ---

export function toRuntimeAgent(input: {
  id: string
  name?: string
  configured?: boolean
}): RuntimeAgent {
  return {
    id: input.id,
    name: input.name,
    configured: input.configured,
  }
}

export function toRuntimeSession(record: RuntimeSessionRecord): RuntimeSession {
  return {
    key: record.sessionKey,
    agentId: record.agentId,
    kind: record.provider,
    sessionId: record.runId,
    updatedAt: new Date(record.updatedAt).getTime(),
    label: record.label || undefined,
    model: record.model || undefined,
    totalTokens: record.totalTokens || undefined,
    inputTokens: record.inputTokens || undefined,
    outputTokens: record.outputTokens || undefined,
    cacheCreationInputTokens: record.cacheCreationInputTokens || undefined,
    cacheReadInputTokens: record.cacheReadInputTokens || undefined,
    durationMs: record.durationMs ?? undefined,
  }
}

export function toSpawnResult(sessionKey: string, runId: string): SpawnResult {
  return {
    status: 'accepted',
    runId,
    sessionKey,
  }
}

/**
 * Convert a stored RuntimeMessage row (the JSONB content already in canonical
 * shape) to the public RuntimeMessage type. The adapter persists messages in
 * the same shape we expose, so this is mostly identity — kept as a function
 * to centralise the boundary.
 */
export function toRuntimeMessageOut(stored: {
  id?: string
  role: 'user' | 'assistant' | 'tool'
  content: unknown
  model?: string | null
  stopReason?: string | null
  createdAt?: string
}): RuntimeMessage {
  return {
    id: stored.id,
    role: stored.role,
    content: stored.content,
    model: stored.model || undefined,
    stopReason: stored.stopReason || undefined,
    timestamp: stored.createdAt,
  }
}
