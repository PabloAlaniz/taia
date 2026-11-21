// In-memory implementation of RuntimeSessionStore — used by the contract
// test suite and adapter-specific tests so they don't need a real DB.

import type { RuntimeMessage } from '@taia/runtime'
import type { RuntimeSessionRecord, RuntimeSessionStore } from '@taia/runtime/adapters/anthropic'

interface StoredMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: unknown
  model?: string
  stopReason?: string
  position: number
  createdAt: string
}

export class InMemoryRuntimeSessionStore implements RuntimeSessionStore {
  private sessions = new Map<string, RuntimeSessionRecord>()
  private messages = new Map<string, StoredMessage[]>()
  private idCounter = 0

  async createSession(input: {
    sessionKey: string
    agentId: string
    runId: string
    model?: string
    label?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    const now = new Date().toISOString()
    this.sessions.set(input.sessionKey, {
      sessionKey: input.sessionKey,
      agentId: input.agentId,
      provider: 'anthropic',
      runId: input.runId,
      model: input.model || null,
      status: 'running',
      stopReason: null,
      label: input.label || null,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      durationMs: null,
      metadata: input.metadata || null,
      createdAt: now,
      updatedAt: now,
    })
    this.messages.set(input.sessionKey, [])
  }

  async getSession(sessionKey: string): Promise<RuntimeSessionRecord | null> {
    return this.sessions.get(sessionKey) ?? null
  }

  async updateSession(sessionKey: string, updates: Partial<RuntimeSessionRecord>): Promise<void> {
    const existing = this.sessions.get(sessionKey)
    if (!existing) return
    this.sessions.set(sessionKey, {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    })
  }

  async listSessions(options?: {
    agentId?: string
    limit?: number
    activeMinutes?: number
  }): Promise<RuntimeSessionRecord[]> {
    let result = Array.from(this.sessions.values())
    if (options?.agentId) result = result.filter((s) => s.agentId === options.agentId)
    if (options?.activeMinutes) {
      const cutoff = Date.now() - options.activeMinutes * 60_000
      result = result.filter((s) => new Date(s.updatedAt).getTime() >= cutoff)
    }
    result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    if (options?.limit) result = result.slice(0, options.limit)
    return result
  }

  async appendMessage(input: {
    sessionKey: string
    role: 'user' | 'assistant' | 'tool'
    content: unknown
    model?: string
    stopReason?: string
  }): Promise<void> {
    const list = this.messages.get(input.sessionKey) || []
    list.push({
      id: `msg-${++this.idCounter}`,
      role: input.role,
      content: input.content,
      model: input.model,
      stopReason: input.stopReason,
      position: list.length,
      createdAt: new Date().toISOString(),
    })
    this.messages.set(input.sessionKey, list)
  }

  async getMessages(sessionKey: string, options?: { limit?: number }): Promise<RuntimeMessage[]> {
    const list = this.messages.get(sessionKey) || []
    const sliced = options?.limit ? list.slice(0, options.limit) : list
    return sliced.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      model: m.model,
      stopReason: m.stopReason,
      timestamp: m.createdAt,
    }))
  }
}
