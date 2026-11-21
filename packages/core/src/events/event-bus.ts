/**
 * Domain Event Bus — Observer Pattern
 *
 * Services emit domain events (task:created, task:moved, etc.).
 * Listeners handle cross-cutting concerns: activity logging, WS broadcasting, etc.
 * This decouples business logic from side effects, making services easier to test.
 */

export interface DomainEvent {
  type: string
  payload: Record<string, unknown>
  timestamp: number
  actor: string
}

type Listener = (event: DomainEvent) => void | Promise<void>

interface RegisteredListener {
  id: string
  type: string
  listener: Listener
  registeredAt: number
  calls: number
  successes: number
  failures: number
  lastEventAt?: number
  lastWorkspaceId?: string
  lastError?: string
  lastErrorAt?: number
}

export interface EventBusListenerHealth {
  id: string
  type: string
  registeredAt: number
  calls: number
  successes: number
  failures: number
  lastEventAt?: number
  lastWorkspaceId?: string
  lastError?: string
  lastErrorAt?: number
}

export interface EventBusHealth {
  ok: boolean
  generatedAt: number
  expectedListeners: string[]
  missingListeners: string[]
  listeners: EventBusListenerHealth[]
}

const EXPECTED_LISTENER_IDS = [
  'activity:task-created',
  'activity:task-updated',
  'activity:task-moved',
  'activity:task-deleted',
  'activity:task-assigned',
  'activity:dependency-added',
  'activity:dependency-removed',
  'broadcast:task-created',
  'broadcast:task-updated',
  'broadcast:task-moved',
  'broadcast:task-deleted',
  'broadcast:task-assigned',
  'broadcast:dependency-added',
  'broadcast:dependency-removed',
  'worktree:task-assigned',
  'outgoing-webhook:task-created',
  'outgoing-webhook:task-updated',
  'outgoing-webhook:task-moved',
  'outgoing-webhook:task-deleted',
  'outgoing-webhook:task-assigned',
  'outgoing-webhook:dependency-added',
  'outgoing-webhook:dependency-removed',
  'context-sync:agent-context-changed',
]

function normalizeListenerId(type: string, id?: string): string {
  return id || `anonymous:${type}`
}

function extractWorkspaceId(event: DomainEvent): string | undefined {
  const direct = event.payload.workspace_id || event.payload.workspaceId
  if (typeof direct === 'string') return direct

  const task = event.payload.task
  if (task && typeof task === 'object') {
    const workspaceId =
      (task as { workspace_id?: unknown; workspaceId?: unknown }).workspace_id ??
      (task as { workspaceId?: unknown }).workspaceId
    if (typeof workspaceId === 'string') return workspaceId
  }

  return undefined
}

function serializeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

class EventBus {
  private listeners = new Map<string, RegisteredListener[]>()

  on(type: string, listener: Listener, options: { id?: string } = {}): () => void {
    const list = this.listeners.get(type) || []
    const entry: RegisteredListener = {
      id: normalizeListenerId(type, options.id),
      type,
      listener,
      registeredAt: Date.now(),
      calls: 0,
      successes: 0,
      failures: 0,
    }
    list.push(entry)
    this.listeners.set(type, list)
    return () => {
      const current = this.listeners.get(type) || []
      this.listeners.set(
        type,
        current.filter((registered) => registered !== entry),
      )
    }
  }

  async emit(event: DomainEvent): Promise<void> {
    const listeners = this.listeners.get(event.type) || []
    await Promise.allSettled(listeners.map((entry) => this.invoke(entry, event)))
  }

  getHealth(expectedListeners = EXPECTED_LISTENER_IDS): EventBusHealth {
    const listeners = Array.from(this.listeners.values())
      .flat()
      .map(({ listener: _listener, ...entry }) => ({ ...entry }))
      .sort((a, b) => a.id.localeCompare(b.id) || a.type.localeCompare(b.type))
    const registeredIds = new Set(listeners.map((listener) => listener.id))
    const missingListeners = expectedListeners.filter((id) => !registeredIds.has(id))

    return {
      ok: missingListeners.length === 0,
      generatedAt: Date.now(),
      expectedListeners,
      missingListeners,
      listeners,
    }
  }

  /** Clear all listeners — useful for tests */
  clear(): void {
    this.listeners.clear()
  }

  private async invoke(entry: RegisteredListener, event: DomainEvent): Promise<void> {
    entry.calls += 1
    entry.lastEventAt = event.timestamp || Date.now()
    entry.lastWorkspaceId = extractWorkspaceId(event)

    try {
      await entry.listener(event)
      entry.successes += 1
    } catch (error) {
      entry.failures += 1
      entry.lastError = serializeError(error)
      entry.lastErrorAt = Date.now()
      throw error
    }
  }
}

// One bus per process. Next.js (Turbopack) gives every route and the
// instrumentation hook its own module instances, so a plain module-level
// singleton would leave routes emitting into buses with no listeners.
const EVENT_BUS_KEY = Symbol.for('taia.eventBus')
const processGlobals = globalThis as unknown as Record<symbol, EventBus | undefined>

export const eventBus: EventBus = (processGlobals[EVENT_BUS_KEY] ??= new EventBus())
