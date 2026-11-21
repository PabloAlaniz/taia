'use client'

import { useState, useEffect, memo } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Agent, AgentLiveData, AgentLiveStatus } from '@taia/types'
import { cn } from '../../lib/utils'
import { Badge, IconButton } from '../atoms'
import { Card } from '../molecules'

const STATUS_CONFIG: Record<
  AgentLiveStatus | 'starting',
  { icon: string; color: string; label: string }
> = {
  live: { icon: '🟢', color: 'text-green-500', label: 'statusLive' },
  idle: { icon: '🟡', color: 'text-yellow-500', label: 'statusIdle' },
  offline: { icon: '⚪', color: 'text-muted', label: 'statusOffline' },
  starting: { icon: '⚡', color: 'text-amber-500', label: 'statusStarting' },
}

interface AgentCardProps {
  agent: Agent
  taskCount: number
  selected: boolean
  onSelect: () => void
}

export const AgentCard = memo(function AgentCard({
  agent,
  taskCount,
  selected,
  onSelect,
}: AgentCardProps) {
  const t = useTranslations('agentCard')
  const [liveData, setLiveData] = useState<AgentLiveData | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [postTriggerPolling, setPostTriggerPolling] = useState(false)

  const isMonitorable = agent.type !== 'orchestrator' && agent.type !== 'human'

  const fetchLiveData = async () => {
    try {
      const res = await fetch(`/api/agents/${agent.id}/live`)
      const data = await res.json()
      if (data.ok) {
        setLiveData(data)
        if (data.status === 'live') setStarting(false)
      }
    } catch {
      // Ignore
    }
  }

  const handleTrigger = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setTriggering(true)
    setTriggerResult(null)

    try {
      const res = await fetch(`/api/trigger/${agent.id}?run=true`)
      const data = await res.json()

      if (data.ok) {
        setTriggerResult('✓')
        setStarting(true)
        setPostTriggerPolling(true)
        setTimeout(() => setPostTriggerPolling(false), 30000)
        setTimeout(() => setStarting(false), 30000)
        fetchLiveData()
      } else {
        setTriggerResult('✗')
      }
    } catch {
      setTriggerResult('✗')
    } finally {
      setTriggering(false)
      setTimeout(() => setTriggerResult(null), 3000)
    }
  }

  useEffect(() => {
    if (!isMonitorable) return
    const controller = new AbortController()

    const fetchWithAbort = async () => {
      try {
        const res = await fetch(`/api/agents/${agent.id}/live`, { signal: controller.signal })
        const data = await res.json()
        if (data.ok) {
          setLiveData(data)
          if (data.status === 'live') setStarting(false)
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return
      }
    }

    fetchWithAbort()

    const interval = setInterval(fetchWithAbort, postTriggerPolling ? 2000 : 10000)
    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [agent.id, isMonitorable, postTriggerPolling])

  const displayStatus: AgentLiveStatus | 'starting' = starting
    ? 'starting'
    : liveData?.status || 'offline'
  const statusConfig = STATUS_CONFIG[displayStatus]

  return (
    <Card
      variant="default"
      padding="none"
      className={cn('mb-1.5 overflow-hidden', selected && 'border-l-2 border-l-accent bg-accent/5')}
    >
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
        aria-label={t('selectAgent', { name: agent.name })}
        className={cn(
          'p-2 transition-colors cursor-pointer hover:bg-card',
          'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-hidden rounded-sm',
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">{agent.avatar}</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-xs truncate">{agent.name}</div>
            <div className="text-2xs text-muted truncate">{agent.role}</div>
          </div>
          {isMonitorable && liveData?.sessionKey && (
            <Link
              href={`/sessions/${encodeURIComponent(liveData.sessionKey)}`}
              onClick={(e) => e.stopPropagation()}
              className="text-2xs text-muted hover:text-accent px-0.5 no-underline"
              title={t('viewTranscript')}
            >
              ↗
            </Link>
          )}
        </div>

        {/* Status row */}
        <div className="flex justify-between items-center mt-2 text-2xs">
          <div className="flex items-center gap-1">
            {isMonitorable ? (
              <>
                <span className={displayStatus === 'starting' ? 'animate-pulse' : ''}>
                  {statusConfig.icon}
                </span>
                <span
                  className={cn(
                    statusConfig.color,
                    displayStatus === 'starting' && 'animate-pulse',
                  )}
                >
                  {t(statusConfig.label as never)}
                </span>
                {postTriggerPolling && <span className="text-accent animate-spin">🔄</span>}
                {displayStatus !== 'live' && displayStatus !== 'starting' && agent.nextRunIn && (
                  <span className="text-muted">· {agent.nextRunIn}</span>
                )}
              </>
            ) : (
              <span className="text-muted">
                {agent.type === 'human' ? t('human') : agent.status}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {triggerResult && (
              <span className={triggerResult === '✓' ? 'text-green-500' : 'text-red-500'}>
                {triggerResult}
              </span>
            )}
            {isMonitorable && (
              <IconButton
                variant="primary"
                size="xs"
                disabled={triggering}
                onClick={handleTrigger}
                aria-label={
                  triggering
                    ? t('triggering', { name: agent.name })
                    : t('trigger', { name: agent.name })
                }
                title={t('trigger', { name: agent.name })}
              >
                {triggering ? '⏳' : <span className={starting ? 'animate-pulse' : ''}>⚡</span>}
              </IconButton>
            )}
            {taskCount > 0 && (
              <Badge variant="muted" size="xs">
                {taskCount}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
})
