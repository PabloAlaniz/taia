'use client'

import { useState, useEffect } from 'react'

/** `degraded`: some runtime instances are connected and some are not. */
export type RuntimeConnectionState =
  | 'connected'
  | 'connecting'
  | 'degraded'
  | 'disconnected'
  | 'unknown'

export interface RuntimeInstanceStatus {
  instanceId: string
  provider: string
  label: string
  isDefault: boolean
  state: 'connected' | 'connecting' | 'reconnecting' | 'disconnected'
}

export interface RuntimeStatus {
  /** Aggregate over every instance. */
  state: RuntimeConnectionState
  /** False in standalone mode (no runtime configured). */
  configured: boolean
  /** Provider of the default instance. */
  provider: string | null
  instances: RuntimeInstanceStatus[]
  isConnected: boolean
}

const POLL_INTERVAL = 30_000

/** Polls /api/runtime/health for the connection state of the runtime instances. */
export function useRuntimeStatus(enabled = true): RuntimeStatus {
  const [status, setStatus] = useState<Omit<RuntimeStatus, 'isConnected'>>({
    state: 'unknown',
    configured: true,
    provider: null,
    instances: [],
  })

  useEffect(() => {
    if (!enabled) return

    const check = async () => {
      try {
        const res = await fetch('/api/runtime/health')
        const data = await res.json()
        setStatus({
          state: data.state ?? 'disconnected',
          configured: data.configured !== false,
          provider: data.provider ?? null,
          instances: data.instances ?? [],
        })
      } catch {
        setStatus((prev) => ({ ...prev, state: 'disconnected' }))
      }
    }

    check()
    const interval = setInterval(check, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [enabled])

  return { ...status, isConnected: status.state === 'connected' }
}
