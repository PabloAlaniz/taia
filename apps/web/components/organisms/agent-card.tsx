'use client'

import { useState, useEffect, memo } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Agent, AgentLiveData, AgentLiveStatus } from '@taia/types'
import { cn } from '../../lib/utils'
import { ArrowUpRight, Loader2, Zap } from 'lucide-react'
import { IconButton } from '../atoms'

// The state in words, with a dot that only repeats it.
const STATUS_CONFIG: Record<
  AgentLiveStatus | 'starting',
  { dot: string; text: string; label: string }
> = {
  live: { dot: 'bg-agent', text: 'text-agent-ink', label: 'statusLive' },
  idle: { dot: 'bg-ok', text: 'text-muted', label: 'statusIdle' },
  offline: { dot: 'bg-border', text: 'text-muted', label: 'statusOffline' },
  starting: { dot: 'bg-person', text: 'text-person-ink', label: 'statusStarting' },
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

  const isPerson = agent.type === 'human'

  return (
    <div
      className={cn(
        'relative mb-1.5 rounded-[2px] bg-strip pl-3.5 pr-2 py-1.5 shadow-[0_1px_0_rgba(0,0,0,0.2)]',
        selected && 'outline-2 outline-accent',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-[5px] rounded-l-[2px]',
          isPerson ? 'bg-person' : 'bg-agent',
        )}
      />
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
        aria-label={t('selectAgent', { name: agent.name })}
        className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-[2px]"
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className={cn(
              'font-semibold text-sm truncate',
              isPerson ? 'text-person-ink' : 'text-agent-ink',
            )}
          >
            {agent.name}
          </span>
          {agent.role && <span className="text-xs text-muted truncate">{agent.role}</span>}
          {taskCount > 0 && (
            <span className="ml-auto text-xs tabular-nums text-muted" title={t('openTasks')}>
              {taskCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5 text-xs min-h-6">
          {isMonitorable ? (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  statusConfig.dot,
                  (displayStatus === 'starting' || displayStatus === 'live') &&
                    'motion-safe:animate-pulse',
                )}
              />
              <span className={statusConfig.text}>{t(statusConfig.label as never)}</span>
              {displayStatus !== 'live' && displayStatus !== 'starting' && agent.nextRunIn && (
                <span className="text-muted truncate">· {agent.nextRunIn}</span>
              )}
            </>
          ) : (
            <span className="text-muted">{isPerson ? t('human') : agent.status}</span>
          )}

          <span className="ml-auto flex items-center gap-1">
            {triggerResult && (
              <span
                className={cn(
                  'text-xs font-semibold',
                  triggerResult === '✓' ? 'text-ok' : 'text-alert',
                )}
              >
                {triggerResult === '✓' ? t('triggered') : t('triggerFailed')}
              </span>
            )}
            {isMonitorable && liveData?.sessionKey && (
              <Link
                href={`/sessions/${encodeURIComponent(liveData.sessionKey)}`}
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded text-muted hover:text-foreground hover:bg-card"
                aria-label={t('viewTranscript')}
                title={t('viewTranscript')}
              >
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            )}
            {isMonitorable && (
              <IconButton
                variant="ghost"
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
                {triggering ? (
                  <Loader2 size={13} className="motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <Zap size={13} aria-hidden="true" />
                )}
              </IconButton>
            )}
          </span>
        </div>
      </div>
    </div>
  )
})
