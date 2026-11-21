'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { WSEventType, WSMessage } from '@taia/types'

const DEFAULT_WS_URL = 'ws://localhost:13334'
const BASE_DELAY = 3000
const MAX_DELAY = 30000
const MAX_RETRIES = 20

/** Pure function: exponential backoff with cap */
export function getBackoffDelay(attempt: number, base = BASE_DELAY, max = MAX_DELAY): number {
  return Math.min(base * Math.pow(2, attempt), max)
}

type EventHandler = (payload: Record<string, unknown>) => void

export function useWebSocket(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const handlersRef = useRef<Map<WSEventType, Set<EventHandler>>>(new Map())
  const [isConnected, setIsConnected] = useState(false)

  const subscribe = useCallback((event: WSEventType, handler: EventHandler) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set())
    }
    handlersRef.current.get(event)!.add(handler)

    // Return unsubscribe function
    return () => {
      handlersRef.current.get(event)?.delete(handler)
    }
  }, [])

  // The effect owns the socket: it resolves the URL, connects, reconnects with
  // backoff, and stops for good on cleanup (a socket closed by the cleanup
  // must not schedule a reconnect).
  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let socket: WebSocket | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined
    let retryCount = 0

    function scheduleReconnect(url: string) {
      if (disposed) return
      if (retryCount >= MAX_RETRIES) {
        console.log('[WS] Max retries reached, stopping')
        return
      }
      const delay = getBackoffDelay(retryCount)
      console.log(
        `[WS] Disconnected, reconnecting in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`,
      )
      retryCount++
      reconnectTimeout = setTimeout(() => connect(url), delay)
    }

    function connect(url: string) {
      if (disposed) return
      try {
        const ws = new WebSocket(url)

        ws.onopen = () => {
          console.log('[WS] Connected')
          setIsConnected(true)
          retryCount = 0
        }

        ws.onmessage = (event) => {
          try {
            const message: WSMessage = JSON.parse(event.data)
            const handlers = handlersRef.current.get(message.type)
            handlers?.forEach((handler) => handler(message.payload))
          } catch (err) {
            console.error('[WS] Parse error:', err)
          }
        }

        ws.onclose = () => {
          setIsConnected(false)
          socket = null
          scheduleReconnect(url)
        }

        ws.onerror = (err) => {
          console.error('[WS] Error:', err)
        }

        socket = ws
      } catch (err) {
        console.error('[WS] Connection failed:', err)
        scheduleReconnect(url)
      }
    }

    fetch('/api/config/client')
      .then((res) => res.json())
      .then((data) => (data.ok && data.wsUrl ? (data.wsUrl as string) : DEFAULT_WS_URL))
      .catch(() => DEFAULT_WS_URL)
      .then(connect)

    return () => {
      disposed = true
      clearTimeout(reconnectTimeout)
      socket?.close()
    }
  }, [enabled])

  return { isConnected, subscribe }
}

// Convenience hook for auto-refresh on task changes
export function useTaskUpdates(onUpdate: () => void) {
  const { subscribe, isConnected } = useWebSocket()

  useEffect(() => {
    const unsubs = [
      subscribe('task:created', onUpdate),
      subscribe('task:updated', onUpdate),
      subscribe('task:moved', onUpdate),
      subscribe('task:deleted', onUpdate),
    ]

    return () => unsubs.forEach((unsub) => unsub())
  }, [subscribe, onUpdate])

  return { isConnected }
}

// Convenience hook for agent status
export function useAgentUpdates(onUpdate: (payload: { agentId: string; status: string }) => void) {
  const { subscribe, isConnected } = useWebSocket()

  useEffect(() => {
    return subscribe('agent:status', onUpdate as EventHandler)
  }, [subscribe, onUpdate])

  return { isConnected }
}

// Convenience hook for activity feed
export function useActivityUpdates(onUpdate: (payload: Record<string, unknown>) => void) {
  const { subscribe, isConnected } = useWebSocket()

  useEffect(() => {
    return subscribe('activity:new', onUpdate as EventHandler)
  }, [subscribe, onUpdate])

  return { isConnected }
}

// Convenience hook for worktree updates
export function useWorktreeUpdates(onUpdate: (payload: Record<string, unknown>) => void) {
  const { subscribe, isConnected } = useWebSocket()

  useEffect(() => {
    const unsubs = [
      subscribe('worktree:created', onUpdate as EventHandler),
      subscribe('worktree:updated', onUpdate as EventHandler),
      subscribe('worktree:merged', onUpdate as EventHandler),
    ]

    return () => unsubs.forEach((unsub) => unsub())
  }, [subscribe, onUpdate])

  return { isConnected }
}

// Combined hook for all updates
export function useRealtimeUpdates(callbacks: {
  onTaskUpdate?: () => void
  onAgentUpdate?: (payload: { agentId: string; status: string }) => void
  onActivityUpdate?: (payload: Record<string, unknown>) => void
  onWorktreeUpdate?: (payload: Record<string, unknown>) => void
  enabled?: boolean
}) {
  const { subscribe, isConnected } = useWebSocket({ enabled: callbacks.enabled })

  useEffect(() => {
    const unsubs: (() => void)[] = []

    if (callbacks.onTaskUpdate) {
      unsubs.push(subscribe('task:created', callbacks.onTaskUpdate))
      unsubs.push(subscribe('task:updated', callbacks.onTaskUpdate))
      unsubs.push(subscribe('task:moved', callbacks.onTaskUpdate))
      unsubs.push(subscribe('task:deleted', callbacks.onTaskUpdate))
    }

    if (callbacks.onAgentUpdate) {
      unsubs.push(subscribe('agent:status', callbacks.onAgentUpdate as EventHandler))
    }

    if (callbacks.onActivityUpdate) {
      unsubs.push(subscribe('activity:new', callbacks.onActivityUpdate as EventHandler))
    }

    if (callbacks.onWorktreeUpdate) {
      unsubs.push(subscribe('worktree:created', callbacks.onWorktreeUpdate as EventHandler))
      unsubs.push(subscribe('worktree:updated', callbacks.onWorktreeUpdate as EventHandler))
      unsubs.push(subscribe('worktree:merged', callbacks.onWorktreeUpdate as EventHandler))
    }

    return () => unsubs.forEach((unsub) => unsub())
  }, [
    subscribe,
    callbacks.onTaskUpdate,
    callbacks.onAgentUpdate,
    callbacks.onActivityUpdate,
    callbacks.onWorktreeUpdate,
  ])

  return { isConnected }
}
